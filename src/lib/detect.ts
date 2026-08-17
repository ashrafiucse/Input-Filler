// Field-type detection. Returns one logical type per field. Priority:
//   data-fake hint -> embed/custom-code -> <select> (always mechanical)
//   -> autocomplete (incl. cc-number/cc-exp/cc-csc) / card label -> input type/inputmode
//   -> placeholder SHAPE (email/url/password)
//   -> free-text short-circuit (textarea/contenteditable)
//   -> regex over the configured match attributes -> element-type fallback.
//
// The regex bank is keyword-driven (label/name/placeholder/aria/class) so the
// same rules fill an LMS course-title field, a generic "Job title", or any other
// project's fields — nothing here is hard-coded to a specific app. Matching is
// partial-tolerant: the haystack is normalized (camelCase split, separators
// collapsed) and most patterns match unanchored, so a small fragment such as
// "userEmailField", "phoneNumber" or "Alternative Email" still identifies the
// field. Only tokens with common English collisions (e.g. `state`, which lives
// inside "estimated") keep word boundaries.
//
// Works on a plain FieldDescriptor so the resolver is fully unit-testable; the
// orchestrator builds a descriptor from a live element via describeField().

import { I18N_KEYWORDS } from './i18n-keywords';

export type MatchAttribute =
  | 'id'
  | 'name'
  | 'label'
  | 'aria-label'
  | 'aria-labelledby'
  | 'class'
  | 'placeholder';

export const DEFAULT_MATCH_ATTRS: MatchAttribute[] = [
  'id',
  'name',
  'label',
  'aria-label',
  'aria-labelledby',
  'class',
  'placeholder',
];

export type LogicalType = string;

export interface FieldDescriptor {
  tag: string; // 'input' | 'textarea' | 'select'
  type?: string;
  inputMode?: string;
  name?: string;
  id?: string;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  ariaLabelledby?: string;
  label?: string;
  autocomplete?: string;
  dataFake?: string;
  dataFillType?: string;
  isContentEditable?: boolean;
  // ARIA combobox signals (Mantine/MUI/Chakra/Ant Select): a readonly text
  // input whose options live in a portal <div role="listbox">, pointed at by
  // aria-controls. role/aria-haspopup may sit on the input itself.
  role?: string;
  ariaHaspopup?: string;
  ariaControls?: string;
  readOnly?: boolean;
  // Preline UI HSSelect: the data-hs-select init attribute on a <select>.
  dataHsSelect?: string;
}

/**
 * True if `el` is a contenteditable fill target. Real browsers reflect this via
 * the `isContentEditable` IDL property; we also honor the `contenteditable`
 * attribute value (""/"true"/"plaintext-only") so the check holds where the IDL
 * property isn't reflected (e.g. jsdom) and so an explicit `contenteditable="false"`
 * nested region is excluded. Inherited-editable descendants (a rich editor's
 * inner <p>/<br>) are never matched here because discovery selects only nodes
 * that carry the attribute.
 */
export function isContentEditableEl(el: Element): boolean {
  if ((el as HTMLElement).isContentEditable === true) return true;
  const v = el.getAttribute('contenteditable');
  return v === '' || v === 'true' || v === 'plaintext-only';
}

/**
 * Names/ids that mark a field as a security/session token (CSRF, anti-forgery,
 * nonce, view state…). Such fields must NEVER be filled or cleared: overwriting
 * a CSRF token is what makes Laravel / Rails / ASP.NET forms reject the submit
 * with "page expired" (419) and can invalidate the session (the user gets logged
 * out). type="hidden" is already skipped by the orchestrator; this also covers
 * tokens rendered as a non-hidden input. Matched by substring on name/id so it
 * catches `_token`, `csrfmiddlewaretoken`, `authenticity_token`,
 * `__RequestVerificationToken`, `wpnonce`, etc.
 */
const TOKEN_FIELD_RE = /csrf|token|nonce|viewstate|antiforgery|requestverification/i;

