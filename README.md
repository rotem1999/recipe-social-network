# CookBook

CookBook is a cooking social network for family and friends, built as an Electron desktop app with a NestJS backend. Users write recipes, keep them private, share them with chosen friends or publish them to everyone, and follow them step by step in **cook mode**, where an AI assistant answers questions about the current step.

[SPEC.md](SPEC.md) is the single source of truth for what the app does and how it is built. This file is a summary; when the two disagree, SPEC.md wins.

## Features

- **Accounts**: username + password sign-up (scrypt hashes), JWT access and refresh tokens (SPEC §2).
- **Recipes**: private by default, shareable with friends, or public; every edit creates a new version and the owner sees the full history; images through Firebase Cloud Storage, optional (§3).
- **Catalogue**: recipes from TheMealDB v2 appear next to user recipes and can be saved as a private copy (§3.3).
- **Friends**: search by username or email, mutual requests (§4).
- **Discover**: public recipes and the catalogue, split into TheMealDB's 14 categories, with up to 3 pinned favourites (§5).
- **Social**: 1–5 star ratings on public recipes, comments on public and shared recipes, Reddit-style votes on public ones (§6).
- **Cook mode**: live step tracker with one "ask the AI" button per step, via OpenRouter (`minimax/minimax-m3`), limited to 100 AI requests per user per day (§7).
- **Recommendations**: the AI ranks recipes for the current weather and time of day; location comes from the OS timezone only, weather from Open-Meteo (§8).
- **Nutrition**: calories per portion from USDA FoodData Central, by ingredients or by meal name (§9).
- **Prompt log**: every AI call is appended to `log/YYYY-MM-DD.json` (JSON Lines) with tokens and cost (§10).

## Architecture

An Nx 23 monorepo with pnpm and TypeScript (SPEC §11).

| Project | What it is |
|---|---|
| `apps/api` | NestJS 11 API (CommonJS, Jest), the only process that talks to PostgreSQL and to third-party services |
| `apps/web` | React 19 renderer (Vite 7, Vitest), loaded by the Electron window |
| `apps/desktop` | Electron 44 main and preload, built with electron-vite |
| `apps/*-e2e` | End-to-end tests: API (Jest), renderer (Playwright), desktop (WebdriverIO) |
| `libs/api/*` | API features (`feature-*`) and clients for PostgreSQL, OpenRouter, TheMealDB, USDA, Open-Meteo and Firebase (`data-access-*`) |
| `libs/web/*` | Renderer features, the typed API client and the UI kit with the design tokens |
| `libs/shared/*` | Domain types and request/response contracts used by both sides |

Imports use the alias `@rsn/<scope>/<type>-<name>` (for example `@rsn/shared/util-domain`), and module boundaries are enforced by lint. API keys live only in the API; the renderer and the desktop app never hold a secret.

## Prerequisites

- Node.js 24 LTS or 26
- pnpm 12.3.4 (`corepack enable` picks up the version from `package.json`)
- PostgreSQL 18 on `localhost:5432` (or Docker, see `docker/docker-compose.yml`)
- Keys for TheMealDB v2 (paid), USDA FoodData Central and OpenRouter; Firebase is optional

## Setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Create the database role and database once, as the `postgres` superuser. Open [docker/setup-database.sql](docker/setup-database.sql) in pgAdmin's Query Tool (steps are in the file header), replace `CHANGE_ME` with a password, and run it. From a terminal instead:

   ```bash
   "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -d postgres -f docker/setup-database.sql
   ```

3. Copy `.env.example` to `.env.local` and fill every empty value: the database password from step 2, two different long random JWT secrets, and the provider keys. Leave the three `FIREBASE_*` values empty to run without image uploads. `.env.local` is gitignored; never commit it.

4. Create the schema:

   ```bash
   pnpm nx run api-data-access-db:migrate
   ```

## Run

Start the API (port 3000, prefix `/api/v1`, health check at `/api/v1/health`):

```bash
pnpm nx serve api
```

Then start one client.

- **Desktop app** (Electron, with its own renderer dev server):

  ```bash
  pnpm nx dev desktop
  ```

- **Renderer in a browser** at http://localhost:4200:

  ```bash
  pnpm nx serve web
  ```

On Windows, if a dev server exits with `write EPIPE`, the Nx daemon restarted underneath it. Run the command with the daemon off, in PowerShell:

```powershell
$env:NX_DAEMON='false'; pnpm nx serve web
```

In development React StrictMode mounts effects twice, so the Home screen sends each recommendation request twice. Production builds do not.

## Test

Lint, type-check and unit-test everything:

```bash
pnpm nx run-many -t lint typecheck test
```

End-to-end suites:

```bash
pnpm nx e2e api-e2e
```

```bash
pnpm exec playwright install
```

```bash
pnpm nx e2e web-e2e
```

```bash
pnpm nx e2e desktop-e2e
```

`api-e2e` starts the API itself and needs the database; `desktop-e2e` builds the desktop app first.

## Build

```bash
pnpm nx build api
```

```bash
pnpm nx package desktop
```

`package` builds the Electron app and writes the installers to `dist/apps/desktop` with electron-builder.

## More documentation

- [SPEC.md](SPEC.md): requirements, architecture, schema, environment keys and the sources behind every third-party fact
- [MEM.md](MEM.md): current state of the work and next steps
- [design_handoff_cookbook_ui/](design_handoff_cookbook_ui/): the UI design guide the renderer is based on
