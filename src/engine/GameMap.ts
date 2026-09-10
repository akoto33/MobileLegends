// ============================================================================
//  Arena layout: lanes, turrets, jungle camps, terrain.
//  Blue base sits bottom-left, red base top-right (mirrored like classic MLBB).
//  Lanes: EXP runs up the left edge and across the top, GOLD runs across the
//  bottom and up the right edge, MID is the central diagonal.
// ============================================================================

import { Lane, Team, Turret, TurretTier, CampType } from '../types/game';

export const MAP_W = 2400;
export const MAP_H = 2400;
export const MAP_MARGIN = 90;

export const FOUNTAINS: Record<Team, { x: number; y: number; r: number }> = {
  blue: { x: 250, y: 2150, r: 170 },
  red: { x: 2150, y: 250, r: 170 }
};

export const CORES: Record<Team, { x: number; y: number }> = {
  blue: { x: 430, y: 1970 },
  red: { x: 1970, y: 430 }
};

/** Where each team spawns at the start of the match. */
export const SPAWN_POINTS: Record<Team, { x: number; y: number }> = {
  blue: { x: 300, y: 2080 },
  red: { x: 2100, y: 320 }
};

// ---------------------------------------------------------------------------
//  Lane geometry (waypoint polylines, written for blue -> red)
// ---------------------------------------------------------------------------

export const LANE_PATHS: Record<Lane, { x: number; y: number }[]> = {
  exp: [
    { x: 340, y: 1880 },
    { x: 335, y: 1560 },
    { x: 330, y: 1180 },
    { x: 335, y: 780 },
    { x: 420, y: 470 },
    { x: 700, y: 340 },
    { x: 1120, y: 335 },
    { x: 1560, y: 335 },
    { x: 1880, y: 420 },
    { x: 1990, y: 560 }
  ],
  mid: [
    { x: 590, y: 1810 },
    { x: 800, y: 1600 },
    { x: 1000, y: 1400 },
    { x: 1200, y: 1200 },
    { x: 1400, y: 1000 },
    { x: 1600, y: 800 },
    { x: 1810, y: 590 }
  ],
  gold: [
    { x: 520, y: 2065 },
    { x: 900, y: 2065 },
    { x: 1300, y: 2062 },
    { x: 1680, y: 2055 },
    { x: 1960, y: 1980 },
    { x: 2062, y: 1700 },
    { x: 2065, y: 1300 },
    { x: 2065, y: 900 },
    { x: 1990, y: 600 },
    { x: 1880, y: 500 }
  ]
};

export const LANES: Lane[] = ['exp', 'mid', 'gold'];

/** Blue minions walk the path forwards, red minions walk it reversed. */
export function lanePath(lane: Lane, team: Team): { x: number; y: number }[] {
  const p = LANE_PATHS[lane];
  return team === 'blue' ? p : [...p].reverse();
}

export function laneSpawn(lane: Lane, team: Team): { x: number; y: number } {
  return lanePath(lane, team)[0];
}

/** Point where the two waves of a lane collide - used for "meet" anchors. */
export function laneMeetPoint(lane: Lane): { x: number; y: number } {
  const p = LANE_PATHS[lane];
  return p[Math.floor(p.length / 2)];
}

/** A point slightly behind own outer turret: the safe farming spot. */
export function laneFarmPoint(lane: Lane, team: Team, which: 'safe' | 'meet' | 'deep' = 'meet') {
  const p = lanePath(lane, team);
  const idx = which === 'safe' ? 1 : which === 'deep' ? p.length - 3 : Math.floor(p.length / 2);
  return p[Math.max(0, Math.min(p.length - 1, idx))];
}

// ---------------------------------------------------------------------------
//  Turrets
// ---------------------------------------------------------------------------

interface TurretSpec {
  lane: Lane | 'base';
  tier: TurretTier;
  x: number;
  y: number;
  hp: number;
  plates: number;
}

