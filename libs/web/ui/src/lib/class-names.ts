/** Joins the class names that are actually present. Used by every component here. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter((part): part is string => Boolean(part)).join(' ');
}
