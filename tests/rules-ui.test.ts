import { describe, it, expect } from 'vitest';
import {
  addRule,
  updateRule,
  deleteRule,
  toggleRule,
  moveRule,
  exportRules,
  importRules,
  validateRule,
  normalizePriorities,
  blankRule,
} from '../src/lib/rules-ui';
import type { CustomRule } from '../src/lib/rules';

function r(id: string, priority: number, over: Partial<CustomRule> = {}): CustomRule {
  return { id, name: id, enabled: true, priority, match: { mode: 'any', field: 'email' }, fill: { kind: 'static', value: 'x' }, ...over };
}

describe('rules CRUD', () => {
  it('adds a rule and normalizes priorities', () => {
    const rules = [r('a', 1), r('b', 2)];
    const next = addRule(rules, blankRule());
    expect(next).toHaveLength(3);
    // Priorities are unique and contiguous after normalization.
    const pris = next.map((x) => x.priority).sort((a, b) => a - b);
    expect(pris).toEqual([1, 2, 3]);
  });
  it('updates, toggles, and deletes by id', () => {
    let rules = [r('a', 1), r('b', 2)];
    rules = updateRule(rules, 'a', { name: 'A2' });
    expect(rules[0]!.name).toBe('A2');
    rules = toggleRule(rules, 'b');
    expect(rules[1]!.enabled).toBe(false);
    rules = deleteRule(rules, 'a');
    expect(rules).toHaveLength(1);
  });
});

describe('moveRule', () => {
  it('moves a rule down and reorders priorities', () => {
    const rules = [r('a', 3), r('b', 2), r('c', 1)];
    const moved = moveRule(rules, 'a', 1); // a moves down
    const order = moved.map((x) => x.id);
    expect(order).toEqual(['b', 'a', 'c']);
  });
  it('is a no-op at the boundary', () => {
    const rules = [r('a', 2), r('b', 1)];
    expect(moveRule(rules, 'a', -1)).toEqual(rules);
  });
});

describe('import / export', () => {
  it('round-trips a rule set', () => {
    const rules = [r('a', 2), r('b', 1)];
    const json = exportRules(rules);
    const res = importRules(json);
    expect(res.ok).toBe(true);
    expect(res.rules!.length).toBe(2);
  });
  it('rejects invalid JSON with no state change', () => {
    const res = importRules('{not json');
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });
  it('rejects a non-array', () => {
    expect(importRules('{"a":1}').ok).toBe(false);
  });
});

describe('validateRule (F-D5)', () => {
  it('flags a missing name', () => {
    const errs = validateRule(r('x', 1, { name: '' }));
    expect(errs.some((e) => e.includes('Name'))).toBe(true);
  });
  it('flags a rule with no conditions', () => {
    const errs = validateRule(r('x', 1, { match: { mode: 'any' } }));
    expect(errs.some((e) => e.includes('condition'))).toBe(true);
  });
  it('flags an invalid regex fill', () => {
    const errs = validateRule(r('x', 1, { fill: { kind: 'regex', value: '(' } }));
    expect(errs.some((e) => e.includes('Regex'))).toBe(true);
  });
  it('accepts a well-formed rule', () => {
    expect(validateRule(r('x', 1))).toEqual([]);
  });
});

describe('normalizePriorities', () => {
  it('makes priorities unique and contiguous, preserving order', () => {
    const rules = [r('c', 5), r('a', 9), r('b', 7)];
    const norm = normalizePriorities(rules);
    const ids = norm.map((x) => x.id);
    expect(ids).toEqual(['a', 'b', 'c']); // sorted by original priority desc
    expect(norm.map((x) => x.priority).sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });
});
