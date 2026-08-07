// Per-type fill strategies. The orchestrator resolves the value for value-bearing
// types (text-like, number, range, date, color) — reading field constraints for
// the constrained ones — and passes it here. fillField applies that value and
// owns the mechanical types (checkbox/radio/select). After mutating, it
// dispatches input/change (and click for checkboxes/radios) so SPA frameworks
// update their state.

import { pick, type Rng, defaultRng } from './rng';
import { isContentEditableEl, type LogicalType } from './detect';

export type SelectStrategy = 'random' | 'first' | 'match';

export interface FillOptions {
  triggerEvents?: boolean;
  rng?: Rng;
  /** How to choose a <select> option. Defaults to 'random'. */
  selectStrategy?: SelectStrategy;
  /** For selectStrategy 'match': option value or visible text to match. */
  selectMatch?: string;
}

const MECHANICAL = new Set<LogicalType>(['checkbox', 'radio', 'select', 'combobox']);

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

/**
 * Pick one item from an already-filtered list of valid options, per the
 * configured strategy. Shared by native <select> and ARIA combobox options so
 * they honor the same first/match/random behavior.
 */
function chooseFrom<T extends { value: string; text: string }>(
  valid: T[],
  strategy: SelectStrategy,
  match: string,
  rng: Rng,
): T | null {
  if (valid.length === 0) return null;
  if (strategy === 'first') return valid[0] as T;
  if (strategy === 'match') {
    const needle = (match ?? '').trim().toLowerCase();
    if (needle) {
      const txt = (o: T) => o.text.trim().toLowerCase();
      const exact = valid.find((o) => o.value.toLowerCase() === needle || txt(o) === needle);
      if (exact) return exact;
      const contains = valid.find((o) => o.value.toLowerCase().includes(needle) || txt(o).includes(needle));
      if (contains) return contains;
    }
    return valid[0] as T; // no/blank match -> deterministic fallback
  }
  return pick(valid, rng);
}

/**
 * Choose a <select> option per the configured strategy:
 *  - 'first':  always the first valid (non-disabled, non-empty) option;
 *  - 'match':  the first option whose value OR visible text equals (then
 *              contains) the configured needle; falls back to 'first' when no
 *              option matches or the needle is blank;
 *  - 'random': a random valid option (the default).
 */
function chooseOption(
  el: HTMLSelectElement,
  strategy: SelectStrategy,
  match: string,
  rng: Rng,
): HTMLOptionElement | null {
  const valid = Array.from(el.options).filter((o) => !o.disabled && o.value !== '');
  return chooseFrom(valid as unknown as { value: string; text: string }[], strategy, match, rng) as HTMLOptionElement | null;
}

function fillSelect(el: HTMLSelectElement, trigger: boolean, rng: Rng, strategy: SelectStrategy, match: string): void {
  const target = chooseOption(el, strategy, match, rng);
  if (!target) return;
  setNativeValue(el, target.value);
  if (trigger) dispatch(el, ['input', 'change']);
}

// ---------------------------------------------------------------------------
// ARIA combobox dropdowns (Mantine/MUI/Chakra Select, and other input-based
// comboboxes).
//
// These render as a readonly <input> + a portal <div role="listbox"> of
// <div role="option">. The input is readonly, so the native value setter is a
// no-op for the framework's controlled state: the ONLY way to set the value is
// to open the dropdown and click an option, exactly like a user. Options are
// portal-rendered asynchronously after the open click (React schedules the
// re-render on a microtask), so we poll / observe for them to appear, then pick
// one per the same first/match/random strategy as <select>.
//
// Because opening one dropdown can blur-and-close another, fills are serialized
// through a single promise chain so two comboboxes on the same form each get a
// stable chance to open and select. fillCombobox() is fire-and-forget: it
// enqueues and returns immediately so the synchronous fill pass is not blocked;
// flushComboboxFills() lets callers/tests await completion.
// ---------------------------------------------------------------------------

const COMBOBOX_OPEN_TIMEOUT_MS = 1500;

/** Serialized queue: only one combobox is open/awaiting options at a time. */
let comboboxChain: Promise<void> = Promise.resolve();

/** Await all combobox fills enqueued so far (for callers/tests). */
export function flushComboboxFills(): Promise<void> {
  return comboboxChain;
}

/** Test hook: detach pending fills so a failing test cannot leak into the next. */
export function _resetComboboxQueue(): void {
  comboboxChain = Promise.resolve();
}

function fireEvent(
  el: Element,
  type: 'pointermove' | 'pointerdown' | 'pointerup' | 'mousedown' | 'mouseup',
): void {
  // Realm-correct constructors from the element's own window, so the event
  // bubbles through the framework's delegated root listener. PointerEvent is
  // absent in some engines; guard so tests (which react to plain click) still pass.
  const Win = el.ownerDocument.defaultView as (typeof window) | null;
  const isPointer = type.startsWith('pointer');
  try {
    const Ctor = isPointer && Win?.PointerEvent ? Win.PointerEvent : Win?.MouseEvent ?? MouseEvent;
    // button:0 mirrors a left-button mouse tap; pointerType:'mouse' satisfies
    // framework guards (Radix/MUI) that admit only a real mouse pointer.
    const init: PointerEventInit = { bubbles: true, cancelable: true, button: 0 };
    if (isPointer) init.pointerType = 'mouse';
    el.dispatchEvent(new Ctor(type, init));
  } catch {
    // jsdom/old engines: ignore.
  }
}

