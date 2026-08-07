// Content-script orchestration: discover fields, skip the ones that should not
// be filled, resolve each value (custom rule -> auto-detection -> generator),
// apply confirmation/agree-to-terms overrides, and fill with SPA events. Pure
// and jsdom-testable; the content.ts entrypoint wires it to the message bus.
//
// Page-level consistency: a name and company are generated once per fill pass
// and reused so an email derives from the name shown in the name field.

import { fillField, fillCombobox, clearContentEditable, isMechanicalType } from './fillers';
import { describeField, detectType, isContentEditableEl, isComboboxDesc, isSecurityTokenField, resolveMediaProvider, mediaContext } from './detect';
import { matchRules, resolveFill, type CustomRule } from './rules';
import type { FillerSettings } from './settings';
import {
  city,
  color,
  company as genCompany,
  country,
  date,
  email,
  firstName,
  fullName,
  jobTitle,
  lastName,
  number as genNumber,
  password as genPassword,
  phone,
  state,
  street,
  url as genUrl,
  username,
  zip,
  title as genTitle,
  searchTerm as genSearchTerm,
  subdomain as genSubdomain,
  taxName as genTaxName,
  objective as genObjective,
  embedFor,
  linkFor,
} from './generators';
import { type Rng, defaultRng } from './rng';
import type { TextTheme } from './text';
import { fieldSentence, fieldParagraph } from './field-text';

export interface FillContext {
  settings: FillerSettings;
  rules: CustomRule[];
  origin: string;
  rng?: Rng;
}

export interface FillResult {
  filled: number;
  skipped: number;
}

interface PageContext {
  first?: string;
  last?: string;
  company?: string;
}

export function discoverFields(root: ParentNode): HTMLElement[] {
  const out: HTMLElement[] = [];
  collectFields(root, out);
  return out;
}

/**
 * Recursively collect fields, descending into open shadow roots and same-origin
 * iframe documents so forms built with web components or frames are filled too.
 */
function collectFields(root: ParentNode, out: HTMLElement[]): void {
  // Collect real form controls plus ARIA combobox triggers that are NOT inputs
  // (Radix UI / shadcn Select renders the trigger as <button role="combobox">).
  // querySelectorAll dedupes across a comma selector, so an <input role="combobox">
  // (Mantine/MUI/Chakra) is still collected exactly once.
  for (const el of root.querySelectorAll<HTMLElement>('input,textarea,select,[role="combobox"]')) out.push(el);
  // Rich-text editors (TipTap/ProseMirror, Quill, Slate, Trix, Draft.js) render
  // as <div contenteditable role="textbox">, not real form controls, so the
  // selector above never finds them. [contenteditable] matches the attribute
  // (true/""/plaintext-only); the isContentEditableEl check drops explicit
  // contenteditable="false" regions. Inherited-editable children (an editor's
  // inner <p>/<br>) lack the attribute and so are never collected — only the
  // editable root is, which is what we fill.
  for (const el of root.querySelectorAll<HTMLElement>('[contenteditable]')) {
    if (isContentEditableEl(el)) out.push(el);
  }
  for (const el of root.querySelectorAll<HTMLElement>('*')) {
    if (el.shadowRoot) collectFields(el.shadowRoot, out);
  }
  for (const iframe of root.querySelectorAll<HTMLIFrameElement>('iframe')) {
    try {
      const doc = iframe.contentDocument;
      if (doc?.body) collectFields(doc.body, out);
    } catch {
      // Cross-origin iframe: cannot access; skip.
    }
  }
}

