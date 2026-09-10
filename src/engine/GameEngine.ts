// ============================================================================
//  GameEngine - authoritative 5v5 arena simulation.
//  Handles heroes, laning minions, turrets, jungle, objectives, combat math,
//  vision/fog, pings and chat. Rendering & React read from this only.
// ============================================================================

import {
  Announcement, DamageType, EngineSnapshot, FloatingText, Hero,
  HeroStats, Item, KillFeedItem, Lane, LaneRole, MapPing, MatchPhase, Minion,
  MinionKind, Monster, Projectile, SkillHudEntry, Team, Turret, VisualEffect,
  HeroRuntime, QuickChatOption
} from '../types/game';
import {
  FOUNTAINS, LANES, MAP_H, MAP_MARGIN, MAP_W, TUNE, campTeamSide, createCamps,
  createTurrets, inBush, inRiver, isWalkable, lanePath, laneSpawn, pointInWall,
  steer, CampSpec, TURTLE_PIT, LORD_PIT, SPAWN_POINTS
} from './GameMap';
import { HEROES } from '../data/heroes';
import { ITEMS } from '../data/items';
import { BATTLE_SPELLS } from '../data/spells';
import { castHeroSkill } from './Skills';
import { ChatSystem, QUICK_CHAT } from './ChatSystem';
import { updateBot } from './BotAI';
import { soundManager } from '../audio/soundManager';

export type Unit = Hero | Minion | Turret | Monster;

export interface EngineListeners {
  onAnnounce?: (a: Announcement) => void;
  onGameOver?: (winner: Team) => void;
  onDirty?: () => void;
}

const DEF_CONSTANT = 100;

let uidCounter = 1;
const nextUid = () => uidCounter++;

export class GameEngine {
  // ---- world ----
  heroes: Hero[] = [];
  player!: Hero;
  minions: Minion[] = [];
  turrets: Turret[] = [];
  monsters: Monster[] = [];
  projectiles: Projectile[] = [];
  effects: VisualEffect[] = [];
  floats: FloatingText[] = [];
  pings: MapPing[] = [];
  killFeed: KillFeedItem[] = [];
  chat = new ChatSystem();

  // ---- match state ----
  time = 0;
  state: 'running' | 'paused' | 'over' = 'running';
  winner: Team | null = null;
  blueKills = 0;
  redKills = 0;
  waveNumber = 0;
  nextWaveAt = TUNE.firstWaveAt;
  fps = 60;
  error: string | null = null;
  private errCount = 0;
  private accum = 0;
  private frameCount = 0;
  private lastFrameStamp = 0;

  lordTeam: Team | null = null;
  lordExpiry = 0;
  /** how many Turtle / Lord each team has taken down */
  objectiveKills = {
    turtle: { blue: 0, red: 0 } as Record<Team, number>,
    lord: { blue: 0, red: 0 } as Record<Team, number>
  };
  turtleDownAt = -999;
  lordDownAt = -999;
  /** monsters call this when they take damage so they fight back */
  notifyMonsterHit(m: Monster) { m.aggroTimer = 5; }
  /** first blood etc. */
  private firstBloodDone = false;
  private streaks = new Map<number, { kills: number; at: number; multi: number }>();
  private lastAnnounceAt = new Map<string, number>();

  // ---- camera / input ----
  camera = { x: 300, y: 2100, zoom: 1, width: 1280, height: 720, shake: 0 };
  aim: { skillIndex: number; angle: number; aiming: boolean } | null = null;
  difficulty: 'easy' | 'normal' | 'mythic' = 'normal';
  listeners: EngineListeners = {};
  /** player-controlled hero movement comes from here */
  private campSpecs: (CampSpec & { side: Team })[] = [];

  constructor(playerHeroId: string, spellId: string, opts: { lane?: LaneRole; difficulty?: 'easy' | 'normal' | 'mythic'; listeners?: EngineListeners } = {}) {
    this.listeners = opts.listeners ?? {};
    this.difficulty = opts.difficulty ?? 'normal';
    this.buildMatch(playerHeroId, spellId, opts.lane ?? 'mid');
    this.turrets = createTurrets();
    this.buildCamps();
    this.camera.x = this.player.x;
    this.camera.y = this.player.y;
    this.chat.system('Match started. Destroy the enemy base core to win!', 'neutral');
    this.chat.push({
      channel: 'system', senderName: '', senderTeam: 'system', time: 0,
      text: 'Tip: hold the joystick to move, tap ATTACK to auto-last-hit, use the chat wheel to ping.'
    });
    setTimeout(() => {
      this.chat.botReact(this.heroes.filter(h => h.isBot), 2, 'greet', { chance: 1 });
    }, 0);
  }

  // ==========================================================================
  //  Match setup
  // ==========================================================================

  private buildMatch(playerHeroId: string, spellId: string, playerLane: LaneRole) {
    const byId = new Map(HEROES.map(h => [h.id, h]));
    const playerDef = byId.get(playerHeroId) ?? HEROES[0];

    const rest = HEROES.filter(h => h.id !== playerHeroId);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }

    const blueDefs = [playerDef, ...rest.slice(0, 4)];
    const redDefs = rest.slice(4, 9);
    // keep every hero used exactly once; if roster is short, repeat for red
    while (redDefs.length < 5) redDefs.push(HEROES[redDefs.length % HEROES.length]);

    const ALL_ROLES: LaneRole[] = ['mid', 'gold', 'exp', 'jungle', 'roam'];
    const assign = (defs: typeof HEROES, team: Team, forcedPlayerLane: LaneRole): Hero[] => {
      const taken = new Set<LaneRole>();
      const roles: (LaneRole | null)[] = defs.map(() => null);
      if (team === 'blue') { roles[0] = forcedPlayerLane; taken.add(forcedPlayerLane); }
      // fill the specialised slots first so every comp has a jungler and a roamer;
      // ties go to the most constrained hero (fewest acceptable lanes)
      const prefScore = (def: (typeof HEROES)[number], slot: LaneRole) => {
        const prefs = [def.laneSuggestion, ...def.lanes];
        if (prefs[0] === slot) return 3;
        if (prefs.includes(slot)) return 2;
        return 0;
      };
      for (const slot of ['jungle', 'roam', 'mid', 'exp', 'gold'] as LaneRole[]) {
        if (taken.has(slot)) continue;
        let pick = -1, bestKey = -Infinity;
        defs.forEach((def, i) => {
          if (roles[i] !== null) return;
          const flexible = new Set<LaneRole>([def.laneSuggestion, ...def.lanes]).size;
          const key = prefScore(def, slot) * 10 - flexible;
          if (key > bestKey) { bestKey = key; pick = i; }
        });
        if (pick >= 0) { roles[pick] = slot; taken.add(slot); }
      }
      defs.forEach((_def, i) => {
        if (roles[i] === null) {
          roles[i] = ALL_ROLES.find(r => !taken.has(r)) ?? 'roam';
          taken.add(roles[i] as LaneRole);
        }
      });
      return defs.map((def, i) => {
        const role = roles[i] as LaneRole;
        const spawn = team === 'blue'
          ? { x: SPAWN_POINTS.blue.x + i * 42, y: SPAWN_POINTS.blue.y + (i % 2) * 36 }
          : { x: SPAWN_POINTS.red.x - i * 42, y: SPAWN_POINTS.red.y - (i % 2) * 36 };
        const spell = team === 'blue' && i === 0
          ? (BATTLE_SPELLS.find(s => s.id === spellId) ?? BATTLE_SPELLS[0]).id
          : this.pickSpellFor(role, def.id);
        const hero = this.createHero(def, team, role, spell, spawn.x, spawn.y, team === 'blue' && i === 0);
        return hero;
      });
    };

