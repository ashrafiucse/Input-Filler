import {
  loadSettings,
  saveSettings,
  getDefaultStorageAdapter,
  DEFAULT_SETTINGS,
  type FillerSettings,
} from '@/src/lib/settings';
import { loadRules, saveRules, type CustomRule } from '@/src/lib/rules';
import {
  addRule,
  updateRule,
  deleteRule,
  toggleRule,
  moveRule,
  exportRules,
  importRules,
  validateRule,
  blankRule,
} from '@/src/lib/rules-ui';

const adapter = getDefaultStorageAdapter();
let settings: FillerSettings = DEFAULT_SETTINGS;
let rules: CustomRule[] = [];
let editingId: string | null = null;

function $(id: string): HTMLElement {
  return document.getElementById(id) as HTMLElement;
}
function val(id: string): string {
  return (document.getElementById(id) as HTMLInputElement | HTMLSelectElement).value;
}
function setVal(id: string, v: string): void {
  (document.getElementById(id) as HTMLInputElement | HTMLSelectElement).value = v;
}
function checked(id: string): boolean {
  return (document.getElementById(id) as HTMLInputElement).checked;
}
function setChecked(id: string, v: boolean): void {
  (document.getElementById(id) as HTMLInputElement).checked = v;
}

function csv(s: string): string[] {
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

/**
 * Gate the dropdown option-selection UI on its master toggle: when disabled,
 * the strategy/option controls are hidden entirely; when enabled, the
 * "specific option" box appears only for the 'match' strategy.
 */
function updateSelectVisibility(): void {
  const enabled = checked('s-enabled');
  const controls = document.getElementById('s-controls');
  if (controls) controls.hidden = !enabled;
  const matchWrap = document.getElementById('s-match-wrap');
  if (matchWrap) matchWrap.hidden = !(enabled && val('s-strategy') === 'match');
}

function populateSettings(): void {
  setVal('pw-mode', settings.password.mode);
  ($('pw-length') as HTMLInputElement).valueAsNumber = settings.password.length;
  setVal('pw-fixed', settings.password.fixedValue);
  setChecked('pw-log', settings.password.logToConsole);
  setVal('f-ignore', settings.fields.ignoreFields.join(', '));
  setVal('f-confirm', settings.fields.confirmationFields.join(', '));
  setVal('f-agree', settings.fields.agreeToTermsFields.join(', '));
  ($('f-maxlen') as HTMLInputElement).valueAsNumber = settings.fields.maxLength;
  setChecked('f-skiphidden', settings.fields.ignoreHiddenInvisible);
  setChecked('f-skipfilled', settings.fields.ignoreFieldsWithContent);
  setChecked('s-enabled', settings.select.enabled);
  setVal('s-strategy', settings.select.strategy);
  setVal('s-match', settings.select.match);
  updateSelectVisibility();
  setChecked('g-events', settings.general.triggerEvents);
  setChecked('g-menu', settings.general.contextMenu);
  setChecked('g-ai', settings.general.useOnDeviceAI);
  setVal('g-domains', settings.general.ignoredDomains.join(', '));
  setVal('g-emaildomain', settings.general.emailDomain);
  setVal('g-theme-text', settings.general.textTheme);
  setVal('g-theme-ui', settings.general.theme);
  document.documentElement.dataset.theme = settings.general.theme;
}

function collectSettings(): FillerSettings {
  return {
    ...settings,
    password: {
      mode: val('pw-mode') === 'fixed' ? 'fixed' : 'random',
      length: ($('pw-length') as HTMLInputElement).valueAsNumber || 12,
      fixedValue: val('pw-fixed'),
      logToConsole: checked('pw-log'),
    },
    fields: {
      ...settings.fields,
      ignoreFields: csv(val('f-ignore')),
      confirmationFields: csv(val('f-confirm')),
      agreeToTermsFields: csv(val('f-agree')),
      maxLength: ($('f-maxlen') as HTMLInputElement).valueAsNumber || 50,
      ignoreHiddenInvisible: checked('f-skiphidden'),
      ignoreFieldsWithContent: checked('f-skipfilled'),
    },
    select: {
      enabled: checked('s-enabled'),
      strategy: val('s-strategy') === 'first' ? 'first' : val('s-strategy') === 'match' ? 'match' : 'random',
      match: val('s-match'),
    },
    general: {
      ...settings.general,
      triggerEvents: checked('g-events'),
      contextMenu: checked('g-menu'),
      useOnDeviceAI: checked('g-ai'),
      ignoredDomains: csv(val('g-domains')),
      emailDomain: val('g-emaildomain').trim() || 'gmail.com',
      textTheme: val('g-theme-text') as FillerSettings['general']['textTheme'],
      theme: val('g-theme-ui') === 'dark' ? 'dark' : 'light',
    },
  };
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
async function saveSettingsDebounced(): Promise<void> {
  settings = collectSettings();
  const status = $('save-status');
  status.textContent = 'Saving…';
  status.className = 'save-status busy';
  try {
    await saveSettings(adapter, settings);
    document.documentElement.dataset.theme = settings.general.theme;
    status.textContent = 'Saved';
    status.className = 'save-status ok';
  } catch {
    status.textContent = 'Save failed';
    status.className = 'save-status error';
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    status.textContent = '';
    status.className = 'save-status';
  }, 1500);
}

// --- Rules editor -----------------------------------------------------------

function renderRules(): void {
  const list = $('rules-list') as HTMLUListElement;
  const empty = $('rules-empty');
  list.innerHTML = '';
  const ordered = [...rules].sort((a, b) => b.priority - a.priority);
  empty.hidden = ordered.length > 0;
  for (const rule of ordered) {
    const li = document.createElement('li');
    li.className = 'rule';
    const name = document.createElement('span');
    name.textContent = rule.name || '(unnamed)';
    const enabled = document.createElement('input');
    enabled.type = 'checkbox';
    enabled.checked = rule.enabled;
    enabled.addEventListener('change', () => {
      rules = toggleRule(rules, rule.id);
      void saveRules(adapter, rules);
    });
    const up = document.createElement('button');
    up.textContent = '↑';
    up.addEventListener('click', () => {
      rules = moveRule(rules, rule.id, -1);
      void saveRules(adapter, rules);
      renderRules();
    });
    const down = document.createElement('button');
    down.textContent = '↓';
    down.addEventListener('click', () => {
      rules = moveRule(rules, rule.id, 1);
      void saveRules(adapter, rules);
      renderRules();
    });
    const edit = document.createElement('button');
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => openEditor(rule.id));
    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.addEventListener('click', () => {
      rules = deleteRule(rules, rule.id);
      void saveRules(adapter, rules);
      renderRules();
    });
    li.append(enabled, name, up, down, edit, del);
    list.append(li);
  }
}

