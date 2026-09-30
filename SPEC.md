# SPEC.md — CookBook

**Working name:** CookBook (Rotem, chat 2026-09-08; provisional, may change later). Repository name stays `recipe-social-network`; import alias stays `@rsn`.

**Status:** Draft 6, 2026-09-30. Rotem's answers of 2026-09-30 to the review's questions are included: recommendation cache and `max_tokens` 1500 (WX-10, COOK-10), cook-mode panels, keys, timers and scrolling answer (UI-15), recipe limits (§3.1.1), receiver cancels and immediate re-request (FR-4), nutrition container words (NUT-8), editor warnings (UI-40), text direction (UI-41), and the guide as general look only (UI-1). Draft 6 records the fixes and details decided from the QA review `docs/reviews/QA-REVIEW-2026-09-29.md` under Rotem's delegation (UI-18 to UI-39; additions to IMG-6, AUTH-6, WX-9, CAT-6, DISC-9, COM-3, DB-6 and §11.6; Rotem, chat 2026-09-29). Previously: Draft 5, 2026-09-29. Draft 5 settles who owns a saved recipe across Home and Discover: saved copies and forks (SAVE-7..10), TheMealDB saves as copies (CAT-7), already-saved items in Discover (DISC-10), image rights shared by copies (IMG-7), with the matching §11.5, §11.6 and §12.1 changes (Rotem, chat 2026-09-29). Previously: Draft 4, 2026-09-28. Draft 4 adds what the first full build needed: auth mechanics (§2), the API surface (§11.6), the database schema (§12.1), the remaining UI details (§11.5 UI-9 onwards), the env key list (§14) and today's package versions (§16 V16–V18, D9, S1). Rotem asked on 2026-09-28 to "finish the app according to SPEC.md"; every detail SPEC.md did not settle was decided under the 2026-09-08 delegation and is marked "Rotem delegated". Previously: Draft 3, 2026-09-08. Built from `INTENT.txt`, `.env.example`, `.gitignore`, and Rotem's decisions in chat on 2026-09-08. Draft 3 re-verified every §16 source on 2026-09-08 (later session), fixed the scaffolding toolchain in §11.2, and added the UI design guide (§11.5). Rotem delegated the toolchain and UI-detail choices to me in chat on 2026-09-08 ("choose actions yourself"); rows that record such a choice say so in their Source column. All open points are resolved; this revision is the one to build from.

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

| AUTH-5 | Sign-up takes `username` (3–32 chars, `[a-z0-9_.-]`, stored lower-case, unique), `password` (8–128 chars) and optional `email` (unique when present, stored lower-case). Sign-in takes username + password. | Rotem delegated, chat 2026-09-28 |
| AUTH-6 | Passwords are hashed with **scrypt** from `node:crypto`, N=2¹⁷, r=8, p=1, 16-byte random salt, 64-byte key, stored as `scrypt$N$r$p$<salt b64>$<key b64>`; comparison is constant-time (`timingSafeEqual`). A sign-in for an unknown username runs the same scrypt derivation against a fixed dummy hash before answering, so an unknown user and a wrong password take the same time and get the same 401 message (Rotem delegated, chat 2026-09-29). OWASP lists Argon2id first and scrypt second (§16 S1); scrypt was chosen because it needs no native module, so nothing runs a build script on install. | Rotem delegated, chat 2026-09-28 |
| AUTH-7 | Tokens: an access JWT (`JWT_ACCESS_SECRET`, `JWT_ACCESS_TTL`, default 15m) carrying `sub` (user id) and `username`, and a refresh JWT (`JWT_REFRESH_SECRET`, `JWT_REFRESH_TTL`, default 30d) carrying `sub` and `typ: refresh`, both HS256 through `@nestjs/jwt`. `POST /auth/refresh` exchanges a valid refresh token for a new pair. Sign-out discards the tokens on the client; there is no server-side session table. Package: `@nestjs/jwt` 11.0.2 (§16 V19). | Rotem delegated, chat 2026-09-28 |
| AUTH-8 | Every route except `POST /auth/sign-up`, `POST /auth/sign-in`, `POST /auth/refresh` and `GET /health` requires `Authorization: Bearer <access token>`; a global guard rejects with 401. | derived from AUTH-3, AUTH-4 |

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
| REC-6 | The owner has full ownership of a recipe they made: changing viewing privileges, editing, and deleting. A saved copy (SAVE-7) is owned by the user who saved it but stays private until its first edit (SAVE-8) and is removed rather than deleted. | Rotem, chat 2026-09-08; saved-copy exception Rotem, chat 2026-09-29 |
| REC-7 | Editing uses a versioning model. The owner sees every version. Visibility applies to the whole history: if a recipe is public, all of its versions are viewable by other users. | Rotem, chat 2026-09-08 |
| REC-8 | A shared recipe is view-only for the friends it is shared with; it stays local to the user who shared it. Friends can enter cook mode on it (COOK-5). | Rotem, chat 2026-09-08 |

Visibility states: `private`, `shared` (with chosen friends), `public`.

### 3.1.1 Recipe fields

The app is focused on usability: a recipe is the meal and how to make it, with no long-form exposition (Rotem, chat 2026-09-08). Fields marked "my call" were chosen by me at Rotem's request for usability in cook mode and in recommendations.

| Field | Type | Required | Source |
|---|---|---|---|
| title | text, at most 200 characters (limit: Rotem delegated, 2026-09-28) | yes | Rotem, chat 2026-09-08 |
| description | short text describing the meal, at most 500 characters (limit: Rotem delegated, 2026-09-28) | no | Rotem, chat 2026-09-08 |
| category | one of the 14 categories (DISC-7, DISC-8) | yes | Rotem, chat 2026-09-08 |
| servings | integer 1–6 (Rotem, chat 2026-09-30: "cap at 6 serving"); the detail screen's servings stepper (UI-14) is capped at 6 too | yes (default 2 for TheMealDB imports, CAT-4) | INTENT L10; Rotem |
| ingredients[] | structured list, ordered: `quantity` (decimal, empty allowed for "to taste"), `unit` (from a fixed list: g, kg, ml, l, tsp, tbsp, cup, piece, pinch, none), `name` (text), `note` (optional text, e.g. "chopped") | at least one | Rotem, chat 2026-09-08 (structured); unit list and `note` are my call |
| steps[] | ordered list: `text`, optional `durationMinutes` (shown as a timer in cook mode) | at least one | INTENT L3; timer is my call |
| prepMinutes, cookMinutes | integers | no | my call, used by recommendations for time of day |
| images | see §3.4 | no | Rotem, chat 2026-09-08 |

