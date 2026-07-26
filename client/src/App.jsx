import { Suspense, lazy } from 'react';
import { useStore } from './store.js';
import Menu from './ui/Menu.jsx';

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
