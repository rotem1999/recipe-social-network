// Jest `setupFiles` entry: it runs once per test file, on require, so the axios
// defaults are applied as a module side effect (Jest requires setup files, it does
// not call what they export).
//
// SPEC.md §11.6: every route lives under `API_GLOBAL_PREFIX` (`api/v1`), so the base
// URL of the suite carries the prefix and every spec writes the bare route path.
import axios from 'axios';

/** Trims the slashes so `api/v1`, `/api/v1` and `api/v1/` all produce one clean URL. */
function trimSlashes(value: string): string {
  return value.replace(/^\/+/, '').replace(/\/+$/, '');
}

const host = process.env['HOST'] ?? 'localhost';
// §14: the API reads `API_PORT`; the Nx e2e scaffolding passes `PORT`.
const port = process.env['PORT'] ?? process.env['API_PORT'] ?? '3000';
const prefix = trimSlashes(process.env['API_GLOBAL_PREFIX'] ?? 'api/v1');

axios.defaults.baseURL =
  prefix.length > 0
    ? `http://${host}:${port}/${prefix}`
    : `http://${host}:${port}`;
