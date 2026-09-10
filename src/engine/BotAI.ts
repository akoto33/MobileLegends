// ============================================================================
//  Bot AI: lane assignment, farming, roaming, jungle routes, ganks,
//  objectives, retreating, recalling, itemising and shot-calling in chat.
//  Bots use exactly the same commands the player uses (no cheating stats).
// ============================================================================

import { GameEngine, Unit } from './GameEngine';
import { Hero, Lane } from '../types/game';
import {
  FOUNTAINS, LANES, LANE_PATHS, TUNE, blueJungleRoute, laneFarmPoint, lanePath, steer
} from './GameMap';

export function updateBot(e: GameEngine, bot: Hero, dt: number) {
  const rt = bot.runtime;
  if (bot.dead) return;

  rt.aiTimer -= dt;
  // aiTimer doubles as "how long since the last decision"; letting it drift
  // negative is what stops bots camping in the fountain forever.
  if (rt.aiTimer < -30) rt.aiTimer = -30;

  // ---- at the fountain: buy, heal, then rejoin ----
  const f = FOUNTAINS[bot.team];
  const atFountain = Math.hypot(bot.x - f.x, bot.y - f.y) < f.r * 0.95;
  if (atFountain) {
    e.autoBuy(bot);
    const healed = bot.hp > bot.stats.maxHp * 0.9 && bot.mana > bot.stats.maxMana * 0.5;
    const dived = enemyNear(e, bot, 720) !== null;
    const impatient = rt.aiTimer < -12;
    if (dived && bot.hp > bot.stats.maxHp * 0.5) {
      // they are diving us: stop camping and join the defence
      rt.aiTimer = 0;
      rt.aiState = 'group';
    } else if ((healed && !dived) || (impatient && bot.hp > bot.stats.maxHp * 0.6)) {
      rt.aiTimer = 0;
      rt.aiState = laneStateFor(bot);
      const anchor = laneAnchor(e, bot);
      rt.moveOrder = { x: anchor.x, y: anchor.y };
    } else {
      // wait and heal
      moveAwayFrom(e, bot, { x: f.x, y: f.y }, 40);
      return;
    }
  }

  if (bot.level >= 2) e.autoBuy(bot);

  // ---- survival first ----
  const hpPct = bot.hp / bot.stats.maxHp;
  const threat = dangerAround(e, bot, 520);
  const canHeal = atFountain || e.turrets.some(t => t.team === bot.team && !t.destroyed && Math.hypot(t.x - bot.x, t.y - bot.y) < 330);

  const shouldRetreat =
    hpPct < 0.24 ||
    (hpPct < 0.42 && threat.count >= 2) ||
    (threat.hero && hpPct < 0.5 && !canHeal && threat.heroCount >= 1 && bot.role !== 'Tank');

  if (shouldRetreat && !atFountain) {
    rt.aiState = 'retreat';
    retreat(e, bot, dt, hpPct);
    return;
  }
  if (rt.aiState === 'retreat') {
    const safeHome = e.turrets.some(t => t.team === bot.team && !t.destroyed && dist(t, bot) < 360);
    if (hpPct > 0.72 || (hpPct > 0.45 && safeHome) || rt.aiTimer < -22) {
      rt.aiState = laneStateFor(bot);
      rt.aiTimer = 0;
    }
  }

  if (rt.aiState === 'retreat') {
    retreat(e, bot, dt, hpPct);
    return;
  }

  // base defence: if the enemy is hitting our structures, everyone with free hands helps
  const defending = defendPriority(e, bot);
  if (defending) {
    const d = dist(bot, defending);
    const foes = e.heroes.filter(h => h.team !== bot.team && !h.dead && dist(h, defending) < 620)
      .sort((a, b) => dist2(a, bot) - dist2(b, bot))[0];
    if (foes && (bot.role === 'Tank' || bot.role === 'Support' || hpPct > 0.55)) engage(e, bot, foes, dt);
    else if (d > 420) step(e, bot, defending.x, defending.y, 380);
    else if (foes) engage(e, bot, foes, dt);
    fightLogic(e, bot, dt);
    return;
  }

  // ---- role logic ----
  switch (bot.laneAssigned) {
    case 'jungle': jungleRoutine(e, bot, dt); break;
    case 'roam': roamRoutine(e, bot, dt); break;
    default: laneRoutine(e, bot, dt, (bot.laneAssigned as Lane)); break;
  }

  // ---- shared: skills, positioning, objective calls ----
  fightLogic(e, bot, dt);
  maybeTakeObjective(e, bot);
  idleChat(e, bot, dt);
}