Upper limits (Rotem, chat 2026-09-30; servings and the 120-minute timer are Rotem's, the rest Rotem delegated), enforced by the create and update DTOs (400) and by `maxLength`/`max` in the editor: title 200 and description 500 characters (above); `prepMinutes` and `cookMinutes` 0–1440; at most 50 ingredients, each `name` 1–120 characters, `note` at most 120, `quantity` above 0 and at most 10000 when present; at most 60 steps, each `text` 1–1000 characters, `durationMinutes` 1–1440 (cook mode offers a timer only up to 120, UI-15). A TheMealDB save that would exceed a limit keeps the first 60 steps and the first 50 ingredients. An optional field sent as `null` (`description`, `note`, `prepMinutes`, `cookMinutes`, `durationMinutes`) counts as absent, and the editor treats a stored `null` note as empty, so such a recipe can be edited again (2026-09-30, QA-REVIEW-2026-09-30-3 BUG-033, Rotem delegated). Rows saved before these limits keep their values until their next edit, which must satisfy them; a copy (SAVE-7) and a sync (SAVE-10) take the source's content as it is, without applying the limits, and a TheMealDB save applies only the step and ingredient cut above (Rotem delegated, chat 2026-09-30).

Not included, by the usability focus: difficulty, cuisine, free tags, story or headnote text. The USDA lookup (§9) uses `quantity`, `unit`, and `name`; the quarter-star display, votes, and versions attach to the recipe, not to a field.

### 3.4 Recipe images

| ID | Requirement | Source |
|---|---|---|
| IMG-1 | Recipe images are stored in **Cloud Storage for Firebase**. The Firebase project is on the Blaze plan (already active). | Rotem, chat 2026-09-08 |
| IMG-2 | Only the backend talks to Firebase, through the Admin SDK with a service-account credential. The desktop app contains no Firebase SDK and no Firebase key. | Rotem, chat 2026-09-08 |
| IMG-3 | Upload: the desktop app sends the image to the API; the API writes it to the bucket with the Admin SDK and stores the object path on the recipe. | Rotem, chat 2026-09-08 |
| IMG-4 | Display: the API returns a short-lived **signed URL** (read action, expiry chosen at build time, at most 7 days) for each image in a recipe response; the desktop app loads the URL directly. Private and shared recipes stay private because only users allowed to see the recipe receive its URLs. | Rotem, chat 2026-09-08 |
| IMG-5 | Security Rules deny all client access; the bucket is reached only by the service account. | follows from IMG-2 |
| IMG-6 | Limits: at most 3 images per recipe version, 5 MB each, `image/jpeg`, `image/png` or `image/webp`; upload is `multipart/form-data` field `file` on `POST /recipes/:id/images`; the object path is `recipes/<recipeId>/<uuid>.<ext>`. Signed URLs are read-only with an expiry of `IMAGE_SIGNED_URL_TTL_SECONDS` (default 21600, six hours, within the seven-day maximum). The client reloads a recipe when an image URL returns 403. Env: `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_SERVICE_ACCOUNT_PATH` (path to the service-account JSON, outside the repo). When those keys are empty the API answers image uploads with 503 and recipe responses carry no image URLs. A bucket write that fails also answers 503 with the message "Image storage is unavailable right now", and the API log records only the storage error's status code and message, as `status <code>: <message>` (`status unknown` and `no message` when either is missing, and any `Bearer <token>` inside the message replaced by `Bearer [redacted]`), never the request, its URL or its headers (a failed Google Cloud Storage call carries a live access token). The type is decided from the file's first bytes, not from the declared MIME type: JPEG starts `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`, WebP `52 49 46 46` (`RIFF`), four length bytes, then `57 45 42 50 56 50` (`WEBPVP`), the WHATWG MIME Sniffing patterns (§16 V20); a file matching none of them answers 400 and the stored object's content type and extension are the detected ones (503 and byte check Rotem delegated, chat 2026-09-29). | Rotem delegated, chat 2026-09-28 |
| IMG-7 | An image belongs to the recipe it was uploaded to (the `<recipeId>` of its object path), and that recipe's owner holds the rights to it. A copy (SAVE-7) and a sync (SAVE-10) link to the source's images by object path; no object is duplicated. `DELETE /recipes/:id/images/:index` on a recipe that does not own the image only drops the path from that recipe's current version and leaves the object in the bucket. On the recipe that owns the image it deletes the object and drops the path from every version of every recipe that carries it, so the image disappears from all copies and forks too. Removing a saved copy (SAVE-7) deletes the objects that copy owns; a soft-deleted recipe keeps its objects so copies keep their images. The database is always changed first and the bucket second, so no version ever points at a deleted object; a bucket delete that fails is logged and leaves an unused object behind, and the request still succeeds because the database change is done (order and failure handling Rotem delegated, 2026-09-29). | Rotem, chat 2026-09-29 ("only the original owner can delete the image"); saved-copy removal Rotem, chat 2026-09-29 |

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
| SAVE-7 | A **copy** is a recipe a user saved from a source: a public user recipe (SAVE-1) or a TheMealDB meal (CAT-3, CAT-7). Until its first edit a copy is a **saved copy**: relation `saved`, removed with "Remove from my recipes", which deletes the row and its versions (§12.1). The first edit (SAVE-5, `PUT /recipes/:id`) makes it a **fork**: relation `own`, deleted like a recipe the user wrote (soft delete, so copies other users saved from it keep their attribution). A sync (SAVE-10) is not an edit, and neither is adding or removing an image (IMG-3 creates no version). | Rotem, chat 2026-09-29 |
| SAVE-8 | A saved copy stays private: its visibility cannot be changed to shared or public (`PATCH /recipes/:id/visibility` answers 400) until the first edit makes it a fork; a fork may be shared or published like any own recipe. | Rotem, chat 2026-09-29 |
| SAVE-9 | A copy shows one attribution line under its title: "Saved from <title> by <owner>" while it is a saved copy, "Forked from <title> by <owner>" once it is a fork, with the source's current title and owner username. The line links to the source while the caller can still view it (REC-4: not deleted, and public or shared with the caller); otherwise it is plain text. A TheMealDB copy shows "Saved from <meal name> on TheMealDB" or "Forked from <meal name> on TheMealDB" in plain text, where the meal name is TheMealDB's `strMeal` at save time; the §3.3 attribution string still shows at the bottom of its detail screen. | Rotem, chat 2026-09-29 |
| SAVE-10 | Updates from the source apply to copies of user recipes, saved copies and forks alike; TheMealDB copies are never checked. A copy records the source version number it last took (at save and at each sync). An update is available when the caller can still view the source and the source's current version number is higher. It is shown as a banner on the copy's detail screen ("The original has changed since you saved it", with Sync and a link to the original), as an "Update available" tag on the copy's Home card, and as an "Update available" tag beside "In your recipes" on the original's Discover card (DISC-10). Sync (`POST /recipes/:id/sync`, owner only, 400 when no update is available) appends a new version to the copy holding the source's current content (the §3.1.1 fields and image paths) and records the source's version number. When no update is available (the source is gone or no longer viewable, it is not newer, or the copy is a TheMealDB copy) it answers 400 with the message "This recipe has no update to take"; a caller who is not the owner gets 403 and a missing copy 404, as on every owner route. It does not change whether the copy is a saved copy or a fork, and the copy's earlier versions stay in its history (REC-7). | Rotem, chat 2026-09-29 |

### 3.3 Catalogue recipes from TheMealDB

| ID | Requirement | Source |
|---|---|---|
| CAT-1 | Recipes are pulled from TheMealDB with a **v2 (premium) key**. The key is already paid for and will be added to `.env` by Rotem. | INTENT L12 |
| CAT-2 | TheMealDB recipes appear in the Discover page only. | Rotem, chat 2026-09-08 |
| CAT-3 | A TheMealDB recipe is pulled into the database when a user saves it (SAVE-1). | Rotem, chat 2026-09-08 |
| CAT-4 | A saved TheMealDB recipe gets a default of 2 servings; the user can change it. | Rotem, chat 2026-09-08 |
| CAT-5 | TheMealDB's `strCategory` maps one-to-one onto the app's categories, since the app uses TheMealDB's list (DISC-7). | Rotem, chat 2026-09-08 |
| CAT-7 | A saved TheMealDB recipe is a copy with the same rules as a saved public recipe (SAVE-7, SAVE-8, SAVE-9, DISC-10); it is one copy per meal per user and gets no update check (SAVE-10). A copy of another user's published fork of a TheMealDB recipe is a copy of that user's recipe, not of the meal: its attribution line names that user (SAVE-9), it is checked for updates (SAVE-10), it does not count as the caller's copy of the meal (so the meal can still be saved, DISC-10), and the §3.3 attribution string still shows on it because its content comes from TheMealDB. | Rotem, chat 2026-09-29 |
| CAT-6 | Mapping (data-access-themealdb/CLAUDE.md): `strMeasure` is parsed into `quantity` + `unit` when it starts with a number (fractions like `1/2` and `1 1/2` included) followed by a unit word from the fixed list (`g`, `kg`, `ml`, `l`, `tsp`, `tbsp`, `cup`/`cups`, `pinch`); a number followed by a measurement word the app cannot express (oz, ounce, lb, pound, pint, quart, gallon, litre/liter, dash, drop, stick, can, tin, jar, packet, package, bottle, bunch, handful, slice, sprig, inch, cm, mm, and their plurals; e.g. "4 oz") keeps `quantity` empty, `unit: none` and the raw measure in `note`; a bare number ("1", "½") or a number followed by any other text ("2 large", "2 cloves") becomes that quantity with `unit: piece` and the trailing text as `note` (Rotem delegated, 2026-09-29; seen live: "1" for an onion rendered as "to taste"); anything else keeps `quantity` empty, `unit: none` and the raw measure in `note`. `strInstructions` is split into steps on line breaks and on sentence ends when a paragraph exceeds 300 characters; empty steps are dropped. A line that ends with `:` and has fewer than five words is a heading ("Pro Tips:", "Serving Suggestions:") and is dropped; leading bullet marks (`*`, `-`, `•`, also repeated, such as `**`) are stripped from each step, and the heading rule is applied after a leading step number is removed ("1. Tips:" is a heading); a note that equals "to taste" (any letter case) on an ingredient with an empty quantity is dropped, because the empty quantity already reads "to taste"; a measure that is only "pinch" or "a pinch" (any letter case, any whitespace between the words) becomes `unit: pinch` with an empty quantity (2026-09-30, BUG-030) (headings, bullets and note Rotem delegated, chat 2026-09-29). `strMealThumb` is kept as `externalImageUrl` on the saved recipe (TheMealDB hosts it; no upload to Firebase). Catalogue previews in Discover are served live from `filter.php?c=<category>` (id, name, thumb) and `lookup.php?i=<id>` for the full preview. | Rotem delegated, chat 2026-09-28 |

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
| FR-4 | `GET /users/search?q=` returns at most 10 users whose username starts with `q` (case-insensitive) or whose email equals `q` exactly; the caller and existing friends are marked. A request is `pending` until the receiver accepts or declines; either side can cancel a pending request (`DELETE /friends/requests/:id` by the receiver has the same effect as declining; Rotem, chat 2026-09-30); after a decline or a cancel either user may send a new request at once, with no cooldown and no notice (Rotem, chat 2026-09-30); cancelling by anyone else answers 403 "Only the sender or the receiver can cancel this request", a request that is no longer pending 409 (checked before the 403, so a request that is no longer pending answers 409 to anyone), and an unknown id 404 (Rotem delegated, chat 2026-09-30); a friend can be removed, which also removes every share between the two users; every `shared` recipe of either user that has no recipients after that removal (including one left that way before, and soft-deleted rows, which is harmless) becomes `private` in the same transaction (UI-51); like any visibility change this sets `updated_at`, so those recipes move to the top of their owner's list, and migration `SharedWithNobodyPrivate` applies the same rule once to rows saved before it (2026-09-30, QA-REVIEW-2026-09-30-2 BUG-032, Rotem delegated). | Rotem delegated, chat 2026-09-28 |

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
| DISC-9 | `GET /discover?category=<one of the 14>&page=` returns, for that category, the public user recipes (newest version, newest first, 20 per page, with owner username, average and rating count, and the id of the caller's copy when they have one, DISC-10) followed by the TheMealDB catalogue entries of that category (id, name, thumbnail, and the id of the caller's copy when they have one). Without `category` it returns the caller's favourite categories first and then the other categories, each with its first 8 items, which is the split view of DISC-5. Favourites are toggled with `PUT /me/favourite-categories` (list of at most 3). `page` is 1-based (the query DTO rejects values below 1; the services treat any lower value as 1): page `n` holds public recipes `(n − 1) × 20 + 1` to `n × 20`. The catalogue entries are paged too, 20 per page, page `n` carrying catalogue entries `(n − 1) × 20 + 1` to `n × 20`; `hasMore` is true when either list has more. Tile images load lazily (`loading="lazy"`, the default of the shared photo component, which a screen may override with `eager`). (Paging Rotem delegated, chat 2026-09-29.) | Rotem delegated, chat 2026-09-28; copy ids Rotem, chat 2026-09-29 |
| DISC-10 | When the caller already has a live copy of an item (a saved copy or a fork that is not deleted, SAVE-7), Discover shows "In your recipes" and a Cook button that opens cook mode on that copy, in place of Save. This applies to public recipe cards, TheMealDB tiles, a public recipe's detail preview and the TheMealDB preview. The API returns the copy's id with each such item (`myCopyId`). Removing the copy or deleting the fork brings Save back. | Rotem, chat 2026-09-29 |

---

## 6. Ratings, votes and comments

| ID | Requirement | Source |
|---|---|---|
| RATE-1 | Users grade a public recipe with whole stars, 1 to 5. | INTENT L7; Rotem, chat 2026-09-08 |
| RATE-2 | The value shown is the average of all grades, stored with two digits after the decimal point (`numeric(3,2)`, range 1.00–5.00). | INTENT L7; Rotem, chat 2026-09-08 |
| RATE-3 | The star display renders the average in quarter-star steps; hovering reveals the decimal value. | Rotem, chat 2026-09-08 |
| COM-1 | Public and shared recipes have a comment section. | INTENT L22 |
| COM-2 | On public recipes, comments have up and down votes, like Reddit, and are ranked by integer points, not by stars. | INTENT L22; Rotem, chat 2026-09-08 |
| RATE-4 | One rating per user per public recipe; rating again replaces the earlier value. The stored average and count are recomputed on every write. The owner can rate their own public recipe like anyone else. Ratings attach to the recipe, not to a version. | Rotem delegated, chat 2026-09-28 |
| COM-3 | Comments are 1–2000 characters after trimming surrounding whitespace (a whitespace-only comment is rejected with 400, whitespace being what `String.prototype.trim` removes, including non-breaking and ideographic spaces; the trimmed text is what is stored; trimming Rotem delegated, 2026-09-29), attach to the recipe, and are returned with author username, points (sum of votes, 0 on shared recipes), the caller's own vote, and creation time, ordered by points then newest. A vote is `1`, `-1` or `0` (removes). The author can delete their own comment. Only users who can see the recipe (owner, share recipients, everyone if public) can read or write comments. | Rotem delegated, chat 2026-09-28 |

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
| COOK-10 | `POST /cook/ask` takes `recipeId`, `stepIndex` and an optional `question` (max 500 chars). The backend checks access (COOK-5), then the quota (COOK-8; 429 with the remaining count when exhausted), then sends one request with a fixed system prompt ("You are a concise cooking assistant…", answers under 120 words, plain text) and a user message holding the recipe title, servings, the ingredient list in one line each (worded like the screen through the UI-37 `ingredientAmount`, e.g. "Juice of 1/2 Lemon", "pinch Salt"; 2026-09-30, QA-REVIEW-2026-09-30-4 BUG-034, Rotem delegated), the numbered steps with the current one marked, and the question or "Give one useful tip for the current step". `max_tokens` 1500, `temperature` 0.4 (was 300 until 2026-09-30: `minimax/minimax-m3` spends most completion tokens on reasoning that is not returned, and the prompt log of 2026-09-29 shows a 227-character answer cut off at exactly 300 tokens; Rotem, chat 2026-09-30: "lengthen the limit of the answer"; the value 1500 Rotem delegated). An answer with no text answers 503 "The assistant didn't answer. Ask again.", and the quota unit counted before the call stays spent (Rotem delegated, chat 2026-09-30). The response text, the tokens and the cost are returned; `GET /cook/quota` returns `{ used, limit, remaining }` for today (UTC). | Rotem delegated, chat 2026-09-28 |

Verified OpenRouter facts (§16 O1–O14):

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
| WX-9 | The desktop app reports the machine's IANA timezone (for example `Asia/Jerusalem`). The backend takes the city segment after the `/`, resolves it to coordinates with Open-Meteo geocoding (`name=<city>`), and calls the forecast with those coordinates and the timezone. Follows from WX-7 and WX-8. A zone with no city has no weather context: `UTC`, `GMT`, any zone without a `/`, and any zone under `Etc/` (for example `Etc/UTC`, `Etc/GMT+2`). A geocoding hit is used only when its `name` equals the city segment, compared case-insensitively with underscores read as spaces and with diacritics removed from both (Unicode NFD without combining marks, so `Sao_Paulo` matches "São Paulo" and `Bogota` "Bogotá"), or when the name is the segment followed by " City" (`Ho_Chi_Minh` matches "Ho Chi Minh City"); otherwise there is no weather context (so `UTC` never resolves to Utrecht; Rotem delegated, chat 2026-09-29; diacritics and " City" 2026-09-30, QA-REVIEW-2026-09-30 BUG-025). Geocoding asks for up to 10 hits (`count=10`) and uses the first hit whose name passes that match **and** whose own `timezone` is the same zone as the request, both canonicalised through `Intl.DateTimeFormat(…).resolvedOptions().timeZone` (so `Asia/Calcutta` and `Asia/Kolkata` are the same zone and Calcutta, South Africa is rejected); no such hit means no weather context. Before geocoding, a legacy zone name that browsers and Node still report (recognised in any letter case) is read by its current city name, from the IANA tzdata `backward` links (§16 W13): `Asia/Calcutta` → Kolkata, `Europe/Kiev` → Kyiv, `Asia/Saigon` → Ho Chi Minh, `America/Godthab` → Nuuk, `Asia/Katmandu` → Kathmandu, `Asia/Rangoon` → Yangon; and because the Faroe zone names a region, not a city (Open-Meteo returns only "Faroe Islands" for "Faroe"), both `Atlantic/Faeroe` and `Atlantic/Faroe` are read as Tórshavn, whose geocoding hit carries `Atlantic/Faroe` (checked 2026-09-30) (2026-09-30, QA-REVIEW-2026-09-30-2 BUG-029, Rotem delegated). The zone comparison relies on the runtime's `Intl` canonicalisation (Node 26.5 maps a current name and its legacy link to the same zone). The `timezone` field of `POST /recommend` accepts any zone name the runtime's `Intl.DateTimeFormat` accepts (at most 64 characters, in any letter case as `Intl` does; a missing or invalid value answers 400 "Unknown time zone"), so `UTC`, `GMT` and `Etc/GMT+2` are valid and simply get no weather context (2026-09-30, BUG-026). | derived |
| WX-10 | `POST /recommend` takes `timezone`, `scope` (`home` or `discover`) and `excludeRecipeIds`. Candidates: for `home` the caller's own and saved recipes; for `discover` the 30 newest public recipes; minus the excluded ids; at most 30, each sent to the model as `id | title | category | prep+cook minutes`. Weather context: current temperature, `is_day`, WMO `weather_code` mapped to a word (clear, cloudy, fog, drizzle, rain, snow, thunderstorm), local hour and city. The model must answer JSON `{"picks":[{"id":"…","reason":"…"}]}` with up to 3 picks ordered best first (`home`) or 1 pick (`discover`); a non-JSON answer yields an empty list and the client shows "No recommendation right now". The response also returns the weather line shown in the greeting (WX-2). Geocoding and forecast results are cached in memory for 30 minutes per zone and city (a legacy zone name shares the entry of its current name); a geocoding answer with no usable hit is cached as "no weather" for the same 30 minutes, while a failed or unreachable request is not cached. `max_tokens` 1500, `temperature` 0.5 (was 400 until 2026-09-30; the prompt log of 2026-09-29 shows answers of about 140 characters using 200–400 completion tokens and one call returning empty text at the 400 cap; Rotem, chat 2026-09-30; value Rotem delegated). Results are cached (Rotem, chat 2026-09-30: "cache them"): the API keeps the last response in memory per user and scope, keyed by the local date and hour from `timezone`, the weather word and the exact candidate id list, and answers a request with the same key from the cache without a model call and without counting a quota unit (COOK-8); a request with `excludeRecipeIds` ("Show another", WX-5) always calls the model and its answer is stored apart from the plain answer (it is never served from the cache, because Show another always calls the model), so it never replaces the answer to the request without exclusions, which later visits in the same hour keep getting (separate slot 2026-09-30, QA-REVIEW-2026-09-30 PERF-003, Rotem delegated); entries expire after 60 minutes. The candidate list in the key is the one sent to the model (after exclusions), in its order; the key holds the local date and hour, not the zone name, so two zones whose clocks agree share an entry; an answer with no usable pick is not cached; a `timezone` that `Intl` does not know is never cached; a cache hit returns the stored pick ids and reasons with fresh recipe cards, weather context and quota (key, expiry and these rules Rotem delegated, chat 2026-09-30). Underscores in the city segment become spaces; a city that Open-Meteo cannot geocode yields a recommendation without weather context and a greeting without a weather line. | Rotem delegated, chat 2026-09-28 |

Verified Open-Meteo facts (§16 W1–W5, W13): no API key; free limits 600/min, 5,000/h, 10,000/day, 300,000/month; data licensed CC-BY 4.0 with attribution required; the free tier is for non-commercial use only. Forecast endpoint `https://api.open-meteo.com/v1/forecast` (`latitude`, `longitude`, `timezone`) returns `is_day`, `sunrise`, `sunset`, and `weather_code`. Geocoding endpoint `https://geocoding-api.open-meteo.com/v1/search` (`name`, `count`, `language`) is forward-only, city name to coordinates; there is no reverse geocoding.

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
| NUT-6 | `GET /recipes/:id/nutrition?mode=ingredients\|meal`. Ingredients mode: an ingredient with a blank name is unmatched without a lookup; a seasoning (NUT-7) is 0 kcal without a lookup; every other ingredient name is searched with `POST /foods/search` (`dataType` SR Legacy, Foundation, Survey (FNDDS)) and the food is chosen by NUT-8, grams are derived from quantity and unit (`g` as is, `kg` ×1000, `ml` ×1 (density 1), `l` ×1000, `tsp` 5 ml, `tbsp` 15 ml, `cup` 240 ml, `pinch` 0.3 g, `piece` uses the portion weight chosen by NUT-9, `none` is unmatched unless its note starts with a weight (NUT-10), any other unit with an empty quantity is unmatched), kcal = kcal/100 g × grams / 100; the response lists each ingredient's kcal or `unavailable`, the total, and the per-portion value (total ÷ servings) with `partial: true` when any ingredient is unavailable. Meal mode: the recipe title is searched with `dataType: ["Survey (FNDDS)"]` and `pageSize: 25`; the first hit's kcal/100 g and a portion weight (`foodMeasures[0].gramWeight` when the search result carries it, otherwise the first `foodPortions[].gramWeight` from `GET /food/{fdcId}`; when neither exists, kcal per portion is `unavailable` and only kcal/100 g is shown) give kcal per portion, plus the matched description; no hit yields `unavailable`. USDA responses are cached in memory for 24 hours by query. | Rotem delegated, chat 2026-09-28; ingredients mode revised 2026-09-29 (NUT-7 to NUT-10) |
| NUT-7 | Seasonings count as 0 kcal in ingredients mode, whatever their quantity or unit (including "to taste"), without a USDA lookup; the row shows `0 kcal`, empty grams, `matchedDescription` "Seasoning, counted as 0 kcal", and it does not make the total partial. An ingredient is a seasoning when its name, lower-cased, with `&` read as `and`, the typographic apostrophe `’` read as `'`, every character that is neither a letter nor an apostrophe replaced by a space, spaces collapsed, and the leading words `freshly`, `fresh`, `ground`, `dried`, `crushed`, `cracked`, `whole`, `smoked`, `fine`, `coarse`, `flaky`, `kosher`, `sea`, `table`, `rock`, `black`, `white` removed (the last word is never removed, so "Ground Black" stays "black"), is one of: salt, pepper, salt and pepper, peppercorns, cayenne, cayenne pepper, paprika, cumin, cumin seeds, coriander, coriander seeds, turmeric, cinnamon, cinnamon stick, cinnamon sticks, nutmeg, allspice, cloves, cardamom, cardamom pods, star anise, fennel seeds, mustard seeds, caraway seeds, saffron, sumac, za'atar, zaatar, oregano, thyme, rosemary, sage, bay leaf, bay leaves, marjoram, tarragon, dill, herbes de provence, mixed herbs, italian seasoning, chilli powder, chili powder, chile powder, chilli flakes, chili flakes, red pepper flakes, red chilli flakes, garlic powder, onion powder, ginger, curry powder, garam masala, five spice, chinese five spice, cajun seasoning, seasoning, msg. Leafy herbs used in bulk (parsley, coriander leaves named "cilantro", basil, mint) are not on the list and go through USDA. | Rotem, chat 2026-09-29 ("a pipeline for general seasonings that put 0 calories in"); list Rotem delegated |
| NUT-8 | Food choice for an ingredient name. USDA's own order is not trusted: its top hits are often dishes ("Garlic sauce" before "Garlic, raw"; no raw rice among the first 25 hits for "Rice"; §16 U11). The first search sends `pageSize: 25` and a query in which every word of the name (split on anything that is neither a letter nor a digit, lower-cased) carries the `+` operator and the optional word `raw` is added ("Ground Beef" → `+ground +beef raw`: only foods with every name word, raw ones ranked higher, §16 U2, U13); when no hit of that search survives the skips below, the search is repeated once with the plain name. Words are compared lower-cased, split on anything that is not a letter (accented letters are letters), and singularised: a word longer than 3 letters ending in `es` after `o`, `x`, `ch`, `sh` or `ss` drops the `es` ("tomatoes" → "tomato", "glasses" → "glass"), otherwise a word longer than 2 letters ending in `s` not preceded by `s` drops the `s` ("cloves" → "clove"; "cheeses" → "cheese"; "glass" stays). The neutral words below are compared after the same singularising (`nfs` → `nf`). The head word is the last word of the name that is not a container word (`clove`, `breast`, `fillet`, `filet`, `stalk`, `sprig`, `slice`, `leaf`, `leave` (what "leaves" singularises to), `head`, after singularising; "Garlic cloves" → head `garlic`, "Chicken breasts" → head `chicken`); container words stay name words for the query, the scores and NUT-9 rule (1) ("Garlic cloves" finds the "1 clove" portion). A name made only of container words ("Slices") keeps its last word as the head word. This applies only to the nutrition lookup; the recipe's ingredient name is unchanged (Rotem, chat 2026-09-30: "do that only when looking up nutritions"). The first segment is the description up to its first comma. A hit is skipped when it has no energy value (§9 nutrient ids), when its description lacks the head word, or when its first segment contains no name word ("Snacks, pretzels, … made with enriched flour" is not flour), or when one of its comma-separated segments is only the word `skin`, `peel`, `rind` or `juice` and that word is not a name word ("Potatoes, raw, skin" is the peel alone). Each remaining hit scores +3 when every word of its first segment is a name word or a neutral word (`raw`, `fresh`, `whole`, `nfs`, `and`, `or`, `with`, `of`), +2 for each distinct name word other than the head word found anywhere in its description, +2 when its description contains `raw`, and −3 per first-segment word that is neither a name word nor neutral. The highest score wins; a tie goes to the description with fewer words ("Butter, tub" over "Butter, Clarified butter (ghee)"), then to USDA's order. No remaining hit is unmatched (NUT-5). Checked on 2026-09-29 against FDC search results (§16 U11): "Garlic" → "Garlic, raw" (not "Garlic sauce"), "Plum Tomatoes" → "Tomatoes, raw" (not "Plum, raw"), "Ground Beef" → "Beef, ground, raw", "Water" → "Water, tap" (not "Water convolvulus, raw"), "Eggs" → "Egg, whole, raw", "Rice" → a raw rice, "Carrots" → "Carrots, raw", "Chicken Breast" → "Chicken, breast, boneless, skinless, raw", "Potatoes" → "Potatoes, flesh and skin, raw" (not "Potatoes, raw, skin"). | Rotem delegated, chat 2026-09-29 |
| NUT-9 | Portion weight for the `piece` unit, from the chosen food's `foodPortions[]` (`GET /food/{fdcId}`), in `sequenceNumber` order (portions without one follow, in USDA's order). A portion's text is its `portionDescription`, or else its `modifier`, followed by its `measureUnit.name` unless that is `undetermined` (any letter case) (Foundation foods name the unit there, for example "egg" or "RACC"); its weight per piece is `gramWeight ÷ amount` when `portionDescription` is empty, `modifier` is not, and `amount` is positive, otherwise `gramWeight` (FNDDS leaves `amount` undefined and puts the count in `portionDescription`, §16 U14). Texts are compared word by word with the NUT-8 word rules ("contains `g`" means the word `g`, not the letter). Portions whose text contains any of `cup`, `tbsp`, `tablespoon`, `tsp`, `teaspoon`, `oz`, `ounce`, `lb`, `pound`, `fl`, `pint`, `quart`, `ml`, `g`, `gram`, `kg`, `slice`, `wedge`, `serving`, `racc` or the phrase `quantity not specified`, and portions whose text has no word of letters, are never a piece and are dropped first (so "Cherry Tomatoes" finds "cherry", 17 g, not "cup cherry tomatoes", and Foundation "Garlic, raw" offers no piece: its only portion is the 85 g RACC reference serving). Among the rest, the first rule that finds a portion wins: (1) the text contains the first word of the ingredient's note or any name word other than the head word (singularised, so "4 Cloves Crushed" finds "1 clove" and "Plum Tomatoes" finds "1 plum tomato"); (2) the text contains `medium` or `regular` ("1 regular carrot", 60 g, not "1 baby carrot", 10 g; portion facts in §16 U11); (3) the text contains `whole`; (4) the text contains `large`; (5) the first remaining portion. No portion found is unmatched (NUT-5). | Rotem delegated, chat 2026-09-29 |
| NUT-10 | An ingredient with unit `none` whose note starts with a number followed by an avoirdupois weight word (`oz`, `ounce`, `ounces`, `lb`, `lbs`, `pound`, `pounds`, in any letter case, with or without a space, same number forms as CAT-6, read by the same code, where a fraction with a zero denominator is not a fraction, so "1/0 lb" is not a weight; text after the weight such as "minced" is ignored) counts as that weight in grams: 1 oz = 28.349523125 g, 1 lb = 453.59237 g (§16 U12). This covers TheMealDB measures such as "1 lb" and "4 oz" that CAT-6 keeps as raw notes. | Rotem delegated, chat 2026-09-29 |
| NUT-11 | The headline figure is a **range** between the two NUT-3 estimates (Rotem, chat 2026-09-30, option (a)): every `GET /recipes/:id/nutrition` response, whichever `mode` was asked, also carries `estimate` = `{ lowKcalPerPortion, highKcalPerPortion, atLeast, notCounted }` (`notCounted`: the names of the ingredients the ingredients-mode pass left unavailable, empty when none; Rotem delegated, chat 2026-09-30), computed from the ingredients-mode per-portion value and the meal-mode per-portion value (both through the NUT-6 lookups and their 24-hour cache). Both available: low is the smaller, high the larger, `atLeast` false; shown as "about N–M kcal per portion", or "about N kcal per portion" when both round to the same 10 kcal. Only the ingredients value available: low = high = that value, and `atLeast` is true when it is partial (NUT-6), shown as "at least N kcal per portion", else "about N kcal per portion". Only the meal value available: "about N kcal per portion". Neither: `estimate` is null and the patch shows "nutrition data unavailable" (UI-15). Under the figure one muted line says "Estimate from USDA FoodData Central" and, when the ingredients value is partial, "Not counted: <names of the unmatched ingredients>". The mode switch (NUT-4) still chooses which breakdown is listed under the figure. Numbers are rounded to the nearest 10 kcal. When the lookup for the mode that was not asked fails with a USDA outage (503) its value is left out of the estimate; a USDA rate limit (429) fails the request as it does for the asked mode (rounding, wording and failures Rotem delegated, chat 2026-09-30). | Rotem, chat 2026-09-30 |

