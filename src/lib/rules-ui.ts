// Pure CRUD + serialization for the Custom Field Rules editor, extracted so the
// options page's rule logic is unit-testable. The DOM layer in
// entrypoints/options/main.ts calls these and renders the results.

import { compileRegex, isSafeRegex, type CustomRule } from './rules';

let idCounter = 0;
export function newRuleId(): string {
  idCounter += 1;
  return `rule-${Date.now().toString(36)}-${idCounter}`;
}

export function blankRule(): CustomRule {
  return {
    id: newRuleId(),
    name: '',
    enabled: true,
    priority: 0,
    match: { mode: 'any' },
    fill: { kind: 'static', value: '' },
  };
}

/** Reassign priorities so list order is the source of truth (top = highest). */
export function normalizePriorities(rules: CustomRule[]): CustomRule[] {
  const sorted = [...rules].sort((a, b) => b.priority - a.priority);
  return sorted.map((r, i) => ({ ...r, priority: sorted.length - i }));
}

export function addRule(rules: CustomRule[], rule: CustomRule): CustomRule[] {
  const maxPriority = rules.reduce((m, r) => Math.max(m, r.priority), 0);
  return normalizePriorities([...rules, { ...rule, priority: maxPriority + 1 }]);
}

export function updateRule(rules: CustomRule[], id: string, patch: Partial<CustomRule>): CustomRule[] {
  return rules.map((r) => (r.id === id ? { ...r, ...patch } : r));
}

export function deleteRule(rules: CustomRule[], id: string): CustomRule[] {
  return rules.filter((r) => r.id !== id);
}

export function toggleRule(rules: CustomRule[], id: string): CustomRule[] {
  return rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r));
}

/** Move a rule up (dir = -1) or down (dir = +1) in priority order. */
export function moveRule(rules: CustomRule[], id: string, dir: -1 | 1): CustomRule[] {
  const sorted = [...rules].sort((a, b) => b.priority - a.priority);
  const i = sorted.findIndex((r) => r.id === id);
  if (i < 0) return rules;
  const j = i + dir;
  if (j < 0 || j >= sorted.length) return rules;
  const tmp = sorted[i] as CustomRule;
  sorted[i] = sorted[j] as CustomRule;
  sorted[j] = tmp;
  // Reassign priorities by the new visual position (top = highest). Do not
  // re-sort, or the swap is undone by the old priority values.
  return sorted.map((r, idx) => ({ ...r, priority: sorted.length - idx }));
}

export function exportRules(rules: CustomRule[]): string {
  return JSON.stringify(rules, null, 2);
}

export interface ImportResult {
  ok: boolean;
  rules?: CustomRule[];
  error?: string;
}

const FILL_KINDS = new Set<string>(['builtin', 'static', 'template', 'list', 'regex']);

function isValidRule(v: unknown): v is CustomRule {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.name !== 'string') return false;
  if (!(r.match instanceof Object)) return false;
  const m = r.match as Record<string, unknown>;
  if (m.mode !== 'any' && m.mode !== 'all') return false;
  if (!(r.fill instanceof Object)) return false;
  const f = r.fill as Record<string, unknown>;
  if (typeof f.kind !== 'string' || !FILL_KINDS.has(f.kind)) return false;
  if (typeof f.value !== 'string') return false;
  // String-check the pattern fields; unsafe/invalid match regexes are rejected.
  for (const k of ['field', 'id', 'label', 'selector', 'urlPattern', 'type']) {
    const val = m[k];
    if (val !== undefined && typeof val !== 'string') return false;
  }
  if (typeof f.kind === 'string' && f.kind === 'regex' && typeof f.value === 'string' && f.value) {
    if (!isSafeRegex(f.value) || !compileRegex(f.value)) return false;
  }
  if (typeof m.urlPattern === 'string' && m.urlPattern && (!isSafeRegex(m.urlPattern) || !compileRegex(m.urlPattern))) {
    return false;
  }
  return true;
}

export function importRules(json: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'Invalid JSON' };
  }
  if (!Array.isArray(parsed)) return { ok: false, error: 'Expected a list of rules' };
  for (const r of parsed) {
    if (!isValidRule(r)) return { ok: false, error: 'An entry is not a valid rule' };
  }
  return { ok: true, rules: normalizePriorities(parsed as CustomRule[]) };
}

/** Validate a single rule; returns a list of human-readable errors (empty = valid). */
export function validateRule(rule: CustomRule): string[] {
  const errs: string[] = [];
  if (!rule.name || !rule.name.trim()) errs.push('Name is required');
  const hasCondition =
    !!(rule.match.field || rule.match.id || rule.match.label || rule.match.type || rule.match.selector) ||
    !!rule.match.urlPattern;
  if (!hasCondition) errs.push('At least one match condition or site pattern is required');
  if (!rule.fill || !rule.fill.kind) {
    errs.push('A fill kind is required');
  } else if (!rule.fill.value && rule.fill.value !== '') {
    errs.push('A fill value is required');
  } else if (!rule.fill.value.trim()) {
    errs.push('A fill value is required');
  }
  if (rule.fill?.kind === 'regex' && rule.fill.value) {
    if (!isSafeRegex(rule.fill.value)) errs.push('Regex may cause catastrophic backtracking');
    else if (!compileRegex(rule.fill.value)) errs.push('Regex is invalid');
  }
  return errs;
}