const HP_BY_TIER: Record<TurretTier, number> = { 1: 5200, 2: 5600, 3: 6000, 4: 6400, 5: 9000 };
const DMG_BY_TIER: Record<TurretTier, number> = { 1: 165, 2: 180, 3: 195, 4: 215, 5: 240 };
const RANGE_BY_TIER: Record<TurretTier, number> = { 1: 330, 2: 330, 3: 340, 4: 350, 5: 360 };

const BLUE_TURRET_SPECS: TurretSpec[] = [
  // EXP lane: base -> inner -> outer
  { lane: 'exp', tier: 3, x: 350, y: 1700, hp: 0, plates: 0 },
  { lane: 'exp', tier: 2, x: 335, y: 1360, hp: 0, plates: 0 },
  { lane: 'exp', tier: 1, x: 332, y: 985, hp: 0, plates: 5 },
  // MID lane
  { lane: 'mid', tier: 3, x: 655, y: 1745, hp: 0, plates: 0 },
  { lane: 'mid', tier: 2, x: 875, y: 1525, hp: 0, plates: 0 },
  { lane: 'mid', tier: 1, x: 1095, y: 1305, hp: 0, plates: 5 },
  // GOLD lane
  { lane: 'gold', tier: 3, x: 705, y: 2062, hp: 0, plates: 0 },
  { lane: 'gold', tier: 2, x: 1075, y: 2062, hp: 0, plates: 0 },
  { lane: 'gold', tier: 1, x: 1460, y: 2058, hp: 0, plates: 5 },
  // Base guards + nexus
  { lane: 'base', tier: 4, x: 585, y: 2035, hp: 0, plates: 0 },
  { lane: 'base', tier: 4, x: 465, y: 1830, hp: 0, plates: 0 },
  { lane: 'base', tier: 5, x: CORES.blue.x, y: CORES.blue.y, hp: 0, plates: 0 }
];

/** 180 degree rotation about the map centre produces the red side. */
const mirror = (s: TurretSpec): TurretSpec => ({ ...s, x: MAP_W - s.x, y: MAP_H - s.y });
const mirrorPoint = (p: { x: number; y: number }) => ({ x: MAP_W - p.x, y: MAP_H - p.y });

export const TURRET_STATS = { HP_BY_TIER, DMG_BY_TIER, RANGE_BY_TIER };

export function createTurrets(): Turret[] {
  const out: Turret[] = [];
  let uid = 1;
  const push = (team: Team, spec: TurretSpec) => {
    const maxHp = spec.hp || (spec.tier === 5 ? HP_BY_TIER[5] : HP_BY_TIER[spec.tier]);
    out.push({
      utype: 'turret',
      uid: uid++,
      id: `turret_${team}_${spec.lane}_${spec.tier}_${uid}`,
      team,
      lane: spec.lane,
      tier: spec.tier,
      x: spec.x,
      y: spec.y,
      hp: maxHp,
      maxHp,
      range: RANGE_BY_TIER[spec.tier],
      damage: DMG_BY_TIER[spec.tier],
      attackSpeed: 1.05,
      attackTimer: Math.random() * 0.4,
      targetUid: null,
      ramp: 0,
      plates: spec.plates,
      maxPlates: spec.plates,
      suppressed: false,
      destroyed: false,
      lastHitTime: -999,
      physDef: spec.tier === 5 ? 22 : 16,
      magicDef: spec.tier === 5 ? 22 : 16,
      expReward: spec.tier === 5 ? 260 : 120
    });
  };

  BLUE_TURRET_SPECS.forEach(sp => push('blue', sp));
  BLUE_TURRET_SPECS.forEach(sp => push('red', mirror(sp)));
  return out;
}

/** Turret that must die before the next one in the lane becomes vulnerable. */
export function turretGateOrder(tier: TurretTier): number {
  return tier === 1 ? 0 : tier === 2 ? 1 : tier === 3 ? 2 : 3;
}

// ---------------------------------------------------------------------------
//  Jungle camps
// ---------------------------------------------------------------------------

export interface CampSpec {
  key: string;
  name: string;
  camp: CampType;
  x: number;
  y: number;
  hp: number;
  atk: number;
  def: number;
  bounty: number;
  exp: number;
  firstSpawn: number;
  respawn: number;
  buffDuration?: number;
  group?: number;
}

