import { describe, it, expect, beforeEach } from 'vitest';
import { fillField, _resetRadioCounter } from '../src/lib/fillers';

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
