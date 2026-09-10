import React from 'react';
import { HeroInstance } from '../types/game';
import { X, Trophy, Shield, Swords } from 'lucide-react';

interface ScoreboardModalProps {
  heroes: HeroInstance[];
  blueKills: number;
  redKills: number;
  isOpen: boolean;
  onClose: () => void;
}

export const ScoreboardModal: React.FC<ScoreboardModalProps> = ({
  heroes,
  blueKills,
  redKills,
  isOpen,
  onClose
}) => {
  if (!isOpen) return null;

  const blueHeroes = heroes.filter(h => h.team === 'blue');
  const redHeroes = heroes.filter(h => h.team === 'red');

  const blueTotalGold = blueHeroes.reduce((acc, h) => acc + h.gold, 0);
  const redTotalGold = redHeroes.reduce((acc, h) => acc + h.gold, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-3 md:p-6">
      <div className="w-full max-w-5xl bg-slate-900 border border-blue-900/40 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <Trophy className="w-6 h-6 text-amber-400" />
            <h2 className="text-2xl font-bold tracking-wider text-white font-teko">BATTLE SCOREBOARD</h2>
          </div>

          {/* Scores Overview */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <span className="text-blue-400 font-bold text-xl font-teko">{blueKills}</span>
              <span className="text-xs text-blue-300 font-semibold uppercase">BLUE TEAM</span>
              <span className="text-xs text-amber-400 font-medium">({blueTotalGold} G)</span>
            </div>
            <span className="text-slate-600 font-bold">VS</span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-amber-400 font-medium">({redTotalGold} G)</span>
              <span className="text-xs text-red-400 font-semibold uppercase">RED TEAM</span>
              <span className="text-red-500 font-bold text-xl font-teko">{redKills}</span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content: Blue Team & Red Team tables */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {/* Blue Team Table */}
          <div>
            <div className="flex items-center gap-2 mb-2 px-2">
              <Shield className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-bold text-blue-400 uppercase tracking-wider font-teko text-base">
                BLUE TEAM (ALLIES)
              </span>
            </div>

            <div className="bg-slate-950/60 rounded-xl border border-blue-900/30 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/80 text-slate-400 text-[10px] uppercase font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4">Hero</th>
                    <th className="py-2.5 px-3">Role</th>
                    <th className="py-2.5 px-3 text-center">K / D / A</th>
                    <th className="py-2.5 px-3 text-center">CS</th>
                    <th className="py-2.5 px-3 text-center">Gold</th>
                    <th className="py-2.5 px-4">Items</th>
                    <th className="py-2.5 px-3 text-right">Hero DMG</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {blueHeroes.map(hero => (
                    <tr key={hero.id} className={!hero.isBot ? 'bg-blue-500/10' : 'hover:bg-slate-900/40'}>
                      <td className="py-2.5 px-4 flex items-center gap-2.5">
                        <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-blue-400/50 flex-shrink-0 bg-slate-800">
                          <img src={hero.portrait} alt={hero.name} className="w-full h-full object-cover" />
                          <span className="absolute bottom-0 right-0 px-1 text-[8px] bg-slate-950/90 text-white font-bold rounded-tl">
                            {hero.level}
                          </span>
                        </div>
                        <div>
                          <span className="font-bold text-slate-200 block text-xs">
                            {hero.name} {!hero.isBot && <span className="text-amber-400 font-medium">(You)</span>}
                          </span>
                          <span className="text-[10px] text-slate-400">{hero.title}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          {hero.role}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold text-slate-200">
                        {hero.kills} / <span className="text-red-400">{hero.deaths}</span> / {hero.assists}
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-300 font-medium">
                        {hero.creepScore}
                      </td>
                      <td className="py-2.5 px-3 text-center text-amber-400 font-bold">
                        {hero.gold}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-1">
                          {[0, 1, 2, 3, 4, 5].map(idx => {
                            const it = hero.items[idx];
                            return (
                              <div
                                key={idx}
                                className="w-6 h-6 rounded bg-slate-800 border border-slate-700/60 flex items-center justify-center text-[9px] text-slate-400"
                                title={it ? it.name : 'Empty'}
                              >
                                {it ? it.name.substring(0, 1) : '-'}
                              </div>
                            );
                          })}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right text-emerald-400 font-medium">
                        {hero.damageDealt.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Red Team Table */}
          <div>
            <div className="flex items-center gap-2 mb-2 px-2">
              <Swords className="w-4 h-4 text-red-400" />
              <span className="text-sm font-bold text-red-400 uppercase tracking-wider font-teko text-base">
                RED TEAM (ENEMIES)
              </span>
            </div>

            <div className="bg-slate-950/60 rounded-xl border border-red-900/30 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/80 text-slate-400 text-[10px] uppercase font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4">Hero</th>
                    <th className="py-2.5 px-3">Role</th>
                    <th className="py-2.5 px-3 text-center">K / D / A</th>
                    <th className="py-2.5 px-3 text-center">CS</th>
                    <th className="py-2.5 px-3 text-center">Gold</th>
                    <th className="py-2.5 px-4">Items</th>
                    <th className="py-2.5 px-3 text-right">Hero DMG</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {redHeroes.map(hero => (
                    <tr key={hero.id} className="hover:bg-slate-900/40">
                      <td className="py-2.5 px-4 flex items-center gap-2.5">
                        <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-red-500/50 flex-shrink-0 bg-slate-800">
                          <img src={hero.portrait} alt={hero.name} className="w-full h-full object-cover" />
                          <span className="absolute bottom-0 right-0 px-1 text-[8px] bg-slate-950/90 text-white font-bold rounded-tl">
                            {hero.level}
                          </span>
                        </div>
                        <div>
                          <span className="font-bold text-slate-200 block text-xs">
                            {hero.name}
                          </span>
                          <span className="text-[10px] text-slate-400">{hero.title}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                          {hero.role}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold text-slate-200">
                        {hero.kills} / <span className="text-red-400">{hero.deaths}</span> / {hero.assists}
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-300 font-medium">
                        {hero.creepScore}
                      </td>
                      <td className="py-2.5 px-3 text-center text-amber-400 font-bold">
                        {hero.gold}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-1">
                          {[0, 1, 2, 3, 4, 5].map(idx => {
                            const it = hero.items[idx];
                            return (
                              <div
                                key={idx}
                                className="w-6 h-6 rounded bg-slate-800 border border-slate-700/60 flex items-center justify-center text-[9px] text-slate-400"
                                title={it ? it.name : 'Empty'}
                              >
                                {it ? it.name.substring(0, 1) : '-'}
                              </div>
                            );
                          })}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right text-emerald-400 font-medium">
                        {hero.damageDealt.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
