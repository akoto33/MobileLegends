import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GameEngine } from './engine/GameEngine';
import { GameRenderer } from './engine/GameRenderer';
import { HeroDef, Team, GameAnnouncement } from './types/game';
import { HeroSelectModal } from './components/HeroSelectModal';
import { InGameHUD } from './components/InGameHUD';
import { ShopModal } from './components/ShopModal';
import { ScoreboardModal } from './components/ScoreboardModal';
import { PostGameScreen } from './components/PostGameScreen';
import { SettingsModal } from './components/SettingsModal';

type GamePhase = 'hero-select' | 'in-game' | 'post-game';

export const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<GamePhase>('hero-select');

  // Engine & Renderer references
  const engineRef = useRef<GameEngine | null>(null);
  const rendererRef = useRef<GameRenderer>(new GameRenderer());

  // Match statistics for post-game
  const [matchWinner, setMatchWinner] = useState<Team>('blue');
  const [matchDuration, setMatchDuration] = useState<number>(0);
  const [blueScore, setBlueScore] = useState<number>(0);
  const [redScore, setRedScore] = useState<number>(0);

  // Modals state
  const [isShopOpen, setIsShopOpen] = useState<boolean>(false);
  const [isScoreboardOpen, setIsScoreboardOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [botDifficulty, setBotDifficulty] = useState<'easy' | 'normal' | 'mythic'>('normal');

  // Current announcement banner
  const [currentAnnouncement, setCurrentAnnouncement] = useState<GameAnnouncement | null>(null);
  const announcementTimeoutRef = useRef<number | null>(null);

  // Force re-render state trigger
  const [, setRenderTrigger] = useState(0);

  // Start match handler
  const handleStartMatch = (heroDef: HeroDef, spellId: string, difficulty: 'easy' | 'normal' | 'mythic') => {
    setBotDifficulty(difficulty);

    const engine = new GameEngine(heroDef, spellId, {
      onAnnounce: (ann) => {
        setCurrentAnnouncement(ann);
        if (announcementTimeoutRef.current) {
          clearTimeout(announcementTimeoutRef.current);
        }
        announcementTimeoutRef.current = window.setTimeout(() => {
          setCurrentAnnouncement(null);
        }, ann.duration * 1000);
      },
      onGameOver: (winner) => {
        setMatchWinner(winner);
        if (engineRef.current) {
          setMatchDuration(engineRef.current.matchTime);
          setBlueScore(engineRef.current.blueKills);
          setRedScore(engineRef.current.redKills);
        }
        setPhase('post-game');
      },
      onUpdateHUD: () => {
        setRenderTrigger(t => t + 1);
      }
    });

    engine.botDifficulty = difficulty;
    engineRef.current = engine;
    setPhase('in-game');
  };

  // Play Again handler
  const handlePlayAgain = () => {
    engineRef.current = null;
    setIsShopOpen(false);
    setIsScoreboardOpen(false);
    setIsSettingsOpen(false);
    setCurrentAnnouncement(null);
    setPhase('hero-select');
  };

  // Main 60 FPS Engine & Rendering Loop
  const lastTimeRef = useRef<number>(performance.now());

  const gameLoop = useCallback((timestamp: number) => {
    const dt = Math.min(0.1, (timestamp - lastTimeRef.current) / 1000);
    lastTimeRef.current = timestamp;

    const engine = engineRef.current;
    const canvas = canvasRef.current;

    if (engine && canvas && phase === 'in-game') {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Update simulation
        engine.update(dt);
        // Render frame
        rendererRef.current.render(ctx, engine, canvas.width, canvas.height);
      }
    }

    requestAnimationFrame(gameLoop);
  }, [phase]);

  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
        if (engineRef.current) {
          engineRef.current.camera.width = window.innerWidth;
          engineRef.current.camera.height = window.innerHeight;
        }
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    const animId = requestAnimationFrame(gameLoop);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animId);
    };
  }, [gameLoop]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-game">
      {/* 2D Canvas Viewport */}
      <canvas
        ref={canvasRef}
        onClick={(e) => {
          const engine = engineRef.current;
          const canvas = canvasRef.current;
          if (!engine || !canvas || phase !== 'in-game') return;

          const rect = canvas.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const clickY = e.clientY - rect.top;

          const worldX = clickX - canvas.width / 2 + engine.camera.x;
          const worldY = clickY - canvas.height / 2 + engine.camera.y;

          // Check if clicked on an enemy hero, minion, or turret
          const player = engine.playerHero;
          const clickedHero = engine.heroes.find(
            h => h.team !== player.team && !h.isDead && Math.hypot(h.x - worldX, h.y - worldY) < 36
          );

          if (clickedHero) {
            engine.performBasicAttack(player, clickedHero);
            engine.addVisualEffect('ring', clickedHero.x, clickedHero.y, '#ef4444', 40, 0.3);
          } else {
            // Click to move
            (player as any).targetDestination = { x: worldX, y: worldY };
            engine.addVisualEffect('ring', worldX, worldY, '#38bdf8', 35, 0.3);
          }
        }}
        className="block w-full h-full cursor-crosshair touch-none"
      />

      {/* --- IN-GAME HUD --- */}
      {phase === 'in-game' && engineRef.current && (
        <InGameHUD
          engine={engineRef.current}
          renderer={rendererRef.current}
          onOpenShop={() => setIsShopOpen(true)}
          onOpenScoreboard={() => setIsScoreboardOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          announcement={currentAnnouncement}
        />
      )}

      {/* --- HERO SELECTION MODAL --- */}
      {phase === 'hero-select' && (
        <HeroSelectModal onStartMatch={handleStartMatch} />
      )}

      {/* --- SHOP MODAL --- */}
      {engineRef.current && (
        <ShopModal
          playerHero={engineRef.current.playerHero}
          isOpen={isShopOpen}
          onClose={() => setIsShopOpen(false)}
          onItemPurchased={() => setRenderTrigger(t => t + 1)}
        />
      )}

      {/* --- SCOREBOARD MODAL --- */}
      {engineRef.current && (
        <ScoreboardModal
          heroes={engineRef.current.heroes}
          blueKills={engineRef.current.blueKills}
          redKills={engineRef.current.redKills}
          isOpen={isScoreboardOpen}
          onClose={() => setIsScoreboardOpen(false)}
        />
      )}

      {/* --- SETTINGS MODAL --- */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        botDifficulty={botDifficulty}
        onDifficultyChange={(diff) => {
          setBotDifficulty(diff);
          if (engineRef.current) engineRef.current.botDifficulty = diff;
        }}
      />

      {/* --- POST GAME SCREEN (VICTORY / DEFEAT) --- */}
      {phase === 'post-game' && engineRef.current && (
        <PostGameScreen
          winner={matchWinner}
          playerHero={engineRef.current.playerHero}
          heroes={engineRef.current.heroes}
          matchDuration={matchDuration}
          blueKills={blueScore}
          redKills={redScore}
          onPlayAgain={handlePlayAgain}
        />
      )}
    </div>
  );
};

export default App;
