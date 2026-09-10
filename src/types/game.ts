// ============================================================================
//  Core type definitions for the 5v5 arena simulation.
// ============================================================================

export type Role = 'Tank' | 'Fighter' | 'Assassin' | 'Mage' | 'Marksman' | 'Support';
export type DamageType = 'physical' | 'magic' | 'true';
export type Team = 'blue' | 'red';

/** MLBB lane names: EXP lane (top side), Mid, Gold lane (bottom side). */
export type Lane = 'exp' | 'mid' | 'gold';
/** What a hero is assigned to do. */
export type LaneRole = Lane | 'jungle' | 'roam';

// ---------------------------------------------------------------------------
//  Hero definition data (static)
// ---------------------------------------------------------------------------

export interface Skill {
  id: string;
  name: string;
  cooldown: number;
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
  /** CC the skill applies, used by both the AI and the HUD. */
  crowdControl?: 'stun' | 'slow' | 'knockup' | 'none';
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
  attackSpeed: number;
  moveSpeed: number;
  attackRange: number;
  laneSuggestion: LaneRole;
  lanes: LaneRole[];
  passive: Passive;
  skills: [Skill, Skill, Skill];
}

// ---------------------------------------------------------------------------
//  Items & spells
// ---------------------------------------------------------------------------

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
  hpRegen?: number;
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

// ---------------------------------------------------------------------------
//  Structures
// ---------------------------------------------------------------------------

export type TurretTier = 1 | 2 | 3 | 4 | 5; // 1 outer, 2 inner, 3 base, 4 core guard, 5 nexus

export interface Turret {
  utype: 'turret';
  uid: number;
  id: string;
  team: Team;
  lane: Lane | 'base';
  tier: TurretTier;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  range: number;
  damage: number;
  attackSpeed: number;
  attackTimer: number;
  targetUid: number | null;
  /** consecutive shots on the same target - MLBB ramps turret damage. */
  ramp: number;
  plates: number;
  maxPlates: number;
  /** lane inhibitor (tier 3) down -> super minions */
  suppressed: boolean;
  destroyed: boolean;
  lastHitTime: number;
  physDef: number;
  magicDef: number;
  expReward: number;
}

export type MinionKind = 'melee' | 'ranged' | 'siege' | 'super' | 'lord';

export interface Minion {
  utype: 'minion';
  uid: number;
  team: Team;
  lane: Lane | 'base';
  kind: MinionKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  physAtk: number;
  physDef: number;
  magicDef: number;
  range: number;
  speed: number;
  attackTimer: number;
  attackWindup: number;
  waypoint: number;
  targetUid: number | null;
  bounty: number;
  exp: number;
  spawnWave: number;
  isLord?: boolean;
  aggroTimer: number;
  visibleToFriendly?: boolean;
}

export type CampType = 'blue-buff' | 'red-buff' | 'small' | 'turtle' | 'lord';

export interface Monster {
  utype: 'monster';
  uid: number;
  id: string;
  name: string;
  camp: CampType;
  side: Team | 'neutral';
  x: number;
  y: number;
  spawnX: number;
  spawnY: number;
  hp: number;
  maxHp: number;
  physAtk: number;
  physDef: number;
  magicDef: number;
  range: number;
  speed: number;
  aggroRadius: number;
  leashRadius: number;
  attackTimer: number;
  targetUid: number | null;
  aggroTimer: number;
  alive: boolean;
  respawnTimer: number;
  respawnAt: number;
  firstSpawnAt: number;
  bounty: number;
  exp: number;
  buffDuration: number;
  summonedBy?: Team | null;
}

// ---------------------------------------------------------------------------
//  Effects
// ---------------------------------------------------------------------------

export interface Projectile {
  uid: number;
  sourceUid: number;
  sourceTeam: Team;
  sourceKind: 'hero' | 'minion' | 'turret' | 'monster';
  targetUid: number | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  maxDist: number;
  traveled: number;
  damage: number;
  damageType: DamageType;
  color: string;
  radius: number;
  effect?: 'stun' | 'slow' | 'hook' | 'knockup' | 'pierce' | 'heal' | 'shield';
  ccDuration?: number;
  aoeRadius?: number;
  skillId?: string;
  hitUids?: number[];
  isTurretShot?: boolean;
  size?: number;
}

export interface FloatingText {
  uid: number;
  text: string;
  x: number;
  y: number;
  color: string;
  fontSize: number;
  life: number;
  maxLife: number;
  vy: number;
  crit?: boolean;
}

export interface VisualEffect {
  uid: number;
  type: 'ring' | 'circle' | 'burst' | 'slash' | 'beam' | 'chain' | 'text' | 'shockwave' | 'hit';
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  radius: number;
  color: string;
  life: number;
  maxLife: number;
  width?: number;
}

export interface MapPing {
  uid: number;
  kind: 'attack' | 'retreat' | 'help' | 'gather' | 'enemy' | 'thanks' | 'nice';
  x: number;
  y: number;
  team: Team;
  fromUid: number;
  fromName: string;
  life: number;
  lane?: Lane | 'jungle';
}

// ---------------------------------------------------------------------------
//  Hero runtime instance
// ---------------------------------------------------------------------------

export interface HeroBuffs {
  blueBuff: number;
  redBuff: number;
  shield: number;
  speedBoost: number;
  speedFactor: number;
  stun: number;
  slow: number;
  slowFactor: number;
  stealth: number;
  invulnerable: number;
  attackSpeedBoost: number;
  immunity: number;
  suppress: number;
  mark?: number;
}

