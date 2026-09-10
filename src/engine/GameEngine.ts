import {
  BushZone,
  DamageType,
  FloatingText,
  GameAnnouncement,
  HeroDef,
  HeroInstance,
  Item,
  JungleMonster,
  KillFeedItem,
  Lane,
  Minion,
  Projectile,
  Skill,
  Team,
  Turret,
  VisualEffect
} from '../types/game';
import {
  BUSH_ZONES,
  createInitialMonsters,
  createInitialTurrets,
  FOUNTAIN_BLUE,
  FOUNTAIN_RED,
  LANE_WAYPOINTS,
  MAP_HEIGHT,
  MAP_WIDTH
} from './GameMap';
import { HEROES } from '../data/heroes';
import { ITEMS } from '../data/items';
import { BATTLE_SPELLS } from '../data/spells';
import { soundManager } from '../audio/soundManager';

export interface GameEngineListeners {
  onUpdateHUD?: () => void;
  onAnnounce?: (announcement: GameAnnouncement) => void;
  onGameOver?: (winner: Team) => void;
}

export class GameEngine {
  public matchTime: number = 0; // seconds
  public blueKills: number = 0;
  public redKills: number = 0;
  public isGameOver: boolean = false;
  public winner: Team | null = null;

  public playerHero: HeroInstance;
  public heroes: HeroInstance[] = [];
  public turrets: Turret[] = [];
  public minions: Minion[] = [];
  public monsters: JungleMonster[] = [];
  public projectiles: Projectile[] = [];
  public floatingTexts: FloatingText[] = [];
  public visualEffects: VisualEffect[] = [];
  public killFeed: KillFeedItem[] = [];

  public bushes: BushZone[] = BUSH_ZONES;

  // Spawning & timers
  private minionWaveTimer: number = 2; // first wave spawns at 2s
  private minionWaveInterval: number = 30; // every 30s
  private passiveIncomeTimer: number = 0;
  public lordActive: boolean = false;

  // Announcer streak tracking
  private firstBloodTaken: boolean = false;
  private killStreakTracker: Map<string, { kills: number; lastKillTime: number; multiKill: number }> = new Map();

  // Camera viewport
  public camera = { x: 300, y: 2200, width: 1280, height: 720 };

  // Aiming indicator
  public activeSkillAim: { skillIndex: number; skill: Skill; targetAngle: number } | null = null;

  // Listeners
  public listeners: GameEngineListeners = {};

  // Bot difficulty: 'easy' | 'normal' | 'mythic'
  public botDifficulty: 'easy' | 'normal' | 'mythic' = 'normal';

  constructor(playerHeroDef: HeroDef, spellId: string = 'flicker', listeners: GameEngineListeners = {}) {
    this.listeners = listeners;
    this.turrets = createInitialTurrets();
    this.monsters = createInitialMonsters();

    const selectedSpell = BATTLE_SPELLS.find(s => s.id === spellId) || BATTLE_SPELLS[0];

    // Create player hero
    this.playerHero = this.createHeroInstance(playerHeroDef, 'blue', false, selectedSpell, 300, 2250);
    this.heroes.push(this.playerHero);

    // Setup 4 ally bots + 5 enemy bots
    this.setupRoster(playerHeroDef.id);

    // Set camera to player
    this.camera.x = this.playerHero.x;
    this.camera.y = this.playerHero.y;
  }

  // Setup 5v5 team roster from available 10 heroes
  private setupRoster(playerHeroId: string) {
    const pool = HEROES.filter(h => h.id !== playerHeroId);
    // Shuffle pool
    const shuffled = [...pool].sort(() => Math.random() - 0.5);

    // Ally bots (4)
    const allyDefs = shuffled.slice(0, 4);
    const allyRoles: (Lane | 'jungle' | 'roam')[] = ['top', 'mid', 'bot', 'jungle'];

    allyDefs.forEach((def, index) => {
      const spell = BATTLE_SPELLS[index % BATTLE_SPELLS.length];
      const bot = this.createHeroInstance(def, 'blue', true, spell, 320 + index * 40, 2220 + (index % 2) * 40);
      bot.botLane = allyRoles[index];
      this.heroes.push(bot);
    });

    // Enemy bots (5)
    // To ensure full 5 enemy team, take remaining from shuffled + 1 duplicate if pool had 9 heroes
    const enemyDefs: HeroDef[] = [...shuffled.slice(4)];
    while (enemyDefs.length < 5) {
      // Pick any hero from pool
      const extra = HEROES[Math.floor(Math.random() * HEROES.length)];
      enemyDefs.push(extra);
    }

    const enemyRoles: (Lane | 'jungle' | 'roam')[] = ['top', 'mid', 'bot', 'jungle', 'roam'];
    enemyDefs.forEach((def, index) => {
      const spell = BATTLE_SPELLS[(index + 2) % BATTLE_SPELLS.length];
      const bot = this.createHeroInstance(def, 'red', true, spell, 2250 - index * 40, 320 - (index % 2) * 40);
      bot.botLane = enemyRoles[index];
      this.heroes.push(bot);
    });
  }

  private createHeroInstance(
    def: HeroDef,
    team: Team,
    isBot: boolean,
    spell: any,
    x: number,
    y: number
  ): HeroInstance {
    return {
      ...def,
      currentHp: def.maxHp,
      currentMana: def.maxMana,
      level: 1,
      exp: 0,
      gold: 300,
      kills: 0,
      deaths: 0,
      assists: 0,
      creepScore: 0,
      damageDealt: 0,
      turretDamage: 0,
      x,
      y,
      vx: 0,
      vy: 0,
      rotation: team === 'blue' ? -Math.PI / 4 : (3 * Math.PI) / 4,
      team,
      isBot,
      botState: 'laning',
      skillLevels: [1, 0, 0], // S1 available at lvl 1
      skillCooldowns: [0, 0, 0],
      basicAttackCooldown: 0,
      spell,
      spellCooldown: 0,
      recallProgress: null,
      regenCooldown: 0,
      regenDuration: 0,
      items: [],
      buffs: {
        blueBuff: 0,
        redBuff: 0,
        turtleShield: 0,
        speedBoost: 0,
        speedFactor: 1,
        stunDuration: 0,
        slowDuration: 0,
        slowFactor: 0,
        stealthDuration: 0,
        invulnerableDuration: 0,
        attackSpeedBoost: 0,
        immortalityCooldown: 0
      },
      isDead: false,
      respawnTimer: 0,
      inBush: false,
      targetEnemyId: null,
      miyaStacks: 0,
      saberSwords: 0
    };
  }

  // --- MAIN SIMULATION STEP ---
  public update(dt: number) {
    if (this.isGameOver) return;

    this.matchTime += dt;

    // Passive gold & exp every 1 second
    this.passiveIncomeTimer += dt;
    if (this.passiveIncomeTimer >= 1.0) {
      this.passiveIncomeTimer = 0;
      this.heroes.forEach(h => {
        if (!h.isDead) {
          h.gold += 5;
          this.gainExp(h, 6);
        }
      });
    }

    // Minion wave spawner
    this.minionWaveTimer -= dt;
    if (this.minionWaveTimer <= 0) {
      this.spawnMinionWaves();
      this.minionWaveTimer = this.minionWaveInterval;
    }

    // Update heroes
    this.updateHeroes(dt);

    // Update minions
    this.updateMinions(dt);

    // Update turrets
    this.updateTurrets(dt);

    // Update jungle monsters
    this.updateMonsters(dt);

    // Update projectiles
    this.updateProjectiles(dt);

    // Update floating combat texts
    this.updateFloatingTexts(dt);

    // Update visual effects
    this.updateVisualEffects(dt);

    // Smooth camera tracking on player hero
    if (this.playerHero) {
      const targetCamX = this.playerHero.x;
      const targetCamY = this.playerHero.y;
      this.camera.x += (targetCamX - this.camera.x) * Math.min(1, dt * 8);
      this.camera.y += (targetCamY - this.camera.y) * Math.min(1, dt * 8);
    }
  }

