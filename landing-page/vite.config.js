import { defineConfig } from 'vite';

// The build goes to ../docs (the repo's docs/ folder) because GitHub Pages serves the root or /docs.
// base './' keeps it working under https://<user>.github.io/ShellTint/.
export default defineConfig({ base: './', esbuild: { jsx: 'automatic' }, build: { outDir: '../docs', emptyOutDir: true } });
