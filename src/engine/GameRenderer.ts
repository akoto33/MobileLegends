import { GameEngine } from './GameEngine';
import { FOUNTAIN_BLUE, FOUNTAIN_RED, MAP_HEIGHT, MAP_WIDTH } from './GameMap';

export class GameRenderer {
  private heroImageCache: Map<string, HTMLImageElement> = new Map();

  constructor() {
    this.preloadHeroPortraits();
  }

  private preloadHeroPortraits() {
    const portraits: Record<string, string> = {
      layla: '/heroes/layla.jpg',
      miya: '/heroes/miya.jpg',
      tigreal: '/heroes/tigreal.jpg',
      alucard: '/heroes/alucard.jpg',
      eudora: '/heroes/eudora.jpg',
      saber: '/heroes/saber.jpg',
      zilong: '/heroes/zilong.jpg',
      nana: '/heroes/nana.jpg',
      gusion: '/heroes/gusion.jpg',
      franco: '/heroes/franco.jpg'
    };

    Object.entries(portraits).forEach(([id, src]) => {
      const img = new Image();
      img.src = src;
      img.onload = () => {
        this.heroImageCache.set(id, img);
      };
    });
  }

  // Main Render Frame
  public render(ctx: CanvasRenderingContext2D, engine: GameEngine, width: number, height: number) {
    ctx.clearRect(0, 0, width, height);

    // Save camera transform
    ctx.save();
    // Center camera on player
    const camX = engine.camera.x;
    const camY = engine.camera.y;
    ctx.translate(width / 2 - camX, height / 2 - camY);

    // 1. Draw Map Terrain & Lanes & River
    this.drawTerrain(ctx);

    // 2. Draw Bushes
    this.drawBushes(ctx, engine);

    // 3. Draw Turrets
    this.drawTurrets(ctx, engine);

    // 4. Draw Jungle Monsters
    this.drawMonsters(ctx, engine);

    // 5. Draw Minions
    this.drawMinions(ctx, engine);

    // 6. Draw Heroes
    this.drawHeroes(ctx, engine);

    // 7. Draw Visual Effects (slashes, circles, beams)
    this.drawVisualEffects(ctx, engine);

    // 8. Draw Projectiles
    this.drawProjectiles(ctx, engine);

    // 9. Draw Skill Aim Reticle (if aiming)
    this.drawAimReticle(ctx, engine);

    // 10. Draw Floating Damage & Status Texts
    this.drawFloatingTexts(ctx, engine);

    ctx.restore();
  }