  // --- HERO UPDATE ---
  private updateHeroes(dt: number) {
    this.heroes.forEach(hero => {
      // Dead hero respawn countdown
      if (hero.isDead) {
        hero.respawnTimer -= dt;
        if (hero.respawnTimer <= 0) {
          this.respawnHero(hero);
        }
        return;
      }

      // Check fountain healing
      const fountain = hero.team === 'blue' ? FOUNTAIN_BLUE : FOUNTAIN_RED;
      const distToFountain = Math.hypot(hero.x - fountain.x, hero.y - fountain.y);
      if (distToFountain < fountain.radius) {
        hero.currentHp = Math.min(hero.maxHp, hero.currentHp + hero.maxHp * 0.15 * dt);
        hero.currentMana = Math.min(hero.maxMana, hero.currentMana + hero.maxMana * 0.15 * dt);
      } else {
        // Natural Regen
        hero.currentHp = Math.min(hero.maxHp, hero.currentHp + hero.hpRegen * dt);
        hero.currentMana = Math.min(hero.maxMana, hero.currentMana + hero.manaRegen * dt);
      }

      // Regeneration spell active
      if (hero.regenDuration > 0) {
        hero.regenDuration -= dt;
        hero.currentHp = Math.min(hero.maxHp, hero.currentHp + (hero.maxHp * 0.04) * dt);
      }
      if (hero.regenCooldown > 0) hero.regenCooldown -= dt;

      // Recall progress
      if (hero.recallProgress !== null) {
        hero.recallProgress += dt;
        if (hero.recallProgress >= 6.0) {
          // Completed recall! Teleport to base
          hero.recallProgress = null;
          hero.x = fountain.x;
          hero.y = fountain.y;
          hero.currentHp = hero.maxHp;
          hero.currentMana = hero.maxMana;
          this.addVisualEffect('ring', hero.x, hero.y, '#3b82f6', 100, 0.6);
        }
      }

      // Cooldown decrements
      hero.skillCooldowns[0] = Math.max(0, hero.skillCooldowns[0] - dt);
      hero.skillCooldowns[1] = Math.max(0, hero.skillCooldowns[1] - dt);
      hero.skillCooldowns[2] = Math.max(0, hero.skillCooldowns[2] - dt);
      hero.basicAttackCooldown = Math.max(0, hero.basicAttackCooldown - dt);
      hero.spellCooldown = Math.max(0, hero.spellCooldown - dt);

      // Buff & status timers
      if (hero.buffs.blueBuff > 0) hero.buffs.blueBuff -= dt;
      if (hero.buffs.redBuff > 0) hero.buffs.redBuff -= dt;
      if (hero.buffs.turtleShield > 0) hero.buffs.turtleShield -= dt;
      if (hero.buffs.speedBoost > 0) {
        hero.buffs.speedBoost -= dt;
        if (hero.buffs.speedBoost <= 0) hero.buffs.speedFactor = 1;
      }
      if (hero.buffs.stunDuration > 0) hero.buffs.stunDuration -= dt;
      if (hero.buffs.slowDuration > 0) {
        hero.buffs.slowDuration -= dt;
        if (hero.buffs.slowDuration <= 0) hero.buffs.slowFactor = 0;
      }
      if (hero.buffs.stealthDuration > 0) hero.buffs.stealthDuration -= dt;
      if (hero.buffs.invulnerableDuration > 0) hero.buffs.invulnerableDuration -= dt;
      if (hero.buffs.attackSpeedBoost > 0) hero.buffs.attackSpeedBoost -= dt;
      if (hero.buffs.immortalityCooldown > 0) hero.buffs.immortalityCooldown -= dt;

      // Bush detection
      hero.inBush = this.bushes.some(
        b => hero.x >= b.x && hero.x <= b.x + b.width && hero.y >= b.y && hero.y <= b.y + b.height
      );

      // Bot AI execution
      if (hero.isBot) {
        this.updateBotAI(hero, dt);
      } else {
        // Player movement application
        if (hero.buffs.stunDuration <= 0) {
          if (hero.vx !== 0 || hero.vy !== 0) {
            hero.recallProgress = null; // moving cancels recall
            (hero as any).targetDestination = null; // joystick/WASD overrides click-to-move
            const speed = this.getHeroMoveSpeed(hero);
            hero.x += hero.vx * speed * dt;
            hero.y += hero.vy * speed * dt;
            hero.rotation = Math.atan2(hero.vy, hero.vx);
          } else if ((hero as any).targetDestination) {
            // Click-to-move active
            const dest = (hero as any).targetDestination;
            const dist = Math.hypot(dest.x - hero.x, dest.y - hero.y);
            if (dist > 15) {
              hero.recallProgress = null;
              const angle = Math.atan2(dest.y - hero.y, dest.x - hero.x);
              const speed = this.getHeroMoveSpeed(hero);
              hero.x += Math.cos(angle) * speed * dt;
              hero.y += Math.sin(angle) * speed * dt;
              hero.rotation = angle;
            } else {
              (hero as any).targetDestination = null;
            }
          }
        }
      }

      // Clamp within map bounds
      hero.x = Math.max(80, Math.min(MAP_WIDTH - 80, hero.x));
      hero.y = Math.max(80, Math.min(MAP_HEIGHT - 80, hero.y));
    });
  }

  // --- MINION SYSTEM ---
  private spawnMinionWaves() {
    const lanes: Lane[] = ['top', 'mid', 'bot'];
    const types: ('melee' | 'ranged' | 'siege')[] = ['melee', 'melee', 'ranged'];
    // After 5 mins, add siege cannon minion
    if (this.matchTime > 300) {
      types.push('siege');
    }

    lanes.forEach(lane => {
      // Blue Minions
      types.forEach((type, idx) => {
        const startPoint = LANE_WAYPOINTS[lane].blue[0];
        const minion: Minion = {
          id: `minion_blue_${lane}_${Date.now()}_${idx}`,
          team: 'blue',
          lane,
          type,
          x: startPoint.x + (Math.random() - 0.5) * 30,
          y: startPoint.y + (Math.random() - 0.5) * 30,
          hp: type === 'siege' ? 1200 : type === 'melee' ? 850 : 550,
          maxHp: type === 'siege' ? 1200 : type === 'melee' ? 850 : 550,
          damage: type === 'siege' ? 70 : type === 'melee' ? 45 : 60,
          range: type === 'ranged' ? 220 : type === 'siege' ? 260 : 75,
          speed: 130,
          targetId: null,
          waypointIndex: 0,
          attackCooldown: 0
        };
        this.minions.push(minion);
      });

      // Red Minions
      types.forEach((type, idx) => {
        const startPoint = LANE_WAYPOINTS[lane].red[0];
        const minion: Minion = {
          id: `minion_red_${lane}_${Date.now()}_${idx}`,
          team: 'red',
          lane,
          type,
          x: startPoint.x + (Math.random() - 0.5) * 30,
          y: startPoint.y + (Math.random() - 0.5) * 30,
          hp: type === 'siege' ? 1200 : type === 'melee' ? 850 : 550,
          maxHp: type === 'siege' ? 1200 : type === 'melee' ? 850 : 550,
          damage: type === 'siege' ? 70 : type === 'melee' ? 45 : 60,
          range: type === 'ranged' ? 220 : type === 'siege' ? 260 : 75,
          speed: 130,
          targetId: null,
          waypointIndex: 0,
          attackCooldown: 0
        };
        this.minions.push(minion);
      });
    });
  }

  private updateMinions(dt: number) {
    for (let i = this.minions.length - 1; i >= 0; i--) {
      const minion = this.minions[i];
      if (minion.hp <= 0) {
        this.minions.splice(i, 1);
        continue;
      }

      minion.attackCooldown = Math.max(0, minion.attackCooldown - dt);

      // Find target: nearest enemy minion, turret, or hero within aggro range
      let target: { x: number; y: number; id: string; isTurret?: boolean; isHero?: boolean } | null = null;
      let closestDist = 260;

      // Check enemy minions in lane
      for (const other of this.minions) {
        if (other.team !== minion.team) {
          const d = Math.hypot(other.x - minion.x, other.y - minion.y);
          if (d < closestDist) {
            closestDist = d;
            target = other;
          }
        }
      }

      // Check enemy turrets in range
      if (!target) {
        for (const turret of this.turrets) {
          if (turret.team !== minion.team && !turret.destroyed) {
            const d = Math.hypot(turret.x - minion.x, turret.y - minion.y);
            if (d < 300) {
              target = { ...turret, isTurret: true };
              closestDist = d;
              break;
            }
          }
        }
      }

      // Check enemy heroes in range
      if (!target) {
        for (const hero of this.heroes) {
          if (hero.team !== minion.team && !hero.isDead) {
            const d = Math.hypot(hero.x - minion.x, hero.y - minion.y);
            if (d < 220) {
              target = { ...hero, isHero: true };
              closestDist = d;
              break;
            }
          }
        }
      }

      // If target acquired: attack or walk toward target
      if (target) {
        if (closestDist <= minion.range) {
          // Attack!
          if (minion.attackCooldown <= 0) {
            minion.attackCooldown = 1.3;
            // Spawn minion projectile or melee hit
            this.spawnProjectile({
              id: `proj_minion_${minion.id}_${Date.now()}`,
              sourceId: minion.id,
              sourceTeam: minion.team,
              targetId: target.id,
              x: minion.x,
              y: minion.y,
              vx: 0,
              vy: 0,
              speed: 400,
              maxDist: minion.range + 50,
              traveled: 0,
              damage: minion.damage,
              damageType: 'physical',
              color: minion.team === 'blue' ? '#60a5fa' : '#f87171',
              radius: 5
            });
          }
        } else {
          // Move towards target
          const angle = Math.atan2(target.y - minion.y, target.x - minion.x);
          minion.x += Math.cos(angle) * minion.speed * dt;
          minion.y += Math.sin(angle) * minion.speed * dt;
        }
      } else {
        // Follow lane waypoints
        const waypoints = LANE_WAYPOINTS[minion.lane][minion.team];
        const nextWp = waypoints[minion.waypointIndex];
        if (nextWp) {
          const distToWp = Math.hypot(nextWp.x - minion.x, nextWp.y - minion.y);
          if (distToWp < 30) {
            if (minion.waypointIndex < waypoints.length - 1) {
              minion.waypointIndex++;
            }
          } else {
            const angle = Math.atan2(nextWp.y - minion.y, nextWp.x - minion.x);
            minion.x += Math.cos(angle) * minion.speed * dt;
            minion.y += Math.sin(angle) * minion.speed * dt;
          }
        }
      }
    }
  }

  // --- TURRET SYSTEM ---
  private updateTurrets(dt: number) {
    this.turrets.forEach(turret => {
      if (turret.destroyed) return;

      turret.attackCooldown = Math.max(0, turret.attackCooldown - dt);

      // Check targets in turret range (280)
      // Priority 1: enemy hero that damaged an ally hero
      // Priority 2: nearest enemy minion
      // Priority 3: nearest enemy hero
      let target: { x: number; y: number; id: string; isHero?: boolean } | null = null;

      // Check enemy heroes in range first
      const enemyHeroesInRange = this.heroes.filter(
        h => h.team !== turret.team && !h.isDead && Math.hypot(h.x - turret.x, h.y - turret.y) <= turret.range
      );

      // Check enemy minions in range
      const enemyMinionsInRange = this.minions.filter(
        m => m.team !== turret.team && Math.hypot(m.x - turret.x, m.y - turret.y) <= turret.range
      );

      if (enemyMinionsInRange.length > 0) {
        // Focus nearest minion
        target = enemyMinionsInRange.sort(
          (a, b) => Math.hypot(a.x - turret.x, a.y - turret.y) - Math.hypot(b.x - turret.x, b.y - turret.y)
        )[0];
      } else if (enemyHeroesInRange.length > 0) {
        // Target nearest hero
        target = {
          ...enemyHeroesInRange.sort(
            (a, b) => Math.hypot(a.x - turret.x, a.y - turret.y) - Math.hypot(b.x - turret.x, b.y - turret.y)
          )[0],
          isHero: true
        };
      }

      turret.targetId = target ? target.id : null;

      // If targeted hero is player, play warning sound
      if (target && target.id === this.playerHero.id && turret.attackCooldown < 0.2) {
        soundManager.playTurretWarning();
      }

      if (target && turret.attackCooldown <= 0) {
        turret.attackCooldown = 1.2;
        soundManager.playTurretShot();
        const baseDmg = turret.tier === 4 ? 500 : turret.tier === 3 ? 420 : 360;
        this.spawnProjectile({
          id: `turret_proj_${turret.id}_${Date.now()}`,
          sourceId: turret.id,
          sourceTeam: turret.team,
          targetId: target.id,
          x: turret.x,
          y: turret.y,
          vx: 0,
          vy: 0,
          speed: 460,
          maxDist: turret.range + 80,
          traveled: 0,
          damage: baseDmg,
          damageType: 'physical',
          isTurretShot: true,
          color: turret.team === 'blue' ? '#38bdf8' : '#ef4444',
          radius: 9
        });
      }
    });
  }

