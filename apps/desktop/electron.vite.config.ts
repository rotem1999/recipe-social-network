// SPEC.md §11.2 (electron-vite 5, no Nx Electron plugin) and apps/desktop/CLAUDE.md.
// main and preload use electron-vite's defaults (src/main/index.ts, src/preload/index.ts, out/).
// The renderer is apps/web (SPEC §11.3), so its root and entry point at that project.
import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

const webRoot = resolve(__dirname, '../web');

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    root: webRoot,
    plugins: [react(), nxViteTsPaths()],
    build: {
      rollupOptions: {
        input: resolve(webRoot, 'index.html'),
      },
    },
  },
});