Verified USDA FoodData Central facts (§16 U1–U8):

- Base `https://api.nal.usda.gov/fdc/v1`, key via `?api_key=`, signup through the api.data.gov form (no USDA page states a price; keys found online are deactivated). Limit 1,000 requests/hour per IP; HTTP 429 and a one-hour block when exceeded. `DEMO_KEY` is limited to 30/hour and 50/day per IP and is not used by the app. Data is CC0 (public domain); attribution requested, not required. The `.env.example` entries `USDA_FDC_KEY` and `USDA_FDC_BASE_URL` match.
- Endpoints: `GET /food/{fdcId}`, `GET|POST /foods`, `GET|POST /foods/list`, `GET|POST /foods/search` (params `query`, `dataType`, `pageSize`, `pageNumber`, `sortBy`, `sortOrder`; `dataType` is an array with the enum `Branded`, `Foundation`, `Survey (FNDDS)`, `SR Legacy`; Experimental is not searchable). Filtering by `Survey (FNDDS)` returned 400 over GET and worked with POST + JSON body during testing on 2026-09-08 (the later same-day re-run hit the `DEMO_KEY` limit); the client uses POST.
- Data types: Foundation (analytical, few household portions), SR Legacy (final release April 2018, has portions), Survey/FNDDS (composite dishes with per-100 g nutrients and portion weights, e.g. "Lasagna with meat" 139 kcal/100 g, observed 2026-09-08), Branded, Experimental. FNDDS is what makes NUT-3's meal-name lookup possible; its coverage is US-survey dishes. FNDDS 2021-2023 (5,432 items) is still the newest release; FDC data version 15.4 of 2026-08-20 changed Branded items only.
- Nutrient values in search results are per 100 g. Energy nutrient IDs (nutrient.csv, §16 U9): `1008` (kcal; SR Legacy, FNDDS, Branded), `1062` (kJ, never used), `2047` and `2048` (Atwater kcal; Foundation Foods dropped 1008 in October 2020). The client reads 1008, then 2047, then 2048, and never treats a missing ID as zero.
- Food detail exposes `foodPortions[]` with `gramWeight` (the OpenAPI schema lists them on Foundation and Survey items only, but SR Legacy details carry them too, §16 U11, U14). The OpenAPI schema for search results has no `foodMeasures` property; the client tolerates it when present (observed live on 2026-09-08) and never depends on it: when it is absent, NUT-6 falls back to `GET /food/{fdcId}` `foodPortions[]`. Converting recipe quantities to grams is the app's responsibility.

