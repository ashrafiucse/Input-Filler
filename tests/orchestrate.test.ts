import { describe, it, expect, beforeEach } from 'vitest';
import { fillAllForms, fillCurrentForm, clearAllForms } from '../src/lib/orchestrate';
import { DEFAULT_SETTINGS, mergeDefaults, type FillerSettings } from '../src/lib/settings';
import { createRng } from '../src/lib/rng';

const ctx = (over: Partial<FillerSettings> = {}, rules: never[] = []) => ({
  settings: { ...mergeDefaults(DEFAULT_SETTINGS), ...over },
  rules,
  origin: 'https://app.example.com',
  rng: createRng(7),
});

function setDoc(html: string): void {
  document.documentElement.innerHTML = `<body>${html}</body>`;
}

beforeEach(() => {
  setDoc('');
});

describe('fillAllForms — mixed form', () => {
  it('fills every fillable field type', () => {
    setDoc(`
      <form id="f">
        <input name="first_name" type="text">
        <input name="last_name" type="text">
        <input name="email" type="email">
        <input name="age" type="number" min="18" max="99" step="1">
        <input name="color" type="color">
        <input name="agree_terms" type="checkbox">
        <select name="plan"><option value="">Pick</option><option value="basic">Basic</option><option value="pro">Pro</option></select>
        <textarea name="bio"></textarea>
      </form>
    `);
    const s = mergeDefaults(DEFAULT_SETTINGS);
    s.fields.ignoreFieldsWithContent = false;
    const res = fillAllForms(document, { settings: s, rules: [], origin: 'https://app.example.com', rng: createRng(7) });
    expect(res.filled).toBe(8);
    const q = (n: string) => document.querySelector<HTMLElement>(`[name="${n}"]`) as HTMLInputElement;
    expect(q('first_name').value.length).toBeGreaterThan(0);
    expect(q('email').value).toMatch(/@/);
    expect(Number(q('age').value)).toBeGreaterThanOrEqual(18);
    expect(Number(q('age').value)).toBeLessThanOrEqual(99);
    expect(q('color').value).toMatch(/^#[0-9a-f]{6}$/);
    expect(q('agree_terms').checked).toBe(true);
    expect(['basic', 'pro']).toContain(q('plan').value);
    expect(q('bio').value.length).toBeGreaterThan(0);
  });

  it('fires input/change events so SPAs react (AE1)', () => {
    setDoc(`<form><input id="e" name="email" type="email"></form>`);
    const el = document.getElementById('e') as HTMLInputElement;
    let count = 0;
    el.addEventListener('input', () => count++);
    el.addEventListener('change', () => count++);
    fillAllForms(document, ctx());
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

describe('skip gate (AE3)', () => {
  it('skips hidden, disabled, readonly, and ignored fields', () => {
    setDoc(`
      <form>
        <input name="hidden1" type="hidden">
        <input name="dis" type="text" disabled>
        <input name="ro" type="text" readonly>
        <input name="captcha" type="text">
        <input name="ok" type="text">
      </form>
    `);
    const res = fillAllForms(document, ctx());
    // Only "ok" is fillable; hidden/disabled/readonly/captcha are skipped.
    expect(res.filled).toBe(1);
    expect((document.querySelector('[name=ok]') as HTMLInputElement).value.length).toBeGreaterThan(0);
    expect((document.querySelector('[name=dis]') as HTMLInputElement).value).toBe('');
  });

  it('skips already-filled fields when configured', () => {
    setDoc(`<form><input name="a" type="text" value="prefilled"><input name="b" type="text"></form>`);
    const res = fillAllForms(document, ctx({ fields: { ...DEFAULT_SETTINGS.fields, ignoreFieldsWithContent: true } }));
    expect(res.filled).toBe(1);
    expect((document.querySelector('[name=a]') as HTMLInputElement).value).toBe('prefilled');
  });
});

describe('confirmation + agree-to-terms (AE2)', () => {
  it('confirm field copies the preceding value; agree-to-terms is checked', () => {
    setDoc(`
      <form>
        <input name="password" type="password">
        <input name="confirm_password" type="password">
        <input name="agree_terms" type="checkbox">
      </form>
    `);
    fillAllForms(document, ctx());
    const pw = (document.querySelector('[name=password]') as HTMLInputElement).value;
    const confirm = (document.querySelector('[name=confirm_password]') as HTMLInputElement).value;
    expect(confirm).toBe(pw);
    expect((document.querySelector('[name=agree_terms]') as HTMLInputElement).checked).toBe(true);
  });
});

describe('page-level name/email consistency (F-SG1, origin §11)', () => {
  it('the email local-part derives from the name fields filled on the same page', () => {
    setDoc(`
      <form>
        <input name="first_name" type="text">
        <input name="last_name" type="text">
        <input name="email" type="email">
      </form>
    `);
    fillAllForms(document, ctx());
    const f = (document.querySelector('[name=first_name]') as HTMLInputElement).value.toLowerCase();
    const l = (document.querySelector('[name=last_name]') as HTMLInputElement).value.toLowerCase();
    const emailVal = (document.querySelector('[name=email]') as HTMLInputElement).value;
    expect(emailVal.toLowerCase().startsWith(`${f}.${l}`)).toBe(true);
  });
});

describe('fillCurrentForm', () => {
  it('fills only the focused form, leaving others untouched', () => {
    setDoc(`
      <form id="a"><input name="x" type="text"></form>
      <form id="b"><input name="y" type="text"></form>
    `);
    const y = document.querySelector('[name=y]') as HTMLInputElement;
    y.focus();
    const res = fillCurrentForm(document, document.activeElement, ctx());
    expect(res.filled).toBe(1);
    expect(y.value.length).toBeGreaterThan(0);
    expect((document.querySelector('[name=x]') as HTMLInputElement).value).toBe('');
  });

  it('falls back when the focused field has no <form> (F-F5)', () => {
    setDoc(`<div id="wrap"><input name="loose" type="text"></div>`);
    const loose = document.querySelector('[name=loose]') as HTMLInputElement;
    loose.focus();
    const res = fillCurrentForm(document, document.activeElement, ctx());
    expect(res.filled).toBe(1);
    expect(loose.value.length).toBeGreaterThan(0);
  });
});

describe('fresh data each fill', () => {
  it('a second click re-fills with new values', () => {
    setDoc(`<form><input name="q" type="text"><textarea name="bio"></textarea></form>`);
    const base = { settings: mergeDefaults(DEFAULT_SETTINGS), rules: [] as never[], origin: 'https://x' };
    fillAllForms(document, { ...base, rng: createRng(1) });
    const q1 = (document.querySelector('[name=q]') as HTMLInputElement).value;
    const t1 = (document.querySelector('[name=bio]') as HTMLTextAreaElement).value;
    fillAllForms(document, { ...base, rng: createRng(2) });
    const q2 = (document.querySelector('[name=q]') as HTMLInputElement).value;
    const t2 = (document.querySelector('[name=bio]') as HTMLTextAreaElement).value;
    expect(q2).not.toBe(q1);
    expect(t2).not.toBe(t1);
  });
});

describe('generic text fields get readable sentences', () => {
  it('a bare text input receives a full readable corpus sentence', () => {
    setDoc(`<form><input name="query" type="text"></form>`);
    fillAllForms(document, ctx());
    const v = (document.querySelector('[name=query]') as HTMLInputElement).value;
    expect(v.length).toBeGreaterThan(15);
    expect(v.endsWith('.')).toBe(true);
  });
});

describe('password and email domain', () => {
  it('fills a password field with a non-empty value', () => {
    setDoc(`<form><input name="password" type="password"></form>`);
    fillAllForms(document, ctx());
    const v = (document.querySelector('[name=password]') as HTMLInputElement).value;
    expect(v.length).toBeGreaterThanOrEqual(8);
  });
  it('email fields use @gmail.com by default', () => {
    setDoc(`<form><input name="email" type="email"></form>`);
    fillAllForms(document, ctx());
    const v = (document.querySelector('[name=email]') as HTMLInputElement).value;
    expect(v.endsWith('@gmail.com')).toBe(true);
  });
  it('honors a custom email domain from settings', () => {
    setDoc(`<form><input name="email" type="email"></form>`);
    fillAllForms(document, ctx({ general: { ...DEFAULT_SETTINGS.general, emailDomain: 'acme.io' } }));
    const v = (document.querySelector('[name=email]') as HTMLInputElement).value;
    expect(v.endsWith('@acme.io')).toBe(true);
  });
});

describe('password / confirm / checkboxes', () => {
  it('fills password + confirm with the same value and checks every checkbox', () => {
    setDoc(`<form>
      <input name="email" type="email">
      <input name="password" type="password">
      <input name="confirm_password" type="password">
      <input name="newsletter" type="checkbox">
      <input name="agree_terms" type="checkbox">
    </form>`);
    fillAllForms(document, ctx());
    const pw = (document.querySelector('[name=password]') as HTMLInputElement).value;
    const cpw = (document.querySelector('[name=confirm_password]') as HTMLInputElement).value;
    expect(pw.length).toBeGreaterThanOrEqual(8);
    expect(cpw).toBe(pw);
    expect((document.querySelector('[name=newsletter]') as HTMLInputElement).checked).toBe(true);
    expect((document.querySelector('[name=agree_terms]') as HTMLInputElement).checked).toBe(true);
  });
});

describe('clearAllForms', () => {
  it('resets filled values and states', () => {
    setDoc(`<form><input name="a" type="text"><input name="c" type="checkbox"></form>`);
    fillAllForms(document, ctx());
    const cleared = clearAllForms(document);
    expect(cleared).toBeGreaterThanOrEqual(1);
    expect((document.querySelector('[name=a]') as HTMLInputElement).value).toBe('');
    expect((document.querySelector('[name=c]') as HTMLInputElement).checked).toBe(false);
  });
});

describe('shadow DOM and same-origin iframes (U11)', () => {
  it('fills a field inside an open shadow root', () => {
    setDoc('');
    const host = document.createElement('div');
    document.body.append(host);
    const sr = host.attachShadow({ mode: 'open' });
    sr.innerHTML = '<input name="shadow_email" type="email">';
    const res = fillAllForms(document, ctx());
    expect(res.filled).toBeGreaterThanOrEqual(1);
    const email = sr.querySelector('input') as HTMLInputElement;
    expect(email.value).toMatch(/@/);
  });

  it('fills a field inside a same-origin iframe document', () => {
    setDoc('');
    const iframe = document.createElement('iframe');
    document.body.append(iframe);
    const doc = iframe.contentDocument;
    expect(doc).toBeTruthy();
    if (doc) {
      doc.body.innerHTML = '<input name="iframe_name" type="text">';
    }
    const res = fillAllForms(document, ctx());
    expect(res.filled).toBeGreaterThanOrEqual(1);
    const input = doc?.body.querySelector('input') as HTMLInputElement;
    expect(input.value.length).toBeGreaterThan(0);
  });
});
