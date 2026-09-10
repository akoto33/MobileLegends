import { useState } from 'react';
import { soundManager } from '../audio/soundManager';
import { X, Volume2, Gauge, Keyboard, Info, Pause, Play } from 'lucide-react';

type Difficulty = 'easy' | 'normal' | 'mythic';

interface Props {
  open: boolean;
  onClose: () => void;
  difficulty: Difficulty;
  onDifficulty: (d: Difficulty) => void;
  paused: boolean;
  onPause: (v: boolean) => void;
}

export const SettingsModal: React.FC<Props> = ({ open, onClose, difficulty, onDifficulty, paused, onPause }) => {
  const [sfx, setSfx] = useState(soundManager.settings.sfxEnabled);
  const [voice, setVoice] = useState(soundManager.settings.voiceEnabled);
  const [vol, setVol] = useState(Math.round(soundManager.settings.sfxVolume * 100));
  const [hud, setHud] = useState(() => localStorage.getItem('ml.hudScale') === 'large');

  if (!open) return null;

  const toggleSfx = () => {
    const v = !sfx;
    setSfx(v);
    soundManager.setSfxEnabled(v);
  };
  const toggleVoice = () => {
    const v = !voice;
    setVoice(v);
    soundManager.setVoiceEnabled(v);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-3 backdrop-blur-sm" onClick={onClose}>
      <div className="w-[min(94vw,620px)] rounded-2xl border border-slate-700 bg-slate-900/95 p-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-wider text-white font-teko">
            <Gauge className="h-5 w-5 text-amber-400" /> OPTIONS
          </h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <Section title="Difficulty">
          <div className="grid grid-cols-3 gap-2">
            {(['easy', 'normal', 'mythic'] as Difficulty[]).map(d => (
              <button
                key={d}
                onClick={() => onDifficulty(d)}
                className={`rounded-xl border p-2 text-left transition ${difficulty === d ? 'border-amber-400 bg-amber-400/10' : 'border-slate-700 bg-slate-950/60 hover:border-slate-500'}`}
              >
                <div className="text-[12px] font-black uppercase text-slate-100">{d === 'mythic' ? '🔥 Mythic' : d}</div>
                <div className="text-[10px] leading-tight text-slate-500">
                  {d === 'easy' ? 'Bots retreat, farm safely, fight rarely.' : d === 'normal' ? 'Bots lane, last-hit and contest objectives.' : 'Bots trade aggressively, gank and chain skills.'}
                </div>
              </button>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-slate-500">Applies to the AI immediately, no restart needed.</p>
        </Section>

        <Section title="Audio">
          <div className="grid gap-2 sm:grid-cols-2">
            <Row label="Sound effects" on={sfx} onClick={toggleSfx} />
            <Row label="Announcer voice" on={voice} onClick={toggleVoice} />
          </div>
          <label className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
            <Volume2 className="h-4 w-4" />
            Volume
            <input
              type="range" min={0} max={100} value={vol}
              onChange={e => { setVol(+e.target.value); soundManager.setSfxVolume(+e.target.value / 100); }}
              className="h-1 flex-1 accent-amber-400"
            />
            <span className="w-8 text-right font-mono">{vol}</span>
          </label>
        </Section>

        <Section title="Gameplay">
          <div className="grid gap-2 sm:grid-cols-2">
            <Row label="Large HUD buttons" on={hud} onClick={() => { const v = !hud; setHud(v); localStorage.setItem('ml.hudScale', v ? 'large' : 'normal'); location.reload(); }} />
            <Row label={paused ? 'Resume match' : 'Pause match'} on={!paused} onClick={() => { onPause(!paused); onClose(); }} icon={<>{paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}</>} />
          </div>
        </Section>

        <Section title="Controls">
          <div className="grid grid-cols-2 gap-1 text-[11px] sm:grid-cols-3">
            {[
              ['WASD / arrows', 'move'], ['left click ground', 'move to point'], ['left click enemy', 'attack'],
              ['right click', 'move / cancel'], ['Space', 'attack nearest'], ['Q E R', 'skills (drag = aim)'],
              ['F', 'battle spell'], ['B', 'recall'], ['H', 'heal spell'],
              ['G', 'auto-attack toggle'], ['1 2 3 0', 'target priority'], ['P', 'shop'],
              ['Tab', 'scoreboard'], ['Enter or click CHAT', 'chat'], ['Y T U', 'attack / help / retreat ping']
            ].map(([k, v]) => (
              <div key={k} className="flex items-center gap-1.5 rounded border border-slate-800 bg-slate-950/60 px-1.5 py-1">
                <Keyboard className="h-3 w-3 shrink-0 text-slate-600" />
                <span className="font-mono text-[10px] text-amber-200">{k}</span>
                <span className="truncate text-slate-400">{v}</span>
              </div>
            ))}
          </div>
        </Section>

        <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-slate-800 bg-slate-950/60 p-2 text-[10px] leading-tight text-slate-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-400" />
          Fan-made browser prototype: 5v5 laning, jungle camps, Turtle &amp; Lord, turrets with plates, fog of war,
          pings, chat and 3-lane AI. Everything runs locally in this page — no server, no account, no purchases.
        </p>
      </div>
    </div>
  );
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 text-[11px] font-black uppercase tracking-widest text-slate-400">{title}</div>
      {children}
    </div>
  );
}

function Row({ label, on, onClick, icon }: { label: string; on: boolean; onClick: () => void; icon?: React.ReactNode }) {
  return (
    <button onClick={onClick} className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-950/60 px-2.5 py-2 text-[12px] font-semibold text-slate-200 hover:border-slate-500">
      <span className="flex items-center gap-1.5">{icon}{label}</span>
      <span className={`relative h-5 w-9 rounded-full transition ${on ? 'bg-emerald-500' : 'bg-slate-700'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

export default SettingsModal;