export const TURTLE_PIT = { x: 1465, y: 1465, r: 150 };
export const LORD_PIT = { x: 935, y: 935, r: 165 };

const BLUE_CAMPS: CampSpec[] = [
  {
    key: 'lizard', name: 'Blue Phoenix', camp: 'blue-buff', x: 690, y: 1520,
    hp: 4200, atk: 120, def: 12, bounty: 72, exp: 150, firstSpawn: 0, respawn: 80,
    buffDuration: 45, group: 1
  },
  {
    key: 'lion', name: 'Twin Lions', camp: 'small', x: 930, y: 1255,
    hp: 2600, atk: 95, def: 8, bounty: 42, exp: 95, firstSpawn: 0, respawn: 60, group: 1
  },
  {
    key: 'golem', name: 'Red Dragon', camp: 'red-buff', x: 1250, y: 1790,
    hp: 4400, atk: 135, def: 12, bounty: 72, exp: 150, firstSpawn: 0, respawn: 80,
    buffDuration: 45, group: 2
  },
  {
    key: 'ivy', name: 'Wind Ivy', camp: 'small', x: 1600, y: 1830,
    hp: 2800, atk: 100, def: 8, bounty: 46, exp: 100, firstSpawn: 0, respawn: 60, group: 2
  },
  {
    key: 'bull', name: 'Dragon Bull', camp: 'small', x: 700, y: 1900,
    hp: 3200, atk: 110, def: 10, bounty: 50, exp: 110, firstSpawn: 0, respawn: 65, group: 3
  }
];

/** Neutral ordering used by jungler rotations. */
export function blueJungleRoute(): CampSpec[] {
  return [BLUE_CAMPS[1], BLUE_CAMPS[0], BLUE_CAMPS[4], BLUE_CAMPS[3], BLUE_CAMPS[2]];
}

export function createCamps(): CampSpec[] {
  const all: CampSpec[] = [];
  BLUE_CAMPS.forEach(c => all.push({ ...c, key: `blue_${c.key}` }));
  BLUE_CAMPS.forEach(c => {
    const m = mirrorPoint({ x: c.x, y: c.y });
    all.push({ ...c, key: `red_${c.key}`, x: m.x, y: m.y });
  });
  return all;
}

export function campTeamSide(campKey: string): Team | 'neutral' {
  if (campKey.startsWith('blue_')) return 'blue';
  if (campKey.startsWith('red_')) return 'red';
  return 'neutral';
}

// ---------------------------------------------------------------------------
//  Terrain: bushes (stealth), walls (blocked) and the river.
// ---------------------------------------------------------------------------

export interface Bush { x: number; y: number; w: number; h: number }
export interface Wall { x: number; y: number; w: number; h: number }

const BLUE_BUSHES: Bush[] = [
  { x: 250, y: 1560, w: 150, h: 96 },   // exp lane, near blue base
  { x: 250, y: 1120, w: 140, h: 100 },  // exp lane brush
  { x: 560, y: 300, w: 150, h: 90 },     // exp lane top
  { x: 1180, y: 250, w: 170, h: 88 },    // exp lane top river side
  { x: 800, y: 1600, w: 120, h: 110 },   // mid river bush
  { x: 1520, y: 940, w: 130, h: 110 },   // mid river bush 2
  { x: 980, y: 1930, w: 170, h: 86 },    // gold lane bush
  { x: 1520, y: 1980, w: 160, h: 90 },   // gold lane bush 2
  { x: 2130, y: 1420, w: 120, h: 150 },  // gold river entrance
  { x: 1290, y: 1290, w: 130, h: 120 },  // mid lane center bush
  { x: 900, y: 1420, w: 110, h: 100 }    // jungle vision bush
];

