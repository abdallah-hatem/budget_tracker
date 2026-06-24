/** Parse a "major.minor.patch" string into a numeric tuple, or null if invalid. */
export function parseVersion(v: string | null | undefined): [number, number, number] | null {
  if (!v) return null;
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/**
 * True only when `installed` is a valid version strictly BELOW a valid `min`.
 * Fails OPEN: if either version is missing/unparseable, returns false (never
 * block), so a bad config or unknown version can't lock users out.
 */
export function isUpdateRequired(
  installed: string | null | undefined,
  min: string | null | undefined,
): boolean {
  const a = parseVersion(installed);
  const b = parseVersion(min);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}