export interface HeroRuntime {
  /** per-frame movement intent, normalised */
  moveX: number;
  moveY: number;
  /** ordered: null = idle/hold, {x,y} = move, uid = attack */
  moveOrder: { x: number; y: number } | null;
  attackOrderUid: number | null;
  targetUid: number | null;
  autoAttack: boolean;
  priority: 'hero' | 'minion' | 'turret' | 'auto';
  /** AI */
  aiState: 'lane' | 'jungle' | 'roam' | 'group' | 'retreat' | 'objective' | 'push' | 'rotate' | 'dead';
  aiTimer: number;
  aiTargetUid: number | null;
  anchorLane: LaneRole;
  lastAttackerUid: number | null;
  lastDamagedTime: number;
  comboStep: number;
  skillPlan: number;
  campIndex: number;
  recallTimer: number;
  regenTimer: number;
  chatCooldown: number;
  stuckTimer: number;
  lastPos: { x: number; y: number };
}

export interface HeroStats {
  maxHp: number;
  hpRegen: number;
  maxMana: number;
  manaRegen: number;
  physAtk: number;
  magicPower: number;
  physDef: number;
  magicDef: number;
  attackSpeed: number;
  moveSpeed: number;
  attackRange: number;
  lifesteal: number;
  critChance: number;
  critDamage: number;
  cooldownReduction: number;
  penPhysical: number;
  penMagic: number;
}

export interface Hero {
  utype: 'hero';
  uid: number;
  /** hero definition id, e.g. "layla" (can repeat across the 10 slots!) */
  defId: string;
  name: string;
  title: string;
  role: Role;
  portrait: string;
  team: Team;
  isPlayer: boolean;
  isBot: boolean;

  x: number;
  y: number;
  rotation: number;
  facing: { x: number; y: number };

  hp: number;
  mana: number;
  level: number;
  exp: number;
  gold: number;

  kills: number;
  deaths: number;
  assists: number;
  creepScore: number;
  jungleKills: number;
  damageDealtToHeroes: number;
  damageDealt: number;
  damageTaken: number;
  healDone: number;
  turretDamage: number;
  goldEarned: number;
  laneAssigned: LaneRole;

  skillLevels: [number, number, number];
  skillPoints: number;
  cooldowns: [number, number, number];
  attackTimer: number;
  attackWindup: number;
  spellId: string;
  spellCooldown: number;

  items: (Item | null)[];
  stats: HeroStats;
  def: HeroDef;

  buffs: HeroBuffs;
  dead: boolean;
  respawnTimer: number;
  inBush: boolean;
  visibleToEnemy: boolean;
  visibleToFriendly: boolean;
  lastSkillCastTime: number;
  passiveStacks: number;
  lifestealBonus?: number;
  timedFlags?: Record<string, number>;
  extra?: Record<string, any>;
  runtime: HeroRuntime;
}

// ---------------------------------------------------------------------------
//  Feed / announcements
// ---------------------------------------------------------------------------

export interface KillFeedItem {
  uid: number;
  killerName: string;
  killerPortrait?: string;
  killerTeam: Team;
  victimName: string;
  victimPortrait?: string;
  victimTeam: Team;
  assistNames: string[];
  streak?: string;
  time: number;
  isStructure?: boolean;
}

export type AnnouncementType =
  | 'first-blood' | 'kill' | 'double' | 'triple' | 'maniac' | 'savage'
  | 'turret' | 'turtle' | 'lord' | 'victory' | 'defeat' | 'warn' | 'info' | 'assist';

export interface Announcement {
  id: string;
  type: AnnouncementType;
  title: string;
  subtitle?: string;
  team?: Team;
  duration: number;
}

// ---------------------------------------------------------------------------
//  Chat
// ---------------------------------------------------------------------------

export type ChatChannel = 'team' | 'all' | 'system';

export interface ChatMessage {
  uid: number;
  channel: ChatChannel;
  senderName: string;
  senderTeam: Team | 'system';
  senderHeroId?: string;
  text: string;
  time: number;
  isQuick?: boolean;
  isPlayer?: boolean;
  pingKind?: MapPing['kind'];
  tone?: 'good' | 'bad' | 'neutral';
}

export interface QuickChatOption {
  id: string;
  label: string;
  chat: string;
  kind?: MapPing['kind'];
}

// ---------------------------------------------------------------------------
//  Match snapshot pushed to React for the HUD
// ---------------------------------------------------------------------------

export interface SkillHudEntry {
  name: string;
  level: number;
  cooldownLeft: number;
  cooldown: number;
  manaCost: number;
  canCast: boolean;
  isUltimate: boolean;
  description: string;
  targetType: Skill['targetType'];
}

export type MatchPhase = 'loading' | 'laning' | 'mid' | 'late' | 'over';

export interface EngineSnapshot {
  phase: MatchPhase;
  time: number;
  blueKills: number;
  redKills: number;
  blueTurrets: number;
  redTurrets: number;
  player: Hero | null;
  heroes: Hero[];
  turrets: Turret[];
  monsters: Monster[];
  minionCount: number;
  killFeed: KillFeedItem[];
  chat: ChatMessage[];
  pings: MapPing[];
  skills: SkillHudEntry[];
  spell: { id: string; name: string; icon: string; cooldown: number; cooldownLeft: number; ready: boolean };
  objectives: {
    turtleIn: number;
    lordIn: number;
    turtleAlive: boolean;
    lordAlive: boolean;
    lordTeam: Team | null;
    turtleKills: Record<Team, number>;
    lordKills: Record<Team, number>;
  };
  players: Hero[];
  fps: number;
  winner: Team | null;
  error: string | null;
}
