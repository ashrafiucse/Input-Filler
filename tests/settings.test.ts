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

describe('migration', () => {
  it('upgrades an older partial object, adding missing fields with defaults', () => {
    const oldish = { settingsVersion: 0, general: { theme: 'dark' } } as unknown;
    const upgraded = migrate(mergeDefaults(oldish));
    expect(upgraded.settingsVersion).toBe(1);
    expect(upgraded.general.theme).toBe('dark');
    expect(upgraded.general.textTheme).toBe('business'); // added default
    expect(upgraded.fields.ignoreFields).toEqual(['captcha', 'hipinputtext']);
  });
  it('malformed stored data falls back to defaults without throwing', () => {
    expect(() => mergeDefaults('not-an-object')).not.toThrow();
    expect(mergeDefaults('not-an-object')).toEqual(DEFAULT_SETTINGS);
  });
});
