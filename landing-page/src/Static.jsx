import { NAMES, setTheme, usePal } from './theme.js';

const CMD = 'curl -fsSL https://raw.githubusercontent.com/Jazzmedo/ShellTint/main/shelltint.sh | bash';

// The same content as the film, as plain sections: for screen readers, phones and reduced motion.
export default function Static({ visible }) {
  const [name] = usePal();
  return (
    <main className={`static${visible ? '' : ' sr-only'}`} inert={!visible}>
      <header>
        <p className="eyebrow">ShellTint</p>
        <h1>Your desktop has colour. Your browser doesn’t.</h1>
        <p>ShellTint colours your browser and 130+ websites with the palette your Linux desktop shell generated, and follows it when the theme changes.</p>
      </header>
      <section>
        <h2>Works with your desktop</h2>
        <p>GNOME, KDE Plasma, Dux Shell (formerly DMS), Caelestia, Noctalia, end-4, pywal or any matugen file. It finds the right one automatically.</p>
      </section>
      <section>
        <h2>How it works</h2>
        <ol>
          <li>Your shell writes its palette to a file when you change theme.</li>
          <li>A small Python helper on your computer watches the file and expands it into a full Material colour set.</li>
          <li>The builder recompiles Catppuccin’s website styles with your palette, only for the sites you visit.</li>
          <li>Palette and styles stay in <code>~/.cache/shelltint</code>. Nothing leaves your computer.</li>
          <li>The extension asks the helper for them through the browser’s native messaging.</li>
          <li>It colours the toolbar (Firefox-based browsers) and the pages you open, with no reload. A new wallpaper takes about a second.</li>
        </ol>
      </section>
      <section>
        <h2>What you get</h2>
        <ul>
          <li>Toolbar, tabs and menus in your shell’s colours (Firefox-based browsers only).</li>
          <li>130+ websites restyled: YouTube, GitHub, X, Reddit, Wikipedia and more.</li>
          <li>Your own CSS per site, backup and restore, light and dark that follow the shell.</li>
          <li>Collects no data. Everything is read and built on your computer.</li>
        </ul>
      </section>
      <section>
        <h2>Try a palette</h2>
        <div className="static-picks" role="radiogroup" aria-label="Palette">
          {NAMES.map(n => <button key={n} role="radio" aria-checked={n === name} className={n === name ? 'on' : ''} onClick={() => setTheme(n)}>{n}</button>)}
        </div>
      </section>
      <section>
        <h2>Install</h2>
        <ol>
          <li>Run the installer, which sets up the helper and lets the extension into your browsers:<pre><code>{CMD}</code></pre></li>
          <li>Install the extension: <a href="https://addons.mozilla.org/firefox/addon/shelltint/">Firefox-based, from addons.mozilla.org</a>, or the Chromium zip from the <a href="https://github.com/Jazzmedo/ShellTint/releases/latest">latest release</a>.</li>
          <li>Restart the browser. Settings → Overview should say the helper is connected.</li>
        </ol>
      </section>
      <footer>
        <p><a href="https://github.com/Jazzmedo/ShellTint">GitHub</a> · <a href="https://github.com/Jazzmedo/ShellTint/blob/main/CHANGELOG.md">Changelog</a> · <a href="https://github.com/Jazzmedo/ShellTint/blob/main/LICENSE">Licence</a></p>
        <p>MIT · Jazzmedo · Based on MatugenFox by Ubaid · Website styles from Catppuccin userstyles.</p>
      </footer>
    </main>
  );
}
