# Changelog

All notable changes to **Input Filler** are listed here. Versions follow the packaged
release zips in `.output/`.

## [0.6.9] — 2026-08-18

### Fixed
- **Country-code phone fields on plain tel inputs now fill in E.164.** Sites
  whose phone validation only accepts full international numbers (rejecting
  "(480) 756-0648" while accepting "+3814807560648") but render a plain
  `type="tel"` input — not an intl-tel-input widget — were filled with the US
  national format and refused on submit. The new `wantsIntlPhone` heuristic
  keeps intl-tel-input detection and additionally switches to E.164
  ("+1\u2026") when the field advertises the requirement: a placeholder with a
  country-coded example ("+381 63 123 4567") or the words "country code"/
  "international", a `pattern` requiring a literal `+` (escaped `\+` or `[+]`;
  a bare `+` is a quantifier, not a literal), or a label/aria-label/title
  mentioning the country code. A `maxlength` under 12 characters (too short
  for "+1" + 10 digits) suppresses E.164 so values are never truncated
  mid-number. Unhinted fields keep the (xxx) xxx-xxxx national format.

## [0.6.8] — 2026-08-17

### Fixed
- **Unlabeled inputs on Bootstrap-style horizontal forms now fill correctly
  (GitHub issue #1).** KeenThemes/Vue admin forms (and any Bootstrap `.form-group`
  layout) put the `<label>` in a sibling column with no `for`/`id` pairing, so a
  field whose input carries no `name`, `id`, `autocomplete` or keyword
  `placeholder` had no identity signal at all — "First Name"/"Last Name"/
  "Company Name" fell through detection and were filled with filler prose
  instead of a name. Labels are now also resolved from the sibling column: the
  resolver climbs the ancestors of the input and accepts the first level that
  holds exactly one usable `<label>` (one whose `for=` doesn't point elsewhere
  and that doesn't wrap the input), stopping at the first ambiguous level so a
  whole-`<form>` wrapper is never mistaken for the field's own row.

### Added
- **Localized forms now fill type-correct values too.** Multilingual sites
  write their code attributes (name/id/class/autocomplete) in English, so the
  English keyword bank already classified those; a field whose ONLY signal is a
  localized visible label ("Vorname", "Prénom", "Code postal", "Straße",
  "Телефон") previously fell back to dummy text. A curated keyword bank per
  logical type (de/fr/es/it/pt/pl/nl/ru/ja/zh) is now consulted right after each
  English rule, preserving rule priority. The haystack normalization keeps
  Unicode letters and folds diacritics, so "Direccion" matches "Dirección",
  "prenom" matches "Prénom", and "Téléphone" even matches the English `phone`
  token after folding. Ambiguous short tokens (bare "nome", the single CJK
  character "名") are deliberately excluded — a misdetected type is worse than
  a readable fallback.

### Changed
- **Angular Material forms fill correctly.** `<mat-label>` is not a `<label>`
  element, so label resolution never saw it; it is now part of the sibling-label
  search, so `<mat-form-field><mat-label>First name</mat-label><input matInput>`
  classifies as first_name.
- **Grid/flex rows with multiple label+field pairs now pair label-to-input.**
  A row like `<div class="row"><label>First Name</label><input…><label>Last
  Name</label><input…></div>` previously looked ambiguous and refused to guess;
  when a level's label count exactly matches its field count, the k-th label is
  paired with the k-th field by DOM order. Counts mismatch → still refuses.
- **Widget-backed hidden selects (select2/Chosen/jQuery UI selectmenu) now
  fill.** Those widgets render a visible UI over a `display:none` native
  `<select>`; the hidden-skip previously left them untouched. A hidden native
  select is not an anti-bot honeypot (those are text inputs), and the widgets
  sync off the native `change` event, so the hidden select is now filled and
  the event dispatched — the visible widget updates and the form submits a real
  value. Hidden text inputs remain honeypot-protected.
- **Password-by-label detection.** A text input labeled "Password" (no
  type=password, no placeholder cue) previously fell through to dummy text; a
  keyword rule now classifies it (and its localized equivalents — "Passwort",
  "Contraseña", "Пароль") before the username/identity rules.
- **Field matching is now partial-tolerant.** The keyword haystack is normalized
  (camelCase split, snake/kebab/slash collapsed, CamelCase brand words kept
  intact) and the rule patterns match unanchored, so a small fragment such as
  `userEmailField`, `phoneNumber`, `searchTerm`, `contact number` or `cell-no`
  identifies the field instead of falling through to dummy text. Collision-prone
  tokens keep word guards ("estimated" is not a **state**; "contact person" is
  not a phone).
- **A confirmed input or dropdown is never left empty by an exception.** Each
  field is filled inside its own try/catch, so one poisoned field (a throwing
  getter, a detached node, a framework proxy) no longer aborts the whole fill
  pass — every remaining field still gets its fill attempt, and a dropdown
  still gets a valid option. Clearing got the same isolation, and the optional
  on-device-AI refinement pass is now best-effort (a failure there can no longer
  lose the fill result). Unknown-but-confirmed text inputs keep receiving a
  readable dummy sentence as the final fallback.

## [0.6.7] — 2026-08-16

### Fixed
- **Phone fields on country-code widgets (intl-tel-input) now fill with a valid
  number.** Phone fields were previously filled with a country-less US national
  number (`(933) 794-6994`); country-aware widgets such as intl-tel-input bind
  such values to whatever country the widget has selected, so on a form
  defaulting to Djibouti the submitted number became `+2539337946994` and failed
  validation ("Please enter a valid phone number with country code"). Widget
  inputs are now detected (the `iti__tel-input` class, the
  `data-intl-tel-input-id` attribute, or the `.iti` / legacy `.intl-tel-input`
  wrapper) and filled with a full international `+1` number, which the widget
  parses to switch its country selection. Area codes are drawn from assigned US
  geographic NANP codes — the previous 201–989 range included toll-free / 900 /
  Caribbean codes that strict validators reject (43% of draws). Plain `tel`
  inputs keep the `(xxx) xxx-xxxx` format.

## [0.6.6] — 2026-08-12

### Added
- **Preline UI searchable selects (HSSelect) now fill.** A native
  `<select data-hs-select>` whose UI is an overlay (a toggle `<button>` + a
  `[data-hs-select-dropdown]` of `[data-value]` options) was previously not
  touched: the toggle has no `role="combobox"`, and the options carry no
  `role="option"`. Such selects are now detected and driven through the
  overlay — the toggle is opened and a real `[data-value]` option is clicked —
  so the visible toggle updates and Preline's own commit fires the `change`
  event. That change event is what cascades to dependent fields, so selecting a
  Preline **Country** now makes the dependent **State** list populate (which the
  0.6.5 cascading-select fix then fills). Falls back to setting the native
  select's value when the overlay can't be reached.

## [0.6.5] — 2026-08-12

### Fixed
- **Dependent / cascading dropdowns now fill.** A native `<select>` whose real
  options arrive asynchronously after a parent field's change (e.g. State
  populating after Country is chosen) was previously left empty: the fill pass
  reached it while it still held only its placeholder option. Such selects are
  now deferred and retried once a valid option appears (MutationObserver, 2s
  timeout), so the dependent value is set before submit.

