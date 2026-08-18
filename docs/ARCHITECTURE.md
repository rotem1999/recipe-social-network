# Recipe Social Network — Architecture

**Status:** Draft for review · **Date:** 2026-08-18 · **Owner:** Rotem

This document is the design contract for the project. No application code has been written
yet — the intent is to agree on boundaries, the data model, and the workflow *before*
scaffolding, so that the scaffold is a mechanical translation of decisions already made.

Everything marked **Decision** is meant to be settled by review. Everything marked **Open**
still needs your call.

---

## 1. What we are building

A social network for cooking recipes, aimed at families and friend groups rather than the
open internet. Three things distinguish it from a recipe website:

1. **Sharing is scoped.** Recipes belong to circles (a family, a friend group), not to a
   global public feed. The default is private.
2. **Recipes have history.** A recipe is a living document. "Grandma's cholent, the way Dad
   makes it, with the change I made last Pesach" is a first-class concept, not a copy-paste.
3. **It behaves like an app, not a site.** Electron now, native iOS later — so the backend
   must be a clean API from day one, with no server-rendered coupling to any one client.

Point 2 is the architecturally interesting one and most of this document is downstream of it.

---

## 2. Technology decisions

### 2.1 Chosen stack

| Layer | Choice | Version at time of writing |
|---|---|---|
| Monorepo tooling | Nx | **23** (current since 2026-06-16) |
| Backend | NestJS + TypeScript | **11.x** now, v12 lands ~Q3 2026 |
| API docs | `@nestjs/swagger` → OpenAPI 3.1 | tracks Nest |
| ORM | TypeORM | **1.x** (1.0 shipped 2026-05-19) |
| Database | PostgreSQL | **18** (19 is in beta) |
| Frontend | React + Vite | React 19 / Vite 7 line |
| Desktop shell | Electron + electron-vite + electron-builder | Electron **43** |
| Backend tests | Jest (→ Vitest with Nest 12) + Testcontainers | — |
| Frontend tests | Vitest + React Testing Library | — |
| E2E | Playwright (web **and** Electron) | — |

### 2.2 Notes on each choice, including the ones that carry risk

**Nx 23 — good fit, and the module-boundary rules are the real reason.**
Nx's `@nx/enforce-module-boundaries` lint rule is what actually delivers the thing you want
from a monorepo: shared interfaces without the frontend and backend quietly growing into each
other. Tag-based rules are covered in §4.3. `nx affected` also keeps CI fast enough that
"Dev never breaks" is enforceable rather than aspirational.

