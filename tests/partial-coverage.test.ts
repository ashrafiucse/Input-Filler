// Partial-coverage regression suite: the scenarios that previously fell back
// to readable dummy text (approximate fills) — localized labels, Angular
// Material mat-label, multi-label grid rows, and widget-backed hidden selects.
// The contract mirrored from the issue-1 work: every CONFIRMED field fills with
// the best value its signals allow, and readable dummy text only when there
// truly is no signal.

import { describe, it, expect, beforeEach } from 'vitest';
import { fillAllForms } from '../src/lib/orchestrate';
import { describeField, detectType, type FieldDescriptor } from '../src/lib/detect';
import { DEFAULT_SETTINGS, mergeDefaults, type FillerSettings } from '../src/lib/settings';
import { createRng } from '../src/lib/rng';

function setDoc(html: string): void {
  document.documentElement.innerHTML = `<body>${html}</body>`;
}

function inputs(): HTMLInputElement[] {
  return Array.from(document.querySelectorAll('input'));
}

const ctx = (over: Partial<FillerSettings> = {}) => ({
  settings: { ...mergeDefaults(DEFAULT_SETTINGS), ...over },
  rules: [],
  origin: 'https://app.example.com',
  rng: createRng(7),
});

const d = (attrs: Partial<FieldDescriptor>): FieldDescriptor => ({ tag: 'input', type: 'text', ...attrs });

beforeEach(() => setDoc(''));

describe('localized labels (label text not in English, code attrs in English)', () => {
  it('German labels classify like their English equivalents', () => {
    expect(detectType(d({ label: 'Vorname' }))).toBe('first_name');
    expect(detectType(d({ label: 'Nachname' }))).toBe('last_name');
    expect(detectType(d({ label: 'Straße' }))).toBe('street');
    expect(detectType(d({ label: 'Postleitzahl' }))).toBe('zip');
    expect(detectType(d({ label: 'Firma' }))).toBe('company');
    expect(detectType(d({ label: 'Suche' }))).toBe('search');
  });

  it('French / Spanish / Italian / Portuguese / Russian labels classify', () => {
    expect(detectType(d({ label: 'Prénom' }))).toBe('first_name');
    expect(detectType(d({ label: 'Nom de famille' }))).toBe('last_name');
    expect(detectType(d({ label: 'Courriel' }))).toBe('email');
    expect(detectType(d({ label: 'Code postal' }))).toBe('zip');
    expect(detectType(d({ label: 'Nombre' }))).toBe('first_name');
    expect(detectType(d({ label: 'Apellido' }))).toBe('last_name');
    expect(detectType(d({ label: 'Cognome' }))).toBe('last_name');
    expect(detectType(d({ label: 'Empresa' }))).toBe('company');
    expect(detectType(d({ label: 'Город' }))).toBe('city');
    expect(detectType(d({ label: 'Телефон' }))).toBe('phone');
  });

  it('accented and unaccented spellings both match', () => {
    expect(detectType(d({ label: 'Dirección' }))).toBe('street');
    expect(detectType(d({ label: 'Direccion' }))).toBe('street');
    expect(detectType(d({ label: 'Contraseña' }))).toBe('password');
    expect(detectType(d({ label: 'Contrasena' }))).toBe('password');
  });

  it('an English code attribute still wins with a localized label (name/id are English)', () => {
    // The common real-world case: localized visible label, English code attrs.
    expect(detectType(d({ name: 'billing_email', label: 'Courriel' }))).toBe('email');
    expect(detectType(d({ id: 'primaryPhone', label: 'Téléphone' }))).toBe('phone');
  });

  it('a full localized form fills end-to-end with type-correct values', () => {
    setDoc(`
      <form>
        <div class="form-group"><label>Vorname</label><div><input type="text" class="form-control"></div></div>
        <div class="form-group"><label>Nachname</label><div><input type="text" class="form-control"></div></div>
        <div class="form-group"><label>E-Mail</label><div><input type="text" class="form-control"></div></div>
        <div class="form-group"><label>Postleitzahl</label><div><input type="text" class="form-control"></div></div>
      </form>`);
    const res = fillAllForms(document, ctx());
    expect(res.filled).toBe(4);
    const [first, last, email, zip] = inputs() as [HTMLInputElement, HTMLInputElement, HTMLInputElement, HTMLInputElement];
    expect(first.value).toMatch(/^[A-Z][a-z]+$/);
    expect(last.value).toMatch(/^[A-Z][a-z]+$/);
    expect(email.value).toMatch(/@example\.com$/);
    expect(zip.value).toMatch(/^\d{5}/);
  });
});

describe('Angular Material mat-label (label is not a <label> element)', () => {
  it('a mat-form-field with mat-label resolves the label', () => {
    setDoc(`
      <mat-form-field>
        <mat-label>First name</mat-label>
        <input matInput type="text">
      </mat-form-field>
      <mat-form-field>
        <mat-label>Email address</mat-label>
        <input matInput type="text">
      </mat-form-field>`);
    const detected = inputs().map((el) => detectType(describeField(el)));
    expect(detected).toEqual(['first_name', 'email']);
  });
});

describe('multi-label rows (one row, several label+field pairs)', () => {
  it('pairs the k-th label with the k-th input by DOM order', () => {
    setDoc(`
      <div class="row">
        <label>First Name</label><input type="text">
        <label>Last Name</label><input type="text">
      </div>`);
    const detected = inputs().map((el) => detectType(describeField(el)));
    expect(detected).toEqual(['first_name', 'last_name']);
  });

  it('a grid row of two columns with their own labels still pairs', () => {
    setDoc(`
      <div class="form-row">
        <div class="col"><label>Phone</label><input type="text"></div>
        <div class="col"><label>Email</label><input type="text"></div>
      </div>`);
    const detected = inputs().map((el) => detectType(describeField(el)));
    expect(detected).toEqual(['phone', 'email']);
  });

  it('three labels but two inputs stays ambiguous (refuses to guess)', () => {
    setDoc(`
      <div class="row">
        <label>First Name</label><input type="text" id="a">
        <label>Last Name</label><input type="text" id="b">
        <label>Company</label>
      </div>`);
    const a = document.getElementById('a')!;
    const b = document.getElementById('b')!;
    // Counts mismatch -> no pairing; inner col levels have no labels -> no
    // sibling resolution -> readable dummy fallback (confirmed, still filled).
    expect(detectType(describeField(a))).toBe('sentence');
    expect(detectType(describeField(b))).toBe('sentence');
  });
});

describe('widget-backed hidden selects (select2/Chosen/jQuery UI pattern)', () => {
  it('a display:none native select is still filled and fires change', () => {
    setDoc(`
      <form>
        <input name="country" type="text">
        <div class="select2-container" style="display:none">
          <select name="timezone">
            <option value="">Select…</option>
            <option value="cet">CET</option>
            <option value="utc">UTC</option>
          </select>
        </div>
      </form>`);
    const sel = document.querySelector('select') as HTMLSelectElement;
    let changed = 0;
    sel.addEventListener('change', () => changed++);
    const res = fillAllForms(document, ctx());
    expect(res.filled).toBe(2); // text input + hidden select
    expect(['cet', 'utc']).toContain(sel.value);
    expect(changed).toBeGreaterThan(0); // the widget's sync hook fires
  });

  it('hidden TEXT inputs remain honeypot-protected (no regression)', () => {
    setDoc(`
      <form>
        <div style="display:none" aria-hidden="true">
          <input name="honeypot_text" type="text">
        </div>
      </form>`);
    const res = fillAllForms(document, ctx());
    expect(res.filled).toBe(0);
  });
});
