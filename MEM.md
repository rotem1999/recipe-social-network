# MEM.md — session handoff notes

Written 2026-09-08 at the end of the first session; updated 2026-09-28 at the end of the fifth session (the first full build). Read this, SPEC.md, and `.claude/README.md` before doing anything. INTENT.txt is history: everything in it is reflected in SPEC.md (Rotem, 2026-09-08).

## Working rules (from Rotem, non-negotiable)

1. **SPEC.md is the scaffolding.** Never write code from a chat prompt. A request first changes SPEC.md; code is built from SPEC.md.
2. **Never assume.** If SPEC.md does not say it, ask Rotem directly in chat. Do not write questions, "open", "proposed", or "TBD" markers into SPEC.md. SPEC.md holds only settled architecture and requirements.
3. **Verify online before presenting.** Every third-party fact (versions, limits, licences, endpoints) needs a source URL fetched that day. SPEC.md §16 is the source list (checked 2026-09-08 twice and, for the packages added, 2026-09-28).
4. Deleted files (the old README.md and docs/ARCHITECTURE.md from git history) are out of scope. Do not use them as a source.
5. Per-folder CLAUDE.md constraints are Rotem's. Do not invent or edit constraints, ask Rotem for the sentence. `libs/web/feature-friends/` still has no CLAUDE.md; Rotem writes it.
6. **Commits go through the local git CLI**, configured with Rotem's identity, so they count as Rotem's contributions on GitHub. No Co-Authored-By or "Generated with" lines anywhere. PRs, if needed, are opened through the GitKraken MCP tools (its server failed to connect on 2026-09-28; no PR was needed). (Rotem, 2026-09-08)
7. **Every subagent runs on Claude Opus 5.5** (`claude-opus-5-5`; Opus 4.8 until 2026-09-29), never Fable. Enforced by the `env` block in `.claude/settings.json` and by `model:` in every `.claude/agents/*.md`. (Rotem, 2026-09-08; model changed 2026-09-29)
8. **Unit tests are written only by the `test-writer` subagent.** The main session never writes or edits a `*.spec.ts(x)` file; the PreToolUse guard denies it. When a production fix invalidates a pinned test, hand the test back to test-writer (done twice on 2026-09-28). (Rotem, 2026-09-08)
9. **Delegated choices.** On 2026-09-08 Rotem said "choose actions yourself" for toolchain flags and UI details, and on 2026-09-28 "finish the app. report when you're done according to SPEC.md". Every detail SPEC.md did not settle was decided, written into SPEC.md with "Rotem delegated, chat 2026-09-28", and built. Product behaviour that changes what the app does is still asked, not assumed. (Rotem, 2026-09-08, 2026-09-28)
10. **Claude never touches `.env` or `.env.local`** (guard + CLAUDE.md). Rotem asked on 2026-09-28 for the env file to be written; the answer is `.env.example`, regenerated with every key and comments, which Rotem copies to `.env.local` and fills.

## App name

**CookBook** (Rotem, 2026-09-08). Brand text everywhere (SPEC UI-2). Design guide folder: `design_handoff_cookbook_ui/` (a guidebook, SPEC §11.5 UI-1). Repo name and the `@rsn` alias unchanged.

## State of the repository

