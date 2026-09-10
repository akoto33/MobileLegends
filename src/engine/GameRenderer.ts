// ============================================================================
//  Canvas renderer: terrain (cached), structures, jungle, units, fog of war,
//  pings, damage numbers and aiming indicators.
// ============================================================================

import { GameEngine } from './GameEngine';
import {
  BUSHES, CORES, FOUNTAINS, LANES, LANE_PATHS, MAP_H, MAP_W, WALLS, TURTLE_PIT, LORD_PIT
} from './GameMap';
import { Minion, Monster } from '../types/game';

const TERRAIN_SCALE = 0.5;

export class GameRenderer {
  private images = new Map<string, HTMLImageElement>();
  private terrain: HTMLCanvasElement | null = null;
  private fog: HTMLCanvasElement | null = null;
  private fogCtx: CanvasRenderingContext2D | null = null;
  private time = 0;

  constructor() {
    this.preload();
  }

  private preload() {
    if (typeof Image === 'undefined') return;   // non-DOM host (tests / SSR)
    const ids = ['layla', 'miya', 'tigreal', 'alucard', 'eudora', 'saber', 'zilong', 'nana', 'gusion', 'franco'];
    ids.forEach(id => {
      const img = new Image();
      img.src = `/heroes/${id}.jpg`;
      img.onload = () => this.images.set(id, img);
      img.onerror = () => { /* fallback badge is drawn instead */ };
      this.images.set(id, img);
    });
  }

  portrait(id: string): HTMLImageElement | undefined {
    const img = this.images.get(id);
    return img && img.complete && img.naturalWidth > 0 ? img : undefined;
  }

  // ==========================================================================
  //  Frame
  // ==========================================================================

  render(ctx: CanvasRenderingContext2D, e: GameEngine, w: number, h: number, dt: number) {
    this.time += dt;
    const cam = e.camera;
    const z = cam.zoom;
    const shakeX = cam.shake > 0 ? (Math.random() - 0.5) * 14 * cam.shake : 0;
    const shakeY = cam.shake > 0 ? (Math.random() - 0.5) * 14 * cam.shake : 0;

    ctx.save();
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, w, h);

    ctx.translate(w / 2 + shakeX, h / 2 + shakeY);
    ctx.scale(z, z);
    ctx.translate(-cam.x, -cam.y);

    const view = {
      x0: cam.x - w / 2 / z - 60, y0: cam.y - h / 2 / z - 60,
      x1: cam.x + w / 2 / z + 60, y1: cam.y + h / 2 / z + 60
    };
    const inView = (x: number, y: number, pad = 70) => x > view.x0 - pad && x < view.x1 + pad && y > view.y0 - pad && y < view.y1 + pad;

    this.drawTerrain(ctx);
    this.drawLanes(ctx);
    this.drawBases(ctx, e);
    this.drawBushes(ctx);
    this.drawWalls(ctx);

    this.turrets(ctx, e, inView);
    this.monsters(ctx, e, inView);
    this.minions(ctx, e, inView);
    this.heroes(ctx, e, inView);
    this.effects(ctx, e);
    this.projectiles(ctx, e);
    this.pings(ctx, e);
    this.floatingTexts(ctx, e);

    if (!e.player.dead) {
      this.attackRangeRing(ctx, e);
      this.aimIndicator(ctx, e);
    }

    // ---- fog of war ----
    this.drawFog(ctx, e, w, h, z, cam.x, cam.y);

    ctx.restore();

