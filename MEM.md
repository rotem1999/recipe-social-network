# MEM.md — session handoff notes

Written 2026-09-08 at the end of the first session. Read this, INTENT.txt, and SPEC.md before doing anything.

## Working rules (from Rotem, non-negotiable)

1. **SPEC.md is the scaffolding.** Never write code from a chat prompt. A request first changes SPEC.md; code is built from SPEC.md.
2. **Never assume.** If INTENT.txt or SPEC.md does not say it, ask Rotem directly in chat. Do not write questions, "open", "proposed", or "TBD" markers into SPEC.md. SPEC.md holds only settled architecture and requirements.
3. **Verify online before presenting.** Every third-party fact (versions, limits, licences, endpoints) needs a source URL fetched that day. SPEC.md §16 is the source list; re-verify before scaffolding, the facts there were checked on 2026-09-08.
4. Deleted files (the old README.md and docs/ARCHITECTURE.md from git history) are out of scope. Do not use them as a source.
5. Rotem writes constraints into CLAUDE.md files per folder in the next session; do not invent constraints.
6. **Commits go through the local git CLI**, configured with Rotem's identity, so they count as Rotem's contributions on GitHub. No Co-Authored-By or "Generated with" lines anywhere. PRs, if needed, are opened through the GitKraken MCP tools. (Rotem, 2026-09-08)

## App name

Working name is **CookBook** (Rotem, 2026-09-08), chosen as a placeholder after a search found every short cooking word (Ladle, Mise, Simmer, Stovetop, Potluck, Foodkin, PanPal) already taken by existing apps. Names that came back clean if a rename is wanted later: Supperkin, Forkfolk, Tablekin (no app, no npm package found on 2026-09-08). Repo name and the `@rsn` alias are unchanged.

## State of the repository

- Branch `master`, remote `origin` = https://github.com/rotem1999/recipe-social-network.git. Everything is pushed; see `git log` for the latest commit.
- Files: INTENT.txt (product intent, the source of truth), SPEC.md (Draft 2, complete, no open items), .env.example (predates SPEC; regenerate from SPEC §14 when keys are settled), .gitignore, this file.
- No application code exists yet.

## Next step (Rotem's plan)

Create the repository structure per SPEC.md §11.3, then add a CLAUDE.md to each subfolder with constraints Rotem will write in the new session.

## Decisions that live only in chat history (all are also in SPEC.md, listed here for speed)

- Auth: username + password in PostgreSQL, backend JWT. Firebase Auth and Google sign-in dropped.
- Images: Cloud Storage for Firebase, Blaze plan already active, backend-only through the Admin SDK, signed URLs for display, no Firebase SDK or key in the desktop app.
- AI: paid `minimax/minimax-m3` on OpenRouter through one server key (account has about $11 credits). 100 requests per user per day. No chat history saved. Prompts written to conserve tokens. Every prompt and response logged to `<project root>/log/`, one JSON file per day.
- Weather: Open-Meteo. Location from the OS timezone only (city segment geocoded). No IP lookup, no browser geolocation.
- Recipes: title + short description, structured ingredients, steps with optional timer, optional prep/cook minutes, one category from TheMealDB's 14, servings (default 2 for TheMealDB imports). Owner has full control; versioning, all versions public if the recipe is public; saved public recipes are local copies that fork on edit with attribution; shared recipes are view-only but cookable.
- Social: mutual friend requests, find by username or email; whole-star 1–5 ratings, average shown in quarter steps with decimal on hover; Reddit-style up/down comment votes; up to 3 favourite categories pinned in Discover.
- Toolchain: Nx 23 monorepo, pnpm, alias `@rsn/<scope>/<type>-<name>`, NestJS 11.2.3 CommonJS + Jest (NestJS 12 is outside `@nx/nest`'s peer range), electron-vite via `nx:run-commands` (`nx-electron` is pinned to Nx 22), Vitest 5 + React Testing Library for the renderer, `@wdio/electron-service` for Electron e2e, targets Windows/macOS/Linux, API and Postgres on Rotem's PC for now.

## Local machine facts (checked 2026-09-08)

- PostgreSQL 18.6 at `C:\Program Files\PostgreSQL\18`, service `postgresql-x64-18` running, port 5432. `psql` is not on PATH.
- Node v26.5.0 (Current line, not LTS; SPEC names Node 24 Active LTS as the reference), npm 11.17.0, git 2.54.0.windows.1.
- pnpm is not installed. No global `nx`.
- Shell is PowerShell 5.1; Git Bash is also available. Long heredocs through Bash fail with ENAMETOOLONG on this machine, use the Write tool for large files.

## Things to re-check before scaffolding

- Whether `@nx/nest`, NestJS 11, and electron-vite work under TypeScript 7.0 (native compiler); not verified.
- Whether Nx 23 supports Node 26, or whether Rotem wants Node 24 LTS installed.
- `minimax/minimax-m3` provider list and pricing on OpenRouter (changes often).
- TheMealDB v2 key: Rotem adds it to `.env` later; `.env.example` still points at v1.
