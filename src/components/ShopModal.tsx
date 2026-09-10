import React, { useState } from 'react';
import { ITEMS } from '../data/items';
import { Item, HeroInstance } from '../types/game';
import {
  Sword,
  Sparkles,
  Shield,
  Footprints,
  Coins,
  X,
  Check,
  ShoppingBag
} from 'lucide-react';
import { soundManager } from '../audio/soundManager';

interface ShopModalProps {
  playerHero: HeroInstance;
  isOpen: boolean;
  onClose: () => void;
  onItemPurchased: () => void;
}

export const ShopModal: React.FC<ShopModalProps> = ({
  playerHero,
  isOpen,
  onClose,
  onItemPurchased
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'attack' | 'magic' | 'defense' | 'movement'>('attack');
  const [selectedItem, setSelectedItem] = useState<Item>(ITEMS[0]);

  if (!isOpen) return null;

  const filteredItems = ITEMS.filter(it => it.category === selectedCategory);

  const canAfford = playerHero.gold >= selectedItem.cost;
  const alreadyOwned = playerHero.items.some(it => it.id === selectedItem.id);
  const inventoryFull = playerHero.items.length >= 6;

  const handleBuy = () => {
    if (!canAfford || inventoryFull || alreadyOwned) return;
    playerHero.gold -= selectedItem.cost;
    playerHero.items.push(selectedItem);
    soundManager.playGoldSound();
    onItemPurchased();
  };

  const handleSell = (index: number) => {
    const item = playerHero.items[index];
    if (!item) return;
    const refund = Math.round(item.cost * 0.7);
    playerHero.gold += refund;
    playerHero.items.splice(index, 1);
    soundManager.playGoldSound();
    onItemPurchased();
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'attack': return <Sword className="w-4 h-4" />;
      case 'magic': return <Sparkles className="w-4 h-4" />;
      case 'defense': return <Shield className="w-4 h-4" />;
      case 'movement': return <Footprints className="w-4 h-4" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl bg-slate-900 border border-blue-900/40 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center gap-3">
            <ShoppingBag className="w-5 h-5 text-amber-400" />
            <h2 className="text-xl font-bold tracking-wider text-white font-teko">EQUIPMENT SHOP</h2>
          </div>

          <div className="flex items-center gap-4">
            {/* Gold */}
            <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <Coins className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-bold text-amber-400 font-teko text-base">{playerHero.gold}</span>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden min-h-0">
          {/* Category Tabs & Item Grid */}
          <div className="md:col-span-8 p-4 flex flex-col overflow-y-auto border-r border-slate-800">
            {/* Categories */}
            <div className="flex gap-2 mb-4">
              {(['attack', 'magic', 'defense', 'movement'] as const).map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold capitalize flex items-center justify-center gap-2 transition-all ${
                    selectedCategory === cat
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                      : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {getCategoryIcon(cat)}
                  {cat}
                </button>
              ))}
            </div>

            {/* Items List */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {filteredItems.map(item => {
                const isSelected = selectedItem.id === item.id;
                const isOwned = playerHero.items.some(it => it.id === item.id);
                const affordable = playerHero.gold >= item.cost;

                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'border-amber-400 bg-amber-500/10 shadow-md shadow-amber-500/20'
                        : isOwned
                        ? 'border-emerald-600/40 bg-emerald-950/20'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-xs text-white truncate">{item.name}</span>
                        {isOwned && (
                          <span className="p-0.5 rounded-full bg-emerald-500 text-slate-950">
                            <Check className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">
                        {item.description}
                      </p>
                    </div>

                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/80">
                      <span className={`text-xs font-bold ${affordable ? 'text-amber-400' : 'text-slate-500'}`}>
                        {item.cost} G
                      </span>
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                        {item.category}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Item Detail & Buy Action & Current Inventory */}
          <div className="md:col-span-4 p-4 flex flex-col justify-between bg-slate-900/40 overflow-y-auto">
            <div>
              {/* Selected Item Details */}
              <div className="mb-4 p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-base text-amber-400 font-teko tracking-wide">
                    {selectedItem.name}
                  </h3>
                  <span className="text-sm font-bold text-amber-400">
                    {selectedItem.cost} Gold
                  </span>
                </div>

                <p className="text-xs text-slate-300 mb-3 leading-relaxed">
                  {selectedItem.description}
                </p>

                {selectedItem.passiveName && (
                  <div className="p-2 rounded bg-amber-500/5 border border-amber-500/20 text-[11px]">
                    <strong className="text-amber-400">Unique Passive - {selectedItem.passiveName}: </strong>
                    <span className="text-slate-300">{selectedItem.passiveDesc}</span>
                  </div>
                )}

                {/* Purchase Button */}
                <button
                  onClick={handleBuy}
                  disabled={!canAfford || inventoryFull || alreadyOwned}
                  className={`w-full mt-4 py-2.5 rounded-xl font-bold text-sm tracking-wider uppercase transition-all flex items-center justify-center gap-2 ${
                    alreadyOwned
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-600/40 cursor-not-allowed'
                      : inventoryFull
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : canAfford
                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20 active:scale-[0.98]'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  {alreadyOwned
                    ? 'ALREADY PURCHASED'
                    : inventoryFull
                    ? 'BAG FULL (6/6)'
                    : canAfford
                    ? `PURCHASE FOR ${selectedItem.cost} G`
                    : `NEED ${selectedItem.cost - playerHero.gold} MORE GOLD`}
                </button>
              </div>

              {/* Current Hero Inventory */}
              <div>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                  Equipped Items ({playerHero.items.length}/6)
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {[0, 1, 2, 3, 4, 5].map(idx => {
                    const it = playerHero.items[idx];
                    return (
                      <div
                        key={idx}
                        className={`aspect-square rounded-xl border flex flex-col items-center justify-center p-2 relative group transition-all ${
                          it
                            ? 'border-blue-500/40 bg-slate-900'
                            : 'border-dashed border-slate-800 bg-slate-950/40'
                        }`}
                      >
                        {it ? (
                          <>
                            <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 mb-1">
                              {getCategoryIcon(it.category)}
                            </div>
                            <span className="text-[9px] text-slate-300 font-medium truncate w-full text-center">
                              {it.name}
                            </span>
                            {/* Sell Hover Button */}
                            <button
                              onClick={() => handleSell(idx)}
                              className="absolute inset-0 bg-red-950/90 text-red-400 rounded-xl flex items-center justify-center text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              SELL ({Math.round(it.cost * 0.7)}G)
                            </button>
                          </>
                        ) : (
                          <span className="text-[10px] text-slate-700 font-bold">{idx + 1}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
