// In-game overlay router: picks what the HUD shows for the room's phase.
// Each surface lives in its own file under ui/hud/ with its own stylesheet
// (lobby, countdown, match HUD, standings, results, feed, office events,
// connect / error / photo mode). The root carries the layout flags
// (is-compact / is-touch, hud/useLayout.js) every surface keys off.
import { useEffect, useState } from 'react';
import { PHASE } from '@rc/shared';
import { useStore } from '../store.js';
import { DrivingTest, MatchHints } from './Coach.jsx';
import { ToyIcon } from './Icon.jsx';
import Lobby from './hud/Lobby.jsx';
import Countdown from './hud/Countdown.jsx';
import MatchHUD from './hud/MatchHUD.jsx';
import Results from './hud/Results.jsx';
import Scoreboard from './hud/Scoreboard.jsx';
import Feed from './hud/Feed.jsx';
import EventTelegraph from './hud/EventTelegraph.jsx';
import ConnectScreen, { PhotoHint } from './hud/ConnectScreen.jsx';
import { useLayout, layoutClass } from './hud/useLayout.js';
// the shift report counts from match start, whoever reads it later (results)
import './hud/matchStats.js';
import './hud/root.css';

export default function HUD() {
  const phase = useStore((s) => s.phase);
  const connected = useStore((s) => s.connected);
  const photoMode = useStore((s) => s.photoMode);
  const layout = useLayout();
  const [showScores, setShowScores] = useState(false);

  useEffect(() => {
    const down = (e) => { if (e.code === 'Tab') { e.preventDefault(); setShowScores(true); } };
    const up = (e) => { if (e.code === 'Tab') setShowScores(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  if (photoMode) return <PhotoHint />;

  const inMatch = phase === PHASE.PLAYING || phase === PHASE.COUNTDOWN;
  // a phone held upright can't drive: the match shows only the rotate hint
  if (connected && inMatch && layout.portrait) {
    return (
      <div className={`hud tb-hud ${layoutClass(layout)}`}>
        <div className="tb-rotate tb-box" role="status">
          <ToyIcon name="refresh" />
          <span className="tb-disp">Turn your phone sideways</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`hud tb-hud ${layoutClass(layout)}`}>
      <ConnectScreen />
      {connected && phase === PHASE.LOBBY && <Lobby />}
      {connected && phase === PHASE.LOBBY && <DrivingTest />}
      {connected && phase === PHASE.PLAYING && <MatchHints />}
      {connected && phase === PHASE.COUNTDOWN && <Countdown />}
      {connected && inMatch && <MatchHUD />}
      {connected && phase === PHASE.PODIUM && <Results />}
      {connected && showScores && phase !== PHASE.LOBBY && phase !== PHASE.PODIUM && <Scoreboard />}
      <Feed />
      <EventTelegraph />
    </div>
  );
}
