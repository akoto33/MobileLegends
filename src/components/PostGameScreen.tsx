import React, { useEffect } from 'react';
import { HeroInstance, Team } from '../types/game';
import confetti from 'canvas-confetti';
import { Trophy, RotateCcw, Swords } from 'lucide-react';

interface PostGameScreenProps {
  winner: Team;
  playerHero: HeroInstance;
  heroes: HeroInstance[];
  matchDuration: number;
  blueKills: number;
  redKills: number;
  onPlayAgain: () => void;
}

export const PostGameScreen: React.FC<PostGameScreenProps> = ({
  winner,
  playerHero,
  heroes,
  matchDuration,
  blueKills,
  redKills,
  onPlayAgain
}) => {
  const isVictory = winner === playerHero.team;

  useEffect(() => {
    if (isVictory) {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 }
      });
    }
  }, [isVictory]);

  // Calculate MVP (Highest score = kills * 3 + assists * 1.5 - deaths * 2 + damage / 1000)
  const sortedHeroes = [...heroes].sort((a, b) => {
    const scoreA = a.kills * 3 + a.assists * 1.5 - a.deaths * 2 + a.damageDealt / 800;
    const scoreB = b.kills * 3 + b.assists * 1.5 - b.deaths * 2 + b.damageDealt / 800;
    return scoreB - scoreA;
  });

  const mvpHero = sortedHeroes[0];

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4 overflow-y-auto">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto">
        {/* Banner */}
        <div
          className={`py-8 px-6 text-center border-b flex flex-col items-center justify-center ${
            isVictory
              ? 'bg-gradient-to-b from-amber-500/20 via-yellow-500/10 to-transparent border-amber-500/30'
              : 'bg-gradient-to-b from-red-600/20 via-rose-600/10 to-transparent border-red-500/30'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <Trophy className={`w-8 h-8 ${isVictory ? 'text-amber-400 animate-bounce' : 'text-slate-500'}`} />
          </div>

          <h1
            className={`text-6xl md:text-7xl font-bold tracking-widest font-teko uppercase ${
              isVictory
                ? 'text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-yellow-200 to-amber-500 drop-shadow-[0_4px_16px_rgba(251,191,36,0.6)]'
                : 'text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-rose-300 to-red-600 drop-shadow-[0_4px_16px_rgba(239,68,68,0.6)]'
            }`}
          >
            {isVictory ? 'VICTORY' : 'DEFEAT'}
          </h1>

          <div className="flex items-center gap-4 text-xs font-semibold text-slate-300 mt-2">
            <span>Match Time: <strong className="text-white">{formatTime(matchDuration)}</strong></span>
            <span>•</span>
            <span>Final Score: <strong className="text-blue-400">{blueKills}</strong> - <strong className="text-red-400">{redKills}</strong></span>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6">
          {/* MVP Card */}
          {mvpHero && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-yellow-500/5 to-transparent border border-amber-500/30 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="relative w-16 h-16 rounded-xl overflow-hidden border-2 border-amber-400 shadow-lg shadow-amber-500/20 bg-slate-800">
                  <img src={mvpHero.portrait} alt={mvpHero.name} className="w-full h-full object-cover" />
                  <span className="absolute top-0 right-0 px-1 py-0.5 text-[9px] bg-amber-500 text-slate-950 font-bold rounded-bl font-teko">
                    MVP
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      MATCH MVP
                    </span>
                    <span className="text-xs text-slate-400">{mvpHero.team.toUpperCase()} TEAM</span>
                  </div>
                  <h3 className="text-xl font-bold text-white font-teko">{mvpHero.name}</h3>
                  <p className="text-xs text-slate-300">
                    KDA: <strong className="text-white">{mvpHero.kills}/{mvpHero.deaths}/{mvpHero.assists}</strong> • Damage: <strong className="text-emerald-400">{mvpHero.damageDealt.toLocaleString()}</strong>
                  </p>
                </div>
              </div>

              <div className="hidden sm:flex flex-col items-end">
                <span className="text-[11px] text-slate-400 uppercase font-semibold">Net Worth</span>
                <span className="text-lg font-bold text-amber-400 font-teko">{mvpHero.gold} Gold</span>
              </div>
            </div>
          )}

          {/* Player Personal Performance Card */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Swords className="w-4 h-4 text-blue-400" />
              Your Battle Performance ({playerHero.name})
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800/80">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-0.5">K / D / A</span>
                <span className="text-lg font-bold text-white font-teko text-xl">
                  {playerHero.kills} / <span className="text-red-400">{playerHero.deaths}</span> / {playerHero.assists}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800/80">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-0.5">Hero Damage</span>
                <span className="text-lg font-bold text-emerald-400 font-teko text-xl">
                  {playerHero.damageDealt.toLocaleString()}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800/80">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-0.5">Turret Damage</span>
                <span className="text-lg font-bold text-amber-400 font-teko text-xl">
                  {playerHero.turretDamage.toLocaleString()}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800/80">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-0.5">Minions (CS)</span>
                <span className="text-lg font-bold text-blue-400 font-teko text-xl">
                  {playerHero.creepScore}
                </span>
              </div>
            </div>
          </div>

          {/* Play Again Button */}
          <button
            onClick={onPlayAgain}
            className="w-full py-3.5 px-6 rounded-xl font-bold text-slate-950 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:to-yellow-400 shadow-lg shadow-amber-500/25 active:scale-[0.99] transition-all flex items-center justify-center gap-2 text-base tracking-wider uppercase font-teko text-xl"
          >
            <RotateCcw className="w-5 h-5" />
            PLAY AGAIN / RETURN TO HERO SELECT
          </button>
        </div>
      </div>
    </div>
  );
};
