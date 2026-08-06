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
  it('select always resolves to select (picks a valid option)', () => {
    // A select is mechanical regardless of name/label: assigning a typed string
    // would usually select nothing, so it is never classified by keyword.
    expect(detectType({ tag: 'select', name: 'country' })).toBe('select');
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
  it('a Spotify/SoundCloud embed iframe is audio_embed', () => {
    expect(detectType({ tag: 'textarea', placeholder: '<iframe src="https://open.spotify.com/embed/album/…"></iframe>' })).toBe('audio_embed');
    expect(detectType({ tag: 'textarea', placeholder: '<iframe src="https://w.soundcloud.com/player/?url=…"></iframe>' })).toBe('audio_embed');
  });
  it('a YouTube/Vimeo embed iframe is embed (video)', () => {
    expect(detectType({ tag: 'textarea', placeholder: '<iframe src="https://www.youtube.com/embed/…"></iframe>' })).toBe('embed');
    expect(detectType({ tag: 'textarea', placeholder: '<iframe src="https://player.vimeo.com/video/…"></iframe>' })).toBe('embed');
  });
  it('a generic website URL is still url (not media)', () => {
    expect(detectType(input({ label: 'Website', type: 'url' }))).toBe('url');
  });
});