export function isSecurityTokenField(desc: FieldDescriptor): boolean {
  return TOKEN_FIELD_RE.test(desc.name ?? '') || TOKEN_FIELD_RE.test(desc.id ?? '');
}

export function describeField(el: Element): FieldDescriptor {
  const get = (n: string) => el.getAttribute(n) ?? undefined;
  const tag = el.tagName.toLowerCase();
  return {
    tag,
    type: get('type'),
    inputMode: get('inputmode'),
    name: get('name'),
    id: get('id'),
    // Rich-text editors (TipTap/ProseMirror) expose their hint via data-placeholder
    // rather than the native placeholder attribute.
    placeholder: get('placeholder') ?? get('data-placeholder'),
    className: get('class'),
    ariaLabel: get('aria-label'),
    ariaLabelledby: get('aria-labelledby'),
    label: resolveLabel(el),
    autocomplete: get('autocomplete'),
    dataFake: get('data-fake'),
    dataFillType: get('data-fill-type'),
    isContentEditable: isContentEditableEl(el),
    role: get('role'),
    ariaHaspopup: get('aria-haspopup'),
    ariaControls: get('aria-controls'),
    // Preline UI HSSelect: the data-hs-select init attribute on a <select>.
    dataHsSelect: get('data-hs-select'),
    readOnly: !!(el as HTMLInputElement).readOnly,
  };
}

/**
 * True if `desc` describes an ARIA listbox combobox (Mantine/MUI/Chakra/Ant
 * Select, Headless UI combobox): a text input — usually readonly — whose
 * choices are a portal-rendered <div role="listbox"> of <div role="option">,
 * not a native <select>. Such a field must be filled by opening the dropdown
 * and clicking an option (setting its readonly value directly is ignored by
 * the framework's controlled state), so it is treated as a mechanical picker.
 */
export function isComboboxDesc(desc: FieldDescriptor): boolean {
  if (desc.role === 'combobox') return true;
  if (desc.ariaHaspopup === 'listbox') return true;
  // Mantine Select pattern: readonly input whose aria-controls points at the
  // portal listbox of options. (Also matches older libs that omit the explicit
  // aria-haspopup token but wire the listbox via aria-controls.)
  if (desc.readOnly && desc.ariaControls) return true;
  return false;
}

/** True if `desc` is a Preline UI HSSelect (a native <select data-hs-select>). */
export function isPrelineSelectDesc(desc: FieldDescriptor): boolean {
  return desc.tag === 'select' && desc.dataHsSelect != null;
}

/**
 * True if the element belongs to an intl-tel-input (or clone) phone widget:
 * the widget styles the tel input with its own class (`iti__tel-input`), tags
 * it with a data attribute carrying the instance id, and keeps it inside an
 * `.iti` wrapper. These widgets own a country selector and bind country-less
 * values to the currently selected country, so they must be filled with a
 * full international (E.164) number or validation fails.
 */
export function isIntlTelInputWidget(el: Element): boolean {
  if (el.classList.contains('iti__tel-input')) return true;
  if ((el as HTMLInputElement).dataset?.intlTelInputId != null) return true;
  // v17+ wraps the input in `.iti`; v16 and older (and older react clones)
  // wrapped it in `.intl-tel-input` instead.
  return el.closest('.iti') != null || el.closest('.intl-tel-input') != null;
}

/** Resolve associated label text: <label for>, wrapping <label>, aria-labelledby,
 * or the sibling <label> of a horizontal form row (see siblingLabel). */
function resolveLabel(el: Element): string | undefined {
  const labels = (el as HTMLInputElement).labels;
  if (labels && labels.length) {
    const t = labels[0]?.textContent ?? undefined;
    if (t) return t.trim();
  }
  const wrapping = el.closest('label');
  if (wrapping) {
    const t = wrapping.textContent ?? undefined;
    if (t) return t.trim();
  }
  const labelledby = el.getAttribute('aria-labelledby');
  if (labelledby) {
    const target = el.ownerDocument.getElementById(labelledby);
    const t = target?.textContent ?? undefined;
    if (t) return t.trim();
  }
  return siblingLabel(el);
}

