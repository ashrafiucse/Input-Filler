# Changelog

All notable changes to **Input Filler** are listed here. Versions follow the packaged
release zips in `.output/`.

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
