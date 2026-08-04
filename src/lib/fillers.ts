// Per-type fill strategies. The orchestrator resolves the value for value-bearing
// types (text-like, number, range, date, color) — reading field constraints for
// the constrained ones — and passes it here. fillField applies that value and
// owns the mechanical types (checkbox/radio/select). After mutating, it
// dispatches input/change (and click for checkboxes/radios) so SPA frameworks
// update their state.

import { pick, type Rng, defaultRng } from './rng';
import type { LogicalType } from './detect';

export interface FillOptions {
  triggerEvents?: boolean;
  rng?: Rng;
}

const MECHANICAL = new Set<LogicalType>(['checkbox', 'radio', 'select']);

export function isMechanicalType(type: LogicalType): boolean {
  return MECHANICAL.has(type);
}

function dispatch(el: Element, types: ReadonlyArray<'input' | 'change' | 'click'>): void {
  for (const t of types) {
    if (t === 'input') el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    else el.dispatchEvent(new Event(t, { bubbles: true })); // change | click
  }
}

function setNativeValue(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
): void {
  // Frameworks (React/Vue/Svelte) track input values in their own store and
  // install a value tracker on controlled elements. Assigning `el.value = x`
  // directly is "seen" by that tracker, so by the time the `input` event fires
  // the framework's change detection treats it as a no-op — the field looks
  // filled but the controlled state stays empty and the form submits an empty
  // value (the blank-screen-after-submit bug on SPA signup forms). Setting the
  // value through the native prototype setter bypasses the instance tracker, so
  // the dispatched `input`/`change` events register as a real change.
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
}

function setValue(el: HTMLElement, value: string): void {
  setNativeValue(el as HTMLInputElement, value);
}

let radioCounter = 0;
/** Test hook: reset the round-robin counter so radio tests are independent. */
export function _resetRadioCounter(): void {
  radioCounter = 0;
}

function fillCheckbox(el: HTMLInputElement, trigger: boolean): void {
  el.checked = true;
  if (trigger) dispatch(el, ['click', 'change']);
}

function fillRadio(el: HTMLInputElement, trigger: boolean): void {
  const name = el.name;
  // Scope to the owning form so two forms that each contain a same-named group
  // each get a selection (HTML scopes radio groups by form owner).
  const root: ParentNode = el.form ?? el.closest('form') ?? el.ownerDocument;
  let group: HTMLInputElement[] = [el];
  if (name) {
    const safe = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(name) : name;
    group = Array.from(root.querySelectorAll<HTMLInputElement>(`input[type=radio][name="${safe}"]`));
    if (group.length === 0) group = [el];
  }
  // Idempotent per group: if a selection already exists, leave it.
  if (group.some((r) => r.checked)) return;
  // Round-robin across groups so different groups pick different options.
  const target = group[radioCounter % group.length] as HTMLInputElement;
  radioCounter++;
  target.checked = true;
  if (trigger) dispatch(target, ['click', 'change']);
}

function fillSelect(el: HTMLSelectElement, trigger: boolean, rng: Rng): void {
  const valid = Array.from(el.options).filter((o) => !o.disabled && o.value !== '');
  if (valid.length === 0) return;
  const target = pick(valid, rng);
  setNativeValue(el, target.value);
  if (trigger) dispatch(el, ['input', 'change']);
}

function constrainedFallback(el: HTMLInputElement): string {
  const min = el.min !== '' ? Number(el.min) : 0;
  const max = el.max !== '' ? Number(el.max) : 100;
  const step = el.step !== '' && Number.isFinite(Number(el.step)) ? Number(el.step) : 1;
  const span = max - min;
  const steps = Math.round(span / step);
  const mid = min + Math.round(steps / 2) * step;
  return Number.isFinite(mid) ? String(mid) : '0';
}

export function fillField(
  el: HTMLElement,
  type: LogicalType,
  value?: string,
  opts: FillOptions = {},
): void {
  const trigger = opts.triggerEvents !== false;
  const rng = opts.rng ?? defaultRng;

  switch (type) {
    case 'checkbox':
      fillCheckbox(el as HTMLInputElement, trigger);
      return;
    case 'radio':
      fillRadio(el as HTMLInputElement, trigger);
      return;
    case 'select':
      fillSelect(el as HTMLSelectElement, trigger, rng);
      return;
    case 'number':
    case 'range': {
      const v = value ?? constrainedFallback(el as HTMLInputElement);
      setValue(el, v);
      if (trigger) dispatch(el, ['input', 'change']);
      return;
    }
    case 'date':
    case 'color': {
      if (value != null) setValue(el, value);
      if (trigger) dispatch(el, ['input', 'change']);
      return;
    }
    default: {
      // text-like (text/email/phone/url/password/sentence/paragraph/name/etc.)
      if (value != null) {
        setValue(el, value);
        if (trigger) dispatch(el, ['input', 'change']);
      }
      return;
    }
  }
}
