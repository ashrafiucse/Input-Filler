// Typed settings model, defaults, storage (browser.storage.sync with a local
// fallback), and forward-only schema migration. Storage is an injectable
// adapter so the merge/migration logic is unit-testable without the `browser`
// API; entrypoints obtain the real adapter via getDefaultStorageAdapter().

import type { MatchAttribute } from './detect';

export type { MatchAttribute } from './detect';
export type { TextTheme } from './text';
import type { TextTheme } from './text';
import { safeCompile } from './regex-safety';

export interface FillerSettings {
  password: {
    mode: 'random' | 'fixed';
    length: number;
    fixedValue: string;
    logToConsole: boolean;
  };
  fields: {
    ignoreFields: string[];
    ignoreHiddenInvisible: boolean;
    ignoreFieldsWithContent: boolean;
    confirmationFields: string[];
    agreeToTermsFields: string[];
    matchFieldsUsing: MatchAttribute[];
    maxLength: number;
  };
  select: {
    /** When false, <select> dropdowns are skipped entirely (never filled). */
    enabled: boolean;
    /** How to choose an option: random valid, always the first valid, or a fixed value/text. */
    strategy: 'random' | 'first' | 'match';
    /** For strategy 'match': pick the option whose value or visible text matches this. */
    match: string;
  };
  general: {
    triggerEvents: boolean;
    contextMenu: boolean;
    ignoredDomains: string[];
    textTheme: TextTheme;
    theme: 'light' | 'dark';
    emailDomain: string;
    useOnDeviceAI: boolean;
  };
  settingsVersion: number;
}

export const SETTINGS_VERSION = 1;
export const SETTINGS_KEY = 'inputFillerSettings';
export const RULES_KEY = 'inputFillerRules';

const ALL_MATCH_ATTRS: MatchAttribute[] = [
  'id',
  'name',
  'label',
  'aria-label',
  'aria-labelledby',
  'class',
  'placeholder',
];

export const DEFAULT_SETTINGS: FillerSettings = {
  password: { mode: 'fixed', length: 12, fixedValue: 'Test@1234', logToConsole: false },
  fields: {
    ignoreFields: ['captcha', 'hipinputtext'],
    ignoreHiddenInvisible: true,
    ignoreFieldsWithContent: false,
    confirmationFields: ['confirm', 'reenter', 'retype', 'repeat', 'secondary', 'verify'],
    agreeToTermsFields: ['agree', 'terms', 'conditions'],
    matchFieldsUsing: ALL_MATCH_ATTRS,
    maxLength: 200,
  },
  select: { enabled: true, strategy: 'random', match: '' },
  general: {
    triggerEvents: true,
    contextMenu: true,
    ignoredDomains: [],
    textTheme: 'business',
    theme: 'light',
    emailDomain: 'gmail.com',
    useOnDeviceAI: false,
  },
  settingsVersion: SETTINGS_VERSION,
};

export interface StorageArea {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}
export interface StorageAdapter {
  sync: StorageArea;
  local: StorageArea;
}

function strArr(v: unknown, fallback: string[]): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : fallback;
}