  // --- JUNGLE MONSTERS & OBJECTIVES ---
  private updateMonsters(dt: number) {
    this.monsters.forEach(monster => {
      if (!monster.isAlive) {
        monster.respawnTimer -= dt;
        if (monster.respawnTimer <= 0) {
          monster.isAlive = true;
          monster.hp = monster.maxHp;
          monster.x = monster.spawnX;
          monster.y = monster.spawnY;
        }
        return;
      }

      monster.attackCooldown = Math.max(0, monster.attackCooldown - dt);

      // Check nearby heroes
      let targetHero: HeroInstance | null = null;
      let closestDist = monster.range + 40;

      for (const hero of this.heroes) {
        if (!hero.isDead) {
          const d = Math.hypot(hero.x - monster.x, hero.y - monster.y);
          if (d < closestDist) {
            closestDist = d;
            targetHero = hero;
          }
        }
      }

      if (targetHero && closestDist <= monster.range) {
        monster.targetId = targetHero.id;
        if (monster.attackCooldown <= 0) {
          monster.attackCooldown = 1.5;
          this.applyDamage(targetHero, monster.damage, 'physical', monster.name, monster.id, null);
          this.addVisualEffect('slash', targetHero.x, targetHero.y, '#eab308', 35, 0.2);
        }
      } else {
        monster.targetId = null;
        // Leash back to spawn
        const dToSpawn = Math.hypot(monster.spawnX - monster.x, monster.spawnY - monster.y);
        if (dToSpawn > 10) {
          const angle = Math.atan2(monster.spawnY - monster.y, monster.spawnX - monster.x);
          monster.x += Math.cos(angle) * 100 * dt;
          monster.y += Math.sin(angle) * 100 * dt;
        }
      }
    });
  }

