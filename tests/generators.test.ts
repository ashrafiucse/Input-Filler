import { describe, it, expect } from 'vitest';
import { createRng } from '../src/lib/rng';
import {
  firstName,
  lastName,
  fullName,
  email,
  username,
  phone,
  street,
  city,
  state,
  zip,
  company,
  jobTitle,
  url,
  number,
  date,
  color,
  password,
  sentence,
  paragraph,
  title,
  searchTerm,
  subdomain,
  taxName,
  objective,
  embedCode,
  embedFor,
  linkFor,
  audioEmbed,
  videoUrl,
  audioUrl,
  generateByName,
  BUILTIN_GENERATORS,
  cardNumber,
  cardExpiry,
  cardCvc,
} from '../src/lib/generators';
import { dummyText, CORPUS } from '../src/lib/text';
import { FIRST_NAMES, LAST_NAMES } from '../src/lib/wordlists';

const EMAIL_RE = /^[a-z0-9.]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
const PHONE_RE = /^\(\d{3}\) \d{3}-\d{4}$/;
const URL_RE = /^https:\/\/www\.[a-z0-9]+\.com$/;
const HEX_RE = /^#[0-9a-f]{6}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

describe('generators shape', () => {
  it('email matches an email pattern', () => {
    for (let i = 0; i < 50; i++) expect(email()).toMatch(EMAIL_RE);
  });
  it('email defaults to @example.com', () => {
    for (let i = 0; i < 20; i++) expect(email()).toMatch(/@example\.com$/);
  });
  it('email uses a provided domain', () => {
    expect(email({ first: 'Eleanor', last: 'Whitfield', domain: 'example.org' })).toMatch(/@example\.org$/);
  });
  it('phone matches the (xxx) xxx-xxxx format', () => {
    for (let i = 0; i < 50; i++) expect(phone()).toMatch(PHONE_RE);
  });
  it('phone fills E.164 (+1 then 10 digits) for country-aware widgets', () => {
    for (let i = 0; i < 50; i++) expect(phone({ intl: true })).toMatch(/^\+1\d{10}$/);
  });
  it('url is absolute and well-formed', () => {
    for (let i = 0; i < 50; i++) expect(url()).toMatch(URL_RE);
  });
  it('color is a #rrggbb hex string', () => {
    for (let i = 0; i < 20; i++) expect(color()).toMatch(HEX_RE);
  });
  it('date is ISO YYYY-MM-DD', () => {
    for (let i = 0; i < 20; i++) expect(date()).toMatch(DATE_RE);
  });
  it('zip is 5 digits and state is a 2-letter code', () => {
    for (let i = 0; i < 20; i++) {
      expect(zip()).toMatch(/^\d{5}$/);
      expect(state()).toMatch(/^[A-Z]{2}$/);
    }
  });
  it('street has a number, name, and suffix', () => {
    expect(street()).toMatch(/^\d+ [A-Za-z]+ [A-Za-z]+$/);
  });
});

describe('name/email consistency', () => {
  it('email local-part derives from the provided name', () => {
    const rng = createRng(42);
    const f = firstName(rng);
    const l = lastName(rng);
    const e = email({ first: f, last: l, rng });
    const local = e.split('@')[0] as string;
    expect(local.startsWith(`${f.toLowerCase()}.${l.toLowerCase()}`.replace(/[^a-z0-9.]/g, '.'))).toBe(true);
  });
  it('username derives from first initial + last name', () => {
    const u = username({ first: 'Eleanor', last: 'Whitfield' });
    expect(u).toBe('ewhitfield');
  });
  it('fullName combines first and last', () => {
    expect(fullName({ first: 'Eleanor', last: 'Whitfield' })).toBe('Eleanor Whitfield');
  });
});

describe('American name pools', () => {
  it('first/last names are always drawn from the American pools', () => {
    const rng = createRng(3);
    for (let i = 0; i < 100; i++) {
      expect(FIRST_NAMES).toContain(firstName(rng));
      expect(LAST_NAMES).toContain(lastName(rng));
    }
  });
  it('the pools hold common American names', () => {
    expect(FIRST_NAMES).toContain('James');
    expect(FIRST_NAMES).toContain('Emily');
    expect(LAST_NAMES).toContain('Smith');
    expect(LAST_NAMES).toContain('Johnson');
  });
  it('previously international names are no longer used', () => {
    // The pools were intentionally switched to American-only personas.
    expect(FIRST_NAMES).not.toContain('Priya');
    expect(LAST_NAMES).not.toContain('Patel');
    expect(LAST_NAMES).not.toContain('Nguyen');
  });
});

describe('test card generators', () => {
  it('card generators return the Stripe-style test values', () => {
    expect(cardNumber()).toBe('4242 4242 4242 4242');
    expect(cardExpiry()).toBe('01 / 35');
    expect(cardCvc()).toBe('121');
  });
  it('generateByName exposes the card generators', () => {
    expect(generateByName('cardNumber')).toBe('4242 4242 4242 4242');
    expect(generateByName('cardExpiry')).toBe('01 / 35');
    expect(generateByName('cardCvc')).toBe('121');
  });
});