/** Label-ish elements: a real <label>, Angular Material's <mat-label>, or an
 * element explicitly marked up as one (role="label"/aria-label wrapper). */
const LABEL_SELECTOR = 'label, mat-label, [role="label"]';

function labelFor(l: Element, el: Element): boolean {
  // Skip labels that wrap the input itself (already handled) and labels whose
  // for= points at a DIFFERENT control.
  const f = l.getAttribute('for');
  return !l.contains(el) && (!f || f === el.id);
}

/**
 * Sibling-label fallback for horizontal form layouts: Bootstrap `.form-group`
 * rows (and the KeenThemes/Vue admin forms built on them) put the label in a
 * sibling column with no `for`/`id` pairing, so none of the standard label
 * associations resolve and the field carries no other identity signal. Climb a
 * few ancestors and accept the first level that holds exactly one usable label
 * the input does not live inside. When a level holds SEVERAL labels, pair the
 * k-th label with the k-th field by DOM order (a Bootstrap grid row, a flex
 * row, or a table row with "First Name | Last Name" columns) — but only when
 * the label count matches the field count exactly. Requiring this (and stopping
 * at the first unpairable ambiguous level) keeps a whole-<form> wrapper —
 * dozens of labels — from being mistaken for the field's own row.
 */
function siblingLabel(el: Element): string | undefined {
  let node: Element | null = el.parentElement;
  for (let depth = 0; node && depth < 6; depth++, node = node.parentElement) {
    if (node.tagName === 'FORM' || node.tagName === 'FIELDSET') break;
    const candidates = Array.from(node.querySelectorAll(LABEL_SELECTOR)).filter((l) => labelFor(l, el));
    if (candidates.length === 1) {
      const t = (candidates[0]?.textContent ?? '').trim();
      if (t) return t;
      continue;
    }
    if (candidates.length > 1) {
      const fields = Array.from(node.querySelectorAll('input,textarea,select')).filter(
        (f) => !candidates.some((l) => l.contains(f)),
      );
      if (fields.length === candidates.length) {
        const idx = fields.indexOf(el);
        if (idx >= 0) {
          const t = (candidates[idx]?.textContent ?? '').trim();
          if (t) return t;
        }
      }
      break; // unpaired ambiguity — climbed too far, stop
    }
  }
  return undefined;
}

// The haystack is normalized (see normalizeHaystack) before testing, so the
// patterns below are written against lowercase words separated by single
// spaces; `\s*` tolerates both a space and no space ("first name" and
// "firstname"). Most patterns deliberately match UNANCHORED so a small
// partial hit ("userEmailField", "phoneNumber") identifies the field; only
// collision-prone short tokens (state/region/province) keep \b word guards.
const REGEX_RULES: ReadonlyArray<readonly [RegExp, LogicalType]> = [
  // High-specificity content/intent signals (evaluated first; first match wins).
  [/search/, 'search'],
  // Password by keyword (label-only case; type=password and placeholder cues are
  // caught earlier). Early so "current password" beats the username rule.
  [/password|passcode/, 'password'],
  [/(objective|learning\s*outcome|learning\s*goal)/, 'objective'],
  [/(course|chapter|lesson|quiz|assignment|session|curriculum|module|cohort|project|class|tutorial|webinar)\s*(title|name|topic)/, 'title'],
  [/(sub\s*domain|slug|namespace|handle)/, 'subdomain'],
  [/tax\s*(name|label|title|type)/, 'tax_name'],
  [/(saved\s*view|view\s*name)/, 'title'],
  // Identity / contact.
  [/(full|complete)\s*name/, 'full_name'],
  [/(first|given)\s*name/, 'first_name'],
  [/(last|family|sur)\s*name/, 'last_name'],
  [/e\s*mail/, 'email'],
  [/(phone|mobile|tel|fax|cell|whatsapp|contact\s*(?:no|number|phone))/, 'phone'],
  [/(zip|postal|post\s*code)/, 'zip'],
  [/(city|town)/, 'city'],
  [/\b(state|province|region)\b/, 'state'],
  [/(country|nation)/, 'country'],
  [/(street|addr(?:ess)?\s*1|address\s*line\s*1|address)/, 'street'],
  [/(company|organi[sz]ation|business|platform|tenant|academy|institute|school|brand|workspace)|\borg\b/, 'company'],
  [/(job\s*title|position|role)/, 'job_title'],
  [/(user|login|account|nick)/, 'username'],
  [/(url|website|homepage)/, 'url'],
  // Generic title/heading (after job_title so "Job Title" keeps its meaning).
  [/(title|heading)/, 'title'],
];

