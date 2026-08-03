import { describe, it, expect } from 'vitest';
import {
  matchRule,
  matchRules,
  resolveFill,
  resolveTemplate,
  generateFromRegex,
  isSafeRegex,
  saveRules,
  loadRules,
  type CustomRule,
} from '../src/lib/rules';
import type { FieldDescriptor } from '../src/lib/detect';
import type { StorageAdapter } from '../src/lib/settings';

function desc(attrs: Partial<FieldDescriptor> = {}): FieldDescriptor {
  return { tag: 'input', type: 'text', ...attrs };
}
function rule(over: Partial<CustomRule>): CustomRule {
  return {
    id: 'r',
    name: 'rule',
    enabled: true,
    priority: 0,
    match: { mode: 'any' },
    fill: { kind: 'static', value: 'x' },
    ...over,
  };
}

describe('matching', () => {
  it('mode:any matches when one condition hits', () => {
    const r = rule({ match: { mode: 'any', field: 'email' } });
    expect(matchRule(r, desc({ name: 'email_field' }), { origin: '' })).toBe(true);
    expect(matchRule(r, desc({ name: 'phone' }), { origin: '' })).toBe(false);
  });
  it('mode:all matches only when every condition hits', () => {
    const r = rule({ match: { mode: 'all', field: 'email', type: 'text' } });
    expect(matchRule(r, desc({ name: 'email', type: 'text' }), { origin: '' })).toBe(true);
    expect(matchRule(r, desc({ name: 'email', type: 'tel' }), { origin: '' })).toBe(false);
  });
  it('urlPattern gates eligibility to a site', () => {
    const r = rule({ match: { mode: 'any', urlPattern: 'staging', field: 'code' } });
    expect(matchRule(r, desc({ name: 'code' }), { origin: 'https://app.staging.com' })).toBe(true);
    expect(matchRule(r, desc({ name: 'code' }), { origin: 'https://app.prod.com' })).toBe(false);
  });
  it('selector matches a live element', () => {
    document.documentElement.innerHTML = '<input id="promo" name="code">';
    const el = document.getElementById('promo') as Element;
    const r = rule({ match: { mode: 'any', selector: 'input[name=code]' } });
    expect(matchRule(r, desc({ name: 'code' }), { origin: '', element: el })).toBe(true);
  });
  it('disabled rules never match', () => {
    const r = rule({ enabled: false, match: { mode: 'any', field: 'email' } });
    expect(matchRule(r, desc({ name: 'email' }), { origin: '' })).toBe(false);
  });
});

describe('priority and first-match-wins', () => {
  it('higher priority wins', () => {
    const low = rule({ id: 'low', priority: 1, match: { mode: 'any', field: 'email' }, fill: { kind: 'static', value: 'low' } });
    const high = rule({ id: 'high', priority: 10, match: { mode: 'any', field: 'email' }, fill: { kind: 'static', value: 'high' } });
    const got = matchRules([low, high], desc({ name: 'email' }), { origin: '' });
    expect(got?.id).toBe('high');
  });
});

describe('resolveFill kinds', () => {
  it('builtin delegates to a generator', () => {
    const v = resolveFill(rule({ fill: { kind: 'builtin', value: 'firstName' } }), { origin: '' });
    expect(typeof v).toBe('string');
    expect(v!.length).toBeGreaterThan(0);
  });
  it('static returns the literal', () => {
    expect(resolveFill(rule({ fill: { kind: 'static', value: 'John Doe' } }), { origin: '' })).toBe('John Doe');
  });
  it('list returns one of the entries', () => {
    const v = resolveFill(rule({ fill: { kind: 'list', value: 'SAVE10,SAVE20,SAVE30' } }), { origin: '' });
    expect(['SAVE10', 'SAVE20', 'SAVE30']).toContain(v);
  });
  it('regex generates a matching string', () => {
    const v = resolveFill(rule({ fill: { kind: 'regex', value: 'ORD-\\d{6}' } }), { origin: '' });
    expect(v).toMatch(/^ORD-\d{6}$/);
  });
});

