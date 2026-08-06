import { describe, it, expect, beforeEach } from 'vitest';
import { fillField, fillCombobox, flushComboboxFills, _resetComboboxQueue, _resetRadioCounter } from '../src/lib/fillers';
import { createRng } from '../src/lib/rng';

function set(html: string): Document {
  document.documentElement.innerHTML = html;
  return document;
}

beforeEach(() => _resetRadioCounter());
describe('text-like filling', () => {
  it('sets the value and fires input + change', () => {
    set('<input id="a" type="text">');
    const el = document.getElementById('a') as HTMLInputElement;
    const events: string[] = [];
    el.addEventListener('input', () => events.push('input'));
    el.addEventListener('change', () => events.push('change'));
    fillField(el, 'email', 'eleanor@example.com');
    expect(el.value).toBe('eleanor@example.com');
    expect(events).toContain('input');
    expect(events).toContain('change');
  });
  it('fills a textarea (paragraph)', () => {
    set('<textarea id="t"></textarea>');
    const el = document.getElementById('t') as HTMLTextAreaElement;
    fillField(el, 'paragraph', 'A readable sentence.');
    expect(el.value).toBe('A readable sentence.');
  });
});

describe('checkbox', () => {
  it('becomes checked and fires click + change', () => {
    set('<input id="c" type="checkbox">');
    const el = document.getElementById('c') as HTMLInputElement;
    const events: string[] = [];
    el.addEventListener('click', () => events.push('click'));
    el.addEventListener('change', () => events.push('change'));
    fillField(el, 'checkbox');
    expect(el.checked).toBe(true);
    expect(events).toContain('click');
    expect(events).toContain('change');
  });
});

describe('radio groups', () => {
  it('selects exactly one per group and different groups differ', () => {
    set(`
      <input type="radio" name="g1" value="a">
      <input type="radio" name="g1" value="b">
      <input type="radio" name="g2" value="x">
      <input type="radio" name="g2" value="y">
    `);
    const g1 = Array.from(document.querySelectorAll<HTMLInputElement>('input[name=g1]'));
    const g2 = Array.from(document.querySelectorAll<HTMLInputElement>('input[name=g2]'));
    // Orchestrator calls fillField per radio; idempotency keeps one per group.
    for (const r of [...g1, ...g2]) fillField(r, 'radio');
    expect(g1.filter((r) => r.checked)).toHaveLength(1);
    expect(g2.filter((r) => r.checked)).toHaveLength(1);
    const g1Val = g1.find((r) => r.checked)!.value;
    const g2Val = g2.find((r) => r.checked)!.value;
    expect(g1Val).not.toBe(g2Val);
  });
});

describe('select', () => {
  it('never picks a disabled or empty option', () => {
    set(`
      <select id="s">
        <option value="">Select...</option>
        <option value="one">One</option>
        <option value="two" disabled>Two</option>
        <option value="three">Three</option>
      </select>
    `);
    const el = document.getElementById('s') as HTMLSelectElement;
    for (let i = 0; i < 50; i++) {
      fillField(el, 'select');
      expect(['one', 'three']).toContain(el.value);
      el.value = '';
    }
  });
});

describe('select strategy', () => {
  function planSelect(): HTMLSelectElement {
    set(`
      <select id="s">
        <option value="">Pick…</option>
        <option value="us">United States</option>
        <option value="ca">Canada</option>
        <option value="mx">Mexico</option>
      </select>
    `);
    return document.getElementById('s') as HTMLSelectElement;
  }
  it('random (default) picks a valid option', () => {
    const el = planSelect();
    for (let i = 0; i < 20; i++) {
      fillField(el, 'select', undefined, { selectStrategy: 'random' });
      expect(['us', 'ca', 'mx']).toContain(el.value);
      el.value = '';
    }
  });
  it('first always picks the first valid option', () => {
    const el = planSelect();
    for (let i = 0; i < 5; i++) {
      fillField(el, 'select', undefined, { selectStrategy: 'first' });
      expect(el.value).toBe('us');
    }
  });
  it('match selects by exact value or exact text', () => {
    const el = planSelect();
    fillField(el, 'select', undefined, { selectStrategy: 'match', selectMatch: 'ca' });
    expect(el.value).toBe('ca');
    fillField(el, 'select', undefined, { selectStrategy: 'match', selectMatch: 'Mexico' });
    expect(el.value).toBe('mx');
  });
  it('match is case-insensitive and substring-tolerant', () => {
    const el = planSelect();
    fillField(el, 'select', undefined, { selectStrategy: 'match', selectMatch: 'united states' });
    expect(el.value).toBe('us');
    fillField(el, 'select', undefined, { selectStrategy: 'match', selectMatch: 'can' });
    expect(el.value).toBe('ca');
  });
  it('match falls back to first when nothing matches or the needle is blank', () => {
    const el = planSelect();
    fillField(el, 'select', undefined, { selectStrategy: 'match', selectMatch: 'Brazil' });
    expect(el.value).toBe('us');
    fillField(el, 'select', undefined, { selectStrategy: 'match', selectMatch: '' });
    expect(el.value).toBe('us');
  });
});

