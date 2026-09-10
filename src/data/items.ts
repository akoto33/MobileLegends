import { Item } from '../types/game';

export const ITEMS: Item[] = [
  // --- ATTACK ITEMS ---
  {
    id: 'blade_of_despair',
    name: 'Blade of Despair',
    category: 'attack',
    cost: 3010,
    icon: 'Sword',
    description: '+160 Physical Attack, +5% Movement Speed. Attacking enemy units with HP below 50% increases Physical Attack by 25% for 2s.',
    stats: { physAtk: 160, moveSpeed: 15 },
    passiveName: 'Despair',
    passiveDesc: 'Increases Physical ATK by 25% against low-health enemies.'
  },
  {
    id: 'berserkers_fury',
    name: "Berserker's Fury",
    category: 'attack',
    cost: 2250,
    icon: 'Flame',
    description: '+65 Physical Attack, +25% Critical Chance, +40% Critical Damage. Crit strikes increase physical attack by 5% for 2s.',
    stats: { physAtk: 65, critChance: 0.25 },
    passiveName: 'Doom',
    passiveDesc: '+40% Crit Damage. Crits grant +5% Phys ATK.'
  },
  {
    id: 'malefic_roar',
    name: 'Malefic Roar',
    category: 'attack',
    cost: 2060,
    icon: 'Crosshair',
    description: '+60 Physical Attack, +35% Physical Penetration. Turret defense is shredded when attacking.',
    stats: { physAtk: 60 },
    passiveName: 'Armor Buster',
    passiveDesc: 'Gains 0.05% extra Physical PEN per point of enemy defense.'
  },
  {
    id: 'haas_claws',
    name: "Haas' Claws",
    category: 'attack',
    cost: 2020,
    icon: 'Heart',
    description: '+70 Physical Attack, +20% Physical Lifesteal. When HP drops below 40%, gains an extra 15% physical lifesteal.',
    stats: { physAtk: 70, lifesteal: 0.20 },
    passiveName: 'Insanity',
    passiveDesc: 'Low HP grants +15% extra Lifesteal.'
  },
  {
    id: 'demon_hunter_sword',
    name: 'Demon Hunter Sword',
    category: 'attack',
    cost: 2180,
    icon: 'Zap',
    description: '+35 Physical Attack, +25% Attack Speed. Basic attacks deal 9% of the target\'s current HP as additional physical damage.',
    stats: { physAtk: 35, attackSpeed: 0.25, lifesteal: 0.10 },
    passiveName: 'Devour',
    passiveDesc: 'Deals 9% target current HP on hit.'
  },
  {
    id: 'windtalker',
    name: 'Windtalker',
    category: 'attack',
    cost: 1820,
    icon: 'Wind',
    description: '+40% Attack Speed, +20 Movement Speed, +10% Crit Chance. Every few seconds basic attack unleashes Typhoon magic splashes.',
    stats: { attackSpeed: 0.40, moveSpeed: 20, critChance: 0.10 },
    passiveName: 'Typhoon',
    passiveDesc: 'Splashes magic whirlwind damage to 3 enemies.'
  },

  // --- MAGIC ITEMS ---
  {
    id: 'holy_crystal',
    name: 'Holy Crystal',
    category: 'magic',
    cost: 2180,
    icon: 'Sparkles',
    description: '+100 Magic Power. Passive: Increases Magic Power by 21%–35% (scaling with hero level).',
    stats: { magicPower: 100 },
    passiveName: 'Mystery',
    passiveDesc: 'Increases total Magic Power by up to 35%.'
  },
  {
    id: 'lightning_truncheon',
    name: 'Lightning Truncheon',
    category: 'magic',
    cost: 2250,
    icon: 'CloudLightning',
    description: '+75 Magic Power, +300 Mana, +10% Cooldown Reduction. Every 6s, your next skill triggers resonant lightning bounce.',
    stats: { magicPower: 75, mana: 300, cooldownReduction: 0.10 },
    passiveName: 'Resonate',
    passiveDesc: 'Skills bounce lightning to 3 enemies based on max mana.'
  },
  {
    id: 'genius_wand',
    name: 'Genius Wand',
    category: 'magic',
    cost: 2000,
    icon: 'Wand2',
    description: '+75 Magic Power, +5% Movement Speed, +10 Magic PEN. Dealing magic damage reduces enemy magic defense by 9-27.',
    stats: { magicPower: 75, moveSpeed: 15 },
    passiveName: 'Magic Piercing',
    passiveDesc: 'Shreds enemy Magic Defense on hit.'
  },
  {
    id: 'glowing_wand',
    name: 'Glowing Wand',
    category: 'magic',
    cost: 2120,
    icon: 'Flame',
    description: '+75 Magic Power, +400 HP, +5% Movement Speed. Damaging skills burn the target for 1.5% max HP per second for 3s.',
    stats: { magicPower: 75, hp: 400, moveSpeed: 15 },
    passiveName: 'Scorch',
    passiveDesc: 'Burns targets for 1.5% of max HP each second.'
  },
  {
    id: 'concentrated_energy',
    name: 'Concentrated Energy',
    category: 'magic',
    cost: 2020,
    icon: 'Radio',
    description: '+70 Magic Power, +700 HP. +25% Magic Lifesteal. Defeating enemy heroes regenerates 10% HP.',
    stats: { magicPower: 70, hp: 700, lifesteal: 0.25 },
    passiveName: 'Recharge',
    passiveDesc: '+25% Magic Lifesteal & HP on kill.'
  },
  {
    id: 'blood_wings',
    name: 'Blood Wings',
    category: 'magic',
    cost: 3000,
    icon: 'Shield',
    description: '+175 Magic Power, +500 HP. Gains a shield equal to 200% Magic Power that absorbs incoming damage and grants speed.',
    stats: { magicPower: 175, hp: 500 },
    passiveName: 'Guard',
    passiveDesc: 'Permanent large shield regenerating out of combat.'
  },

  // --- DEFENSE ITEMS ---
  {
    id: 'blade_armor',
    name: 'Blade Armor',
    category: 'defense',
    cost: 1960,
    icon: 'ShieldAlert',
    description: '+90 Physical Defense, +20% Crit Damage Reduction. When struck by basic attack, reflects 25% physical damage back to attacker.',
    stats: { physDef: 90 },
    passiveName: 'Bladed Armor',
    passiveDesc: 'Reflects 25% basic attack damage back to attacker.'
  },
  {
    id: 'athenas_shield',
    name: "Athena's Shield",
    category: 'defense',
    cost: 2150,
    icon: 'Shield',
    description: '+900 HP, +62 Magic Defense, +2 HP Regen. Upon taking magic damage, gains 25% magic damage reduction for 3s.',
    stats: { hp: 900, magicDef: 62, physDef: 10 },
    passiveName: 'Shield',
    passiveDesc: 'Reduces incoming magic burst damage by 25%.'
  },
  {
    id: 'antique_cuirass',
    name: 'Antique Cuirass',
    category: 'defense',
    cost: 2170,
    icon: 'ShieldCheck',
    description: '+920 HP, +54 Physical Defense, +4 HP Regen. Being attacked by skills reduces attacker\'s physical attack by 8% (stacks 3x).',
    stats: { hp: 920, physDef: 54 },
    passiveName: 'Deter',
    passiveDesc: 'Reduces attacker\'s physical damage output.'
  },
  {
    id: 'immortality',
    name: 'Immortality',
    category: 'defense',
    cost: 2120,
    icon: 'RefreshCw',
    description: '+800 HP, +30 Physical Defense. Upon dying, resurrects 2.5s later with 16% HP and a 1200 point shield (210s cooldown).',
    stats: { hp: 800, physDef: 30 },
    passiveName: 'Immortal',
    passiveDesc: 'Revives hero upon death with shield.'
  },
  {
    id: 'dominance_ice',
    name: 'Dominance Ice',
    category: 'defense',
    cost: 2010,
    icon: 'Compass',
    description: '+500 Mana, +70 Physical Defense, +5% Movement Speed, +10% CDR. Reduces nearby enemies\' attack speed by 70% and life regen by 50%.',
    stats: { mana: 500, physDef: 70, moveSpeed: 10, cooldownReduction: 0.10 },
    passiveName: 'Arctic Cold',
    passiveDesc: 'Cuts nearby enemies\' attack speed and healing.'
  },

  // --- MOVEMENT ITEMS ---
  {
    id: 'warrior_boots',
    name: 'Warrior Boots',
    category: 'movement',
    cost: 720,
    icon: 'Footprints',
    description: '+40 Movement Speed, +22 Physical Defense. Physical defense increases by 5 for 3s when taking basic attacks.',
    stats: { moveSpeed: 40, physDef: 22 },
    passiveName: 'Valor',
    passiveDesc: 'Stacks physical defense during combat.'
  },
  {
    id: 'tough_boots',
    name: 'Tough Boots',
    category: 'movement',
    cost: 700,
    icon: 'Footprints',
    description: '+40 Movement Speed, +22 Magic Defense. Reduces duration of crowd control and slow effects by 30%.',
    stats: { moveSpeed: 40, magicDef: 22 },
    passiveName: 'Fortitude',
    passiveDesc: '30% resilience against stuns and crowd control.'
  },
  {
    id: 'magic_shoes',
    name: 'Magic Shoes',
    category: 'movement',
    cost: 710,
    icon: 'Zap',
    description: '+40 Movement Speed, +10% Cooldown Reduction.',
    stats: { moveSpeed: 40, cooldownReduction: 0.10 },
    passiveName: 'Haste',
    passiveDesc: '+10% Cooldown Reduction for faster skill rotations.'
  },
  {
    id: 'swift_boots',
    name: 'Swift Boots',
    category: 'movement',
    cost: 710,
    icon: 'Wind',
    description: '+40 Movement Speed, +15% Attack Speed.',
    stats: { moveSpeed: 40, attackSpeed: 0.15 },
    passiveName: 'Swiftness',
    passiveDesc: '+15% Attack Speed bonus.'
  }
];
