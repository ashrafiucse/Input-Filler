# Input Filler — Build Plan

A **cross-browser** Manifest V3 extension that fills every form field on the
current page with **realistic, human-readable** data via a toolbar button,
keyboard shortcut, and context menu. One codebase → builds for every major
browser.

## 0. Browser Support Matrix

| Browser        | Engine    | Build target | Distribution                        |
|----------------|-----------|--------------|-------------------------------------|
| Chrome         | Blink     | `chrome`     | Chrome Web Store                    |
| Edge           | Blink     | `chrome`     | Microsoft Edge Add-ons              |
| Brave / Opera / Vivaldi | Blink | `chrome` | Chrome Web Store (Chromium auto)    |
| Firefox        | Gecko     | `firefox`    | Mozilla Add-ons (AMO)               |
| Safari (macOS/iOS) | WebKit | `safari`  | App Store (via Safari Web Ext.)     |

**Strategy:** write once, build per-target. Use **WXT** (`wxt.dev`) as the
framework — it wraps Vite, auto-generates per-browser manifests, handles the
`browser` vs `chrome` namespace, and supports all five targets. Where APIs
diverge, guard with feature detection.

### Known cross-browser differences to handle
- **Namespace:** use WXT's `browser` (pollyfilled) instead of raw `chrome.*`.
- **Background:** MV3 service worker on Chromium/Safari; Firefox uses a
  non-persistent background script (event page). WXT abstracts this.
- **`action` vs `browser_action`:** WXT picks correctly per target.
- **Context menus / commands:** identical API across all five.
- **Firefox manifest:** needs `browser_specific_settings.gecko.id`.
- **Safari:** packaged via Xcode (Safari Web Extension), no service-worker
  persistence quirks; supports `chrome.*` aliases natively.
- **Keyboard commands limit:** Chromium allows 4; Firefox 1-2. Keep to 1-2.

---

## 1. Goals & Non-Goals

**Goals**
- One-click "Fill all forms on page" + "Fill this single form" + "Clear".
- Generate **readable** data: real names, sentences, addresses, emails — not `xkj4f9`.
- Smart field detection: match input `type`, `name`, `id`, `placeholder`,
  `label`, `autocomplete`, and `data-*` attributes.
- Works without network access (all data generated locally).
- Lightweight, fast, no external dependencies in the injected script.

**Non-Goals (v1)**
- Saving/submitting data.
- AI-based content generation (keep it local & instant).
- Per-site saved profiles (can be a v2 feature).

---

## 2. Architecture (WXT + Manifest V3)

WXT structure (entrypoints are auto-registered; `wxt.config.ts` declares
per-browser manifest differences):

```
Input Filler/
├── wxt.config.ts            # per-browser manifest + build config
├── package.json
├── tsconfig.json
├── entrypoints/
│   ├── background.ts        # toolbar action, shortcuts, context menu
│   ├── content.ts           # injected: finds & fills forms
│   ├── content.style.css    # optional highlight styles
│   ├── popup/ (index.html, main.ts, style.css)
│   └── options/ (index.html, main.ts, style.css)
├── src/lib/
│   ├── generators.ts        # readable data generators (the heart)
│   ├── detect.ts            # field-type detection logic
│   ├── fillers.ts           # per-input-type fill strategies
│   ├── wordlists.ts         # first names, last names, cities, words...
│   ├── corpus/              # themed real-sentence banks (business, tech,
│   │                        #   casual, support, reviews) — JSON, license-clean
│   └── env.ts               # per-browser capability flags
├── public/
│   └── icon/ 16/32/48/128/96.png  + safari-specific icons
└── tests/                   # unit tests for generators/detect
```

**Language:** TypeScript throughout (WXT is TS-first; catches the API quirks
between browsers at compile time).

---

## 3. Data Flow

1. User clicks toolbar icon (or shortcut, or context menu).
2. `background.ts` sends a message → active tab's `content.ts`.
3. `content.ts` queries all `<input>`, `<textarea>`, `<select>` on the page.
4. For each field it calls `detectType(field)` → gets a logical type
   (e.g. `"email"`, `"first_name"`, `"phone"`, `"paragraph"`).
5. `fillField(field, type)` calls the matching generator and sets the value,
   dispatching `input` + `change` events so React/Vue/Angular pick it up.
6. Popup shows success/field count; options persist preferences via
   `browser.storage.sync` (works on all browsers; Safari syncs via iCloud).

