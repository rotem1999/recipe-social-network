# MEM.md — session handoff notes

Written 2026-09-08 at the end of the first session; updated 2026-09-08 at the end of the fourth session (re-verification and scaffolding). Read this, SPEC.md, and `.claude/README.md` before doing anything. INTENT.txt is history: everything in it is reflected in SPEC.md (Rotem, 2026-09-08).

## Working rules (from Rotem, non-negotiable)

1. **SPEC.md is the scaffolding.** Never write code from a chat prompt. A request first changes SPEC.md; code is built from SPEC.md.
2. **Never assume.** If SPEC.md does not say it, ask Rotem directly in chat. Do not write questions, "open", "proposed", or "TBD" markers into SPEC.md. SPEC.md holds only settled architecture and requirements.
3. **Verify online before presenting.** Every third-party fact (versions, limits, licences, endpoints) needs a source URL fetched that day. SPEC.md §16 is the source list; re-verify before scaffolding, the facts there were checked on 2026-09-08 (twice: first session and fourth session).
4. Deleted files (the old README.md and docs/ARCHITECTURE.md from git history) are out of scope. Do not use them as a source.
5. Per-folder CLAUDE.md constraints are Rotem's. They exist (written 2026-09-08 in the second session); do not invent or edit constraints, ask Rotem for the sentence. `libs/web/feature-friends/` (added to SPEC §11.3 on 2026-09-08) has no CLAUDE.md yet; Rotem writes it.
6. **Commits go through the local git CLI**, configured with Rotem's identity, so they count as Rotem's contributions on GitHub. No Co-Authored-By or "Generated with" lines anywhere. PRs, if needed, are opened through the GitKraken MCP tools. (Rotem, 2026-09-08)
7. **Every subagent runs on Claude Opus 4.8** (`claude-opus-4-8`), never Fable. Enforced by the `env` block in `.claude/settings.json` and by `model:` in every `.claude/agents/*.md`. (Rotem, 2026-09-08)
8. **Unit tests are written only by the `test-writer` subagent.** The main session never writes or edits a `*.spec.ts(x)` file; the PreToolUse guard denies it. Spec files that Nx generators emit stay until test-writer replaces them together with the placeholder source they test (arch-reviewer, 2026-09-08). (Rotem, 2026-09-08)
9. **Delegated choices.** On 2026-09-08 Rotem said "choose actions yourself" for toolchain flags and UI details, and "update spec if needed". Such a choice is made, written into SPEC.md with a Source column that says "Rotem delegated, chat 2026-09-08", and then built. Product behaviour (what the app does) is still asked, not assumed. (Rotem, 2026-09-08)

## App name

**CookBook** (Rotem, 2026-09-08). Brand text everywhere (SPEC UI-2). The design guide folder was renamed from `design_handoff_potluck_ui/` to `design_handoff_cookbook_ui/` and its "Potluck" text replaced on 2026-09-08. Repo name and the `@rsn` alias are unchanged. Names that came back clean if a rename is wanted later: Supperkin, Forkfolk, Tablekin (checked 2026-09-08).

## State of the repository

- Work happens on branch **`Dev`**; `master` is behind it. Remote `origin` = https://github.com/rotem1999/recipe-social-network.git. Rotem asked on 2026-09-08 for master to be merged into Dev and work to continue on Dev; merging Dev back to master is Rotem's call.
- Commits of the fourth session (2026-09-08), all on Dev: `b7b6abf` docs: add design handoff (also on master, pushed); `a1cb9af` docs: SPEC Draft 3 (re-verified sources, §11.2 toolchain, §11.5 UI design guide, design folder renamed); `d9204d8` build: scaffold the Nx 23 workspace and every SPEC §11.3 project; then the MEM.md commit that follows this text.
- **The workspace exists.** Nx 23.2.0, pnpm 12.3.4, TypeScript 6.0.3, Vite 7.3.6, Vitest 5.0.0, NestJS 11.2.3, React 19.2.8, Electron 44.2.0, electron-vite 5.0.0. 30 projects exactly as SPEC §11.3 lists them; project names are `<scope>-<type>-<name>` for libraries (`api-feature-auth`, `web-ui`) and the folder name for apps. Verified on 2026-09-08: lint 30/30, typecheck 9/9 (web projects; the others have no typecheck target), test 27/27 (generator placeholder specs), build of api, web and desktop. E2E targets were never run (Playwright browsers not installed; desktop-e2e has no spec yet).
- Every library is an empty generator skeleton (`utilDomain()`, an empty `@Module`, a `WebUi` component). `apps/web` still renders Nx's `nx-welcome.tsx`; it is removed when `libs/web/ui` is built (SPEC UI-3). `apps/api/src/main.ts` reads `API_PORT` and `API_GLOBAL_PREFIX`. `apps/desktop` main and preload are the minimal bootstrap of SPEC §11.2.2 (window loads `apps/web`; preload exposes `window.cookbook.timezone`).
- `.env.example` predates SPEC and still contradicts it (`OPENROUTER_MODEL_PREFERENCE`, `STORAGE_*` S3 keys, references to a deleted ARCHITECTURE.md, v1 TheMealDB URL). SPEC §14 says it is regenerated once keys are settled; do that when `data-access-db` and `feature-auth` are built.
- `docker/` holds only its CLAUDE.md; the compose file of SPEC DB-2 is not written yet.
- Six commits before `534cb8d` carry `Co-Authored-By` trailers from before rule 6 existed. History is pushed and was left alone.

