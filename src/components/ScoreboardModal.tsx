import { GameEngine } from '../engine/GameEngine';
import { X, Swords, Coins, Users } from 'lucide-react';

interface Props {
  engine: GameEngine;
  open: boolean;
  onClose: () => void;
}

export const ScoreboardModal: React.FC<Props> = ({ engine, open, onClose }) => {
  if (!open) return null;
  const s = engine.snapshot();
  const teams = [
    { id: 'blue', label: 'YOUR TEAM', heroes: s.heroes.filter(h => h.team === 'blue'), color: 'sky' },
    { id: 'red', label: 'ENEMY TEAM', heroes: s.heroes.filter(h => h.team === 'red'), color: 'rose' }
  ];
  const maxDmg = Math.max(1, ...s.heroes.map(h => h.damageDealtToHeroes));

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-[90vh] w-[min(96vw,1000px)] overflow-auto rounded-2xl border border-slate-700 bg-slate-900/95 p-3 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-wider text-white font-teko">
            <Users className="h-5 w-5 text-amber-400" /> MATCH STATISTICS
          </h2>
          <div className="flex items-center gap-3 text-sm">
            <span className="font-bold text-sky-400">{s.blueKills}</span>
            <span className="text-slate-500">{Math.floor(s.time / 60)}:{String(Math.floor(s.time % 60)).padStart(2, '0')}</span>
            <span className="font-bold text-rose-400">{s.redKills}</span>
            <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-5 w-5" /></button>
          </div>
        </div>

        {teams.map(t => (
          <div key={t.id} className="mb-3">
            <div className={`mb-1 flex items-center gap-2 text-[11px] font-black uppercase tracking-widest ${t.color === 'sky' ? 'text-sky-300' : 'text-rose-300'}`}>
              {t.label}
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">gold {Math.round(t.heroes.reduce((a, h) => a + h.gold, 0))}</span>
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">towers destroyed {7 - (t.id === 'blue' ? s.blueTurrets : s.redTurrets)}</span>
            </div>
            <table className="w-full table-fixed border-collapse text-[11px]">
              <thead>
                <tr className="text-slate-500">
                  <th className="w-[190px] border-b border-slate-800 px-1 py-1 text-left font-bold">PLAYER</th>
                  <th className="w-[52px] border-b border-slate-800 px-1 text-center font-bold">LVL</th>
                  <th className="w-[76px] border-b border-slate-800 px-1 text-center font-bold">K/D/A</th>
                  <th className="w-[52px] border-b border-slate-800 px-1 text-center font-bold">CS</th>
                  <th className="w-[58px] border-b border-slate-800 px-1 text-right font-bold">GOLD</th>
                  <th className="border-b border-slate-800 px-1 text-left font-bold">DMG TO HEROES</th>
                  <th className="w-[120px] border-b border-slate-800 px-1 text-left font-bold">ITEMS</th>
                </tr>
              </thead>
              <tbody>
                {t.heroes
                  .slice()
                  .sort((a, b) => b.kills + b.assists * 0.5 - a.kills - a.assists * 0.5)
                  .map(h => (
                    <tr key={h.uid} className={`${h.isPlayer ? 'bg-amber-400/10' : ''} ${h.dead ? 'opacity-55' : ''}`}>
                      <td className="border-b border-slate-800/70 px-1 py-1">
                        <div className="flex items-center gap-1.5">
                          <img src={h.portrait} alt="" className="h-6 w-6 rounded border border-slate-700 object-cover" onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
                          <div className="min-w-0">
                            <div className="truncate font-bold text-slate-100">
                              {h.name}{h.isPlayer && <span className="ml-1 rounded bg-amber-400 px-1 text-[8px] font-black text-slate-950">YOU</span>}
                            </div>
                            <div className="truncate text-[9px] uppercase text-slate-500">{h.role} · {h.laneAssigned}{h.buffs.speedBoost > 0 ? ' · buff' : ''}</div>
                          </div>
                        </div>
                      </td>
                      <td className="border-b border-slate-800/70 px-1 text-center font-bold text-slate-300">{h.level}</td>
                      <td className="border-b border-slate-800/70 px-1 text-center font-mono">
                        <span className="text-slate-100">{h.kills}</span>/<span className="text-rose-400">{h.deaths}</span>/<span className="text-slate-300">{h.assists}</span>
                      </td>
                      <td className="border-b border-slate-800/70 px-1 text-center text-slate-300">{h.creepScore + h.jungleKills}</td>
                      <td className="border-b border-slate-800/70 px-1 text-right font-mono text-amber-300">{Math.round(h.gold)}</td>
                      <td className="border-b border-slate-800/70 px-1">
                        <div className="flex items-center gap-1">
                          <div className="h-1.5 w-full max-w-[190px] overflow-hidden rounded-full bg-slate-800">
                            <div className="h-full bg-gradient-to-r from-amber-500 to-rose-400" style={{ width: `${(h.damageDealtToHeroes / maxDmg) * 100}%` }} />
                          </div>
                          <span className="w-10 shrink-0 text-right font-mono text-slate-400">{Math.round(h.damageDealtToHeroes)}</span>
                        </div>
                      </td>
                      <td className="border-b border-slate-800/70 px-1">
                        <div className="flex gap-0.5">
                          {h.items.map((it, i) => (
                            <span key={i} className={`h-3.5 w-3.5 rounded-sm border ${it ? 'border-amber-600/60 bg-amber-500/25' : 'border-slate-800 bg-slate-900'}`} title={it?.name ?? 'empty'} />
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ))}

        <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
          <Box icon={<Swords className="h-3.5 w-3.5" />} label="Objectives" v={`Turtles ${s.objectives.turtleKills.blue}/${s.objectives.turtleKills.red} · Lord ${s.objectives.lordKills.blue}/${s.objectives.lordKills.red}`} />
          <Box icon={<Coins className="h-3.5 w-3.5" />} label="Turrets left" v={`Blue ${s.blueTurrets} · Red ${s.redTurrets}`} />
          <Box icon={<Users className="h-3.5 w-3.5" />} label="Lane assignments" v={s.heroes.map(h => `${h.name.slice(0, 4)}:${h.laneAssigned}`).join('  ')} />
          <Box icon={<Swords className="h-3.5 w-3.5" />} label="Minions alive" v={`${s.minionCount} on the map`} />
        </div>
        <p className="mt-2 text-center text-[10px] text-slate-500">Hold <b className="text-slate-300">Tab</b> while playing for a quick peek · release to close.</p>
      </div>
    </div>
  );
};

function Box({ icon, label, v }: { icon: React.ReactNode; label: string; v: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2">
      <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-slate-500">{icon}{label}</div>
      <div className="mt-0.5 truncate text-slate-200">{v}</div>
    </div>
  );
}

export default ScoreboardModal;
