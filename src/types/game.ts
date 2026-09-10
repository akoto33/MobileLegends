export type Role = 'Tank' | 'Fighter' | 'Assassin' | 'Mage' | 'Marksman' | 'Support';
export type DamageType = 'physical' | 'magic' | 'true';
export type Team = 'blue' | 'red';
export type Lane = 'top' | 'mid' | 'bot';

export interface Skill {
  id: string;
  name: string;
  cooldown: number; // in seconds
  manaCost: number;
  damageType: DamageType;
  baseDamage: number;
  scaling: number;
  range: number;
  radius?: number;
  description: string;
  iconName: string;
  isUltimate?: boolean;
  targetType: 'direction' | 'area' | 'lock' | 'self' | 'buff' | 'skillshot';
}

export interface Passive {
  name: string;
  description: string;
  iconName: string;
}

export interface HeroDef {
  id: string;
  name: string;
  title: string;
  role: Role;
  portrait: string;
  hp: number;
  maxHp: number;
  hpRegen: number;
  mana: number;
  maxMana: number;
  manaRegen: number;
  physAtk: number;
  magicPower: number;
  physDef: number;
  magicDef: number;
  attackSpeed: number; // attacks per sec
  moveSpeed: number;
  attackRange: number;
  passive: Passive;
  skills: [Skill, Skill, Skill];
}

export interface ItemStats {
  physAtk?: number;
  magicPower?: number;
  hp?: number;
  mana?: number;
  physDef?: number;
  magicDef?: number;
  attackSpeed?: number;
  moveSpeed?: number;
  lifesteal?: number;
  critChance?: number;
  cooldownReduction?: number;
}

export interface Item {
  id: string;
  name: string;
  category: 'attack' | 'magic' | 'defense' | 'movement';
  cost: number;
  icon: string;
  description: string;
  stats: ItemStats;
  passiveName?: string;
  passiveDesc?: string;
}

export interface BattleSpell {
  id: string;
  name: string;
  cooldown: number;
  description: string;
  icon: string;
}

export interface Turret {
  id: string;
  team: Team;
  lane: Lane | 'base';
  tier: 1 | 2 | 3 | 4; // 1: Outer, 2: Inner, 3: Base Inhibitor, 4: Nexus Core
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  range: number;
  attackCooldown: number;
  targetId: string | null;
  shieldPlates: number; // For outer turrets
  destroyed: boolean;
}

export interface Minion {
  id: string;
  team: Team;
  lane: Lane;
  type: 'melee' | 'ranged' | 'siege';
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  damage: number;
  range: number;
  speed: number;
  targetId: string | null;
  waypointIndex: number;
  attackCooldown: number;
}

export interface JungleMonster {
  id: string;
  name: string;
  type: 'blue-buff' | 'red-buff' | 'crab' | 'turtle' | 'lord';
  x: number;
  y: number;
  spawnX: number;
  spawnY: number;
  hp: number;
  maxHp: number;
  damage: number;
  range: number;
  isAlive: boolean;
  respawnTimer: number;
  maxRespawnTimer: number;
  attackCooldown: number;
  targetId: string | null;
}

export interface Projectile {
  id: string;
  sourceId: string;
  sourceTeam: Team;
  targetId?: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  maxDist: number;
  traveled: number;
  damage: number;
  damageType: DamageType;
  isTurretShot?: boolean;
  color: string;
  radius: number;
  skillId?: string;
  effectType?: 'stun' | 'slow' | 'hook' | 'aoe' | 'pierce';
  duration?: number;
  extra?: any;
}

export interface FloatingText {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  fontSize: number;
  alpha: number;
  life: number;
  maxLife: number;
  vy: number;
}

export interface VisualEffect {
  id: string;
  type: 'slash' | 'circle' | 'burst' | 'beam' | 'heal' | 'ring' | 'hook-chain';
  x: number;
  y: number;
  targetX?: number;
  targetY?: number;
  radius?: number;
  color: string;
  secondaryColor?: string;
  life: number;
  maxLife: number;
}

export interface BushZone {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HeroBuffs {
  blueBuff: number;
  redBuff: number;
  turtleShield: number;
  speedBoost: number;
  speedFactor: number;
  stunDuration: number;
  slowDuration: number;
  slowFactor: number;
  stealthDuration: number;
  invulnerableDuration: number;
  attackSpeedBoost: number;
  immortalityCooldown: number;
  nanaPassiveUsed?: boolean;
}

export interface HeroInstance extends HeroDef {
  currentHp: number;
  currentMana: number;
  level: number;
  exp: number;
  gold: number;
  kills: number;
  deaths: number;
  assists: number;
  creepScore: number;
  damageDealt: number;
  turretDamage: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  team: Team;
  isBot: boolean;
  botLane?: Lane | 'jungle' | 'roam';
  botState?: 'laning' | 'pushing' | 'fighting' | 'retreating' | 'jungling' | 'objective';
  skillLevels: [number, number, number];
  skillCooldowns: [number, number, number];
  basicAttackCooldown: number;
  spell: BattleSpell;
  spellCooldown: number;
  recallProgress: number | null; // 0 to 8
  regenCooldown: number;
  regenDuration: number;
  items: Item[];
  buffs: HeroBuffs;
  isDead: boolean;
  respawnTimer: number;
  inBush: boolean;
  targetEnemyId: string | null;
  // Hero specific state tracking:
  miyaStacks?: number;
  saberSwords?: number;
  gusionDaggersOut?: { x: number; y: number; vx: number; vy: number; id: string }[];
  francoHookActive?: boolean;
  nanaMolinaActive?: { x: number; y: number; life: number } | null;
}

export interface KillFeedItem {
  id: string;
  killerName: string;
  killerHero: string;
  killerTeam: Team;
  victimName: string;
  victimHero: string;
  victimTeam: Team;
  isTurret?: boolean;
  isMonster?: boolean;
  streakText?: string;
  time: number;
}

export interface GameAnnouncement {
  id: string;
  type: 'first-blood' | 'kill' | 'double' | 'triple' | 'maniac' | 'savage' | 'wiped' | 'turret' | 'lord' | 'turtle' | 'victory' | 'defeat';
  title: string;
  subtitle?: string;
  team: Team;
  duration: number;
}
