# SPEC.md — CookBook

**Working name:** CookBook (Rotem, chat 2026-09-08; provisional, may change later). Repository name stays `recipe-social-network`; import alias stays `@rsn`.

**Status:** Draft 3, 2026-09-08. Built from `INTENT.txt`, `.env.example`, `.gitignore`, and Rotem's decisions in chat on 2026-09-08. Draft 3 re-verified every §16 source on 2026-09-08 (later session), fixed the scaffolding toolchain in §11.2, and added the UI design guide (§11.5). Rotem delegated the toolchain and UI-detail choices to me in chat on 2026-09-08 ("choose actions yourself"); rows that record such a choice say so in their Source column. All open points are resolved; this revision is the one to build from.

**Owner:** Rotem

---

## 0. Rules of this file

From INTENT.txt lines 30–33:

1. SPEC.md is the scaffolding of the project. No code is written from a chat prompt. A request first changes SPEC.md; code is then built from SPEC.md.
2. Nothing in this file is assumed. Every requirement is traced to INTENT.txt (line number given) or to a decision Rotem made in chat (date given). Facts about third-party services and tooling were verified online on 2026-09-08 and are linked in §16; they must be re-verified before scaffolding.
3. Anything INTENT.txt does not cover is absent from this file until Rotem decides it.

---

## 1. Product summary [INTENT L1–L2]

CookBook is a cooking social network for family and friends. Users create recipes, share them with each other, and can enter **cook mode**, a live step tracker with an AI helper for the current step.

---

## 2. Users and authentication

| ID | Requirement | Source |
|---|---|---|
| AUTH-1 | The app is user-based. | INTENT L20 |
| AUTH-2 | Sign-in with username + password. The user record (username, password hash, email if provided) lives in PostgreSQL and is owned by the backend. | INTENT L20; Rotem, chat 2026-09-08 |
| AUTH-3 | API requests are authenticated with JWT issued by the backend (access and refresh secrets and TTLs in `.env.example`). | Rotem, chat 2026-09-08 |
| AUTH-4 | Backend requests are tied to the signed-in user (required by private recipes, friends, and per-user logging). | INTENT L6, L18, L21 |

Firebase and Google sign-in (INTENT L20) were dropped by Rotem on 2026-09-08. Verified background for that decision: Firebase's JS SDK does not support Electron, `signInWithPopup` and `signInWithRedirect` do not work outside browsers, and Google blocks its OAuth endpoint inside embedded webviews (§16 F1–F5).

---

## 3. Recipes

### 3.1 Ownership and visibility

| ID | Requirement | Source |
|---|---|---|
| REC-1 | A user uploads a recipe for themself only; it is private by default. | INTENT L6 |
| REC-2 | A user can share a private recipe with friends without publishing it to the network. | INTENT L6 |
| REC-3 | A user can publish a recipe to the public space. | INTENT L7 |
| REC-4 | Every recipe is viewable as a preview without saving it; public ones appear in the Discover tab. | INTENT L8 |
| REC-5 | A recipe has ordered steps (cook mode tracks them), ingredients (nutrition is computed from them), and a serving size. | INTENT L3, L10 |
| REC-6 | The owner has full ownership of a recipe they made: changing viewing privileges, editing, and deleting. | Rotem, chat 2026-09-08 |
| REC-7 | Editing uses a versioning model. The owner sees every version. Visibility applies to the whole history: if a recipe is public, all of its versions are viewable by other users. | Rotem, chat 2026-09-08 |
| REC-8 | A shared recipe is view-only for the friends it is shared with; it stays local to the user who shared it. Friends can enter cook mode on it (COOK-5). | Rotem, chat 2026-09-08 |

Visibility states: `private`, `shared` (with chosen friends), `public`.

### 3.1.1 Recipe fields

The app is focused on usability: a recipe is the meal and how to make it, with no long-form exposition (Rotem, chat 2026-09-08). Fields marked "my call" were chosen by me at Rotem's request for usability in cook mode and in recommendations.

| Field | Type | Required | Source |
|---|---|---|---|
| title | text | yes | Rotem, chat 2026-09-08 |
| description | short text describing the meal | no | Rotem, chat 2026-09-08 |
| category | one of the 14 categories (DISC-7, DISC-8) | yes | Rotem, chat 2026-09-08 |
| servings | integer ≥ 1 | yes (default 2 for TheMealDB imports, CAT-4) | INTENT L10; Rotem |
| ingredients[] | structured list, ordered: `quantity` (decimal, empty allowed for "to taste"), `unit` (from a fixed list: g, kg, ml, l, tsp, tbsp, cup, piece, pinch, none), `name` (text), `note` (optional text, e.g. "chopped") | at least one | Rotem, chat 2026-09-08 (structured); unit list and `note` are my call |
| steps[] | ordered list: `text`, optional `durationMinutes` (shown as a timer in cook mode) | at least one | INTENT L3; timer is my call |
| prepMinutes, cookMinutes | integers | no | my call, used by recommendations for time of day |
| images | see §3.4 | no | Rotem, chat 2026-09-08 |

Not included, by the usability focus: difficulty, cuisine, free tags, story or headnote text. The USDA lookup (§9) uses `quantity`, `unit`, and `name`; the quarter-star display, votes, and versions attach to the recipe, not to a field.

### 3.4 Recipe images

| ID | Requirement | Source |
|---|---|---|
| IMG-1 | Recipe images are stored in **Cloud Storage for Firebase**. The Firebase project is on the Blaze plan (already active). | Rotem, chat 2026-09-08 |
| IMG-2 | Only the backend talks to Firebase, through the Admin SDK with a service-account credential. The desktop app contains no Firebase SDK and no Firebase key. | Rotem, chat 2026-09-08 |
| IMG-3 | Upload: the desktop app sends the image to the API; the API writes it to the bucket with the Admin SDK and stores the object path on the recipe. | Rotem, chat 2026-09-08 |
| IMG-4 | Display: the API returns a short-lived **signed URL** (read action, expiry chosen at build time, at most 7 days) for each image in a recipe response; the desktop app loads the URL directly. Private and shared recipes stay private because only users allowed to see the recipe receive its URLs. | Rotem, chat 2026-09-08 |
| IMG-5 | Security Rules deny all client access; the bucket is reached only by the service account. | follows from IMG-2 |

Verified Firebase facts (§16 F6–F10):

- Firestore: maximum document size is 1 MiB. Cloud Storage for Firebase is "for app developers who need to store and serve user-generated content, such as photos or videos".
- **A Firebase web API key is not a secret and grants no access.** Firebase docs: "API keys for Firebase services are not used to control access to backend resources; that can only be done with Firebase Security Rules ... and Firebase App Check." Access to files is decided by Security Rules, which identify the user through Firebase Authentication. Firebase Authentication was dropped from this app (§2), so a client SDK in the desktop app would be an anonymous caller.
- **Pricing plan:** since the September 2024 change, "to provision a new default bucket ... your project must be on the pay-as-you-go Blaze pricing plan", and "if your Firebase project is on the Spark pricing plan, you won't have access to any Cloud Storage buckets". No-cost usage still applies on Blaze: 5 GB stored, 1 GB/day downloaded on legacy `*.appspot.com` buckets, or 5 GB-months stored and 100 GB/month downloaded on `*.firebasestorage.app` buckets.
- The Firebase Admin SDK (Node) accesses buckets with `getStorage().bucket()`; the docs state the bucket references "are already authenticated with the credentials used to initialize your Firebase app" (the service account), and can produce download URLs. The underlying Google Cloud Storage client (`File.getSignedUrl`, `action: 'read'`) produces **signed URLs**: "a URL that provides limited permission and time to make a request"; "anyone in possession of the signed URL can use it while it's active, regardless of whether they have a valid account"; maximum expiry 7 days (604,800 seconds).
- The no-cost allowance on `*.firebasestorage.app` buckets applies only to buckets in `us-central1`, `us-west1` or `us-east1` (pricing footnote, §16 F10); the bucket used by IMG-1 is created in one of those regions.
- Package (§16 F12, 2026-09-08): `firebase-admin` 14.3.0 (Node ≥ 22) is the only Firebase dependency of the API; it brings `@google-cloud/storage` 7.x as its own optional dependency, and the standalone 8.1.0 release is outside that range, so `@google-cloud/storage` is never installed separately. (Rotem delegated the choice, chat 2026-09-08.)

### 3.2 Saving a public recipe

