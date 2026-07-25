import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './ui/tokens.css';
import './ui/components.css';
import './ui/garage.css';
import './ui/hud.css';

createRoot(document.getElementById('root')).render(<App />);