describe('constrained types', () => {
  it('range respects a provided value within bounds', () => {
    set('<input id="r" type="range" min="0" max="10" step="2">');
    const el = document.getElementById('r') as HTMLInputElement;
    fillField(el, 'range', '6');
    expect(el.value).toBe('6');
  });
  it('number falls back to a midpoint when no value is provided', () => {
    set('<input id="n" type="number" min="0" max="100" step="10">');
    const el = document.getElementById('n') as HTMLInputElement;
    fillField(el, 'number');
    expect(Number(el.value) % 10).toBe(0);
    expect(Number(el.value)).toBeGreaterThanOrEqual(0);
    expect(Number(el.value)).toBeLessThanOrEqual(100);
  });
});

describe('framework-controlled inputs', () => {
  it('registers the value via the native setter so a React-style tracker does not drop it', () => {
    // React installs a value tracker on controlled inputs that records every
    // value set THROUGH THE NODE. When a filler assigns `el.value = x` directly,
    // the tracker is already in sync by the time the `input` event fires, so
    // React's change detection treats it as a no-op and the controlled state
    // never updates — the field looks filled but the framework submits an empty
    // value (the blank screen after submit on signup forms). Setting the value
    // through the native prototype setter bypasses the tracker, so the dispatched
    // `input` event registers as a real change. This is the same technique the
    // Fake Filler extension uses (and why it works on the same form).
    set('<input id="a" type="text">');
    const el = document.getElementById('a') as HTMLInputElement;

    const proto = HTMLInputElement.prototype;
    const nativeGet = Object.getOwnPropertyDescriptor(proto, 'value')!.get!;
    const nativeSet = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;

    // Framework "value tracker": remembers any value set through the node.
    let trackerValue = '';
    Object.defineProperty(el, 'value', {
      configurable: true,
      get: nativeGet,
      set(v) {
        nativeSet.call(this, v);
        trackerValue = String(v); // a set through the node is "seen" by the tracker
      },
    });

    // Framework input handler (models React's updateValueIfChanged): accept a
    // value only if the tracker does NOT already know about it.
    let frameworkState = '';
    el.addEventListener('input', () => {
      const current = nativeGet.call(el);
      if (current !== trackerValue) frameworkState = current;
    });

    fillField(el, 'email', 'eleanor@example.com');

    expect(frameworkState).toBe('eleanor@example.com');
  });
});

describe('robustness', () => {
  it('filling twice does not throw', () => {
    set('<input id="x" type="text">');
    const el = document.getElementById('x') as HTMLInputElement;
    expect(() => {
      fillField(el, 'text', 'one');
      fillField(el, 'text', 'two');
    }).not.toThrow();
    expect(el.value).toBe('two');
  });
});

describe('contenteditable rich-text editors (TipTap/ProseMirror)', () => {
  it('fills the editor text and fires beforeinput + input', () => {
    set('<div id="e" contenteditable="true" role="textbox"><p><br></p></div>');
    const el = document.getElementById('e') as HTMLElement;
    const events: string[] = [];
    el.addEventListener('input', () => events.push('input'));
    el.addEventListener('beforeinput', () => events.push('beforeinput'));
    fillField(el, 'paragraph', 'A readable paragraph.');
    expect(el.textContent).toBe('A readable paragraph.');
    expect(events).toContain('beforeinput');
    expect(events).toContain('input');
  });
  it('replaces existing content instead of appending', () => {
    set('<div id="e" contenteditable="true">old text</div>');
    const el = document.getElementById('e') as HTMLElement;
    fillField(el, 'paragraph', 'new text');
    expect(el.textContent).toBe('new text');
  });
  it('is a no-op when the resolved value is empty', () => {
    set('<div id="e" contenteditable="true">keep me</div>');
    const el = document.getElementById('e') as HTMLElement;
    fillField(el, 'paragraph', '');
    expect(el.textContent).toBe('keep me');
  });
  it('does not use the native value setter (would throw on a div)', () => {
    set('<div id="e" contenteditable="true"></div>');
    const el = document.getElementById('e') as HTMLElement;
    expect(() => fillField(el, 'paragraph', 'safe')).not.toThrow();
    expect(el.textContent).toBe('safe');
  });
});

/**
 * Build a Mantine-style combobox: a readonly <input aria-haspopup=listbox
 * aria-controls=lb> whose portal <div role=listbox> is populated with options
 * when the input is clicked (mimicking React re-rendering the portal on open).
 * Clicking an option sets the input value, as the framework would.
 */
