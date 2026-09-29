// SPEC.md §13 TEST-2: Electron end-to-end tests with @wdio/electron-service 10.3
// (apps/desktop-e2e/CLAUDE.md). Runs the unpackaged electron-vite build of apps/desktop:
// the service is pointed at the bundled main file through `appEntryPoint`
// (SPEC §16 T13; https://webdriver.io/docs/wdio-electron-service).
import { resolve } from 'node:path';

export const config: WebdriverIO.Config = {
  runner: 'local',
  specs: ['./src/**/*.spec.ts'],
  maxInstances: 1,
  services: ['electron'],
  capabilities: [
    {
      browserName: 'electron',
      'wdio:electronServiceOptions': {
        appEntryPoint: resolve(__dirname, '../desktop/out/main/index.js'),
        appArgs: [],
      },
    },
  ],
  logLevel: 'warn',
  waitforTimeout: 10_000,
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 60_000,
  },
};