    // dead overlay
    if (e.player.dead) {
      ctx.save();
      ctx.fillStyle = 'rgba(8,10,20,0.42)';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  // ==========================================================================
  //  Terrain (drawn once, cached)
  // ==========================================================================

  private drawTerrain(ctx: CanvasRenderingContext2D) {
    if (!this.terrain) this.terrain = this.buildTerrain();
    ctx.drawImage(this.terrain, 0, 0, MAP_W, MAP_H);
  }

  private buildTerrain(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = Math.round(MAP_W * TERRAIN_SCALE);
    c.height = Math.round(MAP_H * TERRAIN_SCALE);
    const g = c.getContext('2d')!;
    const S = TERRAIN_SCALE;
    g.scale(S, S);

    // grass
    const grad = g.createLinearGradient(0, MAP_H, MAP_W, 0);
    grad.addColorStop(0, '#0d2a20');
    grad.addColorStop(0.5, '#10331f');
    grad.addColorStop(1, '#0d2a20');
    g.fillStyle = grad;
    g.fillRect(0, 0, MAP_W, MAP_H);

    // grass speckle
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * MAP_W, y = Math.random() * MAP_H;
      g.fillStyle = Math.random() > 0.5 ? 'rgba(40,110,70,0.20)' : 'rgba(10,35,24,0.35)';
      g.fillRect(x, y, 3 + Math.random() * 8, 2 + Math.random() * 5);
    }

    // river band along the main diagonal
    g.save();
    g.globalAlpha = 0.9;
    const rg = g.createLinearGradient(0, 0, MAP_W, MAP_H);
    rg.addColorStop(0, '#0b3a55');
    rg.addColorStop(0.5, '#12587d');
    rg.addColorStop(1, '#0b3a55');
    g.strokeStyle = rg;
    g.lineWidth = 300;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(180, 180);
    g.quadraticCurveTo(MAP_W / 2, MAP_H / 2, MAP_W - 180, MAP_H - 180);
    g.stroke();
    g.strokeStyle = 'rgba(125,211,252,0.28)';
    g.lineWidth = 5;
    for (let i = -2; i <= 2; i++) {
      g.beginPath();
      g.moveTo(180 + i * 55, 180 - i * 55);
      g.quadraticCurveTo(MAP_W / 2 + i * 60, MAP_H / 2 - i * 60, MAP_W - 180 + i * 55, MAP_H - 180 - i * 55);
      g.stroke();
    }
    g.restore();

    // map border rock
    g.strokeStyle = '#0b1220';
    g.lineWidth = 120;
    g.strokeRect(-40, -40, MAP_W + 80, MAP_H + 80);
    g.strokeStyle = 'rgba(148,163,184,0.16)';
    g.lineWidth = 6;
    g.strokeRect(60, 60, MAP_W - 120, MAP_H - 120);

    // objective pits
    const pit = (x: number, y: number, r: number, col: string) => {
      g.save();
      g.fillStyle = 'rgba(6,20,32,0.75)';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = col; g.lineWidth = 4; g.setLineDash([16, 12]);
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
      g.restore();
    };
    pit(TURTLE_PIT.x, TURTLE_PIT.y, TURTLE_PIT.r, 'rgba(16,185,129,0.55)');
    pit(LORD_PIT.x, LORD_PIT.y, LORD_PIT.r, 'rgba(168,85,247,0.55)');

    return c;
  }

  private drawLanes(ctx: CanvasRenderingContext2D) {
    LANES.forEach(lane => {
      const pts = LANE_PATHS[lane];
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#2b3446';
      ctx.lineWidth = 132;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      ctx.strokeStyle = '#3d475c';
      ctx.lineWidth = 104;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(226,232,240,0.10)';
      ctx.lineWidth = 3;
      ctx.setLineDash([26, 22]);
      ctx.stroke();
      ctx.setLineDash([]);
    });
  }

