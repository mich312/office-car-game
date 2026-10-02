// The mixer's three faders, mute, and a way to hear every cue of the score
// without playing a match. One component for every place that sets sound:
// the garage monitor's SOUND tab (restyled there through .monitor-ui) and
// the Break Room (pause menu).
import { useState } from 'react';
import { useStore } from '../store.js';
import { audio } from '../audio.js';
import { music } from '../music/player.js';

export const FADERS = [['master', 'Master'], ['music', 'Music'], ['effects', 'Effects']];
export const CUES = [['garage', 'Garage'], ['lobby', 'Lobby'], ['race', 'Race'], ['intense', 'Final push'], ['podium', 'Podium']];

export default function SoundControls() {
  const volumes = useStore((s) => s.volumes);
  const muted = useStore((s) => s.muted);
  const [cue, setCue] = useState(music.audition || 'garage');
  const setVol = (k, v) => {
    const next = { ...volumes, [k]: v };
    useStore.setState({ volumes: next });
    audio.setVolumes(next);
    useStore.getState().save();
  };
  const hear = (st) => {
    audio.start(); music.start();
    music.audition = st === 'garage' ? null : st;
    music.setState(st);
    setCue(st);
  };
  return (
    <div className="mu-body">
      <div className="mu-tune">
        {FADERS.map(([k, label]) => (
          <div className="mu-vol-row" key={k}>
            <span className="mu-tune-name">{label}</span>
            <input
              type="range" min={0} max={100} step={5}
              value={Math.round(volumes[k] * 100)}
              aria-label={`${label} volume`}
              onChange={(e) => setVol(k, Number(e.target.value) / 100)}
              onPointerUp={() => k === 'effects' && audio.blip(700, 0.07)}
            />
            <span className="mu-tune-val on">{Math.round(volumes[k] * 100)}</span>
          </div>
        ))}
      </div>
      <label className="mu-auto">
        <input type="checkbox" checked={muted}
          onChange={(e) => { useStore.setState({ muted: e.target.checked }); audio.setMuted(e.target.checked); useStore.getState().save(); }} />
        mute everything (M in the office)
      </label>
      <label className="label">hear the score</label>
      <div className="mu-row">
        {CUES.map(([st, label]) => (
          <button key={st} className={cue === st ? 'sel' : ''} onClick={() => hear(st)}>{label}</button>
        ))}
      </div>
      <span className="mu-hint">the soundtrack follows the match: it lifts a whole step for the final lap and the last 30 seconds</span>
    </div>
  );
}
