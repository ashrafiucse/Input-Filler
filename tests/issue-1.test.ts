// Regression coverage for GitHub issue #1: a Vue app (KeenThemes/Bootstrap
// horizontal form layout) where inputs carry no name/id/autocomplete and the
// labels sit in sibling columns, never associated via for/id. Also covers the
// partial-match regex strategy and fill-pass exception isolation that shipped
// with the fix.

import { describe, it, expect, beforeEach } from 'vitest';
import { fillAllForms } from '../src/lib/orchestrate';
import { describeField, detectType, type FieldDescriptor } from '../src/lib/detect';
import { DEFAULT_SETTINGS, mergeDefaults, type FillerSettings } from '../src/lib/settings';
import { createRng } from '../src/lib/rng';

// Exact markup shape from the issue: label and input are SIBLINGS inside a
// Bootstrap .form-group row; the input has only type/class (and, for the
// contact fields, a keyword placeholder). No for/id/name/autocomplete anywhere.
const ISSUE_HTML = `
<div class="kt-section__body">
  <div class="form-group row required">
    <label class="col-xl-3 col-lg-3 col-form-label">First Name</label>
    <div class="col-lg-9 col-xl-6"><input type="text" class="form-control"></div>
  </div>
  <div class="form-group row required">
    <label class="col-xl-3 col-lg-3 col-form-label">Last Name</label>
    <div class="col-lg-9 col-xl-6"><input type="text" class="form-control"></div>
  </div>
  <div class="form-group row">
    <label class="col-xl-3 col-lg-3 col-form-label">Company Name</label>
    <div class="col-lg-9 col-xl-6"><input type="text" class="form-control"></div>
  </div>
  <div class="form-group row required">
    <label class="col-xl-3 col-lg-3 col-form-label"> Contact Phone </label>
    <div class="col-lg-9 col-xl-6"><div class="input-group"><div class="input-group-prepend"><span class="input-group-text"><i class="la la-phone"></i></span></div><input type="text" placeholder="Phone" aria-describedby="basic-addon1" class="form-control"></div></div>
  </div>
  <div class="form-group row required">
    <label class="col-xl-3 col-lg-3 col-form-label"> Email Address </label>
    <div class="col-lg-9 col-xl-6"><div class="input-group"><div class="input-group-prepend"><span class="input-group-text"><i class="la la-at"></i></span></div><input type="text" placeholder="Email" aria-describedby="basic-addon1" class="form-control"></div></div>
  </div>
  <div class="form-group row">
    <label class="col-xl-3 col-lg-3 col-form-label"> Alternative Email </label>
    <div class="col-lg-9 col-xl-6"><div class="input-group"><div class="input-group-prepend"><span class="input-group-text"><i class="la la-at"></i></span></div><input type="text" placeholder="Email" aria-describedby="basic-addon1" class="form-control"></div></div>
  </div>
</div>`;

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

beforeEach(() => setDoc(ISSUE_HTML));

describe('issue #1 — sibling column labels (Bootstrap horizontal rows)', () => {
  it('resolves the sibling label for every field and detects the right type', () => {
    const detected = inputs().map((el) => detectType(describeField(el)));
    expect(detected).toEqual([
      'first_name', // label "First Name" (sibling column)
      'last_name', // label "Last Name"
      'company', // label "Company Name"
      'phone', // label "Contact Phone" (+ placeholder "Phone")
      'email', // label "Email Address" (+ placeholder "Email")
      'email', // label "Alternative Email"
    ]);
  });

  it('fills every field with type-appropriate values (nothing left a sentence)', () => {
    const res = fillAllForms(document, ctx());
    expect(res.filled).toBe(6);
    expect(res.skipped).toBe(0);
    const [first, last, company, phone, email, alt] = inputs() as [
      HTMLInputElement,
      HTMLInputElement,
      HTMLInputElement,
      HTMLInputElement,
      HTMLInputElement,
      HTMLInputElement,
    ];
    // Names: a single capitalized word, not filler prose.
    expect(first.value).toMatch(/^[A-Z][a-z]+$/);
    expect(last.value).toMatch(/^[A-Z][a-z]+$/);
    // Company: two capitalized words.
    expect(company.value).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    expect(phone.value).toMatch(/\d{3}/);
    expect(email.value).toMatch(/@example\.com$/);
    expect(alt.value).toMatch(/@example\.com$/);
    // No identity field received filler prose (a readable sentence).
    for (const el of [first, last, company] as HTMLInputElement[]) expect(el.value.endsWith('.')).toBe(false);
  });

  it('does not mislabel when a row has two candidate labels (ambiguous)', () => {
    setDoc(`
      <div class="form-group row">
        <label>First Name</label>
        <div><input type="text" class="form-control" id="ambiguous"></div>
        <label>Other</label>
      </div>`);
    const el = document.getElementById('ambiguous')!;
    // The single-ancestor level holds 2 labels -> sibling resolution refuses
    // (stops climbing) rather than guessing; falls back to readable dummy text.
    expect(detectType(describeField(el))).toBe('sentence');
  });

  it('ignores a sibling label whose for= points at a different control', () => {
    setDoc(`
      <div class="form-group">
        <label for="elsewhere">First Name</label>
        <div><input type="text" class="form-control" id="target"></div>
      </div>`);
    const el = document.getElementById('target')!;
    expect(detectType(describeField(el))).toBe('sentence');
  });

  it('associates label text even with no other signal (email/phone without placeholders)', () => {
    setDoc(`
      <div class="form-group row">
        <label class="col-form-label">Contact Phone</label>
        <div class="col"><input type="text" class="form-control"></div>
      </div>
      <div class="form-group row">
        <label class="col-form-label">Email Address</label>
        <div class="col"><input type="text" class="form-control"></div>
      </div>`);
    const detected = inputs().map((el) => detectType(describeField(el)));
    expect(detected).toEqual(['phone', 'email']);
  });
});