## Tooling (`.claude/`, added 2026-09-08)

Full description and the doc sources in `.claude/README.md` (sources C1–C6 re-verified 2026-09-08, C3b added). Five subagents (`spec-guardian`, `fact-verifier`, `arch-reviewer`, `test-runner`, `test-writer`), five skills (`/spec-change`, `/reverify-sources`, `/nx-project`, `/commit`, `/handoff`), and the PreToolUse guard. Guard behaviours learned on 2026-09-08: a Bash command is denied outright if it mentions `.env` anywhere (even `.env.example` inside a longer argument list) or if it mentions a `*.spec.*` name together with a redirect or `sed -i`; split such commands or use the Edit tool. Every `pnpm nx ...` call is run with `NX_DAEMON=false` and `< /dev/null` so nothing prompts.

## Next step (my plan under rule 9; Rotem did not name one beyond "start coding according to SPEC.md")

1. `/commit` is not needed for this file; it is committed with `docs: update MEM.md handoff for 2026-09-08` and Dev is pushed.
2. `libs/shared/util-domain` and `util-contracts`: the types, enums and invariants of SPEC §3–§6 and the DTOs (libs/shared/*/CLAUDE.md). Hand the files and IDs to `test-writer`.
3. `libs/api/data-access-db`: TypeORM 1.1.1 + pg 8.23.0 + `@nestjs/typeorm` 12.0.1 (§16 V13, V14), DataSource from `DB_*`, `synchronize: false`, first migration for users, recipes, versions, saves, shares, friends, ratings, comments, votes, favourite categories, AI daily counts (data-access-db/CLAUDE.md). Rotem must create the PostgreSQL user and `.env.local` first.
4. `libs/api/feature-auth` (§2) with `@nestjs/jwt` 12.0.1 (§16 V15); the password-hash library is my delegated choice, recorded in §2 before coding.
5. `libs/web/ui`: port `styles.css`, bundle the fonts through `@fontsource`, the `Icon` wrapper, and remove `nx-welcome.tsx` (SPEC §11.5). The 23 guide details SPEC.md does not settle (sign-in screens, editor, share and visibility controls, version list, image upload, delete and remove-saved, signed-URL expiry, servings stepper persistence, optimistic save, rating count, star row on private recipes, display name and avatar source, prep+cook meta, quota endpoint, comment votes on shared recipes, NUT-5 placement, timer across steps, the fake 900 ms delay, sign-out) are decided under rule 9 and written into the owning SPEC section when that `libs/web/*` library is built (UI-8).
6. Then the remaining `libs/api/*` and `libs/web/*` in the order of SPEC §3 → §9, each through spec-guardian, test-writer, arch-reviewer and test-runner before `/commit`.

## Decisions that live only in chat history (all are also in SPEC.md, listed here for speed)

- Auth: username + password in PostgreSQL, backend JWT. Firebase Auth and Google sign-in dropped.
- Images: Cloud Storage for Firebase, Blaze plan already active, backend-only through the Admin SDK (firebase-admin 14.3.0 only; no separate @google-cloud/storage), signed URLs for display, bucket in a US region for the no-cost quota, no Firebase SDK or key in the desktop app.
- AI: paid `minimax/minimax-m3` on OpenRouter through one server key (account has about $11 credits). 100 requests per user per day. No chat history saved. Prompts written to conserve tokens. Every prompt and response logged to `<project root>/log/`, one JSON file per day (gitignored). `usage.cost` is in credits (1 credit = $1).
- Weather: Open-Meteo. Location from the OS timezone only (city segment geocoded). No IP lookup, no browser geolocation.
- Recipes: title + short description, structured ingredients, steps with optional timer, optional prep/cook minutes, one category from TheMealDB's 14, servings (default 2 for TheMealDB imports). Owner has full control; versioning, all versions public if the recipe is public; saved public recipes are local copies that fork on edit with attribution; shared recipes are view-only but cookable.
- Social: mutual friend requests, find by username or email; whole-star 1–5 ratings, average shown in quarter steps with decimal on hover; Reddit-style up/down comment votes; up to 3 favourite categories pinned in Discover.
- Toolchain (2026-09-08, fourth session, delegated): Nx 23.2.0 in the tsconfig-paths layout (no `packages` key in `pnpm-workspace.yaml`, non-composite `tsconfig.base.json`) to keep `@rsn/<scope>/<type>-<name>`; TypeScript 6 not 7; Vite 7 not 8 (electron-vite 5 cap); Vitest exactly 5.0.0 (browser provider peer); Node 24 LTS reference, Node 26 supported and used; ESLint + Prettier; strict everywhere; non-buildable libraries; electron-builder for packaging; Storybook Vitest addon dropped; `ui → ui` kept as this project's rule; `apps/desktop` declares `web` as an implicit dependency; `libs/web/feature-friends` added; `@nestjs/typeorm` 12.0.1 so the NestJS 12 move stays open.
- UI (2026-09-08, delegated): `design_handoff_cookbook_ui/` is a guidebook, SPEC wins (UI-1); Organic tokens ported into `libs/web/ui` (UI-3); fonts bundled via `@fontsource/caprasimo` and `@fontsource-variable/figtree` 5.3.0 with the OFL text shipped in `licenses/` (UI-4); Lucide via `lucide-react` 1.43.0 with a wrapper fixing stroke-width 2.75 (UI-5).

Decisions that are not product decisions live in `.claude/README.md`, not SPEC.md: subagent model Opus 4.8 (rule 7), unit tests by subagent only (rule 8), the guard rules, the pre-allowed read-only commands.

## Local machine facts (checked 2026-09-08)

- PostgreSQL 18.6 at `C:\Program Files\PostgreSQL\18`, service `postgresql-x64-18` running, port 5432. `psql` is not on PATH. No application user or database created yet.
- Node v26.5.0 (Current line; SPEC reference is Node 24 LTS, Node 26 supported by Nx 23, Vitest 5, electron-vite 5, firebase-admin 14), npm 11.17.0, git 2.54.0.windows.1.
- **pnpm 12.3.4 installed globally on 2026-09-08** (`npm install -g pnpm@12.3.4`; corepack is not present). No global `nx`; use `pnpm nx`.
- `node_modules` installed (Electron 44.2.0 binary downloaded by its postinstall; `allowBuilds` in `pnpm-workspace.yaml` lists what may run scripts). Playwright browsers are not installed (`pnpm exec playwright install` before `web-e2e`).
- Shell is PowerShell 5.1; Git Bash is also available. Long heredocs through Bash fail with ENAMETOOLONG on this machine; use the Write tool for large files.
- Git identity `Rotem <akunu11@gmail.com>` is set locally and matches the commit history.

## Things to re-check before the next code

- The two USDA live checks (§16 U6, U7) could not be re-run on 2026-09-08 (DEMO_KEY limit); run them with Rotem's real `USDA_FDC_KEY` when `data-access-usda` is built.
- `minimax/minimax-m3` provider list and pricing on OpenRouter (changes often; 12 providers on 2026-09-08).
- TheMealDB v2 key: Rotem adds it to `.env.local`; until then Discover shows one catalogue item (v2 test key behaviour, §3.3).
- OpenWeather's pricing page now says "One Call API 4.0" (record only; Open-Meteo is used).
- Nx 24 removes `nxViteTsPaths` and `nxCopyAssetsPlugin` (deprecation warnings on every Vite task); replace with `vite-tsconfig-paths` when upgrading.
- TypeScript 7 (when Nx and electron-vite declare support), Vite 8 (when electron-vite 6 ships), NestJS 12 (when `@nx/nest` allows it): all recorded in SPEC §11.1.
- Claude Opus 4.8 is a legacy model, retirement not before 2027-05-28; rule 7 needs a new ID when it retires. `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` needs Claude Code ≥ v2.1.257.
