// Turns a rejected request into the text the screen shows (UI-14 inline messages).
// `ApiError.message` already carries the API's message, so `Error.message` is enough.

/** The message to show for a failed call; a plain fallback for a non-Error cause. */
export function errorMessage(cause: unknown, fallback: string): string {
  if (cause instanceof Error && cause.message.length > 0) {
    return cause.message;
  }
  return fallback;
}