describe('partial-match detection (normalized haystack)', () => {
  const d = (attrs: Partial<FieldDescriptor>): FieldDescriptor => ({ tag: 'input', type: 'text', ...attrs });

  it('camelCase names match via partial keywords', () => {
    expect(detectType(d({ name: 'userEmailField' }))).toBe('email');
    expect(detectType(d({ name: 'phoneNumber' }))).toBe('phone');
    expect(detectType(d({ name: 'searchTerm' }))).toBe('search');
    expect(detectType(d({ name: 'customerFullName' }))).toBe('full_name');
    expect(detectType(d({ name: 'contactZipCode' }))).toBe('zip');
    expect(detectType(d({ name: 'organizationName' }))).toBe('company');
  });

  it('kebab/snake/concatenated fragments match', () => {
    expect(detectType(d({ id: 'user-email' }))).toBe('email');
    expect(detectType(d({ id: 'cell-no' }))).toBe('phone');
    expect(detectType(d({ placeholder: 'your e-mail here' }))).toBe('email');
    expect(detectType(d({ name: 'firstname' }))).toBe('first_name');
    expect(detectType(d({ name: 'lastname' }))).toBe('last_name');
  });

  it('partial label text matches ("Alternative Email" -> email)', () => {
    expect(detectType(d({ label: 'Alternative Email' }))).toBe('email');
    expect(detectType(d({ label: 'Your Contact Number' }))).toBe('phone');
    expect(detectType(d({ label: 'Company / Organization' }))).toBe('company');
  });

  it('guards collision-prone tokens ("estimated" is not a state, "contact person" is not a phone)', () => {
    expect(detectType(d({ name: 'estimatedTotal' }))).toBe('sentence');
    expect(detectType(d({ name: 'estimated_delivery' }))).toBe('sentence');
    expect(detectType(d({ name: 'contact_person' }))).toBe('sentence');
    expect(detectType(d({ name: 'state' }))).toBe('state');
    expect(detectType(d({ name: 'province' }))).toBe('state');
  });

  it('a card number field named in camelCase is still detected', () => {
    expect(detectType(d({ name: 'cardNumberInput' }))).toBe('cc_number');
  });
});

describe('fill-pass exception isolation', () => {
  it('one throwing field does not abort the pass; the rest still fill', () => {
    setDoc(`
      <form>
        <input id="a" name="email" type="text">
        <input id="poison" name="anything" type="text">
        <input id="b" name="phone" type="text">
      </form>`);
    const poison = document.getElementById('poison')!;
    // Simulate a poisoned framework field: any value resolution touching it throws.
    Object.defineProperty(poison, 'maxLength', {
      get() {
        throw new Error('poisoned field');
      },
    });
    const res = fillAllForms(document, ctx());
    expect(res.filled).toBe(2);
    expect((document.getElementById('a') as HTMLInputElement).value).toMatch(/@example\.com$/);
    expect((document.getElementById('b') as HTMLInputElement).value).toMatch(/\d{3}/);
    expect((poison as HTMLInputElement).value).toBe('');
  });
});

describe('unknown-but-confirmed inputs always get readable dummy text', () => {
  it('a signal-less text input receives a readable sentence, never stays empty', () => {
    setDoc(`<form><input type="text" class="form-control"><input type="text"></form>`);
    const res = fillAllForms(document, ctx());
    expect(res.filled).toBe(2);
    for (const el of inputs()) {
      expect(el.value.trim().length).toBeGreaterThan(10);
      expect(el.value.endsWith('.')).toBe(true); // readable prose, not gibberish
    }
  });

  it('a dropdown with options always gets a selection', () => {
    setDoc(`<form><select class="form-control"><option value="">Choose…</option><option value="bd">Bangladesh</option><option value="us">United States</option></select></form>`);
    const res = fillAllForms(document, ctx());
    expect(res.filled).toBe(1);
    const sel = document.querySelector('select') as HTMLSelectElement;
    expect(['bd', 'us']).toContain(sel.value);
  });
});