**⚠️ Do NOT use the `nx-electron` plugin.** This is the one place where the obvious choice is
the wrong one. `nx-electron` pins itself to Nx major versions ("nx-electron 21.x is compatible
with Nx 21.y") and currently tops out around Nx 21 while Nx is on 23. Adopting it would mean
either holding the whole workspace back two majors or being blocked on a third-party
maintainer every time Nx ships. Since Electron releases every 8 weeks with roughly a 4-month
support window, that is a standing upgrade treadmill we cannot afford to have gated.

**Decision:** build the Electron shell with **electron-vite + electron-builder** directly, and
wire it into Nx with `nx:run-commands` targets. We give up a few generators and gain the
ability to upgrade Nx and Electron independently. This is maybe 60 lines of `project.json`.

**NestJS 11 now, with v12 on the horizon.** NestJS 12 is targeted for early Q3 2026 and is a
significant transition: full ESM across core packages, the CLI splitting into CJS and ESM
project modes, Webpack replaced by **Rspack**, new ESM projects defaulting to **Vitest** and
**oxlint**, and route decorators (`@Body()`, `@Query()`) gaining Standard Schema support so
Zod/Valibot work alongside `class-validator`.

Consequences for us, starting now:

- Do not write custom Webpack config or reach into Nest internals via deep imports. Those are
  the two things called out as breaking.
- Write validation against a thin adapter so a later move from `class-validator` to Zod is a
  contained change (see §6.3).
- Plan a v12 upgrade spike roughly one month after its release. It should be days, not weeks,
  if we avoid the two traps above.

**TypeORM 1.x — your choice, and it aged well.** TypeORM was a slightly risky pick for years;
it stopped being one in May 2026 when 1.0 shipped under new maintainers (575 PRs merged in
2025, 2,300+ issues closed). It is also the NestJS-native path, so `@nestjs/typeorm`,
repository injection, and the docs all line up.

Start on 1.x directly rather than 0.3 + migration. Things 1.0 changes that affect how we write
code from the first commit:

- `DataSource` everywhere; the global `getConnection()` helpers are gone.
- `null`/`undefined` in a query condition now **throws**. Use `IsNull()` explicitly. This is a
  good change and we should never suppress it.
- Non-nullable relations use `INNER JOIN` automatically — worth knowing when a query silently
  returns fewer rows than expected.
- Requires Node 20+ and ES2023.

**PostgreSQL 18.** Supported until 2030. We lean on `jsonb` (§5.4) and `citext`/unique indexes
for handles. Postgres 19 is in beta; no reason to chase it.

**Electron 43.** Latest stable, Chrome M150 / Node 24. The important architectural fact is the
cadence: a new major every 8 weeks, and only the newest minor of each major gets patches. Treat
Electron bumps as **scheduled recurring maintenance with a standing CI job**, not as
one-off chores that pile up. Security patches for a browser engine are not optional.

### 2.3 Open questions

- **Open:** Object storage for recipe photos. Local disk is fine for development; S3-compatible
  (Cloudflare R2 / MinIO) for anything real. Needed before the first image upload ships.
- **Open:** Hosting target for the API. Affects the migration/deploy step in §8 but nothing else.

---

## 3. System shape

```
┌──────────────────────────────┐        ┌──────────────────────────────┐
│  Electron desktop app        │        │  iOS app (later)             │
│  ┌────────────────────────┐  │        │                              │
│  │ main process (Node)    │  │        │  Swift / SwiftUI             │
│  │  · window lifecycle    │  │        │                              │
│  │  · OS keychain (token) │  │        │                              │
│  │  · auto-update         │  │        │                              │
│  └───────────┬────────────┘  │        └───────────────┬──────────────┘
│    contextBridge (preload)   │                        │
│  ┌───────────▼────────────┐  │                        │
│  │ renderer: React + Vite │  │                        │
│  └────────────────────────┘  │                        │
└──────────────┬───────────────┘                        │
               │              HTTPS / JSON              │
               └───────────────┬────────────────────────┘
                               ▼
                  ┌────────────────────────┐
                  │  NestJS API            │
                  │  · REST + OpenAPI 3.1  │
                  │  · JWT auth            │
                  │  · versioning domain   │
                  └───────────┬────────────┘
                              │
                  ┌───────────▼────────────┐   ┌──────────────────┐
                  │  PostgreSQL 18         │   │  Object storage  │
                  └────────────────────────┘   │  (recipe photos) │
                                               └──────────────────┘
```

**The renderer is a plain web app.** It talks to the API over HTTPS exactly as a browser would,
and reaches Electron only through a narrow preload bridge for genuinely desktop-only concerns
(secure token storage, native menus, offline cache location, auto-update). This is not
architectural purity for its own sake — it is what makes the iOS client cheap later, and it
means the whole frontend can be developed and tested in a browser without launching Electron.

**Rule:** no business logic in the Electron main process. If you find yourself writing recipe
rules there, it belongs in the API or in a shared library.

---

## 4. Repository topology

### 4.1 Layout

```
recipe-social-network/
├── apps/
│   ├── api/                    NestJS application (thin: bootstrap + wiring)
│   ├── api-e2e/                API-level end-to-end tests
│   ├── web/                    React renderer (Vite) — runs in a browser too
│   ├── web-e2e/                Playwright, against the browser build
│   ├── desktop/                Electron main + preload only
│   └── desktop-e2e/            Playwright Electron driver
├── libs/
│   ├── shared/
│   │   ├── domain/             Entities as plain types, enums, invariants. Zero deps.
│   │   ├── contracts/          Request/response DTOs shared by API and clients
│   │   └── versioning/         Diff/merge algorithms. Pure functions. Heavily tested.
│   ├── api/
│   │   ├── data-access-db/     TypeORM entities, migrations, DataSource config
│   │   ├── feature-auth/
│   │   ├── feature-recipes/
│   │   ├── feature-circles/
│   │   └── feature-social/     comments, cook logs, reactions
│   └── web/
│       ├── data-access-api/    Generated OpenAPI client + React Query hooks
│       ├── feature-recipe-editor/
│       ├── feature-feed/
│       └── ui/                 Design system primitives
├── docs/
│   ├── ARCHITECTURE.md         this file
│   └── adr/                    one file per significant decision, from here on
├── .github/workflows/
├── .env.example                committed
└── .env.local                  gitignored, never committed
```

### 4.2 `libs/shared/*` is the whole point of the monorepo — and its main hazard

These three libraries are consumed by **both** a Node process and a browser bundle. That
imposes constraints that must be enforced, not just remembered:

- `shared/domain` and `shared/contracts` must contain **no Node built-ins** (`fs`, `path`,
  `crypto`), no TypeORM decorators, and ideally no runtime dependencies at all — types, enums,
  constants, and pure guard functions only.
- The TypeORM entity for a `Recipe` is **not** the shared `Recipe` type. The entity lives in
  `libs/api/data-access-db` and maps to the shared type. Sharing entity classes across the
  boundary drags `reflect-metadata` and decorator semantics into the browser bundle and welds
  the API's storage schema to the client's view of the world.
- Watch the CJS/ESM seam. NestJS is CJS today and ESM from v12; the React side is ESM now.
  Shared libs should build to both, or be authored so that `require(esm)` in modern Node
  handles it. Keeping them dependency-free makes this a non-issue.

**`shared/versioning` is the crown jewel.** Diffing two recipe versions and detecting conflicts
is logic the editor needs for live preview and the server needs for validation. Writing it once,
as pure functions with no I/O, is the single highest-value thing this monorepo buys us.

### 4.3 Enforced boundaries

Every project gets tags, and `@nx/enforce-module-boundaries` turns the architecture into a lint
error rather than a code review argument:

| Tag | Applies to | May depend on |
|---|---|---|
| `scope:shared` | `libs/shared/*` | `scope:shared` only |
| `scope:api` | `apps/api`, `libs/api/*` | `scope:api`, `scope:shared` |
| `scope:web` | `apps/web`, `libs/web/*` | `scope:web`, `scope:shared` |
| `scope:desktop` | `apps/desktop` | `scope:shared` |
| `type:feature` | feature libs | `type:data-access`, `type:ui`, `type:util` |
| `type:data-access` | data libs | `type:util` |
| `type:ui` | UI libs | `type:ui`, `type:util` |
| `type:util` | utilities | `type:util` |

The consequential rules: **web can never import api, api can never import web, and nothing may
import a feature library.** `scope:desktop` deliberately cannot reach `scope:web` — the shell
must not know about React components.

---

## 5. Data model

### 5.1 The versioning approach, and why not "just use git"

Recipes are small — a few kilobytes of text. That single fact drives the design.

**Decision: immutable version snapshots + a mutable HEAD pointer. Full content per version, no
delta encoding, no content-addressed object store.**

A recipe with 200 revisions costs a few hundred kilobytes. Building a git-like object database
to save that is enormous accidental complexity for zero benefit, and it would make ordinary
queries ("show me the current version of every recipe in this circle") require walking a chain
instead of a single indexed lookup. Diffs are computed on read; they are cheap on documents
this size and they are never the thing a user is waiting on.

What we keep from git is the *conceptual model*, because it is genuinely the right one:
immutable commits, a parent chain, forks with preserved lineage, and a proposal/merge flow.
What we discard is the storage machinery.

### 5.2 Core tables

```
user
  id, handle (citext unique), email (citext unique), display_name,
  avatar_url, password_hash, created_at

circle                          -- a family or friend group; the sharing boundary
  id, name, slug, created_by, created_at

circle_membership
  circle_id, user_id, role (owner|admin|member), joined_at
  PK (circle_id, user_id)

recipe                          -- IDENTITY + POINTER. Holds no content.
  id, owner_id, circle_id (nullable),
  head_version_id  -> recipe_version.id,
  forked_from_version_id (nullable) -> recipe_version.id,
  visibility (private|circle|public),
  slug, created_at, archived_at

recipe_version                  -- IMMUTABLE SNAPSHOT. Never UPDATEd.
  id, recipe_id, parent_version_id (nullable), author_id,
  version_number (int, per recipe),
  title, summary, servings, prep_minutes, cook_minutes, difficulty,
  ingredients (jsonb),          -- see §5.4
  steps (jsonb),
  notes, image_refs (jsonb),
  change_note,                  -- "used less salt" — the commit message
  created_at
  UNIQUE (recipe_id, version_number)

change_proposal                 -- pull request, for recipes you do not own
  id, recipe_id, proposed_version_id, base_version_id,
  author_id, status (open|merged|rejected|withdrawn),
  title, body, resolved_by, resolved_at, created_at

comment
  id, recipe_id, version_id (nullable), proposal_id (nullable),
  author_id, parent_comment_id, body, created_at, edited_at

cook_log                        -- "I made this" — the core social signal
  id, recipe_id, version_id, user_id,
  rating (1-5, nullable), notes, photo_refs (jsonb), cooked_at
```

### 5.3 How the model answers the interesting questions

**"Show me the recipe."** One indexed join: `recipe → head_version_id`. No chain walking. This
is the hot path and it stays fast forever.

**"What changed since last time?"** Both versions are complete documents; `shared/versioning`
diffs them in memory. No history reconstruction.

**"Grandma's cholent, my version."** Fork creates a *new* `recipe` row whose
`forked_from_version_id` points into Grandma's chain. The fork gets its own independent
history, and lineage is permanently recoverable — the app can always show "forked from
Sarah's Cholent, v7". This is the feature that makes the product feel like a family
archive rather than a folder of duplicates.

**"My mother edited the recipe we share."** Editing a recipe you own appends a version and
moves HEAD. Editing one you *don't* own opens a `change_proposal` — the owner sees a diff and
merges or rejects. Merging appends the proposed version to the real chain and moves HEAD.

**"Rated 5 stars" — of what, exactly?** `cook_log` points at a specific `version_id`, so
ratings attach to the version actually cooked. When a recipe changes materially, the UI can
distinguish "23 people rated the current version" from "and 40 rated earlier versions." A
recipe site that loses this ends up with ratings that describe a document nobody can read
anymore.

**Concurrent edits.** Every write submits the `parent_version_id` it was based on. If HEAD has
moved, the API returns **409 Conflict** with both versions and the client shows a merge view.

**Decision:** no automatic three-way merge in v1. Recipes are prose and ordered steps; a silently
mis-merged ingredient list is worse than an honest conflict prompt. Revisit once
`shared/versioning` has real usage data behind it.

### 5.4 Ingredients: `jsonb` now, normalized projection later

Ingredients live as `jsonb` inside the version snapshot:

```json
[{ "quantity": 2.5, "unit": "cup", "item": "flour", "note": "sifted", "group": "Dough" }]
```

This is right for v1: the snapshot stays genuinely immutable and self-contained, ingredient
groups and free-form notes ("a good glug of oil") survive without schema gymnastics, and
rendering needs no joins.

It is wrong the moment we want "recipes containing tahini but not nuts," unit conversion, or
generated shopping lists across recipes. At that point add a **normalized projection** —
`ingredient` (canonical, deduplicated) and `recipe_version_ingredient` (join) — rebuilt on
version write. The jsonb stays the source of truth; the tables are a derived index.

**Decision:** jsonb only in v1. **Trigger to revisit:** the first feature requiring
cross-recipe ingredient search. Do not build it speculatively — canonicalizing "2 cups flour"
into a normalized ingredient graph is a much larger project than it appears, and it is
worthless until a feature needs it.

### 5.5 Migrations

- `synchronize: false` in every environment, without exception. Schema changes only via
  generated, reviewed, committed TypeORM migrations.
- Migrations run as a **discrete deploy step**, never on application boot. Boot-time migration
  in a multi-instance deploy is a race condition waiting to happen.
- **Expand/contract** for anything destructive: add the new column, backfill, ship code using
  it, drop the old column in a *later* release. This is what allows a rollback of Dev without a
  database restore, which is what makes "Dev always works" true in practice.

---

## 6. API design

### 6.1 Shape

REST over HTTPS, JSON, `/api/v1` prefix. Resource-oriented, with the version-control verbs
modeled as sub-resources:

```
POST   /api/v1/recipes                          create (creates v1 + recipe)
GET    /api/v1/recipes/:id                      current version (HEAD)
GET    /api/v1/recipes/:id/versions             history
GET    /api/v1/recipes/:id/versions/:n          a specific version
POST   /api/v1/recipes/:id/versions             append version (needs parent_version_id)
GET    /api/v1/recipes/:id/diff?from=3&to=7     computed diff
POST   /api/v1/recipes/:id/fork                 fork from a version
POST   /api/v1/recipes/:id/revert               append a version equal to an older one
POST   /api/v1/recipes/:id/proposals            open a change proposal
POST   /api/v1/proposals/:id/merge              owner merges
GET    /api/v1/circles/:id/feed                 activity feed
POST   /api/v1/recipes/:id/cook-logs            "I made this"
```

Note `revert` **appends** rather than deletes. History is append-only; there is no destructive
operation on `recipe_version` anywhere in the API.

### 6.2 OpenAPI is generated, and the client is generated from it

`@nestjs/swagger` produces `openapi.json` from the controllers. A build step generates the
typed client into `libs/web/data-access-api`. Neither the spec nor the client is hand-written.

**CI check:** regenerate the spec and fail the build if it differs from the committed
`openapi.json`. Without this, generated artifacts drift and the guarantee quietly evaporates.

### 6.3 Validation

`class-validator` + `ValidationPipe` with `whitelist: true` and `forbidNonWhitelisted: true`
today. Given that Nest 12 brings Standard Schema support to `@Body()`/`@Query()`, keep
validation rules in DTO classes under `shared/contracts` and avoid scattering bespoke
validation logic through services, so the eventual move to Zod is mechanical.

### 6.4 Authentication

- Short-lived JWT access tokens (~15 min) + rotating refresh tokens.
- Refresh tokens stored **hashed** server-side, single-use, with reuse detection that revokes
  the family. This is what turns a stolen token from a permanent compromise into a detectable
  one.
- Authorization is per-circle and per-recipe. A Nest guard resolves the caller's relationship
  to the resource (`owner | circle-member | public | none`) once per request; controllers never
  reimplement it.

---

## 7. Electron shell

### 7.1 Security posture — non-negotiable

| Setting | Value | Why |
|---|---|---|
| `contextIsolation` | `true` | Renderer cannot touch Electron internals |
| `nodeIntegration` | `false` | No Node API in renderer, ever |
| `sandbox` | `true` | Renderer runs in the OS sandbox |
| `webSecurity` | `true` | Never disable, including in dev |
| CSP | strict, no `unsafe-inline` | Renderer loads remote data |
| `shell.openExternal` | allowlisted schemes only | Prevents arbitrary command execution |
| `will-navigate` / `setWindowOpenHandler` | blocked by default | Stops the app being navigated away |

Every IPC channel exposed through `contextBridge` is treated as a **public, hostile-input API**:
explicit channel names (never a generic `invoke(channel, ...args)` passthrough), argument
validation in the main process, and no path or command arguments accepted from the renderer.

### 7.2 Token storage

Refresh tokens go in the OS keychain via Electron's `safeStorage` API, held by the **main**
process and never exposed to the renderer. `localStorage` is not acceptable for a refresh
token in a desktop app — any XSS in the renderer becomes persistent account compromise. The
renderer holds the short-lived access token in memory only.

### 7.3 Build and packaging

`electron-vite` for dev and build, `electron-builder` for distributables, both driven by Nx
`run-commands` targets (see §2.2). Auto-update via `electron-updater` against GitHub Releases,
which fits the branching model in §8: only `master` publishes updates.

---

## 8. Version control and CI

### 8.1 Branching

```
master   protected, stable, released, tagged, auto-update source
  ▲
  │ release PR only
  │
Dev      protected, integration, always green
  ▲
  │ squash merge, PR only
  │
feature/recipe-forking      fix/version-diff-off-by-one      chore/bump-electron
```

Branch naming: `feature/*`, `fix/*`, `chore/*`, `docs/*` — all cut from `Dev`, all merged back
to `Dev`.

### 8.2 What makes "Dev never breaks" actually true

Intent is not a mechanism. These are the mechanisms:

1. **Branch protection on both `Dev` and `master`:** no direct pushes, PR required, required
   status checks must pass, branches must be up to date before merge, linear history, no force
   push, no deletion.
2. **PR pipeline:** `nx affected -t lint typecheck test build` on the merge result, not the
   branch tip.
3. **Integration tests against real Postgres** via Testcontainers. Not sqlite — TypeORM's
   behaviour differs enough (jsonb, citext, transaction semantics) that a green sqlite suite
   proves very little.
4. **Migration check:** every PR touching entities must include a migration; a job asserts the
   generated migration is empty after applying the committed ones.
5. **OpenAPI drift check** (§6.2).
6. **Squash merge into `Dev`**, so every commit on `Dev` is one reviewed, CI-green unit and
   `git revert` of a bad feature is a single clean operation.

Nightly on `Dev`: the full E2E suite including the packaged Electron build, which is too slow
for per-PR.

### 8.3 Releases

`Dev → master` via a release PR. Tag on `master` triggers `electron-builder` packaging and
publishes to GitHub Releases; the API deploys from the same tag. Since auto-update points only
at `master`, users never receive a Dev build.

### 8.4 Secrets

- `.env.local` — gitignored, never committed, never logged.
- `.env.example` — committed, every key present with a placeholder and a comment.
- Config validated **at boot against a schema**; the process refuses to start on a missing or
  malformed key. A service that boots with a silently absent secret and fails on first request
  is far worse than one that refuses to start.
- CI/CD secrets live in GitHub Actions secrets. **No secret ever reaches the renderer or an
  Electron build artifact** — anything shipped in the app is public by definition, so the
  desktop app gets only non-secret config such as the API base URL.
- `gitleaks` (or equivalent) in the PR pipeline as a backstop.

---

## 9. Testing strategy

| Layer | Tool | Scope |
|---|---|---|
| `shared/versioning` | Vitest + **fast-check** | Property-based. The correctness core. |
| `shared/domain` | Vitest | Invariants and guards |
| API unit | Jest → Vitest at Nest 12 | Services with mocked repositories |
| API integration | Jest + **Testcontainers** | Real Postgres, real migrations, real TypeORM |
| Web unit | Vitest + Testing Library | Components and hooks |
| Web E2E | Playwright | Browser build of `apps/web` |
| Desktop E2E | Playwright Electron | Packaged shell: IPC, keychain, updater |

Two deliberate emphases:

**Property-based tests on the versioning library.** Invariants like *applying a diff from A to
B to A yields B*, *diff(x, x) is empty*, and *fork lineage is never lost* are exactly what
property testing is for, and this is the code where a subtle bug corrupts users' family
recipes irreversibly.

**Real Postgres in integration tests.** See §8.2 item 3.

Coverage thresholds are enforced on `shared/*` and API services, and deliberately not on
`apps/*` bootstrap code, where coverage numbers measure nothing useful.

---

## 10. Build order

A suggested sequence, each step leaving `Dev` releasable:

1. **Workspace skeleton** — Nx 23, all projects generated, boundary tags and lint rules wired,
   CI green on an empty test suite. Prove the pipeline before writing features.
2. **`shared/domain` + `shared/versioning`** — pure logic with property tests, no I/O, no
   framework. Buildable and testable in isolation.
3. **Persistence + auth** — entities, first migration, Testcontainers harness, JWT with refresh
   rotation.
4. **Recipe CRUD with versioning** — append-only versions, HEAD pointer, diff endpoint. The
   product's spine.
5. **Circles and permissions** — the sharing model, plus the authorization guard.
6. **Web renderer** — generated API client, recipe editor with live diff, history view.
7. **Electron shell** — security settings from §7.1, `safeStorage` tokens, packaging, updater.
8. **Social layer** — forks, change proposals, comments, cook logs, circle feed.

Steps 1–2 are worth taking slowly. Everything after is much cheaper if the boundaries and the
versioning core are right, and much more expensive if they are not.

---

## 11. Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| `nx-electron` lags Nx majors | Blocks all Nx upgrades | Avoid it; drive electron-vite via `run-commands` (§2.2) |
| NestJS 12 ESM/Rspack transition | Rework of build config | No custom Webpack config, no deep imports; spike a month after release |
| Electron's 8-week cadence | Unpatched Chromium in a shipped app | Standing scheduled upgrade job; treat as recurring maintenance |
| Shared libs leaking Node deps into the browser | Broken web build, bloated bundle | Boundary lint rules + zero-dependency `shared/*` |
| Ingredient normalization built too early | Large sunk cost, no user value | Explicit deferral with a named trigger (§5.4) |
| Auto-merge corrupting recipes | Irreversible loss of family data | No auto-merge in v1; honest 409 conflicts |
| Migration on boot | Race conditions on multi-instance deploy | Migrations as a discrete deploy step (§5.5) |

---

## 12. Decisions needing your sign-off

1. **Reject `nx-electron`** in favour of electron-vite + electron-builder via `run-commands`.
   The most consequential call in this document.
2. **Snapshot-per-version storage**, no delta encoding or content-addressed store.
3. **No automatic merge in v1** — conflicts surface to the user.
4. **Ingredients as `jsonb`**, normalized projection explicitly deferred.
5. **Change proposals** as the mechanism for editing recipes you don't own.
6. **Circles** as the sharing boundary, private by default.
7. **NestJS 11 now**, with an explicit v12 upgrade budgeted for ~Q4 2026.

Once these are settled, the scaffold in §10 step 1 is mechanical.

---

## Sources

- [Nx Release Schedule and Support Policy](https://nx.dev/docs/reference/releases)
- [nx-electron (bennymeg/nx-electron)](https://github.com/bennymeg/nx-electron)
- [NestJS v12 is Coming — Trilon](https://trilon.io/blog/nestjs-12-is-coming)
- [NestJS v12 Roadmap — InfoQ](https://www.infoq.com/news/2026/04/nestjs-12-roadmap-esm/)
- [TypeORM 1.0 is here](https://typeorm.io/blog/typeorm-1-0/)
- [TypeORM Reaches 1.0 — InfoQ](https://www.infoq.com/news/2026/06/typeorm-1-released/)
- [Electron release/EOL data](https://endoflife.date/electron)
- [PostgreSQL release/EOL data](https://endoflife.date/postgresql)
- [electron-vite](https://electron-vite.org/)
- [NestJS on Nx](https://nx.dev/docs/technologies/node/nest)
