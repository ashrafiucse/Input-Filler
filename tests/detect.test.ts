import { describe, it, expect } from 'vitest';
import { detectType, type FieldDescriptor } from '../src/lib/detect';

function input(attrs: Partial<FieldDescriptor> = {}): FieldDescriptor {
  return { tag: 'input', type: 'text', ...attrs };
}

describe('detection priority', () => {
  it('data-fake hint wins over a conflicting name', () => {
    expect(detectType(input({ dataFake: 'email', name: 'first_name' }))).toBe('email');
  });
  it('data-fake="skip" falls through to other signals', () => {
    expect(detectType(input({ dataFake: 'skip', name: 'email' }))).toBe('email');
  });
  it('autocomplete maps correctly', () => {
    expect(detectType(input({ autocomplete: 'given-name' }))).toBe('first_name');
    expect(detectType(input({ autocomplete: 'postal-code' }))).toBe('zip');
    expect(detectType(input({ autocomplete: 'organization' }))).toBe('company');
  });
  it('input type maps correctly', () => {
    expect(detectType(input({ type: 'tel' }))).toBe('phone');
    expect(detectType(input({ type: 'email' }))).toBe('email');
    expect(detectType(input({ type: 'number' }))).toBe('number');
    expect(detectType(input({ type: 'checkbox' }))).toBe('checkbox');
  });
});

describe('regex over attributes', () => {
  it('matches common field names', () => {
    expect(detectType(input({ name: 'username' }))).toBe('username');
    expect(detectType(input({ id: 'zip_code' }))).toBe('zip');
    expect(detectType(input({ name: 'street_address' }))).toBe('street');
    expect(detectType(input({ name: 'company_name' }))).toBe('company');
    expect(detectType(input({ placeholder: 'your phone number' }))).toBe('phone');
  });
  it('full_name is detected before first/last', () => {
    expect(detectType(input({ name: 'full_name' }))).toBe('full_name');
    expect(detectType(input({ name: 'first_name' }))).toBe('first_name');
    expect(detectType(input({ name: 'last_name' }))).toBe('last_name');
  });
});

describe('matchFieldsUsing', () => {
  it('excluding class prevents a class-only match', () => {
    const desc = input({ className: 'email-field', name: 'quantity' });
    expect(detectType(desc)).toBe('email'); // class is matched by default
    expect(detectType(desc, ['name'])).toBe('sentence'); // class ignored -> falls back to sentence
  });
});

describe('element fallback', () => {
  it('textarea with no signals falls back to paragraph', () => {
    expect(detectType({ tag: 'textarea' })).toBe('paragraph');
  });
  it('bare text input falls back to sentence', () => {
    expect(detectType(input({ name: 'q' }))).toBe('sentence');
  });
  it('select falls back to select', () => {
    expect(detectType({ tag: 'select', name: 'country' })).toBe('country'); // name matches first
    expect(detectType({ tag: 'select', name: 'misc' })).toBe('select');
  });
});

describe('textareas always yield readable text', () => {
  it('a textarea with a username-like name is detected as paragraph, not username', () => {
    expect(detectType({ tag: 'textarea', name: 'user_message' })).toBe('paragraph');
    expect(detectType({ tag: 'textarea', name: 'account_notes' })).toBe('paragraph');
    expect(detectType({ tag: 'textarea', name: 'login_hint' })).toBe('paragraph');
  });
  it('a textarea still honors an explicit data-fake hint', () => {
    expect(detectType({ tag: 'textarea', name: 'user_message', dataFake: 'email' })).toBe('email');
  });
});
