import { useMemo, useState } from 'react';
import { HEROES } from '../data/heroes';
import { BATTLE_SPELLS } from '../data/spells';
import { HeroDef, LaneRole, Role } from '../types/game';
import { soundManager } from '../audio/soundManager';
import {
  Swords, Shield, Sparkles, Crosshair, Zap, Play, Info, Crown, Check
} from 'lucide-react';

type Difficulty = 'easy' | 'normal' | 'mythic';

interface Props {
  heroes: HeroDef[];
  difficulty: Difficulty;
  onDifficulty: (d: Difficulty) => void;
  onStart: (hero: HeroDef, spellId: string, lane: LaneRole, diff: Difficulty) => void;
}

const LANES: { id: LaneRole; label: string; hint: string }[] = [
  { id: 'gold', label: 'GOLD LANE', hint: 'Marksman farm, safe side, Turtle nearby' },
  { id: 'mid', label: 'MID LANE', hint: 'Mage burst, rotate to both sides' },
  { id: 'exp', label: 'EXP LANE', hint: 'Fighter solo duel, Lord nearby' },
  { id: 'jungle', label: 'JUNGLE', hint: 'Farm camps, gank lanes, take buffs' },
  { id: 'roam', label: 'ROAM', hint: 'Support: ward, engage, protect the carry' }
];

const roleIcon = (r: Role) => {
  switch (r) {
    case 'Tank': return <Shield className="h-3.5 w-3.5 text-sky-400" />;
    case 'Fighter': return <Swords className="h-3.5 w-3.5 text-orange-400" />;
    case 'Assassin': return <Zap className="h-3.5 w-3.5 text-fuchsia-400" />;
    case 'Mage': return <Sparkles className="h-3.5 w-3.5 text-cyan-300" />;
    case 'Marksman': return <Crosshair className="h-3.5 w-3.5 text-amber-300" />;
    default: return <Info className="h-3.5 w-3.5 text-emerald-400" />;
  }
};

