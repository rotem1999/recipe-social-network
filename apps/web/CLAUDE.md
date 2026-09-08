# apps/web

React 19 + TypeScript renderer, bundled by Vite, loaded by the Electron window. Composes `@rsn/web/feature-*` into the tabs: Home (saved recipes + recommendations), Discover, cook mode.
- Only public config: `VITE_API_BASE_URL`. Never imports scope:api code or holds a key; all data comes through the API.
- Images load straight from the signed URLs in API responses.
- Tests: Vitest 5 + React Testing Library 16.3; Browser Mode via `@vitest/browser-playwright` + `vitest-browser-react`.