---

## 10. AI prompt logging [INTENT L18]

| ID | Requirement |
|---|---|
| LOG-1 | Every AI prompt is logged server-side to see costs. |
| LOG-2 | Each log entry is appended to a file on the server machine for later review. |
| LOG-3 | Log files live in `<project root>/log/`, one file per day, entries in JSON. (Rotem, chat 2026-09-08) |
| LOG-4 | Each entry includes the full prompt and the full response text. (Rotem, chat 2026-09-08) |

Each entry also records: timestamp, user id, feature (cook mode or recommendation), model requested, model used (the response `model` field, which is what is billed), prompt and completion token counts, `usage.cost` in credits (1 credit = $1), generation id, and latency, all available from the OpenRouter response (§7).

| LOG-5 | File format: `log/YYYY-MM-DD.json` (UTC date) holds one JSON object per line (JSON Lines), appended with a single `appendFile` call per entry so concurrent requests never interleave; the folder is created on first write and is gitignored. Failed calls are logged too, with `error` instead of the response. | Rotem delegated, chat 2026-09-28 |

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
├── docs/
│   └── reviews/                    app-critic QA reviews (QA-REVIEW-<date>.md), their screenshots, test data and the fix task lists; gitignored, kept only on Rotem's machine (Rotem, chat 2026-09-30)
├── INTENT.txt
├── SPEC.md
├── README.md                       short overview, setup and run commands, derived from SPEC.md (Rotem, chat 2026-09-29)
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
| UI-1 | `design_handoff_cookbook_ui/` is the UI **guidebook**: it fixes the look (theme tokens, component classes, typography, icon style, image treatment) and the interaction patterns of the screens it shows. It is not a concrete UI: SPEC.md decides which screens, fields and actions exist, and the guide is followed where it shows them. Where SPEC.md and the guide disagree, SPEC.md wins. The guide sets the general look only; it never limits which controls, panels or behaviours a screen may have (Rotem, chat 2026-09-30). | Rotem, chat 2026-09-08 ("only a guidebook not a concrete ui") |
| UI-2 | The app is branded **CookBook** everywhere (nav brand, window title, dialogs). The guide's earlier name was replaced on 2026-09-08. | Rotem, chat 2026-09-08 |
| UI-3 | The theme is the "Organic" system: `design_handoff_cookbook_ui/_ds/organic-*/styles.css` is ported verbatim (its `:root` tokens and component classes) into one global stylesheet owned by `libs/web/ui` and imported once by `apps/web`. Colours, spacing, radii and shadows are used only through the CSS custom properties; no hard-coded hex, font name or pixel value that a token carries. | guide README "Theme"; Rotem delegated, chat 2026-09-08 |
| UI-4 | Fonts: Caprasimo (headings, 400) and Figtree (body, variable 300–900 with italic). They are **bundled** through the npm packages `@fontsource/caprasimo` 5.3.0 and `@fontsource-variable/figtree` 5.3.0 (WOFF2, SIL OFL 1.1), imported by the `libs/web/ui` stylesheet; the `@import` of `fonts.googleapis.com` in the guide's `styles.css` is not carried over, so the renderer makes no network request outside the API (apps/web/CLAUDE.md). The OFL text and both copyright notices ship with the desktop build in a `licenses/` folder next to the app resources (OFL 1.1 clause 2 makes this a condition of bundling). | §16 D1–D4; Rotem delegated, chat 2026-09-08 |
| UI-5 | Icons: Lucide through `lucide-react` 1.48.0 (ISC, §16 V17; was 1.43.0 on 2026-09-08), named imports only, rendered by one `Icon` wrapper in `libs/web/ui` that fixes `strokeWidth={2.75}` (the package default is 2). The ISC notice ships in the same `licenses/` folder. | guide README "Icons"; §16 D5–D8; Rotem delegated |
| UI-6 | Screens the guide shows (Home, Discover, Friends, Recipe detail, Cook mode, New-recipe dialog) are built from it. Screens SPEC.md requires but the guide lacks (sign-in and sign-up, the full recipe editor of §3.1.1, share-with-friends and visibility, version history, image upload, delete and remove-saved) are built from the same tokens and component classes, following the guide's rules: left-aligned layouts, pill buttons and inputs, `--radius-lg` containers, `.washed` images, accent `:focus-visible` ring, `.15s` transitions; dialogs close on Escape and on a backdrop click, never on a click inside the panel (2026-09-28). | Rotem delegated, chat 2026-09-08 |
| UI-7 | The guide's screen-level behaviours that SPEC.md already settles are implemented as SPEC.md states them, in particular: the daily AI quota shown in cook mode comes from the API (COOK-8 counts server-side), the "New recipe" dialog opens the full editor because servings, ingredients and steps are required (§3.1.1), Discover keeps its category split (DISC-5) with the chip row as the filter, Discover also shows the recommendation strip (DISC-3), the home recommendation shows the ranked list (WX-4) with "Show another" as WX-5, comment votes appear on public recipes only (COM-2), and the TheMealDB footer carries the full attribution string with the URL (§3.3). | derived from §3–§8 |
| UI-8 | Guide details SPEC.md does not settle are decided when the owning `libs/web/*` library is built and recorded in that section of SPEC.md before the code is written (§0 rule 1); they are not decided in the guide. | Rotem, chat 2026-09-08 ("choose actions yourself"); §0 |