function fieldHaystack(desc: ReturnType<typeof describeField>): string {
  return [desc.name, desc.id, desc.className, desc.placeholder, desc.ariaLabel, desc.label]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function matchesAny(desc: ReturnType<typeof describeField>, tokens: string[]): boolean {
  if (!tokens.length) return false;
  const hay = fieldHaystack(desc);
  return tokens.some((t) => t && hay.includes(t.toLowerCase()));
}

function isVisible(el: HTMLElement): boolean {
  // A field is not visible if it OR any ancestor is hidden (the `hidden`
  // attribute, display:none, or visibility:hidden). We must walk ancestors
  // because a field's OWN computed display stays e.g. 'inline-block' even when
  // a wrapper <div> is display:none — which is exactly how honeypot anti-bot
  // fields are hidden. Checking only the element misses them, they get filled,
  // and the server's bot detection rejects the signup (blank screen).
  if (typeof el.checkVisibility === 'function') {
    return el.checkVisibility();
  }
  let node: HTMLElement | null = el;
  while (node) {
    if (node.hidden) return false;
    if (typeof getComputedStyle === 'function') {
      const cs = getComputedStyle(node);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return false;
    }
    node = node.parentElement;
  }
  return true;
}

function hasContent(el: HTMLElement, desc: ReturnType<typeof describeField>): boolean {
  if (desc.isContentEditable) return !!(el.textContent && el.textContent.trim());
  if (desc.type === 'checkbox' || desc.type === 'radio') return (el as HTMLInputElement).checked;
  if (desc.tag === 'select') return !!(el as HTMLSelectElement).value;
  return !!(el as HTMLInputElement | HTMLTextAreaElement).value;
}

export function shouldSkip(el: HTMLElement, desc: ReturnType<typeof describeField>, settings: FillerSettings): boolean {
  if (desc.dataFake === 'skip' || desc.dataFillType === 'skip') return true;
  const input = el as HTMLInputElement;
  // A readonly field is normally skipped — EXCEPT an ARIA combobox, whose
  // readonly text input is exactly how a custom dropdown (Mantine/MUI/Chakra)
  // renders. Those are filled by opening + clicking an option below.
  if (desc.type === 'hidden' || input.disabled || (input.readOnly && !isComboboxDesc(desc))) return true;
  // Never fill/clear CSRF / anti-forgery / nonce token fields. Overwriting one
  // is what causes Laravel/ASP.NET/Rails submits to fail with "page expired"
  // (419) and can log the user out. type=hidden is already skipped above; this
  // also protects tokens rendered as a non-hidden input.
  if (isSecurityTokenField(desc)) return true;
  // A disabled dropdown setting skips <select> and combobox fields entirely.
  if ((desc.tag === 'select' || isComboboxDesc(desc)) && !settings.select.enabled) return true;
  if (matchesAny(desc, settings.fields.ignoreFields)) return true;
  if (settings.fields.ignoreHiddenInvisible && !isVisible(el)) return true;
  if (settings.fields.ignoreFieldsWithContent && hasContent(el, desc)) return true;
  return false;
}

function numConstraint(el: HTMLInputElement): { min: number; max: number; step: number } {
  const min = el.min !== '' && Number.isFinite(Number(el.min)) ? Number(el.min) : 0;
  const max = el.max !== '' && Number.isFinite(Number(el.max)) ? Number(el.max) : 100;
  const step = el.step !== '' && Number.isFinite(Number(el.step)) ? Number(el.step) : 1;
  return { min, max, step };
}

/** Resolve a value for an auto-detected (non-rule) field. Undefined for mechanical types. */
function generateValue(
  type: string,
  el: HTMLElement,
  desc: ReturnType<typeof describeField>,
  settings: FillerSettings,
  page: PageContext,
  rng: Rng,
): string | undefined {
  const theme: TextTheme = settings.general.textTheme;
  switch (type) {
    case 'first_name':
      page.first ??= firstName(rng);
      return page.first;
    case 'last_name':
      page.last ??= lastName(rng);
      return page.last;
    case 'full_name':
      return fullName({ first: page.first, last: page.last, rng });
    case 'email':
      return email({ first: page.first, last: page.last, domain: settings.general.emailDomain, rng });
    case 'username':
      return username({ first: page.first, last: page.last });
    case 'phone':
      return phone(rng);
    case 'street':
      return street(rng);
    case 'city':
      return city(rng);
    case 'state':
      return state(rng);
    case 'zip':
      return zip(rng);
    case 'country':
      return country(rng);
    case 'company':
      page.company ??= genCompany(rng);
      return page.company;
    case 'job_title':
      return jobTitle(rng);
    case 'url':
      return genUrl({ company: page.company, rng });
    case 'title':
      return genTitle(rng);
    case 'search':
      return genSearchTerm(rng);
    case 'subdomain':
      return genSubdomain(rng);
    case 'tax_name':
      return genTaxName(rng);
    case 'objective':
      return genObjective(rng);
    case 'embed':
      return embedFor(resolveMediaProvider(desc), mediaContext(desc), rng);
    case 'video_url':
      return linkFor(resolveMediaProvider(desc), 'video', rng);
    case 'audio_url':
      return linkFor(resolveMediaProvider(desc), 'audio', rng);
    case 'date':
      return date(rng);
    case 'color':
      return color(rng);
    case 'number': {
      const { min, max, step } = numConstraint(el as HTMLInputElement);
      return genNumber(min, max, step, rng);
    }
    case 'range': {
      const { min, max, step } = numConstraint(el as HTMLInputElement);
      return genNumber(min, max, step, rng);
    }
    case 'password':
      if (settings.password.mode === 'fixed' && settings.password.fixedValue) {
        return settings.password.fixedValue;
      }
      return genPassword({ length: settings.password.length, rng });
    case 'cc_number':
      return settings.card.number;
    case 'cc_exp':
      return settings.card.expiry;
    case 'cc_csc':
      return settings.card.cvc;
    case 'paragraph': {
      // Textareas get a readable multi-sentence paragraph, capped by the
      // field's own maxlength or the configured default.
      const fieldMax = (el as HTMLTextAreaElement).maxLength;
      const cap = settings.fields.maxLength;
      const budget = fieldMax && fieldMax > 0 ? Math.min(fieldMax, cap) : cap;
      return fieldParagraph(desc, budget, theme, rng);
    }
    case 'sentence':
    case 'text':
    default: {
      // A single full readable corpus sentence; trim only when the field's own
      // maxlength is tighter than the sentence (no mid-word cut).
      const fieldMax = (el as HTMLInputElement).maxLength;
      const one = fieldSentence(desc, theme, rng);
      if (fieldMax && fieldMax > 0 && one.length > fieldMax) {
        return fieldParagraph(desc, fieldMax, theme, rng);
      }
      return one;
    }
  }
}

function fillOne(
  el: HTMLElement,
  settings: FillerSettings,
  rules: CustomRule[],
  origin: string,
  page: PageContext,
  rng: Rng,
  state: { lastValue: string | undefined; lastPassword: string | undefined },
): { filled: boolean } {
  const desc = describeField(el);
  if (shouldSkip(el, desc, settings)) return { filled: false };

  const trigger = settings.general.triggerEvents !== false;

  // Agree-to-terms checkboxes are always checked.
  if (desc.type === 'checkbox' && matchesAny(desc, settings.fields.agreeToTermsFields)) {
    fillField(el, 'checkbox', undefined, { triggerEvents: trigger });
    return { filled: true };
  }

  // Confirmation fields copy the last password (preferred) or the last filled value.
  const confirmValue = state.lastPassword ?? state.lastValue;
  if (matchesAny(desc, settings.fields.confirmationFields) && confirmValue !== undefined) {
    fillField(el, detectType(desc, settings.fields.matchFieldsUsing), confirmValue, { triggerEvents: trigger });
    return { filled: true };
  }

  // Custom rule first; else auto-detect.
  const matched = matchRules(rules, desc, { origin, element: el });
  let value: string | undefined;
  let type: string;
  if (matched) {
    type = detectType(desc, settings.fields.matchFieldsUsing);
    if (isMechanicalType(type)) {
      value = undefined;
    } else {
      try {
        value = resolveFill(matched, { origin, element: el, rng }) ?? undefined;
      } catch {
        // A malformed rule must not abort the whole fill pass; fall back to auto.
        value = generateValue(type, el, desc, settings, page, rng);
      }
    }
  } else {
    type = detectType(desc, settings.fields.matchFieldsUsing);
    value = generateValue(type, el, desc, settings, page, rng);
  }

  // ARIA combobox dropdowns (Mantine/MUI/Chakra Select, and other input-based
  // comboboxes) are filled by opening the dropdown and clicking an option, not
  // by setting a value on the readonly input. A custom rule's resolved value
  // (if any) pins the option via 'match'; otherwise the configured select
  // strategy/match applies.
  if (type === 'combobox') {
    if (matched && value) {
      fillCombobox(el, { strategy: 'match', match: value, rng });
    } else {
      fillCombobox(el, { strategy: settings.select.strategy, match: settings.select.match, rng });
    }
    return { filled: true };
  }

  fillField(el, type, value, {
    triggerEvents: trigger,
    rng,
    selectStrategy: settings.select.strategy,
    selectMatch: settings.select.match,
  });

  // Track the last filled value for confirmation fields. Mechanical types have
  // no string value to copy.
  if (!isMechanicalType(type) && value !== undefined) state.lastValue = value;
  if (type === 'password' && value !== undefined) state.lastPassword = value;

  if (type === 'password' && settings.password.logToConsole) {
    // Echo generated password to DevTools for debugging (matches origin behavior).
    // eslint-disable-next-line no-console
    console.log('[input-filler] generated password:', value);
  }

  return { filled: true };
}

function fillScope(scope: ParentNode, ctx: FillContext): FillResult {
  const rng = ctx.rng ?? defaultRng;
  const page: PageContext = {};
  const state = { lastValue: undefined as string | undefined, lastPassword: undefined as string | undefined };
  let filled = 0;
  let skipped = 0;
  for (const el of discoverFields(scope)) {
    if (fillOne(el, ctx.settings, ctx.rules, ctx.origin, page, rng, state).filled) filled++;
    else skipped++;
  }
  return { filled, skipped };
}

export function fillAllForms(doc: Document, ctx: FillContext): FillResult {
  return fillScope(doc.body, ctx);
}

/** Resolve the scope for "fill this form": the owning <form>, or a fallback. */
export function formScopeFor(activeElement: Element | null): ParentNode | null {
  if (!activeElement || !('form' in activeElement)) {
    // Fallback: nearest form-like container, else the element's parent.
    if (activeElement instanceof HTMLElement) {
      return activeElement.closest('form, [role="form"], fieldset') ?? activeElement.parentElement ?? activeElement;
    }
    return null;
  }
  const form = (activeElement as HTMLInputElement).form;
  if (form) return form;
  // No owning <form>: nearest form-like container, else the element's parent.
  if (activeElement instanceof HTMLElement) {
    return activeElement.closest('form, [role="form"], fieldset') ?? activeElement.parentElement ?? activeElement;
  }
  return null;
}

export function fillCurrentForm(doc: Document, activeElement: Element | null, ctx: FillContext): FillResult {
  const scope = formScopeFor(activeElement);
  if (!scope) return { filled: 0, skipped: 0 };
  return fillScope(scope, ctx);
}

export function clearAllForms(doc: Document): number {
  let cleared = 0;
  for (const el of discoverFields(doc.body)) {
    if (isContentEditableEl(el)) {
      if (el.textContent && el.textContent.trim()) {
        clearContentEditable(el);
        cleared++;
      }
      continue;
    }
    const input = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (input.type === 'hidden' || input.disabled || (input as HTMLInputElement).readOnly) continue;
    // Same token protection as the fill path (see shouldSkip).
    if (isSecurityTokenField(describeField(el))) continue;
    if (input.type === 'checkbox' || input.type === 'radio') {
      if ((input as HTMLInputElement).checked) {
        (input as HTMLInputElement).checked = false;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        cleared++;
      }
    } else if (el.tagName.toLowerCase() === 'select') {
      if ((input as HTMLSelectElement).value) {
        (input as HTMLSelectElement).value = '';
        input.dispatchEvent(new Event('change', { bubbles: true }));
        cleared++;
      }
    } else if ((input as HTMLInputElement).value) {
      (input as HTMLInputElement).value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      cleared++;
    }
  }
  return cleared;
}