---

## 4. Core Module Details

### 4.1 `src/lib/generators.ts` — Readable Data Generators
Each is a pure function returning a string (or number/bool where needed),
pulling from `wordlists.ts`. Two guarantees:

- **Fresh on every fill** — every call reshuffles, so each fill action produces
  brand-new text. Clicking "Fill" 100 times yields 100 different readable
  results (never a static blob).
- **Length-aware** — the dummy-text generator respects
  `settings.fields.maxLength` and each field's own `maxlength`, producing text
  that *fits* while staying readable (see Readability engine below).

Examples:

| Generator           | Sample output                                  |
|---------------------|-----------------------------------------------|
| `firstName()`       | `Eleanor`                                      |
| `lastName()`        | `Whitfield`                                   |
| `fullName()`        | `Eleanor Whitfield`                           |
| `email()`           | `eleanor.whitfield42@example.com`            |
| `username()`        | `ewhitfield`                                  |
| `phone()`           | `(555) 014-8829`                              |
| `street()`          | `842 Maplewood Lane`                         |
| `city()`            | `Madison`                                     |
| `state()` / `zip()` | `WI` / `53703`                                |
| `country()`         | `United States`                              |
| `company()`         | `Northwind Analytics`                        |
| `jobTitle()`        | `Product Operations Lead`                    |
| `url()`             | `https://www.northwind-analytics.com`        |
| `sentence()`        | `The quick meeting covered the quarterly plan.`|
| `paragraph(n)`      | n readable sentences joined                   |
| `dummyText(maxLen)` | readable text fitted to maxLen (see below)    |
| `number(min,max)`   | `42`                                          |
| `date()`            | `2025-03-14`                                  |
| `color()`           | `#3a7bd5`                                     |
| `password()`        | `Tr7$mP2!wQxZ` (meets common rules)          |

**Readability engine (`dummyText(maxLen)`)** — the default filler for generic
text fields, used when no Custom Rule matches. Uses a **real-sentence corpus**
(actual coherent English) instead of lorem-ipsum nonsense.

- Ships JSON banks of thousands of meaningful sentences grouped by theme:
  `general`, `business`, `tech`, `casual`, `support`, `reviews`.
- **Sources (all license-clean to bundle):** public-domain text (Project
  Gutenberg), Tatoeba (CC-BY), plus hand-curated business/feedback sentences.
- Sample output (theme = business):
  - `The committee approved the revised budget after a brief discussion.`
  - `Customer feedback this quarter was overwhelmingly positive.`
- **Theme selection** — default theme set in Settings; a Custom Rule (§5) can
  pin a theme per field; auto-detect guesses from context (a `comment`/`message`
  field → `support`, a `review` field → `reviews`).
- **Fresh on every fill** — sentences sampled randomly with no immediate
  repeats, so each fill request yields new readable text.
- **Length-aware & graceful** (no mid-word cuts):
  - `maxLen` = min of `settings.fields.maxLength` and the field's `maxlength`.
  - Large budget → join several corpus sentences.
  - Small budget → one short sentence; if none fits, a single readable word.
  - Trims only at sentence boundaries.
- **Fallback:** if a theme bank is empty, a tiny template grammar
  (subject + verb + object) generates a grammatical sentence as a safety net.

### 4.2 `src/lib/detect.ts` — Field Type Detection
Returns a logical type for a field. Strategy, in priority order:

1. **Explicit hint attributes** — `data-fake="email"`, `data-fill-type`, etc.
2. **`autocomplete`** attribute (`email`, `tel`, `given-name`, `postal-code`...).
3. **`type`** attribute (`email`, `tel`, `url`, `number`, `date`, `color`,
   `checkbox`, `radio`, `range`, `password`).
4. **Regex on name/id/placeholder/label text**, e.g.:
   - `/(first|given).?name/` → first_name
   - `/(last|family|sur).?name/` → last_name
   - `/e?mail/` → email
   - `/(phone|mobile|tel)/` → phone
   - `/(zip|postal)/` → zip
   - `/(city|town)/` → city
   - `/(state|province)/` → state
   - `/(street|address.*1|addr1)/` → street
   - `/(company|org|business)/` → company
   - `/(user|login|account)/` → username
5. **Fallback** by element type:
   - `<textarea>` → paragraph
   - `<input type=text>` → sentence
   - `<select>` → first non-empty `<option>`

