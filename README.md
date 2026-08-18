# Recipe Social Network

A social network for cooking recipes, built for families and friend groups rather than the open
internet. Share recipes with the people you actually cook with, keep their history as they change,
discover new ones, and get help while you're at the stove.

**Status: design phase.** No application code yet. The full design contract is
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — read it before writing anything.

---

## What it does

- **My Recipes** — write your own, import from any recipe URL, or pin ones you find. Every recipe
  you own keeps a full version history, so "Grandma's cholent, the way Dad makes it" is a real
  thing rather than a copy-paste.
- **Discover** — one feed mixing recipes published by other people on the network with a public
  recipe catalogue. Pin what you want to keep.
- **Cooking mode** — ingredients first, then one step at a time, with a question box wired to a
  model that already knows the recipe and which step you're on.
- **What should I cook?** — an opt-in suggestion based on the weather and season where you are,
  chosen only from recipes you've already saved.
- **Nutrition** — estimated calories per serving, computed from a public database.
- **Ratings and comments** — 1.0–5.0, on published and shared recipes.

## Stack

| | |
|---|---|
| Monorepo | Nx 23 |
| Backend | NestJS + TypeScript, Swagger/OpenAPI |
| Database | PostgreSQL 18 + TypeORM 1.x |
| Frontend | React + Vite |
| Desktop | Electron (electron-vite + electron-builder) |
| Later | native iOS client against the same API |

The backend is the only thing that talks to external services. Nothing in the desktop app ever
holds an API key — a shipped renderer is fully inspectable, so anything in it is public.
See [§3.1](docs/ARCHITECTURE.md).

## Repository layout

```
apps/     api · web (renderer) · desktop (Electron shell) · *-e2e
libs/
  shared/    domain · contracts · versioning · recipe-import · nutrition · recommendation
  api/       feature-* · integration-* · data-access-db
  web/       feature-* · data-access-api · ui
docs/     ARCHITECTURE.md · adr/
```

Boundaries are enforced by lint, not convention: `web` may never import `api`, `api` may never
import `web`, and both may import `shared`. See [§4.3](docs/ARCHITECTURE.md).

## Branching

```
master  ← stable, released, tagged. Auto-updates ship from here.
Dev     ← integration. Always green.
feature/* · fix/* · chore/* · docs/*   ← cut from Dev, squash-merged back to Dev
```

Both `master` and `Dev` are protected: PR required, status checks required, linear history, no
force push. Every PR runs `nx affected -t lint typecheck test build`.

## Configuration

Copy `.env.example` to `.env.local` and fill it in. **`.env.local` is gitignored and must never be
committed.** The app validates its configuration at boot and refuses to start on a missing key,
rather than failing later on the first request.

---

## Third-party services and licence obligations

Four external services are in use. None of them blocks development, but three carry conditions
that would need settling before this became a commercial product or shipped to an app store.
**This list is the checklist for that day** — it exists so the obligations get handled
deliberately rather than discovered under pressure.

### TheMealDB — public recipe catalogue

- Development uses the public test key `1`.
- **The free tier does not permit publishing to app stores.** A **£10 lifetime** premium key
  removes this and unlocks the V2 endpoints. Buy it before any public release.
- Their terms explicitly permit copying and modifying content retrieved through the official
  endpoints, which is what makes pinning legitimate.
- **Attribution is required** and is rendered on every catalogue recipe card:
  > Recipe data and imagery: TheMealDB (https://www.themealdb.com/)
- Per their usage guidance, the app must not present dietary, religious, medical or allergen
  claims derived from a recipe's name, category or tags.

### USDA FoodData Central — nutrition

- Free API key, roughly 1,000 requests/hour.
- **Data is CC0 1.0 (public domain)** — no restrictions on caching, redistribution or commercial
  use. This is what makes the local ingredient cache possible, and it is the reason this was
  chosen over the alternatives.
- Attribution is requested rather than required. We credit it anyway.

### Open-Meteo — weather and geocoding

- No API key. 600/min, 5,000/hour, 10,000/day.
- Data is **CC-BY 4.0** — attribution required and displayed in the UI.
- ⚠️ **The free tier is non-commercial use only.** Acceptable today because this project is not
  commercial. A commercial version would need Open-Meteo's paid tier.

### OpenRouter — recipe import fallback and the cooking assistant

- ⚠️ **Free models are capped at 20 requests/minute and 50 requests per day *per account*** —
  not per user. Buying $10 of credits (ever) raises the daily cap to 1,000.
- Users may supply their own key to lift their own limit. Stored encrypted; never returned by any
  endpoint.
- **Free model IDs churn constantly.** Never hardcode one — configure an ordered preference list.
- The account's data-policy setting governs whether requests may route to providers that train on
  submitted prompts. Set it deliberately: this app transmits users' recipe titles.

---

## Privacy commitments

These are design constraints, not aspirations, and they are enforced in the schema and at the API
boundary rather than left to care:

- **Location is opt-in** and off by default. Nothing is stored until the user enables it.
- **Coordinates are rounded before storage.** The column type is `numeric(5,2)`, so storing a
  precise position is not possible without a migration — a later well-meaning change cannot
  quietly start collecting more.
- **No location ever reaches a model.** The recommendation prompt receives a weather *band*
  ("cold, wet, winter evening"), never a place name or a coordinate.
- **Deleting your location erases the row**, rather than setting a flag.
- **Browser geolocation is never requested.** The Electron permission handler denies it outright;
  the first guess comes from the OS timezone and the user edits a city field.
- Refresh tokens live in the OS keychain via Electron's `safeStorage`, never in `localStorage`.

## Nutrition and safety

Nutrition figures are **estimates** computed from a public database. Ingredients that cannot be
matched or converted are **excluded from the total and reported** — "≈ 640 kcal per serving
(3 ingredients not counted)" — rather than silently guessed. Nothing in the app is dietary,
medical or allergen guidance, and the cooking assistant is instructed to tell users to check
labels rather than make allergen claims.

## Licence

Not yet chosen. Note the obligations above when picking one.