The guide's `support.js` and `.dc.html` are the prototype runtime and are never shipped or imported.

Details decided on 2026-09-28 (Rotem delegated, "finish the app"):

| ID | Requirement |
|---|---|
| UI-9 | Sign-in and sign-up are one screen with a segmented switch, shown whenever there is no valid token; fields per AUTH-5; errors inline under the form; a field's grey hint (username, email) is hidden while that field shows an error, so no rule is printed twice (2026-09-30, UX-019). Sign-out is an item in the avatar menu (avatar initial = first letter of the username). |
| UI-10 | The greeting uses the username ("Good evening, rotem"); "Good morning/afternoon/evening" from the local hour (5–11, 12–17, else). Bylines show usernames. Cards show "N min" from `prepMinutes + cookMinutes` and omit it when both are absent; "serves N" always. |
| UI-11 | "New recipe" opens the full editor (title, description, category, servings, prep/cook minutes, ingredients with unit select, steps with optional minutes, images). Create saves as private and opens the detail screen. Edit (owner only) opens the same editor pre-filled and saves a new version. |
| UI-12 | Recipe detail owner actions in an "Owner" row: Edit, Visibility (private / shared / public), Share… (checkbox list of friends, shown when visibility is shared), Delete (confirm dialog). A saved copy shows Edit and Remove from my recipes (confirm), and no Visibility or Share… (SAVE-8, 2026-09-29). Versions: a "v3" tag opens a list of versions with dates; picking one shows it read-only with "Current" marked; no restore. |
| UI-13 | Star row on cards and detail shows the average in quarter steps with the count; private and shared recipes, which have no ratings, show no star row. The rating input appears on public recipes only. |
| UI-14 | Servings stepper rescales ingredient quantities on screen only and is not saved; it returns to the recipe's own servings when another version is shown. Save from Discover is optimistic; on failure the button returns to Save and an inline message shows. On success, and whenever an item carries `myCopyId`, the button is replaced by an "In your recipes" tag and a Cook button (DISC-10, 2026-09-29). On a public recipe's detail preview the screen keeps showing the original; while the save runs the tag shows with a disabled Start cooking, which then opens cook mode on the copy. The TheMealDB preview's Save is not optimistic: the button shows a loading state until the copy exists and then opens the copy's detail screen. |
| UI-15 | Cook mode reads the quota from `GET /cook/quota` on entry and from each `POST /cook/ask` response; there is no artificial delay; the detail screen shows the minutes tag on steps too. Cook mode (Rotem, chat 2026-09-30, "do that"; details Rotem delegated): a collapsible "Ingredients" panel, closed when cook mode opens, lists the recipe's ingredients at its servings; ← and → move to the previous and next step (ignored while typing in a field, with a modifier key held, and on key repeat; → never finishes the recipe), and Enter in the question box asks (not an Enter that confirms an input-method composition, and not while an ask is running); a step's timer keeps running when the user moves to another step, every running or finished timer shows as a pill in the top bar with its step number and time left (click jumps to that step, × dismisses it), and all timers stop on exit; when a timer reaches zero a short chime plays (Web Audio, no sound file) and its pill flashes until dismissed; a step whose `durationMinutes` is above 120 shows its minutes but no timer button (Rotem, chat 2026-09-30); Ask is disabled with "No AI asks left today" when `remaining` is 0; the AI answer sits in a box of at most 40% of the window height that scrolls inside itself (Rotem, chat 2026-09-30: "make it scrollable rather than lengthening the ui"), and keeps its line breaks and paragraphs. The question box is an auto-growing textarea as wide as the answer box (at most 500 characters, COOK-10): Enter asks, Shift+Enter starts a new line. After a 429 or a 5xx from `POST /cook/ask` (and after no other failure, since a network failure or another 4xx spends no unit) the screen re-reads `GET /cook/quota`, so after a 429 the quota line shows 0 and Ask is disabled, and after a 5xx the unit COOK-10 keeps spent is shown (2026-09-30, QA-REVIEW-2026-09-30-2 BUG-031, QOL-020, QOL-021, Rotem delegated). The nutrition patch shows "nutrition data unavailable" per ingredient and for the total when everything is unavailable. Comment votes render on public recipes only; private recipes show no comment section (COM-1). |
| UI-16 | Navigation is in-app state (no URL router): `auth`, `home`, `discover`, `friends`, `recipe/:id`, `editor`, `cook/:id`. The renderer reads `window.cookbook.timezone` from the preload and falls back to `Intl.DateTimeFormat().resolvedOptions().timeZone` in a plain browser (web-e2e). |
| UI-17 | Data access: a small `fetch` client in `libs/web/data-access-api` with the base URL from `VITE_API_BASE_URL`, tokens in `localStorage` (`cookbook.accessToken`, `cookbook.refreshToken`), automatic refresh on 401 once, and one React hook per endpoint group; no third-party data library. |

Details decided on 2026-09-29 from the QA review `docs/reviews/QA-REVIEW-2026-09-29.md` (a local, gitignored file) (Rotem delegated, chat 2026-09-29: "create tasks according to the review and start working through them"):

