import { describe, it, expect } from 'vitest';
import { detectType, resolveMediaProvider, isSecurityTokenField, isComboboxDesc, isPrelineSelectDesc, type FieldDescriptor } from '../src/lib/detect';

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
  it('select always resolves to select (picks a valid option)', () => {
    // A select is mechanical regardless of name/label: assigning a typed string
    // would usually select nothing, so it is never classified by keyword.
    expect(detectType({ tag: 'select', name: 'country' })).toBe('select');
    expect(detectType({ tag: 'select', name: 'misc' })).toBe('select');
  });
});

describe('Preline UI HSSelect', () => {
  it('a <select data-hs-select> is detected as preline, not a plain select', () => {
    expect(detectType({ tag: 'select', name: 'country', dataHsSelect: '{}' })).toBe('preline');
    expect(detectType({ tag: 'select', name: 'misc', dataHsSelect: '{}' })).toBe('preline');
  });
  it('a select without data-hs-select is still a plain select', () => {
    expect(detectType({ tag: 'select', name: 'country' })).toBe('select');
  });
  it('isPrelineSelectDesc flags only Preline-backed selects', () => {
    expect(isPrelineSelectDesc({ tag: 'select', dataHsSelect: '{}' })).toBe(true);
    expect(isPrelineSelectDesc({ tag: 'select' })).toBe(false);
    expect(isPrelineSelectDesc({ tag: 'input', dataHsSelect: '{}' })).toBe(false);
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

describe('placeholder-shape signals (no keyword needed)', () => {
  it('an email-shaped placeholder implies email', () => {
    expect(detectType(input({ placeholder: 'name@example.com' }))).toBe('email');
    expect(detectType(input({ name: 'instructor_email', placeholder: 'name@example.com' }))).toBe('email');
  });
  it('a URL-shaped placeholder implies url', () => {
    expect(detectType(input({ placeholder: 'https://…' }))).toBe('url');
    expect(detectType(input({ placeholder: 'example.com' }))).toBe('url');
  });
  it('a password-cue placeholder implies password', () => {
    expect(detectType(input({ placeholder: 'Min. 8 characters' }))).toBe('password');
    expect(detectType(input({ placeholder: 'Password' }))).toBe('password');
  });
  it('a non-shape placeholder is ignored (falls through)', () => {
    expect(detectType(input({ placeholder: 'Give it a name' }))).toBe('sentence');
  });
});

describe('keyword-driven content types', () => {
  it('detects content titles (course/chapter/lesson/quiz/assignment)', () => {
    expect(detectType(input({ label: 'Course title', placeholder: 'e.g. Introduction to Web Development' }))).toBe('title');
    expect(detectType(input({ name: 'chapter_title' }))).toBe('title');
    expect(detectType(input({ name: 'lessonName' }))).toBe('title');
    expect(detectType(input({ label: 'Quiz title' }))).toBe('title');
    expect(detectType(input({ placeholder: 'Write Title' }))).toBe('title');
  });
  it('keeps "Job Title" as job_title, not title', () => {
    expect(detectType(input({ label: 'Job Title' }))).toBe('job_title');
  });
  it('detects search/filter inputs', () => {
    expect(detectType(input({ type: 'search' }))).toBe('search');
    expect(detectType(input({ placeholder: 'Search by name or email…' }))).toBe('search');
    expect(detectType(input({ name: 'q', placeholder: 'Search tenants…' }))).toBe('search');
  });
  it('detects subdomain/slug fields', () => {
    expect(detectType(input({ label: 'Subdomain', placeholder: 'your-platform' }))).toBe('subdomain');
    expect(detectType(input({ name: 'slug' }))).toBe('subdomain');
  });
  it('detects tax-name and learning-objective fields', () => {
    expect(detectType(input({ label: 'Tax name', placeholder: 'VAT, GST, Sales Tax' }))).toBe('tax_name');
    expect(detectType(input({ label: 'Learning objective', placeholder: 'Objective 1, e.g. …' }))).toBe('objective');
  });
  it('detects platform/tenant/academy names as company', () => {
    expect(detectType(input({ label: 'Platform name', placeholder: 'Annoor academy…' }))).toBe('company');
    expect(detectType(input({ name: 'tenant_name' }))).toBe('company');
  });
});

describe('embed / custom-code fields', () => {
  it('a textarea with an <iframe> placeholder is embed, not paragraph', () => {
    expect(detectType({ tag: 'textarea', placeholder: '<iframe width="560" …></iframe>' })).toBe('embed');
  });
  it('a custom-HTML/CSS/JS textarea is embed', () => {
    expect(detectType({ tag: 'textarea', placeholder: 'Paste your custom HTML, CSS, and JavaScript here...' })).toBe('embed');
  });
  it('an input asking for a video URL is video_url, not a generic url', () => {
    expect(detectType(input({ placeholder: 'Paste YouTube, Vimeo, or Loom URL here...' }))).toBe('video_url');
  });
});

describe('media provider detection (video / audio)', () => {
  it('a YouTube/Vimeo link field (even type=url) is video_url', () => {
    expect(detectType(input({ type: 'url', placeholder: 'Paste YouTube URL' }))).toBe('video_url');
    expect(detectType(input({ label: 'Vimeo link' }))).toBe('video_url');
  });
  it('a Spotify/SoundCloud link field is audio_url', () => {
    expect(detectType(input({ label: 'Spotify URL' }))).toBe('audio_url');
    expect(detectType(input({ placeholder: 'Paste SoundCloud track link…' }))).toBe('audio_url');
  });
  it('all embed iframes resolve to embed (provider chosen at fill time)', () => {
    expect(detectType({ tag: 'textarea', placeholder: '<iframe src="https://open.spotify.com/embed/album/…"></iframe>' })).toBe('embed');
    expect(detectType({ tag: 'textarea', placeholder: '<iframe src="https://www.youtube.com/embed/…"></iframe>' })).toBe('embed');
    expect(detectType({ tag: 'textarea', placeholder: '<iframe src="https://player.vimeo.com/video/…"></iframe>' })).toBe('embed');
  });
  it('a generic website URL is still url (not media)', () => {
    expect(detectType(input({ label: 'Website', type: 'url' }))).toBe('url');
  });
});

describe('card fields (checkout)', () => {
  it('autocomplete cc-* maps to card types', () => {
    expect(detectType(input({ autocomplete: 'cc-number' }))).toBe('cc_number');
    expect(detectType(input({ autocomplete: 'cc-exp' }))).toBe('cc_exp');
    expect(detectType(input({ autocomplete: 'cc-csc' }))).toBe('cc_csc');
  });
  it('detects card fields by label/name/aria without autocomplete', () => {
    expect(detectType(input({ name: 'cardNumber', ariaLabel: 'Card number', placeholder: '1234 1234 1234 1234' }))).toBe('cc_number');
    expect(detectType(input({ ariaLabel: 'Expiration', placeholder: 'MM / YY' }))).toBe('cc_exp');
    expect(detectType(input({ name: 'cardCvc', ariaLabel: 'CVC', placeholder: 'CVC' }))).toBe('cc_csc');
  });
  it('a numeric-inputmode CVC is cc_csc, not a generic number', () => {
    expect(detectType(input({ type: 'text', inputMode: 'numeric', name: 'cardCvc', ariaLabel: 'CVC' }))).toBe('cc_csc');
  });
  it('a bare numeric inputmode (no card signal) is still number', () => {
    expect(detectType(input({ type: 'text', inputMode: 'numeric', name: 'quantity' }))).toBe('number');
  });
});

describe('resolveMediaProvider (named provider wins)', () => {
  it('returns the named provider', () => {
    expect(resolveMediaProvider(input({ label: 'YouTube embed' }))).toBe('youtube');
    expect(resolveMediaProvider(input({ placeholder: 'Paste Vimeo URL' }))).toBe('vimeo');
    expect(resolveMediaProvider(input({ name: 'spotify_track' }))).toBe('spotify');
    expect(resolveMediaProvider(input({ label: 'SoundCloud' }))).toBe('soundcloud');
  });
  it('returns undefined when no provider is named', () => {
    expect(resolveMediaProvider(input({ label: 'Embed code' }))).toBeUndefined();
    expect(resolveMediaProvider(input({ placeholder: 'Paste a video URL' }))).toBeUndefined();
  });
});

describe('security token fields', () => {
  it('flags CSRF / anti-forgery / nonce token field names and ids', () => {
    expect(isSecurityTokenField(input({ name: '_token' }))).toBe(true);
    expect(isSecurityTokenField(input({ name: 'csrfmiddlewaretoken' }))).toBe(true);
    expect(isSecurityTokenField(input({ id: 'authenticity_token' }))).toBe(true);
    expect(isSecurityTokenField(input({ name: '__RequestVerificationToken' }))).toBe(true);
    expect(isSecurityTokenField(input({ name: 'wpnonce' }))).toBe(true);
  });
  it('does not flag ordinary fillable fields', () => {
    expect(isSecurityTokenField(input({ name: 'email' }))).toBe(false);
    expect(isSecurityTokenField(input({ name: 'first_name' }))).toBe(false);
    expect(isSecurityTokenField(input({ name: 'cardNumber' }))).toBe(false);
    expect(isSecurityTokenField(input({ name: 'cardCvc' }))).toBe(false);
  });
});

describe('inputmode signals (library-rendered inputs)', () => {
  it('a Mantine NumberInput (type=text, inputmode=decimal) is a number', () => {
    // Exact shape reported in the wild: Mantine renders NumberInput as a text
    // input carrying inputmode="decimal". type="text" alone yields nothing, so
    // without inputmode this field fell through to a sentence and was rejected.
    expect(
      detectType(
        input({
          type: 'text',
          inputMode: 'decimal',
          className: 'm_8fb7ebe7 mantine-Input-input mantine-NumberInput-input',
          id: 'mantine-mqt873yg0',
        }),
      ),
    ).toBe('number');
  });
  it('decimal / numeric inputmode -> number', () => {
    expect(detectType(input({ inputMode: 'decimal' }))).toBe('number');
    expect(detectType(input({ inputMode: 'numeric' }))).toBe('number');
    expect(detectType(input({ inputMode: 'DECIMAL' }))).toBe('number'); // case-insensitive
  });
  it('tel / email / url / search inputmode map like their input type', () => {
    expect(detectType(input({ inputMode: 'tel' }))).toBe('phone');
    expect(detectType(input({ inputMode: 'email' }))).toBe('email');
    expect(detectType(input({ inputMode: 'url' }))).toBe('url');
    expect(detectType(input({ inputMode: 'search' }))).toBe('search');
  });
  it('an explicit input type beats inputmode', () => {
    expect(detectType(input({ type: 'email', inputMode: 'decimal' }))).toBe('email');
  });
  it('a text inputmode (or none) does not change the fallback', () => {
    expect(detectType(input({ inputMode: 'text', name: 'q' }))).toBe('sentence');
    expect(detectType(input({ name: 'q' }))).toBe('sentence');
  });
});

describe('ARIA combobox dropdowns (Mantine/MUI/Chakra Select)', () => {
  it('is flagged by role=combobox', () => {
    expect(isComboboxDesc(input({ role: 'combobox' }))).toBe(true);
    expect(detectType(input({ role: 'combobox', name: 'question_type' }))).toBe('combobox');
  });
  it('is flagged by aria-haspopup=listbox', () => {
    expect(isComboboxDesc(input({ ariaHaspopup: 'listbox' }))).toBe(true);
    expect(detectType(input({ ariaHaspopup: 'listbox' }))).toBe('combobox');
  });
  it('is flagged by readonly + aria-controls (Mantine Select pattern)', () => {
    // Exact signal in the reported Mantine markup: a readonly text input whose
    // aria-controls points at the portal listbox.
    expect(isComboboxDesc(input({ readOnly: true, ariaControls: 'mantine-9nrv5kdt9' }))).toBe(true);
    expect(detectType(input({ readOnly: true, ariaControls: 'mantine-9nrv5kdt9' }))).toBe('combobox');
  });
  it('combobox beats keyword/autocomplete detection (picks a real option, never a typed string)', () => {
    // A "country" combobox is mechanical: it must not receive the literal
    // string "Germany" the way a text input would.
    expect(detectType(input({ role: 'combobox', name: 'country' }))).toBe('combobox');
    expect(detectType(input({ ariaHaspopup: 'listbox', autocomplete: 'country-name' }))).toBe('combobox');
  });
  it('a plain readonly input (no listbox) is NOT a combobox', () => {
    expect(isComboboxDesc(input({ readOnly: true }))).toBe(false);
    expect(isComboboxDesc(input({ name: 'q' }))).toBe(false);
    // aria-haspopup of menu/grid/tree is a different widget, not a listbox select.
    expect(isComboboxDesc(input({ ariaHaspopup: 'menu' }))).toBe(false);
  });
  it('is flagged on a <button>/<div> trigger (Radix UI / shadcn Select)', () => {
    // Radix Select renders the trigger as <button role="combobox">, not an input;
    // detection must not gate on tag=input.
    expect(isComboboxDesc({ tag: 'button', role: 'combobox' } as FieldDescriptor)).toBe(true);
    expect(detectType({ tag: 'button', role: 'combobox' } as FieldDescriptor)).toBe('combobox');
    expect(detectType({ tag: 'button', ariaHaspopup: 'listbox' } as FieldDescriptor)).toBe('combobox');
    expect(detectType({ tag: 'div', role: 'combobox' } as FieldDescriptor)).toBe('combobox');
  });
  it('a plain button (no listbox signals) is not misclassified as a combobox', () => {
    expect(detectType({ tag: 'button', type: 'submit' } as FieldDescriptor)).not.toBe('combobox');
  });
  it('a contenteditable with role=combobox stays paragraph (rich-text guard)', () => {
    expect(detectType({ tag: 'div', role: 'combobox', isContentEditable: true } as FieldDescriptor)).toBe('paragraph');
  });
});
