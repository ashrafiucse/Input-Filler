Confirmed the guard weakness and DoS impact empirically (`(a|a)+b` against 28 chars → **130 s**). Review complete.

---

## Code Review — Input Filler (security + maintainability)

### Verified correct (per instruction — not re-flagged)
- **Chunked rules storage** (`rules.ts saveRules/loadRules`): correct — re-chunks on save, falls back sync→local, removes stale trailing chunks, tests cover round-trip + shrink. ✔
- **Fill-side regex ReDoS guard + output cap** (`generateFromRegex`): correct for the generation path — `isSafeRegex` gate + `re.max=5` + `MAX_REGEX_OUTPUT=100` slice. ✔
- **No XSS via fill values**: no `innerHTML`/`eval`/`document.write`/`new Function` anywhere in `src`; values go only to `.value`/`.checked`. ✔
- **`externally_connectable` absent** (`wxt.config.ts`): web pages cannot reach `runtime.onMessage`. Good. ✔
- **`safeMatches`** (`rules.ts`): correctly try/catch-guarded; CSS selectors can't execute. ✔

### Findings

1. **P2 — `src/lib/rules.ts` (`matchRule`) + `src/lib/settings.ts` (`isIgnoredOrigin`): match-side regexes run unguarded against page-controlled content.** Unlike the fill-side path (which checks `isSafeRegex`), `match.field`/`match.id`/`match.label`/`urlPattern` and `ignoredDomains` are compiled via `compileRegex`/`new RegExp` and `.test()`-ed against the page's `name`/`id`/`label`/`origin` with **no** ReDoS check — a user-imported evil pattern (e.g. `(a|a)+b`) freezes the tab on an adversarial field name. *Fix:* add a `safeCompile()` that returns `null` when `!isSafeRegex(pattern)` and use it for all match/`urlPattern`/`ignoredDomains` compilation; also exercise it in `validateRule`/`importRules`. (This is the realistic DoS vector; the 130 s backtracking above is via this path.)

2. **P2 — `src/lib/rules-ui.ts` (`importRules`/`isRuleShape`): imported-rule validation is too loose.** `isRuleShape` only checks `id` is a string and `match`/`fill` are `instanceof Object` (also realm-fragile and null-insecure); it does not validate `match.mode`, `fill.kind`, or that the string fields are strings, and never calls `validateRule`/`isSafeRegex`. This is the entry point for finding #1 and for malformed payloads that throw at fill time. *Fix:* validate `mode∈{any,all}`, `kind` against `FillKind`, string-ness of all pattern/value fields, and reject/flag unsafe match regexes during import.

3. **P3 — `src/lib/rules.ts` (`isSafeRegex`): the guard is incomplete.** It only rejects an *inner quantifier*; classic alternation evil regexes slip through — empirically `isSafeRegex('(a|a)+')`, `('(a|aa)+')`, `('(a|.)*$')` all return `true`. Benign for generation, but it undermines the guard wherever it's relied on. *Fix:* detect overlapping-alternation-in-quantified-group, or run user regexes through `re2` / a time-boxed execution wrapper instead of a hand-rolled heuristic.

4. **P3 — `src/lib/orchestrate.ts` (`fillOne`): `resolveFill` is not wrapped in try/catch, so one malformed rule aborts the entire fill pass.** A rule like `{ fill: { kind: 'list' } }` (no `value`, which passes `isRuleShape`) makes `value.split(',')` throw in `resolveFill`, rejecting the message and leaving the rest of the page unfilled. *Fix:* wrap per-field rule resolution in try/catch and skip the field on failure.

5. **P3 — `entrypoints/background.ts` & `entrypoints/content.ts` (`runtime.onMessage`): message senders are not validated.** Pages can't reach these (no `externally_connectable`), so the realistic reach is a content script in a cross-origin `<iframe>` (same extension, `allFrames:true`) triggering `fillAll`/`fillForm`/`clear` on the *active tab*. Impact is low (form filling only) but it's a free trigger from a third-party frame. *Fix:* ignore/validate `sender` (e.g. require `sender.frameId == null` for top-frame-only actions, or a trusted-origin allowlist).

6. **P3 — `src/lib/orchestrate.ts` (`clearAllForms`): dead code.** The `if (el.tagName.toLowerCase() === 'option') continue;` guard is unreachable — `discoverFields` only yields `input`/`textarea`/`select`, never `option`. *Fix:* remove the line.

7. **Informational (by-design) — password logging.** `settings.password.logToConsole` echoes the generated password to the page's DevTools console (`orchestrate.ts`). It's off by default and mirrors the origin tool, but the value persists in that tab's console history. No code change required; document the behavior in the options UI near the toggle.

No P0/P1 blockers. Findings #1 + #2 together form the one material security gap (importable unsafe match-regex → tab DoS on `<all_urls>`); the rest are hardening and cleanup.