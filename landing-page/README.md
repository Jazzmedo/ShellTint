# ShellTint landing page

One scroll-driven film. `src/reel.jsx` is the motion reel from the `showreel` branch (`film/reel.jsx`); here its clock is the scroll position. `src/scenes.jsx` adds the chapters the reel doesn't have (how it works, a palette picker, install).

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in ../docs (committed; GitHub Pages serves /docs)
```

- **Pacing and copy:** `src/beats.js`. Each beat is a resting point: the clock plays to the moment a scene is fully on screen, then holds there for `HOLD_VH` of scrolling, with a plain caption under it.
- **See one frame:** add `?t=12.5` to the URL (film seconds) to show that single frame, for authoring.
- **Phones and reduced motion** get the same content as plain sections (`src/Static.jsx`); on desktop that copy stays in the page, hidden, for search engines.
