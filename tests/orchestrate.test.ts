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
