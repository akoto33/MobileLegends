import { BushZone, JungleMonster, Turret, Lane } from '../types/game';

export const MAP_WIDTH = 2600;
export const MAP_HEIGHT = 2600;

export const FOUNTAIN_BLUE = { x: 280, y: 2320, radius: 180 };
export const FOUNTAIN_RED = { x: 2320, y: 280, radius: 180 };

// Lane waypoints for minion pathfinding
export const LANE_WAYPOINTS: Record<Lane, { blue: { x: number; y: number }[]; red: { x: number; y: number }[] }> = {
  top: {
    blue: [
      { x: 350, y: 2200 },
      { x: 380, y: 1550 },
      { x: 420, y: 550 },
      { x: 1200, y: 450 },
      { x: 1950, y: 420 },
      { x: 2200, y: 350 }
    ],
    red: [
      { x: 2200, y: 350 },
      { x: 1950, y: 420 },
      { x: 1200, y: 450 },
      { x: 420, y: 550 },
      { x: 380, y: 1550 },
      { x: 350, y: 2200 }
    ]
  },
  mid: {
    blue: [
      { x: 450, y: 2150 },
      { x: 800, y: 1800 },
      { x: 1300, y: 1300 },
      { x: 1800, y: 800 },
      { x: 2150, y: 450 }
    ],
    red: [
      { x: 2150, y: 450 },
      { x: 1800, y: 800 },
      { x: 1300, y: 1300 },
      { x: 800, y: 1800 },
      { x: 450, y: 2150 }
    ]
  },
  bot: {
    blue: [
      { x: 350, y: 2200 },
      { x: 1050, y: 2180 },
      { x: 2050, y: 2180 },
      { x: 2180, y: 1400 },
      { x: 2180, y: 650 },
      { x: 2200, y: 350 }
    ],
    red: [
      { x: 2200, y: 350 },
      { x: 2180, y: 650 },
      { x: 2180, y: 1400 },
      { x: 2050, y: 2180 },
      { x: 1050, y: 2180 },
      { x: 350, y: 2200 }
    ]
  }
};

