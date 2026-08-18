# Recipe Social Network — Architecture

**Status:** Draft for review · **Revision 3, 2026-08-18** · **Owner:** Rotem

This document is the design contract for the project. No application code has been written
yet — the intent is to agree on boundaries, the data model, and the workflow *before*
scaffolding, so that the scaffold is a mechanical translation of decisions already made.

Revision 2 incorporated the full feature description (URL import, discover, pinning, nutrition,
cooking mode, ratings and comments) and the research findings on the external APIs. **Several of
the originally-specified services do not work as their marketing implies** — §5 documents what was
verified and what changed as a result.

Revision 3 adds the weather-aware recipe recommendation (§6.11), the weather and location sources
behind it (§5.6, §5.7), and a record of the licence obligations the stack carries (§5.8).

Everything marked **Decision** is settled. Everything marked **Open** still needs a call.

---

## 1. What we are building

A social network for cooking recipes, aimed at families and friend groups rather than the open
internet. Four things distinguish it from a recipe website:

1. **Sharing is scoped.** Recipes belong to circles (a family, a friend group), not to a global
   public feed by default. Private is the default; publishing globally is a deliberate act.
2. **Recipes have history.** "Grandma's cholent, the way Dad makes it, with the change I made
   last Pesach" is a first-class concept, not a copy-paste.
3. **Recipes come from anywhere.** Written by hand, imported from any recipe URL, or discovered
   in a public catalogue and kept.
4. **It helps while you cook.** A step-by-step cooking mode with a model that already knows the
   recipe and which step you're on, without you having to explain either.

### 1.1 The three surfaces

**My Recipes** — everything the user owns or has kept: recipes they wrote, recipes imported from
a URL, and pinned public recipes. This is the app's home.

**Discover** — a single feed mixing recipes published by other users of the network with results
from a public recipe catalogue, each tagged with its origin. Public catalogue recipes are *not*
stored in our database unless the user pins them.

**Cooking mode** — entered from a recipe the user owns. Shows the ingredient list, then walks
the steps one at a time, with an always-available question box wired to a model that receives
the recipe and the user's current position automatically.

**"What should I cook?"** — an opt-in suggestion drawn from the weather and season where the user
is, choosing **only from recipes they have saved**. It never proposes something they don't
already have. §6.11.

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
Nx's `@nx/enforce-module-boundaries` lint rule is what actually delivers the thing you want from
a monorepo: shared interfaces without the frontend and backend quietly growing into each other.
Tag-based rules are covered in §4.3. `nx affected` also keeps CI fast enough that "Dev never
breaks" is enforceable rather than aspirational.