  // --- PROJECTILES & COLLISION ---
  private updateProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];

      // Homing vs Directional
      if (proj.targetId) {
        // Homing projectile (target tracking)
        let targetPos: { x: number; y: number; hp: number } | null = null;
        const targetHero = this.heroes.find(h => h.id === proj.targetId && !h.isDead);
        const targetMinion = this.minions.find(m => m.id === proj.targetId && m.hp > 0);
        const targetTurret = this.turrets.find(t => t.id === proj.targetId && !t.destroyed);
        const targetMonster = this.monsters.find(m => m.id === proj.targetId && m.isAlive);

        if (targetHero) targetPos = targetHero;
        else if (targetMinion) targetPos = targetMinion;
        else if (targetTurret) targetPos = targetTurret;
        else if (targetMonster) targetPos = targetMonster;

        if (!targetPos) {
          // Target lost / died
          this.projectiles.splice(i, 1);
          continue;
        }

        const angle = Math.atan2(targetPos.y - proj.y, targetPos.x - proj.x);
        const step = proj.speed * dt;
        proj.x += Math.cos(angle) * step;
        proj.y += Math.sin(angle) * step;
        proj.traveled += step;

        const distToTarget = Math.hypot(targetPos.x - proj.x, targetPos.y - proj.y);
        if (distToTarget < 25) {
          // Impact!
          this.handleProjectileImpact(proj, targetHero || targetMinion || targetTurret || targetMonster);
          this.projectiles.splice(i, 1);
          continue;
        }
      } else {
        // Directional projectile / skillshot
        const step = proj.speed * dt;
        proj.x += proj.vx * step;
        proj.y += proj.vy * step;
        proj.traveled += step;

        // Check collision with enemy heroes & minions
        let hitEntity: any = null;
        for (const hero of this.heroes) {
          if (hero.team !== proj.sourceTeam && !hero.isDead) {
            if (Math.hypot(hero.x - proj.x, hero.y - proj.y) <= proj.radius + 30) {
              hitEntity = hero;
              break;
            }
          }
        }
        if (!hitEntity) {
          for (const minion of this.minions) {
            if (minion.team !== proj.sourceTeam && minion.hp > 0) {
              if (Math.hypot(minion.x - proj.x, minion.y - proj.y) <= proj.radius + 20) {
                hitEntity = minion;
                break;
              }
            }
          }
        }

        if (hitEntity) {
          this.handleProjectileImpact(proj, hitEntity);
          if (proj.effectType !== 'pierce') {
            this.projectiles.splice(i, 1);
            continue;
          }
        }

        if (proj.traveled >= proj.maxDist) {
          this.projectiles.splice(i, 1);
          continue;
        }
      }
    }
  }

  private handleProjectileImpact(proj: Projectile, target: any) {
    const sourceHero = this.heroes.find(h => h.id === proj.sourceId);

    // Special skill effects
    if (proj.effectType === 'stun' && target.buffs) {
      target.buffs.stunDuration = proj.duration || 1.2;
      this.addFloatingText('STUNNED', target.x, target.y - 40, '#facc15');
    } else if (proj.effectType === 'slow' && target.buffs) {
      target.buffs.slowDuration = proj.duration || 2.0;
      target.buffs.slowFactor = 0.4;
      this.addFloatingText('SLOWED', target.x, target.y - 40, '#38bdf8');
    } else if (proj.effectType === 'hook' && sourceHero) {
      // Franco Hook pulls target to source!
      target.x = sourceHero.x + Math.cos(sourceHero.rotation) * 60;
      target.y = sourceHero.y + Math.sin(sourceHero.rotation) * 60;
      if (target.buffs) target.buffs.stunDuration = 0.6;
      this.addFloatingText('SNAGGED!', target.x, target.y - 45, '#e11d48');
    }

    this.applyDamage(
      target,
      proj.damage,
      proj.damageType,
      sourceHero ? sourceHero.name : 'Turret',
      proj.sourceId,
      proj.sourceTeam
    );
    this.addVisualEffect('burst', target.x, target.y, proj.color, 45, 0.25);
  }

  // --- COMBAT & DAMAGE FORMULAS ---
  public applyDamage(
    target: any,
    rawDamage: number,
    type: DamageType,
    attackerName: string,
    attackerId: string,
    attackerTeam: Team | null
  ) {
    if (!target) return;

    // Check Invulnerability (e.g. Nana passive, Nana Molina form)
    if (target.buffs && target.buffs.invulnerableDuration > 0) {
      this.addFloatingText('IMMUNE', target.x, target.y - 30, '#f8fafc');
      return;
    }

    // Check Immortality shield or Turtle shield
    let incomingDamage = rawDamage;
    if (target.buffs && target.buffs.turtleShield > 0) {
      if (incomingDamage <= target.buffs.turtleShield) {
        target.buffs.turtleShield -= incomingDamage;
        incomingDamage = 0;
        this.addFloatingText('SHIELDED', target.x, target.y - 30, '#38bdf8');
        return;
      } else {
        incomingDamage -= target.buffs.turtleShield;
        target.buffs.turtleShield = 0;
      }
    }

    // Defense mitigations
    let finalDamage = incomingDamage;
    if (type === 'physical') {
      const def = target.physDef || 0;
      finalDamage = incomingDamage * (120 / (120 + def));
    } else if (type === 'magic') {
      const mDef = target.magicDef || 0;
      finalDamage = incomingDamage * (120 / (120 + mDef));
    } // 'true' damage deals pure 100% damage

    finalDamage = Math.max(1, Math.round(finalDamage));

    // Check Turret Aggro Dive Protection:
    // If target is an allied hero under their turret, turret targets attacker immediately!
    const attackerHero = this.heroes.find(h => h.id === attackerId);
    if (attackerHero && target.role && target.team !== attackerHero.team) {
      // Find ally turret nearby
      const allyTurret = this.turrets.find(
        t => t.team === target.team && !t.destroyed && Math.hypot(t.x - target.x, t.y - target.y) <= t.range
      );
      if (allyTurret) {
        allyTurret.targetId = attackerHero.id;
      }
    }

    // Apply damage to HP
    if (target.currentHp !== undefined) {
      // Nana passive check: if lethal damage and not used yet
      if (target.id === 'nana' && target.currentHp - finalDamage <= 0 && !target.buffs.nanaPassiveUsed) {
        target.currentHp = 1;
        target.buffs.nanaPassiveUsed = true;
        target.buffs.invulnerableDuration = 2.0;
        target.buffs.speedBoost = 2.0;
        target.buffs.speedFactor = 1.7;
        this.addFloatingText("MOLINA'S GIFT!", target.x, target.y - 45, '#ec4899');
        return;
      }

      // Immortality Item check
      const hasImmortality = target.items && target.items.some((it: Item) => it.id === 'immortality');
      if (
        hasImmortality &&
        target.currentHp - finalDamage <= 0 &&
        (!target.buffs.immortalityCooldown || target.buffs.immortalityCooldown <= 0)
      ) {
        target.currentHp = Math.round(target.maxHp * 0.16);
        target.buffs.turtleShield = 1200;
        target.buffs.immortalityCooldown = 180;
        this.addFloatingText('RESURRECTED!', target.x, target.y - 45, '#eab308');
        return;
      }

      target.currentHp -= finalDamage;

      // Track damage dealt by attacker
      if (attackerHero) {
        attackerHero.damageDealt += finalDamage;

        // Physical / Magic Lifesteal
        const lifesteal = this.getHeroLifesteal(attackerHero);
        if (lifesteal > 0 && type === 'physical') {
          const healAmount = Math.round(finalDamage * lifesteal);
          attackerHero.currentHp = Math.min(attackerHero.maxHp, attackerHero.currentHp + healAmount);
          this.addFloatingText(`+${healAmount}`, attackerHero.x, attackerHero.y - 25, '#22c55e');
        }
      }

      // Floating damage number
      const color = type === 'physical' ? '#ef4444' : type === 'magic' ? '#a855f7' : '#ffffff';
      this.addFloatingText(`${finalDamage}`, target.x, target.y - 20, color);

      // Unit died!
      if (target.currentHp <= 0) {
        target.currentHp = 0;
        this.handleHeroDeath(target, attackerName, attackerId, attackerTeam);
      }
    } else if (target.hp !== undefined) {
      // Minion, Turret, or Monster
      target.hp -= finalDamage;

      // Outer Turret shield plates gold bonus
      if (target.shieldPlates && target.shieldPlates > 0) {
        const platesRemaining = Math.max(0, Math.ceil((target.hp / target.maxHp) * 5));
        if (platesRemaining < target.shieldPlates) {
          const lostPlates = target.shieldPlates - platesRemaining;
          target.shieldPlates = platesRemaining;
          if (attackerHero) {
            attackerHero.gold += 100 * lostPlates;
            soundManager.playGoldSound();
            this.addFloatingText(`+${100 * lostPlates} GOLD (PLATE)`, target.x, target.y - 50, '#eab308');
          }
        }
      }

      const color = type === 'physical' ? '#ef4444' : type === 'magic' ? '#a855f7' : '#ffffff';
      this.addFloatingText(`${finalDamage}`, target.x, target.y - 20, color);

      if (attackerHero && target.tier !== undefined) {
        attackerHero.turretDamage += finalDamage;
      }

      if (target.hp <= 0) {
        target.hp = 0;
        if (target.range && target.tier !== undefined) {
          // Turret destroyed!
          this.handleTurretDestroyed(target, attackerHero);
        } else if (target.spawnX !== undefined) {
          // Jungle monster slain!
          this.handleMonsterSlain(target, attackerHero);
        } else {
          // Minion slain
          if (attackerHero) {
            const minionGold = target.type === 'siege' ? 95 : 65;
            attackerHero.gold += minionGold;
            attackerHero.creepScore += 1;
            this.gainExp(attackerHero, 45);
          }
        }
      }
    }
  }

  // --- HERO DEATH & KILL STREAKS ---
  private handleHeroDeath(victim: HeroInstance, killerName: string, killerId: string, killerTeam: Team | null) {
    victim.isDead = true;
    victim.deaths += 1;
    victim.respawnTimer = 10 + victim.level * 2;
    victim.recallProgress = null;

    const killerHero = this.heroes.find(h => h.id === killerId);
    if (killerHero) {
      killerHero.kills += 1;
      killerHero.gold += 200;
      this.gainExp(killerHero, 150);
      soundManager.playGoldSound();

      // Team scores
      if (killerHero.team === 'blue') this.blueKills++;
      else this.redKills++;

      // Assist rewards to nearby allies
      this.heroes.forEach(h => {
        if (h.team === killerHero.team && h.id !== killerHero.id && !h.isDead) {
          if (Math.hypot(h.x - victim.x, h.y - victim.y) < 700) {
            h.assists += 1;
            h.gold += 80;
            this.gainExp(h, 60);
          }
        }
      });

      // Kill streaks & multi-kill tracking
      this.trackKillStreaks(killerHero, victim);
    } else {
      // Executed by turret/minion
      if (killerTeam === 'blue') this.blueKills++;
      else if (killerTeam === 'red') this.redKills++;
    }

    // Kill feed
    const feedItem: KillFeedItem = {
      id: `kill_${Date.now()}_${Math.random()}`,
      killerName,
      killerHero: killerHero ? killerHero.title : 'Defense',
      killerTeam: killerHero ? killerHero.team : killerTeam || 'red',
      victimName: victim.name,
      victimHero: victim.title,
      victimTeam: victim.team,
      time: this.matchTime
    };
    this.killFeed.unshift(feedItem);
    if (this.killFeed.length > 6) this.killFeed.pop();

    if (this.listeners.onUpdateHUD) this.listeners.onUpdateHUD();
  }

  private trackKillStreaks(killer: HeroInstance, victim: HeroInstance) {
    let tracker = this.killStreakTracker.get(killer.id);
    const now = this.matchTime;

    if (!tracker) {
      tracker = { kills: 0, lastKillTime: 0, multiKill: 0 };
      this.killStreakTracker.set(killer.id, tracker);
    }

    tracker.kills += 1;

    // Check multi-kill window (10s)
    if (now - tracker.lastKillTime <= 10) {
      tracker.multiKill += 1;
    } else {
      tracker.multiKill = 1;
    }
    tracker.lastKillTime = now;

    // Announcer triggers
    if (!this.firstBloodTaken) {
      this.firstBloodTaken = true;
      this.triggerAnnouncement({
        id: `ann_fb_${Date.now()}`,
        type: 'first-blood',
        title: 'FIRST BLOOD!',
        subtitle: `${killer.name} drew first blood against ${victim.name}`,
        team: killer.team,
        duration: 3.5
      });
      soundManager.announce('First Blood');
      return;
    }

    // Multi-kill announcements
    if (tracker.multiKill === 2) {
      this.triggerAnnouncement({
        id: `ann_mk_${Date.now()}`,
        type: 'double',
        title: 'DOUBLE KILL!',
        team: killer.team,
        duration: 3.0
      });
      soundManager.announce('Double Kill');
    } else if (tracker.multiKill === 3) {
      this.triggerAnnouncement({
        id: `ann_mk_${Date.now()}`,
        type: 'triple',
        title: 'TRIPLE KILL!',
        team: killer.team,
        duration: 3.0
      });
      soundManager.announce('Triple Kill');
    } else if (tracker.multiKill === 4) {
      this.triggerAnnouncement({
        id: `ann_mk_${Date.now()}`,
        type: 'maniac',
        title: 'MANIAC!',
        team: killer.team,
        duration: 3.2
      });
      soundManager.announce('Maniac');
    } else if (tracker.multiKill >= 5) {
      this.triggerAnnouncement({
        id: `ann_mk_${Date.now()}`,
        type: 'savage',
        title: 'SAVAGE!',
        subtitle: `${killer.name} wiped out the entire enemy team!`,
        team: killer.team,
        duration: 4.0
      });
      soundManager.announce('Savage');
    } else if (tracker.kills >= 7) {
      this.triggerAnnouncement({
        id: `ann_streak_${Date.now()}`,
        type: 'kill',
        title: 'LEGENDARY!',
        subtitle: `${killer.name} is Legendary!`,
        team: killer.team,
        duration: 3.0
      });
      soundManager.announce('Legendary');
    } else {
      if (killer.id === this.playerHero.id) {
        soundManager.announce('You have slain an enemy');
      } else if (killer.team === this.playerHero.team) {
        soundManager.announce('An enemy has been slain');
      } else {
        soundManager.announce('An ally has been slain');
      }
    }
  }

  // --- TURRET DESTROYED ---
  private handleTurretDestroyed(turret: Turret, killerHero?: HeroInstance) {
    turret.destroyed = true;
    turret.hp = 0;

    // Team gold bonus
    this.heroes.forEach(h => {
      if (h.team !== turret.team) {
        h.gold += 150;
      }
    });

    if (killerHero) {
      killerHero.gold += 100;
    }

    soundManager.playGoldSound();

    if (turret.team === 'red') {
      soundManager.announce('An enemy turret has been destroyed');
      this.triggerAnnouncement({
        id: `ann_turret_${Date.now()}`,
        type: 'turret',
        title: 'ENEMY TURRET DESTROYED!',
        team: 'blue',
        duration: 3.0
      });
    } else {
      soundManager.announce('Our turret has been destroyed');
      this.triggerAnnouncement({
        id: `ann_turret_${Date.now()}`,
        type: 'turret',
        title: 'OUR TURRET HAS BEEN DESTROYED!',
        team: 'red',
        duration: 3.0
      });
    }

    // Check Nexus / Core destroyed -> Match End!
    if (turret.tier === 4) {
      const winnerTeam: Team = turret.team === 'blue' ? 'red' : 'blue';
      this.isGameOver = true;
      this.winner = winnerTeam;
      if (winnerTeam === 'blue') {
        soundManager.playVictoryFanfare();
        soundManager.announce('Victory');
      } else {
        soundManager.announce('Defeat');
      }
      if (this.listeners.onGameOver) this.listeners.onGameOver(winnerTeam);
    }
  }

  // --- JUNGLE MONSTERS SLAIN ---
  private handleMonsterSlain(monster: JungleMonster, killerHero?: HeroInstance) {
    monster.isAlive = false;
    monster.respawnTimer = monster.maxRespawnTimer;

    if (!killerHero) return;

    killerHero.gold += monster.type === 'lord' ? 300 : monster.type === 'turtle' ? 200 : 90;
    this.gainExp(killerHero, monster.type === 'lord' ? 300 : monster.type === 'turtle' ? 200 : 120);

    if (monster.type === 'blue-buff') {
      killerHero.buffs.blueBuff = 45;
      this.addFloatingText('BLUE BUFF OBTAINED!', killerHero.x, killerHero.y - 45, '#38bdf8');
    } else if (monster.type === 'red-buff') {
      killerHero.buffs.redBuff = 45;
      this.addFloatingText('RED BUFF OBTAINED!', killerHero.x, killerHero.y - 45, '#f43f5e');
    } else if (monster.type === 'turtle') {
      // Entire team gets shield + gold
      this.heroes.forEach(h => {
        if (h.team === killerHero.team) {
          h.gold += 150;
          h.buffs.turtleShield = 450;
        }
      });
      soundManager.announce('The Turtle has been slain');
      this.triggerAnnouncement({
        id: `ann_turtle_${Date.now()}`,
        type: 'turtle',
        title: 'TURTLE SLAIN!',
        subtitle: `${killerHero.team.toUpperCase()} team gained gold and shields!`,
        team: killerHero.team,
        duration: 3.5
      });
    } else if (monster.type === 'lord') {
      // Lord awakens to push weakest lane!
      this.lordActive = true;
      this.heroes.forEach(h => {
        if (h.team === killerHero.team) {
          h.gold += 250;
        }
      });
      soundManager.announce('The Lord has been awakened');
      this.triggerAnnouncement({
        id: `ann_lord_${Date.now()}`,
        type: 'lord',
        title: 'THE LORD HAS AWAKENED!',
        subtitle: `${killerHero.team.toUpperCase()} team summoned the Lord!`,
        team: killerHero.team,
        duration: 4.0
      });
      this.spawnSummonedLord(killerHero.team);
    }
  }

  // Summoned Lord that pushes down enemy lane
  private spawnSummonedLord(team: Team) {
    const startPoint = LANE_WAYPOINTS.mid[team][0];
    const lordMinion: Minion = {
      id: `lord_summoned_${Date.now()}`,
      team,
      lane: 'mid',
      type: 'siege',
      x: startPoint.x,
      y: startPoint.y,
      hp: 6500,
      maxHp: 6500,
      damage: 320,
      range: 120,
      speed: 100,
      targetId: null,
      waypointIndex: 0,
      attackCooldown: 0
    };
    this.minions.push(lordMinion);
  }

  // --- BOT AI BEHAVIOR ---
  private updateBotAI(bot: HeroInstance, dt: number) {
    if (bot.buffs.stunDuration > 0) return;

    // 1. Check retreat if low HP
    const hpRatio = bot.currentHp / bot.maxHp;
    const fountain = bot.team === 'blue' ? FOUNTAIN_BLUE : FOUNTAIN_RED;

    if (hpRatio < 0.22) {
      bot.botState = 'retreating';
    } else if (hpRatio > 0.8) {
      bot.botState = 'laning';
    }

    if (bot.botState === 'retreating') {
      // Find nearest friendly turret
      const safeTurret = this.turrets
        .filter(t => t.team === bot.team && !t.destroyed)
        .sort((a, b) => Math.hypot(a.x - bot.x, a.y - bot.y) - Math.hypot(b.x - bot.x, b.y - bot.y))[0];

      let targetX = fountain.x;
      let targetY = fountain.y;

      if (safeTurret && Math.hypot(safeTurret.x - bot.x, safeTurret.y - bot.y) < 600) {
        targetX = safeTurret.x;
        targetY = safeTurret.y;
      }

      const angle = Math.atan2(targetY - bot.y, targetX - bot.x);
      const speed = this.getHeroMoveSpeed(bot);
      bot.x += Math.cos(angle) * speed * dt;
      bot.y += Math.sin(angle) * speed * dt;
      bot.rotation = angle;

      // If safely behind turret and no enemies close, channel recall
      const enemiesClose = this.heroes.some(h => h.team !== bot.team && !h.isDead && Math.hypot(h.x - bot.x, h.y - bot.y) < 400);
      if (!enemiesClose && safeTurret && Math.hypot(safeTurret.x - bot.x, safeTurret.y - bot.y) < 180) {
        if (bot.recallProgress === null) bot.recallProgress = 0;
      }
      return;
    }

    // 2. Buy items if bot has gold
    this.botAutoBuy(bot);

    // 3. Combat & Laning Target Search
    let targetEnemy: HeroInstance | null = null;
    let closestHeroDist = 480;

    for (const other of this.heroes) {
      if (other.team !== bot.team && !other.isDead) {
        // Can bot see other if in bush?
        if (other.inBush && !bot.inBush && Math.hypot(other.x - bot.x, other.y - bot.y) > 100) {
          continue; // hidden in bush
        }
        const d = Math.hypot(other.x - bot.x, other.y - bot.y);
        if (d < closestHeroDist) {
          closestHeroDist = d;
          targetEnemy = other;
        }
      }
    }

    // If enemy hero found in range
    if (targetEnemy) {
      bot.targetEnemyId = targetEnemy.id;
      const dist = Math.hypot(targetEnemy.x - bot.x, targetEnemy.y - bot.y);
      const angle = Math.atan2(targetEnemy.y - bot.y, targetEnemy.x - bot.x);
      bot.rotation = angle;

      // Cast skills smartly based on hero kit
      this.botCastSkills(bot, targetEnemy, dist, angle);

      // Basic Attack
      if (dist <= bot.attackRange && bot.basicAttackCooldown <= 0) {
        this.performBasicAttack(bot, targetEnemy);
      } else if (dist > bot.attackRange) {
        // Chase into attack range
        const speed = this.getHeroMoveSpeed(bot);
        bot.x += Math.cos(angle) * speed * dt;
        bot.y += Math.sin(angle) * speed * dt;
      }
      return;
    }

    // 4. If no enemy hero, farm lane minions or push lane
    const lane: Lane = (bot.botLane as Lane) || 'mid';
    const waypoints = LANE_WAYPOINTS[lane][bot.team];

    // Find enemy minions in lane
    const enemyMinions = this.minions.filter(m => m.team !== bot.team && m.lane === lane && Math.hypot(m.x - bot.x, m.y - bot.y) < 400);

    if (enemyMinions.length > 0) {
      const nearestMinion = enemyMinions.sort((a, b) => Math.hypot(a.x - bot.x, a.y - bot.y) - Math.hypot(b.x - bot.x, b.y - bot.y))[0];
      const dist = Math.hypot(nearestMinion.x - bot.x, nearestMinion.y - bot.y);
      const angle = Math.atan2(nearestMinion.y - bot.y, nearestMinion.x - bot.x);
      bot.rotation = angle;

      if (dist <= bot.attackRange && bot.basicAttackCooldown <= 0) {
        this.performBasicAttack(bot, nearestMinion);
      } else {
        const speed = this.getHeroMoveSpeed(bot);
        bot.x += Math.cos(angle) * speed * dt;
        bot.y += Math.sin(angle) * speed * dt;
      }
    } else {
      // Advance along lane waypoints
      const targetWp = waypoints[1] || waypoints[0];
      const angle = Math.atan2(targetWp.y - bot.y, targetWp.x - bot.x);
      const speed = this.getHeroMoveSpeed(bot) * 0.7;
      bot.x += Math.cos(angle) * speed * dt;
      bot.y += Math.sin(angle) * speed * dt;
      bot.rotation = angle;
    }
  }

  // Bot Skill Cast Combos
  private botCastSkills(bot: HeroInstance, target: HeroInstance, dist: number, angle: number) {
    // Layla: S1 shoot, S2 slow, S3 snipe beam
    if (bot.id === 'layla') {
      if (dist <= 400 && bot.skillCooldowns[0] <= 0 && bot.currentMana >= 40) {
        this.castSkill(bot, 0, angle, target);
      } else if (dist <= 350 && bot.skillCooldowns[1] <= 0 && bot.currentMana >= 65) {
        this.castSkill(bot, 1, angle, target);
      } else if (dist <= 650 && bot.skillCooldowns[2] <= 0 && bot.skillLevels[2] > 0 && target.currentHp < target.maxHp * 0.45) {
        this.castSkill(bot, 2, angle, target);
      }
    }
    // Tigreal: S2 push, S3 Implosion, S1 shockwave
    else if (bot.id === 'tigreal') {
      if (dist <= 220 && bot.skillCooldowns[2] <= 0 && bot.skillLevels[2] > 0) {
        this.castSkill(bot, 2, angle, target);
      } else if (dist <= 300 && bot.skillCooldowns[1] <= 0) {
        this.castSkill(bot, 1, angle, target);
      } else if (dist <= 260 && bot.skillCooldowns[0] <= 0) {
        this.castSkill(bot, 0, angle, target);
      }
    }
    // Eudora: S2 stun -> S3 ult -> S1 lightning
    else if (bot.id === 'eudora') {
      if (dist <= 320 && bot.skillCooldowns[1] <= 0) {
        this.castSkill(bot, 1, angle, target);
      } else if (dist <= 320 && bot.skillCooldowns[2] <= 0 && bot.skillLevels[2] > 0) {
        this.castSkill(bot, 2, angle, target);
      } else if (dist <= 300 && bot.skillCooldowns[0] <= 0) {
        this.castSkill(bot, 0, angle, target);
      }
    }
    // Franco: S1 Hook -> S2 Fury shock -> S3 Bloody hunt suppress
    else if (bot.id === 'franco') {
      if (dist <= 480 && dist > 150 && bot.skillCooldowns[0] <= 0) {
        this.castSkill(bot, 0, angle, target);
      } else if (dist <= 180 && bot.skillCooldowns[2] <= 0 && bot.skillLevels[2] > 0) {
        this.castSkill(bot, 2, angle, target);
      } else if (dist <= 200 && bot.skillCooldowns[1] <= 0) {
        this.castSkill(bot, 1, angle, target);
      }
    }
    // Saber: S1 swords -> S2 dash -> S3 Triple sweep
    else if (bot.id === 'saber') {
      if (bot.skillCooldowns[0] <= 0) {
        this.castSkill(bot, 0, angle, target);
      }
      if (dist <= 300 && bot.skillCooldowns[1] <= 0) {
        this.castSkill(bot, 1, angle, target);
      }
      if (dist <= 300 && bot.skillCooldowns[2] <= 0 && bot.skillLevels[2] > 0) {
        this.castSkill(bot, 2, angle, target);
      }
    }
    // Zilong: S2 strike -> S1 flip -> S3 supreme warrior
    else if (bot.id === 'zilong') {
      if (dist <= 280 && bot.skillCooldowns[1] <= 0) {
        this.castSkill(bot, 1, angle, target);
      } else if (dist <= 160 && bot.skillCooldowns[0] <= 0) {
        this.castSkill(bot, 0, angle, target);
      }
      if (dist <= 250 && bot.skillCooldowns[2] <= 0 && bot.skillLevels[2] > 0) {
        this.castSkill(bot, 2, angle, target);
      }
    }
    // Miya: S2 eclipse stun -> S1 split arrows -> S3 escape if CC
    else if (bot.id === 'miya') {
      if (dist <= 340 && bot.skillCooldowns[1] <= 0) {
        this.castSkill(bot, 1, angle, target);
      }
      if (dist <= 240 && bot.skillCooldowns[0] <= 0) {
        this.castSkill(bot, 0, angle, target);
      }
      if (bot.buffs.stunDuration > 0 && bot.skillCooldowns[2] <= 0 && bot.skillLevels[2] > 0) {
        this.castSkill(bot, 2, angle, target);
      }
    }
    // Generic fallback for Alucard, Nana, Gusion
    else {
      if (dist <= 300 && bot.skillCooldowns[0] <= 0) {
        this.castSkill(bot, 0, angle, target);
      } else if (dist <= 260 && bot.skillCooldowns[1] <= 0) {
        this.castSkill(bot, 1, angle, target);
      } else if (dist <= 320 && bot.skillCooldowns[2] <= 0 && bot.skillLevels[2] > 0) {
        this.castSkill(bot, 2, angle, target);
      }
    }
  }

  private botAutoBuy(bot: HeroInstance) {
    if (bot.items.length >= 6) return;
    // Pick suitable items based on role
    const suitableItems = ITEMS.filter(it => {
      if (bot.items.some(held => held.id === it.id)) return false;
      if (bot.role === 'Marksman' || bot.role === 'Assassin') return it.category === 'attack' || it.category === 'movement';
      if (bot.role === 'Mage') return it.category === 'magic' || it.category === 'movement';
      if (bot.role === 'Tank') return it.category === 'defense' || it.category === 'movement';
      return true;
    });

    const affordable = suitableItems.find(it => bot.gold >= it.cost);
    if (affordable) {
      bot.gold -= affordable.cost;
      bot.items.push(affordable);
    }
  }

  // --- BASIC ATTACK EXECUTION ---
  public performBasicAttack(attacker: HeroInstance, target: any) {
    attacker.recallProgress = null; // attacking cancels recall
    const baseAtkSpeed = attacker.attackSpeed * (attacker.buffs.attackSpeedBoost > 0 ? 1.55 : 1.0);
    attacker.basicAttackCooldown = 1.0 / Math.max(0.6, baseAtkSpeed);

    // Calculate attack damage with item bonuses
    let damage = attacker.physAtk;
    attacker.items.forEach(it => {
      if (it.stats.physAtk) damage += it.stats.physAtk;
      if (it.stats.magicPower && attacker.role === 'Mage') damage += it.stats.magicPower * 0.2;
    });

    // Check Crit
    let isCrit = false;
    let totalCritChance = 0;
    attacker.items.forEach(it => {
      if (it.stats.critChance) totalCritChance += it.stats.critChance;
    });
    if (Math.random() < totalCritChance) {
      isCrit = true;
      damage *= 2.0;
    }

    // Hero specific passives on basic attack:
    // 1. Layla Malefic Gun: damage scales with distance
    if (attacker.id === 'layla') {
      const dist = Math.hypot(target.x - attacker.x, target.y - attacker.y);
      const bonus = Math.min(0.35, (dist / 300) * 0.35);
      damage *= (1 + bonus);
    }
    // 2. Miya Moon Blessing: stacks attack speed
    else if (attacker.id === 'miya') {
      attacker.miyaStacks = Math.min(5, (attacker.miyaStacks || 0) + 1);
    }
    // 3. Saber Enemy's Bane: shreds defense
    else if (attacker.id === 'saber' && target.physDef !== undefined) {
      target.physDef = Math.max(0, target.physDef - 5);
    }
    // 4. Zilong Dragon Flurry
    else if (attacker.id === 'zilong') {
      if (Math.random() < 0.3) {
        damage *= 1.5;
        attacker.currentHp = Math.min(attacker.maxHp, attacker.currentHp + damage * 0.4);
        this.addFloatingText('DRAGON FLURRY!', attacker.x, attacker.y - 30, '#eab308');
      }
    }

    // Red Buff burn + slow
    if (attacker.buffs.redBuff > 0) {
      damage += 45;
      if (target.buffs) {
        target.buffs.slowDuration = 1.5;
        target.buffs.slowFactor = 0.25;
      }
    }

    // Play sound based on role/weapon
    if (attacker.role === 'Marksman') {
      soundManager.playAttackSound(attacker.id === 'layla' ? 'gun' : 'arrow');
    } else if (attacker.role === 'Mage') {
      soundManager.playAttackSound('magic');
    } else {
      soundManager.playAttackSound('slash');
    }

    // Spawn ranged projectile or immediate melee hit
    if (attacker.attackRange > 180) {
      this.spawnProjectile({
        id: `proj_basic_${attacker.id}_${Date.now()}`,
        sourceId: attacker.id,
        sourceTeam: attacker.team,
        targetId: target.id,
        x: attacker.x,
        y: attacker.y,
        vx: 0,
        vy: 0,
        speed: 550,
        maxDist: attacker.attackRange + 50,
        traveled: 0,
        damage,
        damageType: attacker.role === 'Mage' ? 'magic' : 'physical',
        color: isCrit ? '#fbbf24' : attacker.team === 'blue' ? '#38bdf8' : '#f87171',
        radius: isCrit ? 8 : 6
      });
    } else {
      // Melee strike
      this.applyDamage(target, damage, 'physical', attacker.name, attacker.id, attacker.team);
      this.addVisualEffect('slash', target.x, target.y, '#e2e8f0', 40, 0.2);
    }
  }

  // --- SKILL CASTING ENGINE ---
  public castSkill(hero: HeroInstance, skillIndex: number, targetAngle?: number, lockedTarget?: any): boolean {
    if (hero.isDead || hero.buffs.stunDuration > 0) return false;

    const skill = hero.skills[skillIndex];
    if (!skill || hero.skillLevels[skillIndex] <= 0) return false;
    if (hero.skillCooldowns[skillIndex] > 0) return false;
    if (hero.currentMana < skill.manaCost) return false;

    // Deduct mana
    hero.currentMana -= skill.manaCost;
    // Set cooldown with CDR item scaling
    const cdr = this.getHeroCDR(hero);
    hero.skillCooldowns[skillIndex] = skill.cooldown * (1 - cdr);
    hero.recallProgress = null;

    soundManager.playSkillSound(hero.id, skill.isUltimate);

    const angle = targetAngle !== undefined ? targetAngle : hero.rotation;
    const skillLvl = hero.skillLevels[skillIndex];
    const totalDmg = skill.baseDamage + (skillLvl - 1) * 60 + (skill.damageType === 'magic' ? hero.magicPower * skill.scaling : hero.physAtk * skill.scaling);

    // --- SKILL IMPLEMENTATIONS BY HERO ---
    // 1. LAYLA
    if (hero.id === 'layla') {
      if (skillIndex === 0) {
        // S1: Malefic Bomb (Skillshot)
        this.spawnProjectile({
          id: `layla_s1_${Date.now()}`,
          sourceId: hero.id,
          sourceTeam: hero.team,
          x: hero.x,
          y: hero.y,
          vx: Math.cos(angle),
          vy: Math.sin(angle),
          speed: 680,
          maxDist: skill.range,
          traveled: 0,
          damage: totalDmg,
          damageType: 'physical',
          color: '#38bdf8',
          radius: 12,
          effectType: 'slow'
        });
        hero.buffs.speedBoost = 2.5;
        hero.buffs.speedFactor = 1.4;
      } else if (skillIndex === 1) {
        // S2: Void Projectile (AoE detonation)
        const targetX = hero.x + Math.cos(angle) * Math.min(skill.range, 350);
        const targetY = hero.y + Math.sin(angle) * Math.min(skill.range, 350);
        this.addVisualEffect('circle', targetX, targetY, '#818cf8', skill.radius || 90, 0.4);
        this.damageInRadius(hero, targetX, targetY, skill.radius || 90, totalDmg, 'physical', 'slow');
      } else if (skillIndex === 2) {
        // S3: Destruction Rush (Giant Full-Line Piercing Laser Beam!)
        this.addVisualEffect('beam', hero.x, hero.y, '#38bdf8', 40, 0.65, hero.x + Math.cos(angle) * skill.range, hero.y + Math.sin(angle) * skill.range);
        this.damageInLine(hero, hero.x, hero.y, angle, skill.range, 70, totalDmg, 'physical');
      }
    }
    // 2. MIYA
    else if (hero.id === 'miya') {
      if (skillIndex === 0) {
        // S1: Moon Arrow Buff (split arrows)
        hero.buffs.attackSpeedBoost = 4.0;
        this.addVisualEffect('ring', hero.x, hero.y, '#c084fc', 60, 0.4);
      } else if (skillIndex === 1) {
        // S2: Arrow of Eclipse (AoE rain & immobilize stun)
        const targetX = hero.x + Math.cos(angle) * 320;
        const targetY = hero.y + Math.sin(angle) * 320;
        this.addVisualEffect('circle', targetX, targetY, '#a855f7', 100, 0.5);
        this.damageInRadius(hero, targetX, targetY, 100, totalDmg, 'physical', 'stun');
      } else if (skillIndex === 2) {
        // S3: Hidden Moonlight (Stealth & Cleanse & Speed)
        hero.buffs.stunDuration = 0;
        hero.buffs.slowDuration = 0;
        hero.buffs.stealthDuration = 2.5;
        hero.buffs.speedBoost = 2.5;
        hero.buffs.speedFactor = 1.45;
        hero.miyaStacks = 5;
        this.addVisualEffect('ring', hero.x, hero.y, '#e0e7ff', 80, 0.4);
      }
    }
    // 3. TIGREAL
    else if (hero.id === 'tigreal') {
      if (skillIndex === 0) {
        // S1: Attack Wave
        this.addVisualEffect('beam', hero.x, hero.y, '#fbbf24', 60, 0.35, hero.x + Math.cos(angle) * skill.range, hero.y + Math.sin(angle) * skill.range);
        this.damageInLine(hero, hero.x, hero.y, angle, skill.range, 60, totalDmg, 'physical', 'slow');
      } else if (skillIndex === 1) {
        // S2: Sacred Hammer (Charge push & knockup)
        const targetX = hero.x + Math.cos(angle) * 260;
        const targetY = hero.y + Math.sin(angle) * 260;
        hero.x = targetX;
        hero.y = targetY;
        this.addVisualEffect('ring', hero.x, hero.y, '#f59e0b', 80, 0.3);
        this.damageInRadius(hero, hero.x, hero.y, 110, totalDmg, 'physical', 'stun');
      } else if (skillIndex === 2) {
        // S3: Implosion (Pull all surrounding enemies + 1.5s stun)
        this.addVisualEffect('ring', hero.x, hero.y, '#eab308', 200, 0.6);
        this.heroes.forEach(h => {
          if (h.team !== hero.team && !h.isDead && Math.hypot(h.x - hero.x, h.y - hero.y) <= 200) {
            // Pull towards Tigreal
            h.x = hero.x + (h.x - hero.x) * 0.25;
            h.y = hero.y + (h.y - hero.y) * 0.25;
            h.buffs.stunDuration = 1.5;
            this.applyDamage(h, totalDmg, 'physical', hero.name, hero.id, hero.team);
          }
        });
      }
    }
    // 4. ALUCARD
    else if (hero.id === 'alucard') {
      if (skillIndex === 0) {
        // S1: Groundsplitter (Leap to area)
        hero.x += Math.cos(angle) * 280;
        hero.y += Math.sin(angle) * 280;
        this.addVisualEffect('circle', hero.x, hero.y, '#f43f5e', 100, 0.35);
        this.damageInRadius(hero, hero.x, hero.y, 100, totalDmg, 'physical', 'slow');
      } else if (skillIndex === 1) {
        // S2: Whirling Smash (360 circular cleave)
        this.addVisualEffect('ring', hero.x, hero.y, '#e11d48', 160, 0.3);
        this.damageInRadius(hero, hero.x, hero.y, 160, totalDmg, 'physical');
      } else if (skillIndex === 2) {
        // S3: Fission Wave (Twin energy shockwave + lifesteal)
        hero.buffs.speedBoost = 5;
        this.addVisualEffect('beam', hero.x, hero.y, '#f43f5e', 80, 0.45, hero.x + Math.cos(angle) * skill.range, hero.y + Math.sin(angle) * skill.range);
        this.damageInLine(hero, hero.x, hero.y, angle, skill.range, 80, totalDmg, 'physical');
      }
    }
    // 5. EUDORA
    else if (hero.id === 'eudora') {
      if (skillIndex === 0) {
        // S1: Forked Lightning
        this.addVisualEffect('beam', hero.x, hero.y, '#c084fc', 80, 0.35, hero.x + Math.cos(angle) * skill.range, hero.y + Math.sin(angle) * skill.range);
        this.damageInLine(hero, hero.x, hero.y, angle, skill.range, 100, totalDmg, 'magic');
      } else if (skillIndex === 1) {
        // S2: Ball Lightning (Stun)
        const target = lockedTarget || this.findClosestEnemy(hero, skill.range);
        if (target) {
          this.spawnProjectile({
            id: `eudora_s2_${Date.now()}`,
            sourceId: hero.id,
            sourceTeam: hero.team,
            targetId: target.id,
            x: hero.x,
            y: hero.y,
            vx: 0,
            vy: 0,
            speed: 520,
            maxDist: skill.range + 50,
            traveled: 0,
            damage: totalDmg,
            damageType: 'magic',
            color: '#a855f7',
            radius: 10,
            effectType: 'stun',
            duration: 1.3
          });
        }
      } else if (skillIndex === 2) {
        // S3: Thunder's Wrath (Colossal lightning blast onto target)
        const target = lockedTarget || this.findClosestEnemy(hero, skill.range);
        if (target) {
          this.addVisualEffect('circle', target.x, target.y, '#9333ea', 120, 0.5);
          this.damageInRadius(hero, target.x, target.y, 120, totalDmg, 'magic');
        }
      }
    }
    // 6. SABER
    else if (hero.id === 'saber') {
      if (skillIndex === 0) {
        // S1: Orbiting Swords
        hero.saberSwords = 5;
        this.addVisualEffect('ring', hero.x, hero.y, '#ef4444', 90, 0.4);
      } else if (skillIndex === 1) {
        // S2: Charge dash
        hero.x += Math.cos(angle) * 280;
        hero.y += Math.sin(angle) * 280;
        this.damageInRadius(hero, hero.x, hero.y, 90, totalDmg, 'physical');
      } else if (skillIndex === 2) {
        // S3: Triple Sweep (Knock airborne and slash)
        const target = lockedTarget || this.findClosestEnemy(hero, skill.range);
        if (target) {
          hero.x = target.x;
          hero.y = target.y;
          if (target.buffs) target.buffs.stunDuration = 1.3;
          this.addVisualEffect('slash', target.x, target.y, '#ef4444', 60, 0.4);
          this.applyDamage(target, totalDmg, 'physical', hero.name, hero.id, hero.team);
        }
      }
    }
    // 7. ZILONG
    else if (hero.id === 'zilong') {
      if (skillIndex === 0) {
        // S1: Spear Flip behind
        const target = lockedTarget || this.findClosestEnemy(hero, skill.range);
        if (target) {
          // Flip target behind Zilong
          target.x = hero.x - Math.cos(hero.rotation) * 90;
          target.y = hero.y - Math.sin(hero.rotation) * 90;
          this.applyDamage(target, totalDmg, 'physical', hero.name, hero.id, hero.team);
          this.addVisualEffect('slash', target.x, target.y, '#f59e0b', 50, 0.25);
        }
      } else if (skillIndex === 1) {
        // S2: Spear Strike dash
        const target = lockedTarget || this.findClosestEnemy(hero, skill.range);
        if (target) {
          hero.x = target.x - Math.cos(hero.rotation) * 40;
          hero.y = target.y - Math.sin(hero.rotation) * 40;
          this.applyDamage(target, totalDmg, 'physical', hero.name, hero.id, hero.team);
          this.addVisualEffect('slash', target.x, target.y, '#eab308', 50, 0.25);
        }
      } else if (skillIndex === 2) {
        // S3: Supreme Warrior (Speed & Attack Speed Steroid + Slow immunity)
        hero.buffs.speedBoost = 7.5;
        hero.buffs.speedFactor = 1.4;
        hero.buffs.attackSpeedBoost = 7.5;
        hero.buffs.slowDuration = 0;
        this.addVisualEffect('ring', hero.x, hero.y, '#f59e0b', 90, 0.5);
      }
    }
    // 8. NANA
    else if (hero.id === 'nana') {
      if (skillIndex === 0) {
        // S1: Magic Boomerang
        this.spawnProjectile({
          id: `nana_s1_${Date.now()}`,
          sourceId: hero.id,
          sourceTeam: hero.team,
          x: hero.x,
          y: hero.y,
          vx: Math.cos(angle),
          vy: Math.sin(angle),
          speed: 600,
          maxDist: skill.range,
          traveled: 0,
          damage: totalDmg,
          damageType: 'magic',
          color: '#f472b6',
          radius: 14,
          effectType: 'pierce'
        });
      } else if (skillIndex === 1) {
        // S2: Molina Smooch (Morphs enemy into cat)
        const targetX = hero.x + Math.cos(angle) * 260;
        const targetY = hero.y + Math.sin(angle) * 260;
        this.addVisualEffect('circle', targetX, targetY, '#f472b6', 70, 0.4);
        this.damageInRadius(hero, targetX, targetY, 70, totalDmg, 'magic', 'stun');
      } else if (skillIndex === 2) {
        // S3: Molina Blitz (3x consecutive ground strikes)
        const targetX = hero.x + Math.cos(angle) * 280;
        const targetY = hero.y + Math.sin(angle) * 280;
        this.addVisualEffect('circle', targetX, targetY, '#fb7185', 130, 0.6);
        this.damageInRadius(hero, targetX, targetY, 130, totalDmg, 'magic', 'stun');
      }
    }
    // 9. GUSION
    else if (hero.id === 'gusion') {
      if (skillIndex === 0) {
        // S1: Sword Spike
        this.spawnProjectile({
          id: `gusion_s1_${Date.now()}`,
          sourceId: hero.id,
          sourceTeam: hero.team,
          x: hero.x,
          y: hero.y,
          vx: Math.cos(angle),
          vy: Math.sin(angle),
          speed: 700,
          maxDist: skill.range,
          traveled: 0,
          damage: totalDmg,
          damageType: 'magic',
          color: '#60a5fa',
          radius: 8
        });
      } else if (skillIndex === 1) {
        // S2: Shadowblade Slaughter (Fan of 5 flying daggers)
        for (let i = -2; i <= 2; i++) {
          const spreadAngle = angle + (i * Math.PI) / 14;
          this.spawnProjectile({
            id: `gusion_s2_${i}_${Date.now()}`,
            sourceId: hero.id,
            sourceTeam: hero.team,
            x: hero.x,
            y: hero.y,
            vx: Math.cos(spreadAngle),
            vy: Math.sin(spreadAngle),
            speed: 620,
            maxDist: skill.range,
            traveled: 0,
            damage: totalDmg * 0.4,
            damageType: 'magic',
            color: '#93c5fd',
            radius: 7
          });
        }
      } else if (skillIndex === 2) {
        // S3: Incandescent (Dash & reset cooldowns!)
        hero.x += Math.cos(angle) * 280;
        hero.y += Math.sin(angle) * 280;
        hero.skillCooldowns[0] = 0;
        hero.skillCooldowns[1] = 0;
        this.addVisualEffect('ring', hero.x, hero.y, '#38bdf8', 80, 0.35);
      }
    }
    // 10. FRANCO
    else if (hero.id === 'franco') {
      if (skillIndex === 0) {
        // S1: Iron Hook! (Snags enemy and pulls all the way to Franco)
        this.spawnProjectile({
          id: `franco_hook_${Date.now()}`,
          sourceId: hero.id,
          sourceTeam: hero.team,
          x: hero.x,
          y: hero.y,
          vx: Math.cos(angle),
          vy: Math.sin(angle),
          speed: 650,
          maxDist: skill.range,
          traveled: 0,
          damage: totalDmg,
          damageType: 'physical',
          color: '#cbd5e1',
          radius: 12,
          effectType: 'hook'
        });
        this.addVisualEffect('hook-chain', hero.x, hero.y, '#94a3b8', 20, 0.4, hero.x + Math.cos(angle) * skill.range, hero.y + Math.sin(angle) * skill.range);
      } else if (skillIndex === 1) {
        // S2: Fury Shock (AoE ground slam & slow)
        this.addVisualEffect('ring', hero.x, hero.y, '#38bdf8', 160, 0.3);
        this.damageInRadius(hero, hero.x, hero.y, 160, totalDmg, 'physical', 'slow');
      } else if (skillIndex === 2) {
        // S3: Bloody Hunt (Total Suppression!)
        const target = lockedTarget || this.findClosestEnemy(hero, skill.range);
        if (target) {
          if (target.buffs) target.buffs.stunDuration = 1.8;
          this.applyDamage(target, totalDmg, 'physical', hero.name, hero.id, hero.team);
          this.addVisualEffect('slash', target.x, target.y, '#ef4444', 60, 0.4);
        }
      }
    }

    if (this.listeners.onUpdateHUD) this.listeners.onUpdateHUD();
    return true;
  }

  // --- BATTLE SPELLS CASTING ---
  public castBattleSpell(hero: HeroInstance) {
    if (hero.isDead || hero.spellCooldown > 0) return;

    hero.spellCooldown = hero.spell.cooldown;
    hero.recallProgress = null;

    if (hero.spell.id === 'flicker') {
      // Instant blink forward
      hero.x += Math.cos(hero.rotation) * 220;
      hero.y += Math.sin(hero.rotation) * 220;
      this.addVisualEffect('ring', hero.x, hero.y, '#f59e0b', 70, 0.25);
    } else if (hero.spell.id === 'execute') {
      const target = this.findClosestEnemy(hero, 280);
      if (target) {
        const missingHp = (target.maxHp || 2000) - target.currentHp;
        const trueDmg = 200 + hero.level * 20 + missingHp * 0.13;
        this.applyDamage(target, trueDmg, 'true', hero.name, hero.id, hero.team);
        this.addVisualEffect('slash', target.x, target.y, '#ffffff', 60, 0.3);
      }
    } else if (hero.spell.id === 'retribution') {
      // Slays jungle monster or deals true damage
      const monster = this.monsters.find(m => m.isAlive && Math.hypot(m.x - hero.x, m.y - hero.y) <= 240);
      if (monster) {
        const dmg = 520 + hero.level * 80;
        this.applyDamage(monster, dmg, 'true', hero.name, hero.id, hero.team);
        this.addVisualEffect('burst', monster.x, monster.y, '#fbbf24', 50, 0.3);
      }
    } else if (hero.spell.id === 'purify') {
      hero.buffs.stunDuration = 0;
      hero.buffs.slowDuration = 0;
      hero.buffs.speedBoost = 1.2;
      hero.buffs.speedFactor = 1.15;
      this.addVisualEffect('ring', hero.x, hero.y, '#22c55e', 70, 0.3);
    } else if (hero.spell.id === 'flameshot') {
      this.spawnProjectile({
        id: `flameshot_${Date.now()}`,
        sourceId: hero.id,
        sourceTeam: hero.team,
        x: hero.x,
        y: hero.y,
        vx: Math.cos(hero.rotation),
        vy: Math.sin(hero.rotation),
        speed: 750,
        maxDist: 650,
        traveled: 0,
        damage: 400 + hero.level * 40,
        damageType: 'magic',
        color: '#f97316',
        radius: 12
      });
    } else if (hero.spell.id === 'aegis') {
      hero.buffs.turtleShield = 750 + hero.level * 90;
      this.addVisualEffect('ring', hero.x, hero.y, '#38bdf8', 90, 0.4);
    } else if (hero.spell.id === 'sprint') {
      hero.buffs.speedBoost = 6.0;
      hero.buffs.speedFactor = 1.5;
      hero.buffs.slowDuration = 0;
    } else if (hero.spell.id === 'inspire') {
      hero.buffs.attackSpeedBoost = 5.0;
      this.addVisualEffect('ring', hero.x, hero.y, '#eab308', 80, 0.3);
    }
  }

  // --- REGEN SPELL & RECALL ---
  public castRegen(hero: HeroInstance) {
    if (hero.isDead || hero.regenCooldown > 0) return;
    hero.regenCooldown = 60;
    hero.regenDuration = 5.0;
    this.addFloatingText('REGENERATION', hero.x, hero.y - 35, '#22c55e');
  }

  public triggerRecall(hero: HeroInstance) {
    if (hero.isDead) return;
    hero.recallProgress = 0;
    this.addFloatingText('RECALLING...', hero.x, hero.y - 35, '#38bdf8');
  }

  // --- UTILITY COMBAT HELPERS ---
  private damageInRadius(hero: HeroInstance, x: number, y: number, radius: number, dmg: number, type: DamageType, effect?: 'stun' | 'slow') {
    this.heroes.forEach(h => {
      if (h.team !== hero.team && !h.isDead && Math.hypot(h.x - x, h.y - y) <= radius) {
        if (effect === 'stun') h.buffs.stunDuration = 1.2;
        if (effect === 'slow') {
          h.buffs.slowDuration = 2.0;
          h.buffs.slowFactor = 0.4;
        }
        this.applyDamage(h, dmg, type, hero.name, hero.id, hero.team);
      }
    });
    this.minions.forEach(m => {
      if (m.team !== hero.team && m.hp > 0 && Math.hypot(m.x - x, m.y - y) <= radius) {
        this.applyDamage(m, dmg, type, hero.name, hero.id, hero.team);
      }
    });
  }

  private damageInLine(hero: HeroInstance, sx: number, sy: number, angle: number, length: number, thickness: number, dmg: number, type: DamageType, effect?: 'stun' | 'slow') {
    const ex = sx + Math.cos(angle) * length;
    const ey = sy + Math.sin(angle) * length;

    const hitCheck = (px: number, py: number) => {
      const l2 = (ex - sx) * (ex - sx) + (ey - sy) * (ey - sy);
      if (l2 === 0) return Math.hypot(px - sx, py - sy) < thickness;
      const t = Math.max(0, Math.min(1, ((px - sx) * (ex - sx) + (py - sy) * (ey - sy)) / l2));
      const projX = sx + t * (ex - sx);
      const projY = sy + t * (ey - sy);
      return Math.hypot(px - projX, py - projY) <= thickness;
    };

    this.heroes.forEach(h => {
      if (h.team !== hero.team && !h.isDead && hitCheck(h.x, h.y)) {
        if (effect === 'stun') h.buffs.stunDuration = 1.0;
        if (effect === 'slow') {
          h.buffs.slowDuration = 2.0;
          h.buffs.slowFactor = 0.35;
        }
        this.applyDamage(h, dmg, type, hero.name, hero.id, hero.team);
      }
    });
    this.minions.forEach(m => {
      if (m.team !== hero.team && m.hp > 0 && hitCheck(m.x, m.y)) {
        this.applyDamage(m, dmg, type, hero.name, hero.id, hero.team);
      }
    });
  }

  private findClosestEnemy(hero: HeroInstance, range: number): HeroInstance | null {
    let best: HeroInstance | null = null;
    let bestDist = range;
    this.heroes.forEach(h => {
      if (h.team !== hero.team && !h.isDead) {
        const d = Math.hypot(h.x - hero.x, h.y - hero.y);
        if (d <= bestDist) {
          bestDist = d;
          best = h;
        }
      }
    });
    return best;
  }

  // --- STAT CALCULATIONS ---
  public getHeroMoveSpeed(hero: HeroInstance): number {
    let speed = hero.moveSpeed;
    hero.items.forEach(it => {
      if (it.stats.moveSpeed) speed += it.stats.moveSpeed;
    });
    if (hero.buffs.speedBoost > 0) speed *= hero.buffs.speedFactor;
    if (hero.buffs.slowDuration > 0) speed *= (1 - hero.buffs.slowFactor);
    return Math.max(120, speed);
  }

  public getHeroCDR(hero: HeroInstance): number {
    let cdr = 0;
    if (hero.buffs.blueBuff > 0) cdr += 0.10;
    hero.items.forEach(it => {
      if (it.stats.cooldownReduction) cdr += it.stats.cooldownReduction;
    });
    return Math.min(0.40, cdr); // 40% CDR cap
  }

  public getHeroLifesteal(hero: HeroInstance): number {
    let ls = 0;
    if (hero.id === 'alucard') ls += 0.25;
    hero.items.forEach(it => {
      if (it.stats.lifesteal) ls += it.stats.lifesteal;
    });
    return ls;
  }

  public gainExp(hero: HeroInstance, amount: number) {
    if (hero.level >= 15) return;
    hero.exp += amount;
    const required = hero.level * 180;
    if (hero.exp >= required) {
      hero.exp -= required;
      hero.level += 1;
      hero.maxHp += 160;
      hero.currentHp += 160;
      hero.physAtk += 8;
      hero.physDef += 3;
      hero.magicDef += 2;
      // Auto level skills
      if (hero.level % 4 === 0 && hero.skillLevels[2] < 3) {
        hero.skillLevels[2] += 1;
      } else if (hero.skillLevels[0] < 6) {
        hero.skillLevels[0] += 1;
      } else if (hero.skillLevels[1] < 6) {
        hero.skillLevels[1] += 1;
      }

      if (hero.id === this.playerHero.id) {
        soundManager.playLevelUp();
        this.addFloatingText('LEVEL UP!', hero.x, hero.y - 45, '#eab308', 20);
      }
    }
  }

  private respawnHero(hero: HeroInstance) {
    hero.isDead = false;
    const fountain = hero.team === 'blue' ? FOUNTAIN_BLUE : FOUNTAIN_RED;
    hero.x = fountain.x;
    hero.y = fountain.y;
    hero.currentHp = hero.maxHp;
    hero.currentMana = hero.maxMana;
    hero.buffs.stunDuration = 0;
    hero.buffs.slowDuration = 0;
  }

  // --- VISUALS & FLOATING TEXTS ---
  public addFloatingText(text: string, x: number, y: number, color: string, fontSize: number = 16) {
    this.floatingTexts.push({
      id: `ft_${Date.now()}_${Math.random()}`,
      text,
      x: x + (Math.random() - 0.5) * 20,
      y,
      color,
      fontSize,
      alpha: 1,
      life: 0,
      maxLife: 1.0,
      vy: -40
    });
  }

  private updateFloatingTexts(dt: number) {
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life += dt;
      ft.y += ft.vy * dt;
      ft.alpha = 1 - ft.life / ft.maxLife;
      if (ft.life >= ft.maxLife) {
        this.floatingTexts.splice(i, 1);
      }
    }
  }

  public addVisualEffect(
    type: VisualEffect['type'],
    x: number,
    y: number,
    color: string,
    radius: number,
    duration: number,
    targetX?: number,
    targetY?: number
  ) {
    this.visualEffects.push({
      id: `fx_${Date.now()}_${Math.random()}`,
      type,
      x,
      y,
      targetX,
      targetY,
      radius,
      color,
      life: 0,
      maxLife: duration
    });
  }

  private updateVisualEffects(dt: number) {
    for (let i = this.visualEffects.length - 1; i >= 0; i--) {
      const fx = this.visualEffects[i];
      fx.life += dt;
      if (fx.life >= fx.maxLife) {
        this.visualEffects.splice(i, 1);
      }
    }
  }

  public spawnProjectile(proj: Projectile) {
    this.projectiles.push(proj);
  }

  public triggerAnnouncement(ann: GameAnnouncement) {
    if (this.listeners.onAnnounce) this.listeners.onAnnounce(ann);
  }
}