describe('templates (incl. parameterized placeholders)', () => {
  it('resolves bare placeholders', () => {
    const v = resolveTemplate('{firstName}.{lastName}@mail.com');
    expect(v).toMatch(/^[a-z]+\.[a-z]+@mail\.com$/i);
  });
  it('resolves parameterized {number(min,max)} (origin §5.4)', () => {
    const v = resolveTemplate('Order-{number(1000,9999)}');
    expect(v).toMatch(/^Order-\d{4}$/);
    const n = Number(v!.slice(6));
    expect(n).toBeGreaterThanOrEqual(1000);
    expect(n).toBeLessThanOrEqual(9999);
  });
});

describe('regex safety', () => {
  it('rejects catastrophic-backtracking patterns', () => {
    expect(isSafeRegex('(a+)+')).toBe(false);
    expect(isSafeRegex('(a+)*')).toBe(false);
  });
  it('rejects large repetition counts', () => {
    expect(isSafeRegex('(a|b){1000000}')).toBe(false);
    expect(isSafeRegex('a{5000}')).toBe(false);
  });
  it('returns null for unsafe patterns; valid patterns generate', () => {
    expect(generateFromRegex('(a+)+')).toBeNull();
    expect(generateFromRegex('a{5000}')).toBeNull();
    expect(generateFromRegex('ORD-\\d{6}')).toMatch(/^ORD-\d{6}$/);
  });
});

describe('chunked persistence', () => {
  function quotaStorage(): { adapter: StorageAdapter; dump: () => Record<string, unknown> } {
    const store: Record<string, unknown> = {};
    const QUOTA = 8192;
    const adapter: StorageAdapter = {
      sync: {
        async get(keys) {
          const out: Record<string, unknown> = {};
          for (const k of keys) if (k in store) out[k] = store[k];
          return out;
        },
        async set(items) {
          for (const [k, v] of Object.entries(items)) {
            if (JSON.stringify(v).length > QUOTA) throw new Error('QUOTA');
            store[k] = v;
          }
        },
        async remove(keys) {
          for (const k of keys) delete store[k];
        },
      },
      local: {
        async get(keys) {
          const out: Record<string, unknown> = {};
          for (const k of keys) if (k in store) out[k] = store[k];
          return out;
        },
        async set(items) {
          for (const [k, v] of Object.entries(items)) store[k] = v;
        },
        async remove(keys) {
          for (const k of keys) delete store[k];
        },
      },
    };
    return { adapter, dump: () => store };
  }

  it('round-trips a large rule set that spans multiple chunks', async () => {
    const { adapter } = quotaStorage();
    const big: CustomRule[] = Array.from({ length: 300 }, (_, i) => ({
      id: `r${i}`,
      name: `rule${i}`,
      enabled: true,
      priority: i,
      match: { mode: 'any', field: `f${i}` },
      fill: { kind: 'static', value: 'v'.repeat(40) + i },
    }));
    await saveRules(adapter, big);
    const loaded = await loadRules(adapter);
    expect(loaded).toHaveLength(300);
    expect(loaded[150]?.id).toBe('r150');
  });

  it('removes stale chunks when the rule set shrinks', async () => {
    const { adapter, dump } = quotaStorage();
    const big = Array.from({ length: 300 }, (_, i) => rule({ id: `r${i}`, priority: i, match: { mode: 'any', field: `f${i}` } }));
    await saveRules(adapter, big);
    expect(Object.keys(dump()).some((k) => k.endsWith('.2'))).toBe(true); // >=3 chunks existed
    await saveRules(adapter, [rule({ id: 'only', priority: 1, match: { mode: 'any', field: 'x' } })]);
    expect(Object.keys(dump()).some((k) => k.endsWith('.2'))).toBe(false); // stale chunk removed
    expect(await loadRules(adapter)).toHaveLength(1);
  });
});