export const HeroSelectModal: React.FC<Props> = ({ difficulty, onDifficulty, onStart }) => {
  const diff = difficulty;
  const [hero, setHero] = useState<HeroDef>(HEROES.find(h => h.id === 'layla') ?? HEROES[0]);
  const [spell, setSpell] = useState(BATTLE_SPELLS[0].id);
  const [lane, setLane] = useState<LaneRole>(hero.laneSuggestion);
  const [filter, setFilter] = useState<Role | 'All'>('All');

  const list = filter === 'All' ? HEROES : HEROES.filter(h => h.role === filter);

  // preview draft: your team vs theirs
  const draft = useMemo(() => {
    const rest = HEROES.filter(h => h.id !== hero.id);
    const shuffled = [...rest].sort(() => Math.random() - 0.5);
    return { allies: shuffled.slice(0, 4), foes: shuffled.slice(4, 9) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hero.id]);

  const pick = (h: HeroDef) => {
    setHero(h);
    setLane(h.laneSuggestion);
    soundManager.playAttackSound('slash');
  };

  const lockIn = () => {
    soundManager.announce('Welcome to Mobile Legends');
    onStart(hero, spell, lane, diff);
  };

  return (
    <div className="absolute inset-0 z-40 overflow-y-auto bg-[radial-gradient(ellipse_at_top,#10233f_0%,#05070d_60%)] p-3">
      <div className="mx-auto max-w-[1180px]">
        {/* header */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-300 text-2xl font-black text-slate-950 shadow-lg shadow-amber-500/25 font-teko">
              M
            </div>
            <div>
              <h1 className="bg-gradient-to-r from-amber-300 via-yellow-100 to-sky-300 bg-clip-text text-2xl font-bold uppercase tracking-wider text-transparent font-teko md:text-3xl">
                Mobile Legends · Web Arena
              </h1>
              <p className="text-[11px] uppercase tracking-widest text-slate-400">Classic 5v5 · pick a hero, a battle spell and a lane</p>
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/70 p-1">
            <span className="px-2 text-[11px] font-semibold text-slate-400">BOT AI</span>
            {(['easy', 'normal', 'mythic'] as Difficulty[]).map(d => (
              <button
                key={d}
                onClick={() => onDifficulty(d)}
                className={`rounded-lg px-3 py-1 text-xs font-bold uppercase tracking-wide transition ${d === diff ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
              >
                {d === 'mythic' ? '🔥 Mythic' : d}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_330px]">
          {/* ---------- hero grid ---------- */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
            <div className="mb-2 flex flex-wrap gap-1">
              {(['All', 'Marksman', 'Mage', 'Fighter', 'Assassin', 'Tank', 'Support'] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setFilter(r as any)}
                  className={`rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase ${filter === r ? 'border-amber-400/70 bg-amber-400/15 text-amber-200' : 'border-slate-700 bg-slate-900/60 text-slate-400 hover:text-white'}`}
                >
                  {r}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {list.map(h => (
                <button
                  key={h.id}
                  onClick={() => pick(h)}
                  className={`group relative overflow-hidden rounded-xl border-2 text-left transition-all active:scale-[0.98] ${hero.id === h.id ? 'border-amber-400 shadow-lg shadow-amber-500/20' : 'border-slate-800 hover:border-slate-500'}`}
                >
                  <img src={h.portrait} alt={h.name} className="h-24 w-full object-cover opacity-85 transition group-hover:scale-105 group-hover:opacity-100" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent px-2 pb-1 pt-5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold leading-none text-white">{h.name}</span>
                      {roleIcon(h.role)}
                    </div>
                    <span className="text-[9px] uppercase tracking-wide text-slate-400">{h.title}</span>
                  </div>
                  {hero.id === h.id && (
                    <span className="absolute right-1 top-1 rounded-full bg-amber-400 p-0.5 text-slate-950"><Check className="h-3 w-3" /></span>
                  )}
                </button>
              ))}
            </div>

            {/* lane picker */}
            <div className="mt-3">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-widest text-slate-400">Choose your lane</div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
                {LANES.map(l => (
                  <button
                    key={l.id}
                    onClick={() => setLane(l.id)}
                    className={`rounded-lg border px-2 py-1.5 text-left transition ${lane === l.id ? 'border-sky-400 bg-sky-500/15' : 'border-slate-800 bg-slate-900/60 hover:border-slate-600'}`}
                  >
                    <div className={`text-[11px] font-black uppercase ${lane === l.id ? 'text-sky-200' : 'text-slate-200'}`}>{l.label}</div>
                    <div className="text-[9px] leading-tight text-slate-500">{l.hint}</div>
                    {hero.lanes.includes(l.id) && <div className="mt-0.5 text-[9px] font-bold text-emerald-400">★ recommended</div>}
                  </button>
                ))}
              </div>
            </div>

            {/* battle spells */}
            <div className="mt-3">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-widest text-slate-400">Battle spell</div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {BATTLE_SPELLS.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setSpell(s.id)}
                    className={`rounded-lg border px-2 py-1.5 text-left ${spell === s.id ? 'border-amber-400 bg-amber-400/10' : 'border-slate-800 bg-slate-900/60 hover:border-slate-600'}`}
                  >
                    <div className="text-[11px] font-bold text-slate-100">{s.name}</div>
                    <div className="text-[9px] leading-tight text-slate-500 line-clamp-2">{s.description}</div>
                    <div className="text-[9px] text-slate-600">CD {s.cooldown}s</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ---------- side panel ---------- */}
          <div className="flex flex-col gap-3">
            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70">
              <div className="relative">
                <img src={hero.portrait} alt={hero.name} className="h-40 w-full object-cover" onError={e => { (e.target as HTMLImageElement).style.opacity = '0'; }} />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950 to-transparent p-2">
                  <div className="text-xl font-black uppercase tracking-wide text-white font-teko">{hero.name}</div>
                  <div className="text-[10px] uppercase tracking-widest text-amber-300">{hero.role} · {hero.title}</div>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-1 p-2 text-center text-[10px]">
                <Stat label="HP" v={hero.maxHp} />
                <Stat label="ATK" v={hero.physAtk} />
                <Stat label="DEF" v={hero.physDef} />
                <Stat label="RNG" v={hero.attackRange} />
              </div>
              <div className="space-y-1 px-2 pb-2">
                {hero.skills.map((s, i) => (
                  <div key={s.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-100">
                        {i === 2 ? <Crown className="mr-1 inline h-3 w-3 text-amber-400" /> : `S${i + 1} `}{s.name}
                      </span>
                      <span className="text-[9px] text-slate-500">{s.cooldown}s · {s.manaCost}mp</span>
                    </div>
                    <p className="text-[10px] leading-tight text-slate-400">{s.description}</p>
                  </div>
                ))}
                <div className="rounded-lg border border-emerald-800/60 bg-emerald-950/30 p-1.5">
                  <div className="text-[11px] font-bold text-emerald-300">PASSIVE · {hero.passive.name}</div>
                  <p className="text-[10px] leading-tight text-slate-400">{hero.passive.description}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-2">
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">Draft</div>
              <TeamRow title="YOUR TEAM" color="sky" names={[hero.name, ...draft.allies.map(a => a.name)]} />
              <div className="my-1.5 h-px bg-slate-800" />
              <TeamRow title="ENEMY TEAM" color="rose" names={draft.foes.map(a => a.name)} />
            </div>

            <button
              onClick={lockIn}
              className="flex items-center justify-center gap-2 rounded-2xl border-2 border-amber-300 bg-gradient-to-b from-amber-400 to-amber-600 py-3 text-lg font-black uppercase tracking-widest text-slate-950 shadow-xl shadow-amber-500/25 transition hover:brightness-110 active:scale-[0.99] font-teko"
            >
              <Play className="h-5 w-5" /> Lock in · enter the arena
            </button>
            <p className="text-center text-[10px] leading-tight text-slate-500">
              Controls: <b className="text-slate-300">WASD</b> move · <b className="text-slate-300">Space</b> attack · <b className="text-slate-300">Q/E/R</b> skills (drag to aim) · <b className="text-slate-300">F</b> spell · <b className="text-slate-300">P</b> shop · <b className="text-slate-300">Tab</b> score · <b className="text-slate-300">Enter</b> chat
            </p>
          </div>
        </div>
      </div>
    </div>
  );

};

function Stat({ label, v }: { label: string; v: number }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/70 py-1">
      <div className="text-[9px] uppercase text-slate-500">{label}</div>
      <div className="text-xs font-bold text-slate-100">{v}</div>
    </div>
  );
}

function TeamRow({ title, names, color }: { title: string; names: string[]; color: 'sky' | 'rose' }) {
  return (
    <div>
      <div className={`text-[10px] font-black uppercase tracking-widest ${color === 'sky' ? 'text-sky-300' : 'text-rose-300'}`}>{title}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {names.map((n, i) => (
          <span key={i} className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${color === 'sky' ? 'border-sky-700/60 bg-sky-950/50 text-sky-200' : 'border-rose-700/60 bg-rose-950/50 text-rose-200'}`}>
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}

export default HeroSelectModal;