// Initial Turret placements
export function createInitialTurrets(): Turret[] {
  return [
    // --- BLUE TEAM TURRETS ---
    // Nexus Core
    {
      id: 'turret_blue_core',
      team: 'blue',
      lane: 'base',
      tier: 4,
      x: 420,
      y: 2180,
      hp: 6500,
      maxHp: 6500,
      range: 300,
      attackCooldown: 0,
      targetId: null,
      shieldPlates: 0,
      destroyed: false
    },
    // Top Lane Blue
    {
      id: 'turret_blue_top_3',
      team: 'blue',
      lane: 'top',
      tier: 3,
      x: 400,
      y: 1950,
      hp: 4200,
      maxHp: 4200,
      range: 280,
      attackCooldown: 0,
      targetId: null,
      shieldPlates: 0,
      destroyed: false
    },
    {
      id: 'turret_blue_top_2',
      team: 'blue',
      lane: 'top',
      tier: 2,
      x: 400,
      y: 1500,
      hp: 4500,
      maxHp: 4500,
      range: 280,
      attackCooldown: 0,
      targetId: null,
      shieldPlates: 0,
      destroyed: false
    },
    {
      id: 'turret_blue_top_1',
      team: 'blue',
      lane: 'top',
      tier: 1,
      x: 440,
      y: 950,
      hp: 4600,
      maxHp: 4600,
      range: 280,
      attackCooldown: 0,
      targetId: null,
      shieldPlates: 5,
      destroyed: false
    },
    // Mid Lane Blue
    {
      id: 'turret_blue_mid_3',
      team: 'blue',
      lane: 'mid',
      tier: 3,
      x: 650,
      y: 1950,
      hp: 4200,
      maxHp: 4200,
      range: 280,
      attackCooldown: 0,
      targetId: null,
      shieldPlates: 0,
      destroyed: false
    },
    {
      id: 'turret_blue_mid_2',
      team: 'blue',
      lane: 'mid',
      tier: 2,
      x: 880,
      y: 1720,
      hp: 4500,
      maxHp: 4500,
      range: 280,
      attackCooldown: 0,
      targetId: null,
      shieldPlates: 0,
      destroyed: false
    },
    {
      id: 'turret_blue_mid_1',
      team: 'blue',
      lane: 'mid',
      tier: 1,
      x: 1080,
      y: 1520,
      hp: 4600,
      maxHp: 4600,
      range: 280,
      attackCooldown: 0,
      targetId: null,
      shieldPlates: 5,
      destroyed: false
    },
    // Bot Lane Blue
    {
      id: 'turret_blue_bot_3',
      team: 'blue',
      lane: 'bot',
      tier: 3,
      x: 650,
      y: 2200,
      hp: 4200,
      maxHp: 4200,
      range: 280,
      attackCooldown: 0,
      targetId: null,
      shieldPlates: 0,
      destroyed: false
    },
    {
      id: 'turret_blue_bot_2',
      team: 'blue',
      lane: 'bot',
      tier: 2,
      x: 1100,
      y: 2180,
      hp: 4500,
      maxHp: 4500,
      range: 280,
      attackCooldown: 0,
      targetId: null,
      shieldPlates: 0,
      destroyed: false
    },
    {
      id: 'turret_blue_bot_1',
      team: 'blue',
      lane: 'bot',
      tier: 1,
      x: 1650,
      y: 2160,
      hp: 4600,
      maxHp: 4600,
      range: 280,
      attackCooldown: 0,
      targetId: null,
      shieldPlates: 5,
      destroyed: false
    },

    // --- RED TEAM TURRETS ---
    // Nexus Core
    {
      id: 'turret_red_core',
      team: 'red',
      lane: 'base',
      tier: 4,
      x: 2180,
      y: 420,
      hp: 6500,
      maxHp: 6500,
      range: 300,
      attackCooldown: 0,
      targetId: null,
      shieldPlates: 0,
      destroyed: false
    },
    // Top Lane Red
    {
      id: 'turret_red_top_3',
      team: 'red',
      lane: 'top',
      tier: 3,
      x: 1950,
      y: 400,
      hp: 4200,
      maxHp: 4200,
      range: 280,
      attackCooldown: 0,
      targetId: null,
      shieldPlates: 0,
      destroyed: false
    },
    {
      id: 'turret_red_top_2',
      team: 'red',
      lane: 'top',
      tier: 2,
      x: 1500,
      y: 420,
      hp: 4500,
      maxHp: 4500,
      range: 280,
      attackCooldown: 0,
      targetId: null,
      shieldPlates: 0,
      destroyed: false
    },
    {
      id: 'turret_red_top_1',
      team: 'red',
      lane: 'top',
      tier: 1,
      x: 950,
      y: 440,
      hp: 4600,
      maxHp: 4600,
      range: 280,
      attackCooldown: 0,
      targetId: null,
      shieldPlates: 5,
      destroyed: false
    },
    // Mid Lane Red
    {
      id: 'turret_red_mid_3',
      team: 'red',
      lane: 'mid',
      tier: 3,
      x: 1950,
      y: 650,
      hp: 4200,
      maxHp: 4200,
      range: 280,
      attackCooldown: 0,
      targetId: null,
      shieldPlates: 0,
      destroyed: false
    },
    {
      id: 'turret_red_mid_2',
      team: 'red',
      lane: 'mid',
      tier: 2,
      x: 1720,
      y: 880,
      hp: 4500,
      maxHp: 4500,
      range: 280,
      attackCooldown: 0,
      targetId: null,
      shieldPlates: 0,
      destroyed: false
    },
    {
      id: 'turret_red_mid_1',
      team: 'red',
      lane: 'mid',
      tier: 1,
      x: 1520,
      y: 1080,
      hp: 4600,
      maxHp: 4600,
      range: 280,
      attackCooldown: 0,
      targetId: null,
      shieldPlates: 5,
      destroyed: false
    },
    // Bot Lane Red
    {
      id: 'turret_red_bot_3',
      team: 'red',
      lane: 'bot',
      tier: 3,
      x: 2200,
      y: 650,
      hp: 4200,
      maxHp: 4200,
      range: 280,
      attackCooldown: 0,
      targetId: null,
      shieldPlates: 0,
      destroyed: false
    },
    {
      id: 'turret_red_bot_2',
      team: 'red',
      lane: 'bot',
      tier: 2,
      x: 2180,
      y: 1100,
      hp: 4500,
      maxHp: 4500,
      range: 280,
      attackCooldown: 0,
      targetId: null,
      shieldPlates: 0,
      destroyed: false
    },
    {
      id: 'turret_red_bot_1',
      team: 'red',
      lane: 'bot',
      tier: 1,
      x: 2160,
      y: 1650,
      hp: 4600,
      maxHp: 4600,
      range: 280,
      attackCooldown: 0,
      targetId: null,
      shieldPlates: 5,
      destroyed: false
    }
  ];
}