const AUTOCOMPLETE_MAP: Record<string, LogicalType> = {
  email: 'email',
  tel: 'phone',
  'given-name': 'first_name',
  'family-name': 'last_name',
  'additional-name': 'first_name',
  'street-address': 'street',
  'address-line1': 'street',
  'address-level2': 'city',
  'address-level1': 'state',
  'postal-code': 'zip',
  'country-name': 'country',
  'country': 'country',
  organization: 'company',
  'organization-title': 'job_title',
  username: 'username',
  'current-password': 'password',
  'new-password': 'password',
  url: 'url',
  'cc-number': 'cc_number',
  'cc-exp': 'cc_exp',
  'cc-csc': 'cc_csc',
};

function mapAutocomplete(ac: string): LogicalType | undefined {
  const key = ac.trim().toLowerCase();
  if (key === 'off' || key === 'on' || !key) return undefined;
  // autocomplete may be space-separated tokens; take the first meaningful one.
  const first = key.split(/\s+/)[0] as string;
  return AUTOCOMPLETE_MAP[first] ?? (AUTOCOMPLETE_MAP[key] ?? undefined);
}

/**
 * Detect a card field without an autocomplete hint, from its label/name/id/
 * placeholder/aria (e.g. "Card number", "Expiration", "CVC", name="cardNumber").
 * Caught before input type/inputmode so a numeric-inputmode CVC is not mistaken
 * for a generic number. cc-* autocomplete already maps in step 4; this is the
 * fallback for checkouts that omit it.
 */
function cardSignal(desc: FieldDescriptor): LogicalType | undefined {
  const hay = normalizeHaystack(
    [desc.name, desc.id, desc.placeholder, desc.ariaLabel, desc.label].filter(Boolean).join(' '),
  );
  if (!hay) return undefined;
  if (/(?:cc|card)\s*number|card\s*no\b|cardnum/.test(hay)) return 'cc_number';
  if (/expir|expiry|(?:cc|card)\s*exp/.test(hay)) return 'cc_exp';
  if (/cvc|cvv|csc|security\s*code|card\s*code|cid\b/.test(hay)) return 'cc_csc';
  return undefined;
}

function mapType(desc: FieldDescriptor): LogicalType | undefined {
  switch ((desc.type ?? '').toLowerCase()) {
    case 'email':
      return 'email';
    case 'tel':
      return 'phone';
    case 'url':
      return 'url';
    case 'number':
      return 'number';
    case 'date':
    case 'datetime-local':
    case 'month':
    case 'time':
    case 'week':
      return 'date';
    case 'color':
      return 'color';
    case 'checkbox':
      return 'checkbox';
    case 'radio':
      return 'radio';
    case 'range':
      return 'range';
    case 'password':
      return 'password';
    case 'search':
      return 'search';
    default:
      return undefined;
  }
}