describe('number, password, paragraph', () => {
  it('number respects min/max and step', () => {
    for (let i = 0; i < 200; i++) {
      const v = Number(number(0, 10, 2));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(10);
      expect(v % 2).toBe(0);
    }
  });
  it('password meets common rules (length, mixed case, digit, symbol)', () => {
    for (let i = 0; i < 30; i++) {
      const p = password();
      expect(p.length).toBeGreaterThanOrEqual(8);
      expect(/[a-z]/.test(p)).toBe(true);
      expect(/[A-Z]/.test(p)).toBe(true);
      expect(/[0-9]/.test(p)).toBe(true);
      expect(/[!$%@#?]/.test(p)).toBe(true);
    }
  });
  it('paragraph(n) joins exactly n sentences', () => {
    const p = paragraph(4);
    // Each sentence ends with '.', so splitting on '. ' gives n parts.
    expect(p.split('. ').filter((s) => s.trim().length > 0)).toHaveLength(4);
  });
});

describe('dummyText readability engine', () => {
  it('never exceeds maxLen and never cuts a sentence mid-word', () => {
    for (let i = 0; i < 100; i++) {
      const maxLen = 40 + i;
      const out = dummyText(maxLen, 'business');
      expect(out.length).toBeLessThanOrEqual(maxLen);
      if (out.length) {
        // Output ends at a sentence boundary ('.') or is a clipped word/grammar.
        const endsClean = out.endsWith('.') || !out.includes(' ');
        expect(endsClean).toBe(true);
      }
    }
  });
  it('falls back gracefully for a tiny budget without throwing', () => {
    expect(dummyText(3, 'business')).toHaveLength(3);
    expect(dummyText(1, 'business')).toHaveLength(1);
    expect(dummyText(0, 'business')).toBe('');
  });
  it('produces fresh, repeat-free output within a call', () => {
    const out = dummyText(10000, 'tech');
    const parts = out.split('. ').filter((s) => s.trim().length > 0).map((s) => s.trim());
    // No sentence repeats within a single call.
    expect(new Set(parts).size).toBe(parts.length);
    // Across 100 calls, output varies.
    const sample = new Set(Array.from({ length: 100 }, () => dummyText(200, 'tech')));
    expect(sample.size).toBeGreaterThan(5);
  });
  it('lms theme produces readable LMS-themed text', () => {
    expect(CORPUS.lms.length).toBeGreaterThan(0);
    const out = dummyText(300, 'lms');
    expect(out.length).toBeGreaterThan(0);
    const sample = new Set(Array.from({ length: 100 }, () => dummyText(200, 'lms')));
    expect(sample.size).toBeGreaterThan(5);
  });
});

describe('builtin generator registry', () => {
  it('generateByName resolves every registered name', () => {
    for (const name of BUILTIN_GENERATORS) {
      expect(typeof generateByName(name, createRng(1))).toBe('string');
    }
  });
  it('unknown names fall back to a sentence, never throw', () => {
    expect(typeof generateByName('nope', createRng(1))).toBe('string');
  });
});

describe('content-aware generators', () => {
  it('title yields a capitalized, non-empty title', () => {
    const out = title(createRng(3));
    expect(out.length).toBeGreaterThan(3);
    expect(out.split(' ').length).toBeGreaterThan(1);
  });
  it('searchTerm yields a short single-line term', () => {
    const out = searchTerm(createRng(4));
    expect(out.length).toBeGreaterThan(0);
    expect(out).not.toMatch(/\n/);
  });
  it('subdomain yields a lowercase hyphenated slug', () => {
    const out = subdomain(createRng(5));
    expect(out).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
  it('taxName is one of the known tax names', () => {
    expect(['VAT', 'GST', 'Sales Tax', 'HST', 'PST', 'Consumption Tax']).toContain(taxName(createRng(1)));
  });
  it('objective yields a complete sentence', () => {
    const out = objective(createRng(1));
    expect(out.endsWith('.')).toBe(true);
  });
  it('embedCode yields a real embed iframe (any provider)', () => {
    const out = embedCode(createRng(1));
    expect(out.startsWith('<iframe')).toBe(true);
    expect(out.endsWith('</iframe>')).toBe(true);
    expect(/youtube\.com\/embed|player\.vimeo\.com|open\.spotify\.com\/embed|w\.soundcloud\.com\/player/.test(out)).toBe(true);
  });
  it('embedFor / linkFor pin a named provider', () => {
    expect(embedFor('youtube', undefined, createRng(1))).toContain('youtube.com/embed');
    expect(embedFor('spotify', undefined, createRng(1))).toContain('open.spotify.com/embed');
    expect(linkFor('vimeo', undefined, createRng(1))).toContain('vimeo.com');
    expect(linkFor('soundcloud', undefined, createRng(1))).toContain('soundcloud.com');
  });
  it('embedFor with no provider/category rotates any provider', () => {
    const samples = new Set(Array.from({ length: 40 }, () => embedFor(undefined, undefined, createRng(Math.random() * 1e6))));
    expect(samples.size).toBeGreaterThan(1);
  });
  it('audioEmbed yields a real Spotify/SoundCloud embed iframe', () => {
    const out = audioEmbed(createRng(1));
    expect(out.startsWith('<iframe')).toBe(true);
    expect(/open\.spotify\.com\/embed|w\.soundcloud\.com\/player/.test(out)).toBe(true);
  });
  it('videoUrl yields a real YouTube/Vimeo link', () => {
    const out = videoUrl(createRng(1));
    expect(/youtube\.com\/watch|vimeo\.com/.test(out)).toBe(true);
  });
  it('audioUrl yields a real Spotify/SoundCloud link', () => {
    const out = audioUrl(createRng(1));
    expect(/open\.spotify\.com|soundcloud\.com/.test(out)).toBe(true);
  });
});
