# MEM.md — session handoff notes

Written 2026-09-08 at the end of the first session; updated 2026-09-08 at the end of the tooling session (the third). Read this, SPEC.md, and `.claude/README.md` before doing anything. INTENT.txt is history: everything in it is reflected in SPEC.md (Rotem, 2026-09-08).

## Working rules (from Rotem, non-negotiable)

1. **SPEC.md is the scaffolding.** Never write code from a chat prompt. A request first changes SPEC.md; code is built from SPEC.md.
2. **Never assume.** If SPEC.md does not say it, ask Rotem directly in chat. Do not write questions, "open", "proposed", or "TBD" markers into SPEC.md. SPEC.md holds only settled architecture and requirements.
3. **Verify online before presenting.** Every third-party fact (versions, limits, licences, endpoints) needs a source URL fetched that day. SPEC.md §16 is the source list; re-verify before scaffolding, the facts there were checked on 2026-09-08.
4. Deleted files (the old README.md and docs/ARCHITECTURE.md from git history) are out of scope. Do not use them as a source.
5. Per-folder CLAUDE.md constraints are Rotem's. They exist now (written 2026-09-08 in the second session); do not invent or edit constraints, ask Rotem for the sentence.
6. **Commits go through the local git CLI**, configured with Rotem's identity, so they count as Rotem's contributions on GitHub. No Co-Authored-By or "Generated with" lines anywhere. PRs, if needed, are opened through the GitKraken MCP tools. (Rotem, 2026-09-08)
7. **Every subagent runs on Claude Opus 4.8** (`claude-opus-4-8`), never Fable. Enforced by the `env` block in `.claude/settings.json` and by `model:` in every `.claude/agents/*.md`. (Rotem, 2026-09-08)
8. **Unit tests are written only by the `test-writer` subagent.** The main session never writes or edits a `*.spec.ts(x)` file; the PreToolUse guard denies it. (Rotem, 2026-09-08)

## App name

Working name is **CookBook** (Rotem, 2026-09-08), chosen as a placeholder after a search found every short cooking word (Ladle, Mise, Simmer, Stovetop, Potluck, Foodkin, PanPal) already taken by existing apps. Names that came back clean if a rename is wanted later: Supperkin, Forkfolk, Tablekin (no app, no npm package found on 2026-09-08). Repo name and the `@rsn` alias are unchanged.

## State of the repository

- Branch `master`, remote `origin` = https://github.com/rotem1999/recipe-social-network.git. Last pushed commit `67c1412` (docs: set working app name to CookBook).
- Committed: INTENT.txt, SPEC.md (Draft 2, complete, no open items, title CookBook), .env.example (predates SPEC; regenerate from SPEC §14 when keys are settled), .gitignore, root CLAUDE.md, this file, and the folder skeleton of SPEC §11.3 (`apps/`, `libs/`, `docker/`) holding only a CLAUDE.md per folder.
- **Uncommitted:** `.claude/` (the Claude Code tooling, see below) and `design_handoff_potluck_ui/` (appeared 2026-09-08; Rotem said to ignore it for now, it is not part of the build).
- No application code exists yet. No `package.json`, `nx.json` or `tsconfig.base.json` yet.
- Six commits before `534cb8d` carry `Co-Authored-By` trailers from before rule 6 existed. History is pushed and was left alone.

## Tooling (`.claude/`, added 2026-09-08)

Full description and the doc sources in `.claude/README.md`. In short: five subagents (`spec-guardian`, `fact-verifier`, `arch-reviewer`, `test-runner`, `test-writer`), five skills (`/spec-change`, `/reverify-sources`, `/nx-project`, `/commit`, `/handoff`), and a PreToolUse guard (`.claude/hooks/guard.js`, Node via Git Bash) that denies env-file access, signed commits, `gh pr create`, TBD or questions in SPEC.md, provider keys or URLs in web, desktop and shared code, and spec files written outside `test-writer`; it asks before CLAUDE.md edits, amends and force pushes. Skills and hooks load at session start, so `/handoff` and the others are usable from the next session on. The guard was tested with 30 cases on 2026-09-08 and is active.