const BLUE_WALLS: Wall[] = [
  // jungle wall between EXP lane and blue jungle
  { x: 470, y: 1300, w: 60, h: 400 },
  { x: 520, y: 1290, w: 250, h: 55 },
  // wall separating blue exp jungle from mid
  { x: 790, y: 1420, w: 55, h: 260 },
  // gold lane jungle walls
  { x: 900, y: 1770, w: 320, h: 55 },
  { x: 1380, y: 1620, w: 55, h: 260 },
  { x: 1420, y: 1600, w: 300, h: 55 },
  // river banks
  { x: 1120, y: 1420, w: 200, h: 48 },
  { x: 1080, y: 780, w: 48, h: 200 }
];

const rotateWall = (w: Wall): Wall => ({
  x: MAP_W - (w.x + w.w),
  y: MAP_H - (w.y + w.h),
  w: w.w,
  h: w.h
});

export const BUSHES: Bush[] = [
  ...BLUE_BUSHES,
  ...BLUE_BUSHES.map(b => ({
    x: MAP_W - (b.x + b.w),
    y: MAP_H - (b.y + b.h),
    w: b.w,
    h: b.h
  }))
];

export const WALLS: Wall[] = [...BLUE_WALLS, ...BLUE_WALLS.map(rotateWall)];

export function inBush(x: number, y: number): boolean {
  for (const b of BUSHES) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
  }
  return false;
}

/** River band along the main diagonal - heroes there move slightly faster. */
export function inRiver(x: number, y: number): boolean {
  const d = Math.abs(x - y);
  if (d > 210) return false;
  // exclude the middle, where the lanes cross
  return true;
}

export function pointInWall(x: number, y: number, pad = 0): boolean {
  for (const w of WALLS) {
    if (x >= w.x - pad && x <= w.x + w.w + pad && y >= w.y - pad && y <= w.y + w.h + pad) return true;
  }
  return false;
}

export function isWalkable(x: number, y: number, pad = 22): boolean {
  if (x < MAP_MARGIN || y < MAP_MARGIN || x > MAP_W - MAP_MARGIN || y > MAP_H - MAP_MARGIN) return false;
  return !pointInWall(x, y, pad);
}

/**
 * Steer from (x,y) toward (tx,ty). If the straight line is blocked, try the
 * nearest gap by sliding along the wall - cheap and good enough for a MOBA.
 */
export function steer(x: number, y: number, tx: number, ty: number, radius = 22): { x: number; y: number } {
  const dx = tx - x;
  const dy = ty - y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return { x: 0, y: 0 };
  const ux = dx / len;
  const uy = dy / len;

  // probe a few steps ahead; if blocked, rotate toward the first clear heading
  const probe = Math.min(90, len);
  const clear = (px: number, py: number) => isWalkable(px, py, radius * 0.75);
  if (clear(x + ux * probe, y + uy * probe)) return { x: ux, y: uy };

  for (const deg of [25, -25, 45, -45, 70, -70, 100, -100, 135, -135, 170, -170]) {
    const a = Math.atan2(uy, ux) + (deg * Math.PI) / 180;
    const nx = Math.cos(a);
    const ny = Math.sin(a);
    if (clear(x + nx * probe, y + ny * probe) && clear(x + nx * probe * 2, y + ny * probe * 2)) {
      return { x: nx, y: ny };
    }
  }
  return { x: ux, y: uy };
}

// ---------------------------------------------------------------------------
//  Timers & global balance knobs
// ---------------------------------------------------------------------------

export const TUNE = {
  minionWaveInterval: 27,
  firstWaveAt: 22,
  minionBaseHp: 1.0,
  creepScalePerMin: 0.085,
  passiveGoldPerSec: 3.4,
  heroVision: 620,
  minionVision: 260,
  turretVision: 400,
  bushRevealRadius: 130,
  turtleFirstSpawn: 105,
  turtleRespawn: 165,
  lordFirstSpawn: 195,
  lordRespawn: 210,
  xpCurveBase: 140,
  superMinionAfterInhib: true,
  respawnBase: 8,
  respawnPerLevel: 1.4,
  respawnMax: 32,
  fountainHealPct: 0.16,
  recallTime: 5.5,
  expShareRadius: 780
};
