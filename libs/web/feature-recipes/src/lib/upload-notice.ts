// SPEC.md UI-25: the editor opens a new recipe's detail screen as soon as
// `POST /recipes` succeeds, even when an image upload then fails; the detail
// screen shows what failed. Both screens live in this library, so the notice
// is handed over here, keyed by recipe id, without a detour through the shell.
const notices = new Map<string, string>();

/**
 * UI-25/UI-47: "The recipe was saved, but 1 image could not be uploaded: <message>",
 * counting in words ("2 images").
 */
export function uploadNoticeText(failed: number, message: string): string {
  const images = failed === 1 ? '1 image' : `${failed} images`;
  return `The recipe was saved, but ${images} could not be uploaded: ${message}`;
}

/** Called by the editor before it hands the new recipe to the shell. */
export function setUploadNotice(recipeId: string, text: string): void {
  notices.set(recipeId, text);
}

/** Read by the detail screen when it mounts; null when there is none. */
export function peekUploadNotice(recipeId: string): string | null {
  return notices.get(recipeId) ?? null;
}

/** The notice is shown once: the detail screen drops it after reading it. */
export function clearUploadNotice(recipeId: string): void {
  notices.delete(recipeId);
}
