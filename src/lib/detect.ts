// Field-type detection. Returns one logical type per field. Priority:
//   data-fake hint -> embed/custom-code -> <select> (always mechanical)
//   -> autocomplete -> input type -> placeholder SHAPE (email/url/password)
//   -> free-text short-circuit (textarea/contenteditable)
//   -> regex over the configured match attributes -> element-type fallback.
//
// The regex bank is keyword-driven (label/name/placeholder/aria/class) so the
// same rules fill an LMS course-title field, a generic "Job title", or any other
// project's fields — nothing here is hard-coded to a specific app.
//
// Works on a plain FieldDescriptor so the resolver is fully unit-testable; the
// orchestrator builds a descriptor from a live element via describeField().

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

export function describeField(el: Element): FieldDescriptor {
  const get = (n: string) => el.getAttribute(n) ?? undefined;
  const tag = el.tagName.toLowerCase();
  return {
    tag,
    type: get('type'),
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
  };
}

/** Resolve associated label text: <label for>, wrapping <label>, or aria-labelledby. */
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
  return undefined;
}

const REGEX_RULES: ReadonlyArray<readonly [RegExp, LogicalType]> = [
  // High-specificity content/intent signals (evaluated first; first match wins).
  [/\bsearch\b/i, 'search'],
  [/\b(objective|learning[\s_-]?outcome|learning[\s_-]?goal)\b/i, 'objective'],
  [/\b(course|chapter|lesson|quiz|assignment|session|curriculum|module|cohort|project|class|tutorial|webinar)\s*[\s_-]?(title|name|topic)\b/i, 'title'],
  [/\b(sub[\s_-]?domain|slug|namespace|handle)\b/i, 'subdomain'],
  [/\btax\s*[\s_-]?(name|label|title|type)\b/i, 'tax_name'],
  [/\b(saved[\s_-]?view|view[\s_-]?name)\b/i, 'title'],
  // Identity / contact.
  [/(full|complete)[\s_-]?name/i, 'full_name'],
  [/(first|given)[\s_-]?name/i, 'first_name'],
  [/(last|family|sur)[\s_-]?name/i, 'last_name'],
  [/e[-_]?mail/i, 'email'],
  [/(phone|mobile|tel|fax)/i, 'phone'],
  [/(zip|postal|post[\s_-]?code)/i, 'zip'],
  [/(city|town)/i, 'city'],
  [/(state|province|region)/i, 'state'],
  [/(country|nation)/i, 'country'],
  [/(street|addr(?:ess)?[\s_-]?1|addressline1)/i, 'street'],
  // Organization / platform / tenant name (broader than just "company").
  [/(company|org(?:ani[sz]ation)?|business|platform|tenant|academy|institute|school|brand|workspace)/i, 'company'],
  [/(job[\s_-]?title|position|role)/i, 'job_title'],
  [/(user|login|account|nick)/i, 'username'],
  [/(url|website|homepage)/i, 'url'],
  // Generic title/heading (after job_title so "Job Title" keeps its meaning).
  [/\b(title|heading)\b/i, 'title'],
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
  'cc-number': 'text',
};

function mapAutocomplete(ac: string): LogicalType | undefined {
  const key = ac.trim().toLowerCase();
  if (key === 'off' || key === 'on' || !key) return undefined;
  // autocomplete may be space-separated tokens; take the first meaningful one.
  const first = key.split(/\s+/)[0] as string;
  return AUTOCOMPLETE_MAP[first] ?? (AUTOCOMPLETE_MAP[key] ?? undefined);
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
function mediaContext(desc: FieldDescriptor): 'audio' | 'video' | undefined {
  const hay = [desc.placeholder, desc.label, desc.ariaLabel, desc.name, desc.id, desc.className]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (!hay) return undefined;
  if (/\b(spotify|soundcloud)\b/.test(hay) || /spotify\.com|soundcloud\.com/.test(hay)) return 'audio';
  if (/\b(youtube|youtu\.be|vimeo|loom)\b/.test(hay) || /youtube\.com|vimeo\.com/.test(hay)) return 'video';
  return undefined;
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
  return parts.join(' ');
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
  //    Audio providers (Spotify/SoundCloud) route to an audio embed.
  if (isEmbedField(desc)) return mediaContext(desc) === 'audio' ? 'audio_embed' : 'embed';

  // 3. <select> is always mechanical: pick a valid <option>. Generating a typed
  //    string and assigning it usually selects nothing, so a select is never
  //    classified by its name/label (e.g. a "country" select just picks a real
  //    country option rather than receiving the literal "Germany").
  if (desc.tag === 'select') return 'select';

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

  // 5. input type (email/tel/url/number/date/color/checkbox/radio/range/password/search).
  if (desc.type) {
    const t = mapType(desc);
    if (t) return t;
  }

  // 6. Placeholder SHAPE — an email/URL/password example implies that type even
  //    with no keyword in the label (e.g. placeholder "name@example.com").
  const ps = placeholderSignal(desc);
  if (ps) return ps;

  // 7. Textareas and contenteditable rich-text editors hold free-form text, so
  //    skip the single-line regexes (an "email body" editor would otherwise
  //    match the email regex and receive an email address).
  if (desc.tag === 'textarea' || desc.isContentEditable) return 'paragraph';

  // 8. Regex over the configured match attributes.
  const hay = buildHaystack(desc, matchAttrs);
  for (const [re, type] of REGEX_RULES) {
    if (re.test(hay)) return type;
  }

  // 9. Element-type fallback.
  return fallbackType(desc);
}
