# apps/desktop

Electron 44 main + preload, built by electron-vite 5 through `nx:run-commands` targets (no Nx Electron plugin). Loads the apps/web renderer. Targets Windows, macOS, Linux.
- Tag scope:desktop; may import scope:shared only. Holds no API key, no Firebase or OpenRouter SDK.
- Location = the OS IANA timezone (e.g. `Asia/Jerusalem`) sent to the API. No `navigator.geolocation`, no IP lookup.
- Unit tests: Vitest, node environment, `vi.mock('electron')`.