/**
 * Map `inputmode` to a logical type. UI libraries (Mantine, MUI, Chakra) often
 * render numeric/phone/email inputs as type="text" with an inputmode hint to
 * sidestep native input quirks (type=number rejecting shortcuts, scroll-to-
 * change, etc.), so inputmode is the real signal on those rendered fields.
 */
function mapInputMode(desc: FieldDescriptor): LogicalType | undefined {
  switch ((desc.inputMode ?? '').toLowerCase()) {
    case 'decimal':
    case 'numeric':
      return 'number';
    case 'tel':
      return 'phone';
    case 'email':
      return 'email';
    case 'url':
      return 'url';
    case 'search':
      return 'search';
    default:
      return undefined;
  }
}

function fallbackType(desc: FieldDescriptor): LogicalType {
  if (desc.tag === 'textarea' || desc.isContentEditable) return 'paragraph';
  if (desc.tag === 'select') return 'select';
  const t = mapType(desc);
  if (t) return t;
  // Bare text falls back to a readable sentence.
  return 'sentence';
}

/**
 * Recognize a field's intent from the SHAPE of its placeholder example, which
 * survives even when the label/name carry no keyword: an email-shaped example
 * ("name@example.com"), a URL-shaped example ("https://…", "example.com"), or a
 * password cue ("Password", "Min. 8 characters"). Only meaningful for text-like
 * inputs; textareas/contenteditable are free-form and short-circuit later.
 */
function placeholderSignal(desc: FieldDescriptor): LogicalType | undefined {
  const p = (desc.placeholder ?? '').trim();
  if (!p) return undefined;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(p)) return 'email';
  if (/^https?:\/\//i.test(p) || /^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?$/i.test(p)) return 'url';
  if (/(password|passcode|\bpin\b|min\.?\s*\d+\s*char|at least\s+\d+\s*char)/i.test(p)) return 'password';
  return undefined;
}

/**
 * Detect an embed / custom-code field (a textarea or input whose placeholder is
 * an HTML/iframe snippet, or that asks for embed/custom HTML). Caught before the
 * free-text short-circuit so an `<iframe …>` textarea is filled with a valid
 * embed rather than a paragraph.
 */
function isEmbedField(desc: FieldDescriptor): boolean {
  const hay = [desc.placeholder, desc.label, desc.ariaLabel].filter(Boolean).join(' ');
  if (!hay) return false;
  return (
    /<\s*[a-z!?\/]/i.test(hay)
    || /\bembed\b/i.test(hay)
    || /\bcustom\s+(?:html|code|embed)\b/i.test(hay)
    || /\bhtml\b[\s,]*\b(?:css|javascript|js|script)\b/i.test(hay)
  );
}

/**
 * Classify a field's media context from a provider keyword or domain in its
 * label/name/placeholder/aria/class: audio (Spotify/SoundCloud) or video
 * (YouTube/Vimeo/Loom). Used both to route embed fields (audio vs video embed)
 * and to turn a media-URL field into a real provider link ahead of type=url.
 */
export type MediaProvider = 'youtube' | 'vimeo' | 'spotify' | 'soundcloud';

/** Audio vs video context from provider keywords/domains or the bare words. */
export function mediaContext(desc: FieldDescriptor): 'audio' | 'video' | undefined {
  const hay = mediaHaystack(desc);
  if (!hay) return undefined;
  if (/\b(spotify|soundcloud|audio|podcast)\b/.test(hay)) return 'audio';
  if (/\b(youtube|youtu\.be|vimeo|loom|video)\b/.test(hay)) return 'video';
  return undefined;
}

/** The specific provider named by the field, if any (used to pin an embed/link). */
export function resolveMediaProvider(desc: FieldDescriptor): MediaProvider | undefined {
  const hay = mediaHaystack(desc);
  if (!hay) return undefined;
  if (/\bspotify\b/.test(hay)) return 'spotify';
  if (/\bsoundcloud\b/.test(hay)) return 'soundcloud';
  if (/\b(youtube|youtu\.be)\b/.test(hay)) return 'youtube';
  if (/\bvimeo\b/.test(hay)) return 'vimeo';
  return undefined;
}