## Next step (Rotem's plan)

Rotem: the tooling was "the last step before writing code" (2026-09-08). In order:

1. Commit `.claude/` (`/commit`), leaving `design_handoff_potluck_ui/` untracked.
2. `/reverify-sources all`: re-check SPEC §16 and §11.1 and the four items under "Things to re-check".
3. Ask Rotem the generator flags SPEC.md does not settle (buildable or publishable libraries, linter, strictness, e2e options, compiler) and write the answers into SPEC §11.2 before the first `/nx-project`.
4. Create the workspace (`npx create-nx-workspace@latest`, pnpm) and generate the projects of SPEC §11.3 with `/nx-project`, one at a time, CLAUDE.md files untouched.

## Decisions that live only in chat history (all are also in SPEC.md, listed here for speed)

- Auth: username + password in PostgreSQL, backend JWT. Firebase Auth and Google sign-in dropped.
- Images: Cloud Storage for Firebase, Blaze plan already active, backend-only through the Admin SDK, signed URLs for display, no Firebase SDK or key in the desktop app.
- AI: paid `minimax/minimax-m3` on OpenRouter through one server key (account has about $11 credits). 100 requests per user per day. No chat history saved. Prompts written to conserve tokens. Every prompt and response logged to `<project root>/log/`, one JSON file per day.
- Weather: Open-Meteo. Location from the OS timezone only (city segment geocoded). No IP lookup, no browser geolocation.
- Recipes: title + short description, structured ingredients, steps with optional timer, optional prep/cook minutes, one category from TheMealDB's 14, servings (default 2 for TheMealDB imports). Owner has full control; versioning, all versions public if the recipe is public; saved public recipes are local copies that fork on edit with attribution; shared recipes are view-only but cookable.
- Social: mutual friend requests, find by username or email; whole-star 1–5 ratings, average shown in quarter steps with decimal on hover; Reddit-style up/down comment votes; up to 3 favourite categories pinned in Discover.
- Toolchain: Nx 23 monorepo, pnpm, alias `@rsn/<scope>/<type>-<name>`, NestJS 11.2.3 CommonJS + Jest (NestJS 12 is outside `@nx/nest`'s peer range), electron-vite via `nx:run-commands` (`nx-electron` is pinned to Nx 22), Vitest 5 + React Testing Library for the renderer, `@wdio/electron-service` for Electron e2e, targets Windows/macOS/Linux, API and Postgres on Rotem's PC for now.

Decisions of 2026-09-08 (tooling session) that are not product decisions and therefore live in `.claude/README.md`, not SPEC.md: subagent model Opus 4.8 (rule 7), unit tests by subagent only (rule 8), the guard rules, the pre-allowed read-only commands.

## Local machine facts (checked 2026-09-08)

- PostgreSQL 18.6 at `C:\Program Files\PostgreSQL\18`, service `postgresql-x64-18` running, port 5432. `psql` is not on PATH.
- Node v26.5.0 (Current line, not LTS; SPEC names Node 24 Active LTS as the reference; re-confirmed 2026-09-08 in the tooling session), npm 11.17.0, git 2.54.0.windows.1.
- pnpm is not installed. No global `nx`.
- Shell is PowerShell 5.1; Git Bash is also available. Long heredocs through Bash fail with ENAMETOOLONG on this machine, use the Write tool for large files. A Bash command that redirects output and mentions a spec file name anywhere is denied by the guard; use the Write tool there too.
- Git identity `Rotem <akunu11@gmail.com>` is set locally and matches the commit history.

## Things to re-check before scaffolding

- Whether `@nx/nest`, NestJS 11, and electron-vite work under TypeScript 7.0 (native compiler); not verified.
- Whether Nx 23 supports Node 26, or whether Rotem wants Node 24 LTS installed.
- `minimax/minimax-m3` provider list and pricing on OpenRouter (changes often).
- TheMealDB v2 key: Rotem adds it to `.env` later; `.env.example` still points at v1.
- Claude Opus 4.8 is a legacy model, retirement not before 2027-05-28 (platform.claude.com, 2026-09-08); rule 7 needs a new ID when it retires.