- **Update 2026-09-30:** the live run happened. Work is on branch **`fix/qa-review-2026-09-29`** ([PR #5](https://github.com/rotem1999/recipe-social-network/pull/5) into `Dev`), built on `chore/app-critic-agent-opus-5-5` ([PR #4](https://github.com/rotem1999/recipe-social-network/pull/4): the app-critic agent, every subagent on Opus 5.5). SPEC.md is **Draft 6**. The app runs against the local PostgreSQL, OpenRouter, TheMealDB v2, USDA, Open-Meteo and Firebase Storage (bucket `cooking-sn.firebasestorage.app`, Blaze on). QA loop with the `app-critic` agent: review → fix round → commit → re-review, until no findings or ≤ 3 nitpicks (Rotem, 2026-09-30). Reviews, screenshots and fix task lists live in the gitignored `docs/reviews/` (local only). A parallel session works on API docs (`feat/api-docs`, worktree `D:/claude-projects/rsn-api-docs`, SPEC "Draft 7") and resolves the SPEC.md conflicts with this branch. Open questions for Rotem are listed in the latest `docs/reviews/FIX-TASKS-*.md`.
- Before 2026-09-30: branch **`Dev`**, remote `origin` = https://github.com/rotem1999/recipe-social-network.git. `master` is behind Dev; merging is Rotem's call.
- Commits: `b7b6abf` design handoff, `a1cb9af` SPEC Draft 3, `d9204d8` Nx scaffold, `24a0224` MEM handoff (all 2026-09-08); then on 2026-09-28 the build commit that carries this file (`feat: build the CookBook API, renderer and desktop shell from SPEC.md Draft 4`).
- **The application is fully written from SPEC.md Draft 4.** Every §11.6 route exists once; every §11.3 library holds real code; `apps/api` wires ConfigModule (`.env.local` then `.env`), DbModule and the eight feature modules; `apps/web` is the CookBook renderer (auth, home, discover, friends, recipe detail, editor, catalogue preview, cook mode); `apps/desktop` loads it in Electron with the timezone preload and ships the OFL/ISC licences; `docker/docker-compose.yml` exists.
- Verified on 2026-09-28: lint 30/30 (one pre-existing warning in the api-e2e generator support file), typecheck 9/9 web projects plus `tsc` on every API library and app, unit tests 27/27 projects (about 700 tests: shared 71, API 478 including the app, web 149 including the app), builds of api, web and desktop, arch-reviewer 14-point checklist (two blockers fixed, `git diff -- '**/CLAUDE.md'` empty).
- **(2026-09-28, since resolved: all services now run live; the e2e suites are still not run)** Not verified, blocked on credentials: nothing has run against PostgreSQL, OpenRouter, TheMealDB, USDA, Open-Meteo or Firebase. The migration was only load-tested (`migration:show` reached the local PostgreSQL and failed on auth, as expected). The e2e suites (`apps/api-e2e` Jest + axios, `apps/web-e2e` Playwright with every API call stubbed, `apps/desktop-e2e` WebdriverIO) compile and lint but were not executed: api-e2e needs the database and a running API, web-e2e needs `pnpm exec playwright install`, desktop-e2e needs the built app. `apps/desktop` has no unit spec (nothing beyond the bootstrap to test).
- Two production defects found by test-writer were fixed the same day (auth refresh-secret message swallowed; the caller's own row in friend search inheriting flags from other requests).
- `.env.example` is regenerated per SPEC §14 (2026-09-28). Rotem filled `.env.local` on 2026-09-29 (Claude never reads it). The Firebase service-account JSON still sits in the repo root (gitignored by `*-firebase-adminsdk-*.json`); moving it out is Rotem's step (SEC-001).
- Dev servers: `.claude/launch.json` (`api`, `web`, both with the Nx daemon off). The API dev server does **not** rebuild when a library changes: restart it (preview_stop / preview_start) after API edits. After every pull, run `pnpm nx run api-data-access-db:migrate` (`migrate:show` lists pending ones; the API logs "Database schema is out of date" at boot).

## Tooling (`.claude/`, added 2026-09-08)

Full description in `.claude/README.md`. Guard behaviours learned: a Bash command is denied if it mentions `.env` anywhere or a `*.spec.*` name with a redirect; any Write to `apps/web`, `apps/desktop`, `libs/web`, `libs/shared` containing a provider host (even in a comment or constant) is denied, so the TheMealDB attribution string lives only in `libs/api/data-access-themealdb` and travels in API responses. Subagent workflow that worked on 2026-09-28: a rules file plus an inter-library contract file in the scratchpad, builders launched in waves (data-access → API features → web features), test-writers per batch, arch-reviewer at the end. `pnpm prettier --write <folder>` reformats CLAUDE.md and project.json; always scope it to `src`.

## Next step

Current (2026-09-30): the QA loop ended with round 6 on `fix/qa-review-2026-09-29` (Rotem's decisions on AI latency, dry-goods density, piece fallback, orphan images, draft survival, single-candidate skip and own recipes in Discover recommendations are built; Rotem asked for no further app-critic run). Next: Rotem merges PR #4 and PR #5; run the e2e suites.

Original plan of 2026-09-28 (Rotem: "then we'll run the program and test what and if needs changes"), steps 1 and 2 done on 2026-09-29:

1. Rotem fills `.env.local` (copy `.env.example`; the values to complete are listed in the 2026-09-28 session report: DB password chosen in docker/setup-database.sql (run once in pgAdmin as postgres), two JWT secrets, TheMealDB v2 key, USDA key, OpenRouter key, optional Firebase trio).
2. `pnpm nx run api-data-access-db:migrate`, then `pnpm nx serve api` and `pnpm nx run desktop:dev` (or `pnpm nx serve web` for a browser at http://localhost:4200).
3. Run `pnpm nx e2e api-e2e` against the running API; `pnpm exec playwright install` then `pnpm nx e2e web-e2e`; `pnpm nx run desktop:build` then `pnpm nx e2e desktop-e2e`.
4. Fix what the live run shows, SPEC-first.

## Decisions that live only in chat history (all are also in SPEC.md, listed here for speed)

- Auth: username + password, scrypt N=2¹⁷ from `node:crypto` (no native module), backend JWT access 15m / refresh 30d, stateless refresh, sign-out client-side (AUTH-5..8).
- Images: firebase-admin 14.5.0 only, bucket path `recipes/<id>/<uuid>.<ext>`, 3 images × 5 MB, signed URLs 6 h, unconfigured Firebase → 503 on upload and no URLs (IMG-6).
- AI: paid `minimax/minimax-m3`, 100/user/day counted atomically in `ai_daily_usage` before the call, JSON-Lines log in `log/YYYY-MM-DD.json`, `cost` in credits, no `response_format` parameter (COOK-10, WX-10, LOG-5).
- Weather: Open-Meteo, city from the timezone segment, 30-minute cache, recommendations still work without weather (WX-10).
- Recipes: versions table, saved copy = own private row with `savedFromRecipeId`, first edit sets `forkedFromRecipeId`, own originals soft-delete, copies hard-delete; catalogue saves keep TheMealDB's image URL (§12.1, CAT-6).
- Social: whole-star ratings only on public recipes, average recomputed per write; comments on public and shared, votes on public only (RATE-4, COM-3).
- Toolchain (2026-09-28): `@nestjs/config` 4.0.4, `@nestjs/jwt` 11.0.2, `@nestjs/typeorm` 11.0.3 because the 12.x lines are ESM-only and Jest in the CommonJS workspace cannot load them (§16 V19); class-validator 0.15.1; lucide-react 1.48.0; TypeScript 6, Vite 7, Vitest 5.0.0 unchanged.
- UI: in-app state routing, fetch client with localStorage tokens and one refresh retry, 23 guide details settled as UI-9..UI-17.

## Local machine facts (checked 2026-09-28)

- PostgreSQL 18.6 service running on 5432; `psql` needs a password Claude does not have; the application role and database exist since 2026-09-29 and all three migrations (`InitialSchema`, `SaveOwnership`, `SharedWithNobodyPrivate`) are applied (the third on 2026-09-30).
- Node v26.5.0, npm 11.17.0, pnpm 12.3.4 (global), git 2.54.0.windows.1. Playwright browsers installed (Chromium used by app-critic screenshots). Electron 44.2.0 binary downloaded by pnpm.
- Shell PowerShell 5.1 with Git Bash; long heredocs fail (ENAMETOOLONG); use the Write tool.
- Git identity `Rotem <akunu11@gmail.com>` set locally.

## Things to re-check before the next code

- The e2e suites (never run yet).
- OpenRouter provider list and pricing for `minimax/minimax-m3` (changes often; 13 providers on 2026-09-30). `minimax/minimax-m3` spends most completion tokens on reasoning (answers 12–74 s at `max_tokens` 1500 on 2026-09-30); it supports switching reasoning off only (no effort levels); §16 O7 and the reasoning-guide URLs moved on OpenRouter (2026-09-30).
- Nx 24 removes `nxViteTsPaths` and `nxCopyAssetsPlugin` (deprecation warnings on every Vite task).
- TypeScript 7, Vite 8, NestJS 12 (with the three ESM-only companion packages): all recorded in SPEC §11.1 and §16 V19.
- Subagents run on Claude Opus 5.5 (`claude-opus-5-5`, retirement not before 2027-09-22, rule 7).