function mediaHaystack(desc: FieldDescriptor): string {
  // Normalized like the main haystack so camelCase ("youTubeUrl") and
  // snake/kebab/slash ("spotify_track", "vimeo/video") match equally.
  return normalizeHaystack(
    [desc.placeholder, desc.label, desc.ariaLabel, desc.name, desc.id, desc.className]
      .filter(Boolean)
      .join(' '),
  );
}

/**
 * Normalize a haystack for keyword matching. Produces THREE variants joined
 * into one string:
 *  1. camelCase split into words ("firstName" -> "first name"),
 *  2. the original word boundaries intact ("YouTube" must NOT become
 *     "you tube", "SoundCloud" must not become "sound cloud"),
 *  3. the intact variant with diacritics folded away (NFD + combining-mark
 *     strip), so an unaccented keyword ("direccion", "prenom", "telefone")
 *     matches the accented real-world text ("Dirección", "Prénom",
 *     "Téléphone"), and vice versa.
 * Any run of non-letter/non-digit characters (Unicode-aware, so accented
 * letters, Cyrillic, CJK survive) collapses to a single space.
 */
function normalizeHaystack(s: string): string {
  const collapse = (t: string): string => t.replace(/[^\p{L}\p{N}]+/gu, ' ');
  const camelSplit = collapse(s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase());
  const intact = collapse(s.toLowerCase());
  const folded = intact.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return `${camelSplit} ${intact} ${folded}`.replace(/\s+/g, ' ').trim();
}

/**
 * Localized label tokens for one logical type ("Vorname", "Prénom", "Straße"…).
 * Consulted right after each rule's English pattern, preserving overall rule
 * priority. Code attributes (name/id/class/autocomplete) are written in
 * English on virtually every multilingual site, so the English bank already
 * classifies those; this catches fields whose ONLY signal is a localized
 * human-visible label. Tokens are matched as substrings of the normalized
 * haystack, so "vornamefeld" matches "vorname" too.
 */
function i18nMatch(hay: string, type: LogicalType): boolean {
  const tokens = I18N_KEYWORDS[type];
  return tokens ? tokens.some((t) => hay.includes(t)) : false;
}

function buildHaystack(desc: FieldDescriptor, attrs: MatchAttribute[]): string {
  const parts: string[] = [];
  for (const a of attrs) {
    switch (a) {
      case 'id':
        if (desc.id) parts.push(desc.id);
        break;
      case 'name':
        if (desc.name) parts.push(desc.name);
        break;
      case 'label':
        if (desc.label) parts.push(desc.label);
        break;
      case 'aria-label':
        if (desc.ariaLabel) parts.push(desc.ariaLabel);
        break;
      case 'aria-labelledby':
        if (desc.ariaLabelledby) parts.push(desc.ariaLabelledby);
        break;
      case 'class':
        if (desc.className) parts.push(desc.className);
        break;
      case 'placeholder':
        if (desc.placeholder) parts.push(desc.placeholder);
        break;
    }
  }
  return normalizeHaystack(parts.join(' '));
}

