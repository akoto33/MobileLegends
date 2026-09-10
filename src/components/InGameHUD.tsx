import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameEngine } from '../engine/GameEngine';
import { GameRenderer } from '../engine/GameRenderer';
import { Announcement, ChatMessage, MapPing } from '../types/game';
import { QUICK_CHAT } from '../engine/ChatSystem';
import { MAP_H, MAP_W } from '../engine/GameMap';
import {
  Coins, Settings, Users, Store, Swords, RotateCcw, HeartPulse, Shield,
  Send, MessageSquare, Play, Pause, Flag, Volume2
} from 'lucide-react';

interface Props {
  engine: GameEngine;
  renderer: GameRenderer;
  paused: boolean;
  announcement: Announcement | null;
  onResume: () => void;
  onQuit: () => void;
  onOpenShop: () => void;
  onOpenBoard: () => void;
  onOpenSettings: () => void;
  onChatFocusChange: (focused: boolean) => void;
  /** bumped by App when the player presses Enter */
  chatSignal: number;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export const InGameHUD: React.FC<Props> = ({
  engine, renderer, paused, announcement, onResume, onQuit,
  onOpenShop, onOpenBoard, onOpenSettings, onChatFocusChange, chatSignal
}) => {
  const [, setTick] = useState(0);
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const joyRef = useRef<HTMLDivElement | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState('');
  const [chatInput, setChatInput] = useState(false);
  const [wheel, setWheel] = useState(false);
  const [showTeamChatOnly, setShowTeamChatOnly] = useState(true);
  const [muted, setMuted] = useState(false);
  const joyTouch = useRef<{ id: number | null }>({ id: null });
  const [joyVec, setJoyVec] = useState({ x: 0, y: 0 });
  const [aiming, setAiming] = useState<number | null>(null);
  const aimStart = useRef<{ x: number; y: number; t: number } | null>(null);

  // Enter (raised by App) opens the chat box
  const lastSignal = useRef(chatSignal);
  useEffect(() => {
    if (chatSignal !== lastSignal.current) {
      lastSignal.current = chatSignal;
      setChatOpen(true);
      setChatInput(true);
    }
  }, [chatSignal]);

  // HUD refresh clock (the canvas runs at 60fps; text/positions do not need it)
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < 60) return;
      last = t;
      setTick(v => (v + 1) % 100000);
      const cv = minimapRef.current;
      if (cv) {
        const g = cv.getContext('2d');
        if (g) renderer.renderMinimap(g, engine, cv.width);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engine, renderer]);

  const me = engine.player;
  const snap = engine.snapshot();
  const allies = snap.heroes.filter(h => h.team === me.team);
  const foes = snap.heroes.filter(h => h.team !== me.team);
  const recentChat = useMemo(
    () => engine.chat.messages.slice(-18).filter(m => !showTeamChatOnly || m.channel !== 'all' || m.isPlayer),
    [engine.chat.version, showTeamChatOnly, engine]
  ) as ChatMessage[];

  useEffect(() => {
    if (chatOpen && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatOpen, recentChat.length]);

  // ---------------------------------------------------------------- joystick
  const applyJoy = useCallback((cx: number, cy: number) => {
    const el = joyRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = cx - (r.left + r.width / 2);
    const dy = cy - (r.top + r.height / 2);
    const dist = Math.hypot(dx, dy);
    const max = r.width / 2;
    const clamped = Math.min(dist, max);
    const ang = Math.atan2(dy, dx);
    setJoyVec({ x: Math.cos(ang) * clamped, y: Math.sin(ang) * clamped });
    if (dist > 12) engine.setMoveVector(Math.cos(ang), Math.sin(ang));
    else engine.setMoveVector(0, 0);
  }, [engine]);

  const endJoy = useCallback(() => {
    joyTouch.current.id = null;
    setJoyVec({ x: 0, y: 0 });
    engine.setMoveVector(0, 0);
  }, [engine]);

  // ------------------------------------------------------------ skill aiming
  const castFromAim = (index: number, ev: PointerEvent | React.PointerEvent, quick: boolean) => {
    const cv = document.getElementById('ml-game') as HTMLCanvasElement | null;
    let angle = me.rotation;
    if (!quick && cv) {
      const r = cv.getBoundingClientRect();
      const dpr = cv.width / Math.max(1, r.width);
      const sx = (ev.clientX - r.left) * dpr;
      const sy = (ev.clientY - r.top) * dpr;
      const wx = (sx - cv.width / 2) / engine.camera.zoom + engine.camera.x;
      const wy = (sy - cv.height / 2) / engine.camera.zoom + engine.camera.y;
      angle = Math.atan2(wy - me.y, wx - me.x);
    }
    engine.aim = null;
    engine.castSkill(me, index as 0 | 1 | 2, angle);
  };

  const onSkillDown = (index: number) => (ev: React.PointerEvent) => {
    ev.preventDefault();
    (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);
    setAiming(index);
    aimStart.current = { x: ev.clientX, y: ev.clientY, t: performance.now() };
    engine.aim = { skillIndex: index, angle: me.rotation, aiming: true };
  };
  const onSkillMove = (index: number) => (ev: React.PointerEvent) => {
    if (aiming !== index || !aimStart.current) return;
    const cv = document.getElementById('ml-game') as HTMLCanvasElement | null;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    const dpr = cv.width / Math.max(1, r.width);
    const wx = ((ev.clientX - r.left) * dpr - cv.width / 2) / engine.camera.zoom + engine.camera.x;
    const wy = ((ev.clientY - r.top) * dpr - cv.height / 2) / engine.camera.zoom + engine.camera.y;
    const moved = Math.hypot(ev.clientX - aimStart.current.x, ev.clientY - aimStart.current.y);
    engine.aim = { skillIndex: index, angle: Math.atan2(wy - me.y, wx - me.x), aiming: moved > 22 };
  };
  const onSkillUp = (index: number) => (ev: React.PointerEvent) => {
    if (aiming !== index) return;
    const quick = !engine.aim?.aiming;
    setAiming(null);
    aimStart.current = null;
    castFromAim(index, ev, quick);
  };

  // ------------------------------------------------------------------ chat
  const sendChat = (all: boolean) => {
    const text = chatText.trim();
    if (!text) return;
    engine.sendChat(text, all);
    setChatText('');
  };
  const sendQuick = (idx: number, all = false) => {
    engine.sendQuickChat(QUICK_CHAT[idx], all);
    setWheel(false);
  };
  const pingAt = (kind: MapPing['kind'], x: number, y: number) => {
    engine.addPing(kind, x, y, me, true);
  };
  const onMinimapDown = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = minimapRef.current;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * MAP_W;
    const y = ((ev.clientY - r.top) / r.height) * MAP_H;
    const kind: MapPing['kind'] = ev.shiftKey ? 'retreat' : ev.button === 2 ? 'retreat' : 'attack';
    pingAt(kind, x, y);
  };

  const levelUpAvailable = me.skillPoints > 0;
  const ultCap = me.level >= 12 ? 3 : me.level >= 8 ? 2 : me.level >= 4 ? 1 : 0;
  const goldText = Math.round(me.gold);
  const income = engine.time > 30 ? Math.round((me.goldEarned / engine.time) * 60) : 0;

  return (
    <div className="pointer-events-none absolute inset-0 select-none overflow-hidden text-slate-100">
      {/* ============================ TOP BAR ============================ */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2">
        {/* --- minimap + pings --- */}
        <div className="pointer-events-auto flex flex-col gap-1">
          <div className="relative overflow-hidden rounded-lg border border-slate-600/70 bg-slate-950/85 shadow-lg">
            <canvas
              ref={minimapRef}
              width={168}
              height={168}
              className="block h-[132px] w-[132px] cursor-crosshair sm:h-[168px] sm:w-[168px]"
              onPointerDown={onMinimapDown}
              onContextMenu={e => e.preventDefault()}
            />
            <div className="absolute inset-x-0 bottom-0 flex justify-between bg-slate-950/80 px-1 py-0.5 text-[9px] font-semibold text-slate-400">
              <span>CLICK = ATTACK PING</span>
              <span>SHIFT = RETREAT</span>
            </div>
          </div>
          <div className="flex gap-1">
            {([['attack', '⚔'], ['retreat', '⛔'], ['help', '❗'], ['gather', '✦']] as [MapPing['kind'], string][]).map(([k, label]) => (
              <button
                key={k}
                onClick={() => pingAt(k, me.x + me.facing.x * 320, me.y + me.facing.y * 320)}
                className="h-7 w-7 rounded-md border border-slate-700 bg-slate-900/90 text-xs text-slate-200 hover:border-amber-400 active:scale-95"
                title={`Ping ${k}`}
              >
                {label}
              </button>
            ))}
            <button
              onClick={() => setWheel(v => !v)}
              className="h-7 flex-1 rounded-md border border-slate-700 bg-slate-900/90 px-2 text-[10px] font-bold text-sky-300 hover:border-sky-400 active:scale-95"
            >
              CHAT WHEEL
            </button>
          </div>
        </div>

        {/* --- score --- */}
        <div className="pointer-events-auto flex flex-col items-center">
          <div className="flex items-center gap-3 rounded-xl border border-slate-700/70 bg-slate-950/85 px-4 py-1.5 shadow-xl backdrop-blur">
            <span id="ml-score-blue" className="text-lg font-bold text-sky-400 font-teko">{snap.blueKills}</span>
            <div className="flex flex-col items-center leading-none">
              <span id="ml-clock" className="font-mono text-[13px] font-bold text-slate-200">{fmt(snap.time)}</span>
              <span className="text-[9px] uppercase tracking-wider text-slate-500">{snap.phase}</span>
            </div>
            <span id="ml-score-red" className="text-lg font-bold text-rose-400 font-teko">{snap.redKills}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[10px]">
            <span className={`rounded px-1.5 py-0.5 font-semibold ${snap.objectives.turtleAlive ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800/80 text-slate-400'}`}>
              🐢 {snap.objectives.turtleAlive ? 'UP' : `${Math.ceil(snap.objectives.turtleIn)}s`}
            </span>
            <span className={`rounded px-1.5 py-0.5 font-semibold ${snap.objectives.lordAlive ? 'bg-purple-500/20 text-purple-300' : 'bg-slate-800/80 text-slate-400'}`}>
              👑 {snap.objectives.lordAlive ? 'UP' : `${Math.ceil(snap.objectives.lordIn)}s`}
              {snap.objectives.lordTeam ? ` · ${snap.objectives.lordTeam}` : ''}
            </span>
            <span className="rounded bg-slate-800/80 px-1.5 py-0.5 font-semibold text-slate-300">
              TOWERS {snap.blueTurrets}-{snap.redTurrets}
            </span>
            <span className="hidden rounded bg-slate-800/80 px-1.5 py-0.5 font-semibold text-slate-500 sm:inline">
              {snap.fps} fps
            </span>
          </div>
        </div>

        {/* --- buttons --- */}
        <div className="pointer-events-auto flex items-start gap-1.5">
          <div className="flex flex-col gap-1">
            <button onClick={onOpenBoard} className="rounded-md border border-slate-700 bg-slate-900/90 p-1.5 text-slate-300 hover:text-white" title="Scoreboard (Tab)">
              <Users className="h-4 w-4" />
            </button>
            <button onClick={() => setMuted(m => !m)} className="rounded-md border border-slate-700 bg-slate-900/90 p-1.5 text-slate-300 hover:text-white" title="Mute opponent chat">
              <Volume2 className={`h-4 w-4 ${muted ? 'text-slate-600' : 'text-emerald-400'}`} />
            </button>
          </div>
          <button onClick={onOpenShop} className="flex items-center gap-1 rounded-md border border-amber-500/50 bg-slate-900/90 px-2 py-1.5 text-amber-300 hover:bg-slate-800" title="Shop (P)">
            <Coins className="h-4 w-4" />
            <span className="text-xs font-bold font-teko">{goldText}</span>
          </button>
          <button onClick={onResume} className="rounded-md border border-slate-700 bg-slate-900/90 p-1.5 text-slate-300 hover:text-white" title="Pause (Esc)">
            {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </button>
          <button onClick={onOpenSettings} className="rounded-md border border-slate-700 bg-slate-900/90 p-1.5 text-slate-300 hover:text-white" title="Settings">
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ======================= KILL FEED ======================= */}
      <div className="absolute right-2 top-[92px] flex w-[210px] flex-col gap-1">
        {snap.killFeed.slice(0, 5).map(k => (
          <div key={k.uid} className="flex items-center gap-1 rounded bg-slate-950/75 px-1.5 py-1 text-[10px] shadow backdrop-blur-sm animate-[fadeIn_.2s_ease]">
            <span className={k.killerTeam === me.team ? 'font-bold text-sky-300' : 'font-bold text-rose-300'}>{k.killerName}</span>
            <Swords className="h-3 w-3 shrink-0 text-slate-500" />
            <span className={k.victimTeam === me.team ? 'text-sky-300' : 'text-rose-300'}>{k.victimName}</span>
            <span className="ml-auto text-slate-500">{fmt(k.time)}</span>
          </div>
        ))}
      </div>

      {/* ======================= ANNOUNCEMENT ======================= */}
      {announcement && (
        <div className="absolute inset-x-0 top-24 flex justify-center">
          <div className={`animate-banner rounded-xl border px-6 py-2 text-center shadow-2xl backdrop-blur ${announcement.team === me.team ? 'border-sky-400/60 bg-sky-950/80' : 'border-rose-400/60 bg-rose-950/80'}`}>
            <div className="text-2xl font-extrabold uppercase tracking-widest text-amber-300 font-teko">{announcement.title}</div>
            {announcement.subtitle && <div className="text-[11px] font-semibold text-slate-200">{announcement.subtitle}</div>}
          </div>
        </div>
      )}

      {/* ======================= CHAT ======================= */}
      <div className="pointer-events-auto absolute bottom-[178px] left-2 w-[268px]">
        <div className="mb-1 flex items-center gap-1">
          <button
            onClick={() => { setChatOpen(v => !v); if (!chatOpen) onChatFocusChange(false); }}
            className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-950/80 px-2 py-1 text-[10px] font-bold text-slate-300 hover:text-white"
          >
            <MessageSquare className="h-3 w-3" />
            CHAT {chatOpen ? '▾' : '▴'} <span className="text-slate-500">{engine.chat.messages.length}</span>
          </button>
          <button
            onClick={() => setShowTeamChatOnly(v => !v)}
            className="rounded-md border border-slate-700 bg-slate-950/80 px-2 py-1 text-[10px] font-semibold text-slate-400 hover:text-white"
            title="Toggle team/all channel"
          >
            {showTeamChatOnly ? 'TEAM' : 'ALL'}
          </button>
        </div>

        <div
          ref={chatScrollRef}
          className={`flex flex-col gap-0.5 overflow-y-auto rounded-md bg-slate-950/${chatOpen ? '85' : '60'} p-1.5 text-[11px] transition-all ${chatOpen ? 'max-h-52' : 'max-h-[68px] [scrollbar-width:none]'}`}
        >
          {recentChat.length === 0 && <span className="text-slate-500">No messages yet — say gg with the wheel.</span>}
          {recentChat.map(m => (
            <div key={m.uid} className="leading-tight">
              {m.channel === 'system' ? (
                <span className="italic text-amber-200/80">★ {m.text}</span>
              ) : (
                <>
                  <span className={m.senderTeam === me.team ? 'font-bold text-sky-300' : 'font-bold text-rose-300'}>
                    {m.senderName}
                  </span>
                  {m.isPlayer && <span className="text-amber-400"> ◂</span>}
                  <span className="text-slate-400">: </span>
                  <span className={m.isQuick ? 'text-emerald-200' : 'text-slate-100'}>{m.text}</span>
                  {m.channel === 'all' && <span className="text-[9px] text-slate-500"> [all]</span>}
                </>
              )}
            </div>
          ))}
        </div>

        {chatOpen && (
          <div className="mt-1 flex gap-1">
            <input
              autoFocus={chatInput}
              value={chatText}
              onFocus={() => { setChatInput(true); onChatFocusChange(true); }}
              onBlur={() => { setChatInput(false); onChatFocusChange(false); }}
              onChange={e => setChatText(e.target.value.slice(0, 100))}
              onKeyDown={e => {
                if (e.key === 'Enter') { sendChat(e.shiftKey); (e.target as HTMLInputElement).blur(); }
                if (e.key === 'Escape') { setChatText(''); (e.target as HTMLInputElement).blur(); }
                e.stopPropagation();
              }}
              placeholder="Message team… (Shift+Enter = all)"
              className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-900/90 px-2 py-1 text-[11px] text-white outline-none placeholder:text-slate-500 focus:border-sky-400"
            />
            <button onClick={() => sendChat(false)} className="rounded-md border border-sky-500/50 bg-sky-600/20 px-2 text-sky-300 hover:bg-sky-600/40">
              <Send className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setWheel(v => !v)} className="rounded-md border border-slate-700 bg-slate-900/90 px-2 text-amber-300">
              ☰
            </button>
          </div>
        )}

        {wheel && (
          <div className="mt-1 grid grid-cols-2 gap-1 rounded-md border border-slate-700 bg-slate-950/95 p-1.5 shadow-2xl">
            {QUICK_CHAT.map((q, i) => (
              <div key={q.id} className="flex gap-1">
                <button
                  onClick={() => sendQuick(i, false)}
                  className="flex-1 truncate rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-left text-[10px] text-slate-200 hover:border-sky-400 active:scale-95"
                >
                  {q.label}
                </button>
                <button
                  onClick={() => sendQuick(i, true)}
                  title="Send to all"
                  className="w-6 rounded border border-slate-800 bg-slate-900 text-[9px] text-slate-500 hover:text-rose-300"
                >
                  all
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ======================= HERO VITALS (bottom centre) ======================= */}
      <div className="pointer-events-auto absolute bottom-3 left-1/2 w-[300px] -translate-x-1/2 rounded-lg border border-slate-700/70 bg-slate-950/85 p-2 backdrop-blur">
        <div className="mb-1 flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1.5 font-bold">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[10px] font-black text-slate-950">{me.level}</span>
            {me.name}
            <span className="text-[9px] uppercase text-slate-500">{me.laneAssigned}</span>
          </span>
          <span className="font-mono text-[10px] text-slate-400">
            {Math.round(me.hp)}/{me.stats.maxHp} · {income} g/min
          </span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div className={`h-full transition-[width] duration-100 ${me.hp / me.stats.maxHp > 0.35 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${Math.max(0, (me.hp / me.stats.maxHp) * 100)}%` }} />
        </div>
        {me.stats.maxMana > 0 && (
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div className="h-full bg-sky-500" style={{ width: `${Math.max(0, (me.mana / me.stats.maxMana) * 100)}%` }} />
          </div>
        )}
        <div className="mt-1.5 flex items-center justify-between">
          <div className="flex items-center gap-1">
            {me.items.map((it, i) => (
              <button
                key={i}
                onClick={() => it && engine.sellItem(me, i)}
                title={it ? `${it.name} — click to sell (70%)` : 'empty slot'}
                className={`flex h-6 w-6 items-center justify-center rounded border text-[8px] font-bold ${it ? 'border-amber-500/60 bg-amber-500/15 text-amber-200' : 'border-slate-700 bg-slate-900 text-slate-600'}`}
              >
                {it ? it.name.split(' ').map(s => s[0]).join('').slice(0, 2) : '·'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-slate-400">
            <span className="font-bold text-slate-200">{me.kills}</span>/<span className="text-rose-400">{me.deaths}</span>/<span className="text-slate-200">{me.assists}</span>
            <span className="ml-1 text-slate-500">cs {me.creepScore}</span>
          </div>
        </div>
      </div>

      {/* ======================= JOYSTICK ======================= */}
      <div className="pointer-events-auto absolute bottom-[188px] left-3 sm:bottom-6">
        <div
          ref={joyRef}
          onPointerDown={ev => {
            ev.preventDefault();
            joyTouch.current.id = ev.pointerId;
            (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
            applyJoy(ev.clientX, ev.clientY);
          }}
          onPointerMove={ev => { if (joyTouch.current.id === ev.pointerId) applyJoy(ev.clientX, ev.clientY); }}
          onPointerUp={ev => { if (joyTouch.current.id === ev.pointerId) endJoy(); }}
          onPointerCancel={ev => { if (joyTouch.current.id === ev.pointerId) endJoy(); }}
          className="relative flex h-[124px] w-[124px] touch-none items-center justify-center rounded-full border-2 border-slate-600/60 bg-slate-950/60 backdrop-blur-sm active:border-sky-400/80 sm:h-[150px] sm:w-[150px]"
        >
          <div className="absolute inset-3 rounded-full border border-dashed border-slate-700/60" />
          <div
            className={`h-12 w-12 rounded-full border-2 shadow-xl transition-colors sm:h-14 sm:w-14 ${joyVec.x || joyVec.y ? 'border-sky-300 bg-sky-600/80' : 'border-slate-600 bg-slate-800/90'}`}
            style={{ transform: `translate(${joyVec.x * 0.62}px, ${joyVec.y * 0.62}px)` }}
          />
          <span className="absolute bottom-1.5 text-[9px] font-semibold text-slate-500">WASD / DRAG</span>
        </div>
      </div>

      {/* ======================= ACTION CLUSTER ======================= */}
      <div className="pointer-events-auto absolute bottom-3 right-2 flex items-end gap-2 sm:bottom-5 sm:right-4">
        {/* column of small buttons */}
        <div className="flex flex-col gap-1.5">
          <MiniBtn label="spell" hot="F" cd={snap.spell.cooldownLeft} onClick={() => engine.castSpell(me)} tone="amber">
            <Flag className="h-4 w-4" />
          </MiniBtn>
          <MiniBtn label="recall" hot="B" cd={me.runtime.recallTimer > 0 ? 5.5 - me.runtime.recallTimer : 0} onClick={() => engine.recall(me)} tone="sky">
            <RotateCcw className="h-4 w-4" />
          </MiniBtn>
          <MiniBtn label="heal" hot="H" cd={me.runtime.regenTimer > 0 ? me.runtime.regenTimer : 0} onClick={() => engine.regen(me)} tone="emerald">
            <HeartPulse className="h-4 w-4" />
          </MiniBtn>
          <MiniBtn
            label={me.runtime.autoAttack ? 'auto ✓' : 'auto ✗'}
            hot="G"
            onClick={() => engine.toggleAutoAttack()}
            tone={me.runtime.autoAttack ? 'lime' : 'slate'}
          >
            <Swords className="h-4 w-4" />
          </MiniBtn>
        </div>

        {/* skills */}
        <div className="flex items-end gap-1.5">
          {[0, 1, 2].map(i => {
            const sk = snap.skills[i];
            const canLevel = levelUpAvailable && (i === 2 ? me.skillLevels[2] < ultCap : me.skillLevels[i] < 6);
            const locked = me.skillLevels[i] <= 0;
            const pct = sk.cooldown > 0 ? 1 - sk.cooldownLeft / sk.cooldown : 1;
            return (
              <div key={i} className="relative">
                {canLevel && (
                  <button
                    onClick={() => engine.learnSkill(me, i)}
                    className="absolute -top-2.5 left-1/2 z-10 h-6 w-6 -translate-x-1/2 animate-bounce rounded-full border border-amber-200 bg-amber-400 text-sm font-black leading-none text-slate-950 shadow-lg shadow-amber-500/40"
                    title="Level up skill"
                  >
                    +
                  </button>
                )}
                <button
                  onPointerDown={onSkillDown(i)}
                  onPointerMove={onSkillMove(i)}
                  onPointerUp={onSkillUp(i)}
                  className={`relative flex ${i === 2 ? 'h-[74px] w-[74px]' : 'h-[62px] w-[62px]'} touch-none flex-col items-center justify-center overflow-hidden rounded-full border-2 text-center transition-transform active:scale-95 ${
                    locked ? 'border-slate-700 bg-slate-900/85 text-slate-600'
                      : sk.canCast ? (i === 2 ? 'border-amber-300 bg-gradient-to-br from-amber-600/50 to-yellow-400/25 text-amber-100 shadow-lg shadow-amber-500/25' : 'border-sky-400/80 bg-sky-950/80 text-sky-200')
                        : 'border-slate-700 bg-slate-900/85 text-slate-500'
                  }`}
                >
                  <span className="px-1 text-[9px] font-bold uppercase leading-tight">{sk.name}</span>
                  <span className="text-[9px] text-slate-400">{['Q', 'E', 'R'][i]} · Lv{me.skillLevels[i]}</span>
                  {sk.cooldownLeft > 0 && (
                    <>
                      <span className="absolute inset-0 bg-slate-950/75" style={{ clipPath: `inset(${pct * 100}% 0 0 0)` }} />
                      <span className="absolute inset-0 flex items-center justify-center text-base font-bold text-white font-teko">{sk.cooldownLeft.toFixed(1)}</span>
                    </>
                  )}
                  {locked && <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-rose-300">LEARN +</span>}
                </button>
              </div>
            );
          })}
        </div>

        {/* attack + priority */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex gap-1">
            {(['auto', 'hero', 'minion', 'turret'] as const).map(p => (
              <button
                key={p}
                onClick={() => engine.setPriority(p)}
                className={`h-6 w-9 rounded-md border text-[9px] font-bold uppercase ${me.runtime.priority === p ? 'border-amber-300 bg-amber-400/25 text-amber-200' : 'border-slate-700 bg-slate-900/85 text-slate-400'}`}
                title={`Priority: ${p}`}
              >
                {p === 'hero' ? '🂡' : p === 'minion' ? '♟' : p === 'turret' ? '♜' : '★'}
              </button>
            ))}
          </div>
          <button
            onPointerDown={ev => { ev.preventDefault(); engine.basicAttackNearest(me); }}
            className="flex h-[86px] w-[86px] touch-none flex-col items-center justify-center rounded-full border-4 border-amber-300 bg-gradient-to-br from-amber-500 via-yellow-400 to-amber-600 text-slate-950 shadow-2xl shadow-amber-500/40 transition-transform active:scale-90"
          >
            <Swords className="h-7 w-7" />
            <span className="text-[10px] font-black uppercase tracking-wider">Attack</span>
            <span className="text-[8px] font-bold opacity-70">SPACE</span>
          </button>
        </div>
      </div>

      {/* ======================= TEAM PANEL (right) ======================= */}
      <div className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 flex-col gap-1 lg:flex">
        {allies.map(h => (
          <PlayerRow key={h.uid} h={h} me={me} />
        ))}
        <div className="my-1 h-px bg-slate-700/60" />
        {foes.map(h => (
          <PlayerRow key={h.uid} h={h} me={me} enemy />
        ))}
      </div>

      {/* ======================= DEATH OVERLAY ======================= */}
      {me.dead && (
        <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center bg-slate-950/40">
          <div className="rounded-2xl border border-rose-500/50 bg-slate-950/85 px-10 py-6 text-center shadow-2xl">
            <div className="text-xs uppercase tracking-widest text-rose-300">You were slain</div>
            <div id="ml-respawn" className="my-1 text-6xl font-black text-white font-teko">{Math.ceil(me.respawnTimer)}</div>
            <div className="text-xs text-slate-400">seconds until respawn</div>
            <button onClick={onOpenShop} className="mt-3 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/20">
              <Store className="mr-1 inline h-3.5 w-3.5" /> Buy items while you wait
            </button>
          </div>
        </div>
      )}

      {/* ======================= PAUSE ======================= */}
      {paused && (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm">
          <div className="w-[min(92vw,440px)] rounded-2xl border border-slate-700 bg-slate-900/95 p-5 shadow-2xl">
            <h2 className="mb-1 text-2xl font-bold tracking-wide text-white font-teko">PAUSED</h2>
            <p className="mb-4 text-xs text-slate-400">The match is frozen. Recent team chat is still visible below.</p>
            <div className="mb-4 max-h-32 overflow-y-auto rounded-lg bg-slate-950/70 p-2 text-[11px]">
              {engine.chat.messages.slice(-8).map(m => (
                <div key={m.uid}>
                  <span className={m.senderTeam === me.team ? 'text-sky-300' : 'text-rose-300'}>{m.senderName || '★'}</span>
                  <span className="text-slate-500">: </span>
                  <span className="text-slate-200">{m.text}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Key label="Move" v="WASD / joystick / click ground" />
              <Key label="Attack" v="Space · click a target" />
              <Key label="Skills" v="Q / E / R (drag to aim)" />
              <Key label="Spell · Recall · Heal" v="F · B · H" />
              <Key label="Priority" v="0 auto 1 hero 2 creep 3 tower" />
              <Key label="Ping" v="Y attack · T help · U retreat" />
              <Key label="Shop / Score / Chat" v="P · Tab · click CHAT" />
              <Key label="Auto-attack" v="G" />
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={onResume} className="flex-1 rounded-lg bg-amber-400 py-2 text-sm font-black text-slate-950 hover:bg-amber-300">
                <Play className="mr-1 inline h-4 w-4" /> RESUME
              </button>
              <button onClick={onOpenSettings} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:text-white">
                <Settings className="h-4 w-4" />
              </button>
              <button onClick={onQuit} className="rounded-lg border border-rose-500/60 px-3 py-2 text-sm font-bold text-rose-300 hover:bg-rose-500/10">
                Surrender
              </button>
            </div>
          </div>
        </div>
      )}

      {/* engine error toast (should never appear) */}
      {snap.error && (
        <div className="pointer-events-auto absolute bottom-2 left-1/2 -translate-x-1/2 rounded bg-rose-600/90 px-3 py-1 text-[11px] font-bold text-white">
          simulation recovered: {snap.error}
        </div>
      )}
    </div>
  );
};

function MiniBtn({ children, label, hot, cd, onClick, tone }: {
  children: React.ReactNode; label: string; hot: string; cd?: number;
  onClick: () => void; tone: 'amber' | 'sky' | 'emerald' | 'lime' | 'slate';
}) {
  const tones: Record<string, string> = {
    amber: 'border-amber-500/60 text-amber-300',
    sky: 'border-sky-500/60 text-sky-300',
    emerald: 'border-emerald-500/60 text-emerald-300',
    lime: 'border-lime-500/60 text-lime-300',
    slate: 'border-slate-700 text-slate-500'
  };
  const disabled = (cd ?? 0) > 0;
  return (
    <button
      onClick={onClick}
      className={`relative flex h-[46px] w-[46px] flex-col items-center justify-center rounded-full border-2 bg-slate-950/85 backdrop-blur transition-transform active:scale-95 ${tones[tone]} ${disabled ? 'opacity-60' : ''}`}
      title={`${label} (${hot})`}
    >
      {children}
      <span className="text-[7px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
      {disabled && <span className="absolute inset-0 flex items-center justify-center rounded-full bg-slate-950/80 text-[11px] font-bold text-white">{Math.ceil(cd!)}</span>}
    </button>
  );
}

function PlayerRow({ h, me, enemy }: { h: any; me: any; enemy?: boolean }) {
  const hp = Math.max(0, Math.min(1, h.hp / h.stats.maxHp));
  const isMe = h.uid === me.uid;
  return (
    <div className={`flex w-[168px] items-center gap-1.5 rounded-md border bg-slate-950/70 px-1.5 py-1 text-[10px] ${isMe ? 'border-amber-400/70' : 'border-slate-700/60'}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${enemy ? 'bg-rose-500' : 'bg-sky-500'} ${h.dead && 'opacity-30'}`} />
      <span className={`w-10 truncate font-bold ${isMe ? 'text-amber-200' : 'text-slate-200'}`}>{h.name}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
        <span className={`block h-full ${enemy ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${hp * 100}%` }} />
      </span>
      <span className="w-11 text-right font-mono text-slate-400">{h.kills}/{h.deaths}/{h.assists}</span>
      <Shield className={`h-3 w-3 ${h.dead ? 'text-slate-600' : 'text-slate-400'}`} />
    </div>
  );
}

function Key({ label, v }: { label: string; v: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-300">{label}</div>
      <div className="text-[10px] text-slate-500">{v}</div>
    </div>
  );
}

export default InGameHUD;
