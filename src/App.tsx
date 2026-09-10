import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameEngine } from './engine/GameEngine';
import { GameRenderer } from './engine/GameRenderer';
import { Announcement, HeroDef, LaneRole } from './types/game';

import { HEROES } from './data/heroes';
import { HeroSelectModal } from './components/HeroSelectModal';
import { InGameHUD } from './components/InGameHUD';
import { PostGameScreen } from './components/PostGameScreen';
import { ScoreboardModal } from './components/ScoreboardModal';
import { ShopModal } from './components/ShopModal';
import { SettingsModal } from './components/SettingsModal';

type Phase = 'hero-select' | 'in-game' | 'post-game';
type Difficulty = 'easy' | 'normal' | 'mythic';

export const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  if (!rendererRef.current) rendererRef.current = new GameRenderer();

  const [phase, setPhase] = useState<Phase>('hero-select');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [shopOpen, setShopOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [, force] = useState(0);
  const annTimer = useRef<number | null>(null);
  const engineError = useRef<string | null>(null);
  const lastPick = useRef<{ hero: HeroDef; spellId: string; lane: LaneRole; diff: Difficulty } | null>(null);
  const heldKeys = useRef<Set<string>>(new Set());
  const [chatSignal, setChatSignal] = useState(0);

  const rerender = useCallback(() => force(n => n + 1), []);

  const engine = engineRef.current;

  // --- build a match -------------------------------------------------------
  const startMatch = (hero: HeroDef, spellId: string, lane: LaneRole, diff: Difficulty) => {
    lastPick.current = { hero, spellId, lane, diff };
    setDifficulty(diff);
    const e = new GameEngine(hero.id, spellId, {
      lane,
      difficulty: diff,
      listeners: {
        onAnnounce: a => {
          setAnnouncement(a);
          if (annTimer.current) window.clearTimeout(annTimer.current);
          annTimer.current = window.setTimeout(() => setAnnouncement(null), a.duration * 1000);
        },
        onGameOver: () => {
          window.setTimeout(() => setPhase('post-game'), 1400);
        }
      }
    });
    engineRef.current = e;
    // dev/QA handle: the live simulation is reachable from the console
    (window as any).__ml = e;
    setShopOpen(false);
    setBoardOpen(false);
    setAnnouncement(null);
    setPhase('in-game');
  };

  const quitToLobby = () => {
    engineRef.current = null;
    (window as any).__ml = null;
    setPhase('hero-select');
    setShopOpen(false);
    setBoardOpen(false);
    setSettingsOpen(false);
    setPaused(false);
  };

  // --- viewport ------------------------------------------------------------
  useEffect(() => {
    const resize = () => {
      const cv = canvasRef.current;
      if (!cv) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.floor(window.innerWidth * dpr);
      cv.height = Math.floor(window.innerHeight * dpr);
      cv.style.width = `${window.innerWidth}px`;
      cv.style.height = `${window.innerHeight}px`;
      const e = engineRef.current;
      if (e) {
        e.camera.width = window.innerWidth;
        e.camera.height = window.innerHeight;
        e.camera.zoom = Math.max(0.55, Math.min(1.2, (window.innerHeight / 820) * dpr * 0.86));
      }
    };
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
    };
  }, [phase]);

  // --- main loop -----------------------------------------------------------
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let alive = true;
    const loop = (t: number) => {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.08, (t - last) / 1000);
      last = t;
      const e = engineRef.current;
      const cv = canvasRef.current;
      if (!e || !cv || phase !== 'in-game') return;
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      try {
        // keyboard movement wins over the joystick while keys are down
        const keys = heldKeys.current;
        if (keys.size) {
          const dx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
          const dy = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
          if (dx || dy) {
            const m = Math.hypot(dx, dy);
            e.setMoveVector(dx / m, dy / m);
          } else {
            e.setMoveVector(0, 0);
          }
        }
        if (!paused && !shopOpen && !boardOpen && !settingsOpen) e.update(dt);
        rendererRef.current!.render(ctx, e, cv.width, cv.height, dt);
      } catch (err: any) {
        if (!engineError.current) {
          engineError.current = err?.message ?? String(err);
          // eslint-disable-next-line no-console
          console.error('[game loop]', err);
          rerender();
        }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [phase, paused, shopOpen, boardOpen, settingsOpen, rerender]);

  // --- keep the simulation's own pause flag honest --------------------------
  useEffect(() => {
    const e = engineRef.current;
    if (!e || e.state === 'over') return;
    const busy = paused || shopOpen || boardOpen || settingsOpen;
    e.state = busy ? 'paused' : 'running';
    if (busy) e.setMoveVector(0, 0);
  }, [paused, shopOpen, boardOpen, settingsOpen]);

  // --- keyboard ------------------------------------------------------------
  useEffect(() => {
    if (phase !== 'in-game') return;
    const onKey = (ev: KeyboardEvent) => {
      const e = engineRef.current;
      if (!e) return;
      const tag = (ev.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const k = ev.key.toLowerCase();
      const p = e.player;
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        ev.preventDefault();
        heldKeys.current.add(k);
        return;
      }
      if (k === 'enter') {
        ev.preventDefault();
        setChatSignal(v => v + 1);
        return;
      }
      switch (k) {
        case ' ': ev.preventDefault(); e.commandAttackUid(0); p.runtime.priority = 'auto'; e.basicAttackNearest(p); break;
        case 'q': e.castSkill(p, 0); break;
        case 'e': e.castSkill(p, 1); break;
        case 'r': e.castSkill(p, 2); break;
        case 'f': e.castSpell(p); break;
        case 'b': e.recall(p); break;
        case 'g': e.toggleAutoAttack(); break;
        case 'h': e.regen(p); break;
        case '1': e.setPriority('hero'); break;
        case '2': e.setPriority('minion'); break;
        case '3': e.setPriority('turret'); break;
        case '0': e.setPriority('auto'); break;
        case 'p': case 'c': setShopOpen(v => !v); break;
        case 'tab': ev.preventDefault(); setBoardOpen(v => !v); break;
        case 'escape': setPaused(v => !v); break;
        case 'y': e.sendQuickChat({ id: 'attack', label: 'Attack!', chat: 'Attack!', kind: 'attack' }); break;
        case 't': e.sendQuickChat({ id: 'help', label: 'Need help!', chat: 'Need help!', kind: 'help' }); break;
        case 'u': e.sendQuickChat({ id: 'retreat', label: 'Retreat!', chat: 'Retreat!', kind: 'retreat' }); break;
        default: break;
      }
    };
    const onUp = (ev: KeyboardEvent) => {
      const k = ev.key.toLowerCase();
      if (heldKeys.current.delete(k)) {
        const e = engineRef.current;
        if (e && !heldKeys.current.size) e.setMoveVector(0, 0);
      }
    };
    const onBlurClear = () => {
      heldKeys.current.clear();
      engineRef.current?.setMoveVector(0, 0);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlurClear);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlurClear);
    };
  }, [phase]);

  useEffect(() => {
    const onBlur = () => {
      const e = engineRef.current;
      if (e && phase === 'in-game' && e.state === 'running') setPaused(true);
    };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [phase]);

  // --- canvas pointer: click to move / attack, right click smart ---------
  const onCanvasPointer = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const e = engineRef.current;
    const cv = canvasRef.current;
    if (!e || !cv || phase !== 'in-game' || paused) return;
    const rect = cv.getBoundingClientRect();
    const dpr = cv.width / Math.max(1, rect.width);
    const z = e.camera.zoom;
    const wx = (ev.clientX - rect.left) * dpr / z - cv.width / 2 / z + e.camera.x;
    const wy = (ev.clientY - rect.top) * dpr / z - cv.height / 2 / z + e.camera.y;

    if (ev.button === 2) {
      const foe = nearestEnemy(e, wx, wy, 60);
      if (foe) e.commandAttackUid(foe.uid);
      else e.commandMove(clampX(wx), clampY(wy));
      return;
    }
    const foe = nearestEnemy(e, wx, wy, 46);
    if (foe) e.commandAttackUid(foe.uid);
    else e.commandMove(clampX(wx), clampY(wy));
  };

  const heroes = useMemo(() => HEROES, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950 font-game">
      <canvas
        id="ml-game"
        ref={canvasRef}
        className="block h-full w-full touch-none select-none cursor-crosshair"
        onPointerDown={onCanvasPointer}
        onContextMenu={ev => ev.preventDefault()}
      />

      {phase === 'in-game' && engine && (
        <InGameHUD
          engine={engine}
          renderer={rendererRef.current!}
          paused={paused}
          onResume={() => setPaused(false)}
          onQuit={quitToLobby}
          onOpenShop={() => setShopOpen(true)}
          onOpenBoard={() => setBoardOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          announcement={announcement}
          chatSignal={chatSignal}
          onChatFocusChange={focused => {
            const e = engineRef.current;
            if (e && !focused) e.setMoveVector(0, 0);
          }}
        />
      )}

      {phase === 'hero-select' && (
        <HeroSelectModal
          heroes={heroes}
          difficulty={difficulty}
          onDifficulty={d => { setDifficulty(d); if (engineRef.current) engineRef.current.difficulty = d; }}
          onStart={startMatch}
        />
      )}

      {phase === 'in-game' && engine && (
        <>
          <ShopModal hero={engine.player} open={shopOpen} onClose={() => setShopOpen(false)} engine={engine} />
          <ScoreboardModal
            engine={engine}
            open={boardOpen}
            onClose={() => setBoardOpen(false)}
          />
          <SettingsModal
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            difficulty={difficulty}
            onDifficulty={d => {
              setDifficulty(d);
              if (engineRef.current) engineRef.current.difficulty = d;
            }}
            paused={paused}
            onPause={setPaused}
          />
        </>
      )}

      {phase === 'post-game' && engine && (
        <PostGameScreen
          engine={engine}
          onPlayAgain={() => {
            const pick = lastPick.current;
            if (pick) startMatch(pick.hero, pick.spellId, pick.lane, pick.diff);
            else quitToLobby();
          }}
          onMenu={quitToLobby}
        />
      )}
    </div>
  );
};

function clampX(x: number) {
  return Math.max(95, Math.min(2400 - 95, x));
}
function clampY(y: number) {
  return Math.max(95, Math.min(2400 - 95, y));
}

function nearestEnemy(e: GameEngine, x: number, y: number, tol: number) {
  let best: { uid: number } | null = null;
  let bd = tol;
  for (const h of e.heroes) {
    if (h.team === e.player.team || h.dead) continue;
    const d = Math.hypot(h.x - x, h.y - y);
    if (d < bd) { bd = d; best = h; }
  }
  for (const m of e.minions) {
    if (m.team === e.player.team || m.hp <= 0) continue;
    const d = Math.hypot(m.x - x, m.y - y);
    if (d < bd) { bd = d; best = m; }
  }
  for (const t of e.turrets) {
    if (t.team === e.player.team || t.destroyed) continue;
    const d = Math.hypot(t.x - x, t.y - y);
    if (d < bd + 24) { bd = d; best = t; }
  }
  for (const mo of e.monsters) {
    if (!mo.alive) continue;
    const d = Math.hypot(mo.x - x, mo.y - y);
    if (d < bd + 30) { bd = d; best = mo; }
  }
  return best;
}

export default App;