| ID | Requirement |
|---|---|
| UI-18 | The recommendation card lists every pick of the latest `POST /recommend` response in the model's order (WX-4: up to 3 on Home, 1 on Discover), each row with the recipe title (opens the recipe), the model's reason and the row's action (Cook it on Home, View recipe on Discover). "Show another" (WX-5) re-prompts with every id shown so far excluded and replaces the list with the new picks; it is disabled once a response brings fewer picks than the scope asks for (the candidates are used up) and when the daily quota has none left (COOK-8). When that re-prompt returns no pick, the current list stays and a muted line says "No other suggestions right now"; the card never shows picks next to "No recommendation right now", which appears only when there is no pick at all. |
| UI-19 | A recipe shared with the caller (relation `shared`, REC-8) shows the tag "Shared with you by <owner username>" instead of the owner's friend count. The detail screen shows "by <owner username>" under the title on public recipes the caller does not own, in the same muted line style as the SAVE-9 attribution; a shared recipe shows no byline, because its tag already names the owner (byline on shared recipes dropped 2026-09-30, QA-REVIEW-2026-09-30 UX-015, Rotem delegated). |
| UI-20 | A TheMealDB copy with no uploaded image shows its `externalImageUrl` (CAT-6) as the detail screen's photo, the same photo its Home card shows; the editor never offers to remove it, because it is not an uploaded image (IMG-7). |
| UI-21 | An unsaved TheMealDB tile in Discover carries a Save button (DISC-2, DISC-10). Like the TheMealDB preview's Save (UI-14) it is not optimistic: it shows a loading state until `POST /recipes/catalogue/:mealId/save` returns, then the tile shows "In your recipes" and Cook in place; on failure the button returns to Save with an inline message. It stays on Discover. |
| UI-22 | A dialog closes on a backdrop click only when the press and the release both land on the backdrop, so a drag that starts inside the panel never closes it (UI-6). |
| UI-23 | Back buttons return to the screen the user came from: a copy opened by the TheMealDB preview's Save, and a recipe reached by leaving cook mode, go back to the screen that opened the preview or cook mode (Home or Discover), and the nav bar highlights that tab. The editor of an existing recipe keeps the recipe's origin through Save and Cancel; a new recipe's editor highlights Home and Cancel returns to the screen it was opened from. |
| UI-24 | The comment section on a shared recipe starts after the same divider and spacing as on a public recipe. |
| UI-25 | Once `POST /recipes` succeeds, the editor opens the new recipe's detail screen even when an image upload then fails, so pressing Create again can never make a duplicate. Every picked image is attempted even after one fails; the detail screen then shows an inline notice "The recipe was saved, but 1 image could not be uploaded: <message>" (or "N images"), quoting the first failure's message (UI-47). |
| UI-26 | Errors and connectivity. The fetch client turns a network failure (the request never got an HTTP answer) into an error with status 0 and the message "Can't reach CookBook's server." and a 5xx answer into "Something went wrong on CookBook's server. Try again."; raw texts such as "Failed to fetch", "Internal server error" or "Missing bearer token" never reach the screen. Tokens are cleared only when `POST /auth/refresh` answers 401 or 403, or when a request still answers 401 after the one refresh (UI-17); a network failure never clears them. Whenever the tokens are cleared the app returns to the sign-in screen at once (UI-9). When `GET /me` fails at start with status 0 or 5xx the app shows a full-screen "Can't reach CookBook's server." with a Retry button that repeats `GET /me`, keeping the tokens; any other failed answer to that first `GET /me` shows the sign-in screen and leaves the tokens for the next sign-in to replace. A refresh answered 2xx with an unreadable body counts as a server error (the 5xx message, tokens kept). A list (Home recipes, Discover, Friends) shows a count or an empty state only after its request succeeded; after a failure it shows the error message and "Try again". |
| UI-27 | A dialog moves focus to its first focusable element when it opens, keeps Tab and Shift+Tab cycling inside the panel while open, and returns focus to the element that opened it when it closes (UI-6); when one dialog opens over another only the top one traps Tab; keys other than Escape and Tab are left alone. |
| UI-28 | Visibility on the owner row: choosing "Shared with friends" opens the Share dialog without writing; its Save sends `PATCH …/visibility` `{ visibility: 'shared', sharedWithUserIds }`, and Cancel leaves the recipe and the select as they were. Choosing "Public" asks "Publish to everyone? Every version of this recipe becomes visible to all users." with Publish and Cancel. Choosing "Private" writes at once. |
| UI-29 | On a fork, the SAVE-10 banner's Sync asks "Replace your version with the original's latest? Your changes stay in the version history." with Sync and Cancel; on a saved copy Sync runs at once. |
| UI-30 | The desktop window has a minimum size of 760 × 560 px (`BrowserWindow` `minWidth`, `minHeight`, §16 E5); the renderer's layouts are designed for widths from 760 px up. |
| UI-31 | Editor validation shows each message under its own field in sentence case ("Give the recipe a title", "Choose a category", "Name this ingredient", "Write this step", "Servings must be at least 1", "Prep minutes can't be negative", "Cook minutes can't be negative", "Quantity can't be negative", "Minutes must be at least 1", and for the §3.1.1 upper limits "Servings can be at most 6", "Prep minutes can be at most 1440", "Cook minutes can be at most 1440", "Quantity must be more than 0", "Quantity can be at most 10000", "Title can be at most 200 characters", "Description can be at most 500 characters", "Ingredient names can be at most 120 characters", "Notes can be at most 120 characters", "Steps can be at most 1000 characters", "Minutes can be at most 1440", "A recipe can have at most 50 ingredients", "A recipe can have at most 60 steps"; Add ingredient hides at 50 ingredients and Add step at 60 steps), marks the field `aria-invalid`, and scrolls to and focuses the first invalid field. Category starts empty with the placeholder "Choose a category" (a new recipe has no default category). Quantity inputs have the placeholder "Qty". Each ingredient and step row has Move up and Move down buttons. |
| UI-32 | Comments: pressing Enter in the comment input posts it; each comment shows its age next to the author ("just now", "5 min ago", "2 h ago", "3 d ago", and from 7 days on the date, "3 Sep 2026", with English three-letter months whatever the system locale, in local time); after posting, the list is reloaded so the new comment sits where the server's order puts it (COM-3); Delete asks "Delete this comment?" with Delete and Cancel. |
| UI-33 | Toggling a favourite category in Discover updates the chip and re-orders the sections already on screen (favourites first, DISC-9) without reloading the feed or blanking the grid. |
| UI-34 | The friend search re-runs its query after every friends mutation (request, accept, decline, cancel, remove), whether it succeeded or failed, so its rows never show a stale state; a search row for an incoming request offers Accept and Decline. |
| UI-35 | The current route (UI-16) and the cook-mode step are kept in `sessionStorage` (`cookbook.route`) and restored when the window reloads with a valid token, only for the user who saved them (a restored step beyond the recipe's last step opens the last step); when the same user signs in again in the same window after the session ended, the shell keeps the route it had; the editor's unsaved text is not restored. |
| UI-36 | Recipe cards and TheMealDB tiles are `article` elements whose title is a real button that opens the recipe (its click area stretched over the card), so no button sits inside another; the category tag sits on its own line above the title; titles are clamped to two lines with the full title in the `title` attribute; grid rows align cards to the top. |
| UI-37 | Quantities and counts read naturally: "1 serving" and "N servings"; the units `piece` and `cup` take a plural after a quantity above 1 or a decimal that is not a common fraction below 1 ("2 pieces", "3 cups", "1½ cups", "0.4 cups"), and stay singular after 1 or a fraction below 1 ("¾ cup", "½ cup"); `piece` never shows fraction glyphs, so 0.5 reads "0.5 pieces"; an empty quantity with the unit `none` reads "to taste", and with another unit shows the unit alone ("pinch"); but an empty quantity with the unit `none` whose note contains a digit or one of the fraction characters ¼ ⅓ ½ ⅔ ¾ ⅛ anywhere ("1 Can", "Juice of 1/2"; so a quantity-less note such as "cut into 2 cm cubes" also fills the amount column, accepted as the lesser evil next to "to taste"; "anywhere" 2026-09-30, QA-REVIEW-2026-09-30-3 BUG-030 residual, Rotem delegated), or whose first word is one of the CAT-6 measurement words, the unit word "pinch", or their regular English plurals, shows that note in the amount column instead of "to taste" and not again as the note ("1 Can Black Beans"); such a moved note is text, so it carries `dir="auto"` and is not rescaled by the servings stepper, through `ingredientAmount` in `@rsn/shared/util-domain` (2026-09-30, BUG-030); quantities in `cup`, `tbsp` and `tsp` within 0.02 of ¼, ⅓, ½, ⅔ or ¾ (plus a whole number) show that fraction ("¾ cup", "1½ tbsp"). Textareas use `--radius-lg` instead of the pill radius. The WX-10 weather line writes the temperature with its unit ("19 °C and cloudy tonight in Jerusalem"; the rest of the line's wording is unchanged). |
| UI-38 | Copy: on Home, a user with no own or saved recipes sees "Save or write a recipe and we'll suggest one for the weather." in the recommendation card with Show another hidden; while the model works the card says "Choosing from your recipes…" (Home) or "Choosing from the community…" (Discover). Home shows no greeting sub-line until the weather line arrives. A Discover category with no public recipes says "No community recipes in this category yet" above its TheMealDB tiles. Cards and tiles in Discover carry no category tag, in the split view's sections and in the one-category view alike, because the heading or the selected chip already names it; and rows under "Your friends" carry no "Friends" tag. The SAVE-9 source link is an inline text link in the attribution line (body font, underline on hover), not a button. |
| UI-39 | The app mark is Lucide's `ChefHat` (§16 V21) in white on an `--color-accent` circle, as in the nav bar: it is the renderer's favicon (`apps/web/public/favicon.ico` and a 32 px PNG) and the desktop app icon (`apps/desktop/build/icon.png`, 1024 × 1024, used by electron-builder). |
| UI-40 | The editor warns before losing work (Rotem, chat 2026-09-30: "warn"; wording Rotem delegated): leaving an editor whose fields (or picked, not yet uploaded images) differ from what it opened with (nav tab, New recipe, Cancel, sign-out; closing the window is not guarded) asks "Discard your changes?" with Keep editing and Discard, and Save leaves without asking; removing an image, including a picked one not yet uploaded, asks "Remove this photo?" and, on the recipe that owns the image (IMG-7), "Remove this photo from your recipe and from every copy of it?", with Remove and Cancel. Uploads and removals still apply at once, as before. |
| UI-41 | Text a user or the AI writes (recipe titles, descriptions, ingredient names and notes, step text, comments, the AI answer, the cook-mode question box and the editor's text fields) carries `dir="auto"`, so Hebrew and other right-to-left text lines up right-to-left while the interface itself stays left-to-right (§15). The heading font is unchanged; letters Caprasimo lacks fall back to the system font (Rotem delegated, chat 2026-09-30: "choose what you think best"). |

Details decided on 2026-09-30 from the second QA review `docs/reviews/QA-REVIEW-2026-09-30.md` (a local, gitignored file) (Rotem delegated, chat 2026-09-30: "move on to take care of the rest as we done so far"):

| ID | Requirement |
|---|---|
| UI-42 | Dialogs render into `document.body` (a React portal), not inside the screen that opens them, and the backdrop sits at the `--z-dialog` elevation defined in the `libs/web/ui` stylesheet, above every page element including `.washed` photos, so no stacking context on a screen can cover a dialog or its buttons (UI-6). |
| UI-43 | Error texts, refining UI-26: a 5xx answer whose `message` is one of the API's own user-facing texts ("The assistant is unavailable right now", "The assistant didn't answer. Ask again.", "Image storage is unavailable right now") is shown as it is; every other 5xx still reads "Something went wrong on CookBook's server. Try again.". Every class-validator decorator in the API DTOs carries a message written for people ("Write a comment", "Servings can be at most 6"); when a 400's `message` is a list the client shows its first entry (an empty list, or an empty first entry, falls back to the HTTP status text). The global `ValidationPipe` sends those messages without the property path Nest would put in front of nested ones ("Name this ingredient", not "ingredients.0.Name this ingredient"), and the §3.1.1 content check (`validateRecipeContent` in `@rsn/shared/util-domain`) words its messages the same way ("Give the recipe a title", "Name ingredient 2", "Write step 1", "Servings must be a whole number of at least 1", "Cook minutes must be a whole number, 0 or more", "Step 1: minutes must be a whole number of at least 1"). The route-parameter pipes (`ParseUUIDPipe` and the like) keep Nest's default text, because the renderer never sends a malformed id. A 400 from `POST /recommend` shows "No recommendation right now" in the card when it has no picks; a 400 on a "Show another" re-prompt, with picks on screen, reads like an empty re-prompt: the picks stay and the muted "No other suggestions right now" appears (UI-18). |
| UI-44 | When the session ends (the tokens are cleared after a 401, UI-26), the sign-in screen shows "Your session ended. Sign in again." above the form (on both the Sign in and Sign up sides of the switch), only when tokens had been stored (a wrong password on the sign-in screen never shows it); after a sign-out it shows no message, and it clears on the next sign-in. |
| UI-45 | In the editor each step's text is a textarea of two rows that grows with its text (at most 1000 characters, §3.1.1); line breaks inside a step are kept, and only the surrounding whitespace is trimmed; step text (detail screen and cook mode), the recipe description and comment bodies are shown with their line breaks (`white-space: pre-line`, class `text-pre-line`); TheMealDB preview steps are already one line each (CAT-6 splits on line breaks) and need no such class. The note placeholder is "Note". |
| UI-46 | Every date in the app uses one format, independent of the system locale: "29 Sep 2026", and with a time "29 Sep 2026, 01:07" (24-hour, local time), through `formatDate` / `formatDateTime` in `@rsn/shared/util-domain`: comment dates and their hover text (UI-32), version dates (UI-12), "Friends since". |
| UI-47 | Copy: no footnote under or next to the rating input (no "Counted in the average" either); the UI-25 notice counts in words ("1 image could not be uploaded", "2 images could not be uploaded"); the SAVE-10 banner on a fork says "The original has changed since you forked it" (a saved copy keeps "since you saved it"); in cook mode the answer to a typed question is headed "Answer" and the answer to the no-question tip "Tip for this step"; the WX-10 weather line uses phrases: clear → "clear", cloudy → "cloudy", fog → "foggy", drizzle → "drizzly", rain → "rainy", snow → "snowy", thunderstorm → "stormy" ("21 °C and stormy this afternoon in Mexico City"). |
| UI-48 | The nutrition breakdown under the NUT-11 figure is headed "For the recipe as written (N servings)" ("1 serving" when N is 1) in ingredients mode; meal mode has no per-ingredient rows and so no such heading, because it does not follow the servings stepper (UI-14). |
| UI-49 | The friend search needs at least 2 characters (after trimming); with exactly 1 the field says "Type at least 2 characters" and sends no request; an empty field shows no hint. |
| UI-50 | Right-to-left text inside left-to-right layouts (UI-41): containers keep the page's alignment (left), and the user or AI text inside them is its own element with `dir="auto"` and `unicode-bidi: plaintext`, so a Hebrew title's two-line clamp and ellipsis follow the text while the card stays left-aligned; clamped titles in cards and recommendation lists are left-aligned whatever their direction, and every other such text (recipe and cook-mode titles, descriptions, steps, comments, AI answers) aligns to its own start, so a Hebrew paragraph lines up on the right; a step's minutes tag sits outside the directional text element; recommendation titles (UI-18) are clamped to two lines like cards (UI-36); a clamped title ends with "…" whatever its direction (for a right-to-left title the "…" sits just left of its left-aligned text); the SAVE-9 source link is inline in its line (left-aligned, not centred; a focusable `span` with `role="button"` that opens on click, Enter and Space, because a `<button>` never lays out inline) and only its title is the directional element. |
| UI-51 | Sharing needs at least one friend (REC-2): in the Share dialog Save stays disabled until a friend is ticked, and `PATCH /recipes/:id/visibility` with `visibility: 'shared'` and an empty `sharedWithUserIds` answers 400 "Pick at least one friend to share with". The TheMealDB preview formats quantities with the shared UI-37 formatter too. |

### 11.6 API surface (Rotem delegated, chat 2026-09-28)

All routes are under `API_GLOBAL_PREFIX` (`api/v1`), JSON in and out, DTO types in `@rsn/shared/util-contracts`, validated with `class-validator` 0.15.1 + `class-transformer` 0.5.1 (§16 V16) through a global `ValidationPipe` (`whitelist`, `transform`). Errors are `{ statusCode, message, error }` (Nest default). Ids are UUIDs.

| Method and path | Library | Purpose (SPEC IDs) |
|---|---|---|
| `GET /health` | apps/api | liveness |
| `POST /auth/sign-up`, `POST /auth/sign-in`, `POST /auth/refresh` | feature-auth | AUTH-5..7; return `{ accessToken, refreshToken, user }` |
| `GET /me` | feature-auth | current user (id, username, email, favouriteCategories) |
| `PUT /me/favourite-categories` | feature-discover | DISC-6, DISC-9 |
| `GET /users/search?q=` | feature-friends | FR-3, FR-4 |
| `GET /friends` | feature-friends | friends, incoming and outgoing pending requests |
| `POST /friends/requests` `{ userId }`, `POST /friends/requests/:id/accept`, `POST /friends/requests/:id/decline`, `DELETE /friends/requests/:id`, `DELETE /friends/:userId` | feature-friends | FR-2, FR-4 |
| `GET /recipes` | feature-recipes | SAVE-3: the caller's own and saved recipes (current version), plus recipes shared with the caller, each flagged `relation: own \| saved \| shared` (SAVE-7) and `updateAvailable` (SAVE-10) |
| `POST /recipes` | feature-recipes | REC-1: create private recipe with version 1 |
| `GET /recipes/:id` | feature-recipes | REC-4: current version with `canCook`, `canEdit`, `relation`, image URLs (IMG-4), rating summary, `savedFrom` or `forkedFrom` (SAVE-9, one of them at most), `myCopyId` (DISC-10), `updateAvailable` (SAVE-10), `versionCount` |
| `GET /recipes/:id/versions`, `GET /recipes/:id/versions/:n` | feature-recipes | REC-7 |
| `PUT /recipes/:id` | feature-recipes | REC-6/7: new version (owner); on a saved copy the first edit makes it a fork (SAVE-5/6/7) |
| `PATCH /recipes/:id/visibility` `{ visibility, sharedWithUserIds? }` | feature-recipes | REC-2, REC-3, REC-6, REC-8; 400 on a saved copy unless `private` (SAVE-8); 400 "You can only share with friends" when an id is not the caller's friend (FR-1; message Rotem delegated, 2026-09-29) |
| `DELETE /recipes/:id` | feature-recipes | REC-6, SAVE-4, SAVE-7: removes a saved copy outright; soft-deletes an own recipe or a fork |
| `POST /recipes/:id/save` | feature-recipes | SAVE-1, SAVE-4: copies a public recipe to the caller |
| `POST /recipes/catalogue/:mealId/save` | feature-recipes | CAT-3, CAT-4, CAT-7 |
| `POST /recipes/:id/sync` | feature-recipes | SAVE-10: the copy takes the source's current version |
| `POST /recipes/:id/images` (multipart), `DELETE /recipes/:id/images/:index` | feature-recipes | IMG-3, IMG-6, IMG-7 |
| `GET /recipes/:id/nutrition?mode=` | feature-nutrition | NUT-1..6 |
| `GET /discover?category=&page=` | feature-discover | DISC-1..10 |
| `GET /discover/catalogue/:mealId` | feature-discover | CAT-2 preview, with `myCopyId` (DISC-10) |
| `PUT /recipes/:id/rating` `{ stars }`, `GET /recipes/:id/rating` | feature-social | RATE-1..4 |
| `GET /recipes/:id/comments`, `POST /recipes/:id/comments`, `DELETE /comments/:id`, `PUT /comments/:id/vote` `{ value }` | feature-social | COM-1..3 |
| `POST /cook/ask`, `GET /cook/quota` | feature-cook | COOK-1..10 |
| `POST /recommend` | feature-recommend | WX-1..10 |

Response bodies (Rotem delegated, 2026-09-28, matched by `libs/web/data-access-api`): `POST /recipes`, `PUT /recipes/:id`, `PATCH …/visibility`, `POST /recipes/:id/save`, `POST /recipes/catalogue/:mealId/save`, `POST /recipes/:id/sync` and `GET /recipes/:id/versions/:n` return `RecipeDetailDto`; `DELETE /recipes/:id` and `DELETE /comments/:id` return 204; image upload and delete return `ImageUploadResponse`; `PUT /recipes/:id/rating` and `GET /recipes/:id/rating` return `RatingSummaryDto`; `POST /recipes/:id/comments` and `PUT /comments/:id/vote` return `CommentDto`; `PUT /me/favourite-categories` returns `UserDto`; every friend mutation (`POST /friends/requests`, accept, decline, cancel, `DELETE /friends/:userId`) returns the updated `FriendsResponse`; `GET /discover/catalogue/:mealId` returns `CataloguePreviewDto`.

CORS is enabled for the Electron renderer: `CORS_ORIGINS` (comma-separated; default `http://localhost:4200`, and `.env.example` also lists `http://localhost:4300`, the `web:preview` port that web-e2e uses) plus the literal origin `null`, which is what Chromium sends for a page loaded from `file://` in the packaged app. Request bodies up to 6 MB for the image route only. When an OpenRouter call fails (`POST /cook/ask`, `POST /recommend`), the client receives 503 with the message "The assistant is unavailable right now"; the provider's status and body excerpt go only to the LOG-5 `error` entry and the API log (Rotem delegated, chat 2026-09-29). OpenRouter calls carry the optional attribution headers `HTTP-Referer: https://cookbook.local` and `X-Title: CookBook` (§16 O6 lists both as optional app-identification headers); no `response_format` parameter is sent, the JSON answer of WX-10 is extracted from the text.

---

## 12. Data storage [INTENT L13]

| ID | Requirement |
|---|---|
| DB-1 | Data is stored in a PostgreSQL server for now. |
| DB-2 | The infrastructure allows moving the database to Docker later: connection settings are environment variables only (`DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME` in `.env.example`), and `docker/` holds the compose definition. |
| DB-3 | TypeORM `synchronize` is always false; schema changes go through migrations only (`.env.example` line 14). |
| DB-4 | The backend is the only process that talks to PostgreSQL. (Rotem, chat 2026-09-08) |
| DB-5 | Development database: PostgreSQL **18.6**, installed on Rotem's machine at `C:\Program Files\PostgreSQL\18`, Windows service `postgresql-x64-18` (running), port 5432. (Detected 2026-09-08 with `postgres.exe --version` and `postgresql.conf`.) |
| DB-6 | Packages: `typeorm` 1.1.1, `pg` 8.23.0, `@nestjs/typeorm` 11.0.3 (§16 V13, V19). Migrations live in `libs/api/data-access-db/src/migrations`, are TypeScript classes registered explicitly in the `DataSource` (no globs, so the webpack bundle carries them), and run with `pnpm nx run api-data-access-db:migrate` (`typeorm-ts-node-commonjs migration:run -d libs/api/data-access-db/src/data-source.ts`, the TypeORM CLI wrapper that loads TypeScript through ts-node; `migrate:revert` wraps `migration:revert`) before the API starts; `migrationsRun` is false so a start never mutates the schema. At boot the API asks the `DataSource` whether migrations are pending (`showMigrations()`) and, when some are, logs an error "Database schema is out of date: run pnpm nx run api-data-access-db:migrate" and still starts; when the check itself fails it logs "Could not check for pending migrations: <cause>" and still starts; `pnpm nx run api-data-access-db:migrate:show` (`migration:show`) lists applied and pending migrations with the same env loading as `migrate`, and README "Run" says to run `migrate` after every pull (Rotem delegated, chat 2026-09-29). `docker/docker-compose.yml` runs `postgres:18` reading the same `DB_*` keys. `docker/setup-database.sql`, run once as the `postgres` superuser (pgAdmin Query Tool on the `postgres` database, or `psql -f`), creates the login role `recipe_app` (no superuser, no create-db, no create-role) and the database `recipe_social_network` owned by it; its header holds the pgAdmin steps (Rotem, chat 2026-09-28). (Rotem delegated, chat 2026-09-28) |

### 12.1 Schema (Rotem delegated, chat 2026-09-28)

All tables have `id uuid` primary key (`gen_random_uuid()`), `created_at` and `updated_at timestamptz`. Names are snake_case in PostgreSQL and camelCase in TypeScript.

| Table | Columns | Notes |
|---|---|---|
| `users` | `username text unique`, `email text unique null`, `password_hash text`, `favourite_categories text[]` (max 3, DISC-6) | AUTH-2, AUTH-5 |
| `recipes` | `owner_id → users`, `visibility text` (private/shared/public), `current_version_id → recipe_versions null`, `saved_from_recipe_id → recipes null` (SAVE-4 source), `forked_from_recipe_id → recipes null` (SAVE-6, set on the first edit of a saved copy of a user recipe), `forked_at timestamptz null` (SAVE-7, set on the first edit of any copy; null on a saved copy), `synced_version_number int null` (SAVE-10, the source version a copy of a user recipe last took), `source text` (user/themealdb), `external_id text null` (idMeal), `external_title text null` (SAVE-9, `strMeal` at save time), `external_image_url text null`, `rating_average numeric(3,2) null`, `rating_count int default 0`, `deleted_at timestamptz null` | REC-1..8, SAVE-4..10, CAT-3, CAT-7, RATE-2 |
| `recipe_versions` | `recipe_id → recipes`, `version_number int` (unique with recipe), `title text`, `description text null`, `category text`, `servings int`, `prep_minutes int null`, `cook_minutes int null`, `ingredients jsonb`, `steps jsonb`, `image_paths text[]` | §3.1.1, REC-7, IMG-3 |
| `recipe_shares` | `recipe_id → recipes`, `user_id → users`, unique pair | REC-2, REC-8 |
| `friend_requests` | `from_user_id → users`, `to_user_id → users`, `status text` (pending/accepted/declined), unique pair | FR-2; a friendship is an `accepted` row in either direction |
| `ratings` | `recipe_id → recipes`, `user_id → users`, `stars smallint` (1–5), unique pair | RATE-1, RATE-4 |
| `comments` | `recipe_id → recipes`, `user_id → users`, `body text`, `deleted_at null` | COM-1, COM-3 |
| `comment_votes` | `comment_id → comments`, `user_id → users`, `value smallint` (1/-1), unique pair | COM-2 |
| `ai_daily_usage` | `user_id → users`, `day date`, `count int`, unique pair | COOK-8 |

Deleting a user's own recipe or a fork soft-deletes it (`deleted_at`) so saved copies keep their attribution; saved copies of a deleted recipe stay. Deleting a saved copy deletes that row and its versions. A row is a copy when `saved_from_recipe_id` is set or `source` is `themealdb` (SAVE-7), and a saved copy when it is a copy with `forked_at` null.

Migration `SharedWithNobodyPrivate` (2026-09-30, FR-4, UI-51) changes data only: every `shared` recipe with no `recipe_shares` row becomes `private` (with `updated_at` set). Its `down()` does nothing, because the rows it changed can no longer be told apart, so `migrate:revert` of it is a no-op.

Migration `SaveOwnership` (2026-09-29, SAVE-7..10, CAT-7) adds `forked_at`, `synced_version_number` and `external_title`, then backfills existing rows. `forked_at` becomes `updated_at` on copies of user recipes with `forked_from_recipe_id` set, and on TheMealDB copies with more than one version. `external_title` becomes the version 1 title on TheMealDB rows. `synced_version_number` becomes the source's current version number on copies of user recipes. Every copy still unforked is set to `private`, and its `recipe_shares` rows are deleted (SAVE-8; Rotem, chat 2026-09-29).

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

The file was regenerated on 2026-09-28 (Rotem delegated). Keys now: `NODE_ENV`, `API_PORT`, `API_GLOBAL_PREFIX`, `CORS_ORIGINS`, `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`, `JWT_ACCESS_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_TTL`, `THEMEALDB_KEY`, `THEMEALDB_BASE_URL` (v2), `USDA_FDC_KEY`, `USDA_FDC_BASE_URL`, `OPENROUTER_KEY`, `OPENROUTER_BASE_URL`, `OPENROUTER_MODEL` (`minimax/minimax-m3`), `OPENROUTER_SHARED_DAILY_QUOTA_PER_USER` (100), `OPENMETEO_FORECAST_URL`, `OPENMETEO_GEOCODING_URL`, `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_SERVICE_ACCOUNT_PATH`, `IMAGE_SIGNED_URL_TTL_SECONDS`, `PROMPT_LOG_DIR` (optional; overrides the LOG-3 folder `<project root>/log/`, used by tests), `VITE_API_BASE_URL`. Removed: `MODEL_KEY_ENCRYPTION_KEY`, `OPENROUTER_MODEL_PREFERENCE`, `LOCATION_COORD_PRECISION`, `STORAGE_*`. The API reads `.env.local` then `.env` from the repository root through `@nestjs/config` 12.0.1 (§16 V16) and refuses to start when `DB_*` or the JWT secrets are missing.

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
- O7 https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion (moved from /docs/api-reference/chat-completion; re-checked 2026-09-30) — `models` array; usage schema; `reasoning.effort` enum including "none".
- O8 https://openrouter.ai/docs/use-cases/usage-accounting — usage always included; `cost` field.
- O9 https://openrouter.ai/docs/api-reference/get-a-generation — `/generation?id=` fields.
- O10 https://openrouter.ai/docs/features/privacy-and-logging and https://openrouter.ai/docs/guides/privacy/data-collection — provider policies; free/paid training toggles.
- O11 https://openrouter.ai/docs/guides/routing/model-fallbacks — fallback semantics.
- O12 https://daily.dev/posts/minimax-m2-7-and-m3-are-completely-free-ai-coding-openrouter-softwareengineer-6vblnf0fz — third-party: two-week free promotion (2026-08-26); refuted by O1 and O3 on 2026-09-08, kept as the record behind COOK-3.
- O13 https://openrouter.ai/api/v1/models/minimax/minimax-m3/endpoints — 12 providers on 2026-09-08, 13 on 2026-09-30 (cheapest two unchanged); CoreWeave $0.23/$0.96 at 262,144 context; GMICloud $0.24/$0.96 at 1,048,576.
- O14 https://openrouter.ai/docs/guides/best-practices/reasoning-tokens and https://openrouter.ai/api/v1/models (2026-09-30) — reasoning tokens are billed as output and count against `max_tokens`; `exclude: true` still generates and bills them; `effort: "none"` disables reasoning; `minimax/minimax-m3` reasoning is `{ mandatory: false }` with no effort levels or reasoning budget.

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
- U11 Live FDC website search, https://fdc.nal.usda.gov/portal-data/external/search, and food details, https://fdc.nal.usda.gov/portal-data/external/<fdcId> (2026-09-29; the app's own API calls with the shared key returned the same foods the same day). Hit order: "Garlic" ("Garlic sauce" first, "Garlic, raw" third); "Plum Tomatoes" ("Plum, raw" first; with all words required only "Tomatoes, raw"); "Ground Beef" ("Beef, ground", then "Beef, ground, raw"); "Rice" and "Eggs" (no raw rice and no plain egg among the first 25 hits); "Plain Flour" with all words required (only "Snacks, pretzels, hard, plain, made with enriched flour" rows); "+rice raw", "+eggs raw", "+carrots raw", "+potatoes raw" (raw foods first: "Rice, black, unenriched, raw", "Egg, whole, raw", "Carrots, raw", "Potatoes, raw, skin" then "Potatoes, flesh and skin, raw"); "Water" ("Water convolvulus,raw" and "Water, tap"); "Butter" ("Butter, Clarified butter (ghee)", "Butter, tub", "Butter, salted"); "Chicken Breast" ("Chicken, breast, boneless, skinless, raw"). Portions: 2709786 FNDDS "Garlic, raw" ("1 clove" 3 g); 2709719 FNDDS "Tomatoes, raw" ("1 plum tomato" 60 g, "1 whole" 125 g); 170457 SR Legacy tomatoes ("cup cherry tomatoes" 149 g, "cherry" 17 g); 2709660 FNDDS "Carrots, raw" ("1 baby carrot" 10 g before "1 regular carrot" 60 g); 169230 SR Legacy "Garlic, raw" (modifier "cloves", amount 3, 9 g); Foundation 1104647 "Garlic, raw" (only a RACC portion, 85 g) and 748967 eggs (modifier "whole without shell", unit "egg", 50.3 g).
- U12 https://www.nist.gov/document/2026-nist-handbook-44-appendix-c — NIST Handbook 44 (2026) Appendix C: 1 lb avoirdupois = 453.592 37 g exactly; 1 oz avoirdupois = 28.349 523 125 g.
- U13 https://fdc.nal.usda.gov/help/ — search operators: `+word` requires the word, `-word` excludes it; the website's "Require All Words" box. The API's `FoodSearchCriteria` (U2) has no `requireAllWords` field, so the API uses the operator; `pageSize` defaults to 50, range 1–200.
- U14 https://fdc.nal.usda.gov/docs/Download_Field_Descriptions_Oct2020.pdf — food_portion: `amount` is the number of measure units, `gram_weight` the weight of the whole measure; FNDDS: `portion_description` holds the household text, `modifier` is a portion code and `amount` is not defined; SR Legacy: the text is in `modifier`. Foundation portions carry the unit in `measureUnit.name` (U11). `FoodPortion` also has `sequenceNumber` (U2). The OpenAPI `SRLegacyFoodItem` lists no `foodPortions`, so their absence is tolerated (NUT-5).

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
- W13 https://github.com/eggert/tz/blob/main/backward (tzdb 2026d) and https://open-meteo.com/en/docs/geocoding-api (2026-09-30) — backward links `America/Nuuk America/Godthab`, `Asia/Kolkata Asia/Calcutta`, `Asia/Kathmandu Asia/Katmandu`, `Asia/Yangon Asia/Rangoon`, `Asia/Ho_Chi_Minh Asia/Saigon`, `Atlantic/Faroe Atlantic/Faeroe`, `Europe/Kyiv Europe/Kiev`; each geocoding result carries `timezone`; `count` up to 100 (default 10). Behind WX-9.

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
- V15 https://registry.npmjs.org/@nestjs/config, /@nestjs/jwt, /@nestjs/passport, /passport-jwt, /bcrypt, /argon2 — config 12.0.0, jwt 12.0.1, passport 12.0.0 (all peer `@nestjs/common ^11 || ^12`); passport-jwt 4.0.1; passport 0.7.0; bcrypt 6.0.0; argon2 0.45.1 (2026-09-08). Superseded by AUTH-6 (scrypt, no passport).
- V16 `npm view` on 2026-09-28 — @nestjs/typeorm 12.0.2 (peers `@nestjs/core ^10||^11||^12`, `typeorm ^0.3||^1.0.0-dev`, node ≥ 20.19), @nestjs/jwt 12.0.2 (peer `@nestjs/common ^8…^12`), @nestjs/config 12.0.1 (peer `@nestjs/common ^11||^12`), class-validator 0.15.1 (MIT), class-transformer 0.5.1 (MIT), typeorm 1.1.1, pg 8.23.0, @types/pg 8.23.1, firebase-admin 14.5.0 (Apache-2.0, node ≥ 22), @types/multer 2.2.0, @nestjs/platform-express latest 11.x is 11.2.6 (installed 11.2.3 with core 11.2.3).
- V19 `node_modules/@nestjs/{config,jwt,typeorm}/package.json` on 2026-09-28 — all three 12.x packages are `"type": "module"` with no `require` export, so Jest in the CommonJS workspace cannot load them (TEST-1, §11.1). **The API pins the CommonJS lines: @nestjs/config 4.0.4 (peer `@nestjs/common ^10||^11`), @nestjs/jwt 11.0.2, @nestjs/typeorm 11.0.3 (peers `@nestjs/core ^10||^11`, `typeorm ^0.3||^1.0.0-dev`).** The NestJS 12 move (§11.1) therefore also moves these three to 12.x together with the ESM switch. (Rotem delegated, chat 2026-09-28; supersedes V14's choice of 12.0.1.)
- V17 https://registry.npmjs.org/lucide-react — 1.48.0 on 2026-09-28 (ISC, peer react ^16.5.1…^19); supersedes the 1.43.0 in D5 and UI-5.
- V18 https://registry.npmjs.org/@fontsource/caprasimo and /@fontsource-variable/figtree — still 5.3.0 on 2026-09-28.
- V20 https://mimesniff.spec.whatwg.org/ §6.1 "Matching an image type pattern" (living standard, fetched 2026-09-29) — JPEG `FF D8 FF`; PNG `89 50 4E 47 0D 0A 1A 0A`; WebP `52 49 46 46 ?? ?? ?? ?? 57 45 42 50 56 50` (`RIFF`, four bytes of any value, `WEBPVP`; 14 bytes). Behind IMG-6's byte check.
- V21 https://unpkg.com/lucide-react@1.48.0/dist/lucide-react.d.ts and https://lucide.dev/icons/chef-hat (2026-09-29) — 1.48.0 exports `ChefHat` (icon since 0.47.0). Behind UI-39.

**Security**
- S1 https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html (2026-09-28) — "Use Argon2id with a minimum configuration of 19 MiB of memory, an iteration count of 2, and 1 degree of parallelism. If Argon2id is not available, use scrypt"; scrypt "N=2^17 (128 MiB), r=8 (1024 bytes), p=1".

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
- E5 https://www.electronjs.org/docs/latest/api/structures/base-window-options and https://raw.githubusercontent.com/electron/electron/v44.2.0/docs/api/structures/base-window-options.md (2026-09-29) — `minWidth` and `minHeight`, Integer, optional, default 0, present in v44.2.0. Behind UI-30.

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
