// UI-3/UI-4: the one global stylesheet this library owns. Importing
// `@rsn/web/ui` anywhere in the renderer loads it exactly once; Vite cannot
// resolve a CSS subpath through the tsconfig alias, so the sheet is pulled in
// from TypeScript instead of being exported as a separate entry point.
import './../styles/tokens.css';