## [0.6.4] — 2026-08-08

### Added
- **Skip dropdowns that already have a selection** — new opt-in option (off by
  default). When on, any dropdown that already has a chosen value is left untouched,
  for native `<select>`, input-style comboboxes (Mantine/MUI/Chakra), and
  Radix/shadcn button-trigger comboboxes.

### Fixed
- **Radix UI / shadcn `Select` dropdowns now fill.** Three independent root causes
  resolved: (1) `<button role="combobox">` triggers are now discovered, (2) classified
  as comboboxes (previously gated on `<input>`), and (3) options now commit via the
  full pointer event lifecycle (`pointerup`), with `isPrimary` set on synthetic events.
- Synthesized `PointerEvent`s now set `isPrimary: true` so frameworks that gate
  open/select on a primary pointer work reliably.

## [0.6.x] — 2026-08-06

### Added
- Custom ARIA combobox/dropdown support (Mantine/MUI/Chakra) — opens the dropdown and
  clicks a real `role="option"` instead of typing into a readonly input.
- Dropdown fill controls: master enable toggle, and per-dropdown strategy of skip /
  random / first / specific option.
- Checkout card filling — configurable test card number, expiry, and CVC.
- Common American first/last name pools.
- Real YouTube/Vimeo/Spotify/SoundCloud embeds and links; provider pinning with
  rotation fallback.
- Type-aware detection from placeholder/label (titles, search, subdomain, tax,
  objective, embed/video/audio URL, …).
- Expanded text corpus past 1,000 unique sentences.

### Fixed
- CSRF / session-token fields are never filled or cleared.
- `inputmode` honored so library number inputs fill correctly.
- Contenteditable rich-text editors (TipTap/ProseMirror) now fill correctly.

## [0.5.0] / [0.4.0] — 2026-08-04

### Added
- Optional **on-device AI** for free-text fields (Chrome built-in Prompt API; local,
  no network).
- Field-aware readable text matched to each field's label, plus an LMS text theme.
- Redesigned options page: centered full-width layout, explicit Save button, open in
  full tab.

### Fixed
- Honeypot/hidden fields (hidden by an ancestor) are skipped.
- Native value setter used so framework-controlled forms submit correctly.

## [0.2.0]–[0.2.x] — 2026-08-03

### Added
- Core readable-data engine: real names, emails, addresses, coherent themed
  sentences (not `xkj4f9` / lorem-ipsum).
- Smart field-type detection priority and per-type filling with SPA event dispatch
  (`input`/`change`/`click`).
- Typed settings model with forward-only schema migration.
- Custom Field Rules engine (matcher + resolvers + chunked sync storage; import/export).
- Toolbar icon click fills all forms; keyboard shortcuts; right-click context menu.
- Shadow DOM + same-origin iframe discovery.
- Configurable email domain; robust password fill; confirm-password copy.
- Auto-cropped icons at all store sizes; WXT zip packaging.

### Fixed
- Clear preserves hidden token (CSRF) fields.
- Every click re-fills with fresh data; textareas always get readable text.