export function detectType(
  desc: FieldDescriptor,
  matchAttrs: MatchAttribute[] = DEFAULT_MATCH_ATTRS,
): LogicalType {
  // 1. Explicit hint (data-fake / data-fill-type). "skip" is handled by the
  //    orchestrator; here it falls through so a real type is still returned.
  const hint = desc.dataFake || desc.dataFillType;
  if (hint && hint.toLowerCase() !== 'skip') return hint;

  // 2. Embed / custom-code fields (HTML/iframe placeholder) — any tag, before
  //    the free-text short-circuit so an <iframe> textarea gets a real embed.
  //    Which provider's embed is chosen at fill time from the field's context.
  if (isEmbedField(desc)) return 'embed';

  // 2b. Preline UI HSSelect: a native <select data-hs-select> whose UI is an
  //     overlay (a toggle <button> + a [data-hs-select-dropdown] of
  //     [data-value] options). The native select is hidden and Preline owns its
  //     value, so it must be driven via the overlay (open toggle + click option)
  //     — setting the hidden select's value would neither update the visible
  //     toggle nor fire Preline's commit. Caught before the generic <select>
  //     branch so it routes to the Preline fill path.
  if (isPrelineSelectDesc(desc)) return 'preline';

  // 3. <select> is always mechanical: pick a valid <option>. Generating a typed
  //    string and assigning it usually selects nothing, so a select is never
  //    classified by its name/label (e.g. a "country" select just picks a real
  //    country option rather than receiving the literal "Germany").
  if (desc.tag === 'select') return 'select';

  // 3a. ARIA listbox combobox (Mantine/MUI/Chakra/Ant Select, and Radix UI /
  //     shadcn Select whose trigger is a <button>): a custom dropdown whose
  //     options live in a portal <div role="listbox">. Mechanical, like <select>:
  //     pick a real option, never a typed string (which a readonly controlled
  //     input — or a button trigger — would ignore anyway). Detected from
  //     role=combobox / aria-haspopup=listbox / readonly+aria-controls on any
  //     tag except a contenteditable rich-text editor. Caught before media /
  //     autocomplete / keyword detection so a "country" combobox picks a real
  //     country option rather than receiving the literal string "Germany".
  if (!desc.isContentEditable && isComboboxDesc(desc)) return 'combobox';

  // 3b. Media provider (YouTube/Vimeo/Spotify/SoundCloud) mentioned in a link/
  //     URL field — beats input type=url so a "Paste YouTube URL" input gets a
  //     real video link (or audio link) instead of a generic company URL.
  const mc = mediaContext(desc);
  if (mc === 'audio') return 'audio_url';
  if (mc === 'video') return 'video_url';

  // 4. autocomplete.
  if (desc.autocomplete) {
    const ac = mapAutocomplete(desc.autocomplete);
    if (ac) return ac;
  }

  // 4b. Card field by label/name/placeholder/aria (e.g. "Card number",
  //     "Expiration", "CVC", name="cardNumber") — before input type/inputmode
  //     so a numeric-inputmode CVC is not mistaken for a generic number.
  const card = cardSignal(desc);
  if (card) return card;

  // 5. input type (email/tel/url/number/date/color/checkbox/radio/range/password/search),
  //    then inputmode. Many UI libs (Mantine, MUI, Chakra) render a number/phone/
  //    email input as type="text" with inputmode="decimal"/"tel"/…, so inputmode
  //    is the real signal there (e.g. a Mantine NumberInput fills as a number).
  if (desc.type) {
    const t = mapType(desc);
    if (t) return t;
  }
  const im = mapInputMode(desc);
  if (im) return im;

  // 6. Placeholder SHAPE — an email/URL/password example implies that type even
  //    with no keyword in the label (e.g. placeholder "name@example.com").
  const ps = placeholderSignal(desc);
  if (ps) return ps;

  // 7. Textareas and contenteditable rich-text editors hold free-form text, so
  //    skip the single-line regexes (an "email body" editor would otherwise
  //    match the email regex and receive an email address).
  if (desc.tag === 'textarea' || desc.isContentEditable) return 'paragraph';

  // 8. Regex over the configured match attributes — English keywords first,
  //    then the localized label tokens for the same rule, so "Vorname"
  //    classifies exactly like "First Name" without disturbing rule priority.
  const hay = buildHaystack(desc, matchAttrs);
  for (const [re, type] of REGEX_RULES) {
    if (re.test(hay)) return type;
    if (i18nMatch(hay, type)) return type;
  }

  // 9. Element-type fallback.
  return fallbackType(desc);
}
