// Jest `globalSetup`: waits for the API that `api-e2e:e2e` starts through
// `dependsOn: ["api:build", "api:serve"]` (apps/api-e2e/project.json) before the
// first spec runs. The database itself is the local PostgreSQL 18.6 of DB-5;
// the schema comes from migrations only (DB-3), never from `synchronize`.
import { waitForPortOpen } from '@nx/node/utils';

declare global {
  // Shared with global-teardown.ts, which prints it after the run.
  var __TEARDOWN_MESSAGE__: string;
}

module.exports = async function (): Promise<void> {
  console.log('\nSetting up...\n');

  const host = process.env['HOST'] ?? 'localhost';
  // §14: the API reads `API_PORT`; the Nx e2e scaffolding passes `PORT`.
  const port = Number(process.env['PORT'] ?? process.env['API_PORT'] ?? 3000);
  await waitForPortOpen(port, { host });

  globalThis.__TEARDOWN_MESSAGE__ = '\nTearing down...\n';
};
