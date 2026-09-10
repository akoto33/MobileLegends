// ============================================================================
//  Per-hero skill effects.
//  Each skill returns the damage/hit profile it needs; the engine supplies the
//  primitives so both players and bots run exactly the same rules.
// ============================================================================

import type { GameEngine } from './GameEngine';
import type { Hero, Skill } from '../types/game';

export function skillDamage(hero: Hero, skill: Skill, level: number): number {
  const base = skill.baseDamage + Math.max(0, level - 1) * 55;
  const stat = skill.damageType === 'magic' ? hero.stats.magicPower : hero.stats.physAtk;
  return Math.round(base + stat * skill.scaling);
}

export interface CastResult {
  /** distance the hero wants to walk to be in range */
  inRange: boolean;
}

/**
 * Executes a hero skill. Returns false when the skill produced no effect
 * (e.g. targeted skill with no target) so callers can fall back.
 */
export function castHeroSkill(
  e: GameEngine,
  hero: Hero,
  index: 0 | 1 | 2,
  angle: number,
  target: Hero | null
): boolean {
  const skill = hero.def.skills[index];
  const lvl = hero.skillLevels[index];
  const dmg = skillDamage(hero, skill, lvl);
  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  const range = skill.range || hero.stats.attackRange;
  const radius = skill.radius ?? 90;
  const fx = (t: any, x: number, y: number, life = 0.4, radius2?: number, x2?: number, y2?: number) =>
    e.addEffect({ type: t, x, y, x2, y2, radius: radius2 ?? radius, color: skillColor(hero), life, maxLife: life });

  switch (hero.defId) {
    // ------------------------------------------------------------------ LAYLA
    case 'layla': {
      if (index === 0) {
        e.spawnSkillProjectile(hero, {
          dir, speed: 760, maxDist: range, damage: dmg, damageType: 'physical',
          radius: 12, color: '#7dd3fc', effect: 'slow', ccDuration: 1.4, aoeRadius: 60
        });
        hero.buffs.speedFactor = Math.max(hero.buffs.speedFactor, 1.0);
        hero.extra = hero.extra || {};
        hero.extra.laylaRange = 1.35;
        e.setTimeoutHero(hero, 'laylaRange', 2.5);
        fx('ring', hero.x, hero.y, 0.3, 40);
      } else if (index === 1) {
        const px = hero.x + dir.x * Math.min(range, 420);
        const py = hero.y + dir.y * Math.min(range, 420);
        fx('circle', px, py, 0.35, radius);
        e.areaDamage(hero, px, py, radius, dmg, 'physical', { slow: 1.8, slowFactor: 0.45 });
      } else {
        // Destruction Rush: giant piercing beam
        e.addEffect({
          type: 'beam', x: hero.x, y: hero.y,
          x2: hero.x + dir.x * range, y2: hero.y + dir.y * range,
          radius: 78, color: '#38bdf8', life: 0.7, maxLife: 0.7
        });
        e.lineDamage(hero, hero.x, hero.y, dir, range, 70, dmg * 1.15, 'physical', { slow: 1.2 });
      }
      return true;
    }
    // ------------------------------------------------------------------- MIYA
    case 'miya': {
      if (index === 0) {
        hero.buffs.attackSpeedBoost = Math.max(hero.buffs.attackSpeedBoost, 4);
        hero.passiveStacks = 5;
        e.addEffect({ type: 'ring', x: hero.x, y: hero.y, radius: 70, color: '#c084fc', life: 0.4, maxLife: 0.4 });
        hero.extra = hero.extra || {};
        hero.extra.miyaSplit = 4;
        return true;
      }
      if (index === 1) {
        const px = target ? target.x : hero.x + dir.x * 330;
        const py = target ? target.y : hero.y + dir.y * 330;
        e.addEffect({ type: 'circle', x: px, y: py, radius: 110, color: '#a855f7', life: 0.45, maxLife: 0.45 });
        e.areaDamage(hero, px, py, 110, dmg, 'physical', { stun: 1.0 });
        return true;
      }
      // Hidden Moonlight: cleanse + stealth
      hero.buffs.stun = 0;
      hero.buffs.slow = 0;
      hero.buffs.stealth = 3;
      hero.buffs.speedBoost = 3;
      hero.buffs.speedFactor = Math.max(hero.buffs.speedFactor, 1.4);
      e.addEffect({ type: 'ring', x: hero.x, y: hero.y, radius: 90, color: '#e9d5ff', life: 0.5, maxLife: 0.5 });
      e.addFloater('STEALTH', hero.x, hero.y - 44, '#e9d5ff');
      return true;
    }
    // --------------------------------------------------------------- TIGREAL
    case 'tigreal': {
      if (index === 0) {
        e.addEffect({ type: 'beam', x: hero.x, y: hero.y, x2: hero.x + dir.x * range, y2: hero.y + dir.y * range, radius: 66, color: '#fbbf24', life: 0.35, maxLife: 0.35 });
        e.lineDamage(hero, hero.x, hero.y, dir, range, 66, dmg, 'physical', { slow: 1.5 });
        return true;
      }
      if (index === 1) {
        const dest = e.walkToSafe(hero, dir, 300);
        e.addEffect({ type: 'shockwave', x: dest.x, y: dest.y, radius: 120, color: '#f59e0b', life: 0.4, maxLife: 0.4 });
        e.areaDamage(hero, dest.x, dest.y, 120, dmg, 'physical', { knockup: 0.8 });
        return true;
      }
      e.addEffect({ type: 'shockwave', x: hero.x, y: hero.y, radius: 230, color: '#eab308', life: 0.7, maxLife: 0.7 });
      const pulled = e.heroesInRange(hero.team === 'blue' ? 'red' : 'blue', hero.x, hero.y, 230, true);
      pulled.forEach(p => {
        p.x += (hero.x - p.x) * 0.28;
        p.y += (hero.y - p.y) * 0.28;
      });
      e.areaDamage(hero, hero.x, hero.y, 235, dmg, 'physical', { stun: 1.6 });
      if (pulled.length) e.addFloater('IMPLOSION!', hero.x, hero.y - 46, '#fbbf24');
      return true;
    }
    // --------------------------------------------------------------- ALUCARD
    case 'alucard': {
      if (index === 0) {
        const dest = e.walkToSafe(hero, dir, 300);
        e.addEffect({ type: 'circle', x: dest.x, y: dest.y, radius: 110, color: '#f43f5e', life: 0.4, maxLife: 0.4 });
        e.areaDamage(hero, dest.x, dest.y, 110, dmg, 'physical', { slow: 1.2 });
        return true;
      }
      if (index === 1) {
        e.addEffect({ type: 'ring', x: hero.x, y: hero.y, radius: 165, color: '#e11d48', life: 0.35, maxLife: 0.35 });
        e.areaDamage(hero, hero.x, hero.y, 165, dmg, 'physical');
        hero.lifestealBonus = 0.5;
        e.setTimeoutHero(hero, 'alucadLs', 3);
        return true;
      }
      e.addEffect({ type: 'beam', x: hero.x, y: hero.y, x2: hero.x + dir.x * 460, y2: hero.y + dir.y * 460, radius: 90, color: '#fb7185', life: 0.5, maxLife: 0.5 });
      e.lineDamage(hero, hero.x, hero.y, dir, 460, 90, dmg, 'physical');
      hero.buffs.shield = Math.max(hero.buffs.shield, hero.stats.maxHp * 0.18);
      return true;
    }
    // ----------------------------------------------------------------- EUDORA
    case 'eudora': {
      if (index === 0) {
        e.addEffect({ type: 'beam', x: hero.x, y: hero.y, x2: hero.x + dir.x * range, y2: hero.y + dir.y * range, radius: 90, color: '#c084fc', life: 0.35, maxLife: 0.35 });
        e.lineDamage(hero, hero.x, hero.y, dir, range, 90, dmg, 'magic');
        return true;
      }
      if (index === 1) {
        e.spawnSkillProjectile(hero, {
          targetUid: target?.uid ?? null, dir, speed: 620, maxDist: range + 60,
          damage: dmg, damageType: 'magic', radius: 12, color: '#a855f7',
          effect: 'stun', ccDuration: 1.3
        });
        return true;
      }
      if (!target) return false;
      e.addEffect({ type: 'shockwave', x: target.x, y: target.y, radius: 130, color: '#9333ea', life: 0.6, maxLife: 0.6 });
      e.chainLightning(target, hero, dmg);
      return true;
    }
    // ------------------------------------------------------------------ SABER
    case 'saber': {
      if (index === 0) {
        hero.passiveStacks = 5;
        hero.extra = hero.extra || {};
        hero.extra.saberSwords = 5;
        e.addEffect({ type: 'ring', x: hero.x, y: hero.y, radius: 95, color: '#ef4444', life: 0.5, maxLife: 0.5 });
        e.areaDamage(hero, hero.x, hero.y, 105, dmg * 0.6, 'physical');
        return true;
      }
      if (index === 1) {
        const dest = e.walkToSafe(hero, dir, 300);
        e.addEffect({ type: 'slash', x: dest.x, y: dest.y, radius: 95, color: '#fca5a5', life: 0.3, maxLife: 0.3 });
        e.areaDamage(hero, dest.x, dest.y, 95, dmg, 'physical');
        return true;
      }
      if (!target) return false;
      e.addEffect({ type: 'burst', x: target.x, y: target.y, radius: 120, color: '#ef4444', life: 0.55, maxLife: 0.55 });
      e.areaDamage(hero, target.x, target.y, 130, dmg, 'physical', { knockup: 1.1 });
      return true;
    }
    // ----------------------------------------------------------------- ZILONG
    case 'zilong': {
      if (index === 0) {
        if (!target) return false;
        const behind = { x: hero.x - dir.x * 90, y: hero.y - dir.y * 90 };
        e.moveUnit(target, behind.x, behind.y);
        e.addEffect({ type: 'slash', x: target.x, y: target.y, radius: 70, color: '#f59e0b', life: 0.3, maxLife: 0.3 });
        e.singleDamage(hero, target, dmg, 'physical', { slow: 1 });
        return true;
      }
      if (index === 1) {
        if (target) {
          const d = Math.hypot(target.x - hero.x, target.y - hero.y) || 1;
          e.moveUnit(hero, target.x - ((target.x - hero.x) / d) * 55, target.y - ((target.y - hero.y) / d) * 55);
        } else {
          e.walkToSafe(hero, dir, 250);
        }
        e.addEffect({ type: 'slash', x: hero.x, y: hero.y, radius: 85, color: '#fbbf24', life: 0.3, maxLife: 0.3 });
        e.areaDamage(hero, hero.x, hero.y, 95, dmg, 'physical');
        return true;
      }
      hero.buffs.speedBoost = 8;
      hero.buffs.speedFactor = Math.max(hero.buffs.speedFactor, 1.35);
      hero.buffs.attackSpeedBoost = Math.max(hero.buffs.attackSpeedBoost, 8);
      hero.buffs.slow = 0;
      e.addEffect({ type: 'ring', x: hero.x, y: hero.y, radius: 95, color: '#f59e0b', life: 0.5, maxLife: 0.5 });
      e.addFloater('SUPREME WARRIOR', hero.x, hero.y - 44, '#fbbf24');
      return true;
    }
    // ------------------------------------------------------------------- NANA
    case 'nana': {
      if (index === 0) {
        e.spawnSkillProjectile(hero, {
          dir, speed: 660, maxDist: range, damage: dmg, damageType: 'magic',
          radius: 15, color: '#f9a8d4', effect: 'pierce'
        });
        return true;
      }
      if (index === 1) {
        const px = target ? target.x : hero.x + dir.x * 280;
        const py = target ? target.y : hero.y + dir.y * 280;
        e.addEffect({ type: 'circle', x: px, y: py, radius: 85, color: '#f472b6', life: 0.45, maxLife: 0.45 });
        e.areaDamage(hero, px, py, 85, dmg, 'magic', { stun: 0.85 });
        return true;
      }
      const px = target ? target.x : hero.x + dir.x * 300;
      const py = target ? target.y : hero.y + dir.y * 300;
      for (let i = 0; i < 3; i++) {
        e.addEffect({
          type: 'shockwave',
          x: px + (Math.random() - 0.5) * 150,
          y: py + (Math.random() - 0.5) * 150,
          radius: 120, color: '#fb7185', life: 0.55 + i * 0.12, maxLife: 0.55 + i * 0.12
        });
      }
      e.areaDamage(hero, px, py, 155, dmg, 'magic', { stun: 1.0 });
      return true;
    }
    // ----------------------------------------------------------------- GUSION
    case 'gusion': {
      if (index === 0) {
        e.spawnSkillProjectile(hero, {
          dir, speed: 760, maxDist: range, damage: dmg, damageType: 'magic',
          radius: 10, color: '#60a5fa', effect: 'pierce'
        });
        return true;
      }
      if (index === 1) {
        for (let i = -2; i <= 2; i++) {
          const a = angle + (i * Math.PI) / 13;
          e.spawnSkillProjectile(hero, {
            dir: { x: Math.cos(a), y: Math.sin(a) }, speed: 700, maxDist: 340,
            damage: dmg * 0.45, damageType: 'magic', radius: 9, color: '#93c5fd',
            effect: 'pierce', skillId: 'gusion_dagger'
          });
        }
        return true;
      }
      // Incandescent: dash + reset skill cooldowns
      const dest = e.walkToSafe(hero, dir, 300);
      e.addEffect({ type: 'burst', x: dest.x, y: dest.y, radius: 100, color: '#38bdf8', life: 0.4, maxLife: 0.4 });
      hero.cooldowns[0] = 0;
      hero.cooldowns[1] = 0;
      e.areaDamage(hero, dest.x, dest.y, 100, dmg, 'magic');
      return true;
    }
    // ---------------------------------------------------------------- FRANCO
    case 'franco': {
      if (index === 0) {
        e.spawnSkillProjectile(hero, {
          dir, speed: 720, maxDist: range, damage: dmg, damageType: 'physical',
          radius: 14, color: '#e2e8f0', effect: 'hook', ccDuration: 0.9
        });
        e.addEffect({
          type: 'chain', x: hero.x, y: hero.y, x2: hero.x + dir.x * range, y2: hero.y + dir.y * range,
          radius: 20, color: '#94a3b8', life: 0.45, maxLife: 0.45
        });
        return true;
      }
      if (index === 1) {
        e.addEffect({ type: 'shockwave', x: hero.x, y: hero.y, radius: 175, color: '#38bdf8', life: 0.35, maxLife: 0.35 });
        e.areaDamage(hero, hero.x, hero.y, 175, dmg, 'physical', { slow: 1.6 });
        return true;
      }
      if (!target) return false;
      e.addEffect({ type: 'burst', x: target.x, y: target.y, radius: 110, color: '#ef4444', life: 1.1, maxLife: 1.1 });
      target.buffs.suppress = Math.max(target.buffs.suppress, 1.5);
      e.applyDamageContinuous(hero, target, dmg, 1.2);
      return true;
    }
    default: {
      // Generic fallback so any future hero still does something sane
      if (index === 2 && target) {
        e.areaDamage(hero, target.x, target.y, radius, dmg, skill.damageType, skill.crowdControl === 'stun' ? { stun: 1 } : undefined);
        return true;
      }
      e.lineDamage(hero, hero.x, hero.y, dir, range, radius, dmg, skill.damageType,
        skill.crowdControl === 'slow' ? { slow: 1.5 } : skill.crowdControl === 'stun' ? { stun: 0.8 } : undefined);
      return true;
    }
  }
}

function skillColor(hero: Hero): string {
  return hero.stats.magicPower > 0 ? '#c084fc' : '#fca5a5';
}
