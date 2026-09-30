/// <reference types='vitest' />
import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

export default defineConfig(({ mode }) => {
  const workspaceRoot = resolve(import.meta.dirname, '../..');
  // UI-53: the dev proxy reads only these two keys, from the repository root;
  // an empty value (or a prefix of only slashes) falls back to the default.
  const env = loadEnv(mode, workspaceRoot, ['API_PORT', 'API_GLOBAL_PREFIX']);
  const apiPort = env['API_PORT']?.trim() || '3000';
  const apiPrefix =
    (env['API_GLOBAL_PREFIX'] ?? '').trim().replace(/^\/+|\/+$/g, '') ||
    'api/v1';
  return {
    root: import.meta.dirname,
    cacheDir: '../../node_modules/.vite/apps/web',
    server: {
      port: 4200,
      host: 'localhost',
      allowedHosts: ['csn.dvirlabs.com'],
      proxy: {
        [`/${apiPrefix}`]: `http://localhost:${apiPort}`,
      },
      // UI-53: serve only what the renderer imports, never the repository root.
      fs: {
        allow: ['apps/web', 'libs', 'node_modules'].map((dir) =>
          resolve(workspaceRoot, dir),
        ),
      },
    },
    preview: {
      port: 4300,
      host: 'localhost',
    },
    plugins: [react(), nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
    // Uncomment this if you are using workers.
    // worker: {
    //   plugins: () => [ nxViteTsPaths() ],
    // },
    build: {
      outDir: '../../dist/apps/web',
      emptyOutDir: true,
      reportCompressedSize: true,
      commonjsOptions: {
        transformMixedEsModules: true,
      },
    },
    test: {
      name: 'web',
      watch: false,
      globals: true,
      environment: 'jsdom',
      include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
      reporters: ['default'],
      coverage: {
        reportsDirectory: '../../coverage/apps/web',
        provider: 'v8' as const,
      },
    },
  };
});