    this.heroes = [...assign(blueDefs, 'blue', playerLane), ...assign(redDefs, 'red', playerLane)];
    this.player = this.heroes[0];
    this.heroes.forEach(h => (h.runtime.anchorLane = h.laneAssigned));
  }

  private pickSpellFor(role: LaneRole, heroId: string): string {
    if (role === 'jungle') return 'retribution';
    if (role === 'roam') return 'aegis';
    if (['layla', 'miya'].includes(heroId)) return 'inspire';
    if (['saber', 'gusion', 'alucard', 'zilong'].includes(heroId)) return 'execute';
    if (['eudora', 'nana'].includes(heroId)) return 'flicker';
    return 'purify';
  }

  private createHero(
    def: (typeof HEROES)[number], team: Team, role: LaneRole, spellId: string,
    x: number, y: number, isPlayer: boolean
  ): Hero {
    const runtime: HeroRuntime = {
      moveX: 0, moveY: 0, moveOrder: null, attackOrderUid: null, targetUid: null,
      autoAttack: true, priority: 'auto', aiState: 'lane', aiTimer: 0, aiTargetUid: null,
      anchorLane: role, lastAttackerUid: null, lastDamagedTime: -99, comboStep: 0,
      skillPlan: 0, campIndex: Math.floor(Math.random() * 5), recallTimer: 0, regenTimer: 0,
      chatCooldown: 0, stuckTimer: 0, lastPos: { x, y }
    };
    const hero: Hero = {
      utype: 'hero',
      uid: nextUid(),
      defId: def.id,
      name: def.name,
      title: def.title,
      role: def.role,
      portrait: def.portrait,
      team, isPlayer, isBot: !isPlayer,
      x, y, rotation: team === 'blue' ? -Math.PI / 4 : (Math.PI * 3) / 4,
      facing: { x: Math.cos(team === 'blue' ? -Math.PI / 4 : Math.PI * 0.75), y: Math.sin(team === 'blue' ? -Math.PI / 4 : Math.PI * 0.75) },
      hp: def.maxHp, mana: def.maxMana, level: 1, exp: 0, gold: 600,
      kills: 0, deaths: 0, assists: 0, creepScore: 0, jungleKills: 0,
      damageDealtToHeroes: 0, damageDealt: 0, damageTaken: 0, healDone: 0,
      turretDamage: 0, goldEarned: 0, laneAssigned: role,
      skillLevels: [1, 0, 0], skillPoints: 0,
      cooldowns: [0, 0, 0], attackTimer: 0, attackWindup: 0,
      spellId, spellCooldown: 0,
      items: [null, null, null, null, null, null],
      stats: emptyStats(),
      def,
      buffs: {
        blueBuff: 0, redBuff: 0, shield: 0, speedBoost: 0, speedFactor: 1,
        stun: 0, slow: 0, slowFactor: 0, stealth: 0, invulnerable: 0,
        attackSpeedBoost: 0, immunity: 0, suppress: 0
      },
      dead: false, respawnTimer: 0, inBush: inBush(x, y), visibleToEnemy: true, visibleToFriendly: true,
      lastSkillCastTime: 0, passiveStacks: 0, extra: {}, runtime
    };
    this.recalcStats(hero);
    hero.hp = hero.stats.maxHp;
    return hero;
  }

  recalcStats(hero: Hero) {
    const d = hero.def;
    const L = hero.level;
    const s: HeroStats = {
      maxHp: Math.round(d.maxHp * (1 + 0.085 * (L - 1))),
      hpRegen: d.hpRegen * (1 + 0.05 * (L - 1)),
      maxMana: Math.round(d.maxMana * (1 + 0.06 * (L - 1))),
      manaRegen: d.manaRegen * (1 + 0.05 * (L - 1)),
      physAtk: Math.round(d.physAtk * (1 + 0.075 * (L - 1))),
      magicPower: Math.round((d.magicPower || 0) * (1 + 0.09 * (L - 1))),
      physDef: d.physDef + 2 * (L - 1),
      magicDef: d.magicDef + 1.6 * (L - 1),
      attackSpeed: d.attackSpeed,
      moveSpeed: d.moveSpeed,
      attackRange: d.attackRange,
      lifesteal: 0,
      critChance: 0,
      critDamage: 2,
      cooldownReduction: 0,
      penPhysical: 0,
      penMagic: 0
    };
    hero.items.forEach(it => {
      if (!it) return;
      const st = it.stats;
      if (st.physAtk) s.physAtk += st.physAtk;
      if (st.magicPower) s.magicPower += st.magicPower;
      if (st.hp) s.maxHp += st.hp;
      if (st.mana) s.maxMana += st.mana;
      if (st.physDef) s.physDef += st.physDef;
      if (st.magicDef) s.magicDef += st.magicDef;
      if (st.attackSpeed) s.attackSpeed += st.attackSpeed;
      if (st.moveSpeed) s.moveSpeed += st.moveSpeed;
      if (st.lifesteal) s.lifesteal += st.lifesteal;
      if (st.critChance) s.critChance += st.critChance;
      if (st.cooldownReduction) s.cooldownReduction += st.cooldownReduction;
      if (st.hpRegen) s.hpRegen += st.hpRegen;
    });
    // Mage heroes auto-scale magic power into attack damage a little
    if (!s.magicPower && d.role === 'Marksman') s.critChance += 0.05;
    const prevMax = hero.stats.maxHp || s.maxHp;
    hero.stats = s;
    hero.hp = Math.min(s.maxHp, hero.hp + Math.max(0, s.maxHp - prevMax));
    hero.mana = Math.min(s.maxMana, hero.mana);
  }

  private buildCamps() {
    this.monsters = [];
    createCamps().forEach(c => {
      const side = campTeamSide(c.key) as Team;
      this.campSpecs.push({ ...c, side });
      this.monsters.push(this.makeMonster(c, side));
    });
    // River objectives
    this.monsters.push(this.makeRiverMonster({
      key: 'turtle', name: 'The Turtle', camp: 'turtle', x: TURTLE_PIT.x, y: TURTLE_PIT.y,
      hp: 9000, atk: 210, def: 15, bounty: 220, exp: 320,
      firstSpawn: TUNE.turtleFirstSpawn, respawn: TUNE.turtleRespawn
    }, 'neutral'));
    this.monsters.push(this.makeRiverMonster({
      key: 'lord', name: 'The Lord', camp: 'lord', x: LORD_PIT.x, y: LORD_PIT.y,
      hp: 15000, atk: 300, def: 20, bounty: 300, exp: 420,
      firstSpawn: TUNE.lordFirstSpawn, respawn: TUNE.lordRespawn
    }, 'neutral'));
  }

  private makeMonster(c: CampSpec, side: Team): Monster {
    return {
      utype: 'monster', uid: nextUid(), id: c.key, name: c.name, camp: c.camp, side,
      x: c.x, y: c.y, spawnX: c.x, spawnY: c.y, hp: c.hp, maxHp: c.hp,
      physAtk: c.atk, physDef: c.def, magicDef: c.def, range: 110, speed: 135,
      aggroRadius: 235, leashRadius: 330, attackTimer: 0, targetUid: null, aggroTimer: 0,
      alive: false, respawnTimer: c.firstSpawn, respawnAt: c.firstSpawn,
      firstSpawnAt: c.firstSpawn, bounty: c.bounty, exp: c.exp,
      buffDuration: c.buffDuration ?? 0
    };
  }

  private makeRiverMonster(c: CampSpec, side: Team | 'neutral'): Monster {
    return {
      utype: 'monster', uid: nextUid(), id: c.key, name: c.name, camp: c.camp, side,
      x: c.x, y: c.y, spawnX: c.x, spawnY: c.y, hp: c.hp, maxHp: c.hp,
      physAtk: c.atk, physDef: c.def, magicDef: c.def + 10, range: 150, speed: 120,
      aggroRadius: 300, leashRadius: 520, attackTimer: 0, targetUid: null, aggroTimer: 0,
      alive: false, respawnTimer: c.firstSpawn, respawnAt: c.firstSpawn,
      firstSpawnAt: c.firstSpawn, bounty: c.bounty, exp: c.exp, buffDuration: 0
    };
  }

  // ==========================================================================
  //  Main loop
  // ==========================================================================

  update(dtReal: number) {
    if (this.state !== 'running') return;
    const now = performance.now();
    if (this.lastFrameStamp) {
      const f = 1000 / Math.max(1, now - this.lastFrameStamp);
      this.fps += (f - this.fps) * 0.08;
    }
    this.lastFrameStamp = now;

    this.accum += Math.min(0.25, dtReal);
    const STEP = 1 / 60;
    let steps = 0;
    while (this.accum >= STEP && steps < 6) {
      this.accum -= STEP;
      steps++;
      try {
        this.step(STEP);
        this.errCount = 0;
      } catch (err: any) {
        this.errCount++;
        if (this.errCount % 12 === 1) {
          this.error = `${err?.message ?? err}`;
          // eslint-disable-next-line no-console
          console.error('[engine] recovered from error:', err);
        }
        if (this.errCount > 400) {
          this.state = 'over';
          this.error = `Simulation error: ${err?.message ?? err}`;
        }
      }
    }
    if (this.accum > 0.5) this.accum = 0;
    this.frameCount++;
  }

  private step(dt: number) {
    this.time += dt;
    this.rebuildIndex();
    this.tickTimers(dt);
    this.tickSpawns();
    this.tickHeroes(dt);
    this.tickMinions(dt);
    this.tickMonsters(dt);
    this.tickTurrets(dt);
    this.tickProjectiles(dt);
    this.tickEffects(dt);
    this.tickVision();
    this.tickCamera(dt);
    this.tickObjectives(dt);
  }

  private uidIndex = new Map<number, Unit>();

  private rebuildIndex() {
    this.uidIndex.clear();
    for (const h of this.heroes) this.uidIndex.set(h.uid, h);
    for (const m of this.minions) this.uidIndex.set(m.uid, m);
    for (const t of this.turrets) this.uidIndex.set(t.uid, t);
    for (const mo of this.monsters) this.uidIndex.set(mo.uid, mo);
  }

  private tickTimers(dt: number) {
    // passive gold for everyone (like MLBB's automatic income)
    this.heroes.forEach(h => {
      if (h.dead) return;
      h.gold += TUNE.passiveGoldPerSec * dt;
      h.goldEarned += TUNE.passiveGoldPerSec * dt;
    });

    // decay hero buffs
    this.heroes.forEach(h => {
      const b = h.buffs;
      (['blueBuff', 'redBuff', 'shield', 'speedBoost', 'stun', 'slow', 'stealth',
        'invulnerable', 'attackSpeedBoost', 'immunity', 'suppress'] as const).forEach(k => {
        if (b[k] > 0) b[k] = Math.max(0, b[k] - dt);
      });
      if (b.speedBoost <= 0) b.speedFactor = 1;
      if (b.slow <= 0) b.slowFactor = 0;
      if (b.attackSpeedBoost <= 0) h.passiveStacks = Math.min(h.passiveStacks, 5);
      if (h.timedFlags) {
        Object.keys(h.timedFlags).forEach(k => {
          h.timedFlags![k] -= dt;
          if (h.timedFlags![k] <= 0) {
            delete h.timedFlags![k];
            if (k === 'alucadLs') h.lifestealBonus = 0;
            if (k === 'laylaRange') h.extra!.laylaRange = 1;
            if (k === 'recall') h.runtime.recallTimer = 0;
          }
        });
      }
      h.cooldowns[0] = Math.max(0, h.cooldowns[0] - dt);
      h.cooldowns[1] = Math.max(0, h.cooldowns[1] - dt);
      h.cooldowns[2] = Math.max(0, h.cooldowns[2] - dt);
      h.attackTimer = Math.max(0, h.attackTimer - dt);
      h.attackWindup = Math.max(0, h.attackWindup - dt);
      h.spellCooldown = Math.max(0, h.spellCooldown - dt);
    });

    // pings fade
    for (let i = this.pings.length - 1; i >= 0; i--) {
      this.pings[i].life -= dt;
      if (this.pings[i].life <= 0) this.pings.splice(i, 1);
    }
    for (let i = this.killFeed.length - 1; i >= 0; i--) {
      if (this.time - this.killFeed[i].time > 9) this.killFeed.splice(i, 1);
    }
    if (this.lordTeam && this.time > this.lordExpiry) this.lordTeam = null;
  }

  private tickSpawns() {
    if (this.time < this.nextWaveAt) return;
    this.nextWaveAt += TUNE.minionWaveInterval;
    this.waveNumber++;
    LANES.forEach(lane => {
      (['blue', 'red'] as Team[]).forEach(team => this.spawnWave(lane, team));
    });
  }

  private spawnWave(lane: Lane, team: Team) {
    const scale = 1 + TUNE.creepScalePerMin * (this.time / 60);
    const start = laneSpawn(lane, team);
    const kinds: MinionKind[] = ['melee', 'melee', 'ranged', 'ranged', 'melee', 'ranged'];
    if (this.waveNumber % 3 === 0) kinds.push('siege');
    // super minions once the enemy base turret in this lane is gone
    const enemyBaseDown = this.turrets.some(t => t.team !== team && t.lane === lane && t.tier === 3 && t.destroyed);
    if (enemyBaseDown && TUNE.superMinionAfterInhib) kinds.unshift('super', 'super');

    kinds.forEach((kind, i) => {
      const angle = (i / kinds.length) * Math.PI * 2;
      const ox = Math.cos(angle) * 34;
      const oy = Math.sin(angle) * 34;
      const m = this.makeMinion(kind, lane, team, start.x + ox, start.y + oy, scale);
      this.minions.push(m);
    });
    // hard cap for performance
    if (this.minions.length > 260) this.minions.splice(0, this.minions.length - 260);
  }

  private makeMinion(kind: MinionKind, lane: Lane, team: Team, x: number, y: number, scale: number): Minion {
    const base = {
      melee: { hp: 460, atk: 26, def: 4, range: 78, speed: 112, bounty: 32, exp: 34 },
      ranged: { hp: 300, atk: 34, def: 2, range: 250, speed: 112, bounty: 29, exp: 30 },
      siege: { hp: 980, atk: 62, def: 8, range: 300, speed: 106, bounty: 46, exp: 44 },
      super: { hp: 2400, atk: 120, def: 14, range: 96, speed: 116, bounty: 74, exp: 76 },
      lord: { hp: 8200, atk: 300, def: 26, range: 130, speed: 100, bounty: 180, exp: 160 }
    }[kind];
    return {
      utype: 'minion', uid: nextUid(), team, lane, kind,
      x, y, hp: Math.round(base.hp * scale), maxHp: Math.round(base.hp * scale),
      physAtk: Math.round(base.atk * scale), physDef: base.def, magicDef: base.def,
      range: base.range, speed: base.speed, attackTimer: Math.random() * 0.5,
      attackWindup: 0, waypoint: 0, targetUid: null, bounty: base.bounty, exp: base.exp,
      spawnWave: this.waveNumber, aggroTimer: 0
    };
  }

  private tickCamera(dt: number) {
    const p = this.player;
    if (!p) return;
    const k = Math.min(1, dt * 9);
    this.camera.x += (p.x - this.camera.x) * k;
    this.camera.y += (p.y - this.camera.y) * k;
    if (this.camera.shake > 0) this.camera.shake = Math.max(0, this.camera.shake - dt * 3);
  }

  // ==========================================================================
  //  Heroes
  // ==========================================================================

  private tickHeroes(dt: number) {
    for (const h of this.heroes) {
      if (h.dead) {
        h.respawnTimer -= dt;
        if (h.respawnTimer <= 0) this.respawn(h);
        continue;
      }

      // fountain / natural regen
      const f = FOUNTAINS[h.team];
      const distF = Math.hypot(h.x - f.x, h.y - f.y);
      if (distF < f.r) {
        h.hp = Math.min(h.stats.maxHp, h.hp + h.stats.maxHp * TUNE.fountainHealPct * dt);
        h.mana = Math.min(h.stats.maxMana, h.mana + h.stats.maxMana * 0.22 * dt);
      } else {
        h.hp = Math.min(h.stats.maxHp, h.hp + h.stats.hpRegen * dt);
        h.mana = Math.min(h.stats.maxMana, h.mana + h.stats.manaRegen * dt);
      }
      if (h.runtime.regenTimer > 0) {
        h.runtime.regenTimer -= dt;
        h.hp = Math.min(h.stats.maxHp, h.hp + h.stats.maxHp * 0.045 * dt);
      }

      h.inBush = inBush(h.x, h.y);

      // a surrendered / AI-driven player slot is bot-controlled too
      if (h.isBot) updateBot(this, h, dt);
      else this.drivePlayer(h, dt);

      // movement / attack resolution
      this.resolveHeroMotion(h, dt);
      this.tryAutoAttack(h);

      // recall channel
      if (h.runtime.recallTimer > 0) {
        h.runtime.recallTimer += dt;
        if (h.runtime.recallTimer >= TUNE.recallTime) {
          h.runtime.recallTimer = 0;
          h.x = f.x; h.y = f.y;
          h.hp = h.stats.maxHp; h.mana = h.stats.maxMana;
          this.addEffect({ type: 'ring', x: h.x, y: h.y, radius: 110, color: '#60a5fa', life: 0.6, maxLife: 0.6 });
          this.addFloater('RECALLED', h.x, h.y - 40, '#93c5fd');
        }
      }
    }
  }

  private drivePlayer(h: Hero, _dt: number) {
    // player movement is applied in resolveHeroMotion from runtime.moveX/moveY
    // or the move order. Nothing else to do here.
    void h;
  }

  private resolveHeroMotion(h: Hero, dt: number) {
    const rt = h.runtime;
    if (h.buffs.stun > 0 || h.buffs.suppress > 0) {
      rt.moveX = 0; rt.moveY = 0;
      return;
    }
    let dx = rt.moveX;
    let dy = rt.moveY;
    const manual = Math.hypot(dx, dy) > 0.05;
    if (manual) rt.moveOrder = null;

    if (!manual) {
      // follow an order
      let tx: number | null = null;
      let ty: number | null = null;
      if (rt.attackOrderUid !== null) {
        const t = this.unitByUid(rt.attackOrderUid);
        if (t && this.isAlive(t)) { tx = t.x; ty = t.y; }
        else rt.attackOrderUid = null;
      } else if (rt.moveOrder) {
        tx = rt.moveOrder.x; ty = rt.moveOrder.y;
      }
      if (tx !== null && ty !== null) {
        const d = Math.hypot(tx - h.x, ty - h.y);
        const stopAt = rt.attackOrderUid !== null
          ? Math.max(h.stats.attackRange * 0.82, 40)
          : 14;
        if (d > stopAt) {
          const s = steer(h.x, h.y, tx, ty, 20);
          dx = s.x; dy = s.y;
        } else {
          rt.moveOrder = null;
          dx = 0; dy = 0;
        }
      }
    }

    const mag = Math.hypot(dx, dy);
    if (mag > 0.02) {
      const speed = this.moveSpeed(h);
      const nx = h.x + (dx / mag) * speed * dt;
      const ny = h.y + (dy / mag) * speed * dt;
      this.moveUnit(h, nx, ny);
      h.rotation = Math.atan2(dy, dx);
      h.facing = { x: dx / mag, y: dy / mag };
      if (rt.recallTimer > 0 && manual) {
        rt.recallTimer = 0;
        this.addFloater('recall cancelled', h.x, h.y - 40, '#fca5a5');
      }
    }
  }

  moveSpeed(h: Hero): number {
    let s = h.stats.moveSpeed;
    if (h.buffs.speedBoost > 0) s *= h.buffs.speedFactor || 1.15;
    if (h.buffs.slow > 0) s *= Math.max(0.35, 1 - h.buffs.slowFactor);
    if (inRiver(h.x, h.y)) s *= 1.08;
    if (h.buffs.blueBuff > 0) s *= 1.04;
    return s;
  }

  /** Move with wall clamping. Returns true if the unit actually moved. */
  moveUnit(u: { x: number; y: number; radius?: number }, x: number, y: number, radius = 20): boolean {
    const nx = Math.max(MAP_MARGIN, Math.min(MAP_W - MAP_MARGIN, x));
    const ny = Math.max(MAP_MARGIN, Math.min(MAP_H - MAP_MARGIN, y));
    let okX = true, okY = true;
    if (pointInWall(nx, u.y, radius * 0.7)) okX = false;
    if (pointInWall(u.x, ny, radius * 0.7)) okY = false;
    if (!isWalkable(nx, ny, radius * 0.7) && okX && okY) { okX = false; okY = false; }
    const before = Math.hypot(u.x - nx, u.y - ny);
    if (okX) u.x = nx;
    if (okY) u.y = ny;
    if (!okX && !okY) {
      // fully stuck: nudge toward the map centre to escape geometry
      u.x += Math.sign(MAP_W / 2 - u.x) * 1.2;
      u.y += Math.sign(MAP_H / 2 - u.y) * 1.2;
    }
    return before > 0.01;
  }

  walkToSafe(h: Hero, dir: { x: number; y: number }, dist: number) {
    let best = { x: h.x, y: h.y };
    for (let step = dist; step >= 60; step -= 45) {
      const tx = h.x + dir.x * step;
      const ty = h.y + dir.y * step;
      if (isWalkable(tx, ty, 22)) { best = { x: tx, y: ty }; break; }
    }
    h.x = Math.max(MAP_MARGIN, Math.min(MAP_W - MAP_MARGIN, best.x));
    h.y = Math.max(MAP_MARGIN, Math.min(MAP_H - MAP_MARGIN, best.y));
    return best;
  }

  // ---- auto attacks -------------------------------------------------------

  private tryAutoAttack(h: Hero) {
    if (h.dead || !h.runtime.autoAttack) return;
    if (h.buffs.stun > 0 || h.buffs.suppress > 0) return;
    if (h.attackTimer > 0) return;

    let target = h.runtime.attackOrderUid !== null ? this.unitByUid(h.runtime.attackOrderUid) : null;
    if (target && !this.isAlive(target)) { target = null; h.runtime.attackOrderUid = null; }
    if (!target) target = this.pickAttackTarget(h);
    if (!target) return;
    this.basicAttack(h, target);
  }

  attackRange(h: Hero): number {
    let r = h.stats.attackRange;
    if (h.extra?.laylaRange > 1) r *= 1.18;
    return r;
  }

  pickAttackTarget(h: Hero): Unit | null {
    const range = this.attackRange(h);
    const pref = h.runtime.priority;
    const cands: { u: Unit; d: number }[] = [];
    const push = (u: Unit, d: number) => cands.push({ u, d });

    for (const e of this.heroes) {
      if (e.team === h.team || e.dead) continue;
      if (this.sees(h, e.x, e.y)) {
        const d = Math.hypot(e.x - h.x, e.y - h.y);
        if (d <= range) push(e, d + (e.hp / e.stats.maxHp) * 45 - (pref === 'hero' ? 500 : 0));
      }
    }
    for (const m of this.minions) {
      if (m.team === h.team || m.hp <= 0) continue;
      const d = Math.hypot(m.x - h.x, m.y - h.y);
      if (d <= range) push(m, d + 90 + (pref === 'minion' ? -400 : 0));
    }
    for (const t of this.turrets) {
      if (t.team === h.team || t.destroyed) continue;
      const d = Math.hypot(t.x - h.x, t.y - h.y);
      if (d <= range) push(t, d + 160 + (pref === 'turret' ? -500 : 0));
    }
    if (!cands.length || pref === 'auto') {
      for (const mo of this.monsters) {
        if (!mo.alive) continue;
        const d = Math.hypot(mo.x - h.x, mo.y - h.y);
        if (d <= range + 16) push(mo, d + 40 + (h.laneAssigned === 'jungle' ? -600 : 0));
      }
    }
    if (!cands.length) return null;
    cands.sort((a, b) => a.d - b.d);
    return cands[0].u;
  }

  basicAttack(attacker: Hero, target: Unit) {
    attacker.attackTimer = 1 / Math.max(0.35, attacker.stats.attackSpeed * (attacker.buffs.attackSpeedBoost > 0 ? 1.55 : 1));
    attacker.attackWindup = 0.12;
    attacker.runtime.recallTimer = 0;
    attacker.rotation = Math.atan2(target.y - attacker.y, target.x - attacker.x);
    attacker.facing = { x: Math.cos(attacker.rotation), y: Math.sin(attacker.rotation) };

    let dmg = attacker.stats.physAtk;
    if (attacker.def.role === 'Mage') dmg = attacker.stats.physAtk * 0.4 + attacker.stats.magicPower * 0.35;

    // distance scaling passive (Layla)
    const dist = Math.hypot(target.x - attacker.x, target.y - attacker.y);
    if (attacker.defId === 'layla') dmg *= 1 + Math.min(0.4, (dist / 320) * 0.4);
    if (attacker.defId === 'miya') attacker.passiveStacks = Math.min(5, attacker.passiveStacks + 1);
    if (attacker.defId === 'alucard') dmg *= 1 + attacker.passiveStacks * 0.04;

    // crit
    let crit = false;
    if (Math.random() < attacker.stats.critChance) {
      crit = true;
      dmg *= attacker.stats.critDamage;
    }
    // red buff
    if (attacker.buffs.redBuff > 0) {
      dmg += 25 + attacker.level * 6;
      if (target.utype === 'hero') {
        target.buffs.slow = 1.4;
        target.buffs.slowFactor = Math.max(target.buffs.slowFactor, 0.2);
      }
    }
    // blade of despair style: execute low HP targets harder
    if (attacker.items.some(it => it?.id === 'blade_of_despair') && target.hp / maxHpOf(target) < 0.5) dmg *= 1.25;

    const type: DamageType = attacker.def.role === 'Mage' ? 'magic' : 'physical';
    const ranged = attacker.stats.attackRange > 175;

    if (ranged) {
      this.projectiles.push({
        uid: nextUid(), sourceUid: attacker.uid, sourceTeam: attacker.team, sourceKind: 'hero',
        targetUid: target.uid, x: attacker.x, y: attacker.y, vx: 0, vy: 0,
        speed: 780, maxDist: this.attackRange(attacker) + 120, traveled: 0,
        damage: dmg, damageType: type, color: crit ? '#fde68a' : attacker.team === 'blue' ? '#7dd3fc' : '#fca5a5',
        radius: crit ? 9 : 6, size: crit ? 2 : 1
      });
    } else {
      this.damage(attacker, target, dmg, type, { source: 'attack' });
      this.addEffect({ type: 'slash', x: target.x, y: target.y, radius: 42, color: '#e2e8f0', life: 0.22, maxLife: 0.22 });
    }
    if (attacker.isPlayer || dist < 700) {
      soundManager.playAttackSound(attacker.def.role === 'Marksman' ? (attacker.defId === 'layla' ? 'gun' : 'arrow') : attacker.def.role === 'Mage' ? 'magic' : 'slash');
    }
    if (attacker.defId === 'miya' && attacker.extra?.miyaSplit && attacker.runtime.priority !== 'turret') {
      // split arrows: bonus hits on nearby enemies
      const near = this.heroesInRange(attacker.team === 'blue' ? 'red' : 'blue', target.x, target.y, 190, true);
      near.filter(n => n.uid !== target.uid).slice(0, 2).forEach(n => this.damage(attacker, n, dmg * 0.35, 'physical', { source: 'attack' }));
    }
  }

  // ==========================================================================
  //  Skills, spells, items
  // ==========================================================================

  canCastSkill(h: Hero, i: number): { ok: boolean; reason?: string } {
    if (h.dead) return { ok: false, reason: 'You are dead' };
    if (h.buffs.stun > 0 || h.buffs.suppress > 0) return { ok: false, reason: 'Crowd controlled' };
    const skill = h.def.skills[i];
    if (h.skillLevels[i] <= 0) return { ok: false, reason: 'Skill not learned' };
    if (h.cooldowns[i] > 0) return { ok: false, reason: 'On cooldown' };
    if (h.mana < skill.manaCost) return { ok: false, reason: 'Not enough mana' };
    return { ok: true };
  }

  castSkill(h: Hero, index: 0 | 1 | 2, angle?: number, targetUid?: number | null): boolean {
    const check = this.canCastSkill(h, index);
    if (!check.ok) {
      if (h.isPlayer) this.addFloater(check.reason!, h.x, h.y - 46, '#fca5a5');
      return false;
    }
    const skill = h.def.skills[index];
    let aim = angle ?? h.rotation;
    let target: Hero | null = null;

    if (targetUid) target = this.heroes.find(x => x.uid === targetUid) ?? null;
    if (!target && (skill.targetType === 'lock' || skill.targetType === 'area' || skill.targetType === 'skillshot')) {
      target = this.closestEnemyHero(h, skill.range || 420);
    }
    if (!target && skill.targetType !== 'self' && skill.targetType !== 'buff') {
      // aim at the frontmost enemy minion for waveclear if nothing else
      const m = this.closestEnemyMinion(h, (skill.range || 300));
      if (m) { aim = Math.atan2(m.y - h.y, m.x - h.x); }
    }
    if (skill.targetType === 'lock' && !target) {
      if (h.isPlayer) this.addFloater('No target in range', h.x, h.y - 46, '#fca5a5');
      return false;
    }
    if (target && (skill.targetType === 'lock' || skill.targetType === 'direction')) {
      aim = Math.atan2(target.y - h.y, target.x - h.x);
    }

    h.mana -= skill.manaCost;
    const cdr = Math.min(0.4, h.stats.cooldownReduction + (h.buffs.blueBuff > 0 ? 0.1 : 0));
    h.cooldowns[index] = skill.cooldown * (1 - cdr);
    h.lastSkillCastTime = this.time;
    h.rotation = aim;
    h.facing = { x: Math.cos(aim), y: Math.sin(aim) };
    soundManager.playSkillSound(h.defId, !!skill.isUltimate);
    castHeroSkill(this, h, index, aim, target);
    this.dirty();
    return true;
  }

  castSpell(h: Hero): boolean {
    if (h.dead || h.spellCooldown > 0 || h.buffs.stun > 0) return false;
    const spell = BATTLE_SPELLS.find(s => s.id === h.spellId) ?? BATTLE_SPELLS[0];
    h.spellCooldown = spell.cooldown;
    const dir = h.facing;
    switch (spell.id) {
      case 'flicker': {
        const d = 260;
        const tx = h.x + dir.x * d, ty = h.y + dir.y * d;
        if (isWalkable(tx, ty, 24)) { h.x = tx; h.y = ty; }
        this.addEffect({ type: 'burst', x: h.x, y: h.y, radius: 80, color: '#f59e0b', life: 0.35, maxLife: 0.35 });
        break;
      }
      case 'execute': {
        const t = this.closestEnemyHero(h, 300);
        if (t) {
          const dmg = 180 + h.level * 22 + (t.stats.maxHp - t.hp) * 0.13;
          this.damage(h, t, dmg, 'true', { source: 'spell' });
          this.addEffect({ type: 'slash', x: t.x, y: t.y, radius: 70, color: '#ffffff', life: 0.3, maxLife: 0.3 });
        }
        break;
      }
      case 'retribution': {
        const m = this.monsters.find(mm => mm.alive && mm.hp < mm.maxHp && Math.hypot(mm.x - h.x, mm.y - h.y) < 320);
        if (m) {
          const dmg = 480 + h.level * 90;
          this.damage(h, m, dmg, 'true', { source: 'spell' });
          this.addEffect({ type: 'burst', x: m.x, y: m.y, radius: 60, color: '#fbbf24', life: 0.3, maxLife: 0.3 });
        }
        break;
      }
      case 'purify': {
        h.buffs.stun = 0; h.buffs.slow = 0; h.buffs.suppress = 0;
        h.buffs.speedBoost = 1.2; h.buffs.speedFactor = 1.2;
        this.addEffect({ type: 'ring', x: h.x, y: h.y, radius: 80, color: '#4ade80', life: 0.35, maxLife: 0.35 });
        break;
      }
      case 'flameshot': {
        this.projectiles.push({
          uid: nextUid(), sourceUid: h.uid, sourceTeam: h.team, sourceKind: 'hero', targetUid: null,
          x: h.x, y: h.y, vx: dir.x, vy: dir.y, speed: 820, maxDist: 620, traveled: 0,
          damage: 320 + h.level * 45, damageType: 'magic', color: '#f97316', radius: 13, effect: 'slow', ccDuration: 1
        });
        break;
      }
      case 'aegis': {
        h.buffs.shield = Math.max(h.buffs.shield, 500 + h.level * 90);
        h.buffs.immunity = Math.max(h.buffs.immunity, 0.4);
        this.addEffect({ type: 'ring', x: h.x, y: h.y, radius: 100, color: '#38bdf8', life: 0.5, maxLife: 0.5 });
        break;
      }
      case 'sprint': {
        h.buffs.speedBoost = 6; h.buffs.speedFactor = 1.45; h.buffs.slow = 0;
        this.addEffect({ type: 'ring', x: h.x, y: h.y, radius: 70, color: '#a3e635', life: 0.4, maxLife: 0.4 });
        break;
      }
      case 'inspire': {
        h.buffs.attackSpeedBoost = 5;
        h.stats.attackSpeed += 0; // handled via buff multiplier
        this.addEffect({ type: 'ring', x: h.x, y: h.y, radius: 80, color: '#fbbf24', life: 0.4, maxLife: 0.4 });
        break;
      }
    }
    this.dirty();
    return true;
  }

  recall(h: Hero) {
    if (h.dead) return;
    if (h.runtime.recallTimer > 0) { h.runtime.recallTimer = 0; return; }
    h.runtime.recallTimer = 0.01;
    this.addFloater('Recalling...', h.x, h.y - 44, '#93c5fd');
  }

  regen(h: Hero) {
    if (h.dead || h.runtime.regenTimer > 0) return;
    h.runtime.regenTimer = 6;
    this.addFloater('Regenerate', h.x, h.y - 44, '#86efac');
  }

  learnSkill(h: Hero, i: number): boolean {
    if (h.skillPoints <= 0) return false;
    if (i === 2) {
      const cap = h.level >= 12 ? 3 : h.level >= 8 ? 2 : h.level >= 4 ? 1 : 0;
      if (h.skillLevels[2] >= cap) return false;
    } else if (h.skillLevels[i] >= 6) return false;
    h.skillLevels[i] += 1;
    h.skillPoints -= 1;
    soundManager.playLevelUp();
    this.dirty();
    return true;
  }

  buyItem(h: Hero, itemId: string): boolean {
    const item = ITEMS.find(i => i.id === itemId);
    if (!item) return false;
    const slot = h.items.findIndex(s => s === null);
    if (slot === -1) return false;
    if (h.gold < item.cost) return false;
    h.gold -= item.cost;
    h.items[slot] = item;
    this.recalcStats(h);
    soundManager.playGoldSound();
    this.dirty();
    return true;
  }

  sellItem(h: Hero, slot: number) {
    const it = h.items[slot];
    if (!it) return;
    h.items[slot] = null;
    h.gold += Math.round(it.cost * 0.7);
    this.recalcStats(h);
    this.dirty();
  }

  autoBuy(h: Hero) {
    if (h.items.every(s => s !== null)) return;
    h.extra = h.extra ?? {};
    if (this.time < (h.extra.nextBuyCheck ?? 0)) return;
    h.extra.nextBuyCheck = this.time + 2.5;
    const build = this.buildOrder(h);
    for (const id of build) {
      if (h.items.some(s => s?.id === id)) continue;
      const item = ITEMS.find(i => i.id === id);
      if (!item) continue;
      if (h.gold >= item.cost) { this.buyItem(h, id); return; }
      if (item.cost > h.gold + 350) {
        // buy the cheapest affordable component instead
        const cheap = ITEMS
          .filter(i => !h.items.some(s => s?.id === i.id) && h.gold >= i.cost && this.buildFits(h, i))
          .sort((a, b) => b.cost - a.cost)[0];
        if (cheap) this.buyItem(h, cheap.id);
        return;
      }
    }
  }

  private buildFits(h: Hero, i: Item): boolean {
    switch (h.role) {
      case 'Marksman': case 'Assassin': case 'Fighter': return i.category === 'attack' || i.category === 'movement';
      case 'Mage': return i.category === 'magic' || i.category === 'movement';
      case 'Tank': case 'Support': return i.category === 'defense' || i.category === 'movement';
      default: return true;
    }
  }

  buildOrder(h: Hero): string[] {
    const boots = h.role === 'Mage' ? 'magic_shoes' : h.role === 'Marksman' ? 'swift_boots' : h.role === 'Tank' || h.role === 'Support' ? 'tough_boots' : 'warrior_boots';
    switch (h.role) {
      case 'Marksman': return [boots, 'berserkers_fury', 'windtalker', 'malefic_roar', 'haas_claws', 'blade_of_despair'];
      case 'Mage': return [boots, 'lightning_truncheon', 'holy_crystal', 'glowing_wand', 'concentrated_energy', 'blood_wings'];
      case 'Assassin': return [boots, 'blade_of_despair', 'malefic_roar', 'berserkers_fury', 'haas_claws', 'windtalker'];
      case 'Fighter': return [boots, 'haas_claws', 'demon_hunter_sword', 'antique_cuirass', 'immortality', 'blade_of_despair'];
      case 'Tank': return [boots, 'antique_cuirass', 'athenas_shield', 'dominance_ice', 'immortality', 'blade_armor'];
      default: return [boots, 'athenas_shield', 'dominance_ice', 'antique_cuirass', 'immortality', 'glowing_wand'];
    }
  }

  // ==========================================================================
  //  Minions
  // ==========================================================================

  private tickMinions(dt: number) {
    const dead: number[] = [];
    for (const m of this.minions) {
      if (m.hp <= 0) { dead.push(m.uid); continue; }
      m.attackTimer = Math.max(0, m.attackTimer - dt);
      m.attackWindup = Math.max(0, m.attackWindup - dt);
      m.aggroTimer = Math.max(0, m.aggroTimer - dt);

      const path = lanePath(m.lane === 'base' ? 'mid' : m.lane, m.team);
      let target: Unit | null = null;
      if (m.targetUid !== null) {
        const t = this.unitByUid(m.targetUid);
        if (t && this.isAlive(t)) {
          // drop the target if it ran too far away
          if (Math.hypot(t.x - m.x, t.y - m.y) < 640) target = t;
          else m.targetUid = null;
        } else {
          m.targetUid = null;
        }
      }
      if (!target) target = this.acquireMinionTarget(m);
      if (target) m.targetUid = (target as any).uid;

      if (target) {
        const d = Math.hypot(target.x - m.x, target.y - m.y);
        if (d <= m.range * 0.92) {
          if (m.attackTimer <= 0) {
            m.attackTimer = 1.15;
            m.attackWindup = 0.18;
            if (m.range > 150) {
              this.projectiles.push({
                uid: nextUid(), sourceUid: m.uid, sourceTeam: m.team, sourceKind: 'minion',
                targetUid: target.uid, x: m.x, y: m.y, vx: 0, vy: 0, speed: 480,
                maxDist: m.range + 160, traveled: 0, damage: m.physAtk, damageType: m.kind === 'ranged' ? 'physical' : 'physical',
                color: m.team === 'blue' ? '#93c5fd' : '#fca5a5', radius: m.kind === 'siege' ? 8 : 5
              });
            } else {
              this.damage(null, target, m.physAtk, 'physical', { source: 'minion' });
              this.addEffect({ type: 'hit', x: target.x, y: target.y, radius: 26, color: '#f1f5f9', life: 0.18, maxLife: 0.18 });
            }
          }
        } else {
          const s = steer(m.x, m.y, target.x, target.y, 14);
          this.moveUnit(m, m.x + s.x * m.speed * dt, m.y + s.y * m.speed * dt, 13);
        }
        continue;
      }

      // walk the lane
      const wp = path[Math.min(m.waypoint, path.length - 1)];
      const dWp = Math.hypot(wp.x - m.x, wp.y - m.y);
      if (dWp < 46) m.waypoint = Math.min(path.length - 1, m.waypoint + 1);
      const goal = path[Math.min(m.waypoint, path.length - 1)];
      const s = steer(m.x, m.y, goal.x, goal.y, 14);
      this.moveUnit(m, m.x + s.x * m.speed * dt, m.y + s.y * m.speed * dt, 13);
    }
    if (dead.length) {
      const set = new Set(dead);
      this.minions = this.minions.filter(m => !set.has(m.uid));
    }
  }

  private acquireMinionTarget(m: Minion): Unit | null {
    const sight = 330;
    let best: Unit | null = null;
    let bestScore = Infinity;

    // 1) enemies attacking our own team's heroes/minions nearby
    for (const e of this.minions) {
      if (e.team === m.team || e.hp <= 0) continue;
      const d = Math.hypot(e.x - m.x, e.y - m.y);
      if (d < sight) { const s = d + (e.kind === 'ranged' ? -30 : 0); if (s < bestScore) { bestScore = s; best = e; } }
    }
    // 2) enemy turret in range
    for (const t of this.turrets) {
      if (t.team === m.team || t.destroyed || !this.turretVulnerable(t)) continue;
      const d = Math.hypot(t.x - m.x, t.y - m.y);
      if (d < sight + 40) { const s = d + 220; if (s < bestScore) { bestScore = s; best = t; } }
    }
    // 3) enemy hero if close
    for (const h of this.heroes) {
      if (h.team === m.team || h.dead) continue;
      const engaging = h.runtime.lastDamagedTime > this.time - 2;
      const d = Math.hypot(h.x - m.x, h.y - m.y);
      if (d < (engaging ? sight + 60 : sight - 90)) {
        const s = d + 60;
        if (s < bestScore) { bestScore = s; best = h; }
      }
    }
    return best;
  }

  // ==========================================================================
  //  Turrets
  // ==========================================================================

  /** A turret can be damaged only once the previous one in its lane has fallen. */
  turretVulnerable(t: Turret): boolean {
    if (t.destroyed) return false;
    if (t.tier === 1) return true;
    if (t.tier === 2) return this.turrets.some(x => x.team === t.team && x.lane === t.lane && x.tier === 1 && x.destroyed);
    if (t.tier === 3) return this.turrets.some(x => x.team === t.team && x.lane === t.lane && x.tier === 2 && x.destroyed);
    if (t.tier === 4) return this.turrets.some(x => x.team === t.team && x.tier === 3 && x.destroyed);
    // core
    return this.turrets.filter(x => x.team === t.team && x.tier === 4 && x.destroyed).length >= 1
      && !this.turrets.some(x => x.team === t.team && x.tier === 4 && !x.destroyed
        && Math.hypot(x.x - t.x, x.y - t.y) < 10);
  }

  coreExposed(team: Team): boolean {
    const core = this.turrets.find(t => t.team === team && t.tier === 5)!;
    return this.turretVulnerable(core);
  }

  private tickTurrets(dt: number) {
    for (const t of this.turrets) {
      if (t.destroyed) continue;
      t.attackTimer = Math.max(0, t.attackTimer - dt);
      const inLane = this.turretVulnerable(t);
      if (!inLane) continue;

      // acquire target: minions first, then heroes attacking our heroes near us
      let target: Unit | null = t.targetUid !== null ? this.unitByUid(t.targetUid) : null;
      if (target && (!this.isAlive(target) || Math.hypot(target.x - t.x, target.y - t.y) > t.range + 90)) {
        target = null;
        t.ramp = 0;
      }
      if (!target) {
        let best: Unit | null = null;
        let bestD = Infinity;
        for (const m of this.minions) {
          if (m.team === t.team || m.hp <= 0) continue;
          const d = Math.hypot(m.x - t.x, m.y - t.y);
          if (d <= t.range && d < bestD) { bestD = d; best = m; }
        }
        if (!best) {
          for (const h of this.heroes) {
            if (h.team === t.team || h.dead) continue;
            const d = Math.hypot(h.x - t.x, h.y - t.y);
            const aggressive = h.runtime.lastAttackerUid !== null || h.runtime.lastDamagedTime > this.time - 2;
            if (d <= t.range && (aggressive || d <= t.range * 0.8) && d < bestD) { bestD = d; best = h; }
          }
        }
        if (best && best.utype === 'hero' && best.team !== t.team) {
          // dive protection: attacking an ally hero under a turret pulls aggro
        }
        target = best;
        t.ramp = 0;
      }
      t.targetUid = target ? (target as any).uid : null;

      if (target && t.attackTimer <= 0) {
        t.attackTimer = 1 / t.attackSpeed;
        t.ramp = Math.min(3, t.ramp + 0.34);
        const dmg = t.damage * (1 + t.ramp * 0.35);
        if (target.uid === this.player.uid && Math.hypot(target.x - t.x, target.y - t.y) < t.range) {
          soundManager.playTurretWarning();
        }
        soundManager.playTurretShot();
        this.projectiles.push({
          uid: nextUid(), sourceUid: t.uid, sourceTeam: t.team, sourceKind: 'turret',
          targetUid: (target as any).uid, x: t.x, y: t.y, vx: 0, vy: 0, speed: 560,
          maxDist: t.range + 140, traveled: 0, damage: dmg, damageType: 'physical',
          color: t.team === 'blue' ? '#38bdf8' : '#f87171', radius: 11, isTurretShot: true
        });
      }
    }
  }

  // ==========================================================================
  //  Jungle monsters & objectives
  // ==========================================================================

  private tickMonsters(dt: number) {
    for (const m of this.monsters) {
      if (!m.alive) {
        m.respawnTimer -= dt;
        if (m.respawnTimer <= 0) {
          m.alive = true;
          m.hp = m.maxHp;
          m.x = m.spawnX; m.y = m.spawnY;
          this.dirty();
        }
        continue;
      }
      m.attackTimer = Math.max(0, m.attackTimer - dt);
      m.aggroTimer = Math.max(0, m.aggroTimer - dt);

      let target: Hero | null = null;
      if (m.targetUid !== null) {
        const t = this.heroes.find(h => h.uid === m.targetUid && !h.dead);
        if (t && Math.hypot(t.x - m.x, t.y - m.y) < m.leashRadius + 220) target = t;
        else m.targetUid = null;
      }
      if (!target) {
        // aggro only when attacked recently or when someone stands right on top
        const provoked = m.aggroTimer > 0;
        let bestD = provoked ? m.aggroRadius : 150;
        for (const h of this.heroes) {
          if (h.dead) continue;
          const d = Math.hypot(h.x - m.x, h.y - m.y);
          if (d < bestD) { bestD = d; target = h; }
        }
        if (target) m.targetUid = target.uid;
      }

      if (target) {
        const d = Math.hypot(target.x - m.x, target.y - m.y);
        const homeDist = Math.hypot(m.spawnX - m.x, m.spawnY - m.y);
        if (homeDist > m.leashRadius) {
          // leash back and heal
          m.targetUid = null;
          const s = steer(m.x, m.y, m.spawnX, m.spawnY, 18);
          this.moveUnit(m, m.x + s.x * m.speed * 1.7 * dt, m.y + s.y * m.speed * 1.7 * dt, 18);
          m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.18 * dt);
        } else if (d > m.range * 0.9) {
          const s = steer(m.x, m.y, target.x, target.y, 18);
          this.moveUnit(m, m.x + s.x * m.speed * dt, m.y + s.y * m.speed * dt, 18);
        } else if (m.attackTimer <= 0) {
          m.attackTimer = 1.35;
          this.damage(null, target, m.physAtk, 'physical', { source: 'monster' });
          this.addEffect({ type: 'hit', x: target.x, y: target.y, radius: 34, color: '#fcd34d', life: 0.22, maxLife: 0.22 });
          if (m.camp === 'turtle' || m.camp === 'lord') {
            this.splashAround(target.x, target.y, 210, 70, 'true', target.team, null);
          }
        }
      } else {
        const homeDist = Math.hypot(m.spawnX - m.x, m.spawnY - m.y);
        if (homeDist > 8) {
          const a = Math.atan2(m.spawnY - m.y, m.spawnX - m.x);
          this.moveUnit(m, m.x + Math.cos(a) * m.speed * dt, m.y + Math.sin(a) * m.speed * dt, 18);
        }
        m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.03 * dt);
      }
    }
  }

  private tickObjectives(_dt: number) {
    for (const m of this.monsters) {
      if (m.camp !== 'turtle' && m.camp !== 'lord') continue;
      if (m.alive) continue;
      const key = `${m.camp}-soon`;
      if (m.respawnTimer > 0 && m.respawnTimer < 10 && this.allowAnnounce(key, 120)) {
        this.announce({
          type: 'info',
          title: `${m.name.toUpperCase()} SPAWNS IN 10s`,
          subtitle: m.camp === 'lord' ? 'Group up for the push' : 'Team gold and shields on the line',
          team: this.player.team, duration: 2.4
        });
        this.chat.system(`${m.name} respawns shortly.`, 'neutral');
      }
    }
    // end-of-match catch up: if a team is massively ahead at 20 min, force a settle
    if (this.time > 1200 && !this.allowAnnounce('overtime', 1e9)) { /* keeps single-fire semantics */ }
  }

  // ==========================================================================
  //  Projectiles
  // ==========================================================================

  spawnSkillProjectile(hero: Hero, o: {
    dir?: { x: number; y: number }; targetUid?: number | null; speed: number; maxDist: number;
    damage: number; damageType: DamageType; radius: number; color: string;
    effect?: Projectile['effect']; ccDuration?: number; aoeRadius?: number; skillId?: string;
  }) {
    this.projectiles.push({
      uid: nextUid(), sourceUid: hero.uid, sourceTeam: hero.team, sourceKind: 'hero',
      targetUid: o.targetUid ?? null, x: hero.x, y: hero.y,
      vx: o.dir?.x ?? 0, vy: o.dir?.y ?? 0, speed: o.speed, maxDist: o.maxDist, traveled: 0,
      damage: o.damage, damageType: o.damageType, color: o.color, radius: o.radius,
      effect: o.effect, ccDuration: o.ccDuration, aoeRadius: o.aoeRadius, skillId: o.skillId
    });
  }

  private tickProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      let hit: Unit | null = null;

      if (p.targetUid !== null && p.targetUid !== undefined) {
        const t = this.unitByUid(p.targetUid);
        if (!t || !this.isAlive(t)) { this.projectiles.splice(i, 1); continue; }
        const step = p.speed * dt;
        const d = Math.hypot(t.x - p.x, t.y - p.y) || 1;
        p.x += ((t.x - p.x) / d) * step;
        p.y += ((t.y - p.y) / d) * step;
        p.traveled += step;
        p.vx = (t.x - p.x) / d; p.vy = (t.y - p.y) / d;
        if (d < 26 + p.radius) hit = t;
        if (p.traveled > p.maxDist * 2.2) { this.projectiles.splice(i, 1); continue; }
      } else {
        const step = p.speed * dt;
        p.x += p.vx * step;
        p.y += p.vy * step;
        p.traveled += step;
        if (p.traveled >= p.maxDist) { this.projectiles.splice(i, 1); continue; }
        // skillshot collision
        if (p.effect === 'hook') {
          for (const h of this.heroes) {
            if (h.team === p.sourceTeam || h.dead) continue;
            if (Math.hypot(h.x - p.x, h.y - p.y) < 34) { hit = h; break; }
          }
        } else {
          const src = this.unitByUid(p.sourceUid);
          const already = p.hitUids ?? [];
          for (const h of this.heroes) {
            if (h.team === p.sourceTeam || h.dead || already.includes(h.uid)) continue;
            if (src && src.utype === 'hero' && !this.sees(src as Hero, h.x, h.y)) continue;
            if (Math.hypot(h.x - p.x, h.y - p.y) < 30 + p.radius) { hit = h; break; }
          }
          if (!hit) {
            for (const m of this.minions) {
              if (m.team === p.sourceTeam || m.hp <= 0 || already.includes(m.uid)) continue;
              if (Math.hypot(m.x - p.x, m.y - p.y) < 20 + p.radius) { hit = m; break; }
            }
          }
          if (!hit) {
            for (const t of this.turrets) {
              if (t.team === p.sourceTeam || t.destroyed || !this.turretVulnerable(t)) continue;
              if (Math.hypot(t.x - p.x, t.y - p.y) < 34 + p.radius) { hit = t; break; }
            }
          }
        }
      }

      if (hit) {
        this.impact(p, hit);
        if (p.effect === 'pierce') {
          p.hitUids = p.hitUids ?? [];
          p.hitUids.push(hit.uid);
          continue;
        }
        this.projectiles.splice(i, 1);
      }
    }
  }

  private impact(p: Projectile, target: Unit) {
    const src = this.unitByUid(p.sourceUid);
    const attacker = src && src.utype === 'hero' ? (src as Hero) : null;

    if (p.effect === 'hook' && attacker && target.utype === 'hero') {
      const t = target as Hero;
      t.buffs.stun = Math.max(t.buffs.stun, p.ccDuration ?? 0.8);
      const d = Math.hypot(t.x - attacker.x, t.y - attacker.y);
      if (d > 90) {
        t.x = attacker.x + (t.x - attacker.x) / d * 88;
        t.y = attacker.y + (t.y - attacker.y) / d * 88;
      }
      this.addFloater('HOOKED!', t.x, t.y - 46, '#f472b6');
    } else if (p.effect === 'stun' && target.utype === 'hero') {
      const t = target as Hero;
      if (t.buffs.immunity <= 0) { t.buffs.stun = Math.max(t.buffs.stun, p.ccDuration ?? 1); this.addFloater('Stunned', t.x, t.y - 46, '#fde68a'); }
    } else if (p.effect === 'slow' && target.utype === 'hero') {
      const t = target as Hero;
      t.buffs.slow = Math.max(t.buffs.slow, p.ccDuration ?? 1.5);
      t.buffs.slowFactor = Math.max(t.buffs.slowFactor, 0.4);
    }

    this.damage(attacker, target, p.damage, p.damageType, { source: p.skillId ?? (p.isTurretShot ? 'turret' : 'proj') });
    if (p.aoeRadius && p.aoeRadius > 0) {
      this.addEffect({ type: 'circle', x: p.x, y: p.y, radius: p.aoeRadius, color: p.color, life: 0.3, maxLife: 0.3 });
      for (const h of this.heroes) {
        if (!attacker || h.team === attacker.team || h.dead) continue;
        if (h.uid !== target.uid && Math.hypot(h.x - p.x, h.y - p.y) <= p.aoeRadius) {
          this.damage(attacker, h, p.damage * 0.55, p.damageType, { source: 'skill' });
        }
      }
      for (const m of this.minions) {
        if (!attacker || m.team === attacker.team || m.hp <= 0) continue;
        if (m.uid !== target.uid && Math.hypot(m.x - p.x, m.y - p.y) <= p.aoeRadius) {
          this.damage(attacker, m, p.damage * 0.4, p.damageType, { source: 'skill' });
        }
      }
    }
    this.addEffect({ type: 'hit', x: p.x, y: p.y, radius: 26, color: p.color, life: 0.2, maxLife: 0.2 });
  }

  // ==========================================================================
  //  Damage pipeline
  // ==========================================================================

  damage(source: Hero | null, target: Unit, rawAmount: number, type: DamageType, opts: { source?: string; pierce?: boolean } = {}) {
    if (!target || rawAmount <= 0) return 0;
    if (target.utype === 'turret' && !this.turretVulnerable(target as Turret)) return 0;

    // invulnerability windows
    if (target.utype === 'hero') {
      const h = target as Hero;
      if (h.buffs.invulnerable > 0 || h.buffs.immunity > 0) {
        this.addFloater('IMMUNE', h.x, h.y - 40, '#e2e8f0');
        return 0;
      }
    }

    let amount = rawAmount;
    if (type !== 'true') {
      const def = Math.max(0, defenseOf(target, type) - (source ? (type === 'physical' ? source.stats.penPhysical : source.stats.penMagic) : 0));
      amount *= DEF_CONSTANT / (DEF_CONSTANT + def);
    }

    // turrets reduce damage when no friendly minions are nearby (anti-dive)
    if (target.utype === 'turret') {
      const t = target as Turret;
      // early turret armour (like MLBB) so outer towers do not melt at 1 min,
      // and late-game fatigue so a stalemated match still resolves
      const armour = this.time < 180 ? 0.4 : this.time < 330 ? 0.55 : this.time < 510 ? 0.72
        : this.time < 840 ? 1 : this.time < 1020 ? 1.35 : 1.8;
      amount *= armour;
      const hasMinion = this.minions.some(m => m.team !== t.team && Math.hypot(m.x - t.x, m.y - t.y) < t.range + 60);
      if (!hasMinion) amount *= 0.45;
      // plates absorb and grant gold
      if (t.plates > 0) {
        const frac = t.hp / t.maxHp;
        const platesLeft = Math.max(0, Math.ceil(frac * t.maxPlates));
        if (platesLeft < t.plates) {
          const lost = t.plates - platesLeft;
          t.plates = platesLeft;
          if (source) {
            source.gold += 110 * lost;
            source.goldEarned += 110 * lost;
            this.addFloater(`+${110 * lost} plate`, t.x, t.y - 54, '#fbbf24');
            soundManager.playGoldSound();
          }
        }
      }
    }

    // shields
    if (target.utype === 'hero' && (target as Hero).buffs.shield > 0) {
      const h = target as Hero;
      const absorb = Math.min(h.buffs.shield, amount);
      h.buffs.shield -= absorb;
      amount -= absorb;
      if (absorb > 0) this.addFloater(`-${Math.round(absorb)} shield`, h.x, h.y - 52, '#7dd3fc');
      if (amount <= 0) return 0;
    }

    amount = Math.max(1, Math.round(amount));

    // difficulty scaling so solo queue against "mythic" bots feels dangerous
    if (source && !source.isPlayer) {
      amount *= this.difficulty === 'mythic' ? 1.18 : this.difficulty === 'easy' ? 0.72 : 1;
    }
    if (source && source.isPlayer) {
      amount *= this.difficulty === 'easy' ? 1.15 : this.difficulty === 'mythic' ? 0.94 : 1;
    }

    if (target.utype === 'monster') (target as Monster).aggroTimer = 5;
    const before = target.hp;
    target.hp -= amount;

    // attacker bookkeeping
    if (source) {
      source.damageDealt += amount;
      if (target.utype === 'hero') source.damageDealtToHeroes += amount;
      if (target.utype === 'turret') source.turretDamage += amount;
      // lifesteal
      const ls = (source.stats.lifesteal || 0) + (source.lifestealBonus || 0);
      if (ls > 0 && type === 'physical' && before > 0) {
        const heal = Math.min(amount * Math.min(0.65, ls), source.stats.maxHp - source.hp);
        if (heal > 1) {
          source.hp += heal;
          source.healDone += heal;
          this.addFloater(`+${Math.round(heal)}`, source.x, source.y - 30, '#4ade80');
        }
      }
      source.runtime.lastDamagedTime = this.time;
    }
    if (target.utype === 'hero') {
      const t = target as Hero;
      t.damageTaken += amount;
      t.runtime.lastAttackerUid = source?.uid ?? null;
      t.runtime.lastDamagedTime = this.time;
      // nana-style passive escape & immortality handled in onHeroHpZero
      if (t.runtime.recallTimer > 0) t.runtime.recallTimer = 0;
      if (t.defId === 'nana' && t.hp <= 0 && !t.timedFlags?.nanaUsed) {
        t.hp = Math.round(t.stats.maxHp * 0.28);
        t.buffs.invulnerable = 1.6;
        t.buffs.speedBoost = 2.5; t.buffs.speedFactor = 1.6;
        t.timedFlags = { ...(t.timedFlags ?? {}), nanaUsed: 22 };
        this.addFloater('Molina saves you!', t.x, t.y - 50, '#f9a8d4');
        return amount;
      }
      if (t.hp <= 0 && t.items.some(it => it?.id === 'immortality') && !(t.timedFlags && t.timedFlags.immCo > 0)) {
        t.hp = Math.round(t.stats.maxHp * 0.16);
        t.buffs.shield = Math.max(t.buffs.shield, t.stats.maxHp * 0.3);
        t.timedFlags = { ...(t.timedFlags ?? {}), immCo: 150 };
        this.addFloater('IMMORTALITY!', t.x, t.y - 50, '#fbbf24');
        return amount;
      }
    }

    // floating combat text (only near the player, for readability)
    const nearPlayer = Math.hypot(target.x - this.player.x, target.y - this.player.y) < 1400;
    if (nearPlayer && !opts.source?.startsWith('tick')) {
      const color = type === 'physical' ? '#f8fafc' : type === 'magic' ? '#c4b5fd' : '#fde68a';
      this.addFloater(`${Math.round(amount)}`, target.x + (Math.random() - 0.5) * 24, target.y - 24, color);
    }

    if (target.hp <= 0) {
      target.hp = 0;
      switch (target.utype) {
        case 'hero': this.onHeroKilled(target as Hero, source); break;
        case 'minion': this.onMinionKilled(target as Minion, source); break;
        case 'turret': this.onTurretDestroyed(target as Turret, source); break;
        case 'monster': this.onMonsterKilled(target as Monster, source); break;
      }
    }
    this.dirty();
    return amount;
  }

  /** small burst used by monster slams / area procs */
  splashAround(x: number, y: number, radius: number, amount: number, type: DamageType, foeTeam: Team, source: Hero | null) {
    for (const h of this.heroes) {
      if (h.team !== foeTeam || h.dead) continue;
      if (Math.hypot(h.x - x, h.y - y) <= radius) this.damage(source, h, amount, type, { source: 'skill' });
    }
  }

  /** Damage everything in a circle (heroes + minions + monsters + turrets). */
  areaDamage(hero: Hero, x: number, y: number, radius: number, amount: number, type: DamageType, cc?: {
    stun?: number; slow?: number; slowFactor?: number; knockup?: number;
  }) {
    const foes: Team = hero.team === 'blue' ? 'red' : 'blue';
    for (const h of this.heroes) {
      if (h.team !== foes || h.dead) continue;
      if (Math.hypot(h.x - x, h.y - y) <= radius) {
        this.applyCc(h, cc);
        this.damage(hero, h, amount, type, { source: 'skill' });
      }
    }
    for (const m of this.minions) {
      if (m.team !== foes || m.hp <= 0) continue;
      if (Math.hypot(m.x - x, m.y - y) <= radius) this.damage(hero, m, amount * 0.85, type, { source: 'skill' });
    }
    for (const t of this.turrets) {
      if (t.team !== foes || t.destroyed) continue;
      if (Math.hypot(t.x - x, t.y - y) <= radius) this.damage(hero, t, amount * 0.6, type, { source: 'skill' });
    }
    for (const mo of this.monsters) {
      if (!mo.alive) continue;
      if (Math.hypot(mo.x - x, mo.y - y) <= radius && hero.team !== campSideTeam(mo)) {
        this.damage(hero, mo, amount, type, { source: 'skill' });
      }
    }
  }

  lineDamage(hero: Hero, sx: number, sy: number, dir: { x: number; y: number }, length: number, width: number, amount: number, type: DamageType, cc?: {
    stun?: number; slow?: number; slowFactor?: number;
  }) {
    const ex = sx + dir.x * length;
    const ey = sy + dir.y * length;
    const l2 = (ex - sx) ** 2 + (ey - sy) ** 2;
    const distToSegment = (px: number, py: number) => {
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - sx) * (ex - sx) + (py - sy) * (ey - sy)) / l2));
      return Math.hypot(px - (sx + t * (ex - sx)), py - (sy + t * (ey - sy)));
    };
    const foes: Team = hero.team === 'blue' ? 'red' : 'blue';
    for (const h of this.heroes) {
      if (h.team !== foes || h.dead) continue;
      if (distToSegment(h.x, h.y) <= width) { this.applyCc(h, cc); this.damage(hero, h, amount, type, { source: 'skill' }); }
    }
    for (const m of this.minions) {
      if (m.team !== foes || m.hp <= 0) continue;
      if (distToSegment(m.x, m.y) <= width) this.damage(hero, m, amount * 0.85, type, { source: 'skill' });
    }
    for (const t of this.turrets) {
      if (t.team !== foes || t.destroyed) continue;
      if (distToSegment(t.x, t.y) <= width) this.damage(hero, t, amount * 0.55, type, { source: 'skill' });
    }
    for (const mo of this.monsters) {
      if (!mo.alive) continue;
      if (distToSegment(mo.x, mo.y) <= width && hero.team !== campSideTeam(mo)) this.damage(hero, mo, amount, type, { source: 'skill' });
    }
  }

  singleDamage(hero: Hero, target: Unit, amount: number, type: DamageType, cc?: { stun?: number; slow?: number }) {
    if (target.utype === 'hero') this.applyCc(target as Hero, cc);
    this.damage(hero, target, amount, type, { source: 'skill' });
  }

  applyCc(h: Hero, cc?: { stun?: number; slow?: number; slowFactor?: number; knockup?: number }) {
    if (!cc || !h) return;
    if (h.buffs.immunity > 0) return;
    if (cc.stun) { h.buffs.stun = Math.max(h.buffs.stun, cc.stun); this.addFloater('Stunned', h.x, h.y - 44, '#fde68a'); }
    if (cc.knockup) { h.buffs.stun = Math.max(h.buffs.stun, cc.knockup); this.addFloater('Knocked up', h.x, h.y - 44, '#bae6fd'); }
    if (cc.slow) {
      h.buffs.slow = Math.max(h.buffs.slow, cc.slow);
      h.buffs.slowFactor = Math.max(h.buffs.slowFactor, cc.slowFactor ?? 0.35);
    }
  }

  chainLightning(first: Hero, from: Hero, amount: number) {
    const foes: Team = from.team === 'blue' ? 'red' : 'blue';
    let cursor = { x: first.x, y: first.y };
    const hit = new Set<number>();
    for (let i = 0; i < 4; i++) {
      let next: Hero | null = i === 0 ? first : null;
      if (!next) {
        let bestD = 420;
        for (const h of this.heroes) {
          if (h.team !== foes || h.dead || hit.has(h.uid)) continue;
          const d = Math.hypot(h.x - cursor.x, h.y - cursor.y);
          if (d < bestD) { bestD = d; next = h; }
        }
      }
      if (!next) break;
      hit.add(next.uid);
      this.addEffect({
        type: 'beam', x: cursor.x, y: cursor.y, x2: next.x, y2: next.y,
        radius: 10, color: '#a855f7', life: 0.35, maxLife: 0.35
      });
      this.applyCc(next, { slow: 1.2 });
      this.damage(from, next, amount * Math.pow(0.78, i), 'magic', { source: 'skill' });
      cursor = { x: next.x, y: next.y };
    }
  }

  /** damage over time for suppress effects (Franco ult etc.) */
  applyDamageContinuous(hero: Hero, target: Unit, totalAmount: number, duration: number) {
    const ticks = 4;
    for (let i = 0; i < ticks; i++) {
      const delay = (duration / ticks) * i;
      this.scheduled.push({ at: this.time + delay, fn: () => {
        if (target.hp > 0) this.damage(hero, target, totalAmount / ticks, 'physical', { source: 'tick' });
      } });
    }
  }

  private scheduled: { at: number; fn: () => void }[] = [];

  setTimeoutHero(hero: Hero, key: string, dur: number) {
    hero.timedFlags = hero.timedFlags ?? {};
    hero.timedFlags[key] = dur;
  }

  // ==========================================================================
  //  Kills, gold, exp
  // ==========================================================================

  private onHeroKilled(victim: Hero, killer: Hero | null) {
    victim.dead = true;
    victim.deaths++;
    victim.respawnTimer = Math.min(TUNE.respawnMax, TUNE.respawnBase + victim.level * TUNE.respawnPerLevel);
    victim.hp = 0;
    victim.runtime = { ...victim.runtime, moveX: 0, moveY: 0, moveOrder: null, attackOrderUid: null, aiTargetUid: null, recallTimer: 0, aiState: 'dead' };
    this.camera.shake = victim.isPlayer ? 1 : this.camera.shake;

    let killerTeam: Team | null = null;
    const assists: Hero[] = [];
    if (killer && killer.utype === 'hero' && killer.uid !== victim.uid) {
      killerTeam = killer.team;
      killer.kills++;
      const base = 160 + victim.level * 14;
      const streak = this.streaks.get(killer.uid);
      const bonus = streak ? Math.min(200, streak.kills * 30) : 0;
      killer.gold += base + bonus;
      killer.goldEarned += base + bonus;
      this.gainExp(killer, 140);
      if (killer.team === 'blue') this.blueKills++; else this.redKills++;

      // assists
      for (const a of this.heroes) {
        if (a.team === killer.team && a.uid !== killer.uid && !a.dead &&
          Math.hypot(a.x - victim.x, a.y - victim.y) < 900 &&
          (a.runtime.lastDamagedTime > this.time - 8 || a.uid === killer.runtime.lastAttackerUid)) {
          a.assists++;
          a.gold += 90;
          a.goldEarned += 90;
          this.gainExp(a, 55);
          assists.push(a);
        }
      }

      // streaks / multikills
      const st = this.streaks.get(killer.uid) ?? { kills: 0, at: 0, multi: 0 };
      const multi = this.time - st.at <= 12 ? st.multi + 1 : 1;
      this.streaks.set(killer.uid, { kills: st.kills + 1, at: this.time, multi });
      st.kills++;
      const streakName = multi >= 5 ? 'SAVAGE!' : multi === 4 ? 'MANIAC!' : multi === 3 ? 'TRIPLE KILL!' : multi === 2 ? 'DOUBLE KILL!' : null;
      if (streakName) {
        this.announce({
          type: multi >= 5 ? 'savage' : multi === 4 ? 'maniac' : multi === 3 ? 'triple' : 'double',
          title: streakName,
          subtitle: `${killer.name} ${multi >= 5 ? 'wiped the whole enemy team' : 'keeps the streak alive'}`,
          team: killer.team, duration: 3.4
        });
        soundManager.announce(multi >= 5 ? 'Savage' : multi === 4 ? 'Maniac' : multi === 3 ? 'Triple Kill' : 'Double Kill');
      } else if (!this.firstBloodDone) {
        this.firstBloodDone = true;
        this.announce({ type: 'first-blood', title: 'FIRST BLOOD', subtitle: `${killer.name} drew first blood`, team: killer.team, duration: 3.2 });
        soundManager.announce('First Blood');
      } else {
        soundManager.announce(killer.isPlayer ? 'You have slain an enemy hero'
          : killer.team === this.player.team ? 'An enemy has been slain' : 'An ally has been slain');
      }
    } else {
      // killed by structure/creeps
      killerTeam = victim.team === 'blue' ? 'red' : 'blue';
      if (killerTeam === 'blue') this.blueKills++; else this.redKills++;
      if (victim.isPlayer) soundManager.announce('You have been slain');
    }

    // victim loses their streak
    const vst = this.streaks.get(victim.uid);
    if (vst) { vst.kills = 0; vst.multi = 0; }
    victim.gold += 30;

    this.killFeed.unshift({
      uid: nextUid(),
      killerName: killer && killer.utype === 'hero' ? killer.name : (killerTeam === this.player.team ? 'Our team' : 'Enemy team'),
      killerPortrait: killer && killer.utype === 'hero' ? killer.portrait : undefined,
      killerTeam: killerTeam ?? (victim.team === 'blue' ? 'red' : 'blue'),
      victimName: victim.name,
      victimPortrait: victim.portrait,
      victimTeam: victim.team,
      assistNames: assists.map(a => a.name),
      time: this.time
    });
    if (this.killFeed.length > 7) this.killFeed.pop();

    this.chat.botReact(this.heroes, this.time, killer && killer.team === victim.team ? 'kill' : 'death', {
      hero: killer ?? undefined, victim, chance: 0.55
    });
    this.announceKillScore();
    this.dirty();
  }

  private announceKillScore() {
    const p = this.player;
    const diff = p.team === 'blue' ? this.blueKills - this.redKills : this.redKills - this.blueKills;
    if (this.time > 180 && Math.abs(diff) >= 6 && this.allowAnnounce('tilt', 120)) {
      this.chat.tickIdle(this.heroes.filter(h => h.team === p.team), this.time, -diff);
    }
  }

  private onMinionKilled(m: Minion, killer: Hero | null) {
    // gold + exp to the killer and nearby enemy heroes (shared lane xp)
    const nearby = this.heroes.filter(h => h.team !== m.team && !h.dead && Math.hypot(h.x - m.x, h.y - m.y) < TUNE.expShareRadius && !(h.team === this.player.team && h.isPlayer && false));
    const isHeroKill = !!killer && killer.utype === 'hero';
    if (isHeroKill) {
      killer!.creepScore++;
      killer!.gold += m.bounty;
      killer!.goldEarned += m.bounty;
    }
    nearby.forEach(h => {
      const full = isHeroKill && h.uid === killer!.uid;
      this.gainExp(h, full ? m.exp : m.exp * 0.62);
      if (!full) {
        const g = Math.round(m.bounty * 0.42);
        h.gold += g; h.goldEarned += g;
      }
      if (h.isPlayer && m.hp <= 0 && isHeroKill && h.uid === killer!.uid) {
        this.addFloater(`+${m.bounty}`, m.x, m.y - 20, '#fcd34d');
        soundManager.playGoldSound();
      }
    });
    if (m.isLord) {
      this.addEffect({ type: 'burst', x: m.x, y: m.y, radius: 150, color: '#a855f7', life: 0.7, maxLife: 0.7 });
    }
  }

  private onTurretDestroyed(t: Turret, killer: Hero | null) {
    t.destroyed = true;
    t.hp = 0;
    t.targetUid = null;
    const foes: Team = t.team === 'blue' ? 'red' : 'blue';
    this.heroes.forEach(h => {
      if (h.team === foes) { h.gold += 160; h.goldEarned += 160; this.gainExp(h, 90); }
    });
    if (killer) { killer.gold += 90; killer.goldEarned += 90; }

    if (t.tier === 5) {
      this.endMatch(foes);
      return;
    }
    const label = t.tier === 4 ? 'BASE TURRET' : t.tier === 3 ? 'INHIBITOR TURRET' : 'TURRET';
    const mine = t.team === this.player.team;
    this.announce({
      type: 'turret',
      title: mine ? `${label} LOST` : `ENEMY ${label} DOWN`,
      subtitle: mine ? 'Regroup and defend the base' : 'Push the lane, super minions incoming',
      team: foes, duration: 3
    });
    soundManager.announce(mine ? 'Our turret has been destroyed' : 'An enemy turret has been destroyed');
    this.killFeed.unshift({
      uid: nextUid(), killerName: killer?.name ?? 'Minions', killerTeam: foes,
      victimName: `${t.team === 'blue' ? 'Blue' : 'Red'} ${label}`, victimTeam: t.team,
      assistNames: [], time: this.time, isStructure: true
    });
    this.chat.botReact(this.heroes, this.time, mine ? 'turret-lost' : 'turret-kill', { hero: killer ?? undefined, chance: 0.7 });
    this.dirty();
  }

  private onMonsterKilled(m: Monster, killer: Hero | null) {
    m.alive = false;
    m.respawnTimer = m.respawnAt || 90;
    if (m.camp === 'turtle') this.turtleDownAt = this.time;
    if (m.camp === 'lord') this.lordDownAt = this.time;
    if ((m.camp === 'turtle' || m.camp === 'lord') && killer) {
      this.objectiveKills[m.camp][killer.team]++;
    }
    m.hp = 0;
    m.targetUid = null;
    if (!killer) return;

    killer.gold += m.bounty;
    killer.goldEarned += m.bounty;
    this.gainExp(killer, m.exp);
    killer.jungleKills++;
    soundManager.playGoldSound();

    // nearby allies share objective gold/exp
    const nearby = this.heroes.filter(h => h.team === killer.team && h.uid !== killer.uid && !h.dead && Math.hypot(h.x - m.x, h.y - m.y) < 780);
    nearby.forEach(h => { this.gainExp(h, m.exp * 0.5); h.gold += Math.round(m.bounty * 0.35); });

    if (m.camp === 'blue-buff') {
      killer.buffs.blueBuff = m.buffDuration || 45;
      this.addFloater('BLUE BUFF', killer.x, killer.y - 48, '#60a5fa');
    } else if (m.camp === 'red-buff') {
      killer.buffs.redBuff = m.buffDuration || 45;
      this.addFloater('RED BUFF', killer.x, killer.y - 48, '#f87171');
    } else if (m.camp === 'turtle') {
      this.heroes.forEach(h => {
        if (h.team === killer.team) {
          h.gold += 120; h.goldEarned += 120;
          h.buffs.shield = Math.max(h.buffs.shield, 260 + h.level * 22);
          h.buffs.speedBoost = Math.max(h.buffs.speedBoost, 6);
          h.buffs.speedFactor = Math.max(h.buffs.speedFactor, 1.12);
        }
      });
      this.announce({ type: 'turtle', title: 'TURTLE SECURED', subtitle: `${killer.team.toUpperCase()} team gains gold, shields and speed`, team: killer.team, duration: 3.4 });
      soundManager.announce('The Turtle has been slain');
      this.chat.botReact(this.heroes, this.time, 'turtle', { hero: killer, chance: 0.9 });
    } else if (m.camp === 'lord') {
      this.lordTeam = killer.team;
      this.lordExpiry = this.time + 150;
      this.heroes.forEach(h => { if (h.team === killer.team) { h.gold += 180; h.goldEarned += 180; } });
      // push a Lord helper down the lane with the fewest enemy turrets
      const lane = LANES
        .map(l => ({ l, alive: this.turrets.filter(t => t.team !== killer.team && t.lane === l && !t.destroyed).length }))
        .sort((a, b) => a.alive - b.alive)[0].l;
      this.spawnLordPusher(killer.team, lane);
      this.announce({ type: 'lord', title: 'LORD SUMMONED', subtitle: `Lord pushes ${lane.toUpperCase()} lane`, team: killer.team, duration: 3.8 });
      soundManager.announce('The Lord has been slain');
      this.chat.botReact(this.heroes, this.time, 'lord', { hero: killer, chance: 1 });
    } else if (m.side !== 'neutral' && m.side !== killer.team) {
      this.chat.botReact(this.heroes, this.time, 'steal', { hero: killer, chance: 0.6 });
    }
    this.dirty();
  }

  private spawnLordPusher(team: Team, lane: Lane) {
    const start = laneSpawn(lane, team);
    const m = this.makeMinion('lord', lane, team, start.x, start.y, 1);
    m.isLord = true;
    this.minions.push(m);
  }

  private respawn(h: Hero) {
    h.dead = false;
    h.hp = h.stats.maxHp;
    h.mana = h.stats.maxMana;
    const f = FOUNTAINS[h.team];
    h.x = f.x + (Math.random() - 0.5) * 90;
    h.y = f.y + (Math.random() - 0.5) * 90;
    h.buffs.stun = 0; h.buffs.slow = 0; h.buffs.suppress = 0;
    h.runtime.aiState = 'lane';
    h.runtime.attackOrderUid = null;
    h.runtime.moveOrder = null;
    h.cooldowns = [0, 0, 0];
    h.spellCooldown = 0;
    this.addEffect({ type: 'ring', x: h.x, y: h.y, radius: 120, color: h.team === 'blue' ? '#60a5fa' : '#fb7185', life: 0.6, maxLife: 0.6 });
    this.dirty();
  }

  gainExp(h: Hero, amount: number) {
    if (h.level >= 15) return;
    h.exp += amount;
    const need = TUNE.xpCurveBase + 55 * h.level;
    while (h.exp >= need && h.level < 15) {
      h.exp -= TUNE.xpCurveBase + 55 * h.level;
      h.level++;
      h.skillPoints++;
      this.recalcStats(h);
      // bots level their ultimate at 4/8/12 automatically
      if (!h.isPlayer) this.autoLevelSkills(h);
      this.addFloater(`LEVEL ${h.level}`, h.x, h.y - 52, '#fcd34d');
      if (h.isPlayer) soundManager.playLevelUp();
      if (h.level >= 15) h.exp = 0;
    }
  }

  autoLevelSkills(h: Hero) {
    let guard = 0;
    while (h.skillPoints > 0 && guard++ < 20) {
      const ultCap = h.level >= 12 ? 3 : h.level >= 8 ? 2 : h.level >= 4 ? 1 : 0;
      if (h.skillLevels[2] < ultCap && (h.level % 4 === 0 || h.skillLevels[0] >= 2)) h.skillLevels[2]++;
      else if (h.skillLevels[0] <= h.skillLevels[1] && h.skillLevels[0] < 6) h.skillLevels[0]++;
      else if (h.skillLevels[1] < 6) h.skillLevels[1]++;
      else if (h.skillLevels[2] < ultCap) h.skillLevels[2]++;
      else break;
      h.skillPoints -= 1;
    }
    if (h.skillPoints > 0) h.skillPoints = 0;
  }

  // ==========================================================================
  //  Vision
  // ==========================================================================

  visionSources: { x: number; y: number; r: number }[] = [];
  teamSources: Record<Team, { x: number; y: number; r: number }[]> = { blue: [], red: [] };

  private tickVision() {
    const build = (team: Team) => {
      const out: { x: number; y: number; r: number }[] = [];
      for (const h of this.heroes) {
        if (h.team !== team || h.dead) continue;
        out.push({ x: h.x, y: h.y, r: h.inBush ? TUNE.bushRevealRadius + 70 : TUNE.heroVision });
      }
      for (const m of this.minions) if (m.team === team && m.hp > 0) out.push({ x: m.x, y: m.y, r: TUNE.minionVision });
      for (const t of this.turrets) if (t.team === team && !t.destroyed) out.push({ x: t.x, y: t.y, r: TUNE.turretVision });
      return out;
    };
    this.teamSources.blue = build('blue');
    this.teamSources.red = build('red');
    this.visionSources = this.teamSources[this.player.team];

    for (const h of this.heroes) {
      h.visibleToEnemy = this.seenBy(this.teamSources[h.team === 'blue' ? 'red' : 'blue'], h.x, h.y, h.inBush);
      h.visibleToFriendly = h.team === this.player.team
        ? true
        : this.seenBy(this.visionSources, h.x, h.y, h.inBush);
    }
    for (const m of this.minions) {
      m.visibleToFriendly = m.team === this.player.team
        ? true
        : this.seenBy(this.visionSources, m.x, m.y, false);
    }
  }

  seenBy(sources: { x: number; y: number; r: number }[], x: number, y: number, inBrush: boolean): boolean {
    const need = inBrush ? TUNE.bushRevealRadius : 0;
    for (const s of sources) {
      const d = Math.hypot(s.x - x, s.y - y);
      if (d <= (need > 0 ? need : s.r)) return true;
    }
    return false;
  }

  /** can this hero perceive a world point? (own eyes + team vision) */
  sees(h: Hero, x: number, y: number, targetInBush = false): boolean {
    const own = Math.hypot(h.x - x, h.y - y);
    if (own < (h.inBush ? 190 : TUNE.heroVision)) return true;
    return this.seenBy(this.teamSources[h.team], x, y, targetInBush);
  }

  /** total enemy heroes currently visible to a team near a point */
  visibleEnemies(h: Hero, r: number): Hero[] {
    return this.heroes.filter(o => o.team !== h.team && !o.dead &&
      Math.hypot(o.x - h.x, o.y - h.y) <= r && this.sees(h, o.x, o.y, o.inBush));
  }

  isVisibleToPlayer(x: number, y: number, inBrush = false): boolean {
    return this.seenBy(this.visionSources, x, y, inBrush);
  }

  // ==========================================================================
  //  Helpers used by AI / UI
  // ==========================================================================

  heroesInRange(foeTeam: Team, x: number, y: number, r: number, aliveOnly = true): Hero[] {
    return this.heroes.filter(h => h.team === foeTeam && (!aliveOnly || !h.dead) && Math.hypot(h.x - x, h.y - y) <= r);
  }

  closestEnemyHero(h: Hero, range: number): Hero | null {
    let best: Hero | null = null;
    let bd = range;
    for (const o of this.heroes) {
      if (o.team === h.team || o.dead) continue;
      const d = Math.hypot(o.x - h.x, o.y - h.y);
      if (d < bd && this.sees(h, o.x, o.y)) { bd = d; best = o; }
    }
    return best;
  }

  closestEnemyMinion(h: Hero, range: number): Minion | null {
    let best: Minion | null = null;
    let bd = range;
    for (const m of this.minions) {
      if (m.team === h.team || m.hp <= 0) continue;
      const d = Math.hypot(m.x - h.x, m.y - h.y);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  /** nearest damaged-or-alive enemy structure that is currently attackable */
  attackableStructures(team: Team): Turret[] {
    return this.turrets.filter(t => t.team !== team && !t.destroyed && this.turretVulnerable(t));
  }

  unitByUid(uid: number | null): Unit | null {
    if (uid === null || uid === undefined) return null;
    const u = this.uidIndex.get(uid);
    if (u && this.isAlive(u)) return u;
    for (const h of this.heroes) if (h.uid === uid) return h;
    for (const t of this.turrets) if (t.uid === uid) return t;
    return u ?? null;
  }

  /** how much fighting power a team has near a point (used by AI + HUD) */
  teamStrengthNear(x: number, y: number, r: number, team: Team): number {
    let total = 0;
    for (const h of this.heroes) {
      if (h.team !== team || h.dead) continue;
      if (Math.hypot(h.x - x, h.y - y) <= r) {
        total += (0.35 + 0.65 * (h.hp / h.stats.maxHp)) * (1 + h.level * 0.06);
      }
    }
    return total;
  }

  teamCount(team: Team, r: number, center?: { x: number; y: number }): number {
    const c = center ?? this.player;
    return this.heroes.filter(h => h.team === team && !h.dead && Math.hypot(h.x - c.x, h.y - c.y) <= r).length;
  }

  scoreFor(team: Team): number {
    return team === 'blue' ? this.blueKills : this.redKills;
  }

  isRanged(h: Hero): boolean {
    return h.stats.attackRange > 175;
  }

  isAlive(u: Unit): boolean {
    switch (u.utype) {
      case 'hero': return !(u as Hero).dead;
      case 'turret': return !(u as Turret).destroyed;
      case 'monster': return (u as Monster).alive;
      default: return u.hp > 0;
    }
  }

  // ==========================================================================
  //  Player command surface
  // ==========================================================================

  commandMove(x: number, y: number) {
    const rt = this.player.runtime;
    rt.moveOrder = { x, y };
    rt.attackOrderUid = null;
    rt.moveX = 0; rt.moveY = 0;
  }

  /**
   * "attack" button / Space: hit whatever is best in range right now, otherwise
   * walk at the nearest enemy and start auto-attacking it.
   */
  basicAttackNearest(h: Hero) {
    const t = this.pickAttackTarget(h);
    if (t) {
      h.runtime.attackOrderUid = t.uid;
      h.runtime.moveOrder = null;
      this.basicAttack(h, t);
      this.dirty();
      return;
    }
    const hero = this.closestEnemyHero(h, 1500);
    const min = this.closestEnemyMinion(h, 900);
    let best: Unit | null = null;
    let bd = Infinity;
    for (const c of [hero, min]) {
      if (!c) continue;
      const d = Math.hypot((c as any).x - h.x, (c as any).y - h.y);
      if (d < bd) { bd = d; best = c as any; }
    }
    if (!best) {
      const foe = this.attackableStructures(h.team === 'blue' ? 'red' : 'blue')
        .filter(t => this.sees(h, t.x, t.y, false))
        .sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0];
      if (foe) best = foe;
    }
    if (best) {
      h.runtime.attackOrderUid = best.uid;
      h.runtime.moveOrder = null;
    }
    this.dirty();
  }

  commandAttackUid(uid: number) {
    const rt = this.player.runtime;
    rt.attackOrderUid = uid;
    rt.moveOrder = null;
  }

  commandStop() {
    const rt = this.player.runtime;
    rt.moveOrder = null;
    rt.attackOrderUid = null;
    rt.moveX = 0; rt.moveY = 0;
  }

  setMoveVector(x: number, y: number) {
    const rt = this.player.runtime;
    rt.moveX = x; rt.moveY = y;
    if (Math.hypot(x, y) > 0.05) { rt.moveOrder = null; rt.attackOrderUid = null; }
  }

  setPriority(p: HeroRuntime['priority']) {
    this.player.runtime.priority = p;
    this.addFloater(`Target priority: ${p.toUpperCase()}`, this.player.x, this.player.y - 52, '#93c5fd');
  }

  toggleAutoAttack() {
    this.player.runtime.autoAttack = !this.player.runtime.autoAttack;
    this.addFloater(this.player.runtime.autoAttack ? 'Auto-attack ON' : 'Auto-attack OFF', this.player.x, this.player.y - 52, '#a3e635');
  }

  addPing(kind: MapPing['kind'], x: number, y: number, from: Hero, forced = false) {
    if (from.isBot && !forced) {
      from.extra = from.extra ?? {};
      if (this.time < (from.extra.nextPing ?? 0)) return;
      from.extra.nextPing = this.time + 34 + Math.random() * 30;
    }
    this.pings.push({ uid: nextUid(), kind, x, y, team: from.team, fromUid: from.uid, fromName: from.name, life: 6 });
    const label = { attack: 'Attack!', retreat: 'Retreat!', help: 'Need help!', gather: 'Gather up!', enemy: 'Enemy missing!', thanks: 'Thanks!', nice: 'Nice!' }[kind];
    this.chat.push({
      channel: 'team', senderName: from.name, senderTeam: from.team, senderHeroId: from.defId,
      text: `${label}  (${laneForPoint(x, y) ?? 'river'})`, time: this.time, isQuick: true, isPlayer: from.isPlayer, pingKind: kind
    });
    soundManager.announce(label.replace('!', ''));
    if (from.isPlayer) {
      // allies react: the closest ally in that lane responds and rotates
      const allies = this.heroes.filter(h => h.team === from.team && !h.isPlayer && !h.dead);
      allies.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
      const nearest = allies[0];
      if (nearest) {
        if (kind === 'attack' || kind === 'gather') {
          nearest.runtime.moveOrder = { x: x + (Math.random() - 0.5) * 160, y: y + (Math.random() - 0.5) * 160 };
          nearest.runtime.aiTimer = 8;
          if (Math.random() < 0.5) this.chat.botSay(nearest, 'on my way', { force: false });
        } else if (kind === 'retreat') {
          nearest.runtime.aiState = 'retreat';
          nearest.runtime.aiTimer = 6;
        } else if (kind === 'help') {
          nearest.runtime.moveOrder = { x, y };
          nearest.runtime.aiTimer = 9;
          this.chat.botSay(nearest, 'coming, wait 5 second', { force: false });
        }
      }
    }
    this.dirty();
  }

  sendQuickChat(option: QuickChatOption, toAll = false) {
    this.chat.quickFromPlayer(this.player, option, toAll);
    if (option.kind) {
      const lane = this.player.laneAssigned;
      const p = lane === 'jungle' || lane === 'roam'
        ? { x: this.player.x, y: this.player.y }
        : lanePath(lane as Lane, this.player.team)[3] ?? { x: this.player.x, y: this.player.y };
      this.addPing(option.kind, p.x, p.y, this.player);
    } else {
      this.chat.botReplyTo(this.heroes.filter(h => h.team === this.player.team && h.isBot), option.chat, this.time);
    }
  }

  sendChat(text: string, toAll = false) {
    this.chat.fromPlayer(this.player, text, toAll);
    if (!toAll) {
      this.chat.botReplyTo(this.heroes.filter(h => h.team === this.player.team && h.isBot), text, this.time);
    }
  }

  // ==========================================================================
  //  Effects / UI plumbing
  // ==========================================================================

  addEffect(e: Omit<VisualEffect, 'uid'>) {
    if (this.effects.length > 320) this.effects.shift();
    this.effects.push({ ...e, uid: nextUid() });
  }

  addFloater(text: string, x: number, y: number, color: string, size = 15) {
    if (this.floats.length > 160) this.floats.shift();
    const f: FloatingText = { uid: nextUid(), text, x, y, color, fontSize: size, life: 0, maxLife: 0.95, vy: -46 };
    this.floats.push(f);
  }

  private tickEffects(dt: number) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.life += dt;
      if (e.life >= e.maxLife) this.effects.splice(i, 1);
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life += dt;
      f.y += f.vy * dt;
      f.vy *= 0.96;
      if (f.life >= f.maxLife) this.floats.splice(i, 1);
    }
    // scheduled damage ticks
    while (this.scheduled.length && this.scheduled[0].at <= this.time) {
      const s = this.scheduled.shift()!;
      try { s.fn(); } catch { /* noop */ }
    }
  }

  announce(a: Omit<Announcement, 'id'>) {
    this.listeners.onAnnounce?.({ ...a, id: `ann_${nextUid()}` });
  }

  private allowAnnounce(key: string, gap: number) {
    const last = this.lastAnnounceAt.get(key) ?? -999;
    if (this.time - last < gap) return false;
    this.lastAnnounceAt.set(key, this.time);
    return true;
  }

  private dirty() {
    this.listeners.onDirty?.();
  }

  endMatch(winner: Team) {
    if (this.state === 'over') return;
    this.state = 'over';
    this.winner = winner;
    const win = winner === this.player.team;
    this.announce({ type: win ? 'victory' : 'defeat', title: win ? 'VICTORY' : 'DEFEAT', subtitle: win ? 'Enemy base destroyed' : 'Our base has fallen', team: winner, duration: 5 });
    this.chat.botReact(this.heroes, this.time, 'end-close', { chance: 1 });
    if (win) soundManager.playVictoryFanfare();
    soundManager.announce(win ? 'Victory' : 'Defeat');
    this.listeners.onGameOver?.(winner);
    this.dirty();
  }

  surrender() {
    if (this.state === 'over') return;
    this.endMatch(this.player.team === 'blue' ? 'red' : 'blue');
  }

  get matchPhase(): MatchPhase {
    if (this.state === 'over') return 'over';
    if (this.time < 150) return 'laning';
    if (this.time < 480) return 'mid';
    return 'late';
  }

  // ==========================================================================
  //  Snapshot for React
  // ==========================================================================

  skillHud(h: Hero): SkillHudEntry[] {
    return h.def.skills.map((s, i) => ({
      name: s.name,
      level: h.skillLevels[i],
      cooldownLeft: h.cooldowns[i],
      cooldown: s.cooldown * (1 - Math.min(0.4, h.stats.cooldownReduction + (h.buffs.blueBuff > 0 ? 0.1 : 0))),
      manaCost: s.manaCost,
      canCast: this.canCastSkill(h, i).ok,
      isUltimate: !!s.isUltimate,
      description: s.description,
      targetType: s.targetType
    }));
  }

  snapshot(): EngineSnapshot {
    const p = this.player;
    const spell = BATTLE_SPELLS.find(s => s.id === p.spellId) ?? BATTLE_SPELLS[0];
    const turtle = this.monsters.find(m => m.camp === 'turtle')!;
    const lord = this.monsters.find(m => m.camp === 'lord')!;
    return {
      phase: this.matchPhase, time: this.time,
      blueKills: this.blueKills, redKills: this.redKills,
      blueTurrets: this.turrets.filter(t => t.team === 'blue' && !t.destroyed).length,
      redTurrets: this.turrets.filter(t => t.team === 'red' && !t.destroyed).length,
      player: p, heroes: this.heroes, players: this.heroes, turrets: this.turrets, monsters: this.monsters,
      minionCount: this.minions.length, killFeed: this.killFeed, chat: this.chat.messages,
      pings: this.pings, skills: this.skillHud(p),
      spell: {
        id: spell.id, name: spell.name, icon: spell.icon, cooldown: spell.cooldown,
        cooldownLeft: p.spellCooldown, ready: p.spellCooldown <= 0
      },
      objectives: {
        turtleIn: turtle.alive ? 0 : Math.max(0, turtle.respawnTimer),
        lordIn: lord.alive ? 0 : Math.max(0, lord.respawnTimer),
        turtleAlive: turtle.alive, lordAlive: lord.alive, lordTeam: this.lordTeam,
        turtleKills: this.objectiveKills.turtle, lordKills: this.objectiveKills.lord,
      },
      fps: Math.round(this.fps), winner: this.winner, error: this.error
    };
  }

  quickChatOptions(): QuickChatOption[] {
    return QUICK_CHAT;
  }
}

