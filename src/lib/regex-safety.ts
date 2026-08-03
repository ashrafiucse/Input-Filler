// Shared regex-safety helpers used by the rules engine (match + fill sides) and
// the settings layer (ignored-domains). Kept dependency-free to avoid import
// cycles between rules.ts and settings.ts.

/**
 * Reject patterns likely to cause catastrophic backtracking or oversized
 * output: a quantifier on a group that itself contains a quantifier (e.g.
 * `(a+)+`), a quantified group containing alternation (e.g. `(a|a)+`), or an
 * explicit large repetition count (`{1000}` / `{1000,}`). Heuristic — may
 * false-reject some valid patterns, which is acceptable for user/imported
 * regexes (the rule simply won't match/generate).
 */
export function isSafeRegex(pattern: string): boolean {
  if (/\([^()]*[+*?][^()]*\)[+*?{]/.test(pattern)) return false; // nested quantifier
  if (/\([^()]*\|[^()]*\)[+*?{]/.test(pattern)) return false; // quantified alternation
  if (/\{\d{4,}/.test(pattern)) return false; // large repetition count
  return true;
}

/** Compile only if the pattern is safe AND valid; null otherwise. */
export function safeCompile(pattern: string, flags = ''): RegExp | null {
  if (!isSafeRegex(pattern)) return null;
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}
