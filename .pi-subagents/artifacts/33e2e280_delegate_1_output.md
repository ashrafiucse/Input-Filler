Baseline is green (91/91). Here is my independent testing-coverage review.

## Coverage review — Input Filler v1

### Behaviors adequately covered (no gap)
- **Select avoiding disabled/empty options** — `fillers.test.ts` loops 50× asserting value ∈ {one, three}. ✔
- **Confirmation-field copy** — `orchestrate.test.ts` AE2 asserts `confirm_password === password`. ✔
- **Agree-to-terms** — `orchestrate.test.ts` asserts `agree_terms.checked === true`. ✔
- **Custom-rule matching/modes (any/all), urlPattern gating, disabled-rule skip, priority/first-match-wins** — `rules.test.ts`. ✔
- **All 5 fill kinds** — builtin/static/list/regex exercised via `resolveFill`; template exercised via `resolveTemplate` (parameterized `{number(min,max)}` included). ✔
- **Regex guards** — `isSafeRegex` rejects `(a+)+` and `{5000}`; `generateFromRegex` returns null for unsafe; valid `ORD-\d{6}` generates. ✔
- **Chunked rule storage round-trip + stale cleanup** — 300-rule multi-chunk round-trip + shrink removes `.2` chunk. ✔
- **Settings migration** — v0→v1 upgrade adds defaults, malformed input → defaults without throwing. ✔
- **Message contract shapes** — `orchestrate` returns `{filled,skipped}`/`{cleared}`; `formatPopupStatus` pins the `{result:{filled}}`/`{ignored}`/`{error}` shapes the popup consumes. ✔

### Real coverage gaps

1. **[P2] `isIgnoredOrigin` gating has no test** — `src/lib/settings.ts`. This is the R4 blocklist gate (regex match with `includes` fallback in a try/catch). Zero references in `tests/`. A regression in the regex/fallback path would silently allow fills on blocklisted origins. *Add:* unit tests for literal-substring match, regex match, invalid-regex → `includes` fallback, and empty-list → false.

2. **[P2] Background routing/gating (`runOnActiveTab`) untested** — `entrypoints/background.ts`. The plan's U8 scenarios are not covered: "fill-all maps to a fillAll message to the active tab," "an origin matching `ignoredDomains` produces no message" (AE3), "no active tab fails gracefully," plus the undocumented `action !== 'clear'` bypass (clear runs even on ignored domains). `runOnActiveTab` is inline against `browser.*` with no extracted seam, so none of this is reachable by the existing pure-helper tests. *Add:* extract the gated/relay decision (or inject `browser.*` mocks) and assert the no-op-on-blocklist path emits **no** `sendMessage`, the clear-bypass, and the no-tab graceful return.

3. **[P3] `rebuildContextMenu` on/off toggle untested** — `entrypoints/background.ts`. Plan U8: "toggling `contextMenu` off removes the registered items." Not asserted. *Add:* assert zero `contextMenus.create` calls when `settings.general.contextMenu === false`, and 3 items when true.

4. **[P3] Radio in the orchestration flow untested** — `tests/orchestrate.test.ts`. The U7 "mixed form" plan scenario explicitly includes radio, but the fixture omits radios (only `fillField`'s radio unit is tested). Discovery + per-group idempotency through the orchestrator's skip-gate/ordering is unverified. *Add:* a radio group to the mixed-form fixture and assert exactly one option checked per group after `fillAllForms`.

5. **[P3] `resolveFill({kind:'template'})` end-to-end + parameterized `{paragraph(n)}` untested** — `src/lib/rules.ts`. `resolveTemplate` is tested directly, but the `resolveFill`→`template` dispatch and the `callGenerator('paragraph', …)` branch in `resolveGeneratorExpr` are not exercised. Low risk (shared code path) but a refactor could break the dispatch silently. *Add:* `resolveFill` with `kind:'template'` and `resolveTemplate('{paragraph(2)}')`.

6. **[P3] `loadSettings` sync→local fallback on `sync.get` throw untested** — `src/lib/settings.ts`. The try/catch fallback exists but the fake storage never throws, so the fallback path is dead in tests. *Add:* a sync area whose `get` rejects, assert local is read (or defaults returned) without throwing.

7. **[P3] Invalid regex in a rule *match condition* not asserted no-throw** — `src/lib/rules.ts` `matchRule`. `compileRegex`→null→`false` is the intended behavior (plan U6 error path), but no test passes a malformed `match.field`/`match.id` regex and asserts `matchRule` returns false rather than throwing. *Add:* `matchRule(rule({match:{mode:'any',field:'('}}), …)` returns false without throwing.

No tests were found that assert the wrong thing.