function laneStateFor(bot: Hero): Hero['runtime']['aiState'] {
  if (bot.laneAssigned === 'jungle') return 'jungle';
  if (bot.laneAssigned === 'roam') return 'roam';
  return 'lane';
}

// ---------------------------------------------------------------------------
//  Laning
// ---------------------------------------------------------------------------

function laneRoutine(e: GameEngine, bot: Hero, dt: number, lane: Lane) {
  const rt = bot.runtime;
  const enemyLaner = e.closestEnemyHero(bot, 620);
  const minionsHere = e.minions.filter(m => m.team !== bot.team && m.lane === lane &&
    Math.hypot(m.x - bot.x, m.y - bot.y) < 700);
  const ownMinions = e.minions.filter(m => m.team === bot.team && m.lane === lane &&
    Math.hypot(m.x - bot.x, m.y - bot.y) < 700);

  // where we want to stand
  const meet = laneFarmPoint(lane, bot.team, 'meet');
  const safe = laneFarmPoint(lane, bot.team, 'safe');
  const enemyTurret = e.turrets
    .filter(t => t.team !== bot.team && t.lane === lane && !t.destroyed && e.turretVulnerable(t))
    .sort((a, b) => dist2(a, bot) - dist2(b, bot))[0];

  let anchor = meet;
  if (enemyLaner && e.teamStrengthNear(enemyLaner.x, enemyLaner.y, 520, enemyLaner.team) >
    e.teamStrengthNear(bot.x, bot.y, 520, bot.team) + 0.4) {
    anchor = safe;
  } else if (!enemyTurret && ownMinions.length >= minionsHere.length && ownMinions.length > 0) {
    anchor = enemyTurret ? meet : advanceTarget(e, bot, lane);
  }
  if (minionsHere.length === 0 && ownMinions.length === 0) anchor = advanceTarget(e, bot, lane);

  // farm / poke
  const lastHit = minionsHere
    .filter(m => m.hp <= bot.stats.physAtk * 1.35 + 40)
    .sort((a, b) => a.hp - b.hp)[0];
  const csTarget = lastHit ?? nearestInList(minionsHere, bot, 900);

  const earlyGame = e.time < 150;
  const killable = enemyLaner && enemyLaner.hp < estBurst(e, bot) * 1.15;
  if (enemyLaner && !earlyGame && (killable || (wantsToFight(e, bot, enemyLaner) && ownMinions.length >= minionsHere.length - 1))) {
    engage(e, bot, enemyLaner, dt);
  } else if (csTarget && dist(bot, csTarget) > bot.stats.attackRange * 0.9) {
    step(e, bot, csTarget.x, csTarget.y, bot.stats.attackRange * 0.75);
  } else if (csTarget) {
    faceAt(bot, csTarget);
  } else {
    step(e, bot, anchor.x, anchor.y, 60);
  }

  // push the turret with minions
  if (enemyTurret && ownMinions.length > 0 && !enemyLaner) {
    const t = enemyTurret;
    if (dist(bot, t) > bot.stats.attackRange * 0.85) step(e, bot, t.x, t.y, bot.stats.attackRange * 0.8);
    else {
      rt.priority = 'turret';
      faceAt(bot, t);
      return;
    }
  }
  rt.priority = 'auto';
  void dt;
}

function advanceTarget(e: GameEngine, bot: Hero, lane: Lane) {
  const target = e.turrets
    .filter(t => t.team !== bot.team && (t.lane === lane || t.tier >= 4) && !t.destroyed)
    .sort((a, b) => dist2(a, bot) - dist2(b, bot))[0];
  if (!target) return lanePath(lane, bot.team).slice(-1)[0];
  return { x: target.x, y: target.y };
}

// ---------------------------------------------------------------------------
//  Jungle
// ---------------------------------------------------------------------------

