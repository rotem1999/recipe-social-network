// The preload bridge of apps/desktop (SPEC WX-8, WX-9), as the renderer sees it inside
// `browser.execute`. It mirrors `CookBookBridge` in apps/desktop/src/preload/index.ts;
// scope:desktop may not import scope:web, so the shape is declared here for the specs.
declare global {
  interface Window {
    cookbook?: { readonly timezone: string } | undefined;
  }
}

export {};
