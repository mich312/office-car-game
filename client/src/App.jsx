import { Suspense } from 'react';
import { useStore } from './store.js';
import Menu from './ui/Menu.jsx';
import HUD from './ui/HUD.jsx';
import Game from './game/Game.jsx';

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
