# Input Filler

A cross-browser extension that fills every form field on the current page with realistic, human-readable data — real names, emails, addresses, and coherent sentences (not `xkj4f9` and not lorem-ipsum) — via a toolbar popup, keyboard shortcuts, and a context menu. One codebase builds for Chromium-based browsers and Firefox using [WXT](https://wxt.dev).

## Status — v1

v1 ships the readable-data core, smart field detection, per-type filling with SPA event dispatch, a typed settings model, and a user-defined Custom Field Rules engine. All data is generated locally — **no network permission** on any browser.

**Browser targets:** Chrome, Edge, Brave (Chromium, MV3) and Firefox (MV2). Safari is deferred (needs macOS/Xcode).

## Install

Download the latest build for your browser, unzip it, and load it — no build tools needed.

| Browser | Download |
| --- | --- |
| Chrome / Edge / Brave | [⬇︎ Input Filler (Chrome build)](https://github.com/ashrafiucse/Input-Filler/releases/latest/download/input-filler-chrome.zip) |
| Firefox | [⬇︎ Input Filler (Firefox build)](https://github.com/ashrafiucse/Input-Filler/releases/latest/download/input-filler-firefox.zip) |

> If the links 404, no release has been published yet — see [Releases](https://github.com/ashrafiucse/Input-Filler/releases), or build from source below. All past versions are on the Releases page too.

**After downloading:**

1. **Unzip** the file to a permanent folder (you'll point the browser at it, so don't delete it afterwards — e.g. `Documents/input-filler-chrome`).
2. **Chrome / Edge / Brave:** open `chrome://extensions` (Edge: `edge://extensions`) → turn on **Developer mode** (top right) → **Load unpacked** → select the unzipped folder.
3. **Firefox:** open `about:debugging` → **This Firefox** → **Load Temporary Add-on…** → select `manifest.json` inside the unzipped folder. (Firefox temporary add-ons unload on browser restart — reload it the same way, or use the Chrome build in a Chromium browser for a persistent install.)

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

### Type-aware detection

Each field is classified so it receives data that fits its purpose, not a generic string. Detection is **keyword- and shape-driven** from the field's label / name / placeholder / aria / class — nothing is hard-coded to a specific app, so the same rules fill an LMS course-title field, a generic "Job title", or any other project's fields. Priority order:

1. explicit `data-fake` / `data-fill-type` hint
2. **embed / custom-code** (placeholder is an `<iframe>`/HTML snippet, or mentions embed/custom HTML)
3. **`<select>`** — always picks a valid `<option>` (never a generated string, which usually selects nothing)
4. **custom combobox dropdowns** (Mantine/MUI/Chakra Select and other ARIA comboboxes — a readonly `<input>` whose options live in a portal `role="listbox"`) — opens the dropdown and clicks a real `role="option"`, since these inputs are readonly and their value is framework-controlled (typing/setting it is ignored). Honors the same first/match/random strategy as `<select>`.
5. `autocomplete` token
6. input `type` (email/tel/url/number/date/color/checkbox/radio/range/password/**search**)
7. **placeholder shape** — an email-shaped example (`name@example.com`), a URL-shaped example (`https://…`, `example.com`), or a password cue (`Password`, `Min. 8 characters`) implies that type even with no keyword
8. free-text short-circuit: `<textarea>` and contenteditable rich editors → readable paragraph
9. keyword regex → semantic type
10. element-type fallback

Recognized semantic types and the data they generate:

| Type | Matched by (examples) | Filled with |
| --- | --- | --- |
| `title` | course/chapter/lesson/quiz/assignment/session/curriculum/project + title/name/topic; or "Write Title" | a realistic title (e.g. *Introduction to Web Development*) |
| `search` | "Search…", `type=search` | a realistic search term |
| `subdomain` | subdomain / slug / namespace / handle | a lowercase hyphenated slug |
| `tax_name` | tax name / tax label | VAT, GST, Sales Tax, … |
| `objective` | learning objective / outcome | an action-oriented outcome sentence |
| `embed` | `<iframe>` / custom HTML/CSS/JS placeholder | a **real** embed for the named provider (YouTube/Vimeo/Spotify/SoundCloud); any provider when none is named (audio = Islamic content) |
| `video_url` / `audio_url` | "Paste YouTube/Vimeo URL", Spotify/SoundCloud link field (beats `type=url`) | a real link for the named provider, else a video/audio rotation |
| `email` / `url` / `password` | `type=`, autocomplete, **or** placeholder shape | a generated email / URL / strong password |
| identity / address | first/last/full name, phone, street, city, state, zip, country, company, job title, username | readable structured data |
| `company` | company / org / **platform / tenant / academy / institute / school / brand / workspace** name | a generated organization name |
| `paragraph` | `<textarea>`, rich-text editor, descriptions/bios (field-intent matched) | coherent multi-sentence text |

> **Note:** a field whose *only* signal is a generic placeholder (e.g. "Give it a name", "Please specify…") can't be inferred and falls back to a readable sentence. For those, add a `label`, an `aria-label`, or a Custom Field Rule. All semantic types are also available as builtin generators in Custom Rules (`title`, `searchTerm`, `subdomain`, `taxName`, `objective`, `embedCode`, …).

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
