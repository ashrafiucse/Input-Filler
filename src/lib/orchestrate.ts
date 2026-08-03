// Content-script orchestration: discover fields, skip the ones that should not
// be filled, resolve each value (custom rule -> auto-detection -> generator),
// apply confirmation/agree-to-terms overrides, and fill with SPA events. Pure
// and jsdom-testable; the content.ts entrypoint wires it to the message bus.
//
// Page-level consistency: a name and company are generated once per fill pass
// and reused so an email derives from the name shown in the name field.

import { fillField, isMechanicalType } from './fillers';
import { describeField, detectType } from './detect';
import { matchRules, resolveFill, type CustomRule } from './rules';
import type { FillerSettings } from './settings';
import {
  city,
  color,
  company as genCompany,
  country,
  date,
  dummyText,
  email,
  firstName,
  fullName,
  jobTitle,
  lastName,
  number as genNumber,
  password as genPassword,
  phone,
  sentence,
  state,
  street,
  url as genUrl,
  username,
  zip,
} from './generators';
import { type Rng, defaultRng } from './rng';
import type { TextTheme } from './text';

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
  for (const el of root.querySelectorAll<HTMLElement>('input,textarea,select')) out.push(el);
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
  if (el.hidden) return false;
  const style = (el as HTMLElement).style;
  if (style && style.display === 'none') return false;
  if (typeof getComputedStyle === 'function') {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
  }
  return true;
}

function hasContent(el: HTMLElement, desc: ReturnType<typeof describeField>): boolean {
  if (desc.type === 'checkbox' || desc.type === 'radio') return (el as HTMLInputElement).checked;
  if (desc.tag === 'select') return !!(el as HTMLSelectElement).value;
  return !!(el as HTMLInputElement | HTMLTextAreaElement).value;
}

function shouldSkip(el: HTMLElement, desc: ReturnType<typeof describeField>, settings: FillerSettings): boolean {
  if (desc.dataFake === 'skip' || desc.dataFillType === 'skip') return true;
  const input = el as HTMLInputElement;
  if (desc.type === 'hidden' || input.disabled || input.readOnly) return true;
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
      return email({ first: page.first, last: page.last, rng });
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
      return settings.password.mode === 'fixed'
        ? settings.password.fixedValue
        : genPassword({ length: settings.password.length, rng });
    case 'paragraph': {
      // Textareas get a readable multi-sentence paragraph, capped by the
      // field's own maxlength or the configured default.
      const fieldMax = (el as HTMLTextAreaElement).maxLength;
      const cap = settings.fields.maxLength;
      const budget = fieldMax && fieldMax > 0 ? Math.min(fieldMax, cap) : cap;
      return dummyText(budget, theme, rng);
    }
    case 'sentence':
    case 'text':
    default: {
      // A single full readable corpus sentence; trim only when the field's own
      // maxlength is tighter than the sentence (no mid-word cut).
      const fieldMax = (el as HTMLInputElement).maxLength;
      const one = sentence(theme, rng);
      if (fieldMax && fieldMax > 0 && one.length > fieldMax) {
        return dummyText(fieldMax, theme, rng);
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
  state: { lastValue: string | undefined },
): { filled: boolean } {
  const desc = describeField(el);
  if (shouldSkip(el, desc, settings)) return { filled: false };

  const trigger = settings.general.triggerEvents !== false;

  // Agree-to-terms checkboxes are always checked.
  if (desc.type === 'checkbox' && matchesAny(desc, settings.fields.agreeToTermsFields)) {
    fillField(el, 'checkbox', undefined, { triggerEvents: trigger });
    return { filled: true };
  }

  // Confirmation fields copy the immediately preceding filled value.
  if (matchesAny(desc, settings.fields.confirmationFields) && state.lastValue !== undefined) {
    fillField(el, detectType(desc, settings.fields.matchFieldsUsing), state.lastValue, { triggerEvents: trigger });
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
        value = generateValue(type, el, settings, page, rng);
      }
    }
  } else {
    type = detectType(desc, settings.fields.matchFieldsUsing);
    value = generateValue(type, el, settings, page, rng);
  }

  fillField(el, type, value, { triggerEvents: trigger, rng });

  // Track the last filled value for confirmation fields. Mechanical types have
  // no string value to copy.
  if (!isMechanicalType(type) && value !== undefined) state.lastValue = value;

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
  const state = { lastValue: undefined as string | undefined };
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
    const input = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (input.disabled || (input as HTMLInputElement).readOnly) continue;
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
