---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
title: "Fix Radix UI Select (button-trigger combobox) dropdown selection"
created: 2026-08-08
depth: lightweight
status: planned
---

# Plan — Fix Radix UI Select (button-trigger combobox) dropdown selection

## 1. Problem frame

A form containing a **Radix UI `Select`** (e.g. shadcn/ui) cannot be filled. The
trigger renders as a **`<button role="combobox">`**, not a readonly `<input>`:

```html
<button type="button" role="combobox" aria-controls="radix-:r1:"
  aria-expanded="false" aria-haspopup="listbox" data-state="closed" data-slot="select-trigger">
  <span data-slot="select-value">Select the student action that awards this badge</span>
  <svg class="lucide-chevron-down">…</svg>
</button>
```

Running the filler on such a form fills **0** fields for the select. The field is
never discovered, never classified, and even if reached the option is never committed.

Existing combobox support targets **input-based** comboboxes (Mantine / MUI /
Chakra / Ant Select): a readonly `<input>` whose options live in a portal
`<div role="listbox">`. Radix differs in two structural ways that today's code
does not handle: (a) the trigger is a **button**, not an input, and (b) the option
**commits on `pointerup`** (Radix items have no `click` handler), after a
`pointermove` highlight.

## 2. Root cause (confirmed by reproduction)

Evidence gathered with a jsdom model of Radix's real event behaviour (open on
`pointerdown`; highlight on `pointermove`; commit on `pointerup`; closed ⇒ no
listbox in the DOM):

| # | Layer | File | Failure | Evidence |
|---|-------|------|---------|----------|
| B1 | Discovery | `src/lib/orchestrate.ts` `collectFields` | Selector is `input,textarea,select` — a `<button role="combobox">` is **never collected**, so it is invisible to `fillAllForms`. | `discoverFields(body)` → `[]` |
| B2 | Detection | `src/lib/detect.ts` step 3a | `detectType` gates combobox on `desc.tag === 'input'`. A button trigger is classified `'sentence'` instead. (`isComboboxDesc()` itself already returns `true` for `role="combobox"`.) | `isComboboxDesc=true`, `detectType='sentence'` |
| B3 | Fill | `src/lib/fillers.ts` `selectCombobox` / `openCombobox` | Fires `pointerdown`+`mousedown`+`click` on the option. Radix commits on **`pointerup`** (and highlights on `pointermove`), so nothing is selected. | committed value stays `""`; `fillAllForms` → `{filled:0, skipped:0}` |

B1 and B2 are why the reported field is never even attempted; B3 is why a direct
`fillCombobox` call still fails.

## 3. Scope

**In scope**
- Discover and fill `<button role="combobox">` (and other non-input) ARIA
  comboboxes, with Radix UI Select as the canonical target.
- Keep input-based combobox behaviour (Mantine/MUI/Chakra/Ant) working unchanged.

**Out of scope (noted, not done)**
- Clearing a button-trigger combobox (`clearAllForms` only resets
  input/textarea/select). Clearing a Radix select is framework-dependent and the
  report is about filling.
- `ignoreFieldsWithContent` recognising an already-selected Radix trigger (`hasContent`
  would read the display `<span>` text). Minor; can be a follow-up.

## 4. Approach (decisions)

- **D1 — Discovery collects `[role="combobox"]`.** Add it to the `collectFields`
  selector. `querySelectorAll` dedupes across a comma selector, so an `<input
  role="combobox">` is still collected exactly once. This is the single change that
  makes button triggers visible to the orchestrator.
- **D2 — Detection drops the `tag === 'input'` gate**, guarded against
  contenteditable: `if (isComboboxDesc(desc) && !desc.isContentEditable) return
  'combobox';`. `isComboboxDesc` already matches `role="combobox"` /
  `aria-haspopup="listbox"` / `readonly + aria-controls`, so button triggers now
  classify correctly and rich-text editors stay on the `paragraph` path.
- **D3 — Fill the full pointer+mouse lifecycle.** Generalise the synthetic-event
  helper to cover `pointermove | pointerdown | pointerup | mousedown | mouseup`.
  Open the trigger with `focus` → `pointerdown` → `mousedown` → `click` (Radix
  opens on `pointerdown`; Mantine/MUI/Chakra open on mousedown/click). Select an
  option with `pointermove` → `pointerdown` → `pointerup` → `mousedown` →
  `mouseup` → `click` — a realistic single left-button tap that commits under any
  framework's model (Radix pointerup, Mantine/MUI/Chakra click, Headless UI
  click/keydown). Set `button: 0` and `pointerType: 'mouse'` on pointer events so
  framework guards that check left-button/mouse pass.