function jungleRoutine(e: GameEngine, bot: Hero, _dt: number) {
  const rt = bot.runtime;
  const route = blueJungleRoute();
  const own = e.monsters.filter(m => m.alive && m.side === bot.team && m.camp !== 'turtle' && m.camp !== 'lord');

  // 1) finish a camp we are already fighting
  let target = rt.aiTargetUid !== null ? e.unitByUid(rt.aiTargetUid) : null;
  if (target && (!('alive' in target) || !(target as any).alive)) target = null;

  // 2) gank opportunity?
  const gank = bestGankTarget(e, bot);
  if (gank && bot.hp / bot.stats.maxHp > 0.6 && e.heroes.filter(h => h.team === bot.team && !h.dead).length >=
    e.heroes.filter(h => h.team !== bot.team && !h.dead).length) {
    target = gank;
  }

  // 3) otherwise continue route (steal enemy buff if it is free and we are ahead)
  if (!target) {
    const free = own
      .filter(m => m.hp < m.maxHp || true)
      .map(m => ({ m, spec: route.find(r => m.id.includes(r.key)) }))
      .filter(o => o.spec)
      .sort((a, b) => dist2(a.m, bot) - dist2(b.m, bot));
    if (free.length) target = free[Math.min(free.length - 1, rt.campIndex % free.length)].m;
    else {
      const enemyCamps = e.monsters.filter(m => m.alive && m.side !== bot.team && m.side !== 'neutral' &&
        m.camp !== 'turtle' && m.camp !== 'lord' && dist(m, bot) < 900);
      target = enemyCamps.sort((a, b) => a.hp - b.hp)[0] ?? null;
    }
    if (!target) {
      // nothing to farm: help a lane
      const lane = LANES[Math.floor(Math.random() * 3)] as Lane;
      target = e.closestEnemyHero(bot, 900) ?? e.minions.find(m => m.lane === lane && m.team !== bot.team) ?? null;
      if (!target) target = laneFarmPoint(lane, bot.team, 'meet') as any;
    }
  }

  if (target) {
    const need = bot.stats.attackRange * 0.8;
    const d = dist(bot, target);
    if (d > need) step(e, bot, target.x, target.y, need);
    else faceAt(bot, target);
    if (d < 200 && 'camp' in target) {
      // retribution to secure the objective
      if (bot.spellId === 'retribution' && bot.spellCooldown <= 0 && (target as any).hp < 900 + bot.level * 90) {
        e.castSpell(bot);
      }
    }
  }
  rt.aiTargetUid = target && 'uid' in target ? (target as any).uid : null;
}

function bestGankTarget(e: GameEngine, bot: Hero): Hero | null {
  let best: Hero | null = null;
  let score = 0;
  for (const foe of e.heroes) {
    if (foe.team === bot.team || foe.dead) continue;
    if (!e.sees(bot, foe.x, foe.y) && dist(bot, foe) > 700) continue;
    const lane = laneNear(foe.x, foe.y);
    if (!lane) continue;
    // they must be pushed up (far from their own turret)
    const ownTurret = e.turrets.filter(t => t.team === foe.team && t.lane === lane && !t.destroyed)
      .sort((a, b) => dist2(a, foe) - dist2(b, foe))[0];
    const pushedUp = !ownTurret || dist(ownTurret, foe) > 420;
    if (!pushedUp) continue;
    const nearAlly = e.heroes.some(h => h.team === bot.team && !h.dead && h.uid !== bot.uid && dist(h, foe) < 620);
    const s = (foe.hp / foe.stats.maxHp) * -1 + (nearAlly ? 1.5 : 0) - dist(bot, foe) / 900 + (foe.buffs.stun > 0 ? 2 : 0);
    if (s > score && dist(bot, foe) < 1500) { score = s; best = foe; }
  }
  return best;
}

// ---------------------------------------------------------------------------
//  Roam / support
// ---------------------------------------------------------------------------

function roamRoutine(e: GameEngine, bot: Hero, _dt: number) {
  const mates = e.heroes.filter(h => h.team === bot.team && !h.isPlayer && !h.dead && h.uid !== bot.uid);
  const lonely = mates
    .map(m => ({ m, foes: e.heroes.filter(f => f.team !== bot.team && !f.dead && dist(f, m) < 700).length }))
    .sort((a, b) => b.foes - a.foes)[0];
  const focus = lonely && lonely.foes > 0 ? lonely.m : e.closestEnemyHero(bot, 700) as any;
  const p = focus ? { x: focus.x, y: focus.y } : laneFarmPoint('mid', bot.team, 'meet');
  if (dist(bot, p) > 240) step(e, bot, p.x, p.y, 200);
  else {
    const foe = e.closestEnemyHero(bot, 560);
    if (foe) faceAt(bot, foe);
  }
}

// ---------------------------------------------------------------------------
//  Fighting: positioning + skill usage
// ---------------------------------------------------------------------------

