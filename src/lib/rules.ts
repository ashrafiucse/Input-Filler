// Custom Field Rules engine. Rules match fields (by name/id/label/type/CSS
// selector, scoped to a site via urlPattern) and override auto-detection with
// custom fill data: a builtin generator, static text, a template, a list, or a
// regex. Rules evaluate in priority order, first-match-wins. Regex generation
// uses randexp with ReDoS/output guards; rule sets persist chunked under the
// sync-storage per-item quota.

import * as _RandExp from 'randexp';
import { generateByName, number, paragraph } from './generators';
import { pick, defaultRng, type Rng } from './rng';
import type { FieldDescriptor } from './detect';
import { RULES_KEY, type StorageAdapter } from './settings';

type RandExpInstance = { gen: () => string; max?: number };
type RandExpCtor = new (pattern: RegExp | string, flags?: string) => RandExpInstance;
// randexp ships as CJS; resolve the constructor across interop shapes.
const RandExp: RandExpCtor =
  ((_RandExp as unknown as { default?: RandExpCtor }).default ?? (_RandExp as unknown as RandExpCtor));

export type FillKind = 'builtin' | 'static' | 'template' | 'list' | 'regex';
export type MatchMode = 'any' | 'all';

export interface CustomRule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  match: {
    mode: MatchMode;
    field?: string;
    id?: string;
    label?: string;
    type?: string;
    selector?: string;
    urlPattern?: string;
  };
  fill: {
    kind: FillKind;
    value: string;
  };
}

const MAX_REGEX_OUTPUT = 100;