| ID | Requirement | Source |
|---|---|---|
| SAVE-1 | Any signed-in user can download a public recipe to their own account. | INTENT L7 |
| SAVE-2 | Cook mode is available for recipes the user has saved, for recipes the user owns, and for recipes shared with the user (REC-8). A public recipe viewed in Discover must be saved first. | INTENT L8; Rotem, chat 2026-09-08 |
| SAVE-3 | The home tab shows the user's saved recipes. | INTENT L15 |
| SAVE-4 | A saved recipe is stored locally to the user (a copy, not a link). The user can remove it from their page. | Rotem, chat 2026-09-08 |
| SAVE-5 | Editing a saved recipe creates a new saved entity, like a fork in git; the original published recipe is untouched. | Rotem, chat 2026-09-08 |
| SAVE-6 | A fork carries an attribution to the recipe it was forked from. | Rotem, chat 2026-09-08 |

### 3.3 Catalogue recipes from TheMealDB

| ID | Requirement | Source |
|---|---|---|
| CAT-1 | Recipes are pulled from TheMealDB with a **v2 (premium) key**. The key is already paid for and will be added to `.env` by Rotem. | INTENT L12 |
| CAT-2 | TheMealDB recipes appear in the Discover page only. | Rotem, chat 2026-09-08 |
| CAT-3 | A TheMealDB recipe is pulled into the database when a user saves it (SAVE-1). | Rotem, chat 2026-09-08 |
| CAT-4 | A saved TheMealDB recipe gets a default of 2 servings; the user can change it. | Rotem, chat 2026-09-08 |
| CAT-5 | TheMealDB's `strCategory` maps one-to-one onto the app's categories, since the app uses TheMealDB's list (DISC-7). | Rotem, chat 2026-09-08 |

Verified facts (§16 M1–M8):

- V2 URL format (official OpenAPI v2 spec): `https://www.themealdb.com/api/json/v2/{apiKey}/<endpoint>.php`. `.env.example` currently points at v1 with the test key `1` and changes to v2 for CAT-1.
- V2 endpoints: `search.php`, `lookup.php`, `filter.php`, `list.php`, `categories.php`, `random.php`, `randomselection.php` (10 random meals, premium), `popular.php`, `latest.php` (latest 10, premium). `filter.php?i=a,b,c` accepts up to four ingredients on V2. Premium lifts the 100-item cap on list results.
- Meal object fields: `idMeal`, `strMeal`, `strMealAlternate`, `strCategory`, `strArea`, `strCountry`, `strInstructions` (one text blob), `strMealThumb`, `strTags`, `strYoutube`, `strIngredient1..20`, `strMeasure1..20`, `strSource`, `strImageSource`, `strCreativeCommonsConfirmed`, `dateModified`.
- The object has no servings, no nutrition, no prep/cook time, and instructions are not split into steps.
- Terms: content returned from official endpoints may be copied and modified; attribution is required and is stated under "Paid API Usage", the tier CAT-1 uses ("Recipe data and imagery: TheMealDB (https://www.themealdb.com/)", the exact string from AGENTS.md, shown with the URL); publishing to an app store requires a paid subscription; no resale without specific permission. The FAQ states unlimited usage; the terms mention an unquantified rate limit; no numeric limit is published.
- Mapper facts (re-checked 2026-09-08, §16 M7, M8): unused ingredient slots are mixed, `""` on `strIngredient10..15` and `null` on `strIngredient16..20` of meal 52772, so the empty-slot test accepts both. The v2 test key `1` silently returns one item on `randomselection.php`, `latest.php` and `filter.php` instead of an error, and the v1 premium paths return a non-array `meals` object; the client therefore never falls back to v1, and Discover shows a single catalogue item until Rotem's paid key is in `.env.local`.

---

## 4. Friends

| ID | Requirement | Source |
|---|---|---|
| FR-1 | A friend system exists so users can share recipes privately, without publishing. | INTENT L6, L21 |
| FR-2 | Friendship is mutual: one user sends a request, the other accepts. | Rotem, chat 2026-09-08 |
| FR-3 | Users are found by username, or by email when the user has one on record. | Rotem, chat 2026-09-08 |

---

## 5. Discover tab

| ID | Requirement | Source |
|---|---|---|
| DISC-1 | The Discover tab shows previews of published recipes. | INTENT L8 |
| DISC-2 | From Discover a user can download a recipe (SAVE-1) and rate it (§6). | INTENT L7 |
| DISC-3 | Discover surfaces weather- and time-of-day-based advice (§8). | INTENT L15 |
| DISC-4 | Discover also lists TheMealDB catalogue recipes (CAT-2). | Rotem, chat 2026-09-08 |
| DISC-5 | The default view of Discover is split into food categories (for example tacos, burgers, healthy). | Rotem, chat 2026-09-08 |
| DISC-6 | A user can favourite up to 3 categories; favourites are pinned in Discover. | Rotem, chat 2026-09-08 |
| DISC-7 | The category list is TheMealDB's own list, fetched on 2026-09-08 from `list.php?c=list` (14 entries): Beef, Breakfast, Chicken, Dessert, Goat, Lamb, Miscellaneous, Pasta, Pork, Seafood, Side, Starter, Vegan, Vegetarian. | Rotem, chat 2026-09-08; §16 M9 |
| DISC-8 | A recipe owner picks exactly one category per recipe. | Rotem, chat 2026-09-08 |

---

## 6. Ratings, votes and comments

| ID | Requirement | Source |
|---|---|---|
| RATE-1 | Users grade a public recipe with whole stars, 1 to 5. | INTENT L7; Rotem, chat 2026-09-08 |
| RATE-2 | The value shown is the average of all grades, stored with two digits after the decimal point (`numeric(3,2)`, range 1.00–5.00). | INTENT L7; Rotem, chat 2026-09-08 |
| RATE-3 | The star display renders the average in quarter-star steps; hovering reveals the decimal value. | Rotem, chat 2026-09-08 |
| COM-1 | Public and shared recipes have a comment section. | INTENT L22 |
| COM-2 | On public recipes, comments have up and down votes, like Reddit, and are ranked by integer points, not by stars. | INTENT L22; Rotem, chat 2026-09-08 |

---

## 7. Cook mode and the AI assistant

| ID | Requirement | Source |
|---|---|---|
| COOK-1 | Cook mode tracks the recipe's steps live while cooking. | INTENT L3 |
| COOK-2 | At each step, one button lets the user ask an AI for tips or questions about the current step. | INTENT L3–L4 |
| COOK-3 | The AI is reached through OpenRouter with the **paid** model ID `minimax/minimax-m3` (INTENT named the free variant, which has no provider today; Rotem switched to paid on 2026-09-08). | INTENT L3; Rotem, chat 2026-09-08 |
| COOK-4 | Recipe context is attached automatically by an engineered prompt; the user never pastes the recipe. Prompts are written to conserve tokens. | INTENT L4; Rotem, chat 2026-09-08 |
| COOK-5 | Cook mode is available for owned, saved, and shared recipes (SAVE-2). | INTENT L8; Rotem, chat 2026-09-08 |
| COOK-7 | One server-side OpenRouter key is shared by all users. The account holds purchased credits (about $11 on 2026-09-08); paid-model requests draw on them at the model's per-token price (§7 facts), and OpenRouter has no documented request-count limit for paid models. | Rotem, chat 2026-09-08 |
| COOK-8 | Each user is limited to 100 AI requests per day (cook mode and recommendations combined), counted server-side before the call is made, as cost control for a personal project with 2–3 users. The value is the `OPENROUTER_SHARED_DAILY_QUOTA_PER_USER` environment variable. | Rotem asked me to choose, chat 2026-09-08 |
| COOK-9 | Chat history is not saved. Each question is a single request carrying the recipe context and the current step. | Rotem, chat 2026-09-08 |
| COOK-6 | Every AI prompt is logged server-side (§10). Therefore every OpenRouter call is made by the backend; the desktop app never holds the OpenRouter key. | INTENT L18 |

Verified OpenRouter facts (§16 O1–O12):

- Base URL `https://openrouter.ai/api/v1`, endpoint `POST /chat/completions`, OpenAI-compatible schema, `Authorization: Bearer <key>`.
- "minimax3" corresponds to the model ID `minimax/minimax-m3` (MiniMax M3, released 2026-05-31, 1,048,576-token context, text + image + video input). Paid pricing is about $0.30 input / $1.20 output per 1M tokens; on 2026-09-08 twelve providers served it, the cheapest being CoreWeave at $0.23 / $0.96 with a 262,144-token context and GMICloud at $0.24 / $0.96 with the full context. Cache reads cost $0.06 per 1M. A `minimax/minimax-m3:batch` sibling exists and is not used.
- The free variant `minimax/minimax-m3:free` has a model page but, on 2026-09-08 (re-checked in the later session), no serving endpoint and is absent from the public models list. A third-party post dated 2026-08-26 described M2.7 and M3 as free for a limited two-week period; that claim is refuted by O1 and O3 and is kept only as the record behind COOK-3.
- Free-model limits (IDs ending `:free`): 20 requests/minute; 50 requests/day per account when fewer than 10 credits have ever been purchased; 1,000/day once at least $10 of credits has been bought. Limits are per OpenRouter account, not per app user.
- Every response includes `usage` with `prompt_tokens`, `completion_tokens`, `total_tokens`, and `cost` in OpenRouter credits (1 credit = $1; the docs say "credits", not "USD"; the `usage: {include: true}` parameter is deprecated and has no effect). `GET /api/v1/generation?id=<gen-id>` returns `total_cost`, `native_tokens_prompt`, `native_tokens_completion`, `provider_name`, and `latency`.
- A request may carry a `models` array (priority-ordered fallback list); billing is for the model actually used, returned in the response `model` field.
- Data policy: each provider has its own retention and training policy; the account has separate training toggles for free and paid models; some free models explicitly train on prompts.

