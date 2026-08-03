import { describe, it, expect, beforeEach } from 'vitest';
import { int, createRng } from '../src/lib/rng';
import { isIgnoredOrigin, DEFAULT_SETTINGS, mergeDefaults } from '../src/lib/settings';
import { matchRule, isSafeRegex, safeCompile, type CustomRule } from '../src/lib/rules';
import { importRules } from '../src/lib/rules-ui';
import { fillAllForms } from '../src/lib/orchestrate';
import { fillField, _resetRadioCounter } from '../src/lib/fillers';
import type { FieldDescriptor } from '../src/lib/detect';

function input(attrs: Partial<FieldDescriptor> = {}): FieldDescriptor {
  return { tag: 'input', type: 'text', ...attrs };
}

describe('int never exceeds max (review fix #3)', () => {
  it('respects max when step does not divide the span', () => {
    for (let i = 0; i < 500; i++) {
      const v = int(0, 10, 4, createRng(i));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(10);
    }
  });
});

describe('isIgnoredOrigin (review #13 / match-side regex guard)', () => {
  it('matches by regex and falls back to includes for unsafe patterns', () => {
    expect(isIgnoredOrigin('https://bank.com', ['bank\\.com'])).toBe(true);
    expect(isIgnoredOrigin('https://safe.com', ['bank\\.com'])).toBe(false);
    // Unsafe pattern -> safeCompile returns null -> includes() fallback.
    expect(isIgnoredOrigin('https://x(a+)+y', ['(a+)+'])).toBe(true);
    expect(isIgnoredOrigin('https://safe.com', ['(a+)+'])).toBe(false);
  });
});

describe('radio groups scoped per form (review fix #4)', () => {
  beforeEach(() => _resetRadioCounter());
  it('two forms with a same-named group each get a selection', () => {
    document.documentElement.innerHTML = `
      <form id="a"><input type="radio" name="pref" value="x"><input type="radio" name="pref" value="y"></form>
      <form id="b"><input type="radio" name="pref" value="x"><input type="radio" name="pref" value="y"></form>`;
    const a = Array.from(document.querySelectorAll<HTMLInputElement>('#a input'));
    const b = Array.from(document.querySelectorAll<HTMLInputElement>('#b input'));
    for (const r of [...a, ...b]) fillField(r, 'radio');
    expect(a.filter((r) => r.checked)).toHaveLength(1);
    expect(b.filter((r) => r.checked)).toHaveLength(1);
  });
});

describe('textarea respects maxlength (review fix #2 / AE4)', () => {
  it('caps paragraph text at maxlength', () => {
    document.documentElement.innerHTML = '<body><textarea name="bio" maxlength="40"></textarea></body>';
    const settings = mergeDefaults(DEFAULT_SETTINGS);
    fillAllForms(document, { settings, rules: [], origin: 'https://x', rng: createRng(3) });
    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    expect(ta.value.length).toBeLessThanOrEqual(40);
    expect(ta.value.length).toBeGreaterThan(0);
  });
});

describe('urlPattern-only rule (review fix #5)', () => {
  it('matches every field on a matching site and nothing off it', () => {
    const r: CustomRule = {
      id: 'r', name: 'r', enabled: true, priority: 1,
      match: { mode: 'any', urlPattern: 'staging' },
      fill: { kind: 'static', value: 'x' },
    };
    expect(matchRule(r, input({ name: 'anything' }), { origin: 'https://app.staging.com' })).toBe(true);
    expect(matchRule(r, input({ name: 'anything' }), { origin: 'https://app.prod.com' })).toBe(false);
  });
});

describe('match-side regex guard (review security #1)', () => {
  it('rejects quantified alternation and never throws on match', () => {
    expect(isSafeRegex('(a|a)+')).toBe(false);
    expect(isSafeRegex('(a|aa)+')).toBe(false);
    expect(safeCompile('(a|a)+')).toBeNull();
    const r: CustomRule = {
      id: 'r', name: 'r', enabled: true, priority: 1,
      match: { mode: 'any', field: '(a|a)+' },
      fill: { kind: 'static', value: 'x' },
    };
    expect(matchRule(r, input({ name: 'aaaa' }), { origin: '' })).toBe(false);
  });
  it('still accepts ordinary patterns', () => {
    expect(isSafeRegex('ORD-\\d{6}')).toBe(true);
    expect(safeCompile('ORD-\\d{6}')).not.toBeNull();
  });
});

describe('importRules validation (review security #2)', () => {
  it('rejects an invalid fill kind', () => {
    const res = importRules(
      JSON.stringify([{ id: 'r', name: 'r', enabled: true, priority: 1, match: { mode: 'any', field: 'x' }, fill: { kind: 'bogus', value: 'y' } }]),
    );
    expect(res.ok).toBe(false);
  });
  it('rejects an unsafe regex fill value', () => {
    const res = importRules(
      JSON.stringify([{ id: 'r', name: 'r', enabled: true, priority: 1, match: { mode: 'any', field: 'x' }, fill: { kind: 'regex', value: '(a+)+' } }]),
    );
    expect(res.ok).toBe(false);
  });
  it('still round-trips valid rules', () => {
    const valid = [{ id: 'r', name: 'r', enabled: true, priority: 1, match: { mode: 'any', field: 'email' }, fill: { kind: 'static', value: 'x@x.com' } }];
    expect(importRules(JSON.stringify(valid)).ok).toBe(true);
  });
});
