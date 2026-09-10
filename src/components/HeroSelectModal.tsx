import React, { useState } from 'react';
import { HEROES } from '../data/heroes';
import { BATTLE_SPELLS } from '../data/spells';
import { HeroDef, Role, BattleSpell } from '../types/game';
import {
  Shield,
  Sword,
  Sparkles,
  Crosshair,
  Zap,
  Info,
  CheckCircle,
  Play
} from 'lucide-react';
import { soundManager } from '../audio/soundManager';

interface HeroSelectModalProps {
  onStartMatch: (selectedHero: HeroDef, selectedSpell: string, botDifficulty: 'easy' | 'normal' | 'mythic') => void;
}

export const HeroSelectModal: React.FC<HeroSelectModalProps> = ({ onStartMatch }) => {
  const [selectedHero, setSelectedHero] = useState<HeroDef>(HEROES[0]); // Default Layla
  const [selectedSpell, setSelectedSpell] = useState<BattleSpell>(BATTLE_SPELLS[0]); // Default Flicker
  const [selectedRole, setSelectedRole] = useState<Role | 'All'>('All');
  const [botDifficulty, setBotDifficulty] = useState<'easy' | 'normal' | 'mythic'>('normal');
  const [activeTab, setActiveTab] = useState<'skills' | 'stats'>('skills');

  const filteredHeroes = selectedRole === 'All'
    ? HEROES
    : HEROES.filter(h => h.role === selectedRole);

  const handleHeroSelect = (hero: HeroDef) => {
    setSelectedHero(hero);
    soundManager.playAttackSound('slash');
  };

  const handleLockIn = () => {
    soundManager.playLevelUp();
    soundManager.announce('Welcome to Mobile Legends');
    onStartMatch(selectedHero, selectedSpell.id, botDifficulty);
  };

  const getRoleIcon = (role: Role) => {
    switch (role) {
      case 'Tank': return <Shield className="w-3.5 h-3.5 text-blue-400" />;
      case 'Fighter': return <Sword className="w-3.5 h-3.5 text-orange-400" />;
      case 'Assassin': return <Zap className="w-3.5 h-3.5 text-purple-400" />;
      case 'Mage': return <Sparkles className="w-3.5 h-3.5 text-cyan-400" />;
      case 'Marksman': return <Crosshair className="w-3.5 h-3.5 text-yellow-400" />;
      case 'Support': return <Info className="w-3.5 h-3.5 text-green-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 p-3 md:p-6 overflow-y-auto">
      <div className="w-full max-w-6xl bg-gradient-to-b from-slate-900 to-slate-950 border border-blue-900/40 rounded-2xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-blue-900/30 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center font-bold text-slate-950 text-xl shadow-lg shadow-amber-500/20 font-teko">
              ML
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-yellow-200 to-blue-400 font-teko uppercase">
                Mobile Legends: Bang Bang
              </h1>
              <p className="text-xs text-slate-400">Classic 5v5 Arena — Hero Selection</p>
            </div>
          </div>

          {/* Bot Difficulty Settings */}
          <div className="flex items-center gap-2 bg-slate-800/80 p-1 rounded-lg border border-slate-700/60">
            <span className="text-xs text-slate-400 px-2 font-medium">Bot AI:</span>
            {(['easy', 'normal', 'mythic'] as const).map(diff => (
              <button
                key={diff}
                onClick={() => setBotDifficulty(diff)}
                className={`text-xs px-2.5 py-1 rounded font-semibold transition-all capitalize ${
                  botDifficulty === diff
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {diff === 'mythic' ? '🔥 Mythic' : diff}
              </button>
            ))}
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden min-h-0">
          {/* Left Column: Heroes Grid & Filters */}
          <div className="lg:col-span-7 p-4 md:p-6 flex flex-col overflow-y-auto border-r border-blue-900/20">
            {/* Role Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-3 mb-4 scrollbar-none">
              {(['All', 'Marksman', 'Mage', 'Assassin', 'Fighter', 'Tank'] as const).map(role => (
                <button
                  key={role}
                  onClick={() => setSelectedRole(role as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                    selectedRole === role
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                      : 'bg-slate-800/60 text-slate-300 hover:bg-slate-800 border border-slate-700/50'
                  }`}
                >
                  {role !== 'All' && getRoleIcon(role as Role)}
                  {role}
                </button>
              ))}
            </div>

            {/* 10 Heroes Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {filteredHeroes.map(hero => {
                const isSelected = selectedHero.id === hero.id;
                return (
                  <div
                    key={hero.id}
                    onClick={() => handleHeroSelect(hero)}
                    className={`group relative rounded-xl overflow-hidden cursor-pointer border-2 transition-all duration-200 transform hover:scale-[1.02] ${
                      isSelected
                        ? 'border-amber-400 shadow-lg shadow-amber-500/25 ring-2 ring-amber-400/40'
                        : 'border-slate-800 hover:border-blue-500/50 bg-slate-900'
                    }`}
                  >
                    {/* Hero Portrait */}
                    <div className="aspect-[4/5] relative bg-slate-950 overflow-hidden">
                      <img
                        src={hero.portrait}
                        alt={hero.name}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                        onError={(e) => {
                          // Fallback styled gradient if image not found
                          (e.currentTarget as HTMLElement).style.display = 'none';
                        }}
                      />
                      {/* Role badge */}
                      <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded bg-slate-950/80 backdrop-blur-sm border border-slate-700/60 flex items-center gap-1 text-[10px] text-slate-200 font-medium">
                        {getRoleIcon(hero.role)}
                        {hero.role}
                      </div>

                      {/* Selected check */}
                      {isSelected && (
                        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center shadow-md">
                          <CheckCircle className="w-3.5 h-3.5" />
                        </div>
                      )}

                      {/* Bottom Info Gradient */}
                      <div className="absolute inset-x-0 bottom-0 pt-8 pb-2 px-2 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent flex flex-col justify-end">
                        <span className="font-bold text-sm text-slate-100 group-hover:text-amber-300 transition-colors">
                          {hero.name}
                        </span>
                        <span className="text-[10px] text-slate-400 truncate">
                          {hero.title}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Battle Spell Selection */}
            <div className="mt-5 pt-4 border-t border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Battle Spell
                </span>
                <span className="text-[11px] text-amber-400 font-medium">
                  {selectedSpell.name} (CD: {selectedSpell.cooldown}s)
                </span>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                {BATTLE_SPELLS.map(spell => {
                  const isSelected = selectedSpell.id === spell.id;
                  return (
                    <button
                      key={spell.id}
                      onClick={() => {
                        setSelectedSpell(spell);
                        soundManager.playAttackSound('magic');
                      }}
                      className={`relative p-2 rounded-lg flex flex-col items-center gap-1 border transition-all ${
                        isSelected
                          ? 'border-amber-400 bg-amber-500/10 shadow-md shadow-amber-500/20'
                          : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                      }`}
                      title={spell.description}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isSelected ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}>
                        <Zap className="w-4 h-4" />
                      </div>
                      <span className="text-[10px] font-medium text-slate-300 truncate w-full text-center">
                        {spell.name}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-400 mt-2 bg-slate-900/50 p-2 rounded border border-slate-800/80">
                <strong className="text-amber-400">{selectedSpell.name}:</strong> {selectedSpell.description}
              </p>
            </div>
          </div>

          {/* Right Column: Hero Profile, Kit & Lock-in */}
          <div className="lg:col-span-5 p-4 md:p-6 flex flex-col justify-between bg-slate-900/40 overflow-y-auto">
            <div>
              {/* Selected Hero Banner */}
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 rounded-xl overflow-hidden border-2 border-amber-400 shadow-lg shadow-amber-500/20 flex-shrink-0 bg-slate-800">
                  <img
                    src={selectedHero.portrait}
                    alt={selectedHero.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-bold text-white tracking-wide font-teko">
                      {selectedHero.name}
                    </h2>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                      {selectedHero.role}
                    </span>
                  </div>
                  <p className="text-xs text-amber-400 font-medium">"{selectedHero.title}"</p>
                </div>
              </div>

              {/* Sub-tabs: Skills / Stats */}
              <div className="flex border-b border-slate-800 mb-3">
                <button
                  onClick={() => setActiveTab('skills')}
                  className={`pb-2 px-3 text-xs font-semibold transition-colors border-b-2 ${
                    activeTab === 'skills'
                      ? 'border-amber-400 text-amber-400'
                      : 'border-transparent text-slate-400 hover:text-white'
                  }`}
                >
                  Skill Kit & Passive
                </button>
                <button
                  onClick={() => setActiveTab('stats')}
                  className={`pb-2 px-3 text-xs font-semibold transition-colors border-b-2 ${
                    activeTab === 'stats'
                      ? 'border-amber-400 text-amber-400'
                      : 'border-transparent text-slate-400 hover:text-white'
                  }`}
                >
                  Base Attributes
                </button>
              </div>

              {/* Skills Tab */}
              {activeTab === 'skills' && (
                <div className="space-y-2.5">
                  {/* Passive */}
                  <div className="p-2.5 rounded-lg bg-slate-900/70 border border-slate-800">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] font-bold">P</span>
                        {selectedHero.passive.name} (Passive)
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      {selectedHero.passive.description}
                    </p>
                  </div>

                  {/* Skills 1, 2, 3 */}
                  {selectedHero.skills.map((skill, idx) => (
                    <div
                      key={skill.id}
                      className={`p-2.5 rounded-lg border ${
                        skill.isUltimate
                          ? 'bg-amber-950/20 border-amber-600/30'
                          : 'bg-slate-900/70 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-bold flex items-center gap-1.5 ${skill.isUltimate ? 'text-amber-400' : 'text-blue-400'}`}>
                          <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            skill.isUltimate ? 'bg-amber-500 text-slate-950' : 'bg-blue-500/20 text-blue-400'
                          }`}>
                            {idx + 1}
                          </span>
                          {skill.name} {skill.isUltimate && <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300">ULT</span>}
                        </span>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400">
                          <span>CD: {skill.cooldown}s</span>
                          {skill.manaCost > 0 && <span>Mana: {skill.manaCost}</span>}
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        {skill.description}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Stats Tab */}
              {activeTab === 'stats' && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
                    <span className="text-slate-400 text-[11px]">Max HP:</span>
                    <p className="text-emerald-400 font-bold text-sm">{selectedHero.maxHp}</p>
                  </div>
                  <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
                    <span className="text-slate-400 text-[11px]">Physical Attack:</span>
                    <p className="text-red-400 font-bold text-sm">{selectedHero.physAtk}</p>
                  </div>
                  <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
                    <span className="text-slate-400 text-[11px]">Physical Defense:</span>
                    <p className="text-blue-400 font-bold text-sm">{selectedHero.physDef}</p>
                  </div>
                  <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
                    <span className="text-slate-400 text-[11px]">Magic Defense:</span>
                    <p className="text-purple-400 font-bold text-sm">{selectedHero.magicDef}</p>
                  </div>
                  <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
                    <span className="text-slate-400 text-[11px]">Movement Speed:</span>
                    <p className="text-yellow-400 font-bold text-sm">{selectedHero.moveSpeed}</p>
                  </div>
                  <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
                    <span className="text-slate-400 text-[11px]">Attack Range:</span>
                    <p className="text-amber-400 font-bold text-sm">{selectedHero.attackRange}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Lock In / Enter Match Button */}
            <div className="mt-5 pt-4 border-t border-slate-800">
              <button
                onClick={handleLockIn}
                className="w-full py-3.5 px-6 rounded-xl font-bold text-slate-950 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:to-yellow-400 shadow-lg shadow-amber-500/30 transform active:scale-[0.99] transition-all flex items-center justify-center gap-2 text-base tracking-wider uppercase font-teko text-lg"
              >
                <Play className="w-5 h-5 fill-slate-950" />
                LOCK IN & ENTER 5v5 ARENA
              </button>
              <p className="text-center text-[11px] text-slate-400 mt-2">
                Bots will automatically fill remaining 4 allies and 5 opponents
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