  // --- MAP TERRAIN RENDERING ---
  private drawTerrain(ctx: CanvasRenderingContext2D) {
    // Ground base (Dark battle arena grass)
    ctx.fillStyle = '#0b1915';
    ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

    // Subtle grid texture
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.lineWidth = 1;
    const gridSize = 100;
    for (let x = 0; x < MAP_WIDTH; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, MAP_HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y < MAP_HEIGHT; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(MAP_WIDTH, y);
      ctx.stroke();
    }

    // River (diagonal blue stream from top-left to bottom-right)
    ctx.save();
    ctx.fillStyle = '#0c4a6e';
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(0, 800);
    ctx.bezierCurveTo(800, 1100, 1400, 1400, 2600, 1800);
    ctx.lineTo(2600, 2050);
    ctx.bezierCurveTo(1400, 1650, 800, 1350, 0, 1050);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Lanes (Top, Mid, Bottom stone path)
    ctx.strokeStyle = '#1e293b';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Top Lane
    ctx.lineWidth = 110;
    ctx.beginPath();
    ctx.moveTo(350, 2200);
    ctx.lineTo(400, 450);
    ctx.lineTo(2200, 400);
    ctx.stroke();

    // Mid Lane
    ctx.beginPath();
    ctx.moveTo(350, 2250);
    ctx.lineTo(2250, 350);
    ctx.stroke();

    // Bot Lane
    ctx.beginPath();
    ctx.moveTo(350, 2200);
    ctx.lineTo(2150, 2150);
    ctx.lineTo(2200, 400);
    ctx.stroke();

    // Lane inner stone pattern
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 80;
    ctx.beginPath();
    ctx.moveTo(350, 2200);
    ctx.lineTo(400, 450);
    ctx.lineTo(2200, 400);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(350, 2250);
    ctx.lineTo(2250, 350);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(350, 2200);
    ctx.lineTo(2150, 2150);
    ctx.lineTo(2200, 400);
    ctx.stroke();

    // Blue Base Platform
    ctx.save();
    ctx.fillStyle = '#1e3a8a';
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(FOUNTAIN_BLUE.x, FOUNTAIN_BLUE.y, FOUNTAIN_BLUE.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Blue Base Rune circle
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(FOUNTAIN_BLUE.x, FOUNTAIN_BLUE.y, FOUNTAIN_BLUE.radius * 0.7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Red Base Platform
    ctx.save();
    ctx.fillStyle = '#831843';
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(FOUNTAIN_RED.x, FOUNTAIN_RED.y, FOUNTAIN_RED.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Red Base Rune circle
    ctx.strokeStyle = '#fb7185';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(FOUNTAIN_RED.x, FOUNTAIN_RED.y, FOUNTAIN_RED.radius * 0.7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // --- BUSHES ---
  private drawBushes(ctx: CanvasRenderingContext2D, engine: GameEngine) {
    ctx.save();
    engine.bushes.forEach(b => {
      ctx.fillStyle = 'rgba(22, 101, 52, 0.75)';
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.width, b.height, 16);
      ctx.fill();
      ctx.stroke();

      // Bush foliage grass blades
      ctx.fillStyle = '#15803d';
      for (let i = 10; i < b.width - 10; i += 20) {
        ctx.beginPath();
        ctx.arc(b.x + i, b.y + b.height / 2, 12, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.restore();
  }

  // --- TURRETS ---
  private drawTurrets(ctx: CanvasRenderingContext2D, engine: GameEngine) {
    engine.turrets.forEach(turret => {
      if (turret.destroyed) {
        // Destroyed turret rubble
        ctx.fillStyle = '#334155';
        ctx.beginPath();
        ctx.arc(turret.x, turret.y, 22, 0, Math.PI * 2);
        ctx.fill();
        return;
      }

      const isBlue = turret.team === 'blue';
      const color = isBlue ? '#38bdf8' : '#f43f5e';
      const baseColor = isBlue ? '#1e293b' : '#3f1122';

      // Targeting range circle (subtle)
      ctx.save();
      ctx.strokeStyle = isBlue ? 'rgba(56, 189, 248, 0.12)' : 'rgba(244, 63, 94, 0.12)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.arc(turret.x, turret.y, turret.range, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Target lock beam (Red/Blue laser connecting turret to target)
      if (turret.targetId) {
        const target =
          engine.heroes.find(h => h.id === turret.targetId) ||
          engine.minions.find(m => m.id === turret.targetId);

        if (target) {
          ctx.save();
          ctx.strokeStyle = isBlue ? '#38bdf8' : '#ef4444';
          ctx.lineWidth = 3;
          ctx.shadowColor = isBlue ? '#38bdf8' : '#ef4444';
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.moveTo(turret.x, turret.y);
          ctx.lineTo(target.x, target.y);
          ctx.stroke();
          ctx.restore();
        }
      }

      // Turret base
      ctx.fillStyle = baseColor;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(turret.x, turret.y, turret.tier === 4 ? 36 : 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Glowing crystal core
      ctx.save();
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(turret.x, turret.y, turret.tier === 4 ? 18 : 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Turret Health bar & shield plates
      this.drawHealthBar(ctx, turret.x, turret.y - 42, 60, 7, turret.hp, turret.maxHp, isBlue ? '#38bdf8' : '#f43f5e', turret.shieldPlates);
    });
  }

  // --- JUNGLE MONSTERS ---
  private drawMonsters(ctx: CanvasRenderingContext2D, engine: GameEngine) {
    engine.monsters.forEach(m => {
      if (!m.isAlive) {
        // Respawn timer icon
        ctx.save();
        ctx.fillStyle = '#64748b';
        ctx.font = '12px Rajdhani';
        ctx.textAlign = 'center';
        ctx.fillText(`Respawn: ${Math.ceil(m.respawnTimer)}s`, m.spawnX, m.spawnY);
        ctx.restore();
        return;
      }

      // Camp circle platform
      ctx.save();
      let color = '#38bdf8';
      let radius = 24;
      if (m.type === 'red-buff') {
        color = '#ef4444';
        radius = 26;
      } else if (m.type === 'turtle') {
        color = '#10b981';
        radius = 36;
      } else if (m.type === 'lord') {
        color = '#a855f7';
        radius = 48;
      } else if (m.type === 'crab') {
        color = '#fbbf24';
        radius = 18;
      }

      // Base ring
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
      ctx.beginPath();
      ctx.arc(m.x, m.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Monster Body / Emblem
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(m.x, m.y, radius * 0.6, 0, Math.PI * 2);
      ctx.fill();

      // Name & Health
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 12px Rajdhani';
      ctx.textAlign = 'center';
      ctx.fillText(m.name, m.x, m.y - radius - 14);

      this.drawHealthBar(ctx, m.x, m.y - radius - 6, radius * 2.2, 6, m.hp, m.maxHp, color);
      ctx.restore();
    });
  }

  // --- MINIONS ---
  private drawMinions(ctx: CanvasRenderingContext2D, engine: GameEngine) {
    engine.minions.forEach(minion => {
      const isBlue = minion.team === 'blue';
      const color = isBlue ? '#38bdf8' : '#f43f5e';
      const radius = minion.type === 'siege' ? 14 : minion.type === 'ranged' ? 9 : 11;

      ctx.save();
      ctx.fillStyle = color;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(minion.x, minion.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Health bar
      this.drawHealthBar(ctx, minion.x, minion.y - radius - 8, 28, 4, minion.hp, minion.maxHp, color);
      ctx.restore();
    });
  }

  // --- HEROES ---
  private drawHeroes(ctx: CanvasRenderingContext2D, engine: GameEngine) {
    engine.heroes.forEach(hero => {
      if (hero.isDead) return;

      // Bush stealth check:
      // If hero is inside bush and player is NOT inside the same bush, hide hero!
      const isPlayer = hero.id === engine.playerHero.id;
      const isAlly = hero.team === engine.playerHero.team;
      if (hero.inBush && !isPlayer && !isAlly && !engine.playerHero.inBush) {
        // Hero is hidden from player!
        return;
      }

      ctx.save();

      // 1. Team ring & Hero selection glow
      const isBlue = hero.team === 'blue';
      const teamColor = isBlue ? '#3b82f6' : '#ef4444';
      ctx.strokeStyle = isPlayer ? '#fbbf24' : teamColor;
      ctx.lineWidth = isPlayer ? 4 : 2.5;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
      ctx.beginPath();
      ctx.arc(hero.x, hero.y, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // 2. Facing direction indicator arrow
      const arrowX = hero.x + Math.cos(hero.rotation) * 28;
      const arrowY = hero.y + Math.sin(hero.rotation) * 28;
      ctx.strokeStyle = isPlayer ? '#fbbf24' : teamColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(hero.x + Math.cos(hero.rotation) * 20, hero.y + Math.sin(hero.rotation) * 20);
      ctx.lineTo(arrowX, arrowY);
      ctx.stroke();

      // 3. Hero Portrait inside circular clipping mask
      const img = this.heroImageCache.get(hero.id);
      if (img && img.complete) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(hero.x, hero.y, 20, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, hero.x - 20, hero.y - 20, 40, 40);
        ctx.restore();
      } else {
        // Fallback hero role badge
        ctx.fillStyle = teamColor;
        ctx.beginPath();
        ctx.arc(hero.x, hero.y, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px Rajdhani';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(hero.name.substring(0, 2).toUpperCase(), hero.x, hero.y);
      }

      // 4. Buffs & Status Auras
      // Blue Buff Aura (Cyan swirl ring)
      if (hero.buffs.blueBuff > 0) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(hero.x, hero.y, 28, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // Red Buff Aura (Crimson flame ring)
      if (hero.buffs.redBuff > 0) {
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 3]);
        ctx.beginPath();
        ctx.arc(hero.x, hero.y, 32, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // Turtle / Aegis Shield bubble
      if (hero.buffs.turtleShield > 0) {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(hero.x, hero.y, 30, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      // Stunned indicator (Golden spinning stars)
      if (hero.buffs.stunDuration > 0) {
        ctx.fillStyle = '#facc15';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('💫', hero.x, hero.y - 38);
      }

      // 5. MLBB Segmented Health Bar & Mana Bar & Level Badge
      const barWidth = 64;
      const barHeight = 8;
      const barX = hero.x - barWidth / 2;
      const barY = hero.y - 36;

      // Level badge circle on left
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = teamColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(barX - 8, barY + 4, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px Rajdhani';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${hero.level}`, barX - 8, barY + 4);

      // HP Bar background
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(barX, barY, barWidth, barHeight);

      // HP Fill
      const hpPercent = Math.max(0, Math.min(1, hero.currentHp / hero.maxHp));
      ctx.fillStyle = isBlue ? '#22c55e' : '#ef4444';
      ctx.fillRect(barX, barY, barWidth * hpPercent, barHeight);

      // MLBB 1000 HP notches (segmentation marks)
      const numSegments = Math.floor(hero.maxHp / 1000);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      for (let s = 1; s <= numSegments; s++) {
        const segX = barX + (s * 1000 / hero.maxHp) * barWidth;
        ctx.beginPath();
        ctx.moveTo(segX, barY);
        ctx.lineTo(segX, barY + barHeight);
        ctx.stroke();
      }

      // Border around HP bar
      ctx.strokeStyle = '#000000';
      ctx.strokeRect(barX, barY, barWidth, barHeight);

      // Mana Bar beneath HP bar
      if (hero.maxMana > 0) {
        const manaY = barY + barHeight + 1;
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(barX, manaY, barWidth, 3);
        const manaPercent = Math.max(0, Math.min(1, hero.currentMana / hero.maxMana));
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(barX, manaY, barWidth * manaPercent, 3);
      }

      // Hero Name
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px Rajdhani';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(hero.name, hero.x, barY - 2);

      ctx.restore();
    });
  }

  // --- VISUAL EFFECTS ---
  private drawVisualEffects(ctx: CanvasRenderingContext2D, engine: GameEngine) {
    engine.visualEffects.forEach(fx => {
      ctx.save();
      const progress = fx.life / fx.maxLife;
      const alpha = 1 - progress;
      ctx.globalAlpha = Math.max(0, alpha);

      if (fx.type === 'ring') {
        ctx.strokeStyle = fx.color;
        ctx.lineWidth = 4 * (1 - progress);
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, (fx.radius || 50) * (0.3 + progress * 0.7), 0, Math.PI * 2);
        ctx.stroke();
      } else if (fx.type === 'circle') {
        ctx.fillStyle = fx.color;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, fx.radius || 60, 0, Math.PI * 2);
        ctx.fill();
      } else if (fx.type === 'burst') {
        ctx.fillStyle = fx.color;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, (fx.radius || 40) * progress, 0, Math.PI * 2);
        ctx.fill();
      } else if (fx.type === 'slash') {
        ctx.strokeStyle = fx.color;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, fx.radius || 40, -Math.PI / 4, Math.PI / 2);
        ctx.stroke();
      } else if (fx.type === 'beam' && fx.targetX !== undefined && fx.targetY !== undefined) {
        // Layla / Tigreal Laser beam
        ctx.strokeStyle = fx.color;
        ctx.lineWidth = (fx.radius || 30) * (1 - progress * 0.5);
        ctx.shadowColor = fx.color;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.moveTo(fx.x, fx.y);
        ctx.lineTo(fx.targetX, fx.targetY);
        ctx.stroke();

        // White bright center core
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = (fx.radius || 30) * 0.35 * (1 - progress);
        ctx.stroke();
      } else if (fx.type === 'hook-chain' && fx.targetX !== undefined && fx.targetY !== undefined) {
        // Franco Hook Chain
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 4;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(fx.x, fx.y);
        ctx.lineTo(fx.targetX, fx.targetY);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.restore();
    });
  }

  // --- PROJECTILES ---
  private drawProjectiles(ctx: CanvasRenderingContext2D, engine: GameEngine) {
    engine.projectiles.forEach(p => {
      ctx.save();
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  // --- SKILL AIM RETICLE ---
  private drawAimReticle(ctx: CanvasRenderingContext2D, engine: GameEngine) {
    const aim = engine.activeSkillAim;
    if (!aim) return;

    const hero = engine.playerHero;
    const skill = aim.skill;
    const angle = aim.targetAngle;

    ctx.save();
    if (skill.targetType === 'direction' || skill.targetType === 'skillshot') {
      // Direction Arrow / Line
      const ex = hero.x + Math.cos(angle) * skill.range;
      const ey = hero.y + Math.sin(angle) * skill.range;

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
      ctx.lineWidth = skill.radius ? skill.radius * 2 : 16;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(hero.x, hero.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      // Range border circle
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hero.x, hero.y, skill.range, 0, Math.PI * 2);
      ctx.stroke();
    } else if (skill.targetType === 'area') {
      // Area circle indicator
      const tx = hero.x + Math.cos(angle) * Math.min(skill.range, 320);
      const ty = hero.y + Math.sin(angle) * Math.min(skill.range, 320);

      ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(tx, ty, skill.radius || 80, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // --- FLOATING TEXTS ---
  private drawFloatingTexts(ctx: CanvasRenderingContext2D, engine: GameEngine) {
    engine.floatingTexts.forEach(ft => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, ft.alpha);
      ctx.fillStyle = ft.color;
      ctx.font = `bold ${ft.fontSize}px Rajdhani`;
      ctx.textAlign = 'center';
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 4;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    });
  }

  // --- HEALTH BAR COMPONENT ---
  private drawHealthBar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    hp: number,
    maxHp: number,
    color: string,
    shieldPlates?: number
  ) {
    const rx = x - width / 2;
    // Bar Background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(rx, y, width, height);

    // HP Fill
    const pct = Math.max(0, Math.min(1, hp / maxHp));
    ctx.fillStyle = color;
    ctx.fillRect(rx, y, width * pct, height);

    // Border
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.strokeRect(rx, y, width, height);

    // Turret Shield Plates (5 segments)
    if (shieldPlates !== undefined && shieldPlates > 0) {
      ctx.fillStyle = '#f59e0b';
      const plateWidth = (width - 8) / 5;
      for (let p = 0; p < shieldPlates; p++) {
        ctx.fillRect(rx + 4 + p * plateWidth, y - 4, plateWidth - 2, 3);
      }
    }
  }

  // --- MINIMAP RENDERING ---
  public renderMinimap(
    ctx: CanvasRenderingContext2D,
    engine: GameEngine,
    size: number = 180
  ) {
    const scale = size / MAP_WIDTH;
    ctx.clearRect(0, 0, size, size);

    // Dark Map Base
    ctx.fillStyle = '#091216';
    ctx.fillRect(0, 0, size, size);

    // Lanes
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 6;
    // Top
    ctx.beginPath();
    ctx.moveTo(350 * scale, 2200 * scale);
    ctx.lineTo(400 * scale, 450 * scale);
    ctx.lineTo(2200 * scale, 400 * scale);
    ctx.stroke();
    // Mid
    ctx.beginPath();
    ctx.moveTo(350 * scale, 2250 * scale);
    ctx.lineTo(2250 * scale, 350 * scale);
    ctx.stroke();
    // Bot
    ctx.beginPath();
    ctx.moveTo(350 * scale, 2200 * scale);
    ctx.lineTo(2150 * scale, 2150 * scale);
    ctx.lineTo(2200 * scale, 400 * scale);
    ctx.stroke();

    // River
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 800 * scale);
    ctx.lineTo(2600 * scale, 1800 * scale);
    ctx.stroke();

    // Turrets
    engine.turrets.forEach(t => {
      ctx.fillStyle = t.destroyed ? '#475569' : t.team === 'blue' ? '#38bdf8' : '#f43f5e';
      ctx.beginPath();
      ctx.arc(t.x * scale, t.y * scale, t.tier === 4 ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // Minion dots
    engine.minions.forEach(m => {
      ctx.fillStyle = m.team === 'blue' ? '#93c5fd' : '#fca5a5';
      ctx.fillRect(m.x * scale - 1, m.y * scale - 1, 2, 2);
    });

    // Jungle Monster markers (Turtle / Lord)
    engine.monsters.forEach(m => {
      if (m.isAlive) {
        ctx.fillStyle = m.type === 'turtle' ? '#10b981' : m.type === 'lord' ? '#a855f7' : '#eab308';
        ctx.beginPath();
        ctx.arc(m.x * scale, m.y * scale, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Heroes
    engine.heroes.forEach(h => {
      if (h.isDead) return;
      const isPlayer = h.id === engine.playerHero.id;
      ctx.fillStyle = isPlayer ? '#fbbf24' : h.team === 'blue' ? '#3b82f6' : '#ef4444';
      ctx.beginPath();
      ctx.arc(h.x * scale, h.y * scale, isPlayer ? 5 : 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Camera view bounds rectangle
    const camLeft = (engine.camera.x - engine.camera.width / 2) * scale;
    const camTop = (engine.camera.y - engine.camera.height / 2) * scale;
    const camW = engine.camera.width * scale;
    const camH = engine.camera.height * scale;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(camLeft, camTop, camW, camH);
  }
}