function buildCombobox(
  opts: Array<[value: string, label: string]>,
  cfg: { listboxId?: string; disabled?: number[] } = {},
): HTMLInputElement {
  const listboxId = cfg.listboxId ?? 'mantine-listbox';
  const listbox = document.createElement('div');
  listbox.id = listboxId;
  listbox.setAttribute('role', 'listbox');
  document.body.append(listbox);

  const input = document.createElement('input');
  input.readOnly = true;
  input.setAttribute('aria-haspopup', 'listbox');
  input.setAttribute('aria-controls', listboxId);
  input.setAttribute('placeholder', 'Select Question Type');
  input.className = 'm_8fb7ebe7 mantine-Input-input mantine-Select-input';
  // Framework: open on click -> render options into the portal listbox.
  input.addEventListener('click', () => {
    for (const [value, label] of opts) {
      const o = document.createElement('div');
      o.setAttribute('role', 'option');
      o.setAttribute('data-value', value);
      o.textContent = label;
      // Framework: clicking an option commits it to the (controlled) input.
      o.addEventListener('click', () => {
        input.value = label;
      });
      listbox.append(o);
    }
  });
  document.body.append(input);
  return input;
}

describe('ARIA combobox (Mantine Select)', () => {
  beforeEach(() => {
    _resetComboboxQueue();
    document.body.innerHTML = '';
  });

  it('opens the dropdown and commits an option (random)', async () => {
    const input = buildCombobox([
      ['short', 'Short Answer'],
      ['long', 'Paragraph'],
      ['mcq', 'Multiple Choice'],
    ]);
    fillCombobox(input, { rng: createRng(1) });
    await flushComboboxFills();
    expect(input.value.length).toBeGreaterThan(0);
    expect(['Short Answer', 'Paragraph', 'Multiple Choice']).toContain(input.value);
  });

  it('strategy "first" always picks the first option', async () => {
    const input = buildCombobox([
      ['basic', 'Basic'],
      ['pro', 'Pro'],
      ['ent', 'Enterprise'],
    ]);
    for (let i = 0; i < 5; i++) {
      input.value = '';
      fillCombobox(input, { strategy: 'first', rng: createRng(i) });
      await flushComboboxFills();
      expect(input.value).toBe('Basic');
    }
  });

  it('strategy "match" selects by exact value or text (then substring)', async () => {
    const input = buildCombobox([
      ['us', 'United States'],
      ['ca', 'Canada'],
      ['mx', 'Mexico'],
    ]);
    fillCombobox(input, { strategy: 'match', match: 'ca' });
    await flushComboboxFills();
    expect(input.value).toBe('Canada');

    input.value = '';
    fillCombobox(input, { strategy: 'match', match: 'Mexico' });
    await flushComboboxFills();
    expect(input.value).toBe('Mexico');
  });

  it('match falls back to the first option when nothing matches', async () => {
    const input = buildCombobox([
      ['us', 'United States'],
      ['ca', 'Canada'],
    ]);
    fillCombobox(input, { strategy: 'match', match: 'Brazil' });
    await flushComboboxFills();
    expect(input.value).toBe('United States');
  });

  it('does not select a disabled option', async () => {
    const input = buildCombobox(
      [
        ['', 'Select…'],
        ['one', 'One'],
        ['two', 'Two'],
      ],
      { disabled: [2] }, // 'Two' is disabled
    );
    // Mark 'Two' disabled in the rendered options after open.
    input.addEventListener('click', () => {
      const listbox = document.getElementById('mantine-listbox')!;
      const two = Array.from(listbox.querySelectorAll<HTMLElement>('[role=option]')).find(
        (o) => o.getAttribute('data-value') === 'two',
      );
      if (two) two.setAttribute('aria-disabled', 'true');
    });
    for (let i = 0; i < 30; i++) {
      input.value = '';
      // Re-open clears the listbox so each iteration is independent.
      document.getElementById('mantine-listbox')!.innerHTML = '';
      fillCombobox(input, { rng: createRng(i) });
      await flushComboboxFills();
      expect(input.value).toBe('One'); // never the disabled 'Two' nor the empty placeholder
    }
  });

  it('fills two comboboxes on the same form (serialized, no race)', async () => {
    const a = buildCombobox(
      [
        ['a1', 'A-one'],
        ['a2', 'A-two'],
      ],
      { listboxId: 'lb-a' },
    );
    const b = buildCombobox(
      [
        ['b1', 'B-one'],
        ['b2', 'B-two'],
      ],
      { listboxId: 'lb-b' },
    );
    fillCombobox(a, { strategy: 'first' });
    fillCombobox(b, { strategy: 'first' });
    await flushComboboxFills();
    expect(a.value).toBe('A-one');
    expect(b.value).toBe('B-one');
  });

  it('is a no-op (never throws) when no options ever render', async () => {
    const input = buildCombobox([]);
    // No click handler populates anything; wait must time out gracefully.
    fillCombobox(input, { rng: createRng(0), openTimeoutMs: 10 });
    await flushComboboxFills();
    expect(input.value).toBe('');
  });
});