function engage(e: GameEngine, bot: Hero, foe: Hero, _dt: number) {
  const range = bot.stats.attackRange;
  const d = dist(bot, foe);
  const want = bot.role === 'Marksman' || bot.role === 'Mage' ? range * 0.85 : range * 0.8;
  if (d > want) step(e, bot, foe.x, foe.y, want * 0.9);
  else if (d < want * 0.55) stepAway(e, bot, foe.x, foe.y, want);
  else strafe(e, bot, foe);
  faceAt(bot, foe);
}

function fightLogic(e: GameEngine, bot: Hero, _dt: number) {
  const rt = bot.runtime;
  const foe = e.closestEnemyHero(bot, e.isRanged(bot) ? 560 : 400);
  if (!foe) { rt.comboStep = 0; return; }

  // under their turret? do not all-in
  const underTurret = e.turrets.some(t => t.team !== bot.team && !t.destroyed &&
    Math.hypot(t.x - bot.x, t.y - bot.y) < t.range && !e.minions.some(m => m.team === bot.team &&
      Math.hypot(m.x - bot.x, m.y - bot.y) < t.range + 40));
  if (underTurret && bot.hp / bot.stats.maxHp < 0.65) return;

  // skills
  for (let i = 0; i < 3; i++) {
    const skill = bot.def.skills[i];
    if (bot.skillLevels[i] <= 0 || bot.cooldowns[i] > 0) continue;
    if (bot.mana < skill.manaCost + (skill.isUltimate ? 0 : 15)) continue;
    const range = skill.range || bot.stats.attackRange;
    const inRange = dist(bot, foe) <= range * (skill.targetType === 'lock' ? 0.95 : 1);
    const ultOk = !skill.isUltimate ? true : shouldUseUlt(e, bot, foe);
    if (inRange && ultOk) {
      const angle = Math.atan2(foe.y - bot.y, foe.x - bot.x);
      const moved = skill.targetType === 'lock' || skill.targetType === 'area' ? foe : null;
      e.castSkill(bot, i as 0 | 1 | 2, angle, moved?.uid ?? null);
      break;
    }
  }

  // melee heroes step in to attack
  if (!e.isRanged(bot) && dist(bot, foe) > bot.stats.attackRange * 0.9 && !underTurret) {
    step(e, bot, foe.x, foe.y, bot.stats.attackRange * 0.8);
  }

  // use battle spell when it matters
  if (bot.spellCooldown <= 0) {
    if (bot.spellId === 'purify' && bot.buffs.stun > 0.4) e.castSpell(bot);
    else if (bot.spellId === 'execute' && foe.hp < foe.stats.maxHp * 0.22 && dist(bot, foe) < 280) e.castSpell(bot);
    else if (bot.spellId === 'aegis' && bot.hp / bot.stats.maxHp < 0.45) e.castSpell(bot);
    else if (bot.spellId === 'inspire' && dist(bot, foe) < bot.stats.attackRange && e.teamCount(bot.team, 620) >= e.teamCount(foe.team, 620)) e.castSpell(bot);
    else if (bot.spellId === 'flicker' && bot.hp / bot.stats.maxHp < 0.25 && dist(bot, foe) < 220) {
      const away = Math.atan2(bot.y - foe.y, bot.x - foe.x);
      bot.facing = { x: Math.cos(away), y: Math.sin(away) };
      e.castSpell(bot);
    }
  }
}

function shouldUseUlt(e: GameEngine, bot: Hero, foe: Hero): boolean {
  const near = e.teamCount(foe.team, 640, foe);
  return near >= 2 || foe.hp / foe.stats.maxHp < 0.45 || bot.hp / bot.stats.maxHp < 0.4 || e.time > 300;
}

/** rough "can I delete him" estimate used to avoid pointless all-ins */
function estBurst(e: GameEngine, bot: Hero): number {
  let d = bot.stats.physAtk * 2.2 + bot.stats.magicPower * 1.4;
  for (let i = 0; i < 3; i++) {
    if (bot.skillLevels[i] > 0 && bot.cooldowns[i] <= 0) {
      const sk = bot.def.skills[i];
      d += sk.baseDamage + bot.level * 40 + (sk.damageType === 'magic' ? bot.stats.magicPower : bot.stats.physAtk) * sk.scaling;
    }
  }
  if (bot.spellId === 'execute' && bot.spellCooldown <= 0) d += 200 + bot.level * 22;
  void e;
  return d * 0.55;
}

