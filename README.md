# Input Filler

A cross-browser extension that fills every form field on the current page with realistic, human-readable data — real names, emails, addresses, and coherent sentences (not `xkj4f9` and not lorem-ipsum) — via a toolbar popup, keyboard shortcuts, and a context menu. One codebase builds for Chromium-based browsers and Firefox using [WXT](https://wxt.dev).

## Status — v1

v1 ships the readable-data core, smart field detection, per-type filling with SPA event dispatch, a typed settings model, and a user-defined Custom Field Rules engine. All data is generated locally — **no network permission** on any browser.

**Browser targets:** Chrome, Edge, Brave (Chromium, MV3) and Firefox (MV2). Safari is deferred (needs macOS/Xcode).

## Install (development)

```bash
npm install
```

Load the built extension:

- **Chrome / Edge / Brave:** `npm run build`, then load `.output/chrome-mv3` via `chrome://extensions` → Developer mode → Load unpacked.
- **Firefox:** `npm run build:firefox`, then load `.output/firefox-mv2` via `about:debugging` → This Firefox → Load Temporary Add-on (pick `manifest.json`).

For live development with hot reload:

```bash
npm run dev            # Chrome
npm run dev:firefox    # Firefox (web-ext)
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run build` | Build the Chromium (MV3) target into `.output/chrome-mv3` |
| `npm run build:firefox` | Build the Firefox (MV2) target into `.output/firefox-mv2` |
| `npm run zip` | Package store-ready `.zip` files |
| `npm test` | Run the Vitest suite (unit + jsdom DOM-integration tests) |
| `npm run typecheck` | `wxt prepare` + `tsc --noEmit` |
| `npm run dev` / `npm run dev:firefox` | WXT dev mode with hot reload |

## How it works

1. The toolbar icon opens the popup; **Fill all forms** / **Fill this form** / **Clear** message the background.
2. The background relays the action to the active tab's content script (keyboard shortcuts and the context menu trigger the same path).
3. The content script discovers `input`/`textarea`/`select` **and contenteditable rich-text editors** (TipTap/ProseMirror, Quill, Slate, Trix, Draft.js — including open shadow roots and same-origin iframes), skips hidden/disabled/readonly/ignored fields, then per field: applies a matching Custom Rule or auto-detects the type, generates a readable value, and sets it while dispatching `input`/`change`/`click` so React/Vue/Angular validators fire (rich editors are filled via `execCommand`/input events so their internal model stays in sync).

### Readable data

Generators produce fresh data on every fill. A name and company are generated once per fill pass and reused, so an email derives from the name shown in the name field. Generic text fields receive coherent sentences from a themeable real-sentence corpus (business/tech/casual/support/reviews/general), fitted to the field's length limit at sentence boundaries, with a grammatical fallback for very small fields.

### Custom Field Rules

On the options page, define rules that match fields (by name/id/label/type/CSS selector, optionally scoped to a site) and override auto-detection with: a builtin generator, static text, a template (`{firstName}.{lastName}@mail.com`, including parameterized `{number(1000,9999)}`), a list, or a regex. Rules evaluate in priority order, first-match-wins. Rule sets can be imported/exported as JSON. Regex generation is guarded against catastrophic backtracking and oversized output; rules persist chunked under the sync-storage quota.

## Project structure

```
entrypoints/      WXT entrypoints (background, content, popup, options)
src/lib/          Framework-agnostic, fully unit-tested logic
  generators.ts   readable data generators + named-generator registry
  detect.ts       field-type detection (hint > autocomplete > type > regex > fallback)
  fillers.ts      per-type fill strategies + SPA event dispatch
  rules.ts        Custom Field Rules engine (matcher + resolvers + chunked storage)
  orchestrate.ts  fill-all / fill-this-form / clear orchestration
  settings.ts     typed settings + storage.sync + migration
  text.ts         dummyText readability engine + themed corpus
  wordlists.ts    hand-curated wordlists
  corpus/         themed real-sentence banks (license-clean, original compositions)
tests/            Vitest unit + jsdom DOM-integration tests
scripts/          icon generator
```

## Testing

`npm test` runs unit tests for the pure logic (generators, detection, rules, settings, rules UI, popup status, background mapping) and jsdom DOM-integration tests for the fillers and content orchestration. Live browser QA (loading the extension in real Chrome/Edge/Brave/Firefox and verifying SPA state sync) is the one verification that cannot run in this build environment and is the recommended pre-release step.

## Scope and deferred work

**v1 non-goals:** saving/submitting data; AI-based generation; per-site saved profiles; network access.

**Deferred:** Safari (needs macOS/Xcode); large-scale license-clean corpus ingestion (v1 ships a modest hand-curated corpus); richer rules-UI extras (drag-to-reorder, live "test rule", presets, right-click quick-add); full Fake Filler settings parity; Firefox MV3 (v1 ships MV2); store publishing (Chrome Web Store / Edge Add-ons / AMO).

## License

TBD — choose before publishing. The bundled wordlists and corpus are original compositions.
