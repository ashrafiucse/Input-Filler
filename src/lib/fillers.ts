// Per-type fill strategies. The orchestrator resolves the value for value-bearing
// types (text-like, number, range, date, color) — reading field constraints for
// the constrained ones — and passes it here. fillField applies that value and
// owns the mechanical types (checkbox/radio/select). After mutating, it
// dispatches input/change (and click for checkboxes/radios) so SPA frameworks
// update their state.

import { pick, type Rng, defaultRng } from './rng';
import { isContentEditableEl, type LogicalType } from './detect';

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

/**
 * Select all content inside a contenteditable so an insertion replaces existing
 * text rather than appending to it. Best-effort: some editors reclaim the
 * selection on focus, in which case the execCommand/insertText path below still
 * targets the editor's own caret position.
 */
function selectAllIn(el: HTMLElement): void {
  const getSel = typeof window !== 'undefined' ? window.getSelection : undefined;
  const sel = typeof getSel === 'function' ? getSel.call(window) : null;
  if (!sel) return;
  const range = el.ownerDocument.createRange();
  try {
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {
    // Detached node or a selection implementation that rejects the range.
  }
}

function dispatchEditableInput(el: HTMLElement, data: string): void {
  const init = { bubbles: true, cancelable: true, inputType: 'insertText', data };
  try {
    el.dispatchEvent(new InputEvent('beforeinput', init));
  } catch {
    // Older engines may reject InputEvent with inputType/data; fall back to a
    // plain input event so DOM-syncing editors still react.
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  el.dispatchEvent(new InputEvent('input', init));
}

function focusEditable(el: HTMLElement): void {
  try {
    // preventScroll keeps the page from jumping when filling off-screen editors.
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
}

/**
 * Fill a contenteditable rich-text editor (TipTap/ProseMirror, Quill, Slate,
 * Trix, Draft.js). These are <div contenteditable>, not real form controls, so
 * the native value setter does not apply. Focus + select-all, then insert via
 * document.execCommand('insertText'): although deprecated, it remains the most
 * reliable way to insert text that model-owning editors recognize — it
 * synthesizes a 'beforeinput' event whose `data` ProseMirror/TipTap read and
 * apply to their document model, so the value survives a re-render and a
 * submit. Firefox lacks execCommand('insertText'); there (and under jsdom) we
 * mutate the DOM and dispatch input events, which is sufficient for editors
 * that sync from the DOM on input.
 */
function fillContentEditable(el: HTMLElement, value: string, trigger: boolean): void {
  focusEditable(el);
  selectAllIn(el);
  let inserted = false;
  if (typeof document.execCommand === 'function') {
    try {
      inserted = document.execCommand('insertText', false, value);
    } catch {
      inserted = false;
    }
  }
  if (inserted) return;
  el.textContent = value;
  if (trigger) dispatchEditableInput(el, value);
}

/** Clear a contenteditable editor, syncing its model the same way as filling. */
export function clearContentEditable(el: HTMLElement): void {
  focusEditable(el);
  selectAllIn(el);
  let deleted = false;
  if (typeof document.execCommand === 'function') {
    try {
      deleted = document.execCommand('delete');
    } catch {
      deleted = false;
    }
  }
  if (!deleted || (el.textContent && el.textContent.length)) {
    el.textContent = '';
    dispatchEditableInput(el, '');
  }
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

  // Rich-text editors are contenteditable <div role="textbox">, not form
  // controls: the native value setter (used below) throws on them, so handle
  // them before the type switch.
  if (isContentEditableEl(el)) {
    if (value != null && value !== '') fillContentEditable(el, value, trigger);
    return;
  }

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
