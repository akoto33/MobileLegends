import { useState } from 'react';
import { ITEMS } from '../data/items';
import { GameEngine } from '../engine/GameEngine';
import { Hero, Item } from '../types/game';
import { Coins, X, ShoppingBag, Sparkles } from 'lucide-react';

interface Props {
  hero: Hero;
  engine: GameEngine;
  open: boolean;
  onClose: () => void;
}

const CATS = [
  { id: 'attack', label: 'Attack', color: 'text-rose-300 border-rose-700/60' },
  { id: 'magic', label: 'Magic', color: 'text-violet-300 border-violet-700/60' },
  { id: 'defense', label: 'Defense', color: 'text-emerald-300 border-emerald-700/60' },
  { id: 'movement', label: 'Boots', color: 'text-sky-300 border-sky-700/60' }
] as const;

export const ShopModal: React.FC<Props> = ({ hero, engine, open, onClose }) => {
  const [cat, setCat] = useState<(typeof CATS)[number]['id'] | 'all'>('all');
  if (!open) return null;

  const build = engine.buildOrder(hero);
  const items = ITEMS.filter(i => cat === 'all' || i.category === cat);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/85 p-3 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-[min(96vw,880px)] flex-col overflow-hidden rounded-2xl border border-amber-700/40 bg-slate-900/95 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/60 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-amber-400" />
            <h2 className="text-lg font-bold tracking-wider text-white font-teko">SHOP · {hero.name}</h2>
            <span className="ml-2 flex items-center gap-1 rounded-md border border-amber-600/40 bg-amber-500/10 px-2 py-0.5 text-sm font-bold text-amber-300">
              <Coins className="h-3.5 w-3.5" />{Math.round(hero.gold)}
            </span>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-800 px-3 py-2">
          <button onClick={() => setCat('all')} className={`rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase ${cat === 'all' ? 'border-amber-400 bg-amber-400/15 text-amber-200' : 'border-slate-700 text-slate-400 hover:text-white'}`}>All</button>
          {CATS.map(c => (
            <button key={c.id} onClick={() => setCat(c.id)} className={`rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase ${cat === c.id ? c.color + ' bg-white/5' : 'border-slate-700 text-slate-400 hover:text-white'}`}>
              {c.label}
            </button>
          ))}
          <span className="ml-auto text-[11px] text-slate-500">Recommended next: <b className="text-amber-300">{build.find(id => !hero.items.some(s => s?.id === id)) ? ITEMS.find(i => i.id === build.find(id => !hero.items.some(s => s?.id === id)))!.name : 'build complete'}</b></span>
        </div>

        {/* owned items */}
        <div className="flex items-center gap-1.5 border-b border-slate-800 bg-slate-950/40 px-3 py-2">
          {hero.items.map((it, i) => (
            <div key={i} className={`flex h-11 w-11 flex-col items-center justify-center rounded-lg border text-center ${it ? 'border-amber-600/50 bg-amber-500/10' : 'border-dashed border-slate-700 bg-slate-900/60'}`}>
              {it ? (
                <>
                  <span className="text-[9px] font-bold leading-none text-amber-200">{it.name.split(' ').map(w => w[0]).join('')}</span>
                  <button onClick={() => engine.sellItem(hero, i)} className="mt-0.5 text-[8px] text-slate-500 hover:text-rose-300">sell {Math.round(it.cost * 0.7)}</button>
                </>
              ) : <span className="text-[9px] text-slate-600">slot {i + 1}</span>}
            </div>
          ))}
          <span className="ml-2 text-[10px] text-slate-500">6 slots · sell returns 70%</span>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-2 overflow-y-auto p-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it: Item) => {
            const owned = hero.items.some(s => s?.id === it.id);
            const afford = hero.gold >= it.cost;
            const recommended = build.includes(it.id) && !owned;
            return (
              <button
                key={it.id}
                disabled={owned}
                onClick={() => engine.buyItem(hero, it.id)}
                className={`rounded-xl border p-2 text-left transition ${owned ? 'border-emerald-700/50 bg-emerald-950/30 opacity-70'
                  : afford ? 'border-slate-700 bg-slate-950/60 hover:border-amber-400/70 hover:bg-slate-900 active:scale-[0.99]'
                    : 'border-slate-800 bg-slate-950/40 opacity-60'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[13px] font-bold text-slate-100">{it.name}</span>
                  <span className={`shrink-0 text-[12px] font-bold ${afford ? 'text-amber-300' : 'text-slate-500'}`}>{it.cost}</span>
                </div>
                <p className="mt-0.5 text-[10px] leading-tight text-slate-400">{it.description}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {Object.entries(it.stats).map(([k, v]) => (
                    <span key={k} className="rounded bg-slate-800 px-1 text-[9px] font-semibold text-slate-300">
                      {statLabel(k)} {typeof v === 'number' && v < 1 && (k.includes('Chance') || k.includes('lifesteal') || k.includes('Reduction')) ? `${Math.round((v as number) * 100)}%` : `+${v}`}
                    </span>
                  ))}
                  {recommended && <span className="flex items-center gap-0.5 rounded bg-amber-500/20 px-1 text-[9px] font-bold text-amber-300"><Sparkles className="h-2.5 w-2.5" />build</span>}
                  {owned && <span className="rounded bg-emerald-600/25 px-1 text-[9px] font-bold text-emerald-300">OWNED</span>}
                </div>
              </button>
            );
          })}
        </div>
        <div className="border-t border-slate-800 bg-slate-950/60 px-3 py-1.5 text-[10px] text-slate-500">
          Buying is instant — you do not have to be in the fountain. Close with <b className="text-slate-300">P</b> or Esc.
        </div>
      </div>
    </div>
  );
};

function statLabel(k: string) {
  return ({
    physAtk: 'Phys ATK', magicPower: 'Magic PWR', hp: 'HP', mana: 'Mana', physDef: 'Phys DEF',
    magicDef: 'Magic DEF', attackSpeed: 'Atk SPD', moveSpeed: 'Move SPD', lifesteal: 'Lifesteal',
    critChance: 'Crit', cooldownReduction: 'CDR', hpRegen: 'HP5'
  } as Record<string, string>)[k] ?? k;
}

export default ShopModal;