function emptyStats(): HeroStats {
  return {
    maxHp: 1, hpRegen: 0, maxMana: 1, manaRegen: 0, physAtk: 0, magicPower: 0,
    physDef: 0, magicDef: 0, attackSpeed: 1, moveSpeed: 240, attackRange: 100,
    lifesteal: 0, critChance: 0, critDamage: 2, cooldownReduction: 0,
    penPhysical: 0, penMagic: 0
  };
}

function campSideTeam(m: Monster): Team | 'neutral' {
  return m.side;
}

function maxHpOf(u: Unit): number {
  return u.utype === 'hero' ? (u as Hero).stats.maxHp : u.maxHp;
}

function defenseOf(u: Unit, type: DamageType): number {
  if (u.utype === 'hero') {
    const h = u as Hero;
    return type === 'physical' ? h.stats.physDef : h.stats.magicDef;
  }
  const any = u as any;
  return (type === 'physical' ? any.physDef : any.magicDef) ?? 0;
}

/** Which lane is a world point closest to (used for pings/chat). */
export function laneForPoint(x: number, y: number): Lane | 'jungle' {
  let best: Lane | 'jungle' = 'jungle';
  let bd = 220;
  for (const lane of LANES) {
    for (const p of lanePath(lane, 'blue')) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = lane; }
    }
  }
  return best;
}
