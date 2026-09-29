// Jest `globalTeardown`: stops the API that `api:serve` started for the run.
import { killPort } from '@nx/node/utils';

module.exports = async function (): Promise<void> {
  // §14: the API reads `API_PORT`; the Nx e2e scaffolding passes `PORT`.
  const port = Number(process.env['PORT'] ?? process.env['API_PORT'] ?? 3000);
  await killPort(port);
  console.log(globalThis.__TEARDOWN_MESSAGE__);
};