---

## 8. Weather- and time-based recommendations

| ID | Requirement | Source |
|---|---|---|
| WX-1 | The app fetches weather and location data from an API. | INTENT L15 |
| WX-2 | Advice appears in the Discover tab and in the home tab (from saved recipes), based on the weather and time of day; example: cold night → ramen. | INTENT L15–L16 |
| WX-3 | The decision is made by prompting an AI via OpenRouter with the needed context. | INTENT L16 |
| WX-4 | In the personal space the prompt asks the AI to rank several saved recipes, so multiple recommendations are shown. | INTENT L16 |
| WX-5 | If the user does not want a recommended recipe the app offers an immediate alternative; a "view next" action re-prompts with the already-recommended recipes removed. | INTENT L16 |
| WX-6 | These prompts are logged like all others (§10). | INTENT L18 |

| WX-7 | Weather provider: **Open-Meteo** (the URLs already in `.env.example`). | Rotem, chat 2026-09-08 |
| WX-8 | Location is derived from the **OS timezone only**; no IP lookup and no browser geolocation. | Rotem, chat 2026-09-08 |
| WX-9 | The desktop app reports the machine's IANA timezone (for example `Asia/Jerusalem`). The backend takes the city segment after the `/`, resolves it to coordinates with Open-Meteo geocoding (`name=<city>`), and calls the forecast with those coordinates and the timezone. Follows from WX-7 and WX-8. | derived |

Verified Open-Meteo facts (§16 W1–W5): no API key; free limits 600/min, 5,000/h, 10,000/day, 300,000/month; data licensed CC-BY 4.0 with attribution required; the free tier is for non-commercial use only. Forecast endpoint `https://api.open-meteo.com/v1/forecast` (`latitude`, `longitude`, `timezone`) returns `is_day`, `sunrise`, `sunset`, and `weather_code`. Geocoding endpoint `https://geocoding-api.open-meteo.com/v1/search` (`name`, `count`, `language`) is forward-only, city name to coordinates; there is no reverse geocoding.

Verified location facts behind WX-8 (§16 W7–W12): `navigator.geolocation` in Electron requires a Google API key on a project with a billing account and an explicit `geolocation` permission grant. Free IP-lookup services all carry a restriction: ip-api.com (no HTTPS on the free tier, non-commercial only), ipapi.co ("not for production use"), ipinfo.io Lite (country-level only).

---

## 9. Nutrition

| ID | Requirement | Source |
|---|---|---|
| NUT-1 | Users can view freely available nutritional data, such as calories per portion, and the recipe's serving size. | INTENT L10 |
| NUT-2 | Source: the USDA food database (FoodData Central). | INTENT L10 |
| NUT-3 | The app computes calories from either the entire meal name or from the ingredients. | INTENT L10 |
| NUT-4 | Ingredient-based calculation is the default; the user can switch to meal-name lookup. | Rotem, chat 2026-09-08 |
| NUT-5 | An ingredient that cannot be matched shows "nutrition data unavailable". | Rotem, chat 2026-09-08 |

Verified USDA FoodData Central facts (§16 U1–U8):

- Base `https://api.nal.usda.gov/fdc/v1`, key via `?api_key=`, signup through the api.data.gov form (no USDA page states a price; keys found online are deactivated). Limit 1,000 requests/hour per IP; HTTP 429 and a one-hour block when exceeded. `DEMO_KEY` is limited to 30/hour and 50/day per IP and is not used by the app. Data is CC0 (public domain); attribution requested, not required. The `.env.example` entries `USDA_FDC_KEY` and `USDA_FDC_BASE_URL` match.
- Endpoints: `GET /food/{fdcId}`, `GET|POST /foods`, `GET|POST /foods/list`, `GET|POST /foods/search` (params `query`, `dataType`, `pageSize`, `pageNumber`, `sortBy`, `sortOrder`; `dataType` is an array with the enum `Branded`, `Foundation`, `Survey (FNDDS)`, `SR Legacy`; Experimental is not searchable). Filtering by `Survey (FNDDS)` returned 400 over GET and worked with POST + JSON body during testing on 2026-09-08 (the later same-day re-run hit the `DEMO_KEY` limit); the client uses POST.
- Data types: Foundation (analytical, few household portions), SR Legacy (final release April 2018, has portions), Survey/FNDDS (composite dishes with per-100 g nutrients and portion weights, e.g. "Lasagna with meat" 139 kcal/100 g, observed 2026-09-08), Branded, Experimental. FNDDS is what makes NUT-3's meal-name lookup possible; its coverage is US-survey dishes. FNDDS 2021-2023 (5,432 items) is still the newest release; FDC data version 15.4 of 2026-08-20 changed Branded items only.
- Nutrient values in search results are per 100 g. Energy nutrient IDs (nutrient.csv, §16 U9): `1008` (kcal; SR Legacy, FNDDS, Branded), `1062` (kJ, never used), `2047` and `2048` (Atwater kcal; Foundation Foods dropped 1008 in October 2020). The client reads 1008, then 2047, then 2048, and never treats a missing ID as zero.
- Food detail exposes `foodPortions[]` with `gramWeight` (documented on Foundation and Survey items, absent on SR Legacy). The OpenAPI schema for search results has no `foodMeasures` property, so the client never reads it. Converting recipe quantities to grams is the app's responsibility.

---

## 10. AI prompt logging [INTENT L18]

| ID | Requirement |
|---|---|
| LOG-1 | Every AI prompt is logged server-side to see costs. |
| LOG-2 | Each log entry is appended to a file on the server machine for later review. |
| LOG-3 | Log files live in `<project root>/log/`, one file per day, entries in JSON. (Rotem, chat 2026-09-08) |
| LOG-4 | Each entry includes the full prompt and the full response text. (Rotem, chat 2026-09-08) |

Each entry also records: timestamp, user id, feature (cook mode or recommendation), model requested, model used (the response `model` field, which is what is billed), prompt and completion token counts, `usage.cost` in credits (1 credit = $1), generation id, and latency, all available from the OpenRouter response (§7).

---

## 11. Architecture

### 11.1 Stack

