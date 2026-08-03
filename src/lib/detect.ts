// Field-type detection. Returns one logical type per field using the priority
// order in R9: explicit data-fake hint -> autocomplete -> input type -> regex
// over the configured match attributes -> element-type fallback.
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
}

export function describeField(el: Element): FieldDescriptor {
  const get = (n: string) => el.getAttribute(n) ?? undefined;
  const tag = el.tagName.toLowerCase();
  return {
    tag,
    type: get('type'),
    name: get('name'),
    id: get('id'),
    placeholder: get('placeholder'),
    className: get('class'),
    ariaLabel: get('aria-label'),
    ariaLabelledby: get('aria-labelledby'),
    label: resolveLabel(el),
    autocomplete: get('autocomplete'),
    dataFake: get('data-fake'),
    dataFillType: get('data-fill-type'),
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
  [/(company|org(?:anization)?|business)/i, 'company'],
  [/(job[\s_-]?title|position|role)/i, 'job_title'],
  [/(user|login|account|nick)/i, 'username'],
  [/(url|website|homepage)/i, 'url'],
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
    default:
      return undefined;
  }
}

function fallbackType(desc: FieldDescriptor): LogicalType {
  if (desc.tag === 'textarea') return 'paragraph';
  if (desc.tag === 'select') return 'select';
  const t = mapType(desc);
  if (t) return t;
  // search and bare text both fall back to a readable sentence.
  return 'sentence';
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

  // 2. autocomplete.
  if (desc.autocomplete) {
    const ac = mapAutocomplete(desc.autocomplete);
    if (ac) return ac;
  }

  // 3. input type (email/tel/url/number/date/color/checkbox/radio/range/password).
  if (desc.type) {
    const t = mapType(desc);
    if (t) return t;
  }

  // 3b. Textareas hold free-form text, so skip the name/id regexes (which target
  //     single-line fields like username/company/login) and fill readable text.
  //     An explicit data-fake hint or autocomplete above still wins.
  if (desc.tag === 'textarea') return 'paragraph';

  // 4. Regex over the configured match attributes.
  const hay = buildHaystack(desc, matchAttrs);
  for (const [re, type] of REGEX_RULES) {
    if (re.test(hay)) return type;
  }

  // 5. Element-type fallback.
  return fallbackType(desc);
}
