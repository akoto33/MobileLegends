import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameEngine } from '../engine/GameEngine';
import { GameRenderer } from '../engine/GameRenderer';
import { GameAnnouncement, Item } from '../types/game';
import { ITEMS } from '../data/items';
import {
  Coins,
  Settings,
  ListOrdered,
  Flame,
  Swords,
  RotateCcw,
  HeartPulse,
  Crosshair,
  Building2,
  Plus
} from 'lucide-react';
import { soundManager } from '../audio/soundManager';

interface InGameHUDProps {
  engine: GameEngine;
  renderer: GameRenderer;
  onOpenShop: () => void;
  onOpenScoreboard: () => void;
  onOpenSettings: () => void;
  announcement: GameAnnouncement | null;
}

export const InGameHUD: React.FC<InGameHUDProps> = ({
  engine,
  renderer,
  onOpenShop,
  onOpenScoreboard,
  onOpenSettings,
  announcement
}) => {
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const joystickBaseRef = useRef<HTMLDivElement | null>(null);
  const joystickStickRef = useRef<HTMLDivElement | null>(null);

  const [joystickActive, setJoystickActive] = useState(false);
  const [joystickPos, setJoystickPos] = useState({ x: 0, y: 0 });
  const touchIdRef = useRef<number | null>(null);

  // Re-render tick state for cooldowns and HUD elements
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);

      // Render Minimap
      if (minimapCanvasRef.current) {
        const ctx = minimapCanvasRef.current.getContext('2d');
        if (ctx) {
          renderer.renderMinimap(ctx, engine, 150);
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, [engine, renderer]);

  const player = engine.playerHero;

  // Format Match Timer
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // --- VIRTUAL JOYSTICK HANDLERS ---
  const handleJoystickMove = useCallback((clientX: number, clientY: number) => {
    if (!joystickBaseRef.current) return;
    const rect = joystickBaseRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const distance = Math.hypot(dx, dy);
    const maxRadius = rect.width / 2;

    const clampedDist = Math.min(distance, maxRadius);
    const angle = Math.atan2(dy, dx);

    const stickX = Math.cos(angle) * clampedDist;
    const stickY = Math.sin(angle) * clampedDist;

    setJoystickPos({ x: stickX, y: stickY });

    if (clampedDist > 10) {
      player.vx = Math.cos(angle);
      player.vy = Math.sin(angle);
    } else {
      player.vx = 0;
      player.vy = 0;
    }
  }, [player]);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.changedTouches[0];
    touchIdRef.current = touch.identifier;
    setJoystickActive(true);
    handleJoystickMove(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === touchIdRef.current) {
        handleJoystickMove(touch.clientX, touch.clientY);
        break;
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchIdRef.current) {
        touchIdRef.current = null;
        setJoystickActive(false);
        setJoystickPos({ x: 0, y: 0 });
        player.vx = 0;
        player.vy = 0;
        break;
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setJoystickActive(true);
    handleJoystickMove(e.clientX, e.clientY);

    const onMouseMove = (moveEvent: MouseEvent) => {
      handleJoystickMove(moveEvent.clientX, moveEvent.clientY);
    };

    const onMouseUp = () => {
      setJoystickActive(false);
      setJoystickPos({ x: 0, y: 0 });
      player.vx = 0;
      player.vy = 0;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // --- ATTACK ACTIONS ---
  const handleBasicAttack = () => {
    // Acquire closest enemy hero or minion in range
    const target = engine.heroes
      .filter(h => h.team !== player.team && !h.isDead && Math.hypot(h.x - player.x, h.y - player.y) <= player.attackRange + 120)
      .sort((a, b) => a.currentHp - b.currentHp)[0] ||
      engine.minions
      .filter(m => m.team !== player.team && m.hp > 0 && Math.hypot(m.x - player.x, m.y - player.y) <= player.attackRange + 100)
      .sort((a, b) => a.hp - b.hp)[0] ||
      engine.turrets
      .filter(t => t.team !== player.team && !t.destroyed && Math.hypot(t.x - player.x, t.y - player.y) <= player.attackRange + 100)[0];

    if (target) {
      engine.performBasicAttack(player, target);
    } else {
      // Free swing in facing direction
      soundManager.playAttackSound(player.role === 'Marksman' ? 'arrow' : 'slash');
    }
  };

  const handleTargetMinion = () => {
    const minion = engine.minions
      .filter(m => m.team !== player.team && m.hp > 0 && Math.hypot(m.x - player.x, m.y - player.y) <= player.attackRange + 120)
      .sort((a, b) => a.hp - b.hp)[0];

    if (minion) {
      engine.performBasicAttack(player, minion);
    }
  };

  const handleTargetTurret = () => {
    const turret = engine.turrets
      .filter(t => t.team !== player.team && !t.destroyed && Math.hypot(t.x - player.x, t.y - player.y) <= player.attackRange + 120)[0];

    if (turret) {
      engine.performBasicAttack(player, turret);
    }
  };

  // --- SKILL CASTING ---
  // Check available skill points
  const totalSkillLevels = player.skillLevels[0] + player.skillLevels[1] + player.skillLevels[2];
  const availableSkillPoints = Math.max(0, player.level - totalSkillLevels);

  const handleUpgradeSkill = (e: React.MouseEvent, skillIndex: number) => {
    e.stopPropagation();
    if (availableSkillPoints <= 0) return;

    // Ult (index 2) requires level 4, 8, 12
    if (skillIndex === 2) {
      const maxUltLevel = player.level >= 12 ? 3 : player.level >= 8 ? 2 : player.level >= 4 ? 1 : 0;
      if (player.skillLevels[2] >= maxUltLevel) {
        engine.addFloatingText('Ultimate unlocks at lvl 4, 8, 12!', player.x, player.y - 30, '#f87171');
        return;
      }
    } else {
      if (player.skillLevels[skillIndex] >= 6) return;
    }

    player.skillLevels[skillIndex] += 1;
    soundManager.playLevelUp();
    engine.addFloatingText(`${player.skills[skillIndex].name} UPGRADED!`, player.x, player.y - 30, '#fbbf24');
    setTick(t => t + 1);
  };

  const handleCastSkill = (skillIndex: number) => {
    const skill = player.skills[skillIndex];
    if (!skill) return;

    if (player.skillLevels[skillIndex] <= 0) {
      engine.addFloatingText('Skill not learned yet!', player.x, player.y - 30, '#f87171');
      return;
    }
    if (player.skillCooldowns[skillIndex] > 0) {
      engine.addFloatingText('Cooldown...', player.x, player.y - 30, '#f87171');
      return;
    }
    if (player.currentMana < skill.manaCost) {
      engine.addFloatingText('Low Mana!', player.x, player.y - 30, '#60a5fa');
      return;
    }

    // Auto-aim towards nearest enemy hero if available
    let aimAngle = player.rotation;
    const targetHero = engine.heroes
      .filter(h => h.team !== player.team && !h.isDead && Math.hypot(h.x - player.x, h.y - player.y) <= skill.range + 80)
      .sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))[0];

    if (targetHero) {
      aimAngle = Math.atan2(targetHero.y - player.y, targetHero.x - player.x);
    }

    engine.castSkill(player, skillIndex, aimAngle, targetHero);
  };

  // --- QUICK BUY RECOMMENDATION ---
  const getQuickBuyItem = (): Item | null => {
    if (player.items.length >= 6) return null;
    return ITEMS.find(it => !player.items.some(owned => owned.id === it.id) && player.gold >= it.cost) || null;
  };
  const quickBuyItem = getQuickBuyItem();

  const handleQuickBuy = () => {
    if (!quickBuyItem) return;
    player.gold -= quickBuyItem.cost;
    player.items.push(quickBuyItem);
    soundManager.playGoldSound();
  };

  // Keyboard shortcuts (WASD, Q, W, E, F, B, R, Space, 1, 2, P, Tab)
  useEffect(() => {
    const keysPressed: Record<string, boolean> = {};

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      keysPressed[e.key.toLowerCase()] = true;

      if (e.code === 'Space') {
        e.preventDefault();
        handleBasicAttack();
      } else if (e.key === '1') {
        handleTargetMinion();
      } else if (e.key === '2') {
        handleTargetTurret();
      } else if (e.key.toLowerCase() === 'q') {
        handleCastSkill(0);
      } else if (e.key.toLowerCase() === 'w') {
        handleCastSkill(1);
      } else if (e.key.toLowerCase() === 'e') {
        handleCastSkill(2);
      } else if (e.key.toLowerCase() === 'f') {
        engine.castBattleSpell(player);
      } else if (e.key.toLowerCase() === 'b') {
        engine.triggerRecall(player);
      } else if (e.key.toLowerCase() === 'r') {
        engine.castRegen(player);
      } else if (e.key.toLowerCase() === 'p') {
        onOpenShop();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        onOpenScoreboard();
      }

      // WASD vector update
      updateKeyboardVelocity();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      delete keysPressed[e.key.toLowerCase()];
      updateKeyboardVelocity();
    };

    const updateKeyboardVelocity = () => {
      let vx = 0;
      let vy = 0;
      if (keysPressed['w'] || keysPressed['arrowup']) vy -= 1;
      if (keysPressed['s'] || keysPressed['arrowdown']) vy += 1;
      if (keysPressed['a'] || keysPressed['arrowleft']) vx -= 1;
      if (keysPressed['d'] || keysPressed['arrowright']) vx += 1;

      if (vx !== 0 && vy !== 0) {
        vx *= 0.7071;
        vy *= 0.7071;
      }

      if (!joystickActive) {
        player.vx = vx;
        player.vy = vy;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [player, engine, joystickActive, onOpenShop, onOpenScoreboard]);

  return (
    <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
      {/* --- TOP BAR (SCORE, TIMER, KDA, SHOP, SETTINGS) --- */}
      <div className="absolute top-2 inset-x-2 md:inset-x-4 flex items-center justify-between pointer-events-auto">
        {/* Minimap (Top Left) */}
        <div className="relative rounded-2xl overflow-hidden border-2 border-slate-700/80 bg-slate-950/90 shadow-2xl">
          <canvas
            ref={minimapCanvasRef}
            width={140}
            height={140}
            className="w-28 h-28 sm:w-32 sm:h-32 md:w-36 md:h-36 block"
          />
          {/* Quick Ping buttons underneath minimap */}
          <div className="absolute bottom-1 right-1 flex gap-1">
            <button
              onClick={() => {
                engine.addFloatingText('ATTACK!', player.x, player.y - 45, '#ef4444');
                soundManager.announce('Attack');
              }}
              className="w-5 h-5 rounded-full bg-red-600/80 hover:bg-red-500 text-white flex items-center justify-center text-[10px] shadow"
              title="Ping Attack"
            >
              ⚔️
            </button>
            <button
              onClick={() => {
                engine.addFloatingText('RETREAT!', player.x, player.y - 45, '#f59e0b');
                soundManager.announce('Retreat');
              }}
              className="w-5 h-5 rounded-full bg-amber-600/80 hover:bg-amber-500 text-white flex items-center justify-center text-[10px] shadow"
              title="Ping Retreat"
            >
              🛡️
            </button>
          </div>
        </div>

        {/* Center Score & Timer Header */}
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-2 md:gap-4 px-4 py-1.5 rounded-full bg-slate-950/90 border border-slate-800 shadow-xl backdrop-blur-md">
            {/* Blue Kills */}
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-sm shadow-blue-500/50" />
              <span className="text-xl md:text-2xl font-bold text-blue-400 font-teko">
                {engine.blueKills}
              </span>
            </div>

            {/* Timer */}
            <span className="text-xs md:text-sm font-bold text-slate-300 font-mono tracking-wider px-2 border-x border-slate-800">
              {formatTime(engine.matchTime)}
            </span>

            {/* Red Kills */}
            <div className="flex items-center gap-1.5">
              <span className="text-xl md:text-2xl font-bold text-red-400 font-teko">
                {engine.redKills}
              </span>
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-sm shadow-red-500/50" />
            </div>
          </div>

          {/* Player K/D/A & Gold */}
          <div className="flex items-center gap-3 mt-1 px-3 py-0.5 rounded-md bg-slate-900/80 border border-slate-800/60 text-[11px] font-semibold text-slate-300">
            <span>KDA: <strong className="text-white">{player.kills}</strong>/<strong className="text-red-400">{player.deaths}</strong>/<strong className="text-white">{player.assists}</strong></span>
            <span>•</span>
            <span className="text-amber-400 flex items-center gap-1">
              <Coins className="w-3 h-3" />
              {player.gold}
            </span>
          </div>
        </div>

        {/* Top Right Action Icons */}
        <div className="flex items-center gap-2">
          {/* Shop Button */}
          <button
            onClick={onOpenShop}
            className="p-2 md:p-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-amber-500/40 text-amber-400 shadow-lg flex items-center gap-1.5 transition-all active:scale-95"
            title="Open Equipment Shop (P)"
          >
            <Coins className="w-4 h-4 md:w-5 md:h-5" />
            <span className="hidden sm:inline text-xs font-bold font-teko text-sm">{player.gold} G</span>
          </button>

          {/* Scoreboard Button */}
          <button
            onClick={onOpenScoreboard}
            className="p-2 md:p-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-slate-300 shadow-lg transition-all active:scale-95"
            title="Scoreboard (Tab)"
          >
            <ListOrdered className="w-4 h-4 md:w-5 md:h-5" />
          </button>

          {/* Settings Button */}
          <button
            onClick={onOpenSettings}
            className="p-2 md:p-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-slate-300 shadow-lg transition-all active:scale-95"
            title="Settings"
          >
            <Settings className="w-4 h-4 md:w-5 md:h-5" />
          </button>
        </div>
      </div>

      {/* --- QUICK BUY RECOMMENDATION (Top-Left under minimap) --- */}
      {quickBuyItem && (
        <div className="absolute top-36 md:top-44 left-2 md:left-4 pointer-events-auto">
          <button
            onClick={handleQuickBuy}
            className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-900/90 border border-amber-500/60 shadow-xl backdrop-blur-sm text-left hover:bg-slate-800/90 transition-all active:scale-95"
          >
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs border border-amber-500/30">
              <Coins className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] text-amber-400 uppercase font-bold tracking-wider block">
                Quick Buy
              </span>
              <span className="text-xs font-bold text-white block truncate max-w-[100px]">
                {quickBuyItem.name}
              </span>
            </div>
            <span className="text-xs font-bold text-amber-400 font-teko">
              {quickBuyItem.cost}G
            </span>
          </button>
        </div>
      )}

      {/* --- KILL ANNOUNCEMENT BANNER (Center) --- */}
      {announcement && (
        <div className="absolute top-20 inset-x-0 flex justify-center pointer-events-none z-30 animate-banner">
          <div
            className={`px-6 py-2.5 rounded-2xl border shadow-2xl backdrop-blur-md flex flex-col items-center ${
              announcement.team === 'blue'
                ? 'bg-blue-950/80 border-blue-500/50 shadow-blue-500/30 text-blue-300'
                : 'bg-red-950/80 border-red-500/50 shadow-red-500/30 text-red-300'
            }`}
          >
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-widest uppercase font-teko text-amber-300 drop-shadow">
              {announcement.title}
            </h2>
            {announcement.subtitle && (
              <p className="text-xs font-semibold text-slate-200">{announcement.subtitle}</p>
            )}
          </div>
        </div>
      )}

      {/* --- KILL FEED (Top Right under buttons) --- */}
      <div className="absolute top-16 right-2 md:right-4 flex flex-col gap-1 pointer-events-none max-w-[220px]">
        {engine.killFeed.slice(0, 4).map(item => (
          <div
            key={item.id}
            className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-950/80 backdrop-blur-sm border border-slate-800 text-[10px] text-slate-200 animate-fadeIn"
          >
            <span className={item.killerTeam === 'blue' ? 'text-blue-400 font-bold' : 'text-red-400 font-bold'}>
              {item.killerName}
            </span>
            <Swords className="w-3 h-3 text-slate-500 flex-shrink-0" />
            <span className={item.victimTeam === 'blue' ? 'text-blue-400' : 'text-red-400'}>
              {item.victimName}
            </span>
          </div>
        ))}
      </div>

      {/* --- BOTTOM LEFT: VIRTUAL ANALOG JOYSTICK --- */}
      <div className="absolute bottom-6 left-6 pointer-events-auto">
        <div
          ref={joystickBaseRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          className="relative w-36 h-36 md:w-44 md:h-44 rounded-full border-2 border-slate-600/50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center cursor-pointer shadow-2xl active:border-blue-400/80"
        >
          {/* Center Stick */}
          <div
            ref={joystickStickRef}
            style={{
              transform: `translate(${joystickPos.x}px, ${joystickPos.y}px)`
            }}
            className={`w-14 h-14 md:w-16 md:h-16 rounded-full border-2 flex items-center justify-center transition-all ${
              joystickActive
                ? 'bg-blue-600/80 border-blue-300 shadow-lg shadow-blue-500/50 scale-105'
                : 'bg-slate-800/80 border-slate-600'
            }`}
          >
            <div className="w-4 h-4 rounded-full bg-white/40" />
          </div>

          <span className="absolute bottom-2 text-[9px] text-slate-500 font-medium">
            WASD or Drag
          </span>
        </div>
      </div>

      {/* --- CENTER BOTTOM: HERO STATS & RECALL & REGEN --- */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto">
        {/* Recall & Regen Spells */}
        <div className="flex items-center gap-3 mb-2">
          {/* Recall Button */}
          <button
            onClick={() => engine.triggerRecall(player)}
            disabled={player.recallProgress !== null}
            className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 text-xs font-semibold backdrop-blur-sm transition-all active:scale-95 ${
              player.recallProgress !== null
                ? 'bg-blue-600/30 border-blue-400 text-blue-300 animate-pulse'
                : 'bg-slate-900/90 border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{player.recallProgress !== null ? `${Math.ceil(6 - player.recallProgress)}s` : 'Recall (B)'}</span>
          </button>

          {/* Regen Button */}
          <button
            onClick={() => engine.castRegen(player)}
            disabled={player.regenCooldown > 0}
            className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 text-xs font-semibold backdrop-blur-sm transition-all active:scale-95 ${
              player.regenCooldown > 0
                ? 'bg-slate-950/80 border-slate-800 text-slate-600'
                : 'bg-slate-900/90 border-slate-700/80 text-emerald-400 hover:bg-slate-800'
            }`}
          >
            <HeartPulse className="w-3.5 h-3.5 text-emerald-400" />
            <span>{player.regenCooldown > 0 ? `${Math.ceil(player.regenCooldown)}s` : 'Regen (R)'}</span>
          </button>
        </div>

        {/* Health & Mana Readout */}
        <div className="w-56 sm:w-64 bg-slate-950/90 p-2 rounded-xl border border-slate-800 shadow-xl backdrop-blur-md">
          {/* Hero Name & Level */}
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="font-bold text-white flex items-center gap-1">
              <span className="w-4 h-4 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold flex items-center justify-center">
                {player.level}
              </span>
              {player.name}
            </span>
            <span className="text-slate-400 text-[10px]">
              {Math.round(player.currentHp)} / {player.maxHp} HP
            </span>
          </div>

          {/* HP Bar */}
          <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden mb-1 border border-slate-700/50">
            <div
              style={{ width: `${Math.max(0, Math.min(100, (player.currentHp / player.maxHp) * 100))}%` }}
              className={`h-full transition-all duration-150 ${
                player.currentHp / player.maxHp > 0.4 ? 'bg-emerald-500' : 'bg-red-500'
              }`}
            />
          </div>

          {/* Mana Bar */}
          {player.maxMana > 0 && (
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700/50">
              <div
                style={{ width: `${Math.max(0, Math.min(100, (player.currentMana / player.maxMana) * 100))}%` }}
                className="h-full bg-blue-500 transition-all duration-150"
              />
            </div>
          )}
        </div>
      </div>

      {/* --- BOTTOM RIGHT: COMBAT ACTION BUTTONS (ATTACK, SKILLS, TARGET LOCKS) --- */}
      <div className="absolute bottom-6 right-6 pointer-events-auto flex items-end gap-3">
        {/* Skills Column / Arc */}
        <div className="relative flex items-center gap-3">
          {/* Skill 1 */}
          <div className="relative">
            {/* Level up + button */}
            {availableSkillPoints > 0 && player.skillLevels[0] < 6 && (
              <button
                onClick={(e) => handleUpgradeSkill(e, 0)}
                className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 w-6 h-6 rounded-full bg-amber-400 text-slate-950 font-bold flex items-center justify-center shadow-lg shadow-amber-400/50 hover:bg-yellow-300 transition-all scale-110 active:scale-95 animate-bounce"
                title="Level Up Skill 1"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
              </button>
            )}

            <button
              onClick={() => handleCastSkill(0)}
              className={`w-14 h-14 md:w-16 md:h-16 rounded-full border-2 flex flex-col items-center justify-center shadow-xl transition-all active:scale-95 relative ${
                player.skillCooldowns[0] > 0 || player.skillLevels[0] === 0
                  ? 'border-slate-700 bg-slate-900/80 text-slate-600'
                  : 'border-blue-500/80 bg-blue-950/80 text-blue-300 hover:border-blue-400 shadow-blue-500/20'
              }`}
            >
              <span className="text-[10px] font-bold uppercase truncate max-w-[50px]">
                {player.skills[0].name.split(' ')[0]}
              </span>
              <span className="text-[9px] text-slate-400">Q</span>

              {/* Cooldown Number Overlay */}
              {player.skillCooldowns[0] > 0 && (
                <div className="absolute inset-0 rounded-full bg-slate-950/80 flex items-center justify-center text-sm font-bold text-white font-teko">
                  {player.skillCooldowns[0].toFixed(1)}s
                </div>
              )}
            </button>
          </div>

          {/* Skill 2 */}
          <div className="relative">
            {availableSkillPoints > 0 && player.skillLevels[1] < 6 && (
              <button
                onClick={(e) => handleUpgradeSkill(e, 1)}
                className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 w-6 h-6 rounded-full bg-amber-400 text-slate-950 font-bold flex items-center justify-center shadow-lg shadow-amber-400/50 hover:bg-yellow-300 transition-all scale-110 active:scale-95 animate-bounce"
                title="Level Up Skill 2"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
              </button>
            )}

            <button
              onClick={() => handleCastSkill(1)}
              className={`w-14 h-14 md:w-16 md:h-16 rounded-full border-2 flex flex-col items-center justify-center shadow-xl transition-all active:scale-95 relative ${
                player.skillCooldowns[1] > 0 || player.skillLevels[1] === 0
                  ? 'border-slate-700 bg-slate-900/80 text-slate-600'
                  : 'border-purple-500/80 bg-purple-950/80 text-purple-300 hover:border-purple-400 shadow-purple-500/20'
              }`}
            >
              <span className="text-[10px] font-bold uppercase truncate max-w-[50px]">
                {player.skills[1].name.split(' ')[0]}
              </span>
              <span className="text-[9px] text-slate-400">W</span>

              {player.skillCooldowns[1] > 0 && (
                <div className="absolute inset-0 rounded-full bg-slate-950/80 flex items-center justify-center text-sm font-bold text-white font-teko">
                  {player.skillCooldowns[1].toFixed(1)}s
                </div>
              )}
            </button>
          </div>

          {/* Skill 3 (Ultimate) */}
          <div className="relative">
            {availableSkillPoints > 0 && (player.level >= 4 && player.skillLevels[2] === 0 || player.level >= 8 && player.skillLevels[2] === 1 || player.level >= 12 && player.skillLevels[2] === 2) && (
              <button
                onClick={(e) => handleUpgradeSkill(e, 2)}
                className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 w-6 h-6 rounded-full bg-amber-400 text-slate-950 font-bold flex items-center justify-center shadow-lg shadow-amber-400/50 hover:bg-yellow-300 transition-all scale-110 active:scale-95 animate-bounce"
                title="Level Up Ultimate"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
              </button>
            )}

            <button
              onClick={() => handleCastSkill(2)}
              className={`w-16 h-16 md:w-20 md:h-20 rounded-full border-2 flex flex-col items-center justify-center shadow-2xl transition-all active:scale-95 relative ${
                player.skillCooldowns[2] > 0 || player.skillLevels[2] === 0
                  ? 'border-amber-900 bg-slate-900/80 text-slate-600'
                  : 'border-amber-400 bg-gradient-to-tr from-amber-600/40 via-yellow-500/20 to-amber-400/40 text-amber-300 hover:border-yellow-300 shadow-amber-500/30'
              }`}
            >
              <Flame className="w-5 h-5 text-amber-400 animate-pulse" />
              <span className="text-[10px] font-bold uppercase truncate max-w-[60px]">
                {player.skills[2].name.split(' ')[0]}
              </span>
              <span className="text-[9px] text-amber-400 font-bold">ULT (E)</span>

              {player.skillCooldowns[2] > 0 && (
                <div className="absolute inset-0 rounded-full bg-slate-950/85 flex items-center justify-center text-base font-bold text-amber-400 font-teko">
                  {player.skillCooldowns[2].toFixed(1)}s
                </div>
              )}
            </button>
          </div>

          {/* Battle Spell Button */}
          <button
            onClick={() => engine.castBattleSpell(player)}
            disabled={player.spellCooldown > 0}
            className={`w-11 h-11 md:w-12 md:h-12 rounded-full border flex flex-col items-center justify-center text-xs transition-all active:scale-95 relative ${
              player.spellCooldown > 0
                ? 'border-slate-800 bg-slate-950/80 text-slate-600'
                : 'border-yellow-500/60 bg-yellow-500/10 text-yellow-400 shadow-md'
            }`}
            title={`Battle Spell: ${player.spell.name} (F)`}
          >
            <span className="text-[9px] font-bold truncate max-w-[36px]">{player.spell.name.substring(0, 4)}</span>
            <span className="text-[8px] text-slate-400">F</span>
            {player.spellCooldown > 0 && (
              <div className="absolute inset-0 rounded-full bg-slate-950/85 flex items-center justify-center text-xs font-bold text-white">
                {Math.ceil(player.spellCooldown)}s
              </div>
            )}
          </button>
        </div>

        {/* --- MAIN BASIC ATTACK & TARGETING BUTTONS CLUSTER --- */}
        <div className="relative flex flex-col items-center gap-2">
          {/* Target Minion & Turret Mini Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleTargetMinion}
              className="w-10 h-10 rounded-full border border-slate-700 bg-slate-900/90 text-slate-300 hover:text-white hover:border-blue-400 flex flex-col items-center justify-center shadow-lg active:scale-95"
              title="Target Minion (1)"
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span className="text-[8px] text-slate-400">1</span>
            </button>

            <button
              onClick={handleTargetTurret}
              className="w-10 h-10 rounded-full border border-slate-700 bg-slate-900/90 text-slate-300 hover:text-white hover:border-amber-400 flex flex-col items-center justify-center shadow-lg active:scale-95"
              title="Target Turret (2)"
            >
              <Building2 className="w-3.5 h-3.5" />
              <span className="text-[8px] text-slate-400">2</span>
            </button>
          </div>

          {/* Big Basic Attack Button */}
          <button
            onClick={handleBasicAttack}
            className="w-20 h-20 md:w-24 md:h-24 rounded-full border-4 border-amber-400/90 bg-gradient-to-tr from-amber-600 via-yellow-500 to-amber-400 text-slate-950 flex flex-col items-center justify-center shadow-2xl shadow-amber-500/40 active:scale-90 transition-transform"
            title="Basic Attack (Spacebar)"
          >
            <Swords className="w-8 h-8 md:w-9 md:h-9" />
            <span className="text-[9px] md:text-[10px] font-extrabold uppercase tracking-wider font-teko">
              ATTACK (SPACE)
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