function wantsToFight(e: GameEngine, bot: Hero, foe: Hero): boolean {
  if (foe.dead) return false;
  if (!e.sees(bot, foe.x, foe.y)) return false;
  const myPower = power(bot) * (bot.hp / bot.stats.maxHp);
  const foePower = power(foe) * (foe.hp / foe.stats.maxHp);
  const allyNear = e.teamCount(bot.team, 620, bot);
  const foeNear = e.teamCount(foe.team, 620, foe);
  const minionsPro = e.minions.filter(m => m.team === bot.team && dist(m, bot) < 520).length;
  const minionsCon = e.minions.filter(m => m.team === foe.team && dist(m, bot) < 520).length;
  const underEnemyTurret = e.turrets.some(t => t.team !== bot.team && !t.destroyed &&
    Math.hypot(t.x - foe.x, t.y - foe.y) < t.range * 0.75 &&
    !e.minions.some(m => m.team === bot.team && Math.hypot(m.x - foe.x, m.y - foe.y) < t.range));
  if (underEnemyTurret && bot.role !== 'Tank') return false;
  return myPower * (1 + allyNear * 0.35) > foePower * (1 + foeNear * 0.3) &&
    bot.hp / bot.stats.maxHp > 0.32 && minionsPro >= minionsCon - 1;
}

function power(h: Hero): number {
  const s = h.stats;
  return (s.maxHp / 100) * (1 + s.physDef / 180 + s.magicDef / 200) +
    (s.physAtk + s.magicPower) * 1.6 * s.attackSpeed + s.attackRange * 0.25 + h.level * 12;
}

// ---------------------------------------------------------------------------
//  Objectives
// ---------------------------------------------------------------------------

function maybeTakeObjective(e: GameEngine, bot: Hero) {
  if (e.time < 100) return;
  if (bot.role !== 'Tank' && bot.role !== 'Fighter' && bot.laneAssigned !== 'jungle') return;
  const obj = e.monsters.find(m => m.alive && (m.camp === 'turtle' || m.camp === 'lord'));
  if (!obj) return;
  const d = dist(bot, obj);
  if (d > 900) return;
  const ourCount = e.heroes.filter(h => h.team === bot.team && !h.dead && dist(h, obj) < 900).length;
  const theirCount = e.heroes.filter(h => h.team !== bot.team && !h.dead && dist(h, obj) < 900).length;
  if (ourCount > theirCount && bot.hp / bot.stats.maxHp > 0.5) {
    if (d > 220) step(e, bot, obj.x, obj.y, 200);
    if (Math.random() < 0.0012) e.addPing('attack', obj.x, obj.y, bot);
  }
}

function idleChat(e: GameEngine, bot: Hero, dt: number) {
  const rt = bot.runtime;
  rt.chatCooldown -= dt;
  if (rt.chatCooldown > 0) return;
  rt.chatCooldown = 18 + Math.random() * 26;
  const score = e.scoreFor(bot.team) - e.scoreFor(bot.team === 'blue' ? 'red' : 'blue');
  const diff = score;
  if (Math.random() < 0.5) return;
  e.chat.tickIdle(e.heroes.filter(h => h.team === bot.team), e.time, diff);
}

// ---------------------------------------------------------------------------
//  Retreat / recall
// ---------------------------------------------------------------------------

function retreat(e: GameEngine, bot: Hero, dt: number, hpPct: number) {
  const f = FOUNTAINS[bot.team];
  const shelter = e.turrets
    .filter(t => t.team === bot.team && !t.destroyed)
    .sort((a, b) => dist2(a, bot) - dist2(b, bot))[0];
  const toF = Math.hypot(f.x - bot.x, f.y - bot.y);
  const goal = hpPct < 0.14 || toF < 700 ? f : shelter ?? f;
  step(e, bot, goal.x, goal.y, goal === f ? 60 : 150);

  if (goal !== f && !enemyNear(e, bot, 620)) {
    // safe behind our turret: channel recall
    if (bot.runtime.recallTimer <= 0) e.recall(bot);
  } else if (goal === f) {
    bot.runtime.recallTimer = 0;
  }
  void dt;
}

// ---------------------------------------------------------------------------
//  Movement primitives
// ---------------------------------------------------------------------------

/** an allied structure under attack nearby that deserves a response */
function defendPriority(e: GameEngine, bot: Hero) {
  if (bot.laneAssigned === 'jungle' && e.monsters.some(m => m.alive && m.side === bot.team && dist(m, bot) < 260 && m.hp < m.maxHp)) return null;
  const hurt = e.turrets
    .filter(t => t.team === bot.team && !t.destroyed && t.hp < t.maxHp * 0.92 &&
      e.minions.some(m => m.team !== bot.team && dist(m, t) < t.range + 90))
    .filter(t => dist(t, bot) < 1500)
    .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  return hurt ?? null;
}

