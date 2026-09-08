# Handoff: Potluck — Recipe Social Network UI

## Overview
Complete UI design for "Potluck", the recipe social network specified in `SPEC.md` (Draft 2, 2026-09-08). Five screens: Home, Discover, Friends, Recipe detail, and Cook mode, plus a New-recipe dialog. The design follows four UX rules: (1) less is more, (2) good infrastructure needs no instructions, (3) UI matches the technology, (4) visual feedback on every interaction.

## About the Design Files
The files in this bundle are **design references created in HTML** — an interactive prototype showing intended look and behavior, not production code to copy. The task is to **recreate these designs in the target codebase**: the Nx monorepo at `recipe-social-network` (React 19 + TypeScript renderer in `apps/web`, presentational components in `libs/web/ui`, per SPEC §11.3). Open `Recipe Social Network.dc.html` in a browser to interact with the prototype (keep `support.js` and `_ds/` beside it).

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, shadows and copy are final. Recreate pixel-perfectly using the theme tokens below (ship them as CSS custom properties, exactly as in `_ds/.../styles.css`).

## Theme (Organic)
Source of truth: `_ds/organic-a2f58494-e42c-4054-8f82-12e22132329c/styles.css` (tokens + component classes) and `theme/theme.json` (machine-readable parameters). Link the stylesheet or port its `:root` block verbatim.

- Ground `--color-bg: #f5ead8`, surface `#ebddc5`, text `#201e1d`
- Accent (terracotta) `#c67139` with 100–900 ramp; accent-2 (sage) `#7a8a5e` with ramp; neutral ramp `#f9f4ed…#2e2b25`
- Fonts: **Caprasimo** (headings, weight 400) over **Figtree** (body 15px/1.55) — Google Fonts
- Spacing scale: 4.4 / 8.8 / 13.2 / 17.6 / 26.4 / 35.2 px (`--space-1..8`)
- Radii: 8 / 16 / 28 px; cards & dialogs use `calc(28px * 1.15)`; buttons, tags, inputs are full pills (999px)
- Shadows: `--shadow-sm/md/lg` (ink-tinted, see styles.css)
- Icons: Lucide, stroke-width 2.75
- Images: wrap photos in `.washed` — `filter: saturate(.6) contrast(.85) brightness(1.1) opacity(.94)`
- Focus: `outline: 2px solid var(--color-accent); outline-offset: 2px` — never the browser default
- Body-size accent text uses `--color-accent-700` (contrast); base accent is fine for icons/large text

## Screens

### 1. Header (all screens except Cook mode)
`.nav` bar, max-width 1100px centered. Left: brand — 34px terracotta circle with a white chef-hat Lucide icon + "Potluck" in Caprasimo 20px. Links: Home, Discover, Friends (active link = accent color via `aria-current="page"`). Right: primary pill button "+ New recipe", then a 34px avatar circle (sage-200 bg, sage-800 initial).

### 2. Home
- H1 greeting ("Good evening, Rotem") + muted 14px line with weather: e.g. "9° and clear tonight in Tel Aviv — city read from your clock's timezone, nothing tracked." (Rule 3: WX-8 derives location from OS timezone only — say so.)
- **Recommendation card**: sage-100 full-width rounded container (radius `28*1.15`), 64px sage-200 circle icon at left, kicker "FROM YOUR SAVED RECIPES" (11px caps, sage-700), recipe title (h3), one-line reason. Actions: ghost "Show another" (re-ranks per WX-5, excluding shown) + primary "Cook it".
- **Your recipes** grid: `repeat(auto-fill, minmax(230px, 1fr))`, 18px gap. Card: 110px washed image area (placeholder tint from accent-200/sage-200/neutral-200), then title + neutral category tag, star row, meta "40 min · serves 2". Hover: shadow md + translateY(-2px). Whole card opens Recipe detail.

### 3. Discover
- Category chips: all 14 TheMealDB categories (DISC-7) as pill buttons. Favourites (max 3, DISC-6) pinned first with a filled accent star inside a tinted accent-100 chip; other chips show a faint ☆ that toggles favourite on click (stopPropagation). Clicking a chip filters the grid (active chip = solid accent, cream text).
- Recipe grid like Home, plus byline ("by Noa" or "TheMealDB") and a right-aligned action: pill **Save** button (download icon). After save it becomes a ghost **Cook** button (SAVE-2: cook requires save; the affordance itself teaches the rule).
- Footer: 11px muted "Recipe data and imagery: TheMealDB" (required attribution).

### 4. Friends
Max-width 640px. Search input (pill) "Find by username or email" + primary "Send request" (label flips to "Request sent", then a "Request sent" neutral tag appears on the new row). Rows: 38px initial circle, name (600), muted sub-line, right status — sage "Friends" tag, or Accept (primary) / Decline (secondary) for pending requests (FR-2).

