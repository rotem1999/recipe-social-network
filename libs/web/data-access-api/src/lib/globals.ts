// SPEC.md §11.5 UI-16, UI-17: the two globals the renderer relies on. This is a module
// (not an ambient .d.ts) so every consumer of @rsn/web/data-access-api sees the
// declarations through the import in index.ts.
declare global {
  // UI-17: the only environment value the renderer reads.
  interface ImportMetaEnv {
    readonly VITE_API_BASE_URL?: string;
  }
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
  // UI-16: the Electron preload exposes the machine's IANA timezone; in a plain
  // browser the property is absent and the hook falls back to Intl.
  interface Window {
    cookbook?: { timezone: string } | undefined;
  }
}

export {};