/** where this bot should walk when it has nothing better to do */
function laneAnchor(e: GameEngine, bot: Hero) {
  if (bot.laneAssigned === 'jungle' || bot.laneAssigned === 'roam') return { x: bot.x, y: bot.y };
  const lane = bot.laneAssigned as Lane;
  const enemy = e.turrets
    .filter(t => t.team !== bot.team && (t.lane === lane || t.tier >= 4) && !t.destroyed)
    .sort((a, b) => Math.hypot(a.x - bot.x, a.y - bot.y) - Math.hypot(b.x - bot.x, b.y - bot.y))[0];
  return enemy ? { x: enemy.x, y: enemy.y } : lanePath(lane, bot.team).slice(-1)[0];
}

function step(_e: GameEngine, bot: Hero, tx: number, ty: number, stopDist: number) {
  const d = Math.hypot(tx - bot.x, ty - bot.y);
  if (d <= stopDist) { bot.runtime.moveX = 0; bot.runtime.moveY = 0; return; }
  const s = steer(bot.x, bot.y, tx, ty, 20);
  bot.runtime.moveX = s.x;
  bot.runtime.moveY = s.y;
}

function stepAway(_e: GameEngine, bot: Hero, tx: number, ty: number, keep: number) {
  const d = Math.hypot(tx - bot.x, ty - bot.y);
  if (d >= keep) { bot.runtime.moveX = 0; bot.runtime.moveY = 0; return; }
  const a = Math.atan2(bot.y - ty, bot.x - tx);
  const s = steer(bot.x, bot.y, bot.x + Math.cos(a) * 200, bot.y + Math.sin(a) * 200, 20);
  bot.runtime.moveX = s.x;
  bot.runtime.moveY = s.y;
}

function moveAwayFrom(e: GameEngine, bot: Hero, p: { x: number; y: number }, keep: number) {
  const d = Math.hypot(p.x - bot.x, p.y - bot.y);
  if (d <= keep) step(e, bot, bot.x - (p.x - bot.x), bot.y - (p.y - bot.y), 10);
  else { bot.runtime.moveX = 0; bot.runtime.moveY = 0; }
}

function strafe(_e: GameEngine, bot: Hero, foe: Unit) {
  const a = Math.atan2(bot.y - foe.y, bot.x - foe.x) + (bot.uid % 2 === 0 ? Math.PI / 2 : -Math.PI / 2);
  const s = steer(bot.x, bot.y, bot.x + Math.cos(a) * 120, bot.y + Math.sin(a) * 120, 20);
  bot.runtime.moveX = s.x * 0.7;
  bot.runtime.moveY = s.y * 0.7;
}

function faceAt(bot: Hero, t: { x: number; y: number }) {
  bot.rotation = Math.atan2(t.y - bot.y, t.x - bot.x);
  bot.facing = { x: Math.cos(bot.rotation), y: Math.sin(bot.rotation) };
}

// ---------------------------------------------------------------------------
//  Small helpers
// ---------------------------------------------------------------------------

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function dist2(a: { x: number; y: number }, b: { x: number; y: number }) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}
function nearestInList<T extends { x: number; y: number }>(list: T[], from: Hero, maxD: number): T | null {
  let best: T | null = null;
  let bd = maxD;
  for (const it of list) {
    const d = dist(it, from);
    if (d < bd) { bd = d; best = it; }
  }
  return best;
}
function enemyNear(e: GameEngine, bot: Hero, r: number): Hero | null {
  return e.closestEnemyHero(bot, r);
}
function dangerAround(e: GameEngine, bot: Hero, r: number) {
  const foes = e.heroes.filter(h => h.team !== bot.team && !h.dead && dist(h, bot) < r &&
    (e.sees(bot, h.x, h.y, h.inBush) || dist(h, bot) < 260));
  const turretThreat = e.turrets.some(t => t.team !== bot.team && !t.destroyed && dist(t, bot) < t.range * 0.9);
  return { count: foes.length + (turretThreat ? 1 : 0), heroCount: foes.length, hero: foes.sort((a, b) => dist(a, bot) - dist(b, bot))[0] ?? null };
}
function laneNear(x: number, y: number): Lane | null {
  let best: Lane | null = null;
  let bd = 320;
  for (const lane of LANES) {
    for (const p of LANE_PATHS[lane]) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = lane; }
    }
  }
  return best;
}

export const botHelpers = { power, laneNear, TUNE };
