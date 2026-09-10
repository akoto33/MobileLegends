import { useEffect, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { GameEngine } from '../engine/GameEngine';
import { Trophy, RotateCcw, Users, Medal, Flame, Home } from 'lucide-react';

interface Props {
  engine: GameEngine;
  onPlayAgain: () => void;
  onMenu: () => void;
}

export const PostGameScreen: React.FC<Props> = ({ engine, onPlayAgain, onMenu }) => {
  const s = engine.snapshot();
  const win = s.winner === s.players.find(p => p.isPlayer)?.team;
  const me = s.players.find(p => p.isPlayer)!;
  const mvp = useMemo(() => s.players.slice().sort((a, b) => score(b) - score(a))[0], [s.players]);
  const seconds = Math.floor(s.time);
  const stats = s.players.filter(p => p.team === me.team);
  const foes = s.players.filter(p => p.team !== me.team);
  const manOfTheMatch = me.uid === mvp.uid;

  useEffect(() => {
    if (!win) return;
    let cancelled = false;
    const shoot = (opts: any) => { if (!cancelled) confetti(opts); };
    shoot({ particleCount: 130, spread: 78, origin: { y: 0.62 }, colors: ['#fbbf24', '#38bdf8', '#f1f5f9'] });
    const t1 = window.setTimeout(() => shoot({ particleCount: 80, angle: 60, spread: 60, origin: { x: 0, y: 0.7 } }), 350);
    const t2 = window.setTimeout(() => shoot({ particleCount: 80, angle: 120, spread: 60, origin: { x: 1, y: 0.7 } }), 620);
    return () => { cancelled = true; window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [win]);

  return (
    <div id="ml-postgame" className="absolute inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[radial-gradient(ellipse_at_center,#0f2440_0%,#05070d_70%)] p-3">
      <div className="w-[min(96vw,860px)]">
        <div className="mb-3 text-center">
          <div className={`inline-flex items-center gap-3 rounded-2xl border-2 px-8 py-3 ${win ? 'border-amber-400 bg-amber-400/10' : 'border-slate-700 bg-slate-900/70'}`}>
            <Trophy className={`h-9 w-9 ${win ? 'text-amber-400' : 'text-slate-600'}`} />
            <span className={`text-5xl font-black uppercase tracking-[0.2em] font-teko ${win ? 'text-amber-300' : 'text-slate-400'}`}>
              {win ? 'Victory' : 'Defeat'}
            </span>
          </div>
          <p className="mt-1.5 text-xs uppercase tracking-widest text-slate-400">
            {s.winner} team destroyed the core · {Math.floor(seconds / 60)}m {seconds % 60}s · {s.blueKills}-{s.redKills} kills
          </p>
        </div>

        <div className="mb-3 grid gap-2 sm:grid-cols-3">
          <Card label="Your KDA" value={`${me.kills} / ${me.deaths} / ${me.assists}`} accent={manOfTheMatch ? 'amber' : 'sky'} sub={manOfTheMatch ? '★ man of the match' : `${me.laneAssigned} lane · ${me.name}`} />
          <Card label="Gold earned" value={Math.round(me.goldEarned).toString()} accent="amber" sub={`${me.creepScore} minion kills · ${me.jungleKills} jungle · lvl ${me.level}`} />
          <Card label="Objectives" value={`${s.blueTurrets + s.redTurrets - 14 < 0 ? 0 : (me.team === 'blue' ? 7 - s.blueTurrets : 7 - s.redTurrets)} towers`} accent="sky" sub={`Turtles ${s.objectives.turtleKills[me.team]} · Lord ${s.objectives.lordKills[me.team]} · chat ${s.chat.length} msgs`} />
        </div>

        <div className="mb-3 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-slate-400">
            <Users className="h-4 w-4" /> final scoreboard
          </div>
          {[stats, foes].map((team, ti) => (
            <div key={ti} className={ti === 0 ? 'border-b border-slate-800' : ''}>
              <div className={`px-3 pt-1.5 text-[10px] font-black uppercase tracking-widest ${ti === 0 ? 'text-sky-300' : 'text-rose-300'}`}>
                {ti === 0 ? (me.team === 'blue' ? 'YOUR TEAM' : 'YOUR TEAM') : 'ENEMY TEAM'}
              </div>
              <table className="w-full table-fixed text-[11px]">
                <tbody>
                  {team.slice().sort((a, b) => score(b) - score(a)).map(p => (
                    <tr key={p.uid} className={`${p.isPlayer ? 'bg-amber-400/10' : ''}`}>
                      <td className="w-[150px] truncate px-3 py-1">
                        {p.uid === mvp.uid && <Medal className="mr-1 inline h-3 w-3 text-amber-400" />}
                        <span className="font-bold text-slate-100">{p.name}</span>
                        <span className="ml-1 text-[9px] uppercase text-slate-500">{p.laneAssigned}</span>
                        {p.isPlayer && <span className="ml-1 rounded bg-amber-400 px-1 text-[8px] font-black text-slate-950">YOU</span>}
                      </td>
                      <td className="w-[46px] text-center text-slate-300">L{p.level}</td>
                      <td className="w-[78px] text-center font-mono">
                        <span className="text-slate-100">{p.kills}</span>/<span className="text-rose-400">{p.deaths}</span>/<span className="text-slate-300">{p.assists}</span>
                      </td>
                      <td className="w-[54px] text-center text-slate-400">{p.creepScore + p.jungleKills}</td>
                      <td className="w-[64px] text-right font-mono text-amber-300">{Math.round(p.goldEarned)}</td>
                      <td className="text-right font-mono text-slate-500">{Math.round(p.damageDealtToHeroes)} dmg</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        {s.chat.length > 0 && (
          <details className="mb-3 rounded-2xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-[11px]">
            <summary className="cursor-pointer select-none text-[11px] font-black uppercase tracking-widest text-slate-400">Match chat ({s.chat.length})</summary>
            <div className="mt-1.5 max-h-40 overflow-y-auto">
              {engine.chat.messages.slice(-40).map(m => (
                <div key={m.uid} className="leading-snug">
                  <span className={m.channel === 'system' ? 'italic text-amber-200/80' : m.senderTeam === me.team ? 'font-bold text-sky-300' : 'font-bold text-rose-300'}>
                    {m.senderName || (m.channel === 'system' ? '★ system' : '?')}:
                  </span>{' '}
                  <span className="text-slate-300">{m.text}</span>
                </div>
              ))}
            </div>
          </details>
        )}

        <div className="flex flex-wrap items-center justify-center gap-2">
          <button onClick={onPlayAgain} className="flex items-center gap-2 rounded-xl border-2 border-amber-300 bg-gradient-to-b from-amber-400 to-amber-600 px-6 py-2.5 text-base font-black uppercase tracking-widest text-slate-950 shadow-lg transition hover:brightness-110 active:scale-95 font-teko">
            <RotateCcw className="h-4 w-4" /> play again
          </button>
          <button onClick={onMenu} className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-5 py-2.5 text-sm font-bold uppercase text-slate-300 hover:text-white">
            <Home className="h-4 w-4" /> change hero
          </button>
          <span className="flex items-center gap-1 text-[11px] text-slate-500"><Flame className="h-3.5 w-3.5 text-orange-400" /> MVP: {mvp.name}</span>
        </div>
      </div>
    </div>
  );
};

const score = (p: { kills: number; deaths: number; assists: number; goldEarned: number; creepScore: number; jungleKills: number; level: number }) =>
  p.kills * 3 + p.assists * 1.5 - p.deaths * 1.5 + (p.creepScore + p.jungleKills) * 0.25 + p.level;

function Card({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: 'amber' | 'sky' }) {
  return (
    <div className={`rounded-2xl border p-3 ${accent === 'amber' ? 'border-amber-700/50 bg-amber-950/20' : 'border-sky-800/50 bg-sky-950/20'}`}>
      <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</div>
      <div className="mt-0.5 text-2xl font-black text-white font-teko">{value}</div>
      <div className="text-[10px] text-slate-400">{sub}</div>
    </div>
  );
}

export default PostGameScreen;