- **No new state, no new files.** Reuses the existing serialised `comboboxChain`,
  `listboxScope` (already resolves Radix's `aria-controls` via `getElementById`,
  which handles the `radix-:r1:` colon), `waitForOptions`, and `chooseFrom`.

Why not a Radix-only branch? A unified full-lifecycle tap is simpler, needs no
library sniffing, and cannot regress the existing input-combobox tests (their
options only listen for `click`; the extra pointer events are inert).

## 5. Implementation units

### Unit A — Generalise synthetic pointer/mouse events
**File:** `src/lib/fillers.ts`
- Widen `fireEvent`'s `type` to `'pointermove' | 'pointerdown' | 'pointerup' | 'mousedown' | 'mouseup'`.
- Construct pointer events with `{ bubbles:true, cancelable:true, button:0, pointerType:'mouse' }` (PointerEvent when the realm exposes it, else MouseEvent) and mouse events with `{ bubbles:true, cancelable:true, button:0 }`. Preserve the existing realm-correct constructor + try/catch fallback.
- `openCombobox`: keep `focus` + `pointerdown` + `mousedown` + `click` (unchanged ordering; already opens Radix/Mantine/MUI/Chakra).
- `selectCombobox`: fire `pointermove` → `pointerdown` → `pointerup` → `mousedown` → `mouseup` → `click` on the chosen option.

**Tests (`tests/fillers.test.ts`):**
- New `buildRadixSelect(opts, cfg?)` harness mirroring the Mantine one: a
  `<button role="combobox" aria-controls=… aria-haspopup="listbox">` whose
  `pointerdown` portals a `<div role="listbox">` of `<div role="option"
  data-value=…>`; `pointermove` sets `data-highlighted`; **`pointerup`** commits
  (updates a value store + the trigger display span).
- `fillCombobox` opens and commits a Radix option (random); value ∈ option labels.
- `strategy:'first'` always selects the first Radix option across iterations.
- `strategy:'match'` selects by exact value/text (then substring); falls back to first.
- Disabled Radix option (`aria-disabled="true"`) is never chosen.
- No-options / never-opens Radix select is a graceful no-op (no throw).
- Regression: the existing Mantine combobox tests still pass unchanged.

### Unit B — Discover non-input combobox triggers
**File:** `src/lib/orchestrate.ts` (`collectFields`)
- Change the main selector to `'input,textarea,select,[role="combobox"]'`.

**Tests (`tests/orchestrate.test.ts`):**
- `discoverFields` collects a `<button role="combobox">` attached to the body.
- `fillAllForms` fills a mounted Radix select end-to-end (filled increments; the
  selected value is committed). Add a `mountRadixSelect` helper next to
  `mountCombobox`.
- When `settings.select.enabled === false`, a Radix select is skipped (existing
  `shouldSkip` already keys on `isComboboxDesc`, so this is a guard test).

### Unit C — Classify button-trigger comboboxes
**File:** `src/lib/detect.ts` step 3a
- Replace `if (desc.tag === 'input' && isComboboxDesc(desc))` with
  `if (!desc.isContentEditable && isComboboxDesc(desc))`. Update the comment.

**Tests (`tests/detect.test.ts`):**
- `detectType` returns `'combobox'` for a `button`/`div` descriptor with
  `role:"combobox"` and with `ariaHaspopup:"listbox"`.
- A `button` without combobox signals stays on a non-combobox type (e.g. a submit
  button is not misclassified).
- A contenteditable descriptor with `role:"combobox"` stays `'paragraph'`
  (guard against the exotic combo).

## 6. Risks & mitigations
- **Double-commit on input comboboxes:** firing pointerup *and* click on a
  Mantine option sets the value twice (same value) and, after the first commit,
  the option is removed from the DOM — harmless. Covered by unchanged Mantine tests.
- **Toggle-close on open:** major libs open on pointerdown/mousedown and dismiss
  on outside-pointerdown, not on a second trigger click, so the open lifecycle
  cannot close itself. Radix opens on `pointerdown` and does not toggle on `click`.
- **`pointerType` realism:** default-constructed pointer events have an empty
  `pointerType`; setting `'mouse'` matches real interaction and satisfies guards.
- **Real-browser verification:** jsdom models the event wiring, but the extension
  should be smoke-tested against a live Radix/shadcn select page before release.

## 7. Execution direction
- Test-first: add the Radix harness + failing tests, then implement A→C, then run
  the full `npm test` (vitest) and `npm run typecheck`. The scratch reproduction
  used to confirm the root cause has been removed; the permanent Radix tests
  replace it.

## 8. Verification
- `npm test` — all existing tests plus the new Radix cases.
- `npm run typecheck` — no new type errors.
- Manual: load the unpacked build, open a page with a shadcn `Select`, run the
  filler, confirm the dropdown opens and a real option is selected.
