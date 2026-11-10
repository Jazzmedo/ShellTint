import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/800.css';
import '@fontsource/inter/900.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';
import './styles.css';
import ScrollReel from './ScrollReel.jsx';
import Static from './Static.jsx';
import { setTheme } from './theme.js';

// The film needs room and motion; phones and reduced-motion get the same content as plain sections.
const QUERY = '(prefers-reduced-motion: reduce), (max-width: 700px)';

function App() {
  const [plain, setPlain] = useState(() => matchMedia(QUERY).matches);
  useEffect(() => {
    const media = matchMedia(QUERY), sync = () => setPlain(media.matches);
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  return <>{!plain && <ScrollReel />}<Static visible={plain} /></>;
}

setTheme('dusk');
createRoot(document.getElementById('root')).render(<App />);
