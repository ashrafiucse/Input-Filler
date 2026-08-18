import { describe, it, expect, beforeEach } from 'vitest';
import { fillAllForms, fillCurrentForm, clearAllForms, discoverFields } from '../src/lib/orchestrate';
import { flushComboboxFills, flushDeferredSelects, _resetComboboxQueue, _resetDeferredSelectQueue } from '../src/lib/fillers';
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
  _resetComboboxQueue();
  _resetDeferredSelectQueue();
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

describe('honeypot / wrapper-hidden fields', () => {
  it('does not fill fields hidden by a display:none wrapper (anti-bot honeypot)', () => {
    // Mirrors the Spatie Laravel-Honeypot layout: a wrapper <div> with
    // display:none holds a decoy text field + an encrypted-timestamp field. The
    // inputs themselves have NO hidden styling — only the wrapper does — so a
    // naive element-only visibility check sees them as visible and fills them,
    // tripping server-side bot detection and breaking signup. Visibility must
    // account for ancestors.
    setDoc(`
      <form id="register-form">
        <input type="hidden" name="_token" value="csrf">
        <div style="display:none" aria-hidden="true">
          <input name="phone_number__xyz" type="text" tabindex="-1" value="">
          <input name="valid_from" type="text" value="eyJpdiI6">
        </div>
        <input name="first_name" type="text">
        <input name="email" type="email">
        <input name="password" type="password">
      </form>
    `);
    fillAllForms(document, ctx());
    const q = (n: string) => document.querySelector(`[name="${n}"]`) as HTMLInputElement;
    // honeypot + encrypted timestamp must be left untouched
    expect(q('phone_number__xyz').value).toBe('');
    expect(q('valid_from').value).toBe('eyJpdiI6');
    // real fields are still filled
    expect(q('first_name').value.length).toBeGreaterThan(0);
    expect(q('email').value).toMatch(/@/);
    expect(q('password').value.length).toBeGreaterThan(0);
  });
});

