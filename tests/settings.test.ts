import { describe, it, expect } from 'vitest';
import {
  loadSettings,
  saveSettings,
  mergeDefaults,
  migrate,
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  type StorageAdapter,
  type FillerSettings,
} from '../src/lib/settings';

function fakeStorage(): { adapter: StorageAdapter; store: { sync: Record<string, unknown>; local: Record<string, unknown> } } {
  const store: { sync: Record<string, unknown>; local: Record<string, unknown> } = { sync: {}, local: {} };
  const mk = (area: 'sync' | 'local'): StorageAdapter['sync'] => ({
    async get(keys) {
      const out: Record<string, unknown> = {};
      for (const k of keys) {
        const v = store[area][k];
        if (v !== undefined) out[k] = v;
      }
      return out;
    },
    async set(items) {
      Object.assign(store[area], items);
    },
    async remove(keys) {
      for (const k of keys) delete store[area][k];
    },
  });
  return { store, adapter: { sync: mk('sync'), local: mk('local') } };
}

describe('loadSettings', () => {
  it('returns defaults when storage is empty', async () => {
    const { adapter } = fakeStorage();
    const s = await loadSettings(adapter);
    expect(s).toEqual(DEFAULT_SETTINGS);
  });
  it('merges defaults with partial saved data', async () => {
    const { adapter, store } = fakeStorage();
    store.sync[SETTINGS_KEY] = { general: { textTheme: 'tech' } };
    const s = await loadSettings(adapter);
    expect(s.general.textTheme).toBe('tech');
    expect(s.general.triggerEvents).toBe(true); // default preserved
    expect(s.fields.matchFieldsUsing).toEqual(DEFAULT_SETTINGS.fields.matchFieldsUsing);
  });
});

describe('save/load round-trip', () => {
  it('persists and reloads the whole object', async () => {
    const { adapter } = fakeStorage();
    const custom: FillerSettings = { ...DEFAULT_SETTINGS, password: { ...DEFAULT_SETTINGS.password, length: 20 } };
    await saveSettings(adapter, custom);
    const loaded = await loadSettings(adapter);
    expect(loaded.password.length).toBe(20);
  });
});

describe('password default', () => {
  it('defaults to a fixed (static) password with a usable value', () => {
    expect(DEFAULT_SETTINGS.password.mode).toBe('fixed');
    expect(DEFAULT_SETTINGS.password.fixedValue.length).toBeGreaterThanOrEqual(8);
  });
});

describe('migration', () => {
  it('upgrades an older partial object, adding missing fields with defaults', () => {
    const oldish = { settingsVersion: 0, general: { theme: 'dark' } } as unknown;
    const upgraded = migrate(mergeDefaults(oldish));
    expect(upgraded.settingsVersion).toBe(1);
    expect(upgraded.general.theme).toBe('dark');
    expect(upgraded.general.textTheme).toBe('lms'); // added default
    expect(upgraded.fields.ignoreFields).toEqual(['captcha', 'hipinputtext']);
  });
  it('malformed stored data falls back to defaults without throwing', () => {
    expect(() => mergeDefaults('not-an-object')).not.toThrow();
    expect(mergeDefaults('not-an-object')).toEqual(DEFAULT_SETTINGS);
  });
});

describe('select (dropdown) settings', () => {
  it('defaults to enabled + random', () => {
    expect(DEFAULT_SETTINGS.select).toEqual({ enabled: true, strategy: 'random', match: '', skipIfSelected: false });
  });
  it('merges stored select settings', () => {
    const s = mergeDefaults({ select: { enabled: false, strategy: 'match', match: 'United States' } });
    expect(s.select).toEqual({ enabled: false, strategy: 'match', match: 'United States', skipIfSelected: false });
  });
  it('clamps an unknown strategy to the default', () => {
    const bad = mergeDefaults({ select: { enabled: true, strategy: 'bogus', match: 'x' } });
    expect(bad.select.strategy).toBe('random');
  });
  it('adds defaults when select is entirely absent (forward-compatible)', () => {
    expect(mergeDefaults({}).select).toEqual({ enabled: true, strategy: 'random', match: '', skipIfSelected: false });
  });
  it('preserves an explicit skipIfSelected and defaults it when absent', () => {
    expect(mergeDefaults({ select: { enabled: true, strategy: 'first', match: '', skipIfSelected: true } }).select.skipIfSelected).toBe(true);
    expect(mergeDefaults({ select: { enabled: true, strategy: 'first', match: '' } }).select.skipIfSelected).toBe(false);
  });
});

describe('card (test payment) settings', () => {
  it('defaults to the Stripe-style test card', () => {
    expect(DEFAULT_SETTINGS.card).toEqual({ number: '4242 4242 4242 4242', expiry: '01 / 35', cvc: '121' });
  });
  it('merges stored card values', () => {
    const s = mergeDefaults({ card: { number: '4000 0000 0000 0002', expiry: '11 / 38', cvc: '999' } });
    expect(s.card).toEqual({ number: '4000 0000 0000 0002', expiry: '11 / 38', cvc: '999' });
  });
  it('falls back to defaults for blank/missing card fields', () => {
    expect(mergeDefaults({ card: { number: '', expiry: '01 / 35', cvc: '' } }).card).toEqual(DEFAULT_SETTINGS.card);
    expect(mergeDefaults({}).card).toEqual(DEFAULT_SETTINGS.card);
  });
});