| Layer | Choice | Source | Latest stable on 2026-09-08 (§16 V1–V9) |
|---|---|---|---|
| Desktop shell | Electron wrapping React | INTENT L25 | Electron 44.2.0 (Chromium 152, Node 24.20) |
| Frontend | React + TypeScript | INTENT L25 | React 19.2.8; TypeScript 7.0.2 is latest, the workspace pins **TypeScript 6** (`~6.0.3`, see below) |
| Renderer bundler | Vite | Nx default (§11.2) | Vite 8.2.2 is latest, the workspace pins **Vite 7** (`^7.0.0`, see below) |
| Backend | NestJS 11 + TypeORM (see decision below) | INTENT L26; Rotem, chat 2026-09-08 | NestJS 12.0.1 (2026-08-27); NestJS 11.2.3 (2026-08-25); TypeORM 1.1.1 |
| Backend unit tests | Jest | INTENT L27 | Jest 30.5.1 |
| Database | PostgreSQL | INTENT L13 | PostgreSQL 18.6 (19 is Beta 3) |
| Runtime | Node.js | implied | Node 24 Active LTS (24.20.0) is the reference; Node 26 Current (26.8.1, installed on Rotem's PC as 26.5.0) is supported by every tool below and is what development runs on |
| Monorepo | Nx | Rotem, chat 2026-09-08 | Nx 23.2.0 |
| Package manager | pnpm | Rotem, chat 2026-09-08 | pnpm 12.3.4 |
| Desktop targets | Windows, macOS, Linux | Rotem, chat 2026-09-08 | — |
| Hosting | API and PostgreSQL run on Rotem's PC for now | Rotem, chat 2026-09-08 | — |

Verified version constraints:

- `@nx/nest` 23.2.0 declares peer support for `@nestjs/core >=10.0.0 <12.0.0`; NestJS 12 is outside that range.
- NestJS 12 ships ESM-first; Vitest is its default test runner for ESM projects and Jest remains the default for CommonJS projects. The official starter is now ESM + Vitest. Node ≥ 20.19 or ≥ 22.12 required.
- **Decision (Rotem, chat 2026-09-08, on my recommendation): the backend is NestJS 11, latest 11.2.3 (published 2026-08-25), as a CommonJS project with Jest.** Reasons: it is inside the Nx Nest plugin's supported range, so the `@nx/nest` generators work; Jest (INTENT L27) is NestJS's default for CommonJS projects; TypeORM 1.x supports it. The move to NestJS 12 is scheduled for when `@nx/nest` declares support for it, and until then no custom webpack config and no deep imports into Nest internals are written, since those are the two things NestJS 12's Rspack and ESM changes break.
- TypeORM 1.x removed `Connection`, `@EntityRepository`, and `AbstractRepository` relative to 0.3.x; code is written against 1.x from the start. `@nestjs/typeorm` 11.0.3 declares peers `typeorm ^0.3.0 || ^1.0.0-dev` and `@nestjs/core ^11`, which is the evidence that TypeORM 1.x works with NestJS 11 (§16 V11).
- **TypeScript 6, not 7 (Rotem delegated the choice, chat 2026-09-08).** Nx 23.2.0 installs `typescript ~6.0.3` (minimum 5.8.0) and its 23.1 release post says TypeScript 7 can only run side by side because 7.0 ships without a stable programmatic API, which Nx, Vite plugins and the Nest CLI use. The native compiler does support `experimentalDecorators` and `emitDecoratorMetadata` (typescript-go PR 2343), and electron-vite's maintainer will add `tsgo` "once stable", so the move to TypeScript 7 is scheduled for when Nx and electron-vite declare support (§16 N9, N10, V12, E3).
- **Vite 7, not 8 (Rotem delegated the choice, chat 2026-09-08).** electron-vite 5.0.0 declares the peer `vite ^5 || ^6 || ^7`; Vitest 5.0.0 needs Vite ≥ 6.4 and Node ≥ 22.12. Nx 23.2.0 installs Vite `^8.0.0` by default and supports `^7.0.0`; the workspace pins `vite ^7.0.0` so the renderer, the Electron build and Vitest share one Vite major. Vite 8 waits for electron-vite 6 (§16 E2, T1).
- **Node (Rotem delegated the choice, chat 2026-09-08).** Node 24 LTS stays the reference runtime (apps/CLAUDE.md). Nx 23 supports Node 26.x, 24.x and ^22.12.0 (§16 N9); Vitest 5, electron-vite 5, NestJS 11 and firebase-admin 14 all accept Node 26, so nothing is reinstalled on Rotem's PC. `package.json` `engines.node` is `^24.0.0 || ^26.0.0`. Node 20 is end-of-life and unsupported by Nx 23.

### 11.2 Nx monorepo (Rotem, chat 2026-09-08)

Verified Nx facts (§16 N1–N8):

- Nx 23.2.0. Workspace creation: `npx create-nx-workspace@latest`.
- `@nx/react` application generator: bundler defaults to Vite; with Vite, unit tests are set up with Vitest; e2e defaults to Playwright.
- `@nx/nest` provides `application`, `library`, and NestJS artefact generators (`module`, `controller`, `service`, `guard`, and others).
- Nx's documented layout: `apps/` for deployables, `libs/` grouped by **scope** (domain) with projects prefixed by **type**: `feature-*`, `ui-*`, `data-access-*`, `util-*`. Feature may depend on any type; ui on ui and util; data-access on data-access and util; util on util only.
- `@nx/enforce-module-boundaries` enforces these rules at lint time through project `tags` (`scope:*`, `type:*`) and `depConstraints`. Projects without tags cannot depend on anything unless `*` is allowed.
- The community plugin `nx-electron` is at 22.0.0, declares `@nx/devkit ^22.0.0` and `@nx/workspace ^22.0.0` as peers, bundles with webpack, and requires its major to match Nx's major. It does not support Nx 23.
- **Decision (Rotem, chat 2026-09-08): the Electron app is built with `electron-vite` 5.0.0** (main, preload, and renderer through Vite; Node 20.19+ or 22.12+), wired into Nx with `nx:run-commands` targets in `apps/desktop`. No Nx Electron plugin is used, so Nx and Electron can be upgraded independently.

Re-checked on 2026-09-08 (later session, §16 N5, N7, N9–N11): the React and Nest generators of 23.2.0 default `unitTestRunner` to `none`; the Nx article behind the type rules allows `ui → util` only; Nx 23's default workspace layout uses package-manager workspaces, where a project's import path is its npm package name and may hold one `/`.

#### 11.2.1 Workspace layout and creation (Rotem delegated the choice, chat 2026-09-08)

- **Layout: tsconfig paths, not package-manager workspaces.** The alias `@rsn/<scope>/<type>-<name>` (§11.3, also in every `libs/**/CLAUDE.md`) needs two slashes, which the workspaces layout cannot express. Nx 23.2.0 (`@nx/js` `ts-solution-setup.js`) uses the paths layout whenever `pnpm-workspace.yaml` has no `packages` key and `tsconfig.base.json` is not `composite`. The workspace therefore has a `tsconfig.base.json` with `paths`, no root `tsconfig.json`, and one `project.json` per project. `pnpm-workspace.yaml` exists only because pnpm 12 stores its settings there: the build-script allowlist (`allowBuilds`) and `minimumReleaseAgeExclude`, the by-name list of packages allowed to install before pnpm's default 1,440-minute release age (the WebdriverIO 9.31.7 packages were younger than that on 2026-09-08; §16 N13). It never gets a `packages` key. `baseUrl` is not set (deprecated in TypeScript 6, an error in 7); `paths` resolve relative to `tsconfig.base.json`. `moduleResolution` is `bundler` in `tsconfig.base.json` because TypeScript 6 rejects `node` (`node10`) with TS5107; the Nest projects override it per project (`module: commonjs`, `moduleResolution: bundler`, as the `@nx/nest` generator writes them).
- **Creation.** `npx create-nx-workspace@23.2.0` maps every preset to a GitHub template and ignores `--workspaces=false`, so the workspace was created in a scratch folder with `--preset=apps --pm=pnpm --formatter=prettier --linter=eslint --nxCloud=skip --skipGit --aiAgents=none`, converted to the paths layout as above, and only `package.json`, `nx.json`, `tsconfig.base.json`, `.prettierrc`, `.prettierignore` and `pnpm-lock.yaml` were carried into this repository. The Nx-generated `README.md`, `CLAUDE.md`, `AGENTS.md` and editor-agent folders were not carried over; this repository keeps its own.
- **Root `package.json`:** name `@rsn/source`, `private: true`, `engines.node ^24.0.0 || ^26.0.0`, `packageManager pnpm@12.3.4`. Every dependency is pinned by the generator that adds it; TypeScript `~6.0.3` and Vite `^7.0.0` are pinned by hand (§11.1).
- **Formatter:** Prettier 3 (`singleQuote: true`, the Nx default). **Linter:** ESLint with `@nx/eslint-plugin`; `@nx/enforce-module-boundaries` is an ESLint rule, so oxlint is not used.

#### 11.2.2 Generator flags (Rotem delegated the choice, chat 2026-09-08)

Every project is generated with the flags below, non-interactively, after a `--dry-run` that is compared with §11.3. Flags not listed keep the generator default of 23.2.0.

| Project | Generator | Flags |
|---|---|---|
| `apps/api` (+ `apps/api-e2e`) | `@nx/nest:application` | `--directory=apps/api --e2eTestRunner=jest --unitTestRunner=jest --linter=eslint --strict --tags=scope:api` |
| `apps/web` (+ `apps/web-e2e`) | `@nx/react:application` | `--directory=apps/web --bundler=vite --unitTestRunner=vitest --e2eTestRunner=playwright --linter=eslint --style=css --compiler=babel --routing=false --strict --tags=scope:web` |
| `apps/desktop` | none (plain `project.json`) | targets `dev`, `build`, `preview` as `nx:run-commands` wrapping `electron-vite` 5.0.0 (config `electron.vite.config.ts` with `main`, `preload`, `renderer`); `package` as `nx:run-commands` wrapping `electron-builder` 26.15.3 (MIT; the packager electron-vite's distribution guide recommends, §16 E4); `test` inferred by the `@nx/vitest` plugin from `vitest.config.mts` (Node environment); tag `scope:desktop`; Electron 44.2.0 (`engines.node >= 22.12.0`). `apps/desktop/package.json` (name `cookbook`, `main: out/main/index.js`, no dependencies) exists only because electron-builder reads the app's package.json; `electron-builder.yml` sets `appId dev.rsn.cookbook`, `productName CookBook`, output `dist/apps/desktop`, targets `nsis`, `dmg`, `AppImage`. The main window loads `ELECTRON_RENDERER_URL` in dev and `out/renderer/index.html` in production, with `contextIsolation`, `sandbox` and no `nodeIntegration`; the preload exposes `window.cookbook.timezone` (WX-9) and nothing else. |
| `apps/desktop-e2e` | none (plain `project.json`) | target `e2e` as `nx:run-commands` wrapping `wdio run wdio.conf.ts` with `@wdio/electron-service` 10.3.0 (peer `webdriverio >9.0.0`) on the WebdriverIO 9.31.7 stack (`@wdio/cli`, `@wdio/local-runner`, `@wdio/mocha-framework`, `webdriverio`, §16 T13); tag `scope:desktop` |

| `libs/api/*` | `@nx/nest:library` | `--directory=libs/api/<type>-<name> --importPath=@rsn/api/<type>-<name> --unitTestRunner=jest --linter=eslint --strict --buildable=false --tags=scope:api,type:<type>` |
| `libs/web/*` | `@nx/react:library` | `--directory=libs/web/<type>-<name> --importPath=@rsn/web/<type>-<name> --bundler=none --unitTestRunner=vitest --linter=eslint --style=css --compiler=babel --strict --buildable=false --tags=scope:web,type:<type>` |
| `libs/shared/*` | `@nx/js:library` | `--directory=libs/shared/<type>-<name> --importPath=@rsn/shared/<type>-<name> --bundler=none --unitTestRunner=vitest --linter=eslint --strict --tags=scope:shared,type:util` |

Project names follow `<scope>-<type>-<name>` for libraries (`api-feature-auth`, `web-feature-auth`), which the generators do not derive from the folder, so `--name` is passed explicitly; applications keep their folder name (`api`, `api-e2e`, `web`, `web-e2e`, `desktop`, `desktop-e2e`). Every `*-e2e` project carries the same `scope:*` tag as the app it tests.

Compiler contract after generation (Rotem delegated, 2026-09-08): `tsconfig.base.json` has `lib: ["es2022"]` only; `apps/web` and every `libs/web/*` add `dom` and `dom.iterable` in their own `tsconfig.json`; `libs/shared/*` set `types: []` in `tsconfig.lib.json`. So Node globals and the DOM are not even type-visible inside `scope:shared`, which enforces libs/shared/CLAUDE.md at compile time.

Reasons: `strict` is passed everywhere because `@nx/nest:application` alone defaults it to `false`; libraries are not buildable because the two applications bundle them and nothing is published; `bundler=none` on shared libraries keeps them dependency-free (§11.3); `compiler=babel` and `style=css` are the generator defaults and the design guide (§11.5) is plain CSS with custom properties; `routing=false` because the renderer is a tabbed Electron window, not a URL-driven site.

### 11.3 Folder structure

```
recipe-social-network/
├── apps/
│   ├── api/                        NestJS application: bootstrap and module wiring only
│   ├── api-e2e/                    API end-to-end tests (Jest)
│   ├── desktop/                    Electron main + preload (electron-vite)
│   ├── desktop-e2e/                Electron end-to-end tests
│   ├── web/                        React renderer (Vite), loaded by the Electron window
│   └── web-e2e/                    Playwright against the browser build of the renderer
├── libs/
│   ├── shared/                     scope:shared — usable by api, web, desktop
│   │   ├── util-domain/            entity types, enums, invariants; no runtime dependencies
│   │   └── util-contracts/         request/response DTO types shared by API and client
│   ├── api/                        scope:api
│   │   ├── data-access-db/         TypeORM entities, migrations, DataSource
│   │   ├── feature-auth/           username + password sign-in, JWT issue and verify
│   │   ├── feature-recipes/        private / shared / public recipes, save
│   │   ├── feature-friends/
│   │   ├── feature-discover/
│   │   ├── feature-social/         ratings, comments, votes
│   │   ├── feature-cook/           cook sessions, AI step helper, prompt assembly
│   │   ├── feature-nutrition/
│   │   ├── feature-recommend/      weather and time-of-day recommendations
│   │   ├── data-access-openrouter/ single OpenRouter client; prompt logging (§10)
│   │   ├── data-access-themealdb/  v2 client and mapper
│   │   ├── data-access-usda/       FoodData Central client
│   │   ├── data-access-weather/    Open-Meteo forecast and geocoding client
│   │   └── data-access-images/     Firebase Admin SDK: bucket upload, signed URLs (§3.4)
│   └── web/                        scope:web
│       ├── data-access-api/        typed API client and hooks
│       ├── feature-auth/
│       ├── feature-recipes/
│       ├── feature-discover/
│       ├── feature-friends/        friends tab: search, requests, accept/decline (§4; added 2026-09-08, Rotem delegated)
│       ├── feature-cook/
│       ├── feature-recommend/
│       └── ui/                     shared presentational components and the design tokens (§11.5)
├── design_handoff_cookbook_ui/     UI design guide (§11.5), not code
├── docker/                         PostgreSQL compose files (§12)
├── INTENT.txt
├── SPEC.md
├── .env.example
├── nx.json
├── package.json
└── tsconfig.base.json
```

`libs/web/feature-friends` was added on 2026-09-08 because the design guide has a Friends screen and §4 has the requirements, but no web library held them; its `CLAUDE.md` is Rotem's to write.

Import alias: `@rsn/<scope>/<type>-<name>`, for example `@rsn/shared/util-domain` and `@rsn/api/feature-recipes`. This is Nx's documented `@org/scope/type-name` pattern (§16 N7); `rsn` stands for recipe-social-network. Chosen by me at Rotem's request, chat 2026-09-08.

Boundary rules encoded in `depConstraints`:

| Tag | May depend on |
|---|---|
| `scope:shared` | `scope:shared` |
| `scope:api` | `scope:api`, `scope:shared` |
| `scope:web` | `scope:web`, `scope:shared` |
| `scope:desktop` | `scope:shared` |
| `type:feature` | `type:feature`, `type:data-access`, `type:ui`, `type:util` |
| `type:data-access` | `type:data-access`, `type:util` |
| `type:ui` | `type:ui`, `type:util` |
| `type:util` | `type:util` |

`type:ui → type:ui` is this project's own rule (kept on 2026-09-08, Rotem delegated the choice); the Nx article (§16 N7) allows `ui → util` only. The other rows match the article.

`apps/desktop` hosts `apps/web`: the Electron window loads the renderer build, so `desktop` declares `web` as an `implicitDependencies` entry in its `project.json` (a build-order edge between two applications). This is not a library import: `scope:desktop` code still imports `scope:shared` only, and the table above is unchanged. (Rotem delegated, 2026-09-08.)

Consequence: the renderer never imports backend code and never holds a third-party API key. The backend is the only caller of OpenRouter, TheMealDB, USDA, and the weather provider.

### 11.4 Secrets

`.env.local` is gitignored (`.gitignore` lines 14–17) and never committed. `.env.example` is committed with a placeholder for every key. The TheMealDB v2 key is added to `.env` by Rotem (INTENT L12).

### 11.5 UI design guide

| ID | Requirement | Source |
|---|---|---|
| UI-1 | `design_handoff_cookbook_ui/` is the UI **guidebook**: it fixes the look (theme tokens, component classes, typography, icon style, image treatment) and the interaction patterns of the screens it shows. It is not a concrete UI: SPEC.md decides which screens, fields and actions exist, and the guide is followed where it shows them. Where SPEC.md and the guide disagree, SPEC.md wins. | Rotem, chat 2026-09-08 ("only a guidebook not a concrete ui") |
| UI-2 | The app is branded **CookBook** everywhere (nav brand, window title, dialogs). The guide's earlier name was replaced on 2026-09-08. | Rotem, chat 2026-09-08 |
| UI-3 | The theme is the "Organic" system: `design_handoff_cookbook_ui/_ds/organic-*/styles.css` is ported verbatim (its `:root` tokens and component classes) into one global stylesheet owned by `libs/web/ui` and imported once by `apps/web`. Colours, spacing, radii and shadows are used only through the CSS custom properties; no hard-coded hex, font name or pixel value that a token carries. | guide README "Theme"; Rotem delegated, chat 2026-09-08 |
| UI-4 | Fonts: Caprasimo (headings, 400) and Figtree (body, variable 300–900 with italic). They are **bundled** through the npm packages `@fontsource/caprasimo` 5.3.0 and `@fontsource-variable/figtree` 5.3.0 (WOFF2, SIL OFL 1.1), imported by the `libs/web/ui` stylesheet; the `@import` of `fonts.googleapis.com` in the guide's `styles.css` is not carried over, so the renderer makes no network request outside the API (apps/web/CLAUDE.md). The OFL text and both copyright notices ship with the desktop build in a `licenses/` folder next to the app resources (OFL 1.1 clause 2 makes this a condition of bundling). | §16 D1–D4; Rotem delegated, chat 2026-09-08 |
| UI-5 | Icons: Lucide through `lucide-react` 1.43.0 (ISC), named imports only, rendered by one `Icon` wrapper in `libs/web/ui` that fixes `strokeWidth={2.75}` (the package default is 2). The ISC notice ships in the same `licenses/` folder. | guide README "Icons"; §16 D5–D8; Rotem delegated |
| UI-6 | Screens the guide shows (Home, Discover, Friends, Recipe detail, Cook mode, New-recipe dialog) are built from it. Screens SPEC.md requires but the guide lacks (sign-in and sign-up, the full recipe editor of §3.1.1, share-with-friends and visibility, version history, image upload, delete and remove-saved) are built from the same tokens and component classes, following the guide's rules: left-aligned layouts, pill buttons and inputs, `--radius-lg` containers, `.washed` images, accent `:focus-visible` ring, `.15s` transitions. | Rotem delegated, chat 2026-09-08 |
| UI-7 | The guide's screen-level behaviours that SPEC.md already settles are implemented as SPEC.md states them, in particular: the daily AI quota shown in cook mode comes from the API (COOK-8 counts server-side), the "New recipe" dialog opens the full editor because servings, ingredients and steps are required (§3.1.1), Discover keeps its category split (DISC-5) with the chip row as the filter, Discover also shows the recommendation strip (DISC-3), the home recommendation shows the ranked list (WX-4) with "Show another" as WX-5, comment votes appear on public recipes only (COM-2), and the TheMealDB footer carries the full attribution string with the URL (§3.3). | derived from §3–§8 |
| UI-8 | Guide details SPEC.md does not settle are decided when the owning `libs/web/*` library is built and recorded in that section of SPEC.md before the code is written (§0 rule 1); they are not decided in the guide. | Rotem, chat 2026-09-08 ("choose actions yourself"); §0 |

The guide's `support.js` and `.dc.html` are the prototype runtime and are never shipped or imported.

---

## 12. Data storage [INTENT L13]

| ID | Requirement |
|---|---|
| DB-1 | Data is stored in a PostgreSQL server for now. |
| DB-2 | The infrastructure allows moving the database to Docker later: connection settings are environment variables only (`DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME` in `.env.example`), and `docker/` holds the compose definition. |
| DB-3 | TypeORM `synchronize` is always false; schema changes go through migrations only (`.env.example` line 14). |
| DB-4 | The backend is the only process that talks to PostgreSQL. (Rotem, chat 2026-09-08) |
| DB-5 | Development database: PostgreSQL **18.6**, installed on Rotem's machine at `C:\Program Files\PostgreSQL\18`, Windows service `postgresql-x64-18` (running), port 5432. (Detected 2026-09-08 with `postgres.exe --version` and `postgresql.conf`.) |

---

## 13. Testing

| ID | Requirement | Source |
|---|---|---|
| TEST-1 | Backend unit tests run with Jest. | INTENT L27 |
| TEST-2 | Frontend testing suite, recommended per INTENT L28 (§16 T1–T11): | INTENT L28 |

| Layer | Tool | Justification |
|---|---|---|
| Renderer unit and component tests | Vitest 5.0.0 + React Testing Library 16.3.3 (with `@testing-library/dom` 10.x as an explicit devDependency, it is a peer) | Vitest reads `vite.config.*` directly; its docs state that keeping a second Jest pipeline for a Vite app "is not justifiable". RTL 16.3 supports React 18 and 19. The Nx React generators no longer set a unit runner by default (`unitTestRunner` defaults to `none` in 23.2.0), so `--unitTestRunner=vitest` is passed explicitly (§11.2). |
| Real-browser component tests | Vitest Browser Mode with `@vitest/browser-playwright` 5.0.0 + `vitest-browser-react` 2.3.0 | Browser Mode lost its experimental label in Vitest 4.0 (2025-10-22). `@vitest/browser-playwright` 5.0.0 declares the peer `vitest: 5.0.0` (exact) and a required `playwright` peer, so the root `package.json` pins `vitest` to exactly `5.0.0` (§16 T12, T14). |
| Electron main and preload unit tests | Vitest, Node environment, `vi.mock('electron')` | No official Electron unit-test runner exists; electron-vite's docs have no testing section; Vitest's Electron browser-mode issue is still open. |
| Electron end-to-end | `@wdio/electron-service` 10.3.0 (official WebdriverIO service, not marked experimental) | Playwright 1.63 `_electron` is still labelled experimental by Playwright; only WebdriverIO's service carries no experimental label. |

Vitest 5 requires Node ≥ 22.12 and Vite ≥ 6.4. Approved by Rotem, chat 2026-09-08. The Storybook Vitest addon (§16 T11) is not used: `@storybook/addon-vitest` 10.6.0 declares peers `vitest ^3 || ^4`, not 5 (re-checked 2026-09-08; Rotem delegated the choice).

---

## 14. `.env.example` analysis [INTENT L12]

| Key(s) | Relation to INTENT.txt |
|---|---|
| `NODE_ENV`, `API_PORT`, `API_GLOBAL_PREFIX` | Standard API configuration. |
| `DB_*` | Matches DB-1 and DB-2. |
| `JWT_ACCESS_*`, `JWT_REFRESH_*` | Matches AUTH-3. |
| `MODEL_KEY_ENCRYPTION_KEY` ("user-supplied model keys") | Not in INTENT.txt. |
| `THEMEALDB_KEY=1`, `THEMEALDB_BASE_URL=.../v1` | Contradicts CAT-1; becomes the v2 URL with the paid key. |
| `USDA_FDC_KEY`, `USDA_FDC_BASE_URL` | Matches NUT-2; URL verified. |
| `OPENROUTER_KEY`, `OPENROUTER_BASE_URL` | Matches COOK-3; URL verified. |
| `OPENROUTER_MODEL_PREFERENCE` (ordered fallback list) | COOK-3 fixes the model to `minimax/minimax-m3`. |
| `OPENROUTER_SHARED_DAILY_QUOTA_PER_USER=20` | Becomes 100 per COOK-8. |
| `OPENMETEO_FORECAST_URL`, `OPENMETEO_GEOCODING_URL` | Matches WX-7; URLs verified correct for Open-Meteo. |
| `LOCATION_COORD_PRECISION` | Not in INTENT.txt. |
| `STORAGE_*` (S3-compatible object storage) | Superseded by Firebase Cloud Storage (§3.4); replaced by the Firebase project id, bucket name, and service-account credential path. |
| `VITE_API_BASE_URL` | Public, build-time renderer configuration. |

The file's comments reference sections of a document that no longer exists in the repository; the file is regenerated from this SPEC once its keys are settled.

---

## 15. Out of scope

Not mentioned in INTENT.txt and therefore not part of this specification: mobile or web clients, URL import of recipes, shopping lists, notifications, moderation or reporting, internationalisation, offline mode, analytics.

---

## 16. Sources (all fetched 2026-09-08)

**Firebase / Google sign-in (dropped 2026-09-08; kept as the record behind that decision)**
- F1 https://firebase.google.com/support/guides/environments_js-sdk — supported environments; popup/redirect unsupported outside browsers; no Electron.
- F2 https://firebase.google.com/docs/auth/web/google-signin — manual flow with `GoogleAuthProvider.credential(idToken)` and `signInWithCredential`.
- F3 https://github.com/firebase/firebase-js-sdk/issues/2478 and https://github.com/firebase/firebase-js-sdk/issues/6444 — maintainers: Electron popup/redirect not supported.
- F4 https://developers.google.com/identity/protocols/oauth2/native-app — Desktop app client, loopback redirect, PKCE, `disallowed_useragent`.
- F5 https://developers.googleblog.com/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/ — embedded webviews blocked.

**Firebase storage for images (§3.4)**
- F6 https://firebase.google.com/docs/projects/api-keys — API keys are not secrets and do not control access; Security Rules and App Check do.
- F7 https://firebase.google.com/docs/storage/ — Cloud Storage for Firebase is for photos and videos; access through Security Rules + Firebase Authentication.
- F8 https://firebase.google.com/docs/firestore/quotas — 1 MiB maximum document size.
- F9 https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024 — Blaze plan required for buckets; Spark projects get 402/403.
- F10 https://firebase.google.com/pricing and https://firebase.google.com/docs/storage/admin/start — no-cost allowances (firebasestorage.app quota only in us-central1, us-west1, us-east1); `getStorage().bucket()` is pre-authenticated with the init credentials; download URLs.
- F11 https://docs.cloud.google.com/storage/docs/access-control/signed-urls and https://docs.cloud.google.com/nodejs/docs/reference/storage/latest/storage/getsignedurlconfig — signed URLs, 604,800 s maximum expiry, `action: 'read'`.
- F12 https://registry.npmjs.org/firebase-admin and https://registry.npmjs.org/@google-cloud/storage — firebase-admin 14.3.0 (Node ≥ 22) with optional `@google-cloud/storage ^7.22.0`; standalone latest 8.1.0 is outside that range.

**OpenRouter**
- O1 https://openrouter.ai/api/v1/models — model list; no MiniMax `:free` entries.
- O2 https://openrouter.ai/minimax/minimax-m3 — M3 page: pricing, context, release date.
- O3 https://openrouter.ai/minimax/minimax-m3:free and https://openrouter.ai/api/v1/models/minimax/minimax-m3:free/endpoints — page exists; `endpoints: []`.
- O4 https://openrouter.ai/collections/free-models — current free models; provider training statements.
- O5 https://openrouter.ai/docs/api-reference/limits and https://openrouter.ai/docs/faq — 20 RPM; 50/day versus 1,000/day.
- O6 https://openrouter.ai/docs/api-reference/overview — base URL, OpenAI compatibility, headers.
- O7 https://openrouter.ai/docs/api-reference/chat-completion — `models` array; usage schema.
- O8 https://openrouter.ai/docs/use-cases/usage-accounting — usage always included; `cost` field.
- O9 https://openrouter.ai/docs/api-reference/get-a-generation — `/generation?id=` fields.
- O10 https://openrouter.ai/docs/features/privacy-and-logging and https://openrouter.ai/docs/guides/privacy/data-collection — provider policies; free/paid training toggles.
- O11 https://openrouter.ai/docs/guides/routing/model-fallbacks — fallback semantics.
- O12 https://daily.dev/posts/minimax-m2-7-and-m3-are-completely-free-ai-coding-openrouter-softwareengineer-6vblnf0fz — third-party: two-week free promotion (2026-08-26); refuted by O1 and O3 on 2026-09-08, kept as the record behind COOK-3.
- O13 https://openrouter.ai/api/v1/models/minimax/minimax-m3/endpoints — 12 providers on 2026-09-08; CoreWeave $0.23/$0.96 at 262,144 context; GMICloud $0.24/$0.96 at 1,048,576.

**TheMealDB**
- M1 https://www.themealdb.com/api/spec/openapi-v2.yaml — v2 `/{apiKey}/` paths; endpoint list; four-ingredient filter.
- M2 https://www.themealdb.com/api.php — premium endpoints ("10 random meals", "Latest Meals"); 100-item cap; PayPal signup.
- M3 https://www.themealdb.com/docs_api_guide.php — v1/v2 base URLs; £10 lifetime upgrade; "latest 10"; image variants `/small` `/medium` `/large` (200, 350, 500 px per M6).
- M4 https://www.themealdb.com/faq.php — unlimited usage; commercial tier.
- M5 https://www.themealdb.com/terms_of_use.php — copy/modify allowed; attribution; app-store rule; resale.
- M6 https://www.themealdb.com/AGENTS.md — attribution string; premium feature list; responsible-use note.
- M7 https://www.themealdb.com/api/json/v1/1/lookup.php?i=52772 — meal object fields.
- M8 https://www.themealdb.com/api/json/v2/1/randomselection.php (and latest.php, filter.php) — test key returns one item on v2 premium endpoints; v1 premium paths return a non-array `meals` object.
- M9 https://www.themealdb.com/api/json/v1/1/list.php?c=list — the 14 category names.

**USDA FoodData Central**
- U1 https://fdc.nal.usda.gov/api-guide/ — key via `?api_key=`; 1,000/h per IP, 429 and 1 h block; `DEMO_KEY` 30/h and 50/day; endpoints; CC0.
- U2 https://fdc.nal.usda.gov/api-spec/fdc_api.html — search params; `dataType` enum (no Experimental); `FoodPortion.gramWeight`; no `foodMeasures` in `SearchResultFood`.
- U3 https://fdc.nal.usda.gov/faq/ and https://fdc.nal.usda.gov/data-documentation/ — data types; SR Legacy final release April 2018.
- U4 https://fdc.nal.usda.gov/Foundation_Foods_Documentation/ — 1008 dropped from Foundation; 2047/2048.
- U5 https://fdc.nal.usda.gov/api-key-signup/ — api.data.gov signup form; keys found online are deactivated; no price stated.
- U6 Live `POST /foods/search` with `dataType: ["Survey (FNDDS)"]` (2026-09-08, first session) — composite dishes; GET with that filter returned 400; the later same-day re-run hit the `DEMO_KEY` limit.
- U7 Live `/food/171077` (2026-09-08, first session) — `foodPortions` gram weights; the later same-day re-run hit the `DEMO_KEY` limit.
- U8 https://www.ars.usda.gov/ARSUserFiles/80400530/pdf/fndds/2021_2023_FNDDS_Doc.pdf and https://www.ars.usda.gov/northeast-area/beltsville-md-bhnrc/beltsville-human-nutrition-research-center/food-surveys-research-group/docs/fndds/ — per-100 g values; 5,432 items; 2021-2023 is the newest release.
- U9 https://fdc.nal.usda.gov/download-datasets (nutrient.csv in FoodData_Central_Supporting_Data_csv_2022-10-28.zip) — 1008 Energy KCAL; 1062 Energy kJ; 2047/2048 Atwater KCAL.
- U10 https://fdc.nal.usda.gov/log/ — FDC v15.4 (2026-08-20), Branded only; no Survey release since 2021-2023.

**Weather / location**
- W1 https://open-meteo.com/en/terms — CC-BY 4.0; non-commercial; 600/min, 5,000/h, 10,000/day.
- W2 https://open-meteo.com/en/pricing — free tier figures incl. 300,000/month; no key.
- W3 https://open-meteo.com/en/docs — forecast URL; `is_day`, `sunrise`, `sunset`.
- W4 https://open-meteo.com/en/docs/geocoding-api — search endpoint; GeoNames.
- W5 https://github.com/open-meteo/open-meteo/discussions/698 — no reverse geocoding.
- W6 https://openweathermap.org/full-price, https://docs.openweather.co.uk/faq, https://docs.openweather.co.uk/api/geocoding-api, https://docs.openweather.co.uk/current, https://docs.openweather.co.uk/api/one-call-3 — key required; 60/min; One Call 3.0 1,000/day (the pricing page now brands it "One Call API 4.0"); reverse geocoding; sunrise/sunset.
- W7 https://www.electronjs.org/docs/latest/api/environment-variables — `GOOGLE_API_KEY` and billing account for geolocation.
- W8 https://www.electronjs.org/docs/latest/api/session — `geolocation` permission handler.
- W9 https://github.com/electron/electron/issues/22005 — geolocation fails without a key on a billing-enabled project (Chromium ships no built-in key).
- W10 https://ip-api.com/docs/legal and https://ip-api.com/docs/api:json — non-commercial; no SSL on the free tier; 45/min.
- W11 https://ipapi.co/pricing/ — 1,000/day; "Not for production use".
- W12 https://ipinfo.io/lite and https://ipinfo.io/pricing — country-level only.

**Versions**
- V1 https://registry.npmjs.org/@nestjs/core/latest, https://api.github.com/repos/nestjs/nest/releases/tags/v12.0.0, https://trilon.io/blog/nestjs-12-is-now-available — NestJS 12.0.1; ESM; Vitest for ESM, Jest for CJS. `npm view @nestjs/core@11 version` — latest 11.x is 11.2.3 (2026-08-25).
- V2 https://raw.githubusercontent.com/nestjs/typescript-starter/master/package.json — starter is ESM + Vitest.
- V3 https://registry.npmjs.org/typeorm/latest and https://api.github.com/repos/typeorm/typeorm/releases/tags/1.0.0 — TypeORM 1.1.1; 1.0 breaking changes.
- V4 https://releases.electronjs.org/ and https://endoflife.date/electron — Electron 44.2.0.
- V5 https://registry.npmjs.org/react/latest — React 19.2.8.
- V6 https://registry.npmjs.org/vite/latest — Vite 8.2.2.
- V7 https://nodejs.org/en/about/previous-releases and https://endoflife.date/nodejs — Node 24 Active LTS.
- V8 https://www.postgresql.org/ and https://endoflife.date/postgresql — PostgreSQL 18.6; 19 Beta 3.
- V9 https://registry.npmjs.org/jest/latest (30.5.1) and https://registry.npmjs.org/typescript/latest (7.0.2).
- V10 `npm view pnpm version` — pnpm 12.3.4 (Node ≥ 18).
- V11 https://registry.npmjs.org/@nestjs/typeorm — 11.0.3 peers `typeorm ^0.3.0 || ^1.0.0-dev`, `@nestjs/core ^11`.
- V12 https://github.com/microsoft/typescript-go/pull/2343 and https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/ — tsgo emits `__decorate`/`__metadata`/`__param`; TS 7.0 has no stable programmatic API (7.1 will); hard errors on `baseUrl`, `moduleResolution: node`.
- V13 https://registry.npmjs.org/pg and https://registry.npmjs.org/@types/pg — pg 8.23.0 (MIT); @types/pg 8.23.1; typeorm 1.1.1 optional peer `pg ^8.5.1`.
- V14 https://registry.npmjs.org/@nestjs/typeorm — latest 12.0.1, peers `@nestjs/core ^10 || ^11 || ^12`, `typeorm ^0.3.0 || ^1.0.0-dev`; 11.0.3 peers stop at ^11. The API uses 12.0.1 so the NestJS 12 move (§11.1) stays open (Rotem delegated, 2026-09-08).
- V15 https://registry.npmjs.org/@nestjs/config, /@nestjs/jwt, /@nestjs/passport, /passport-jwt, /bcrypt, /argon2 — config 12.0.0, jwt 12.0.1, passport 12.0.0 (all peer `@nestjs/common ^11 || ^12`); passport-jwt 4.0.1; passport 0.7.0; bcrypt 6.0.0; argon2 0.45.1. Which of these feature-auth uses is decided in §2 when that library is built.

**Nx**
- N1 https://registry.npmjs.org/nx/latest — Nx 23.2.0.
- N2 https://registry.npmjs.org/@nx/nest/latest — 23.2.0; peer `@nestjs/core >=10.0.0 <12.0.0`.
- N3 https://registry.npmjs.org/@nx/react/latest — 23.2.0; peer React 18–19.
- N4 https://nx.dev/docs/technologies/node/nest/generators — generator list and defaults.
- N5 https://nx.dev/docs/technologies/react/generators — bundler default Vite; `unitTestRunner` default `none` in 23.2.0; Playwright default e2e.
- N6 https://nx.dev/docs/features/enforce-module-boundaries — tags and `depConstraints`.
- N7 https://nx.dev/blog/virtuous-cycle-of-workspace-structure — `libs/<scope>/<type>-<name>`; ui → util only; workspaces layout allows one `/` in a package name.
- N8 https://nx.dev/docs/getting-started/start-new-project — `npx create-nx-workspace@latest`; templates; presets map to GitHub templates in 23.2.0.
- N9 https://nx.dev/using-nx/nx-nodejs-typescript-version-matrix — Nx 23.x supports Node 26.x, 24.x, ^22.12.0.
- N10 https://nx.dev/blog/nx-23-1-release and https://registry.npmjs.org/@nx/js/-/js-23.2.0.tgz (`versions.js`) — TypeScript `~6.0.3` installed, minimum 5.8.0; TS 7 side by side only.
- N11 `schema.json` of `@nx/nest`, `@nx/react`, `@nx/js` 23.2.0 (registry tarballs) — generator options and defaults behind §11.2.2; `@nx/vite` 23.2.0 `versions.js` installs `vite ^8.0.0` and supports `^7.0.0`.
- N12 `@nx/js` 23.2.0 `dist/src/utils/typescript/ts-solution-setup.js` and `package-manager-workspaces.js` — layout detection behind §11.2.1.
- N13 https://pnpm.io/settings/build and https://pnpm.io/settings/dependency-resolution — pnpm 12 `allowBuilds` map in `pnpm-workspace.yaml`; `strictDepBuilds` (default true) fails the install on unreviewed build scripts; `onlyBuiltDependencies` removed in v11; `minimumReleaseAge` default 1440 minutes since v11, `minimumReleaseAgeExclude` lists packages by name that may install immediately.

**Electron tooling**
- E1 https://registry.npmjs.org/nx-electron/latest and https://github.com/bennymeg/nx-electron — 22.0.0; peers `@nx/devkit ^22`; webpack; major must match Nx.
- E2 https://electron-vite.org/guide/ and https://registry.npmjs.org/electron-vite — 5.0.0; main/preload/renderer; Node 20.19+ or 22.12+; peer `vite ^5 || ^6 || ^7`; Vite 8 only in 6.0.0-beta (issue 925).
- E3 https://github.com/alex8088/electron-vite/issues/880 — maintainer: `tsgo` added to the scaffolding once stable; no TypeScript 7 support in 5.x docs or changelog.
- E4 https://registry.npmjs.org/electron (44.2.0, engines node >= 22.12.0), https://electron-vite.org/guide/ (config keys main/preload/renderer; CLI `dev`, `build`, `preview`), https://electron-vite.org/guide/distribution and https://registry.npmjs.org/electron-builder (26.15.3, MIT, recommended packager).

**Testing**
- T1 https://vitest.dev/guide/ and https://registry.npmjs.org/vitest/latest — Vitest 5.0.0; Node ≥ 22.12; Vite ≥ 6.4.
- T2 https://vitest.dev/blog/vitest-4 — Browser Mode no longer experimental.
- T3 https://vitest.dev/blog/vitest-5 — 2026-09-03 release.
- T4 https://vitest.dev/guide/browser/ — provider packages; `vitest-browser-react`.
- T5 https://vitest.dev/guide/comparisons — Jest versus Vitest for Vite apps.
- T6 https://registry.npmjs.org/@testing-library/react/latest and https://testing-library.com/docs/react-testing-library/intro/ — 16.3.3; React 18/19 peers.
- T7 https://playwright.dev/docs/api/class-electron and https://registry.npmjs.org/@playwright/test/latest — experimental Electron support; 1.63.0.
- T8 https://webdriver.io/docs/desktop-testing/electron/, https://registry.npmjs.org/@wdio/electron-service/latest, https://github.com/webdriverio/desktop-mobile — 10.3.0; maintained.
- T9 https://github.com/vitest-dev/vitest/issues/5883 — Electron browser-mode issue open.
- T10 https://electron-vite.org/guide/ — no testing section.
- T11 https://storybook.js.org/docs/writing-tests/integrations/vitest-addon and `npm view @storybook/addon-vitest peerDependencies` — addon 10.6.0 peers `vitest ^3 || ^4`; not used with Vitest 5.
- T12 https://registry.npmjs.org/vitest/latest — engines `^22.12.0 || ^24.0.0 || >=26.0.0`; peer `vite ^6.4.0 || ^7.0.0 || ^8.0.0`; `@vitest/browser-playwright` 5.0.0; `vitest-browser-react` 2.3.0 peers vitest ^4 || ^5.
- T13 https://registry.npmjs.org/@wdio/electron-service (10.3.0, peers `webdriverio >9.0.0`, `electron *`, node ≥ 22.12) and https://registry.npmjs.org/webdriverio — webdriverio, @wdio/cli, @wdio/local-runner, @wdio/mocha-framework all 9.31.7 and `@wdio/globals` 9.31.3 (its latest, for the `WebdriverIO.Config` types); the Electron guide's install line names `@wdio/electron-service` only.
- T14 https://registry.npmjs.org/@vitest/browser-playwright — 5.0.0 peers `vitest 5.0.0` (exact) and `playwright *` (required); https://registry.npmjs.org/vitest-browser-react — 2.3.0 peers `vitest ^4 || ^5`, react ^18 || ^19.

**Design guide (§11.5)**
- D1 https://raw.githubusercontent.com/google/fonts/main/ofl/caprasimo/OFL.txt — Caprasimo, SIL OFL 1.1.
- D2 https://raw.githubusercontent.com/google/fonts/main/ofl/figtree/OFL.txt — Figtree, SIL OFL 1.1; clause 2 allows bundling with software when the notice and licence ship with it.
- D3 https://github.com/google/fonts/tree/main/ofl/caprasimo and https://github.com/google/fonts/tree/main/ofl/figtree — Caprasimo static 400 only; Figtree variable wght 300–900 upright and italic; upstream files are TTF.
- D4 https://registry.npmjs.org/@fontsource/caprasimo and https://registry.npmjs.org/@fontsource-variable/figtree — both 5.3.0, `license: OFL-1.1`, WOFF2 (Caprasimo also WOFF), latin and latin-ext subsets.
- D5 https://registry.npmjs.org/lucide-react — 1.43.0; peer `react ^16.5.1 || ^17 || ^18 || ^19`; `sideEffects: false`.
- D6 https://lucide.dev/license — ISC; matches the LICENSE file in the 1.43.0 tarball.
- D7 https://lucide.dev/guide/react/basics/stroke-width and https://lucide.dev/guide/react/basics/sizing — `strokeWidth` prop (default 2), `size` prop (default 24).
- D8 https://lucide.dev/guide/packages/lucide-react — "Only the icons you import are included in your final bundle."