/** Merge a partial/stored object over the defaults, recursing one level. */
export function mergeDefaults(raw: unknown): FillerSettings {
  const d = DEFAULT_SETTINGS;
  if (!raw || typeof raw !== 'object') return clone(d);
  const s = raw as Partial<FillerSettings>;
  const f = s.fields ?? d.fields;
  const g = s.general ?? d.general;
  const sel = s.select ?? d.select;
  return {
    password: { ...d.password, ...(s.password ?? {}) },
    fields: {
      ignoreFields: strArr(f.ignoreFields, d.fields.ignoreFields),
      ignoreHiddenInvisible: typeof f.ignoreHiddenInvisible === 'boolean' ? f.ignoreHiddenInvisible : d.fields.ignoreHiddenInvisible,
      ignoreFieldsWithContent: typeof f.ignoreFieldsWithContent === 'boolean' ? f.ignoreFieldsWithContent : d.fields.ignoreFieldsWithContent,
      confirmationFields: strArr(f.confirmationFields, d.fields.confirmationFields),
      agreeToTermsFields: strArr(f.agreeToTermsFields, d.fields.agreeToTermsFields),
      matchFieldsUsing: Array.isArray(f.matchFieldsUsing) && f.matchFieldsUsing.length ? (f.matchFieldsUsing as MatchAttribute[]) : d.fields.matchFieldsUsing,
      maxLength: typeof f.maxLength === 'number' && Number.isFinite(f.maxLength) ? f.maxLength : d.fields.maxLength,
    },
    select: {
      enabled: typeof sel.enabled === 'boolean' ? sel.enabled : d.select.enabled,
      strategy: sel.strategy === 'first' || sel.strategy === 'match' ? sel.strategy : d.select.strategy,
      match: typeof sel.match === 'string' ? sel.match : d.select.match,
    },
    general: {
      triggerEvents: typeof g.triggerEvents === 'boolean' ? g.triggerEvents : d.general.triggerEvents,
      contextMenu: typeof g.contextMenu === 'boolean' ? g.contextMenu : d.general.contextMenu,
      ignoredDomains: strArr(g.ignoredDomains, d.general.ignoredDomains),
      textTheme: g.textTheme ?? d.general.textTheme,
      theme: g.theme === 'dark' ? 'dark' : g.theme === 'light' ? 'light' : d.general.theme,
      emailDomain: typeof g.emailDomain === 'string' && g.emailDomain.trim() ? g.emailDomain.trim() : d.general.emailDomain,
      useOnDeviceAI: typeof g.useOnDeviceAI === 'boolean' ? g.useOnDeviceAI : d.general.useOnDeviceAI,
    },
    settingsVersion: SETTINGS_VERSION,
  };
}

/** Forward-only migration. Bumps version and guarantees required keys exist. */
export function migrate(s: FillerSettings): FillerSettings {
  return { ...mergeDefaults(s), settingsVersion: SETTINGS_VERSION };
}

function clone<T>(v: T): T {
  return typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v));
}

async function readKey(adapter: StorageAdapter, area: 'sync' | 'local', key: string): Promise<unknown> {
  const res = await adapter[area].get([key]);
  return res[key];
}

export async function loadSettings(adapter: StorageAdapter): Promise<FillerSettings> {
  let raw: unknown;
  try {
    raw = await readKey(adapter, 'sync', SETTINGS_KEY);
  } catch {
    raw = undefined;
  }
  if (raw === undefined) {
    try {
      raw = await readKey(adapter, 'local', SETTINGS_KEY);
    } catch {
      raw = undefined;
    }
  }
  try {
    return migrate(mergeDefaults(raw));
  } catch {
    return clone(DEFAULT_SETTINGS);
  }
}

export async function saveSettings(adapter: StorageAdapter, settings: FillerSettings): Promise<void> {
  const payload: Record<string, unknown> = { [SETTINGS_KEY]: { ...settings, settingsVersion: SETTINGS_VERSION } };
  try {
    await adapter.sync.set(payload);
  } catch {
    await adapter.local.set(payload);
  }
}

// The real adapter wraps the WXT-provided `browser` global (auto-imported in the
// extension build; never invoked under Vitest, which injects a fake adapter).
export function getDefaultStorageAdapter(): StorageAdapter {
  return {
    sync: {
      get: (keys) => browser.storage.sync.get(keys),
      set: (items) => browser.storage.sync.set(items),
      remove: (keys) => browser.storage.sync.remove(keys),
    },
    local: {
      get: (keys) => browser.storage.local.get(keys),
      set: (items) => browser.storage.local.set(items),
      remove: (keys) => browser.storage.local.remove(keys),
    },
  };
}

/** True if the given origin should be disabled (regex list in settings). */
export function isIgnoredOrigin(origin: string, ignoredDomains: string[]): boolean {
  return ignoredDomains.some((pat) => {
    const re = safeCompile(pat);
    return re ? re.test(origin) : origin.includes(pat);
  });
}
