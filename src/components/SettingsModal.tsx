import React, { useState } from 'react';
import { Volume2, VolumeX, Mic, MicOff, Settings, X, Keyboard } from 'lucide-react';
import { soundManager } from '../audio/soundManager';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  botDifficulty: 'easy' | 'normal' | 'mythic';
  onDifficultyChange: (diff: 'easy' | 'normal' | 'mythic') => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  botDifficulty,
  onDifficultyChange
}) => {
  const [soundEnabled, setSoundEnabled] = useState<boolean>(soundManager.enabled);
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(soundManager.voiceAnnouncements);

  if (!isOpen) return null;

  const toggleSound = () => {
    soundManager.enabled = !soundEnabled;
    setSoundEnabled(!soundEnabled);
  };

  const toggleVoice = () => {
    soundManager.voiceAnnouncements = !voiceEnabled;
    setVoiceEnabled(!voiceEnabled);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center gap-2.5">
            <Settings className="w-5 h-5 text-amber-400" />
            <h2 className="text-xl font-bold tracking-wider text-white font-teko">GAME SETTINGS & CONTROLS</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Audio Settings */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Audio & Announcer
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={toggleSound}
                className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                  soundEnabled
                    ? 'border-blue-500/40 bg-blue-500/10 text-white'
                    : 'border-slate-800 bg-slate-900/60 text-slate-500'
                }`}
              >
                <span className="text-xs font-medium">Sound Effects (SFX)</span>
                {soundEnabled ? <Volume2 className="w-4 h-4 text-blue-400" /> : <VolumeX className="w-4 h-4" />}
              </button>

              <button
                onClick={toggleVoice}
                className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                  voiceEnabled
                    ? 'border-amber-500/40 bg-amber-500/10 text-white'
                    : 'border-slate-800 bg-slate-900/60 text-slate-500'
                }`}
              >
                <span className="text-xs font-medium">Voice Announcer</span>
                {voiceEnabled ? <Mic className="w-4 h-4 text-amber-400" /> : <MicOff className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Bot Difficulty */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Bot AI Difficulty
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {(['easy', 'normal', 'mythic'] as const).map(diff => (
                <button
                  key={diff}
                  onClick={() => onDifficultyChange(diff)}
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold capitalize transition-all ${
                    botDifficulty === diff
                      ? 'border-amber-400 bg-amber-500/20 text-amber-300 font-bold'
                      : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:text-white'
                  }`}
                >
                  {diff === 'mythic' ? '🔥 Mythic Rank' : diff}
                </button>
              ))}
            </div>
          </div>

          {/* Control Guide */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Keyboard className="w-4 h-4 text-blue-400" />
              Keyboard & Touch Controls
            </h3>
            <div className="space-y-2 text-xs bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
              <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
                <span className="text-slate-400">Hero Movement:</span>
                <span className="text-slate-200 font-semibold">Virtual Joystick (Touch/Mouse) or WASD / Arrow Keys</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
                <span className="text-slate-400">Basic Attack:</span>
                <span className="text-slate-200 font-semibold">Spacebar or Main Attack Button</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
                <span className="text-slate-400">Lock Minion / Turret:</span>
                <span className="text-slate-200 font-semibold">'1' for Minion, '2' for Turret</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
                <span className="text-slate-400">Skills (1, 2, Ult):</span>
                <span className="text-slate-200 font-semibold">'Q' (Skill 1), 'W' (Skill 2), 'E' (Ultimate)</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
                <span className="text-slate-400">Battle Spell / Regen:</span>
                <span className="text-slate-200 font-semibold">'F' (Battle Spell), 'R' (Regen heal)</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
                <span className="text-slate-400">Recall to Fountain:</span>
                <span className="text-slate-200 font-semibold">'B' (Recall 8s channel)</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
                <span className="text-slate-400">Equipment Shop:</span>
                <span className="text-slate-200 font-semibold">'P' or Gold Icon</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-400">Scoreboard:</span>
                <span className="text-slate-200 font-semibold">'Tab' or KDA Header</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