  private drawBases(ctx: CanvasRenderingContext2D, e: GameEngine) {
    (['blue', 'red'] as const).forEach(team => {
      const f = FOUNTAINS[team];
      const core = CORES[team];
      const col = team === 'blue' ? '#3b82f6' : '#f43f5e';
      ctx.save();
      const g = ctx.createRadialGradient(core.x, core.y, 20, core.x, core.y, 330);
      g.addColorStop(0, team === 'blue' ? 'rgba(30,64,175,0.55)' : 'rgba(136,19,55,0.55)');
      g.addColorStop(1, 'rgba(2,6,23,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(core.x, core.y, 330, 0, Math.PI * 2); ctx.fill();

      ctx.strokeStyle = col;
      ctx.lineWidth = 5;
      ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.arc(core.x, core.y, 118, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([12, 10]);
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // fountain heal pulse
      const pulse = 0.4 + 0.25 * Math.sin(this.time * 2 + (team === 'blue' ? 0 : Math.PI));
      ctx.fillStyle = team === 'blue' ? `rgba(59,130,246,${pulse * 0.25})` : `rgba(244,63,94,${pulse * 0.25})`;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * pulse + 60, 0, Math.PI * 2); ctx.fill();

      const alive = e.turrets.filter(t => t.team === team && t.tier === 5 && !t.destroyed).length;
      if (!alive) {
        ctx.fillStyle = 'rgba(30,41,59,0.7)';
        ctx.beginPath(); ctx.arc(core.x, core.y, 60, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    });
  }

  private drawBushes(ctx: CanvasRenderingContext2D) {
    ctx.save();
    BUSHES.forEach(b => {
      ctx.fillStyle = 'rgba(20,83,45,0.72)';
      ctx.strokeStyle = 'rgba(74,222,128,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, 20);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(34,154,88,0.65)';
      for (let i = 12; i < b.w - 6; i += 22) {
        for (let j = 10; j < b.h - 4; j += 20) {
          ctx.beginPath();
          ctx.arc(b.x + i + (j % 2 ? 6 : -6), b.y + j, 9, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
    ctx.restore();
  }

  private drawWalls(ctx: CanvasRenderingContext2D) {
    ctx.save();
    WALLS.forEach(wl => {
      ctx.fillStyle = '#0a1424';
      ctx.beginPath(); ctx.roundRect(wl.x, wl.y, wl.w, wl.h, 14); ctx.fill();
      ctx.strokeStyle = 'rgba(100,116,139,0.35)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = 'rgba(51,65,85,0.55)';
      ctx.beginPath(); ctx.roundRect(wl.x + 4, wl.y + 4, Math.max(6, wl.w - 8), Math.max(6, wl.h - 8), 10); ctx.fill();
    });
    ctx.restore();
  }

  // ==========================================================================
  //  Structures & units
  // ==========================================================================

  private turrets(ctx: CanvasRenderingContext2D, e: GameEngine, inView: (x: number, y: number, p?: number) => boolean) {
    for (const t of e.turrets) {
      if (!inView(t.x, t.y, 120)) continue;
      const blue = t.team === 'blue';
      const col = blue ? '#38bdf8' : '#fb7185';
      if (t.destroyed) {
        ctx.save();
        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = 'rgba(148,163,184,0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(t.x, t.y, t.tier === 5 ? 44 : 30, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(71,85,105,0.7)';
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.arc(t.x + Math.cos(i * 1.9) * 16, t.y + Math.sin(i * 1.9) * 16, 7, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        continue;
      }

      const vulnerable = e.turretVulnerable(t);
      ctx.save();
      // range
      ctx.strokeStyle = vulnerable ? (blue ? 'rgba(56,189,248,0.16)' : 'rgba(251,113,133,0.16)') : 'rgba(148,163,184,0.10)';
      ctx.setLineDash([10, 10]);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(t.x, t.y, t.range, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);

      // beam to target
      if (t.targetUid) {
        const tgt = e.unitByUid(t.targetUid);
        if (tgt) {
          ctx.strokeStyle = col;
          ctx.globalAlpha = 0.25 + 0.2 * Math.sin(this.time * 9);
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(tgt.x, tgt.y); ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      // body
      const size = t.tier === 5 ? 46 : t.tier === 4 ? 36 : 30;
      ctx.fillStyle = '#111827';
      ctx.strokeStyle = col;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.roundRect(t.x - size, t.y - size, size * 2, size * 2, 10); ctx.fill(); ctx.stroke();
      ctx.fillStyle = col;
      ctx.shadowColor = col; ctx.shadowBlur = 22;
      ctx.beginPath(); ctx.arc(t.x, t.y - 4, size * 0.42, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;

      // tier pips
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 12px Rajdhani, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(['', 'I', 'II', 'III', 'IV', 'CORE'][t.tier], t.x, t.y + size + 14);

      // plates
      if (t.plates > 0) {
        for (let p = 0; p < t.plates; p++) {
          ctx.fillStyle = '#f59e0b';
          ctx.fillRect(t.x - 32 + p * 13, t.y - size - 12, 11, 5);
        }
      }
      this.bar(ctx, t.x, t.y - size - 22, 76, 8, t.hp / t.maxHp, col, `${Math.round(t.hp)}`);
      if (!vulnerable) {
        ctx.fillStyle = 'rgba(226,232,240,0.85)';
        ctx.font = 'bold 11px Rajdhani, sans-serif';
        ctx.fillText('SHIELDED', t.x, t.y - size - 32);
      }
      ctx.restore();
    }
  }

  private monsters(ctx: CanvasRenderingContext2D, e: GameEngine, inView: (x: number, y: number, p?: number) => boolean) {
    for (const m of e.monsters) {
      if (!inView(m.x, m.y, 120)) continue;
      if (!m.alive) {
        ctx.save();
        ctx.strokeStyle = 'rgba(148,163,184,0.35)';
        ctx.setLineDash([6, 8]);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(m.spawnX, m.spawnY, 30, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 13px Rajdhani, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.ceil(m.respawnTimer)}s`, m.spawnX, m.spawnY + 4);
        ctx.restore();
        continue;
      }
      const col = monsterColor(m);
      const r = monsterRadius(m);
      ctx.save();
      ctx.fillStyle = 'rgba(2,6,23,0.55)';
      ctx.beginPath(); ctx.ellipse(m.x, m.y + r * 0.55, r * 1.05, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = col;
      ctx.strokeStyle = '#0b1220';
      ctx.lineWidth = 3;
      ctx.beginPath();
      // body: diamond for big camps, circle for small
      if (m.camp === 'turtle' || m.camp === 'lord') {
        ctx.ellipse(m.x, m.y, r, r * 0.82, 0, 0, Math.PI * 2);
      } else if (m.camp === 'small') {
        ctx.moveTo(m.x, m.y - r); ctx.lineTo(m.x + r, m.y); ctx.lineTo(m.x, m.y + r); ctx.lineTo(m.x - r, m.y); ctx.closePath();
      } else {
        ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
      }
      ctx.fill(); ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.arc(m.x - r * 0.25, m.y - r * 0.25, r * 0.22, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 12px Rajdhani, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(m.name, m.x, m.y - r - 18);
      this.bar(ctx, m.x, m.y - r - 14, r * 2.4, 6, m.hp / m.maxHp, col);
      if (m.targetUid !== null) {
        ctx.strokeStyle = 'rgba(239,68,68,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(m.x, m.y, r + 8, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
  }

  private minions(ctx: CanvasRenderingContext2D, e: GameEngine, inView: (x: number, y: number, p?: number) => boolean) {
    for (const m of e.minions) {
      if (!inView(m.x, m.y, 40)) continue;
      if (m.visibleToFriendly === false) continue;
      const blue = m.team === 'blue';
      const col = blue ? '#60a5fa' : '#f87171';
      const r = minionRadius(m);
      ctx.save();
      ctx.fillStyle = 'rgba(2,6,23,0.4)';
      ctx.beginPath(); ctx.ellipse(m.x, m.y + r * 0.6, r, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = m.isLord ? '#a855f7' : col;
      ctx.strokeStyle = m.kind === 'super' ? '#fbbf24' : '#0b1220';
      ctx.lineWidth = m.kind === 'super' ? 3 : 1.6;
      ctx.beginPath();
      if (m.kind === 'ranged') {
        ctx.moveTo(m.x, m.y - r); ctx.lineTo(m.x + r, m.y + r); ctx.lineTo(m.x - r, m.y + r); ctx.closePath();
      } else if (m.kind === 'siege' || m.kind === 'lord') {
        ctx.roundRect(m.x - r, m.y - r, r * 2, r * 2, 5);
      } else {
        ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
      }
      ctx.fill(); ctx.stroke();
      if (m.hp < m.maxHp) this.bar(ctx, m.x, m.y - r - 9, r * 2.4, 3.5, m.hp / m.maxHp, col);
      ctx.restore();
    }
  }

  private heroes(ctx: CanvasRenderingContext2D, e: GameEngine, inView: (x: number, y: number, p?: number) => boolean) {
    for (const h of e.heroes) {
      if (h.dead) continue;
      const enemy = h.team !== e.player.team;
      if (enemy && !h.visibleToFriendly) continue;      // fog of war
      if (!inView(h.x, h.y, 120)) continue;

      const blue = h.team === 'blue';
      const teamCol = blue ? '#3b82f6' : '#ef4444';
      const isMe = h.isPlayer;
      const r = 25;

      ctx.save();
      // ground shadow + team ring
      ctx.fillStyle = 'rgba(2,6,23,0.55)';
      ctx.beginPath(); ctx.ellipse(h.x, h.y + r * 0.72, r * 0.95, r * 0.42, 0, 0, Math.PI * 2); ctx.fill();

      if (h.inBush && !isMe) ctx.globalAlpha = 0.55;

      ctx.strokeStyle = isMe ? '#fbbf24' : teamCol;
      ctx.lineWidth = isMe ? 4 : 2.5;
      ctx.fillStyle = 'rgba(15,23,42,0.7)';
      ctx.beginPath(); ctx.arc(h.x, h.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

      // portrait
      const img = this.portrait(h.defId);
      if (img) {
        ctx.save();
        ctx.beginPath(); ctx.arc(h.x, h.y, r - 3, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(img, h.x - r + 3, h.y - r + 3, (r - 3) * 2, (r - 3) * 2);
        ctx.restore();
      } else {
        ctx.fillStyle = teamCol;
        ctx.beginPath(); ctx.arc(h.x, h.y, r - 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 15px Rajdhani, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(h.name.slice(0, 2).toUpperCase(), h.x, h.y);
        ctx.textBaseline = 'alphabetic';
      }

      // facing dagger
      ctx.strokeStyle = isMe ? '#fbbf24' : teamCol;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(h.x + h.facing.x * (r + 2), h.y + h.facing.y * (r + 2));
      ctx.lineTo(h.x + h.facing.x * (r + 15), h.y + h.facing.y * (r + 15));
      ctx.stroke();

      // buffs
      if (h.buffs.blueBuff > 0) this.aura(ctx, h.x, h.y, r + 9, '#38bdf8', this.time * 2);
      if (h.buffs.redBuff > 0) this.aura(ctx, h.x, h.y, r + 13, '#f43f5e', this.time * 2.4);
      if (h.buffs.shield > 0) {
        ctx.fillStyle = 'rgba(125,211,252,0.22)';
        ctx.strokeStyle = '#7dd3fc'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(h.x, h.y, r + 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      if (h.buffs.stealth > 0) { ctx.globalAlpha = 0.35; }

      // name plate
      const bw = 74;
      const bx = h.x - bw / 2;
      const by = h.y - r - 26;
      ctx.fillStyle = '#0b1220';
      ctx.fillRect(bx, by, bw, 9);
      ctx.fillStyle = blue ? '#22c55e' : '#ef4444';
      ctx.fillRect(bx, by, bw * Math.max(0, h.hp / h.stats.maxHp), 9);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, bw, 9);
      if (h.stats.maxMana > 0) {
        ctx.fillStyle = '#0b1220'; ctx.fillRect(bx, by + 10, bw, 4);
        ctx.fillStyle = '#38bdf8'; ctx.fillRect(bx, by + 10, bw * (h.mana / h.stats.maxMana), 4);
      }
      // level badge
      ctx.fillStyle = '#111827';
      ctx.strokeStyle = teamCol; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(bx - 11, by + 6, 9.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 11px Teko, Rajdhani, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${h.level}`, bx - 11, by + 10);

      ctx.fillStyle = isMe ? '#fde68a' : '#e2e8f0';
      ctx.font = `${isMe ? 'bold ' : ''}12px Rajdhani, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`${h.name}${isMe ? ' (you)' : ''}`, h.x, by - 5);

      if (h.buffs.stun > 0) {
        ctx.fillStyle = '#facc15';
        ctx.font = '14px sans-serif';
        ctx.fillText('💫', h.x, by - 18);
      }
      if (h.runtime.attackOrderUid && isMe) {
        ctx.strokeStyle = '#f87171'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.arc(h.x, h.y, r + 14, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }
  }

  private aura(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, t: number) {
    ctx.save();
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.setLineDash([7, 7]);
    ctx.lineDashOffset = t * 24;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  private effects(ctx: CanvasRenderingContext2D, e: GameEngine) {
    for (const fx of e.effects) {
      const p = fx.life / fx.maxLife;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - p);
      if (fx.type === 'ring' || fx.type === 'shockwave') {
        ctx.strokeStyle = fx.color;
        ctx.lineWidth = (fx.type === 'shockwave' ? 9 : 5) * (1 - p * 0.7);
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, fx.radius * (0.25 + p * 0.85), 0, Math.PI * 2);
        ctx.stroke();
      } else if (fx.type === 'circle') {
        ctx.fillStyle = fx.color;
        ctx.globalAlpha *= 0.55;
        ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.radius, 0, Math.PI * 2); ctx.fill();
      } else if (fx.type === 'burst') {
        ctx.fillStyle = fx.color;
        ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.radius * (0.35 + p), 0, Math.PI * 2); ctx.fill();
      } else if (fx.type === 'slash') {
        ctx.strokeStyle = fx.color;
        ctx.lineWidth = 6 * (1 - p);
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, fx.radius, -Math.PI / 3 + p * 2, Math.PI / 2 + p * 2);
        ctx.stroke();
      } else if (fx.type === 'beam' && fx.x2 !== undefined && fx.y2 !== undefined) {
        ctx.strokeStyle = fx.color;
        ctx.lineWidth = (fx.radius || 30) * (1 - p * 0.55);
        ctx.shadowColor = fx.color; ctx.shadowBlur = 18;
        ctx.beginPath(); ctx.moveTo(fx.x, fx.y); ctx.lineTo(fx.x2, fx.y2); ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = (fx.radius || 30) * 0.3 * (1 - p);
        ctx.stroke();
      } else if (fx.type === 'chain' && fx.x2 !== undefined && fx.y2 !== undefined) {
        ctx.strokeStyle = fx.color;
        ctx.lineWidth = 5;
        ctx.setLineDash([9, 7]);
        ctx.beginPath(); ctx.moveTo(fx.x, fx.y); ctx.lineTo(fx.x2!, fx.y2!); ctx.stroke();
      } else if (fx.type === 'hit') {
        ctx.fillStyle = fx.color;
        ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.radius * (1 - p), 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }

  private projectiles(ctx: CanvasRenderingContext2D, e: GameEngine) {
    for (const p of e.projectiles) {
      ctx.save();
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill();
      if (p.sourceKind === 'turret') {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.radius + 4, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
  }

  private pings(ctx: CanvasRenderingContext2D, e: GameEngine) {
    for (const p of e.pings) {
      const age = 6 - p.life;
      const a = Math.max(0, Math.min(1, p.life / 1.6));
      ctx.save();
      ctx.globalAlpha = a;
      const col = p.team === e.player.team ? '#38bdf8' : '#f87171';
      const pulse = 26 + (age % 0.9) * 70;
      ctx.strokeStyle = col;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI * 2); ctx.fill();
      const glyph = { attack: '⚔', retreat: '⛔', help: '❗', gather: '✦', enemy: '☠', thanks: '☺', nice: '★' }[p.kind];
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 20px Rajdhani, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(glyph, p.x, p.y - 22);
      ctx.font = 'bold 12px Rajdhani, sans-serif';
      ctx.fillText(p.fromName, p.x, p.y + 30);
      ctx.restore();
    }
  }

  private floatingTexts(ctx: CanvasRenderingContext2D, e: GameEngine) {
    for (const f of e.floats) {
      const a = Math.max(0, 1 - f.life / f.maxLife);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = f.color;
      ctx.font = `bold ${f.fontSize}px Rajdhani, sans-serif`;
      ctx.textAlign = 'center';
      ctx.shadowColor = '#000'; ctx.shadowBlur = 5;
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
  }

  private attackRangeRing(ctx: CanvasRenderingContext2D, e: GameEngine) {
    const p = e.player;
    ctx.save();
    ctx.strokeStyle = 'rgba(251,191,36,0.22)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 10]);
    ctx.beginPath(); ctx.arc(p.x, p.y, e.attackRange(p), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  private aimIndicator(ctx: CanvasRenderingContext2D, e: GameEngine) {
    const aim = e.aim;
    if (!aim || !aim.aiming) return;
    const p = e.player;
    const skill = p.def.skills[aim.skillIndex];
    if (!skill) return;
    const range = skill.range || e.attackRange(p);
    const ex = p.x + Math.cos(aim.angle) * range;
    const ey = p.y + Math.sin(aim.angle) * range;
    const ok = p.mana >= skill.manaCost && p.cooldowns[aim.skillIndex] <= 0 && p.skillLevels[aim.skillIndex] > 0;
    const col = ok ? 'rgba(56,189,248,0.9)' : 'rgba(248,113,113,0.9)';
    ctx.save();
    ctx.strokeStyle = col;
    ctx.fillStyle = ok ? 'rgba(56,189,248,0.14)' : 'rgba(248,113,113,0.14)';
    ctx.lineWidth = 3;
    if (skill.targetType === 'area' || skill.targetType === 'lock') {
      const rad = skill.radius || 90;
      ctx.beginPath(); ctx.arc(ex, ey, rad, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ex, ey); ctx.setLineDash([6, 8]); ctx.stroke();
    } else if (skill.targetType === 'self' || skill.targetType === 'buff') {
      ctx.beginPath(); ctx.arc(p.x, p.y, range > 60 ? range : 130, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else {
      const width = (skill.radius || 70) / 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(ex, ey);
      ctx.lineWidth = Math.max(10, width * 2);
      ctx.globalAlpha = 0.28;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x, p.y, range, 0, Math.PI * 2); ctx.setLineDash([10, 12]); ctx.stroke();
    }
    ctx.restore();
  }

  // ==========================================================================
  //  Fog of war
  // ==========================================================================

  private drawFog(ctx: CanvasRenderingContext2D, e: GameEngine, w: number, h: number, z: number, camX: number, camY: number) {
    if (!this.fog || this.fog.width !== Math.ceil(w / 2) || this.fog.height !== Math.ceil(h / 2)) {
      this.fog = document.createElement('canvas');
      this.fog.width = Math.max(1, Math.ceil(w / 2));
      this.fog.height = Math.max(1, Math.ceil(h / 2));
      this.fogCtx = this.fog.getContext('2d');
    }
    const fw = this.fog.width, fh = this.fog.height;
    const g = this.fogCtx!;
    const s = 0.5;
    g.clearRect(0, 0, fw, fh);
    g.fillStyle = 'rgba(3,6,15,0.72)';
    g.fillRect(0, 0, fw, fh);
    g.globalCompositeOperation = 'destination-out';

    const punch = (x: number, y: number, r: number, strength = 1) => {
      const sx = (x - camX) * z * s + fw / 2;
      const sy = (y - camY) * z * s + fh / 2;
      const sr = Math.max(4, r * z * s);
      if (sx < -sr || sy < -sr || sx > fw + sr || sy > fh + sr) return;
      const grd = g.createRadialGradient(sx, sy, sr * 0.55, sx, sy, sr);
      grd.addColorStop(0, `rgba(0,0,0,${strength})`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(sx, sy, sr, 0, Math.PI * 2); g.fill();
    };

    for (const src of e.visionSources) punch(src.x, src.y, src.r);
    punch(e.player.x, e.player.y, e.player.dead ? 240 : 620);
    for (const p of e.pings) {
      if (p.team === e.player.team) punch(p.x, p.y, 260, 0.7);
    }
    g.globalCompositeOperation = 'source-over';

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.fog, 0, 0, w, h);
    ctx.restore();
  }

  // ==========================================================================
  //  Minimap
  // ==========================================================================

  renderMinimap(ctx: CanvasRenderingContext2D, e: GameEngine, size: number, onClick?: boolean) {
    const sc = size / MAP_W;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#08130f';
    ctx.fillRect(0, 0, size, size);

    // lanes
    ctx.strokeStyle = 'rgba(148,163,184,0.30)';
    ctx.lineWidth = 5;
    LANES.forEach(lane => {
      const pts = LANE_PATHS[lane];
      ctx.beginPath();
      ctx.moveTo(pts[0].x * sc, pts[0].y * sc);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * sc, pts[i].y * sc);
      ctx.stroke();
    });
    // river
    ctx.strokeStyle = 'rgba(2,132,199,0.5)';
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(120 * sc, 120 * sc); ctx.lineTo((MAP_W - 120) * sc, (MAP_H - 120) * sc); ctx.stroke();

    // fog on minimap
    ctx.fillStyle = 'rgba(3,6,15,0.62)';
    ctx.fillRect(0, 0, size, size);
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    const light = (x: number, y: number, r: number) => {
      const g = ctx.createRadialGradient(x * sc, y * sc, 0, x * sc, y * sc, Math.max(6, r * sc));
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x * sc, y * sc, Math.max(6, r * sc), 0, Math.PI * 2); ctx.fill();
    };
    for (const s of e.visionSources) light(s.x, s.y, s.r * 1.05);
    ctx.restore();

    // structures
    for (const t of e.turrets) {
      ctx.fillStyle = t.destroyed ? '#475569' : t.team === 'blue' ? '#38bdf8' : '#fb7185';
      const s = t.tier === 5 ? 4.5 : 3;
      ctx.fillRect(t.x * sc - s / 2, t.y * sc - s / 2, s, s);
    }
    // camps
    for (const m of e.monsters) {
      if (!m.alive) continue;
      ctx.fillStyle = m.camp === 'turtle' ? '#10b981' : m.camp === 'lord' ? '#a855f7' : '#eab308';
      ctx.beginPath(); ctx.arc(m.x * sc, m.y * sc, 2.6, 0, Math.PI * 2); ctx.fill();
    }
    // minions
    for (const m of e.minions) {
      if (m.visibleToFriendly === false) continue;
      ctx.fillStyle = m.team === 'blue' ? '#93c5fd' : '#fca5a5';
      ctx.fillRect(m.x * sc - 1, m.y * sc - 1, 2.2, 2.2);
    }
    // heroes
    for (const h of e.heroes) {
      if (h.dead) continue;
      if (h.team !== e.player.team && !h.visibleToFriendly) continue;
      const isMe = h.isPlayer;
      ctx.fillStyle = isMe ? '#fbbf24' : h.team === 'blue' ? '#2563eb' : '#dc2626';
      ctx.beginPath(); ctx.arc(h.x * sc, h.y * sc, isMe ? 4.5 : 3.4, 0, Math.PI * 2); ctx.fill();
      if (isMe || h.team !== e.player.team) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(h.x * sc, h.y * sc, isMe ? 4.5 : 3.4, 0, Math.PI * 2); ctx.stroke();
      }
    }
    // pings
    for (const p of e.pings) {
      ctx.strokeStyle = p.team === e.player.team ? '#38bdf8' : '#f87171';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(p.x * sc, p.y * sc, 4 + (6 - p.life) * 1.5, 0, Math.PI * 2); ctx.stroke();
    }
    // camera box
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect((e.camera.x - e.camera.width / 2 / e.camera.zoom) * sc, (e.camera.y - e.camera.height / 2 / e.camera.zoom) * sc,
      (e.camera.width / e.camera.zoom) * sc, (e.camera.height / e.camera.zoom) * sc);
    void onClick;
  }

  // ==========================================================================
  private bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pct: number, col: string, label?: string) {
    const rx = x - w / 2;
    ctx.fillStyle = '#020617';
    ctx.fillRect(rx, y, w, h);
    ctx.fillStyle = col;
    ctx.fillRect(rx, y, w * Math.max(0, Math.min(1, pct)), h);
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.lineWidth = 1;
    ctx.strokeRect(rx, y, w, h);
    if (label) {
      ctx.fillStyle = '#e2e8f0';
      ctx.font = `bold ${Math.max(9, h)}px Rajdhani, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(label, x, y + h - 1);
    }
  }
}

function monsterColor(m: Monster) {
  switch (m.camp) {
    case 'blue-buff': return '#38bdf8';
    case 'red-buff': return '#ef4444';
    case 'turtle': return '#10b981';
    case 'lord': return '#a855f7';
    default: return '#f59e0b';
  }
}
function monsterRadius(m: Monster) {
  return m.camp === 'lord' ? 52 : m.camp === 'turtle' ? 40 : m.camp === 'small' ? 20 : 26;
}
function minionRadius(m: Minion) {
  return m.isLord ? 26 : m.kind === 'super' ? 16 : m.kind === 'siege' ? 14 : m.kind === 'ranged' ? 9 : 11;
}

