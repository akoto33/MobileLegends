import { BattleSpell } from '../types/game';

export const BATTLE_SPELLS: BattleSpell[] = [
  {
    id: 'flicker',
    name: 'Flicker',
    cooldown: 120,
    description: 'Teleport a short distance in the designated direction. After teleporting, gains 5 (+1*Level) Physical & Magic Defense for 1s.',
    icon: 'ChevronsRight'
  },
  {
    id: 'execute',
    name: 'Execute',
    cooldown: 90,
    description: 'Deals 200 (+20*Level) plus 13% of target\'s missing HP as True Damage to designated enemy hero. Cooldown reduced by 40% if it kills.',
    icon: 'Sword'
  },
  {
    id: 'retribution',
    name: 'Retribution',
    cooldown: 35,
    description: 'Deals 520 (+80*Level) True Damage to nearby jungle monsters or creeps. Essential for jungle farming.',
    icon: 'Crosshair'
  },
  {
    id: 'purify',
    name: 'Purify',
    cooldown: 90,
    description: 'Immediately removes all negative effects and crowd controls, granting CC immunity and 15% Movement Speed for 1.2s.',
    icon: 'ShieldCheck'
  },
  {
    id: 'flameshot',
    name: 'Flameshot',
    cooldown: 50,
    description: 'Fires a long-range flaming missile that knocks back enemies in front of you and snipes distant targets for heavy magic damage.',
    icon: 'Flame'
  },
  {
    id: 'aegis',
    name: 'Aegis',
    cooldown: 90,
    description: 'Instantly grants a 750 (+90*Level) point shield absorbing incoming damage for 5 seconds.',
    icon: 'Shield'
  },
  {
    id: 'sprint',
    name: 'Sprint',
    cooldown: 100,
    description: 'Gains 50% Movement Speed and slow immunity decaying over 6s.',
    icon: 'Wind'
  },
  {
    id: 'inspire',
    name: 'Inspire',
    cooldown: 75,
    description: 'Greatly increases Attack Speed by 55%, ignores 8 Physical Defense, and each attack restores 60 HP for 5s.',
    icon: 'Zap'
  }
];