describe('field-aware free text', () => {
  it('fills a field with text that matches its label intent', () => {
    setDoc(`<form>
      <input name="course_description" type="text">
      <textarea name="feedback"></textarea>
    </form>`);
    fillAllForms(document, ctx());
    const course = (document.querySelector('[name=course_description]') as HTMLInputElement).value.toLowerCase();
    const feedback = (document.querySelector('[name=feedback]') as HTMLTextAreaElement).value.toLowerCase();
    expect(course).toMatch(/course|module|quiz|lesson|syllabus|learner|enroll|gradebook|assignment|rubric|completion/);
    expect(feedback).toMatch(/flow|clarity|instruction|layout|delight|click|default|rough|edge|smooth/);
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

describe('intl-tel-input phone fields', () => {
  it('fills E.164 when the input belongs to an intl-tel-input widget', () => {
    // Markup mirroring the intl-tel-input widget: the tel input carries the
    // widget's class + data attribute and sits inside an .iti wrapper.
    setDoc(`
      <form id="f">
        <div class="iti iti--allow-dropdown iti--show-flags">
          <input name="phone_number" id="phone" type="tel" class="iti__tel-input" data-intl-tel-input-id="0">
        </div>
      </form>`);
    fillAllForms(document, ctx());
    const q = document.querySelector('[name="phone_number"]') as HTMLInputElement;
    // A country-less national number would be bound to whatever country the
    // widget has selected (e.g. Djibouti +253) and rejected as invalid.
    expect(q.value).toMatch(/^\+1\d{10}$/);
  });
  it('detects the widget via data attribute alone', () => {
    setDoc(`<form><input name="phone_number" type="tel" data-intl-tel-input-id="3"></form>`);
    fillAllForms(document, ctx());
    const q = document.querySelector('[name="phone_number"]') as HTMLInputElement;
    expect(q.value).toMatch(/^\+1\d{10}$/);
  });
  it('detects the widget via the .iti wrapper alone (no input markers)', () => {
    setDoc(`
      <form>
        <div class="iti iti--allow-dropdown">
          <input name="phone_number" type="tel">
        </div>
      </form>`);
    fillAllForms(document, ctx());
    const q = document.querySelector('[name="phone_number"]') as HTMLInputElement;
    expect(q.value).toMatch(/^\+1\d{10}$/);
  });
  it('plain tel inputs keep the (xxx) xxx-xxxx national format', () => {
    setDoc(`<form><input name="phone_number" type="tel"></form>`);
    fillAllForms(document, ctx());
    const q = document.querySelector('[name="phone_number"]') as HTMLInputElement;
    expect(q.value).toMatch(/^\(\d{3}\) \d{3}-\d{4}$/);
  });
  it('fills E.164 when the placeholder shows a country-coded example', () => {
    // The reported case: a plain tel input whose site validation rejects
    // "(480) 756-0648" but accepts "+3814807560648".
    setDoc(`<form><input name="phone_number" type="tel" placeholder="+381 63 123 4567"></form>`);
    fillAllForms(document, ctx());
    const q = document.querySelector('[name="phone_number"]') as HTMLInputElement;
    expect(q.value).toMatch(/^\+1\d{10}$/);
  });
  it('fills E.164 when the pattern requires a literal +', () => {
    setDoc(`<form><input name="phone_number" type="tel" pattern="^\\+[1-9]\\d{10,14}"></form>`);
    fillAllForms(document, ctx());
    const q = document.querySelector('[name="phone_number"]') as HTMLInputElement;
    expect(q.value).toMatch(/^\+1\d{10}$/);
  });
  it('fills E.164 when the label asks for the country code', () => {
    setDoc(`
      <form>
        <label for="phone">Phone (with country code)</label>
        <input id="phone" name="phone_number" type="tel">
      </form>`);
    fillAllForms(document, ctx());
    const q = document.querySelector('[name="phone_number"]') as HTMLInputElement;
    expect(q.value).toMatch(/^\+1\d{10}$/);
  });
  it('keeps the national format when maxlength cannot fit E.164', () => {
    setDoc(`<form><input name="phone_number" type="tel" placeholder="+1 (555) 000-0000" maxlength="10"></form>`);
    fillAllForms(document, ctx());
    const q = document.querySelector('[name="phone_number"]') as HTMLInputElement;
    expect(q.value).toMatch(/^\(\d{3}\) \d{3}-\d{4}$/);
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

describe('dependent / cascading selects (Country → State)', () => {
  it('fills a state select whose options arrive async after the country change', async () => {
    setDoc(`
      <form>
        <select name="country"><option value="">Pick country</option><option value="us">United States</option></select>
        <select name="state"><option value="">Select a state</option></select>
      </form>
    `);
    const country = document.querySelector('[name=country]') as HTMLSelectElement;
    const state = document.querySelector('[name=state]') as HTMLSelectElement;
    // Simulate the app populating state options async after country changes
    // (the exact pattern from the field report: only the placeholder exists
    // at fill time).
    country.addEventListener('change', () => {
      setTimeout(() => {
        state.insertAdjacentHTML(
          'beforeend',
          '<option value="ca">California</option><option value="tx">Texas</option>',
        );
      }, 5);
    });

    fillAllForms(document, ctx());
    // Country fills synchronously; state is deferred (still empty in-pass).
    expect(country.value).toBe('us');
    expect(state.value).toBe('');
    await flushDeferredSelects();
    expect(['ca', 'tx']).toContain(state.value);
  });

  it('a select with options present is filled synchronously, not deferred', () => {
    setDoc(`
      <form>
        <select name="plan"><option value="">Pick</option><option value="basic">Basic</option><option value="pro">Pro</option></select>
      </form>
    `);
    fillAllForms(document, ctx());
    expect(['basic', 'pro']).toContain(
      (document.querySelector('[name=plan]') as HTMLSelectElement).value,
    );
  });
});

describe('Preline country → dependent state cascade', () => {
  it('fills a Preline country, whose change then enables the state select', async () => {
    // Preline country widget (hidden native select + toggle + dropdown).
    const wrapper = document.createElement('div');
    wrapper.className = 'hs-select relative';
    const country = document.createElement('select');
    country.name = 'country';
    country.setAttribute('data-hs-select', '{}');
    country.className = 'hidden';
    country.style.display = 'none';
    country.innerHTML = '<option value=""><option value="us">United States<option value="ca">Canada';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    const ttitle = document.createElement('span');
    ttitle.setAttribute('data-title', '');
    ttitle.textContent = 'Choose';
    toggle.append(ttitle);
    const dropdown = document.createElement('div');
    dropdown.setAttribute('data-hs-select-dropdown', '');
    dropdown.setAttribute('role', 'listbox');
    dropdown.className = 'hidden';
    for (const [v, l] of [['us', 'United States'], ['ca', 'Canada']] as const) {
      const o = document.createElement('div');
      o.setAttribute('data-value', v);
      o.setAttribute('data-title-value', l);
      o.textContent = l;
      dropdown.append(o);
    }
    wrapper.append(country, toggle, dropdown);
    // Dependent native state select — empty until a country is chosen.
    const state = document.createElement('select');
    state.name = 'state';
    state.innerHTML = '<option value="">Select a state</option>';
    const form = document.createElement('form');
    form.append(wrapper, state);
    document.body.append(form);

    // Preline: open on toggle click; commit on option click.
    toggle.addEventListener('click', () => dropdown.classList.remove('hidden'));
    for (const o of Array.from(dropdown.querySelectorAll<HTMLElement>('[data-value]'))) {
      o.addEventListener('click', () => {
        country.value = o.getAttribute('data-value') ?? '';
        ttitle.textContent = o.getAttribute('data-title-value');
        country.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
    // App populates state options async after the country changes.
    country.addEventListener('change', () => {
      setTimeout(() => {
        state.insertAdjacentHTML('beforeend', '<option value="ny">New York<option value="on">Ontario');
      }, 5);
    });

    fillAllForms(document, ctx());
    // Country fills via the async Preline path; state is deferred (empty in-pass).
    expect(country.value).toBe('');
    await flushComboboxFills(); // country commits → change → state options arrive
    expect(['us', 'ca']).toContain(country.value);
    await flushDeferredSelects(); // state now has options → fills
    expect(['ny', 'on']).toContain(state.value);
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
  it('email fields use @example.com by default', () => {
    setDoc(`<form><input name="email" type="email"></form>`);
    fillAllForms(document, ctx());
    const v = (document.querySelector('[name=email]') as HTMLInputElement).value;
    expect(v.endsWith('@example.com')).toBe(true);
  });
  it('honors a custom email domain from settings', () => {
    setDoc(`<form><input name="email" type="email"></form>`);
    fillAllForms(document, ctx({ general: { ...DEFAULT_SETTINGS.general, emailDomain: 'acme.io' } }));
    const v = (document.querySelector('[name=email]') as HTMLInputElement).value;
    expect(v.endsWith('@acme.io')).toBe(true);
  });
});

describe('hidden token fields are preserved', () => {
  it('fill does not touch hidden CSRF/token fields', () => {
    setDoc(`<form><input name="name" type="text"><input name="csrf" type="hidden" value="tok123"></form>`);
    fillAllForms(document, ctx());
    expect((document.querySelector('[name=csrf]') as HTMLInputElement).value).toBe('tok123');
    expect((document.querySelector('[name=name]') as HTMLInputElement).value.length).toBeGreaterThan(0);
  });
  it('clear does not wipe hidden CSRF/token fields', () => {
    setDoc(`<form><input name="name" type="text" value="x"><input name="csrf" type="hidden" value="tok123"></form>`);
    clearAllForms(document);
    expect((document.querySelector('[name=name]') as HTMLInputElement).value).toBe('');
    expect((document.querySelector('[name=csrf]') as HTMLInputElement).value).toBe('tok123');
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

describe('contenteditable rich-text editors (TipTap/ProseMirror)', () => {
  it('discovers and fills the exact TipTap markup from the field report', () => {
    setDoc(`<form>
      <div contenteditable="true" translate="no" role="textbox" aria-label="Rich-Text Editor"
           tabindex="0" data-placeholder="Write something ..."
           class="tiptap ProseMirror outline-hidden">
        <p data-placeholder="Write something ..." class="is-empty cursor-text"><br class="ProseMirror-trailingBreak"></p>
      </div>
    </form>`);
    const res = fillAllForms(document, ctx());
    expect(res.filled).toBe(1);
    const editor = document.querySelector('[contenteditable]') as HTMLElement;
    expect(editor.textContent!.length).toBeGreaterThan(0);
  });
  it('clears a filled editor back to empty', () => {
    setDoc(`<div id="e" contenteditable="true" role="textbox"></div>`);
    fillAllForms(document, ctx());
    const editor = document.querySelector('[contenteditable]') as HTMLElement;
    expect(editor.textContent!.length).toBeGreaterThan(0);
    const cleared = clearAllForms(document);
    expect(cleared).toBeGreaterThanOrEqual(1);
    expect((document.querySelector('[contenteditable]') as HTMLElement).textContent).toBe('');
  });
  it('honors ignoreFieldsWithContent for a pre-filled editor', () => {
    setDoc(`<div contenteditable="true">already written</div>`);
    const s = mergeDefaults(DEFAULT_SETTINGS);
    s.fields.ignoreFieldsWithContent = true;
    const res = fillAllForms(document, { settings: s, rules: [], origin: 'https://app.example.com', rng: createRng(7) });
    expect(res.filled).toBe(0);
    expect((document.querySelector('[contenteditable]') as HTMLElement).textContent).toBe('already written');
  });
  it('does not collect an explicit contenteditable="false" region', () => {
    setDoc(`<div contenteditable="true" id="ok"></div><div contenteditable="false" id="no"></div>`);
    fillAllForms(document, ctx());
    expect((document.getElementById('ok') as HTMLElement).textContent!.length).toBeGreaterThan(0);
    expect((document.getElementById('no') as HTMLElement).textContent).toBe('');
  });
  it('coexists with ordinary fields in the same form', () => {
    setDoc(`<form>
      <input name="title" type="text">
      <div contenteditable="true" role="textbox" aria-label="Body"></div>
    </form>`);
    const res = fillAllForms(document, ctx());
    expect(res.filled).toBe(2);
    expect((document.querySelector('[name=title]') as HTMLInputElement).value.length).toBeGreaterThan(0);
    expect((document.querySelector('[contenteditable]') as HTMLElement).textContent!.length).toBeGreaterThan(0);
  });
});

describe('type-aware filling (placeholder/label → fitting data)', () => {
  // Mantine <TextInput label="Course title" …/> renders a <label>; resolveLabel
  // picks it up, so detection is keyword-driven and works on any project.
  function labelledInput(html: string): void {
    setDoc(html);
  }
  it('fills a course-title field with a title-like value', () => {
    labelledInput(`<form>
      <label for="t">Course title</label>
      <input id="t" name="title" type="text" placeholder="e.g. Introduction to Web Development">
    </form>`);
    fillAllForms(document, ctx());
    const v = (document.getElementById('t') as HTMLInputElement).value;
    expect(v.length).toBeGreaterThan(0);
    // Not a generic corpus sentence (no trailing period from our titles).
    expect(v.endsWith('.')).toBe(false);
  });
  it('fills an email-shaped-placeholder field with an email', () => {
    labelledInput(`<form><input name="x" type="text" placeholder="name@example.com"></form>`);
    fillAllForms(document, ctx());
    expect((document.querySelector('input') as HTMLInputElement).value).toMatch(/@/);
  });
  it('fills an <iframe> textarea with an embed snippet', () => {
    labelledInput(`<form><textarea name="embed" placeholder="<iframe width=\"560\"></iframe>"></textarea></form>`);
    fillAllForms(document, ctx());
    expect((document.querySelector('textarea') as HTMLTextAreaElement).value.startsWith('<iframe')).toBe(true);
  });
  it('fills a search box with a short search term', () => {
    labelledInput(`<form><input name="q" type="text" placeholder="Search by name or email…"></form>`);
    fillAllForms(document, ctx());
    const v = (document.querySelector('input') as HTMLInputElement).value;
    expect(v.length).toBeGreaterThan(0);
    expect(v).not.toMatch(/\n/);
  });
  it('fills a <select> by picking a valid option (never a generated string)', () => {
    labelledInput(`<form>
      <select name="country">
        <option value="">Select…</option>
        <option value="de">Germany</option>
        <option value="fr">France</option>
      </select>
    </form>`);
    fillAllForms(document, ctx());
    expect((document.querySelector('select') as HTMLSelectElement).value).not.toBe('');
  });
});

describe('media provider filling (named provider wins, else any)', () => {
  it('a YouTube-named embed field gets the YouTube iframe', () => {
    setDoc(`<form>
      <label for="e">YouTube embed</label>
      <textarea id="e" name="embed" placeholder="<iframe src=…></iframe>"></textarea>
    </form>`);
    fillAllForms(document, ctx());
    expect((document.querySelector('textarea') as HTMLTextAreaElement).value).toContain('youtube.com/embed');
  });
  it('a Spotify-named embed field gets the Spotify iframe', () => {
    setDoc(`<form>
      <label for="e">Spotify embed</label>
      <textarea id="e" name="embed" placeholder="<iframe src=…></iframe>"></textarea>
    </form>`);
    fillAllForms(document, ctx());
    expect((document.querySelector('textarea') as HTMLTextAreaElement).value).toContain('open.spotify.com/embed');
  });
  it('a video-URL field naming YouTube gets the YouTube watch link', () => {
    setDoc(`<form><input name="v" type="url" placeholder="Paste YouTube URL"></form>`);
    fillAllForms(document, ctx());
    expect((document.querySelector('input') as HTMLInputElement).value).toContain('youtube.com/watch');
  });
  it('a generic embed field (no provider) gets some real embed', () => {
    setDoc(`<form><textarea name="embed" placeholder="<iframe></iframe>"></textarea></form>`);
    fillAllForms(document, ctx());
    const v = (document.querySelector('textarea') as HTMLTextAreaElement).value;
    expect(v.startsWith('<iframe')).toBe(true);
    expect(/youtube|vimeo|spotify|soundcloud/.test(v)).toBe(true);
  });
});

describe('dropdown (select) options', () => {  it('skips <select> fields when filling is disabled', () => {
    setDoc(`
      <form>
        <input name="name" type="text">
        <select name="plan"><option value="">Pick</option><option value="basic">Basic</option><option value="pro">Pro</option></select>
      </form>
    `);
    const res = fillAllForms(document, ctx({ select: { enabled: false, strategy: 'random', match: '' } }));
    expect(res.filled).toBe(1); // only the text input
    expect((document.querySelector('[name=plan]') as HTMLSelectElement).value).toBe('');
  });
  it('strategy "first" always picks the first valid option', () => {
    setDoc(`<form><select name="plan"><option value="">Pick</option><option value="basic">Basic</option><option value="pro">Pro</option></select></form>`);
    fillAllForms(document, ctx({ select: { enabled: true, strategy: 'first', match: '' } }));
    expect((document.querySelector('[name=plan]') as HTMLSelectElement).value).toBe('basic');
  });
  it('strategy "match" selects the configured option', () => {
    setDoc(`<form><select name="plan"><option value="">Pick</option><option value="basic">Basic</option><option value="pro">Pro</option></select></form>`);
    fillAllForms(document, ctx({ select: { enabled: true, strategy: 'match', match: 'Pro' } }));
    expect((document.querySelector('[name=plan]') as HTMLSelectElement).value).toBe('pro');
  });
});

describe('checkout card fields', () => {  it('fills card number, expiry, and CVC from the test-card settings', () => {
    setDoc(`
      <form>
        <input name="cardNumber" autocomplete="cc-number" type="text" inputmode="numeric" aria-label="Card number" placeholder="1234 1234 1234 1234">
        <input name="cardExpiry" autocomplete="cc-exp" type="text" inputmode="numeric" aria-label="Expiration" placeholder="MM / YY">
        <input name="cardCvc" autocomplete="cc-csc" type="text" inputmode="numeric" aria-label="CVC" placeholder="CVC">
      </form>
    `);
    fillAllForms(document, ctx());
    const q = (n: string) => document.querySelector(`[name=${n}]`) as HTMLInputElement;
    expect(q('cardNumber').value).toBe('4242 4242 4242 4242');
    expect(q('cardExpiry').value).toBe('01 / 35');
    expect(q('cardCvc').value).toBe('121');
  });
  it('honors custom test-card values from settings', () => {
    setDoc(`<form>
      <input name="cardNumber" autocomplete="cc-number" type="text">
      <input name="cardExpiry" autocomplete="cc-exp" type="text">
      <input name="cardCvc" autocomplete="cc-csc" type="text">
    </form>`);
    fillAllForms(document, ctx({ card: { number: '4000 0000 0000 0002', expiry: '11 / 38', cvc: '999' } }));
    const q = (n: string) => document.querySelector(`[name=${n}]`) as HTMLInputElement;
    expect(q('cardNumber').value).toBe('4000 0000 0000 0002');
    expect(q('cardExpiry').value).toBe('11 / 38');
    expect(q('cardCvc').value).toBe('999');
  });
});

describe('CSRF / session token fields are never touched', () => {
  it('fill preserves a hidden _token field', () => {
    setDoc(`<form>
      <input type="hidden" name="_token" value="abc123">
      <input name="email" type="email">
    </form>`);
    fillAllForms(document, ctx());
    expect((document.querySelector('[name=_token]') as HTMLInputElement).value).toBe('abc123');
  });
  it('fill preserves a non-hidden token field (would otherwise corrupt the token)', () => {
    setDoc(`<form>
      <input name="csrfmiddlewaretoken" type="text" value="XYZ_SECRET">
      <input name="email" type="email">
    </form>`);
    fillAllForms(document, ctx());
    expect((document.querySelector('[name=csrfmiddlewaretoken]') as HTMLInputElement).value).toBe('XYZ_SECRET');
    // the ordinary field still fills normally
    expect((document.querySelector('[name=email]') as HTMLInputElement).value.length).toBeGreaterThan(0);
  });
  it('clear preserves token fields but clears ordinary ones', () => {
    setDoc(`<form>
      <input type="hidden" name="_token" value="abc123">
      <input name="authenticity_token" type="text" value="RAILS_TOKEN">
      <input name="email" type="email" value="x@y.z">
    </form>`);
    clearAllForms(document);
    expect((document.querySelector('[name=_token]') as HTMLInputElement).value).toBe('abc123');
    expect((document.querySelector('[name=authenticity_token]') as HTMLInputElement).value).toBe('RAILS_TOKEN');
    expect((document.querySelector('[name=email]') as HTMLInputElement).value).toBe('');
  });
});

/**
 * Mount a Mantine-style combobox imperatively (its framework behavior — open on
 * click renders options into a portal listbox; clicking an option commits to
 * the readonly input — can't be expressed as static HTML). Returns the input.
 */
function mountCombobox(
  opts: Array<[value: string, label: string]>,
  cfg: { listboxId?: string; name?: string; insideForm?: boolean } = {},
): HTMLInputElement {
  const listboxId = cfg.listboxId ?? 'mantine-listbox';
  const listbox = document.createElement('div');
  listbox.id = listboxId;
  listbox.setAttribute('role', 'listbox');
  document.body.append(listbox);

  const input = document.createElement('input');
  input.readOnly = true;
  if (cfg.name) input.name = cfg.name;
  input.setAttribute('aria-haspopup', 'listbox');
  input.setAttribute('aria-controls', listboxId);
  input.setAttribute('placeholder', 'Select Question Type');
  input.className = 'm_8fb7ebe7 mantine-Input-input mantine-Select-input';
  input.addEventListener('click', () => {
    for (const [value, label] of opts) {
      const o = document.createElement('div');
      o.setAttribute('role', 'option');
      o.setAttribute('data-value', value);
      o.textContent = label;
      o.addEventListener('click', () => {
        input.value = label;
      });
      listbox.append(o);
    }
  });
  if (cfg.insideForm !== false) {
    const form = document.querySelector('form') ?? (() => {
      const f = document.createElement('form');
      document.body.append(f);
      return f;
    })();
    form.append(input);
  } else {
    document.body.append(input);
  }
  return input;
}

describe('ARIA combobox dropdowns (Mantine Select)', () => {
  beforeEach(() => {
    setDoc('');
    _resetComboboxQueue();
  });

  it('fills a readonly Mantine Select by opening it and picking an option (not skipped)', async () => {
    // This is the exact failing case from the field report: a readonly combobox
    // input that the old code skipped (readonly) and could not fill.
    const input = mountCombobox(
      [
        ['short', 'Short Answer'],
        ['paragraph', 'Paragraph'],
        ['multiple', 'Multiple Choice'],
      ],
      { name: 'type' },
    );
    const res = fillAllForms(document, ctx());
    await flushComboboxFills();
    expect(res.filled).toBe(1);
    expect(input.value.length).toBeGreaterThan(0);
    expect(['Short Answer', 'Paragraph', 'Multiple Choice']).toContain(input.value);
  });

  it('is skipped when the dropdown setting is disabled', async () => {
    const input = mountCombobox([['a', 'A'], ['b', 'B']], { name: 'type' });
    fillAllForms(document, ctx({ select: { enabled: false, strategy: 'random', match: '' } }));
    await flushComboboxFills();
    expect(input.value).toBe('');
  });

  it('honors strategy "first"', async () => {
    const input = mountCombobox([['basic', 'Basic'], ['pro', 'Pro'], ['ent', 'Enterprise']], { name: 'plan' });
    fillAllForms(document, ctx({ select: { enabled: true, strategy: 'first', match: '' } }));
    await flushComboboxFills();
    expect(input.value).toBe('Basic');
  });

  it('honors strategy "match" against a visible option label', async () => {
    const input = mountCombobox(
      [
        ['us', 'United States'],
        ['ca', 'Canada'],
        ['mx', 'Mexico'],
      ],
      { name: 'country' },
    );
    fillAllForms(document, ctx({ select: { enabled: true, strategy: 'match', match: 'Mexico' } }));
    await flushComboboxFills();
    expect(input.value).toBe('Mexico');
  });

  it('coexists with ordinary fields in the same form', async () => {
    setDoc(`<form>
      <input name="title" type="text">
    </form>`);
    const cb = mountCombobox([['a', 'Alpha'], ['b', 'Beta']], { name: 'type' });
    const res = fillAllForms(document, ctx());
    await flushComboboxFills();
    expect(res.filled).toBe(2);
    expect((document.querySelector('[name=title]') as HTMLInputElement).value.length).toBeGreaterThan(0);
    expect(['Alpha', 'Beta']).toContain(cb.value);
  });

  it('fills two comboboxes on the same form (no race)', async () => {
    const a = mountCombobox([['a1', 'A-one'], ['a2', 'A-two']], { listboxId: 'lb-a', name: 'first' });
    const b = mountCombobox([['b1', 'B-one'], ['b2', 'B-two']], { listboxId: 'lb-b', name: 'second' });
    fillAllForms(document, ctx({ select: { enabled: true, strategy: 'first', match: '' } }));
    await flushComboboxFills();
    expect(a.value).toBe('A-one');
    expect(b.value).toBe('B-one');
  });
});

/**
 * Mount a Radix UI Select (shadcn) trigger: <button role=combobox
 * aria-haspopup=listbox aria-controls=…>. Closed => no listbox in the DOM;
 * opening on pointerdown portals a <div role=listbox>; an option commits on
 * pointerup (Radix items have no click handler). Records the committed value
 * on the trigger's dataset so orchestration tests can assert it.
 */
function mountRadixSelect(
  opts: Array<[value: string, label: string]>,
  cfg: { listboxId?: string; name?: string; disabled?: string[] } = {},
): HTMLButtonElement {
  const listboxId = cfg.listboxId ?? 'radix-listbox';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  if (cfg.name) trigger.name = cfg.name;
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-controls', listboxId);
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('data-placeholder', ''); // Radix carries this while empty
  const valueSpan = document.createElement('span');
  valueSpan.textContent = 'Select an option';
  trigger.append(valueSpan);
  const disabled = new Set(cfg.disabled ?? []);
  trigger.addEventListener('pointerdown', () => {
    trigger.setAttribute('aria-expanded', 'true');
    const lb = document.createElement('div');
    lb.id = listboxId;
    lb.setAttribute('role', 'listbox');
    for (const [value, label] of opts) {
      const o = document.createElement('div');
      o.setAttribute('role', 'option');
      o.setAttribute('data-value', value);
      if (disabled.has(value)) o.setAttribute('aria-disabled', 'true');
      o.textContent = label;
      o.addEventListener('pointermove', () => o.setAttribute('data-highlighted', ''));
      o.addEventListener('pointerup', () => {
        trigger.dataset.filledValue = value;
        trigger.dataset.filledLabel = label;
        valueSpan.textContent = label;
        trigger.removeAttribute('data-placeholder'); // Radix drops it once chosen
      });
      lb.append(o);
    }
    document.body.append(lb);
  });
  document.body.append(trigger);
  return trigger;
}

describe('ARIA combobox dropdowns (Radix UI / shadcn Select — button trigger)', () => {
  beforeEach(() => {
    setDoc('');
    _resetComboboxQueue();
  });

  it('discovers a <button role=combobox> (not just inputs)', () => {
    const trigger = mountRadixSelect([['a', 'Apple'], ['b', 'Banana']]);
    expect(discoverFields(document.body)).toContain(trigger);
  });

  it('fills a Radix Select end-to-end by opening it and committing an option', async () => {
    const trigger = mountRadixSelect([['short', 'Short Answer'], ['long', 'Paragraph']], { name: 'type' });
    const res = fillAllForms(document, ctx());
    await flushComboboxFills();
    expect(res.filled).toBe(1);
    expect(['Short Answer', 'Paragraph']).toContain(trigger.dataset.filledLabel);
  });

  it('is skipped when the dropdown setting is disabled', async () => {
    const trigger = mountRadixSelect([['a', 'A'], ['b', 'B']], { name: 'type' });
    fillAllForms(document, ctx({ select: { enabled: false, strategy: 'random', match: '' } }));
    await flushComboboxFills();
    expect(trigger.dataset.filledValue).toBeUndefined();
  });

  it('honors strategy "first"', async () => {
    const trigger = mountRadixSelect([['basic', 'Basic'], ['pro', 'Pro']], { name: 'plan' });
    fillAllForms(document, ctx({ select: { enabled: true, strategy: 'first', match: '' } }));
    await flushComboboxFills();
    expect(trigger.dataset.filledValue).toBe('basic');
  });

  it('honors strategy "match" against a visible option label', async () => {
    const trigger = mountRadixSelect([['us', 'United States'], ['mx', 'Mexico']], { name: 'country' });
    fillAllForms(document, ctx({ select: { enabled: true, strategy: 'match', match: 'Mexico' } }));
    await flushComboboxFills();
    expect(trigger.dataset.filledValue).toBe('mx');
  });

  it('coexists with ordinary fields in the same form', async () => {
    setDoc(`<form><input name="title" type="text"></form>`);
    const trigger = mountRadixSelect([['a', 'Alpha'], ['b', 'Beta']], { name: 'type' });
    document.querySelector('form')!.append(trigger);
    const res = fillAllForms(document, ctx());
    await flushComboboxFills();
    expect(res.filled).toBe(2);
    expect((document.querySelector('[name=title]') as HTMLInputElement).value.length).toBeGreaterThan(0);
    expect(['Alpha', 'Beta']).toContain(trigger.dataset.filledLabel);
  });
});

describe('skipIfSelected — leave already-chosen dropdowns untouched', () => {
  const on = { select: { enabled: true, strategy: 'first' as const, match: '', skipIfSelected: true } };

  beforeEach(() => {
    setDoc('');
    _resetComboboxQueue();
  });

  it('skips a native <select> that already has a value', () => {
    setDoc(`<form>
      <select name="plan"><option value="">Pick</option><option value="basic">Basic</option><option value="pro" selected>Pro</option></select>
    </form>`);
    const sel = document.querySelector('[name=plan]') as HTMLSelectElement;
    expect(sel.value).toBe('pro');
    const res = fillAllForms(document, ctx(on));
    expect(res.filled).toBe(0);
    expect(sel.value).toBe('pro'); // untouched (strategy 'first' would otherwise pick 'basic')
  });

  it('still fills an empty native <select> when skipIfSelected is on', () => {
    setDoc(`<form><select name="plan"><option value="">Pick</option><option value="basic">Basic</option></select></form>`);
    const res = fillAllForms(document, ctx(on));
    expect(res.filled).toBe(1);
    expect((document.querySelector('[name=plan]') as HTMLSelectElement).value).toBe('basic');
  });

  it('re-fills an already-selected <select> when skipIfSelected is off (default)', () => {
    setDoc(`<form>
      <select name="plan"><option value="">Pick</option><option value="basic">Basic</option><option value="pro" selected>Pro</option></select>
    </form>`);
    const res = fillAllForms(document, ctx({ select: { enabled: true, strategy: 'first', match: '', skipIfSelected: false } }));
    expect(res.filled).toBe(1);
    expect((document.querySelector('[name=plan]') as HTMLSelectElement).value).toBe('basic');
  });

  it('skips an input combobox (Mantine) that already has a value', async () => {
    const input = mountCombobox([['a', 'Alpha'], ['b', 'Beta']], { name: 'type' });
    input.value = 'Alpha'; // simulate a pre-existing selection
    const res = fillAllForms(document, ctx(on));
    await flushComboboxFills();
    expect(res.filled).toBe(0);
    expect(input.value).toBe('Alpha'); // untouched
  });

  it('skips a Radix select that already has a selection (no data-placeholder)', async () => {
    const trigger = mountRadixSelect([['a', 'Alpha'], ['b', 'Beta']], { name: 'type' });
    // Simulate Radix's selected state: placeholder removed, a value committed.
    trigger.removeAttribute('data-placeholder');
    trigger.dataset.filledValue = 'a';
    trigger.dataset.filledLabel = 'Alpha';
    const res = fillAllForms(document, ctx({ select: { enabled: true, strategy: 'random', match: '', skipIfSelected: true } }));
    await flushComboboxFills();
    expect(res.filled).toBe(0);
    expect(trigger.getAttribute('aria-expanded')).toBe('false'); // never opened
    expect(trigger.dataset.filledValue).toBe('a'); // unchanged
  });

  it('fills an empty Radix select (data-placeholder present) even with skipIfSelected on', async () => {
    const trigger = mountRadixSelect([['a', 'Alpha'], ['b', 'Beta']], { name: 'type' });
    expect(trigger.hasAttribute('data-placeholder')).toBe(true); // models Radix's empty state
    const res = fillAllForms(document, ctx(on));
    await flushComboboxFills();
    expect(res.filled).toBe(1);
    expect(trigger.dataset.filledValue).toBe('a');
  });

  it('is dropdown-only — does not skip a text field that already has content', () => {
    setDoc(`<form>
      <input name="email" type="email" value="keep@example.com">
      <select name="plan"><option value="">Pick</option><option value="basic">Basic</option><option value="pro" selected>Pro</option></select>
    </form>`);
    const res = fillAllForms(document, ctx(on));
    // Select is skipped (stays 'pro'); the email is re-filled (skipIfSelected
    // governs dropdowns only — the global ignoreFieldsWithContent stays off).
    expect(res.filled).toBe(1);
    expect((document.querySelector('[name=plan]') as HTMLSelectElement).value).toBe('pro');
    expect((document.querySelector('[name=email]') as HTMLInputElement).value).not.toBe('keep@example.com');
  });
});