**⚠️ Do NOT use the `nx-electron` plugin.** This is the one place where the obvious choice is the
wrong one. `nx-electron` pins itself to Nx major versions ("nx-electron 21.x is compatible with
Nx 21.y") and currently tops out around Nx 21 while Nx is on 23. Adopting it would mean either
holding the whole workspace back two majors or being blocked on a third-party maintainer every
time Nx ships. Since Electron releases every 8 weeks with roughly a 4-month support window, that
is a standing upgrade treadmill we cannot afford to have gated.

**Decision:** build the Electron shell with **electron-vite + electron-builder** directly, wired
into Nx with `nx:run-commands` targets. We give up a few generators and gain the ability to
upgrade Nx and Electron independently. This is roughly 60 lines of `project.json`.

**NestJS 11 now, with v12 on the horizon.** NestJS 12 is targeted for early Q3 2026: full ESM
across core packages, the CLI splitting into CJS and ESM modes, Webpack replaced by **Rspack**,
new ESM projects defaulting to **Vitest** and **oxlint**, and route decorators (`@Body()`,
`@Query()`) gaining Standard Schema support so Zod/Valibot work alongside `class-validator`.

Consequences, starting now:

- Do not write custom Webpack config or reach into Nest internals via deep imports. Those are
  the two things called out as breaking.
- Keep validation behind a thin adapter so a later move to Zod is contained (§7.3).
- Budget a v12 upgrade spike roughly one month after release.

**TypeORM 1.x — your choice, and it aged well.** TypeORM was a slightly risky pick for years; it
stopped being one in May 2026 when 1.0 shipped under new maintainers (575 PRs merged in 2025,
2,300+ issues closed). It is also the NestJS-native path.

Start on 1.x directly rather than 0.3 + migration. Things that affect how we write code from the
first commit:

- `DataSource` everywhere; the global `getConnection()` helpers are gone.
- `null`/`undefined` in a query condition now **throws**. Use `IsNull()` explicitly. Never
  suppress this.
- Non-nullable relations use `INNER JOIN` automatically — worth knowing when a query silently
  returns fewer rows than expected.
- Requires Node 20+ and ES2023.

**PostgreSQL 18.** Supported until 2030. We lean on `jsonb` (§6.6) and `citext` for handles.

**Electron 43.** Latest stable, Chrome M150 / Node 24. The important fact is the cadence: a new
major every 8 weeks, and only the newest minor of each major gets patches. Treat Electron bumps
as **scheduled recurring maintenance with a standing CI job**. Security patches for a browser
engine are not optional.

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
│  │  + local read cache    │  │                        │
│  └────────────────────────┘  │                        │
└──────────────┬───────────────┘                        │
               │              HTTPS / JSON              │
               └───────────────┬────────────────────────┘
                               ▼
        ┌──────────────────────────────────────────┐
        │  NestJS API — the only outbound caller   │
        │  · REST + OpenAPI 3.1                    │
        │  · JWT auth                              │
        │  · versioning domain                     │
        │  · integration layer + caches + quotas   │
        └───┬──────────┬──────────┬────────────┬───┘
            │          │          │            │
    ┌───────▼──┐  ┌────▼─────┐ ┌──▼────────┐ ┌─▼──────────────┐
    │ Postgres │  │TheMealDB │ │ USDA FDC  │ │  OpenRouter    │
    │    18    │  │ discover │ │ nutrition │ │  import + chat │
    └──────────┘  └──────────┘ └───────────┘ └────────────────┘
                       │
              ┌────────▼─────────┐
              │ arbitrary recipe │  (server-side fetch for URL import)
              │  websites        │
              └──────────────────┘
```

### 3.1 Why the backend is the only outbound caller

You specified this and it is right, for four reasons worth writing down because they will be
questioned later when someone wants to "just call it from the frontend":

1. **An Electron renderer is fully inspectable.** Anything shipped in it — including an API key
   in an environment variable baked at build time — is public. There is no such thing as a
   secret in a desktop client.
2. **Caching only works in one place.** The USDA ingredient cache (§6.6) is what makes nutrition
   viable at all. If clients called the API directly, every user would rebuild that cache from
   scratch and we would burn the rate limit many times over.
3. **Quotas need a chokepoint.** The OpenRouter free-tier caps in §5.3 are *per account*, not
   per user. Enforcing a fair per-user budget is only possible server-side.
4. **The future iOS client gets the same contract for free**, and an upstream API change becomes
   a server deploy rather than a forced app update on every user's machine.

**Rule:** no business logic in the Electron main process. If you find yourself writing recipe
rules there, it belongs in the API or in a shared library.

---

## 4. Repository topology

### 4.1 Layout

```
recipe-social-network/
├── apps/
│   ├── api/                        NestJS application (thin: bootstrap + wiring)
│   ├── api-e2e/
│   ├── web/                        React renderer (Vite) — runs in a browser too
│   ├── web-e2e/                    Playwright, against the browser build
│   ├── desktop/                    Electron main + preload only
│   └── desktop-e2e/                Playwright Electron driver
├── libs/
│   ├── shared/
│   │   ├── domain/                 Entities as plain types, enums, invariants. Zero deps.
│   │   ├── contracts/              Request/response DTOs shared by API and clients
│   │   ├── versioning/             Diff/merge algorithms. Pure. Heavily tested.
│   │   ├── recipe-import/          schema.org JSON-LD → domain mapping. Pure.
│   │   ├── nutrition/              Unit parsing + volume→mass conversion. Pure.
│   │   └── recommendation/         Weather→recipe scoring rules. Pure.
│   ├── api/
│   │   ├── data-access-db/         TypeORM entities, migrations, DataSource config
│   │   ├── feature-auth/
│   │   ├── feature-recipes/
│   │   ├── feature-circles/
│   │   ├── feature-discover/       feed composition over internal + external sources
│   │   ├── feature-cooking/        cooking sessions + AI context assembly
│   │   ├── feature-recommend/      weather-aware suggestion over saved recipes
│   │   ├── feature-social/         ratings, comments
│   │   ├── integration-mealdb/     ┐
│   │   ├── integration-usda/       │
│   │   ├── integration-openmeteo/  ├ anti-corruption layer — see §4.4
│   │   ├── integration-openrouter/ │
│   │   └── integration-webfetch/   ┘ SSRF-guarded URL fetching
│   └── web/
│       ├── data-access-api/        Generated OpenAPI client + React Query hooks
│       ├── feature-recipe-editor/
│       ├── feature-discover/
│       ├── feature-cooking/
│       ├── feature-recommend/
│       └── ui/                     Design system primitives
├── docs/
│   ├── ARCHITECTURE.md             this file
│   └── adr/                        one file per significant decision, from here on
├── .github/workflows/
├── .env.example                    committed
└── .env.local                      gitignored, never committed
```

### 4.2 `libs/shared/*` is the whole point of the monorepo — and its main hazard

These libraries are consumed by **both** a Node process and a browser bundle. That imposes
constraints that must be enforced, not just remembered:

- `shared/domain` and `shared/contracts` must contain **no Node built-ins** (`fs`, `path`,
  `crypto`), no TypeORM decorators, and ideally no runtime dependencies at all — types, enums,
  constants, and pure guard functions only.
- The TypeORM entity for a `Recipe` is **not** the shared `Recipe` type. The entity lives in
  `libs/api/data-access-db` and maps to the shared type. Sharing entity classes across the
  boundary drags `reflect-metadata` into the browser bundle and welds the API's storage schema
  to the client's view of the world.
- Watch the CJS/ESM seam. NestJS is CJS today and ESM from v12; React is ESM now. Keeping shared
  libs dependency-free makes this a non-issue.

**Three crown jewels.** `shared/versioning`, `shared/recipe-import` and `shared/nutrition` are all
pure, I/O-free, and needed on both sides — the editor wants a live diff and a live calorie
estimate; the server wants to validate both. Writing them once is the single highest-value thing
this monorepo buys us, and being pure functions makes them the easiest code in the project to
test exhaustively.

### 4.3 Enforced boundaries

Every project gets tags, and `@nx/enforce-module-boundaries` turns the architecture into a lint
error rather than a code review argument:

| Tag | Applies to | May depend on |
|---|---|---|
| `scope:shared` | `libs/shared/*` | `scope:shared` only |
| `scope:api` | `apps/api`, `libs/api/*` | `scope:api`, `scope:shared` |
| `scope:web` | `apps/web`, `libs/web/*` | `scope:web`, `scope:shared` |
| `scope:desktop` | `apps/desktop` | `scope:shared` |
| `type:feature` | feature libs | `type:data-access`, `type:integration`, `type:ui`, `type:util` |
| `type:integration` | integration libs | `type:util` |
| `type:data-access` | data libs | `type:util` |
| `type:ui` | UI libs | `type:ui`, `type:util` |
| `type:util` | utilities | `type:util` |

The consequential rules: **web can never import api, api can never import web, nothing may import
a feature library, and an integration library may not import a feature library.** `scope:desktop`
deliberately cannot reach `scope:web` — the shell must not know about React components.

### 4.4 Integration libraries are an anti-corruption layer

Each `integration-*` library owns one external service and exposes **only domain types**. No
external DTO ever escapes it.

This is not ceremony. TheMealDB returns a 40-field flat object with ingredients and measures in
*parallel numbered fields* (`strIngredient1..20`, `strMeasure1..20`), a single `strInstructions`
text blob, and no servings field. USDA returns nutrients as numeric IDs. Letting either shape
leak into the domain would poison every layer above it. The mapping is ugly, it lives in exactly
one file per service, and it has fixture-based tests.

Each integration library owns its own retry policy, timeout, circuit breaker, and cache. **An
external service being down must degrade a feature, never fail a page.** Discover with the
catalogue unreachable still shows community recipes.

---

## 5. External services — what was verified

This section records what the APIs actually do, because in three cases the documented behaviour
differs sharply from what the marketing pages suggest, and those differences changed the design.

### 5.1 Recipe catalogue: TheMealDB ✅

| Property | Finding |
|---|---|
| Test key | `1` still works on V1 endpoints |
| Rate limits | FAQ states unlimited on the free/test key |
| **Caching & storage** | **Explicitly permitted** — "You can scrape, copy and modify any content returned from the API, as long as you use the official end points" |
| **App store restriction** | **Free tier users cannot publish apps to app stores** |
| Attribution | Required: "Recipe data and imagery: TheMealDB (https://www.themealdb.com/)" |
| Premium | £10 **lifetime** — unlocks V2, multi-ingredient filter, latest-meals, higher limits, and app-store distribution |

**Decision:** use TheMealDB, and buy the £10 lifetime premium key before any public release. It
is the cheapest dependency in the project by an enormous margin and it removes the distribution
restriction outright. Develop against test key `1`; the key is a config value, so this is a
one-line change.

**What it does not give us** — this drove three design decisions:

- **No servings field.** Per-serving calories are impossible for a catalogue recipe until a human
  supplies the number. → §6.3, §6.6.
- **No nutrition data at all.** → §5.2.
- **Instructions are one text blob**, not an ordered step list. Cooking mode needs discrete
  steps. → §6.3.

Their agent guidance also asks, reasonably, that we not present dietary/allergen claims derived
from a recipe's name, category or tags. We surface an explicit note in the UI (§8.4).

### 5.2 Nutrition: USDA FoodData Central ✅ (API Ninjas rejected)

**API Ninjas Nutrition cannot do the job.** Verified on their own documentation:

- **`calories` is a premium-only field.** So is `protein_g`, and every vitamin and mineral. The
  free tier returns fat, carbs, sodium, fiber and sugar — everything except the number you
  actually asked for.
- Free tier is **3,000 calls/month, 100/hour**, explicitly "for evaluation and demo purposes
  only", **no commercial use**, attribution required, with **1–2 hours of daily downtime**.
- **Caching is not enabled below the $99/month Business tier** — which is fundamentally
  incompatible with storing a calorie figure on a saved recipe.
- Their separate **Recipe API** is no better: the entire `nutrition` object is premium, as are
  the `ingredients`, `limit` and `offset` parameters, leaving the free tier able to return a
  single un-paginated recipe per query.

**Decision: USDA FoodData Central instead.**

| Property | Finding |
|---|---|
| Key | Free, self-service via data.gov |
| Rate limit | ~1,000 requests/hour per key |
| **Licence** | **CC0 1.0 — public domain.** Cache forever, redistribute, commercial use, no permission needed |
| Attribution | Requested, not required. We will credit it anyway |
| Endpoints | `/foods/search`, `/food/{fdcId}`, `/foods`, `/foods/list` |

The trade is real and worth stating plainly: **USDA gives us better rights and better limits, and
in exchange we build the parsing layer ourselves.** It will not interpret "2 cups of flour" — it
returns nutrients per 100g and expects us to know how much 2 cups weighs. §6.6 is that layer.

Two implementation caveats to verify during build:

- Nutrients are keyed by numeric ID (energy in kcal is commonly `1008`; some Foundation Foods
  datasets express energy via Atwater factors under different IDs instead). The mapping must
  handle more than one energy nutrient ID and must not silently return zero when the expected
  one is absent.
- Values arrive per 100g or per a portion object; scaling to arbitrary grams is our job.

**Spoonacular was also evaluated and rejected**: 50 points/day free, and caching capped at **one
hour**, after which data must be deleted. That is flatly incompatible with pinning recipes.

### 5.3 Models: OpenRouter ⚠️ — the free tier is smaller than it looks

| Property | Finding |
|---|---|
| Free models | IDs ending `:free`; ~16 available as of Aug 2026, and **the list churns constantly** |
| Rate limit | 20 requests/minute |
| **Daily cap** | **50 requests/day** with no credit purchase; **1,000/day** once $10 of credits has ever been bought |
| Scope of the cap | **Per account, not per user** |
| Data policy | Account settings control whether requests may route to providers that train on submitted data — with **separate settings for free and paid models**. OpenRouter notes this does not govern their own handling |

The daily cap is the critical fact. A single shared server key on an un-topped-up account gives
the **entire user base** 50 model calls per day. One person in cooking mode asking a handful of
questions exhausts it.

**Decision: support both key modes, with the user choosing.**

- **Shared key (default).** The server's own OpenRouter key, with a **per-user daily quota**
  enforced in the backend before any outbound call. Buy $10 of credits to lift the account to
  1,000/day. New users get a working experience with zero setup.
- **Bring your own key.** A user can add their own OpenRouter key to lift their limit to whatever
  their own account allows. Stored encrypted at rest, never returned to any client (write-only;
  the UI displays only the last four characters), and used only to serve that user's requests.

Two rules that follow:

- **Never hardcode a model ID.** The free model roster changes month to month and models get
  retired without much warning. Configure an *ordered preference list* of model IDs and fall
  through on failure. A hardcoded `:free` model is a guaranteed future outage.
- **Set the account data policy deliberately**, since we transmit users' recipes. In BYOK mode
  the user's own account setting governs — say so in the UI at the point they paste their key.

### 5.4 Recipe import: structured data first ✅

Most recipe sites embed the complete recipe in the page as schema.org JSON-LD. Parsing it is
deterministic, free, instant, and cannot hallucinate an ingredient that was never on the page.

**Decision: JSON-LD first, model as fallback.** §6.4 details the pipeline. The model is reserved
for pages with no usable structured data — which, given a 50–1,000/day cap, is the only
affordable design anyway.

The mapping is fiddlier than it sounds and belongs in a well-tested pure library, because
schema.org permits several shapes for the same field:

- `recipeInstructions` may be **plain text**, an **array of `HowToStep`**, or an **array of
  `HowToSection`** each containing steps. All three occur in the wild.
- `recipeIngredient` may be `Text`, an `ItemList`, or `PropertyValue`.
- `recipeYield` may be a `QuantitativeValue` or free text ("Serves 4–6", "12 cookies").
- `prepTime`/`cookTime`/`totalTime` are **ISO 8601 durations** (`PT1H30M`), not numbers.
- The Recipe object is often nested inside an `@graph` array, and `@type` itself is sometimes an
  array.
- Adoption of optional fields is patchy: nutrition is common, `suitableForDiet` is almost never
  present. Treat everything except name/ingredients/instructions as optional.

### 5.5 Copyright position

Under US law, **an ingredient list and a bare set of directions are not copyrightable** — they
are facts and procedures. What *is* protected is creative expression around them: headnotes,
personal stories, distinctive prose, and **photography**.

**Decision:** on URL import we store the ingredients, the steps, times and yield. We store the
source URL and attribution, and we **link** the source image rather than copying it into our
storage. We do not import headnotes or narrative blocks. This keeps us on the factual side of
the line, and the attribution is good manners regardless of what the law requires.

### 5.6 Weather: Open-Meteo ✅

| Property | Finding |
|---|---|
| API key | **None required** |
| Rate limits | 600/min, 5,000/hour, 10,000/day |
| Licence | **CC-BY 4.0** — attribution required, displayed in the UI |
| **Commercial use** | **Not permitted on the free tier** — "You may only use the free API services for non-commercial purposes" |
| Geocoding | A separate free Geocoding API resolves a city name to coordinates |

**Decision:** use Open-Meteo for both forecast and geocoding. No key, generous limits, and open
data. The non-commercial restriction is acceptable because **this app is not commercial**, and it
is recorded in the README (§5.8) so that a future change of intent has a checklist rather than a
surprise.

### 5.7 Location: no third party at all

**Electron cannot do browser geolocation for free.** `navigator.geolocation` in Chromium delegates
to **Google Cloud Platform's geolocation web service**, which requires a `GOOGLE_API_KEY` on a
project **with a billing account attached**. On a stack chosen to be free, that is a hard blocker
— and it collects far more precision than deciding between soup and salad justifies.

**Decision: derive a first guess from the OS timezone, and let the user correct it.**

The IANA timezone the machine already reports *is* a place name — `Asia/Jerusalem`,
`Europe/Berlin`, `America/Chicago`. Split on `/`, feed the city part to Open-Meteo's geocoder,
and pre-fill a city field in settings. The user edits it if it's wrong.

This is better than the obvious alternatives on every axis that matters here:

| | OS timezone | IP lookup | GPS via Google |
|---|---|---|---|
| Extra third party | **none** | one, sees every user's IP | Google, plus billing |
| Transport | **local** | free tiers are often HTTP-only¹ | HTTPS |
| Cost | **free** | free tier, non-commercial | paid |
| Defeated by VPN | **no** | yes | no |
| Precision | region | city | exact address |
| Precision *needed* | region | — | — |

¹ ip-api.com, the most commonly suggested option, offers SSL only on paid plans — a plaintext
request carrying location data was not a trade worth making.

The guess is coarse, but it is a **pre-fill for an editable field**, not an answer. And for this
feature the right location is where the user *cooks*, which is their home city — not wherever the
laptop happens to be.

### 5.8 Licence obligations, recorded

Three dependencies carry conditions that constrain distribution rather than development. None
blocks anything now; all three would need settling if the project ever became commercial or
shipped to an app store. They belong in the README as a single checklist:

| Dependency | Obligation |
|---|---|
| TheMealDB | Free tier bars app-store distribution → £10 lifetime premium before public release. Attribution required |
| Open-Meteo | Free tier is **non-commercial only**. CC-BY 4.0 attribution required |
| USDA FoodData Central | CC0 — no obligations. Attribution offered as courtesy |
| OpenRouter | Data-policy setting governs whether providers may train on submitted prompts (§5.3) |

---

## 6. Data model

### 6.1 Recipe lifecycle — the organising idea

Every recipe in the system is in exactly one of three states, and the transitions between them
are where most of the product's behaviour lives:

```
   ┌──────────────────────────────────────────────────────────────┐
   │                                                              │
   │   ✍️  AUTHORED            🔗  IMPORTED           📌  PINNED    │
   │   written by hand        from a URL           from Discover  │
   │                                                              │
   │   ── OWNED ──────────────────────────┐        ── KEPT ────   │
   │   full version history               │        no history     │
   │   editable                           │        read-only      │
   │   cookable ✓                         │        not cookable   │
   │   shareable / publishable            │        "check for     │
   │                                      │         updates"      │
   │                                      │             │         │
   │                     ┌────────────────┘             │         │
   │                     │                              │         │
   │                     │         🍴 fork ─────────────┘         │
   │                     ▼         (supply servings +             │
   │                  OWNED         confirm step split)           │
   └──────────────────────────────────────────────────────────────┘
```

**Decision: a pinned recipe is a read-only saved copy.** You can view it, rate it, comment on it,
and re-check the source for changes. You cannot edit it or cook from it, because we don't own
that content and — critically — because it lacks the two things cooking mode requires: a servings
count and discrete steps.

**Decision: forking is where a pinned recipe becomes real.** The fork dialog is the natural and
only place to ask the user for the servings count and to confirm the step breakdown. This turns
an awkward data gap into an ordinary product moment: "make this yours" already implies filling in
details. Afterwards it is an owned recipe like any other — versioned, editable, cookable,
shareable — with its lineage back to the source permanently recorded.

This resolves TheMealDB's missing fields without a single AI call and without ever showing the
user a number we guessed.

### 6.2 Core tables

```
user
  id, handle (citext unique), email (citext unique), display_name,
  avatar_url, password_hash, created_at

circle                            -- a family or friend group; the sharing boundary
  id, name, slug, created_by, created_at

circle_membership
  circle_id, user_id, role (owner|admin|member), joined_at
  PK (circle_id, user_id)

recipe                            -- IDENTITY + POINTER. Holds no content.
  id, owner_id, circle_id (nullable),
  head_version_id  -> recipe_version.id,
  origin (authored | imported_url | forked_internal | forked_external),
  forked_from_version_id (nullable) -> recipe_version.id,   -- internal lineage
  external_source (nullable),  external_id (nullable),      -- external lineage
  source_url (nullable), source_attribution (nullable),
  visibility (private|circle|public),
  slug, created_at, archived_at

recipe_version                    -- IMMUTABLE SNAPSHOT. Never UPDATEd.
  id, recipe_id, parent_version_id (nullable), author_id,
  version_number (int, per recipe),
  title, summary, servings, prep_minutes, cook_minutes, difficulty,
  ingredients (jsonb),            -- see §6.5
  steps (jsonb),                  -- ordered array of step objects
  notes, image_refs (jsonb),
  change_note,                    -- "used less salt" — the commit message
  created_at
  UNIQUE (recipe_id, version_number)

change_proposal                   -- pull request, for recipes you do not own
  id, recipe_id, proposed_version_id, base_version_id,
  author_id, status (open|merged|rejected|withdrawn),
  title, body, resolved_by, resolved_at, created_at
```

### 6.3 Pinned external recipes

```
external_pin
  id, user_id,
  source (themealdb),  external_id,
  payload jsonb,                  -- normalised snapshot, NOT the raw upstream shape
  payload_hash,                   -- for change detection; see below
  pinned_at, last_checked_at, last_changed_at
  UNIQUE (user_id, source, external_id)
```

Unpinned catalogue recipes are **never** persisted — they are fetched, mapped in the integration
layer, and returned. This is what you specified and it is also what keeps the database meaningful:
it holds things people chose to keep.

**Change detection.** TheMealDB exposes no `updated_at`, so "check for updates" works by
re-fetching, normalising, hashing, and comparing to `payload_hash`. Normalise before hashing
(trim whitespace, drop the empty `strIngredient13..20` slots, sort nothing) or trivial upstream
formatting churn will read as a change every time. Only `last_checked_at` moves on a no-op check;
`last_changed_at` moves only on a genuine diff, and that is what the UI badges.

Refresh is **manual only**, per your spec. No background polling — it would multiply outbound
calls by the number of pins in the system for a category of content that changes approximately
never.

### 6.4 URL import pipeline

```
  user pastes URL
        │
        ▼
  ① server-side fetch  ── SSRF guard: block private/loopback/link-local ranges,
        │                 re-validate after every redirect, cap size and timeout
        ▼
  ② extract <script type="application/ld+json">
        │  walk @graph, handle @type as string or array, find Recipe
        ▼
  ③ map schema.org → domain          ✅ done — no model call
        │  (all the shape variants in §5.4)
        ▼  not found / unusable
  ④ fallback: microdata / RDFa
        │
        ▼  still nothing
  ⑤ fallback: model on cleaned HTML   ── costs quota; strict JSON out,
        │                                 validated against our schema
        ▼  invalid
  ⑥ fail honestly: "couldn't read this page — paste it manually"
```

**Step ① is a security boundary, not a fetch.** We are taking a URL from an untrusted user and
requesting it from inside our network. Without an SSRF guard that is a hole straight into any
internal service the API container can reach — including cloud metadata endpoints. The guard must
re-validate on **every** redirect hop, not just the initial URL, because a public host can
redirect to `127.0.0.1`.

**Step ⑤ never trusts the model's output.** It is parsed, validated against the same schema as
step ③, and rejected on mismatch. A malformed import that fails loudly is strictly better than a
recipe with an invented quantity. The model is also given the page text only — never told to
follow instructions found in it.

Imported recipes are `origin = imported_url`, carry `source_url`, and are owned, versioned and
cookable from the moment they land, because JSON-LD gives us real steps and a real yield.

### 6.5 Ingredients and steps

Ingredients live as `jsonb` inside the version snapshot:

```json
[{ "quantity": 2.5, "unit": "cup", "item": "flour", "note": "sifted", "group": "Dough",
   "raw": "2 ½ cups flour, sifted" }]
```

Steps likewise, as an ordered array:

```json
[{ "index": 1, "text": "Preheat the oven to 180°C.", "durationMinutes": null },
 { "index": 2, "text": "Sift the flour and salt together.", "durationMinutes": 2 }]
```

Keeping `raw` alongside the parsed fields matters: parsing is lossy and occasionally wrong, and
the original line is what the user typed or what the source said. Display `raw`, compute from the
parsed fields, and let the user correct the parse without losing their words.

**Decision:** jsonb only in v1 — the snapshot stays genuinely immutable and self-contained,
ingredient groups and free-form notes ("a good glug of oil") survive without schema gymnastics,
and rendering needs no joins.

**Trigger to revisit:** the first feature requiring cross-recipe ingredient search ("recipes with
tahini but no nuts") or generated shopping lists. At that point add a normalized projection —
`ingredient` (canonical) and `recipe_version_ingredient` (join) — rebuilt on version write, with
the jsonb remaining the source of truth. Do not build it speculatively; canonicalizing ingredient
text into a normalized graph is a much larger project than it appears and is worthless until a
feature needs it.

### 6.6 Nutrition pipeline

```
  recipe_version.ingredients[]
        │
        ▼
  ① parse line → { quantity, unit, name }           shared/nutrition, pure
        │
        ▼
  ② normalise name (lowercase, singularise, strip prep words: "chopped", "sifted")
        │
        ▼
  ③ convert to grams                                shared/nutrition, pure
        │  mass units      → trivial
        │  volume units    → needs per-ingredient density  ⚠️
        │  counts ("2 eggs") → needs per-item weight       ⚠️
        ▼
  ④ look up ingredient_nutrition cache  ──── hit ────┐
        │ miss                                       │
        ▼                                            │
  ⑤ USDA /foods/search → pick best match             │
        │  → extract energy/protein/fat/carbs        │
        │  → WRITE TO CACHE (CC0: no expiry)         │
        ▼                                            │
  ⑥ ───────────────────────────────────────────────►┴─► sum
                                                          │
                                                          ▼
                                                   ÷ servings
```

```
ingredient_nutrition                -- grows into a local reference table over time
  id, normalized_name (unique), fdc_id, fdc_description,
  per_100g jsonb,                   -- kcal, protein_g, fat_g, carbs_g
  density_g_per_ml (nullable),      -- for volume→mass
  unit_weight_g (nullable),         -- for "2 eggs"
  match_confidence, source, fetched_at, verified_by (nullable)
```

**The cache is the design, not an optimisation.** USDA data is CC0 and nutritionally static —
flour's calorie content does not change — so entries never expire. Family recipes reuse a small
ingredient vocabulary; after the first few hundred recipes the cache serves nearly every lookup
and outbound calls approach zero. This is precisely what the 1,000/hour limit and the CC0 licence
make possible, and precisely what API Ninjas' caching restriction forbade.

**Step ③ is where this gets genuinely hard, and it must fail honestly.** Volume-to-mass is
per-ingredient: a cup of water is 236g, a cup of flour is about 120g, a cup of honey is about
340g. Seed a density table for the common ingredients by hand and accept that it will be
incomplete.

**Decision:** when an ingredient cannot be converted or matched, it is **excluded from the total
and reported**, not silently estimated. The UI shows "≈ 640 kcal per serving (3 ingredients not
counted)" rather than a confident wrong number. Users forgive an incomplete estimate; they do not
forgive a precise-looking lie about their food.

**Decision:** nutrition figures are always labelled as estimates, computed from a public database,
and never presented as dietary, medical or allergen guidance. Combined with §8.4.

**Where nutrition appears:** owned recipes only. Discover cards show **no** calorie figure,
because without a servings count a per-serving number cannot exist and a whole-recipe total with
unknown yield is close to meaningless. Nutrition appears the moment a recipe is forked and the
user supplies servings.

### 6.7 Ratings and comments

```
rating
  id, user_id,
  subject_kind (recipe | external),
  recipe_id (nullable) -> recipe.id,
  external_source (nullable), external_id (nullable),
  score numeric(2,1)  CHECK (score >= 1.0 AND score <= 5.0),
  created_at, updated_at
  UNIQUE (user_id, subject_kind, recipe_id, external_source, external_id)

comment
  id, author_id, subject_kind, recipe_id, external_source, external_id,
  version_id (nullable),          -- pin a comment to a specific version
  proposal_id (nullable),
  parent_comment_id (nullable),   -- threading
  body, created_at, edited_at, deleted_at
```

**Decision:** ratings and comments exist on **published** and **circle-shared** recipes, and on
external catalogue recipes. Not on private recipes — a private recipe has no audience.

Ratings on catalogue recipes are stored **on our side**, keyed by `(source, external_id)`; the
upstream API accepts no writes. A pleasant consequence is that our network accumulates its own
opinion of the public catalogue.

Score is `numeric(2,1)`, range 1.0–5.0, per your spec — a genuine decimal, not a star count. The
displayed aggregate is a plain mean with the sample size shown beside it; a 5.0 from one person
is not a 5.0 from forty, and the UI should never let it look like one. No voting on comments, as
you specified.

**Ratings attach to a version where one exists.** `cook_log`-style "I made this" signals and
ratings point at the version actually cooked, so when a recipe changes materially the UI can
distinguish "23 people rated the current version" from "and 40 rated earlier versions." A recipe
site that loses this ends up with ratings describing a document nobody can read anymore.

### 6.8 Cooking mode

```
cook_session
  id, user_id, recipe_id, recipe_version_id,
  current_step_index, checked_ingredients jsonb,
  started_at, last_active_at, completed_at (nullable)

cook_session_message
  id, session_id, role (user|assistant),
  content, step_index_at_ask, model_id, token_usage jsonb, created_at
```

Pinning the session to a `recipe_version_id` rather than a `recipe_id` matters: if someone edits
the recipe mid-cook, the person at the stove keeps the version they started with.

**Automatic context assembly** — the point you were specific about. The user types "can I use
margarine instead?" and the backend, not the user, assembles:

```
system:  You are helping someone who is cooking right now. Be concise and practical.
         Do not give food-safety, allergen, medical or dietary guarantees; if asked,
         tell them to verify against ingredient labels.
context: title, servings, full ingredient list, all steps
state:   currently on step 4 of 9; steps 1–3 completed; ingredients checked off: [...]
user:    can I use margarine instead?
```

The user never types the recipe or their position. Recipes are small, so the whole thing fits
comfortably in even a modest context window — no retrieval, no chunking, no embedding store.
Prior turns in the session are included for continuity, trimmed oldest-first if a smaller model
is in play.

**Before every call** the backend checks the user's quota (§5.3), and on a 429 or an exhausted
budget returns a real message — "you've used your 20 questions today, add your own OpenRouter key
to lift this" — rather than a generic failure. With caps this tight, quota exhaustion is a normal
state to design for, not an error case.

**Cooking mode is available only for owned recipes** (authored, imported, or forked), per §6.1.

### 6.9 User model keys

```
user_model_key
  user_id, provider (openrouter),
  encrypted_key,                  -- AES-GCM, key from env/KMS, never in the DB
  key_last4, created_at, last_used_at
  PK (user_id, provider)

user_model_usage
  user_id, usage_date, request_count
  PK (user_id, usage_date)
```

The stored key is **write-only across the API boundary**: no endpoint ever returns it, not even
to its owner. The UI shows `sk-or-...a1b2` and offers replace or delete. Encryption key comes from
the environment and is never committed, never logged, and never included in an error payload.

### 6.10 Migrations

- `synchronize: false` in every environment, without exception. Schema changes only via
  generated, reviewed, committed TypeORM migrations.
- Migrations run as a **discrete deploy step**, never on application boot. Boot-time migration in
  a multi-instance deploy is a race condition waiting to happen.
- **Expand/contract** for anything destructive: add the new column, backfill, ship code using it,
  drop the old column in a *later* release. This is what allows a rollback of Dev without a
  database restore, which is what makes "Dev always works" true in practice.

### 6.11 Weather-aware recommendation

Suggests something to cook based on the weather and season where the user is — **choosing only
from recipes they have already saved**. It never recommends a recipe the user doesn't have, which
is both what you specified and what makes it useful rather than another discovery feed.

```
  user taps "what should I cook?"
        │
        ▼
  ① resolve location    city preference → cached coordinates (rounded)   no network
        │
        ▼
  ② fetch weather       Open-Meteo, cached ~1h per rounded coordinate
        │               unavailable → fall back to season from the date alone
        ▼
  ③ DETERMINISTIC SCORING          shared/recommendation — pure, free, instant
        │  temperature band, precipitation, season, cook time,
        │  time of day, recently-cooked penalty
        ▼
  ④ shortlist: top ~10 saved recipes
        │
        ├──────────── quota exhausted / offline / user declined AI ──────┐
        ▼                                                               │
  ⑤ model picks one from the shortlist and writes the reason            │
        │  sees: weather BAND + shortlist titles/tags/times              │
        │  never: coordinates, city name, or full recipe bodies          │
        ▼                                                               ▼
  ⑥ suggestion + explanation                        top-scored recipe + templated reason
```

**Step ③ is the design, and step ⑤ is the polish.** Rules do the matching — cold and wet favours
soups, stews and braises; hot favours salads and cold dishes; a long cook time suits a free
evening rather than a weeknight. The model's job is to choose among a handful of already-good
candidates and say something human about why.

This ordering exists because of the constraint in §5.3. With 50–1,000 model requests per day
across the whole account, a feature that spends one on every tap would be unusable. Here, **when
the quota is gone the feature still works** — it returns the top-scored recipe with a templated
reason instead of a written one. Degraded, not broken. That property is worth more than the
prose.

It also bounds the prompt. Sending an entire recipe library to a model grows without limit as the
library grows; sending ten titles does not.

**What the model receives, precisely.** A weather *band* — "cold, wet, winter evening" — not a
temperature, not coordinates, and not a place name. Plus the shortlist as titles, tags and cook
times. Not full recipe bodies, not the ingredient lists. The model does not need to know where
the user lives to know that it is cold there.

```
user_location_preference
  user_id PK,
  city_label,                     -- "Jerusalem" — what the user sees and edits
  latitude  numeric(5,2),         -- ROUNDED to ~1km / ~10km. Never full precision.
  longitude numeric(5,2),
  timezone,                       -- IANA, also the source of the first guess
  recommendations_enabled bool DEFAULT false,   -- opt-in
  created_at, updated_at

weather_cache
  rounded_lat, rounded_lon, fetched_at,
  payload jsonb                   -- current + daily forecast
  PK (rounded_lat, rounded_lon)

recommendation_log
  id, user_id, recipe_id, weather_band, produced_by (rules|model),
  created_at                      -- powers the "don't suggest this again this week" penalty
```

**Privacy posture — decisions, not preferences:**

- **Opt-in.** `recommendations_enabled` defaults to `false`. Until the user turns it on, no
  location is stored and nothing about their library leaves the server.
- **Coordinates are rounded before storage**, never written at full precision. `numeric(5,2)`
  makes over-precision structurally impossible rather than merely discouraged — a later
  well-meaning change cannot quietly start storing exact positions.
- **No location reaches the model.** Only a derived band (§ above).
- **The consent screen says what actually happens** in plain language: which recipe titles are
  sent, to whom, and that on the free tier the provider's own policy governs training. In BYOK
  mode the user's own OpenRouter account setting applies — stated at the point they paste the key.
- **The weather cache is keyed by rounded coordinate, not by user**, so it is shared between
  users in the same area and holds no personal identifier at all.

Rounding costs nothing: whether it is cold enough for soup does not change over ten kilometres.

**Scope:** saved recipes only — authored, imported, forked, and pinned. Never the public
catalogue. A pinned recipe can be *suggested* even though it cannot be cooked directly (§6.1); in
that case the card's action is "fork to cook this", which is the same path the user would take
anyway.

---

## 7. API design

### 7.1 Shape

REST over HTTPS, JSON, `/api/v1` prefix. Resource-oriented, with version-control verbs as
sub-resources:

```
  Auth
POST   /api/v1/auth/register | login | refresh | logout

  Recipes (owned)
POST   /api/v1/recipes                          create (creates v1 + recipe)
GET    /api/v1/recipes/:id                      current version (HEAD)
GET    /api/v1/recipes/:id/versions             history
GET    /api/v1/recipes/:id/versions/:n          a specific version
POST   /api/v1/recipes/:id/versions             append version (needs parent_version_id)
GET    /api/v1/recipes/:id/diff?from=3&to=7     computed diff
POST   /api/v1/recipes/:id/fork                 fork an owned recipe
POST   /api/v1/recipes/:id/revert               append a version equal to an older one
POST   /api/v1/recipes/:id/publish | share      visibility transitions
GET    /api/v1/recipes/:id/nutrition            estimate, with uncounted items listed

  Import
POST   /api/v1/import/url                       { url } → parsed draft, not yet saved

  Discover
GET    /api/v1/discover?q=&cursor=              unified feed: community + catalogue
GET    /api/v1/discover/external/:source/:id    single catalogue recipe (not persisted)

  Pins
POST   /api/v1/pins                             { source, externalId }
GET    /api/v1/pins
POST   /api/v1/pins/:id/check-updates           manual refresh
POST   /api/v1/pins/:id/fork                    → owned recipe (servings + steps required)
DELETE /api/v1/pins/:id

  Social
POST   /api/v1/ratings                          upsert own rating on a subject
GET    /api/v1/comments?subject=...
POST   /api/v1/comments
POST   /api/v1/recipes/:id/proposals            open a change proposal
POST   /api/v1/proposals/:id/merge              owner merges
GET    /api/v1/circles/:id/feed

  Cooking
POST   /api/v1/cook-sessions                    { recipeVersionId }
PATCH  /api/v1/cook-sessions/:id                advance step, check ingredients
POST   /api/v1/cook-sessions/:id/ask            { question } → model answer
GET    /api/v1/cook-sessions/:id/messages

  Recommendation
POST   /api/v1/recommendations                  "what should I cook?" → suggestion + reason
GET    /api/v1/geocode?q=Jerusalem              city search for the settings field

  Settings
PUT    /api/v1/me/model-key                     write-only
DELETE /api/v1/me/model-key
GET    /api/v1/me/quota                         remaining requests today
PUT    /api/v1/me/location                      { cityLabel, timezone } → geocoded, rounded
DELETE /api/v1/me/location                      erases it; also disables recommendations
```

`PUT /me/location` takes a **city label, never coordinates**. The client does not send a position
and has no way to; the server geocodes the name and stores the rounded result (§6.11). The
endpoint is the enforcement point for that, not a convention.

`DELETE /me/location` genuinely erases the row rather than blanking a flag — a user withdrawing
consent should leave nothing behind.

Note `revert` **appends** rather than deletes. History is append-only; there is no destructive
operation on `recipe_version` anywhere in the API.

`POST /import/url` returns a **draft** rather than saving. The user should see what was extracted
and correct it before it becomes a recipe — parsing is imperfect and silent imports produce a
library full of subtly wrong recipes.

### 7.2 Discover feed composition

One feed, two very different sources, each item badged with its origin.

Community recipes are a normal paginated database query. Catalogue results come from an
integration library with a short-lived in-memory cache (they are not persisted, but re-requesting
the same page during a scroll should not re-hit upstream). The two are merged behind a **cursor
that encodes both positions**, because offset pagination across a heterogeneous feed produces
duplicates and gaps the moment either source changes.

**If the catalogue is unreachable, the feed degrades to community-only with a quiet notice.** It
never errors the page.

Attribution for catalogue items is rendered on the card, not buried in a settings screen —
TheMealDB's terms require it and it is the honest thing to do.

### 7.3 Validation

`class-validator` + `ValidationPipe` with `whitelist: true` and `forbidNonWhitelisted: true`
today. Given Nest 12 brings Standard Schema support to `@Body()`/`@Query()`, keep validation
rules in DTO classes under `shared/contracts` and avoid scattering bespoke validation through
services, so the eventual move to Zod is mechanical.

### 7.4 Authentication

**Decision: email + password, JWT with refresh rotation.**

- Short-lived access tokens (~15 min) + rotating refresh tokens.
- Refresh tokens stored **hashed** server-side, single-use, with reuse detection that revokes the
  token family. This turns a stolen token from a permanent compromise into a detectable one.
- Passwords hashed with Argon2id.
- Authorization is per-circle and per-recipe. A Nest guard resolves the caller's relationship to
  the resource (`owner | circle-member | public | none`) once per request; controllers never
  reimplement it.
- **Open:** password reset requires a transactional email provider. Needs a choice before the
  first real user.

### 7.5 Rate limiting and abuse

Every endpoint that triggers an outbound call is a cost multiplier and needs its own limit,
independent of the global throttle:

| Endpoint | Why it needs its own limit |
|---|---|
| `POST /import/url` | Server-side fetch of an arbitrary URL — SSRF surface and a bandwidth amplifier |
| `POST /cook-sessions/:id/ask` | Consumes the scarcest resource in the system |
| `POST /pins/:id/check-updates` | Trivially spammable; upstream calls per click |
| `GET /recipes/:id/nutrition` | Cache misses become USDA calls |
| `POST /recommendations` | Cache misses become Open-Meteo calls, and the pick consumes model quota |
| `GET /geocode` | Proxies straight to a third party; trivially abusable as an open relay |

---

## 8. Electron shell

### 8.1 Security posture — non-negotiable

| Setting | Value | Why |
|---|---|---|
| `contextIsolation` | `true` | Renderer cannot touch Electron internals |
| `nodeIntegration` | `false` | No Node API in renderer, ever |
| `sandbox` | `true` | Renderer runs in the OS sandbox |
| `webSecurity` | `true` | Never disable, including in dev |
| CSP | strict, no `unsafe-inline` | Renderer loads remote data and remote images |
| `shell.openExternal` | allowlisted schemes only | Prevents arbitrary command execution |
| `will-navigate` / `setWindowOpenHandler` | blocked by default | Stops the app being navigated away |

Every IPC channel exposed through `contextBridge` is treated as a **public, hostile-input API**:
explicit channel names (never a generic `invoke(channel, ...args)` passthrough), argument
validation in the main process, and no path or command arguments accepted from the renderer.

Recipe images come from arbitrary third-party domains (§5.5 — we link rather than copy). The CSP
`img-src` must allow that without loosening `script-src`, and remote images must never be loaded
into a context that can execute script.

**`setPermissionRequestHandler` denies everything we don't use — including `geolocation`.** We
derive location from the timezone and a typed city instead (§5.7), so nothing in the app should
ever raise that prompt. Denying by default means a dependency that starts asking for the camera,
the microphone or a position gets refused rather than quietly granted, and an explicit deny is
also what stops the renderer from reaching a Google service we deliberately declined to depend on.

### 8.2 Token storage

Refresh tokens go in the OS keychain via Electron's `safeStorage`, held by the **main** process
and never exposed to the renderer. `localStorage` is not acceptable for a refresh token in a
desktop app — any XSS in the renderer becomes persistent account compromise. The renderer holds
the short-lived access token in memory only.

The user's OpenRouter key is **never stored client-side at all**; it lives encrypted on the server
(§6.9) and the renderer never sees it after the moment it is typed.

### 8.3 Local read cache

Recipes are server-owned but cached locally so the app opens instantly and stays readable
offline — which matters specifically because people cook in kitchens with bad wifi.

**Decision: cache is read-only and disposable.** It holds recipe versions the user has opened,
their pins, and in-progress cook sessions. It is never the source of truth, deleting it loses
nothing, and there is no write-back sync. This deliberately avoids the entire class of offline
sync and conflict-resolution problems, which would interact very badly with the version model.

Writes require connectivity. Cooking mode works offline for reading steps; asking the model does
not, and should say so plainly rather than hanging.

### 8.4 Safety and honesty in the UI

Two standing requirements that come from the data sources rather than from taste:

- **Nutrition is an estimate**, computed from a public database, with uncounted ingredients
  listed (§6.6). Never presented as dietary or medical guidance.
- **No allergen or dietary claims** are derived from a recipe's name, category or tags — a
  requirement of TheMealDB's usage guidance and simply correct. Where a user asks the cooking
  assistant about allergens, the system prompt directs it to say "check the labels."

### 8.5 Build and packaging

`electron-vite` for dev and build, `electron-builder` for distributables, both driven by Nx
`run-commands` targets (§2.2). Auto-update via `electron-updater` against GitHub Releases, which
fits the branching model in §9: only `master` publishes updates.

---

## 9. Version control and CI

### 9.1 Branching

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

Branch naming: `feature/*`, `fix/*`, `chore/*`, `docs/*` — all cut from `Dev`, merged back to
`Dev`.

### 9.2 What makes "Dev never breaks" actually true

Intent is not a mechanism. These are the mechanisms:

1. **Branch protection on both `Dev` and `master`:** no direct pushes, PR required, required
   status checks must pass, branches up to date before merge, linear history, no force push, no
   deletion.
2. **PR pipeline:** `nx affected -t lint typecheck test build` on the merge result, not the
   branch tip.
3. **Integration tests against real Postgres** via Testcontainers. Not sqlite — TypeORM's
   behaviour differs enough (jsonb, citext, transaction semantics) that a green sqlite suite
   proves very little.
4. **Migration check:** every PR touching entities must include a migration; a job asserts the
   generated migration is empty after applying the committed ones.
5. **OpenAPI drift check:** regenerate the spec, fail if it differs from the committed
   `openapi.json`. Without this, the generated client silently drifts from the server.
6. **No live external calls in CI.** Every integration library is tested against recorded
   fixtures. A third party having an outage must never turn `Dev` red — that is exactly the
   failure mode that trains people to ignore CI.
7. **Squash merge into `Dev`**, so every commit there is one reviewed, CI-green unit and
   `git revert` of a bad feature is a single clean operation.

Nightly on `Dev`: the full E2E suite including the packaged Electron build, plus a **separate,
non-blocking** contract check that hits the real external APIs and reports drift. Non-blocking is
the point — it tells us TheMealDB changed a field without breaking anyone's morning.

### 9.3 Releases

`Dev → master` via a release PR. Tag on `master` triggers `electron-builder` packaging and
publishes to GitHub Releases; the API deploys from the same tag. Since auto-update points only at
`master`, users never receive a Dev build.

### 9.4 Secrets

- `.env.local` — gitignored, never committed, never logged.
- `.env.example` — committed, every key present with a placeholder and a comment.
- Config validated **at boot against a schema**; the process refuses to start on a missing or
  malformed key. A service that boots with a silently absent secret and fails on first request is
  far worse than one that refuses to start.
- CI/CD secrets live in GitHub Actions secrets.
- **No secret ever reaches the renderer or an Electron build artifact** — anything shipped in the
  app is public by definition. The desktop app gets only non-secret config such as the API base
  URL. This is the whole reason the backend is the API connector (§3.1).
- Keys needed: `THEMEALDB_KEY`, `USDA_FDC_KEY`, `OPENROUTER_KEY`, `MODEL_KEY_ENCRYPTION_KEY`,
  `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, plus database and storage credentials.
- `gitleaks` in the PR pipeline as a backstop.

---

## 10. Testing strategy

| Layer | Tool | Scope |
|---|---|---|
| `shared/versioning` | Vitest + **fast-check** | Property-based. The correctness core. |
| `shared/recipe-import` | Vitest + **saved HTML fixtures** | Real pages from many sites, including malformed ones |
| `shared/nutrition` | Vitest | Unit conversion, density lookup, failure reporting |
| `shared/recommendation` | Vitest | Scoring across weather/season/time-of-day matrices |
| `shared/domain` | Vitest | Invariants and guards |
| API unit | Jest → Vitest at Nest 12 | Services with mocked repositories |
| API integration | Jest + **Testcontainers** | Real Postgres, real migrations, real TypeORM |
| Integration libs | Recorded fixtures | Never live calls (§9.2 item 6) |
| Web unit | Vitest + Testing Library | Components and hooks |
| Web E2E | Playwright | Browser build of `apps/web` |
| Desktop E2E | Playwright Electron | Packaged shell: IPC, keychain, updater |

Four things deserve unusual rigour, because they are where silent wrongness lives:

**Property-based tests on versioning.** Invariants like *applying a diff from A to B to A yields
B* and *fork lineage is never lost* are what property testing is for, and this is the code where
a subtle bug corrupts users' family recipes irreversibly.

**Fixture-based tests on the import mapper.** Save real HTML from a wide spread of recipe sites
— including the ones with `HowToSection`, with `@graph` nesting, with `@type` as an array, and
with no structured data at all. This is a mapping problem, and mapping problems are only ever as
correct as their corpus.

**The SSRF guard gets adversarial tests.** `127.0.0.1`, `localhost`, `0.0.0.0`, `169.254.169.254`,
IPv6 loopback, decimal and octal IP encodings, DNS names resolving to private ranges, and a public
URL that 302s to a private one. Each must be refused.

**Nutrition failure paths.** Assert that an unconvertible ingredient is *excluded and reported*,
never silently treated as zero. A test that only checks the happy path would let the worst bug in
the system through.

Coverage thresholds are enforced on `shared/*` and API services, and deliberately not on `apps/*`
bootstrap code, where coverage numbers measure nothing useful.

---

## 11. Build order

Each step leaves `Dev` releasable:

1. **Workspace skeleton** — Nx 23, all projects generated, boundary tags and lint rules wired, CI
   green on an empty test suite. Prove the pipeline before writing features.
2. **`shared/domain` + `shared/versioning`** — pure logic with property tests, no I/O.
3. **Persistence + auth** — entities, first migration, Testcontainers harness, JWT with refresh
   rotation.
4. **Recipe CRUD with versioning** — append-only versions, HEAD pointer, diff endpoint.
5. **`shared/recipe-import` + URL import** — JSON-LD mapper against fixtures, then the SSRF-guarded
   fetch endpoint. Model fallback last; the deterministic path is most of the value.
6. **Web renderer** — generated API client, recipe editor with live diff, history view.
7. **Discover + pinning** — TheMealDB integration, unified feed, pin/check-updates/fork.
8. **`shared/nutrition` + USDA** — conversion library first with tests, then the cache table, then
   the endpoint.
9. **Cooking mode** — sessions, step navigation, then OpenRouter with quota enforcement and BYOK.
10. **Recommendation** — `shared/recommendation` scoring rules with tests first, then Open-Meteo
    and the location preference, then the model pick last. The rules-only version is shippable on
    its own, which is the point.
11. **Electron shell** — security settings from §8.1, `safeStorage` tokens, local cache, packaging,
    updater.
12. **Social layer** — ratings, comments, circles, change proposals, feed.

Steps 1–2 are worth taking slowly. Everything after is much cheaper if the boundaries and the
versioning core are right.

Note that steps 5, 8, 9 and 10 each begin with a **pure library tested in isolation** before
anything touches the network. That ordering is deliberate: it is what lets you develop the hard parts
without burning rate limits, and what makes their failures reproducible.

---

## 12. Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| **OpenRouter free cap (50–1,000/day, per account)** | AI features unusable beyond a handful of users | Per-user quotas + BYOK (§5.3); design the UI for quota exhaustion as a normal state |
| **Free model IDs churn and get retired** | Sudden feature outage | Never hardcode; ordered preference list with fallthrough |
| **SSRF via user-supplied import URLs** | Access to internal services / cloud metadata | Guard on every redirect hop; adversarial test suite (§10) |
| Volume→mass conversion is per-ingredient | Wrong calorie figures | Exclude-and-report rather than guess (§6.6); label as estimate |
| USDA nutrient-ID variance (energy under >1 ID) | Silent zero calories | Handle multiple energy IDs; assert non-zero in tests |
| TheMealDB free tier bars app-store distribution | Blocks release | £10 lifetime premium before any public release |
| `nx-electron` lags Nx majors | Blocks all Nx upgrades | Avoid it; electron-vite via `run-commands` (§2.2) |
| NestJS 12 ESM/Rspack transition | Rework of build config | No custom Webpack config, no deep imports; spike a month after release |
| Electron's 8-week cadence | Unpatched Chromium in a shipped app | Standing scheduled upgrade job |
| Shared libs leaking Node deps into browser | Broken web build | Boundary lint rules + zero-dependency `shared/*` |
| External API outage failing a page | App looks broken | Integration libs degrade, never throw to the route (§4.4) |
| **Storing users' home locations** | Sensitive personal data; a breach is materially worse | Opt-in, `numeric(5,2)` makes over-precision structurally impossible, delete means erase (§6.11) |
| **Recipe titles + location sent to a free model provider** | Private library exposed to a third party that may train on it | Weather *band* only, never a place; explicit consent screen; BYOK honours the user's own data policy (§6.11) |
| Electron geolocation needs a billed Google key | Would force a paid dependency | Timezone-derived guess + typed city; `geolocation` permission denied outright (§5.7, §8.1) |
| Open-Meteo free tier is non-commercial | Blocks a future commercial pivot | Recorded in the README checklist (§5.8) |
| Ingredient normalization built too early | Large sunk cost, no user value | Explicit deferral with a named trigger (§6.5) |
| Auto-merge corrupting recipes | Irreversible loss of family data | No auto-merge in v1; honest 409 conflicts |
| Migration on boot | Race conditions on multi-instance deploy | Discrete deploy step (§6.10) |

---

## 13. Decisions record

Settled in review on 2026-08-18:

| # | Decision |
|---|---|
| 1 | **Reject `nx-electron`** in favour of electron-vite + electron-builder via `run-commands` |
| 2 | **Snapshot-per-version storage** — no delta encoding or content-addressed store |
| 3 | **No automatic merge in v1** — conflicts surface as 409 |
| 4 | **Ingredients as `jsonb`**, normalized projection deferred to a named trigger |
| 5 | **Change proposals** for editing recipes you don't own |
| 6 | **Circles** as the sharing boundary, private by default |
| 7 | **NestJS 11 now**, v12 upgrade budgeted for ~Q4 2026 |
| 8 | **USDA FoodData Central** for nutrition; API Ninjas rejected (calories is premium-only) |
| 9 | **Both key modes for OpenRouter** — shared server key with per-user daily quota, plus BYOK |
| 10 | **JSON-LD first, model fallback** for URL import |
| 11 | **Server-stored recipes with a local read cache** — no offline write sync |
| 12 | **No cooking mode for public recipes**; pinned recipes are read-only |
| 13 | **One Discover feed**, community + catalogue, each item badged with its source |
| 14 | **Ratings and comments** on published, shared and external recipes — not private |
| 15 | **Versioning for owned and shared recipes**; pinned recipes must be forked to change |
| 16 | **Forking a pin is where servings and step confirmation are captured** — and where it becomes cookable |
| 17 | **Email + password auth**, JWT with rotating refresh tokens |
| 18 | **TheMealDB £10 lifetime premium** before any public release |
| 19 | **Open-Meteo** for weather and geocoding — no key, CC-BY, non-commercial free tier accepted |
| 20 | **No browser geolocation.** OS timezone gives the first guess, user edits a city field (§5.7) |
| 21 | **Recommendation is deterministic scoring first, model second** — degrades to rules when quota is gone |
| 22 | **Location is opt-in, rounded before storage, and never sent to the model** — only a weather band |
| 23 | **Licence obligations recorded in the README** (§5.8) rather than rediscovered later |

### Still open

- **Object storage** for user-uploaded recipe photos (local disk in dev; S3-compatible — R2 or
  MinIO — for anything real). Needed before the first image upload ships.
- **Transactional email provider** for password reset (§7.4).
- **API hosting target.** Affects the migration/deploy step in §9 and nothing else.

---

## Sources

**Stack**
- [Nx Release Schedule and Support Policy](https://nx.dev/docs/reference/releases)
- [nx-electron](https://github.com/bennymeg/nx-electron)
- [NestJS v12 is Coming — Trilon](https://trilon.io/blog/nestjs-12-is-coming)
- [NestJS v12 Roadmap — InfoQ](https://www.infoq.com/news/2026/04/nestjs-12-roadmap-esm/)
- [TypeORM 1.0 is here](https://typeorm.io/blog/typeorm-1-0/)
- [Electron release/EOL data](https://endoflife.date/electron)
- [PostgreSQL release/EOL data](https://endoflife.date/postgresql)
- [electron-vite](https://electron-vite.org/)

**External services**
- [TheMealDB API guide](https://themealdb.com/docs_api_guide.php) · [FAQ](https://www.themealdb.com/faq.php) · [Terms of use](https://www.themealdb.com/terms_of_use.php) · [Agent guidance](https://www.themealdb.com/AGENTS.md)
- [API Ninjas Nutrition API](https://api-ninjas.com/api/nutrition) · [Recipe API](https://api-ninjas.com/api/recipe) · [Pricing](https://api-ninjas.com/pricing) · [Terms](https://api-ninjas.com/tos)
- [USDA FoodData Central API guide](https://fdc.nal.usda.gov/api-guide)
- [OpenRouter rate limits](https://openrouter.ai/docs/api-reference/limits) · [Privacy and logging](https://openrouter.ai/docs/features/privacy-and-logging)
- [Spoonacular pricing](https://spoonacular.com/food-api/pricing)
- [Open-Meteo terms](https://open-meteo.com/en/terms) · [pricing](https://open-meteo.com/en/pricing) · [Geocoding API](https://open-meteo.com/en/docs/geocoding-api)
- [Electron environment variables (`GOOGLE_API_KEY` / geolocation)](https://www.electronjs.org/docs/latest/api/environment-variables)
- [ip-api.com legal terms (SSL is paid-only)](https://ip-api.com/docs/legal)

**Standards and law**
- [schema.org Recipe](https://schema.org/Recipe)
- [Are recipes protected by copyright? — Copyright Alliance](https://copyrightalliance.org/are-recipes-cookbooks-protected-by-copyright/)
