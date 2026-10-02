import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './ui/tokens.css';
import './ui/components.css';
import './ui/garage.css';
// the Suspense fallback in App.jsx shows .connect-screen before the HUD chunk
// (which also imports it) has loaded
import './ui/hud/connect.css';

createRoot(document.getElementById('root')).render(<App />);