export function compileRegex(pattern: string, flags = ''): RegExp | null {
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

/**
 * Reject patterns likely to cause catastrophic backtracking or oversized
 * output: a quantifier on a group that itself contains a quantifier (e.g.
 * `(a+)+`), or an explicit large repetition count (`{1000}` / `{1000,}`).
 */
export function isSafeRegex(pattern: string): boolean {
  if (/\([^()]*[+*?][^()]*\)[+*?{]/.test(pattern)) return false;
  if (/\{\d{4,}/.test(pattern)) return false;
  return true;
}

export function generateFromRegex(pattern: string): string | null {
  if (!isSafeRegex(pattern)) return null;
  try {
    const re = new RandExp(pattern);
    re.max = 5; // bound optional repetitions where supported (no-op otherwise)
    const s = re.gen();
    return s.length <= MAX_REGEX_OUTPUT ? s : s.slice(0, MAX_REGEX_OUTPUT);
  } catch {
    return null;
  }
}

export interface RuleMatchContext {
  origin: string;
  element?: Element | null;
}

/** True if the rule matches the field descriptor under the given origin. */
export function matchRule(rule: CustomRule, desc: FieldDescriptor, ctx: RuleMatchContext): boolean {
  if (!rule.enabled) return false;
  const m = rule.match;

  // urlPattern gates eligibility (scopes the rule to a site). If set and the
  // origin does not match, the rule does not apply at all.
  if (m.urlPattern) {
    const re = compileRegex(m.urlPattern);
    const ok = re ? re.test(ctx.origin) : ctx.origin.includes(m.urlPattern);
    if (!ok) return false;
  }

  const conditions: boolean[] = [];
  if (m.field) {
    const re = compileRegex(m.field);
    conditions.push(re ? re.test(desc.name ?? '') : false);
  }
  if (m.id) {
    const re = compileRegex(m.id);
    conditions.push(re ? re.test(desc.id ?? '') : false);
  }
  if (m.label) {
    const re = compileRegex(m.label);
    const hay = [desc.label, desc.placeholder, desc.ariaLabel].filter(Boolean).join(' ');
    conditions.push(re ? re.test(hay) : false);
  }
  if (m.type) {
    conditions.push((desc.type ?? '') === m.type);
  }
  if (m.selector) {
    conditions.push(!!ctx.element && safeMatches(ctx.element, m.selector));
  }
  if (conditions.length === 0) return false;
  return m.mode === 'all' ? conditions.every(Boolean) : conditions.some(Boolean);
}

function safeMatches(el: Element, selector: string): boolean {
  try {
    return el.matches(selector);
  } catch {
    return false;
  }
}

/** First match wins, rules sorted by descending priority. */
export function matchRules(
  rules: CustomRule[],
  desc: FieldDescriptor,
  ctx: RuleMatchContext,
): CustomRule | null {
  const sorted = [...rules]
    .filter((r) => r.enabled)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  for (const r of sorted) {
    if (matchRule(r, desc, ctx)) return r;
  }
  return null;
}

export interface ResolveContext {
  origin: string;
  element?: Element | null;
  rng?: Rng;
}

/** Resolve a rule's fill value. Returns null on a safe failure (e.g. bad regex). */
export function resolveFill(rule: CustomRule, ctx: ResolveContext = { origin: '' }): string | null {
  const rng = ctx.rng ?? defaultRng;
  const { kind, value } = rule.fill;
  switch (kind) {
    case 'builtin':
      return generateByName(value, rng);
    case 'static':
      return value;
    case 'template':
      return resolveTemplate(value, rng);
    case 'list': {
      const items = value.split(',').map((s) => s.trim()).filter(Boolean);
      return items.length ? (pick(items, rng) as string) : null;
    }
    case 'regex':
      return generateFromRegex(value);
    default:
      return null;
  }
}

/** Resolve `{name}` and parameterized `{name(args)}` placeholders against generators. */
export function resolveTemplate(tpl: string, rng: Rng = defaultRng): string {
  return tpl.replace(/\{([^}]+)\}/g, (_match, expr: string) => resolveGeneratorExpr(expr.trim(), rng));
}

function resolveGeneratorExpr(expr: string, rng: Rng): string {
  const m = expr.match(/^(\w+)\(([^)]*)\)$/);
  if (m) {
    const name = m[1] as string;
    const args = (m[2] as string).split(',').map((s) => s.trim()).filter(Boolean);
    return callGenerator(name, args, rng);
  }
  return generateByName(expr, rng);
}

function callGenerator(name: string, args: string[], rng: Rng): string {
  switch (name) {
    case 'number': {
      const min = args[0] !== undefined ? Number(args[0]) : 1;
      const max = args[1] !== undefined ? Number(args[1]) : 9999;
      const step = args[2] !== undefined ? Number(args[2]) : 1;
      return Number.isFinite(min) && Number.isFinite(max) ? number(min, max, step, rng) : number(1, 9999, 1, rng);
    }
    case 'paragraph': {
      const n = args[0] !== undefined ? Number(args[0]) : 3;
      return Number.isFinite(n) ? paragraph(n, 'general', rng) : paragraph(3, 'general', rng);
    }
    default:
      return generateByName(name, rng);
  }
}

// --- Chunked persistence (browser.storage.sync caps one key at ~8 KB) --------

const RULE_CHUNK_SIZE = 7000;
const META_KEY = RULES_KEY + '.meta';

export async function saveRules(adapter: StorageAdapter, rules: CustomRule[]): Promise<void> {
  const json = JSON.stringify(rules);
  const chunks: string[] = [];
  for (let i = 0; i < json.length; i += RULE_CHUNK_SIZE) chunks.push(json.slice(i, i + RULE_CHUNK_SIZE));

  let area: 'sync' | 'local' = 'sync';
  let oldN = 0;
  try {
    const m = (await adapter.sync.get([META_KEY]))[META_KEY] as { chunks?: number } | undefined;
    oldN = m?.chunks ?? 0;
  } catch {
    oldN = 0;
  }

  const items: Record<string, unknown> = { [META_KEY]: { chunks: chunks.length } };
  for (let i = 0; i < chunks.length; i++) items[`${RULES_KEY}.${i}`] = chunks[i];

  try {
    await adapter.sync.set(items);
  } catch {
    area = 'local';
    await adapter.local.set(items);
  }

  // Remove stale chunks left over from a larger previous save.
  const stale: string[] = [];
  for (let i = chunks.length; i < oldN; i++) stale.push(`${RULES_KEY}.${i}`);
  if (stale.length) {
    try {
      await adapter[area].remove(stale);
    } catch {
      /* best-effort cleanup */
    }
  }
}

export async function loadRules(adapter: StorageAdapter): Promise<CustomRule[]> {
  let area: 'sync' | 'local' = 'sync';
  let meta = (await adapter.sync.get([META_KEY]))[META_KEY] as { chunks?: number } | undefined;
  if (!meta) {
    try {
      meta = (await adapter.local.get([META_KEY]))[META_KEY] as { chunks?: number } | undefined;
      area = 'local';
    } catch {
      meta = undefined;
    }
  }
  if (!meta || !meta.chunks) return [];

  const keys = Array.from({ length: meta.chunks }, (_, i) => `${RULES_KEY}.${i}`);
  let res: Record<string, unknown>;
  try {
    res = await adapter[area].get(keys);
  } catch {
    return [];
  }
  let json = '';
  for (const k of keys) {
    const c = res[k] as string | undefined;
    if (typeof c === 'string') json += c;
  }
  try {
    return JSON.parse(json) as CustomRule[];
  } catch {
    return [];
  }
}
