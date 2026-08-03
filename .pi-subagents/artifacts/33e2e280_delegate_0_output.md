Review complete. All findings verified against the actual code (and confirmed via test runs / targeted checks). No files were edited.

## Correctness Review Findings

### P1

**1. Message routing double-fires, fills non-active tabs, and races the popup status.** (`entrypoints/popup/main.ts:20` + `entrypoints/background.ts:63` + `entrypoints/content.ts:14`)
The popup sends `browser.runtime.sendMessage({action})`. Per WebExtension semantics that message is delivered to `runtime.onMessage` in **both** the background and **every** content script (all tabs), and the content listener has no sender/shape guard — so the active tab fills twice (direct broadcast + background's `tabs.sendMessage` relay), every other open tab that has the content script also fills, and the popup response races between content's raw `{filled,skipped}` and the background's wrapped `{result:{...}}` (content usually wins → `formatPopupStatus` sees no `.result` → shows "Filled 0 fields"). Violates R1 ("active tab") and the popup count contract.
*Fix:* Have the popup target only the active tab directly (`browser.tabs.query({active:true,currentWindow:true})` → `browser.tabs.sendMessage(tabId,{action})`), and/or tag popup→background messages so the content script ignores them; also normalize the response shape (content returns wrapped `{result}` or popup unwraps raw `{filled}`). Confirm in the deferred browser-QA step.

### P2

**2. Textarea/`paragraph` fill ignores `maxlength` (fails R7 and AE4).** (`src/lib/orchestrate.ts:194-195`)
`generateValue`'s `'paragraph'` branch returns `paragraph(int(2,4,...),...)` (2–4 whole corpus sentences, easily 80–360 chars) and never calls `effectiveMaxLen`; only `'sentence'/'text'/default` call `dummyText(effectiveMaxLen(...))`. A bare `<textarea>` is detected as `'paragraph'` (`detect.ts` fallback), so `<textarea maxlength="40">` (literally AE4) gets unbounded text instead of ≤40 trimmed at a sentence boundary.
*Fix:* Route textarea/paragraph through `dummyText(effectiveMaxLen(el,settings), theme, rng)` (or give `paragraph` a `maxLen` that trims at sentence boundaries).

**3. `int()` can exceed `max` when `step` doesn't evenly divide the span.** (`src/lib/rng.ts:int`)
`steps = Math.round(span/step)` then `k ∈ [0,steps]`. Verified: `int(0,10,4)` → possible values `{0,4,8,12}`, so `12 > max=10`. This drives `number`/`range` generation, violating R10 ("respect their constraints") whenever a field has a non-dividing step (e.g. `min=0 max=10 step=4`).
*Fix:* Use `Math.floor(span/step)` and clamp the result to `[min,max]`.

**4. Radio groups are scoped to the whole document, not the form owner.** (`src/lib/fillers.ts:fillRadio`)
`fillRadio` queries `el.ownerDocument.querySelectorAll('input[type=radio][name=...]')` and short-circuits when `group.some(r=>r.checked)`. With two forms each containing a same-named group (e.g. both `name="pref"`), only the first form's group ever gets a selection; the second form's radios are skipped. Contradicts R1/R10 and HTML radio-group scoping (per form owner). The existing radio test only covers a single form, so this is untested.
*Fix:* Scope the group query to `el.form ?? el.closest('form') ?? el.ownerDocument`.

**5. `urlPattern`-only rules pass validation but never match (silently dead rules).** (`src/lib/rules-ui.ts:validateRule` vs `src/lib/rules.ts:matchRule`)
`validateRule` treats a bare `urlPattern` as satisfying the "at least one condition" requirement, but `matchRule` returns `false` whenever `conditions.length === 0` (after the urlPattern gate). A user can save a site-scoped "fill everything here" rule that the engine silently ignores. Violates R16/R17.
*Fix:* Make them agree — either `matchRule` matches every field on a matching origin when no field condition is set, or `validateRule` requires at least one field condition.

**6. `describeField` never resolves the `label` attribute, so label-based detection/rules are dead.** (`src/lib/detect.ts:describeField`)
`FieldDescriptor.label` is declared and consumed by `buildHaystack` (R9 regex stage), `matchRule` (`m.label`), and `orchestrate.fieldHaystack`, but `describeField` never sets it — there's no `<label for>`, wrapping `<label>`, or `aria-labelledby` text resolution. So the `label` match attribute (R9, R16) never fires in practice.
*Fix:* In `describeField`, resolve associated label text via `el.labels`, `el.closest('label')`, and the `aria-labelledby` target's `textContent`.

**7. "Fill this form" is unreliable via popup/context-menu (often fills the whole page).** (`src/lib/orchestrate.ts:fillCurrentForm` + background relay)
`fillCurrentForm` uses `document.activeElement` at message time, but the background relays only `{action:'fillForm'}` (no target element). When triggered from the popup (or the async context-menu path that doesn't pass `info`'s clicked element), `activeElement` is frequently `<body>` → `formScopeFor` falls back to `closest('form') ?? parentElement` = `<html>` → the whole page is filled. Violates R2 ("the `<form>` containing the currently focused field").
*Fix:* Have the content script remember the last-focused field (focus listener) and use that; or have the context-menu handler pass the right-clicked element/target; or capture focus before the popup opens.

### P3

**8. Rule storage sync→local fallback can serve stale data.** (`src/lib/rules.ts:saveRules`/`loadRules`)
If `adapter.sync.set` throws (quota) mid-save, `saveRules` writes to `local` but leaves the older rules+meta in `sync`; `loadRules` prefers `sync`, so subsequent loads return the stale smaller set. *Fix:* on local fallback, clear the sync meta/chunks, or have `loadRules` compare versions/timestamps.

**9. `datetime-local`/`month`/`time`/`week` all map to `'date'` and get an invalid `YYYY-MM-DD` value.** (`src/lib/detect.ts:mapType` + `generators.date`) Those input types reject the value → field stays empty (R10). *Fix:* generate the per-type format, or skip.

**10. Confirmation copy keys off the last *value* field, not the same-type source, and `state` spans all forms.** (`src/lib/orchestrate.ts:fillOne`/`fillScope:259`)
`state.lastValue` is shared across every form in a `fillAllForms` pass and is overwritten by any value-bearing field; if another value field sits between a source and its confirm (or across forms), the confirm copies the wrong value (R12 edge). *Fix:* track last value per logical type, or match the confirm to the nearest preceding same-type field.

**11. `data-fake` hints are returned verbatim, but `generateValue` expects snake_case.** (`src/lib/detect.ts:detectType`)
A hint like `data-fake="firstName"` (a valid generator name) becomes logical type `"firstName"`, which hits `generateValue`'s `default` → `dummyText` instead of a name (R9). *Fix:* normalize hints to snake_case (or accept both in `generateValue`).

**12. `<select multiple>` is not handled.** (`src/lib/fillers.ts:fillSelect`)
It sets `el.value`, which is a no-op for multiple selects, so they never get a selection (R10). *Fix:* set `option.selected` for one or more non-disabled options.

**13. `isIgnoredOrigin` treats literal domain entries as unanchored regex.** (`src/lib/settings.ts:isIgnoredOrigin`)
An entry like `example.com` compiles to `/example.com/`, so `.` matches any char (e.g. matches `example_com` / `evil-example.com.attacker`), over-matching the blocklist (R4). *Fix:* escape literals or require explicit regex delimiters.

**14. `clipToWordBoundary` cuts mid-word when the budget is smaller than the first token.** (`src/lib/text.ts:clipToWordBoundary`)
For a tiny `maxLen` with no space in the slice it returns the raw slice (e.g. `Manag`), violating R7/AE4's "single readable word / no mid-word cuts". *Fix:* return the first whole word (even if it exceeds `maxLen`) or empty when nothing fits.

**15. `mergeDefaults` doesn't coerce array fields.** (`src/lib/settings.ts:mergeDefaults`)
If stored `confirmationFields`/`agreeToTermsFields`/`ignoreFields`/`ignoredDomains` are non-arrays (e.g. a string from a hand-edited store), they survive the merge and later make `matchesAny`'s `tokens.some(...)` throw, which the U5 "malformed data → defaults" scenario doesn't actually cover. *Fix:* coerce these to arrays (or reset to defaults) during merge/migrate.

---

### Verification performed
- Read all target files end-to-end; cross-checked message contracts, detection priority, skip gate, fillers, rules engine, settings merge/migration.
- Ran `npx vitest run` → 91/91 pass; noted that the existing suite does **not** cover findings #2 (textarea+maxlength), #4 (multi-form radios), #5 (urlPattern-only), or the messaging double-fire.
- Confirmed #3 (`int` overflow) and #6 (`label` never populated) with targeted grep + a node reproduction.

### Residual risks
- Finding #1 (messaging semantics) cannot be definitively confirmed without the deferred live-browser QA; the code structure matches the well-known `runtime.sendMessage` fan-out/double-handle pattern, but final confirmation belongs to the browser smoke step.
- No build/typecheck run in this pass (review-only); the messaging fix and textarea fix will need new tests added (multi-form radio scope, textarea maxlength, popup→content routing) which are currently absent.