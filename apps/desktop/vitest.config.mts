// SPEC.md §13 TEST-2: Electron main and preload unit tests run on Vitest in the Node
// environment with `vi.mock('electron')` (apps/desktop/CLAUDE.md).
import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/desktop',
  plugins: [nxViteTsPaths()],
  test: {
    name: 'desktop',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}'],
    reporters: ['default'],
    passWithNoTests: true,
    coverage: {
      reportsDirectory: '../../coverage/apps/desktop',
      provider: 'v8' as const,
    },
  },
}));