### 5. Recipe detail
- Ghost back button labelled with the originating screen ("Home"/"Discover").
- Tag row: neutral category tag; visibility tag (neutral "Private" / sage "Shared with 3 friends" / accent "Public"); outline version tag ("v3") with tooltip about REC-7 versioning. H1 title, muted description. Forks show "Forked from …" in sage-700 (SAVE-6).
- Right column: big primary **Start cooking** (or **Save to cook** if the viewer hasn't saved a public recipe); star average rendered in quarter steps (two overlaid ★★★★★ spans, colored span clipped to `width: avg/5*100%` rounded to quarters) — **hover reveals the decimal** (e.g. "4.75", RATE-3) + "23 ratings".
- Two columns `minmax(220px,5fr) / minmax(0,7fr)`, 44px gap:
  - **Ingredients**: header with − / + 28px pill steppers and "N servings"; quantities rescale live. Rows: accent-700 bold quantity (64px min), name, muted note. 1px 7%-ink row rules.
  - **Nutrition patch**: neutral-100 rounded box — big Caprasimo kcal number, "kcal per portion · USDA FoodData Central", segmented control [Ingredients | Meal name] (NUT-4); meal-name mode adds a note about the FNDDS match.
  - **Steps**: numbered 26px accent-100 circles, 14px text; steps with `durationMinutes` get an inline sage timer tag ("7 min").
  - **Your rating**: five 20px clickable stars (whole stars only, RATE-1), hover scale(1.2); after rating: sage note "Counted in the average" and the average/count update live. Caption: "Whole stars only — the average shows in quarter steps."
  - **Comments**: Reddit-style ▲ points ▼ column (COM-2); voted arrow tints accent (up) / sage-700 (down), points recolor. Pill input + secondary Post button appends immediately.

### 6. Cook mode (full screen, no app header — Rule 1)
Max-width 760px column. Top: pill icon exit button (X, returns to recipe), recipe title, right-aligned muted quota "82 of 100 AI asks left today" (COOK-8 made visible — Rule 3). Below: 5px progress bar (accent fill, animated width).
Center (vertically): kicker "STEP 3 OF 6", step text as 36px Caprasimo, then actions:
- **Timer** (only when the step has `durationMinutes`): secondary "Start 7 min timer" → morphs to a sage countdown pill "6:59" with a pulsing dot; click stops it. Resets on step change.
- **Ask about this step** (sparkles icon): shows pulsing "Reading the recipe…" ~900ms, then a sage-100 rounded bubble "TIP FOR THIS STEP" + answer; decrements quota (COOK-2/4/9 — context is automatic, no chat history).
Bottom: ghost Back (35% opacity on step 1), clickable progress dots (done = accent-300, current = accent, upcoming = neutral-300), primary "Next step" → "Finish" on the last step (returns to the recipe).

### 7. New recipe dialog
Standard `.dialog` over 50% ink backdrop: Title input, Category select (the 14 categories), note "Starts private — share or publish it whenever you like." (REC-1). Cancel / Create; Create adds the recipe and opens its detail screen.

## Interactions & Behavior
- All transitions ~.15s ease; screens enter with a 6px fade-up (.3s).
- Star average: whole-star input, `numeric(3,2)` average, quarter-step display, decimal on hover.
- Save is idempotent and instant (optimistic); Cook is gated on saved/owned/shared.
- Timer: mm:ss countdown, prefix "Done — " at 0:00; cleared on step change/exit.
- Weather context drives greeting + recommendation (prototype exposes a `weather` tweak: Cold night / Hot afternoon / Rainy morning).

## State Management (maps to SPEC)
screen route; savedIds (SAVE-1/4); favCats max 3 (DISC-6); catFilter; per-recipe rating (RATE-1/2); per-comment vote (COM-2); servings override (ingredient scaling is client-side display only); nutrition mode (NUT-4); cook step index, timer seconds, AI loading/answer, daily quota counter (COOK-8); friends list with pending/requested/friend states (FR-2/3). Data fetching: recipes, signed image URLs (IMG-4 — expect URLs to expire, refetch on error), TheMealDB items in Discover only (CAT-2), AI calls via backend only.

## Assets
No raster assets. Image areas are tinted `.washed` placeholders — production loads recipe photos via short-lived signed URLs (IMG-4). Icons are inline Lucide SVGs at stroke-width 2.75 (chef-hat, play, plus, download, timer, sparkles, arrow-left, x, utensils, circle).

## Files
- `Recipe Social Network.dc.html` — the interactive prototype (all screens + logic)
- `support.js` — prototype runtime (reference only, do not ship)
- `_ds/organic-a2f58494-e42c-4054-8f82-12e22132329c/styles.css` — **the theme**: tokens + component classes (port this)
- `_ds/.../readme.md` — the design-system guide (do/don't, ramps, states)
- `theme/theme.json` — machine-readable theme parameters