### 4.3 `src/lib/fillers.ts` — Per-Type Fill Strategies
- Text-like: set `.value` then dispatch `InputEvent('input')` + `Event('change')`.
- `checkbox`: set `checked` to true/false.
- `radio`: pick one per group (round-robin so different groups differ).
- `select`: choose a random non-disabled `<option>`.
- `range`: random value within min/max.
- Number fields: respect `min`, `max`, `step`.
- Trigger events so SPA frameworks (React/Vue) update state.

### 4.4 `content.ts` — Orchestrator
- `fillAllForms()` — fill every field on the page.
- `fillCurrentForm(activeElement)` — fill only the `<form>` containing the focused field.
- `clearAllForms()` — reset values.
- Honors settings (ignored fields, custom generators, fill-mode toggles).
- Skips fields with `type=hidden`, `disabled`, `readonly`, or `data-fake="skip"`.

---

## 5. Custom Field Rules — User-Defined Fill Data

**Yes — this is a first-class feature.** Users define **rules** that match
specific fields and override the auto-detected generator with custom data.
Think "if a field looks like X, fill it with Y" — more flexible than the
original Fake Filler's Custom Fields.

### 5.1 Rule data model

```ts
interface CustomRule {
  id: string;
  name: string;                 // friendly label, e.g. "Support email"
  enabled: boolean;
  priority: number;             // higher = evaluated first

  match: {
    mode: 'any' | 'all';        // ANY condition OR ALL conditions must hit
    field?: string;             // regex → <input name="...">
    id?: string;                // regex → element id
    label?: string;             // regex → <label>, placeholder, aria-label
    type?: string;              // exact input type: email|text|tel|...
    selector?: string;          // CSS selector (most precise)
    urlPattern?: string;        // glob/regex → site-specific rules
  };

  fill: {
    kind: 'builtin' | 'static' | 'template' | 'list' | 'regex';
    value: string;
    // builtin  → value = generator name: 'firstName', 'email', 'phone'...
    // static   → value = literal string: "John Doe"
    // template → value has {placeholders}: "test+{firstName}@example.com"
    // list     → value = comma-separated; one chosen at random
    // regex    → value = regex; a random matching string is generated
  };
}
```

### 5.2 Matching & precedence

1. **User rules first.** Rules run in `priority` order; the **first match wins**.
2. No rule matches → fall back to `detect.ts` auto-detection (§4.2).
3. `match.mode`:
   - `any` — rule matches if ANY non-empty condition hits the field.
   - `all` — rule matches only if ALL non-empty conditions hit.
4. `urlPattern` scopes a rule to specific sites (e.g. `*.staging.app.com*`),
   enabling per-site behavior from one config.

### 5.3 Examples

| Goal                        | `match`                                                       | `fill`                                  |
|-----------------------------|---------------------------------------------------------------|-----------------------------------------|
| Fixed test email everywhere | `field: /email/i` (mode any)                                  | `static: test@example.com`             |
| Per-name support email      | `id: /^supportEmail$/`                                        | `template: support+{firstName}@co.com` |
| Order number                | `label: /order.?num/i`                                        | `regex: ORD-\d{6}`                     |
| Staging-only promo code     | `urlPattern: *.staging.*` + `selector: input[name=code]`      | `list: SAVE10,SAVE20,SAVE30`           |
| Map custom field to a name  | `field: /^custName$/`                                         | `builtin: fullName`                    |

### 5.4 Template placeholders

Templates (kind `template`) resolve `{...}` against built-in generators, so
output stays readable and consistent within a page:

```
"{firstName}.{lastName}@mail.com"   → eleanor.whitfield@mail.com
"Order-{number(1000,9999)}-{date}"  → Order-4821-2025-03-14
"{fullName} ({username})"           → Eleanor Whitfield (ewhitfield)
```

### 5.5 Rules UI (on the Options page)

- Drag-to-reorder table (sets `priority`), enable/disable toggle, edit,
  duplicate, delete.
- **"Test rule"** — paste a field's HTML or pick a live field on the page to
  preview the generated value before saving.
- **Import / Export JSON** — share rule sets across a team.
- **Presets** — one-click add common patterns (fixed test email, US phone,
  strong password, etc.).
- Quick add from page: right-click a field → "Fill this field with…" opens an
  inline editor prefilled with that field's attributes.

### 5.6 Storage