// Jungle camps
export function createInitialMonsters(): JungleMonster[] {
  return [
    // Blue Buff (Fiend) - Blue Jungle
    {
      id: 'monster_blue_fiend_blue',
      name: 'Fiend (Blue Buff)',
      type: 'blue-buff',
      x: 750,
      y: 1750,
      spawnX: 750,
      spawnY: 1750,
      hp: 3500,
      maxHp: 3500,
      damage: 130,
      range: 120,
      isAlive: true,
      respawnTimer: 0,
      maxRespawnTimer: 75,
      attackCooldown: 0,
      targetId: null
    },
    // Red Buff (Lava Golem) - Blue Jungle
    {
      id: 'monster_red_golem_blue',
      name: 'Lava Golem (Red Buff)',
      type: 'red-buff',
      x: 1050,
      y: 1850,
      spawnX: 1050,
      spawnY: 1850,
      hp: 3700,
      maxHp: 3700,
      damage: 140,
      range: 120,
      isAlive: true,
      respawnTimer: 0,
      maxRespawnTimer: 75,
      attackCooldown: 0,
      targetId: null
    },
    // Blue Buff - Red Jungle
    {
      id: 'monster_blue_fiend_red',
      name: 'Fiend (Blue Buff)',
      type: 'blue-buff',
      x: 1850,
      y: 850,
      spawnX: 1850,
      spawnY: 850,
      hp: 3500,
      maxHp: 3500,
      damage: 130,
      range: 120,
      isAlive: true,
      respawnTimer: 0,
      maxRespawnTimer: 75,
      attackCooldown: 0,
      targetId: null
    },
    // Red Buff - Red Jungle
    {
      id: 'monster_red_golem_red',
      name: 'Lava Golem (Red Buff)',
      type: 'red-buff',
      x: 1550,
      y: 750,
      spawnX: 1550,
      spawnY: 750,
      hp: 3700,
      maxHp: 3700,
      damage: 140,
      range: 120,
      isAlive: true,
      respawnTimer: 0,
      maxRespawnTimer: 75,
      attackCooldown: 0,
      targetId: null
    },
    // River Crab (Lithowanderer)
    {
      id: 'monster_river_crab',
      name: 'River Crab',
      type: 'crab',
      x: 1250,
      y: 1350,
      spawnX: 1250,
      spawnY: 1350,
      hp: 1900,
      maxHp: 1900,
      damage: 60,
      range: 100,
      isAlive: true,
      respawnTimer: 0,
      maxRespawnTimer: 60,
      attackCooldown: 0,
      targetId: null
    },
    // The Turtle (Upper River)
    {
      id: 'monster_turtle',
      name: 'The Turtle',
      type: 'turtle',
      x: 950,
      y: 950,
      spawnX: 950,
      spawnY: 950,
      hp: 8500,
      maxHp: 8500,
      damage: 220,
      range: 140,
      isAlive: true,
      respawnTimer: 0,
      maxRespawnTimer: 120,
      attackCooldown: 0,
      targetId: null
    },
    // The Lord (Lower River)
    {
      id: 'monster_lord',
      name: 'The Lord',
      type: 'lord',
      x: 1650,
      y: 1650,
      spawnX: 1650,
      spawnY: 1650,
      hp: 14000,
      maxHp: 14000,
      damage: 320,
      range: 160,
      isAlive: true,
      respawnTimer: 0,
      maxRespawnTimer: 180,
      attackCooldown: 0,
      targetId: null
    }
  ];
}

// Grass bushes for stealth ambush
export const BUSH_ZONES: BushZone[] = [
  { id: 'bush_mid_top', x: 1180, y: 1180, width: 90, height: 90 },
  { id: 'bush_mid_bot', x: 1380, y: 1380, width: 90, height: 90 },
  { id: 'bush_top_river', x: 650, y: 700, width: 120, height: 70 },
  { id: 'bush_bot_river', x: 1900, y: 1850, width: 120, height: 70 },
  { id: 'bush_blue_buff', x: 620, y: 1680, width: 90, height: 90 },
  { id: 'bush_red_buff', x: 1980, y: 920, width: 90, height: 90 }
];