function openCombobox(el: HTMLElement): void {
  try {
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
  // Realistic open sequence: some libs (Mantine, MUI) open on pointerdown,
  // others on mousedown or click. Fire all three so whichever the framework
  // listens for triggers, then .click() (which jsdom fires synchronously).
  fireEvent(el, 'pointerdown');
  fireEvent(el, 'mousedown');
  el.click();
}

/**
 * Resolve the listbox that holds this combobox's options, preferring the
 * explicit aria-controls link (the robust, library-agnostic pointer). Falls
 * back to the nearest role=listbox, then the whole document.
 */
function listboxScope(el: HTMLElement): HTMLElement | Document {
  const id = el.getAttribute('aria-controls');
  if (id) {
    const lb = el.ownerDocument.getElementById(id);
    if (lb) return lb;
  }
  const doc = el.ownerDocument;
  const lb = doc.querySelector('[role="listbox"]');
  return (lb as HTMLElement) ?? doc;
}

/** Visible, non-disabled combobox options inside this combobox's listbox. */
function comboboxOptions(el: HTMLElement): HTMLElement[] {
  const scope = listboxScope(el);
  const all = Array.from(scope.querySelectorAll<HTMLElement>('[role="option"]'));
  return all.filter((o) => {
    const disabled =
      o.getAttribute('aria-disabled') === 'true' || o.hasAttribute('data-disabled') || (o as HTMLButtonElement).disabled;
    return !disabled;
  });
}

function optionValue(o: HTMLElement): string {
  // The option's internal value (Mantine/common data-value); fall back to its
  // visible text when the lib does not carry one.
  return (o.getAttribute('data-value') ?? o.textContent ?? '').trim();
}

function optionText(o: HTMLElement): string {
  return (o.textContent ?? '').trim();
}

function chooseComboboxOption(
  el: HTMLElement,
  strategy: SelectStrategy,
  match: string,
  rng: Rng,
): HTMLElement | null {
  const options = comboboxOptions(el).map((o) => ({ el: o, value: optionValue(o), text: optionText(o) }));
  const valid = options.filter((o) => o.value !== '');
  const chosen = chooseFrom(valid, strategy, match, rng);
  return chosen ? chosen.el : null;
}

/**
 * Wait (poll + MutationObserver) for at least one option to render after open.
 * Options appear async on a microtask once the framework re-renders; in jsdom a
 * synchronous click handler appends them immediately, so the first poll finds
 * them and the function resolves on the next microtask.
 */
function waitForOptions(el: HTMLElement, timeoutMs: number): Promise<HTMLElement[]> {
  return new Promise((resolve) => {
    const immediate = comboboxOptions(el);
    if (immediate.length) {
      resolve(immediate);
      return;
    }
    const doc = el.ownerDocument;
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      clearTimeout(timer);
      resolve(comboboxOptions(el));
    };
    const observer = new doc.defaultView!.MutationObserver(done);
    observer.observe(doc.body, { childList: true, subtree: true });
    const timer = setTimeout(done, timeoutMs);
  });
}

/** Select a single option from this combobox per the configured strategy. */
function selectCombobox(el: HTMLElement, strategy: SelectStrategy, match: string, rng: Rng): void {
  const target = chooseComboboxOption(el, strategy, match, rng);
  if (!target) return;
  // A realistic single left-button tap. pointermove highlights the item
  // (Radix marks its active item on pointermove), and the selection is
  // committed on pointerup by Radix UI Select while Mantine/MUI/Chakra commit
  // on click — firing the full pointer+mouse lifecycle (down/up then the
  // mouse-compat events and click) commits the option under any model without
  // library-specific branching.
  fireEvent(target, 'pointermove');
  fireEvent(target, 'pointerdown');
  fireEvent(target, 'pointerup');
  fireEvent(target, 'mousedown');
  fireEvent(target, 'mouseup');
  target.click();
}

export interface ComboboxFillOptions {
  strategy?: SelectStrategy;
  match?: string;
  rng?: Rng;
  /** Max ms to wait for the dropdown's options to render after opening. */
  openTimeoutMs?: number;
}

/**
 * Fill an ARIA combobox by opening it and clicking an option. Fire-and-forget:
 * enqueues onto the serialized combobox chain and returns synchronously (the
 * fill completes a few frames later). The orchestrator counts the field as
 * filled optimistically; the selection settles before the user submits.
 */
export function fillCombobox(el: HTMLElement, opts: ComboboxFillOptions = {}): void {
  const strategy = opts.strategy ?? 'random';
  const match = opts.match ?? '';
  const rng = opts.rng ?? defaultRng;
  const timeout = opts.openTimeoutMs ?? COMBOBOX_OPEN_TIMEOUT_MS;
  const run = async (): Promise<void> => {
    openCombobox(el);
    await waitForOptions(el, timeout);
    selectCombobox(el, strategy, match, rng);
  };
  comboboxChain = comboboxChain.then(run).catch(() => {
    // A single combobox failing (no options, detached node) must not break the
    // chain for the rest of the form.
  });
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
      fillSelect(el as HTMLSelectElement, trigger, rng, opts.selectStrategy ?? 'random', opts.selectMatch ?? '');
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