function openEditor(id: string | null): void {
  editingId = id;
  const form = $('rule-editor') as HTMLFormElement;
  form.hidden = false;
  $('editor-title').textContent = id ? 'Edit rule' : 'Add rule';
  ($('re-errors') as HTMLUListElement).innerHTML = '';
  const rule = id ? (rules.find((r) => r.id === id) ?? blankRule()) : blankRule();
  setVal('re-name', rule.name);
  setVal('re-mode', rule.match.mode);
  setVal('re-field', rule.match.field ?? '');
  setVal('re-id', rule.match.id ?? '');
  setVal('re-label', rule.match.label ?? '');
  setVal('re-type', rule.match.type ?? '');
  setVal('re-selector', rule.match.selector ?? '');
  setVal('re-url', rule.match.urlPattern ?? '');
  setVal('re-kind', rule.fill.kind);
  setVal('re-value', rule.fill.value);
}

function closeEditor(): void {
  editingId = null;
  ($('rule-editor') as HTMLFormElement).hidden = true;
}

function saveEditor(): void {
  const draft: CustomRule = {
    id: editingId ?? blankRule().id,
    name: val('re-name'),
    enabled: editingId ? rules.find((r) => r.id === editingId)?.enabled ?? true : true,
    priority: editingId ? rules.find((r) => r.id === editingId)?.priority ?? 0 : 0,
    match: {
      mode: val('re-mode') === 'all' ? 'all' : 'any',
      field: val('re-field') || undefined,
      id: val('re-id') || undefined,
      label: val('re-label') || undefined,
      type: val('re-type') || undefined,
      selector: val('re-selector') || undefined,
      urlPattern: val('re-url') || undefined,
    },
    fill: {
      kind: val('re-kind') as CustomRule['fill']['kind'],
      value: val('re-value'),
    },
  };

  const errs = validateRule(draft);
  const errEl = $('re-errors') as HTMLUListElement;
  errEl.innerHTML = '';
  if (errs.length) {
    for (const e of errs) {
      const li = document.createElement('li');
      li.textContent = e;
      errEl.append(li);
    }
    return;
  }

  rules = editingId ? updateRule(rules, editingId, draft) : addRule(rules, draft);
  void saveRules(adapter, rules);
  closeEditor();
  renderRules();
}

// --- Init -------------------------------------------------------------------

async function init(): Promise<void> {
  settings = await loadSettings(adapter);
  rules = await loadRules(adapter);
  populateSettings();
  renderRules();

  for (const id of [
    'pw-mode', 'pw-length', 'pw-fixed', 'pw-log', 'f-ignore', 'f-confirm', 'f-agree', 'f-maxlen',
    'f-skiphidden', 'f-skipfilled', 's-enabled', 's-strategy', 's-match',
    'g-events', 'g-menu', 'g-ai', 'g-domains', 'g-emaildomain', 'g-theme-text', 'g-theme-ui',
  ]) {
    document.getElementById(id)?.addEventListener('change', () => void saveSettingsDebounced());
  }
  document.getElementById('s-enabled')?.addEventListener('change', updateSelectVisibility);
  document.getElementById('s-strategy')?.addEventListener('change', updateSelectVisibility);

  $('save-btn').addEventListener('click', () => void saveSettingsDebounced());
  $('rule-add').addEventListener('click', () => openEditor(null));
  $('rule-add-empty').addEventListener('click', () => openEditor(null));
  $('re-save').addEventListener('click', (e) => {
    e.preventDefault();
    saveEditor();
  });
  $('re-cancel').addEventListener('click', (e) => {
    e.preventDefault();
    closeEditor();
  });
  $('rule-export').addEventListener('click', () => {
    const blob = new Blob([exportRules(rules)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'input-filler-rules.json';
    a.click();
    URL.revokeObjectURL(url);
  });
  ($('rule-import') as HTMLInputElement).addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const text = await file.text();
    const res = importRules(text);
    const status = $('save-status');
    if (res.ok && res.rules) {
      rules = res.rules;
      await saveRules(adapter, rules);
      renderRules();
      status.textContent = `Imported ${rules.length} rule${rules.length === 1 ? '' : 's'}`;
      status.className = 'save-status ok';
    } else {
      status.textContent = `Import failed: ${res.error}`;
      status.className = 'save-status error';
    }
  });
}

void init();