Rules persist in `browser.storage.sync` (synced across devices on every
browser) with a local fallback. Rules are compiled to regex once and cached, so
even hundreds of rules add negligible fill latency.

---

## 6. UI

### Popup (`popup.html`)
- Big **Fill all forms** button
- **Fill this form** (uses last-focused field's form)
- **Clear** button
- Small settings link → options page
- Footer with fill count after last action

### Options (`options.html`) — three panels (full model in §7)
**Password** — random-length vs. fixed string, log-to-console toggle.
**Field Options** — ignored fields, hidden/invisible & already-filled skips,
   confirmation fields (copy preceding value), agree-to-terms fields (always
   checked), which attributes to match against, default max length.
**General Settings** — trigger events, context menu, ignored domains.
Plus the Custom Field Rules editor (§5), dummy-text theme picker, UI theme (light/dark).

---

## 7. Settings & Configuration Model

All preferences live in one typed object persisted via `browser.storage.sync`
(with a local fallback). Mirrors the original Fake Filler options page,
extended for readable data. The content script loads it once per fill action.

```ts
type MatchAttribute =
  | 'id' | 'name' | 'label' | 'aria-label'
  | 'aria-labelledby' | 'class' | 'placeholder';

type TextTheme =
  | 'general' | 'business' | 'tech'
  | 'casual' | 'support' | 'reviews';

interface FillerSettings {
  password: {
    mode: 'random' | 'fixed';  // random vs. "Use this: ..."
    length: number;            // random length, default 8
    fixedValue: string;        // literal used in 'fixed' mode
    logToConsole: boolean;     // echo generated password to DevTools
  };

  fields: {
    ignoreFields: string[];             // skip matching, e.g. ['captcha','hipinputtext']
    ignoreHiddenInvisible: boolean;     // default true
    ignoreFieldsWithContent: boolean;   // skip already-filled inputs
    confirmationFields: string[];       // copy preceding field's value
    agreeToTermsFields: string[];       // always check these checkboxes
    matchFieldsUsing: MatchAttribute[]; // attrs detection/rules inspect
    maxLength: number;                  // dummy-text cap when no rule matches
  };

  general: {
    triggerEvents: boolean;  // dispatch input/click/change so SPAs react
    contextMenu: boolean;    // add right-click fill/clear items
    ignoredDomains: string[];// regex list; extension fully disabled here
    textTheme: TextTheme;    // default dummy-text theme (business|tech|...)
    theme: 'light' | 'dark';
  };

  settingsVersion: number;  // for schema migration
}
```

### 7.1 Password Settings
- **mode = `random`** — generate a random N-char password (`length`, default 8).
- **mode = `fixed`** — always use `fixedValue` (e.g. `123456789`) for
  repeatable QA.
- **logToConsole** — prints the generated password to DevTools for debugging
  (matches original behaviour).

### 7.2 Field Options
- **ignoreFields** — match list; fields hitting any token are skipped (default
  `captcha, hipinputtext`).
- **ignoreHiddenInvisible** — skip non-visible fields (`offsetParent === null`,
  zero-size, `visibility:hidden`).
- **ignoreFieldsWithContent** — leave pre-filled inputs untouched.
- `type="hidden"` is **always** ignored regardless of settings.
- **confirmationFields** — a matching field (e.g. `confirm, reenter, retype,
  repeat, secondary`) copies the value from the **immediately preceding** input
  (so Confirm Password == Password).
- **agreeToTermsFields** — checkboxes matching (`agree, terms, conditions`) are
  **always checked**.
- **matchFieldsUsing** — multi-select controlling which attributes the matcher
  inspects: `id`, `name`, label text, `aria-label`, `aria-labelledby`, `class`,
  `placeholder`. Applies to both auto-detection (§4.2) and Custom Rules (§5).
- **maxLength** — cap generated dummy-text length when no Custom Rule matches
  (e.g. 5). `dummyText()` reshuffles fresh readable text on every fill and fits
  it to this length (§4.1 Readability engine); also honors each field's own
  `maxlength` attribute.

### 7.3 General Settings
- **triggerEvents** — dispatch `input`/`click`/`change` after setting values so
  React/Vue/Angular validators fire (default on).
- **contextMenu** — register right-click "Fill all / Fill this form / Clear".
- **ignoredDomains** — regex list; on matching origins the toolbar button and
  shortcut become no-ops (e.g. banking sites).
- **textTheme** — default corpus theme for `dummyText()` (§4.1); can be
  overridden per field via a Custom Rule.
- **theme** — UI light/dark.

### 7.4 Defaults & migration
- Ship sensible defaults (parity with original Fake Filler where applicable).
- Versioned schema: bump `settingsVersion` and run a migrator on load so future
  fields are added without breaking saved user data.

---

## 8. Permissions (keep minimal — shared across browsers)

```jsonc
// wxt.config.ts manifest block
{
  "permissions": ["activeTab", "storage", "contextMenus", "scripting"],
  "host_permissions": ["<all_urls>"],
  "commands": {
    "fill-all": { "suggested_key": { ... }, "description": "Fill all forms" },
    "fill-form": { ... }
  }
}
```
- `activeTab` + `scripting`: inject content script on user action.
- `storage`: save preferences.
- `contextMenus`: right-click fill.
- All data generated locally — **no network permission** on any browser.

**Per-browser additions** (set in `wxt.config.ts` via `browser` field):
- Firefox: `browser_specific_settings: { gecko: { id: "...@input-filler" } }`.
- Safari: declared in Xcode project; no extra manifest keys.
- `<all_urls>` is fine for all five; no `optional_host_permissions` needed
  for v1 since the whole point is filling on any page.

---

## 9. Build & Tooling (WXT)

**Framework:** [WXT](https://wxt.dev) — Vite-based, TS-first, one config →
all browsers.

```bash
npm create wxt@latest input-filler   # scaffold
npm run dev          # HMR in Chrome (load .output/chrome-mv3)
npm run dev:firefox  # HMR in Firefox (web-ext)
npm run build        # builds all targets
npm run zip          # packages for store upload
```

WXT build targets (one codebase, multiple outputs):
- `wxt build` → `.output/chrome-mv3`, `.output/firefox-mv3`, `.output/safari-mv3`
- `wxt zip` → `.output/*.zip` for Chrome/Edge/Firefox upload
- Safari: `xcrun safari-web-extension-converter .output/safari-mv3` → Xcode
  project → sign → App Store.

**API access:** always import `browser` from `wxt/browser` (pollyfilled
promise-based API; identical on Chrome, Edge, Firefox, Safari, Brave, etc.).
Never use raw `chrome.*` directly.

**Tests:** Vitest for `generators.ts` / `detect.ts` (pure functions).
**Lint:** ESLint + Prettier (WXT presets).
**CI:** GitHub Actions matrix to build all targets on tag push → auto-attach
zips to the release.

---

## 10. Implementation Phases (suggested order)

| Phase | Deliverable                                                      |
|-------|------------------------------------------------------------------|
| 1     | Scaffold WXT project + minimal popup that fills text fields.    |
| 2     | `wordlists.ts` + `generators.ts` (all readable generators).     |
| 3     | `detect.ts` (regex + attribute-based field detection).          |
| 4     | `fillers.ts` covering checkbox/radio/select/range/date/number.  |
| 5     | Content orchestration + keyboard shortcut + context menu.       |
| 6     | Settings model: typed config, defaults, storage migration (§7).  |
| 7     | Custom Field Rules engine: matcher + template resolver (§5).     |
| 8     | Options page (Password/Field/General) + rules editor.            |
| 9     | Edge cases: Shadow DOM, iframes, React/Vue event dispatching.    |
| 10    | Cross-browser QA: Chrome, Edge, Firefox, Safari; fix divergences.|
| 11    | Tests, icons, README; `wxt zip` + Safari Xcode packaging.        |
| 12    | Publish: Chrome Web Store, Edge Add-ons, AMO (Firefox), App Store |

---

## 11. "Readable Text" — real English, not Lorem Ipsum

- Lorem ipsum is pseudo-Latin nonsense; `dummyText()` draws from a
  **real-sentence corpus** so output is actual coherent English.
- Themed banks (business, tech, casual, support, reviews) let text fit the
  field's context — a comment box reads like a real comment.
- Names, emails, addresses look like real submissions in screenshots/demos.
- Reproducible per field within a page so a name used in the "name" field
  matches the one in the "email" field (e.g. `jane.doe@...`).

---

## 12. Future Enhancements (v2+)
- Per-site saved profiles / field memory.
- Import/export settings.
- i18n (localized names/addresses).
- AI-assisted paragraph generation (opt-in, on-device).
