// Preload bridge (SPEC WX-8, WX-9; apps/desktop/CLAUDE.md).
// Exposes the machine's IANA timezone, the only location signal the app uses.
// No geolocation, no IP lookup, no network access here.
import { contextBridge } from 'electron';

export interface CookBookBridge {
  /** IANA timezone of the OS, for example "Asia/Jerusalem" (SPEC WX-9). */
  readonly timezone: string;
}

const bridge: CookBookBridge = {
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

contextBridge.exposeInMainWorld('cookbook', bridge);
