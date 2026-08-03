import { Suspense, lazy } from 'react';
import { useStore } from './store.js';
import Menu from './ui/Menu.jsx';
import { audio } from './audio.js';

// Apply the persisted mute before any UI sound can play. The in-game bridge
// (Game.jsx) only mounts on the game screen, so without this a muted player
// reloads into a garage that blips at full volume.
audio.setMuted(useStore.getState().muted);

// The garage needs three.js; it does not need the physics engine, the office,
// or the effect composer. Splitting the game out means a new player waits for
// the menu, not for Rapier's wasm and every prop in the building. The Suspense
// boundary below already had the fallback for it.
const Game = lazy(() => import('./game/Game.jsx'));
const HUD = lazy(() => import('./ui/HUD.jsx'));

export default function App() {
  const screen = useStore((s) => s.screen);
  return (
    <>
      {screen === 'game' && (
        <Suspense fallback={<div className="connect-screen"><p>unboxing tiny cars<span className="dots" /></p></div>}>
          <Game />
          <HUD />
        </Suspense>
      )}
      {screen === 'menu' && <Menu />}
    </>
  );
}
