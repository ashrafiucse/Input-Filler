// Readable data generators. Each is a pure function returning a string (or
// value shaped for filling). All accept an optional rng so tests can seed
// deterministic sequences; the default rng keeps every real fill fresh.

import { pick, char, int, type Rng, defaultRng } from './rng';
import {
  FIRST_NAMES,
  LAST_NAMES,
  CITIES,
  STATES,
  STREET_NAMES,
  STREET_SUFFIXES,
  COMPANY_PREFIXES,
  COMPANY_SUFFIXES,
  JOB_TITLES,
  DOMAINS,
  COUNTRIES,
  TITLE_TOPICS,
  TITLE_TOOLS,
  TITLE_PREFIXES,
  SEARCH_TOKENS,
  TAX_NAMES,
  OBJECTIVES,
} from './wordlists';
import { dummyText, randomSentence, type TextTheme } from './text';
import type { MediaProvider } from './detect';

export type { TextTheme } from './text';
export { dummyText } from './text';

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
}

export interface NameOpts {
  first?: string;
  last?: string;
  domain?: string;
  rng?: Rng;
}

export function firstName(rng: Rng = defaultRng): string {
  return pick(FIRST_NAMES, rng);
}
export function lastName(rng: Rng = defaultRng): string {
  return pick(LAST_NAMES, rng);
}

export function fullName(opts: NameOpts = {}): string {
  const rng = opts.rng ?? defaultRng;
  const first = opts.first ?? firstName(rng);
  const last = opts.last ?? lastName(rng);
  return `${first} ${last}`;
}

export function email(opts: NameOpts = {}): string {
  const rng = opts.rng ?? defaultRng;
  const first = slug(opts.first ?? firstName(rng));
  const last = slug(opts.last ?? lastName(rng));
  const n = int(1, 999, 1, rng);
  const domain = opts.domain ?? 'example.com';
  return `${first}.${last}${n}@${domain}`;
}

export function username(opts: NameOpts = {}): string {
  const rng = opts.rng ?? defaultRng;
  const first = (opts.first ?? firstName(rng)).toLowerCase();
  const last = (opts.last ?? lastName(rng)).toLowerCase();
  return `${first.charAt(0)}${last}`.replace(/[^a-z0-9]/g, '');
}

export function phone(rng: Rng = defaultRng): string {
  const area = int(201, 989, 1, rng);
  const prefix = int(200, 999, 1, rng);
  const line = String(int(0, 9999, 1, rng)).padStart(4, '0');
  return `(${area}) ${prefix}-${line}`;
}

export function street(rng: Rng = defaultRng): string {
  return `${int(100, 9999, 1, rng)} ${pick(STREET_NAMES, rng)} ${pick(STREET_SUFFIXES, rng)}`;
}
export function city(rng: Rng = defaultRng): string {
  return pick(CITIES, rng);
}
export function state(rng: Rng = defaultRng): string {
  return pick(STATES, rng);
}
export function zip(rng: Rng = defaultRng): string {
  return String(int(501, 99950, 1, rng)).padStart(5, '0');
}
export function country(rng: Rng = defaultRng): string {
  return pick(COUNTRIES, rng);
}

export interface CompanyOpts {
  company?: string;
  rng?: Rng;
}
export function company(rng: Rng = defaultRng): string {
  return `${pick(COMPANY_PREFIXES, rng)} ${pick(COMPANY_SUFFIXES, rng)}`;
}
export function jobTitle(rng: Rng = defaultRng): string {
  return pick(JOB_TITLES, rng);
}
export function url(opts: CompanyOpts = {}): string {
  const rng = opts.rng ?? defaultRng;
  const c = opts.company ?? company(rng);
  const host = slug(c).replace(/\./g, '') + '.com';
  return `https://www.${host}`;
}

export function number(min: number, max: number, step = 1, rng: Rng = defaultRng): string {
  return String(int(min, max, step, rng));
}

export function date(rng: Rng = defaultRng): string {
  const now = Date.now();
  const day = 1000 * 60 * 60 * 24;
  const start = now - day * 365;
  const end = now + day * 365;
  const t = start + rng() * (end - start);
  const d = new Date(t);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

export function color(rng: Rng = defaultRng): string {
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(int(0, 255, 1, rng))}${h(int(0, 255, 1, rng))}${h(int(0, 255, 1, rng))}`;
}

export function password(opts: { length?: number; rng?: Rng } = {}): string {
  const rng = opts.rng ?? defaultRng;
  const len = Math.max(8, opts.length ?? 12);
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const sym = '!$%@#?';
  const all = lower + upper + digits + sym;
  const chars = [char(lower, rng), char(upper, rng), char(digits, rng), char(sym, rng)];
  for (let i = chars.length; i < len; i++) chars.push(char(all, rng));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = chars[i] as string;
    const b = chars[j] as string;
    chars[i] = b;
    chars[j] = a;
  }
  return chars.join('');
}

// Stripe-style TEST card values (never real PANs). Defaults for the Test card
// setting; also exposed as pure generators for Custom Rules / generateByName.
export const CARD_NUMBER = '4242 4242 4242 4242';
export const CARD_EXPIRY = '01 / 35';
export const CARD_CVC = '121';
export function cardNumber(): string {
  return CARD_NUMBER;
}
export function cardExpiry(): string {
  return CARD_EXPIRY;
}
export function cardCvc(): string {
  return CARD_CVC;
}

export function sentence(theme: TextTheme = 'general', rng: Rng = defaultRng): string {
  return randomSentence(theme, rng);
}

export function paragraph(n: number, theme: TextTheme = 'general', rng: Rng = defaultRng): string {
  const count = Math.max(1, Math.floor(n));
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(randomSentence(theme, rng));
  return out.join(' ');
}

/** A realistic content title (course / chapter / lesson / quiz / assignment / session / project). */
export function title(rng: Rng = defaultRng): string {
  const r = rng();
  if (r < 0.4) return `${pick(TITLE_PREFIXES, rng)} ${pick(TITLE_TOPICS, rng)}`;
  if (r < 0.7) return `${pick(TITLE_TOPICS, rng)} with ${pick(TITLE_TOOLS, rng)}`;
  if (r < 0.85) return `${pick(TITLE_TOPICS, rng)} Fundamentals`;
  return `Mastering ${pick(TITLE_TOOLS, rng)}`;
}

/** A realistic single search term for search/filter inputs. */
export function searchTerm(rng: Rng = defaultRng): string {
  const r = rng();
  if (r < 0.4) return fullName({ rng });
  if (r < 0.7) return pick(TITLE_TOPICS, rng);
  return pick(SEARCH_TOKENS, rng);
}

/** A lowercase hyphenated slug (subdomain / namespace / handle). */
export function subdomain(rng: Rng = defaultRng): string {
  const base = rng() < 0.5 ? company(rng) : pick(TITLE_TOPICS, rng);
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** A generic tax / sales-tax name (VAT, GST, …). */
export function taxName(rng: Rng = defaultRng): string {
  return pick(TAX_NAMES, rng);
}

/** An action-oriented learning objective for outcome fields. */
export function objective(rng: Rng = defaultRng): string {
  return pick(OBJECTIVES, rng);
}

// Real, provider-correct media samples, keyed by provider. A field that names
// a provider (e.g. "YouTube") gets that provider's embed/link; a generic embed
// field rotates across any provider. The audio set is Islamic content (Quran
// recitation), per the platform's focus.
export type MediaCategory = 'audio' | 'video';

const EMBED: Record<MediaProvider, string> = {
  youtube: '<iframe width="560" height="315" src="https://www.youtube.com/embed/dz65i48QgB0?si=c80Sb1ciFhL9Ix6-" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>',
  vimeo: '<iframe title="vimeo-player" src="https://player.vimeo.com/video/57875730?h=5be51048a4" width="640" height="360" frameborder="0" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share" allowfullscreen></iframe>',
  spotify: '<iframe data-testid="embed-iframe" style="border-radius:12px" src="https://open.spotify.com/embed/album/3Uu8oN2OY2AjvN5R6VFMup?utm_source=generator&si=14728451b7424cc4" width="100%" height="152" frameBorder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>',
  soundcloud: '<iframe width="100%" height="166" scrolling="no" frameborder="no" allow="autoplay; encrypted-media" src="https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/soundcloud%253Atracks%253A1557721786&color=%23ff5500&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true"></iframe>',
};

const LINK: Record<MediaProvider, string> = {
  youtube: 'https://www.youtube.com/watch?v=dz65i48QgB0',
  vimeo: 'https://vimeo.com/57875730',
  spotify: 'https://open.spotify.com/album/3Uu8oN2OY2AjvN5R6VFMup',
  soundcloud: 'https://soundcloud.com/user-241276152/surat-annur-by-islam-sobhy-m4a',
};

const VIDEO_POOL: readonly MediaProvider[] = ['youtube', 'vimeo'];
const AUDIO_POOL: readonly MediaProvider[] = ['spotify', 'soundcloud'];
const ANY_POOL: readonly MediaProvider[] = ['youtube', 'vimeo', 'spotify', 'soundcloud'];

function poolFor(category: MediaCategory | undefined): readonly MediaProvider[] {
  return category === 'audio' ? AUDIO_POOL : category === 'video' ? VIDEO_POOL : ANY_POOL;
}

/**
 * A real embed snippet. Pin `provider` (e.g. 'youtube') when the field names one;
 * otherwise rotate within `category` (audio/video), or across all providers when
 * neither is known.
 */
export function embedFor(
  provider: MediaProvider | undefined,
  category: MediaCategory | undefined,
  rng: Rng = defaultRng,
): string {
  return EMBED[provider ?? pick(poolFor(category), rng)];
}

/** A real media link, with the same provider/category resolution as embedFor. */
export function linkFor(
  provider: MediaProvider | undefined,
  category: MediaCategory | undefined,
  rng: Rng = defaultRng,
): string {
  return LINK[provider ?? pick(poolFor(category), rng)];
}

// Registry-friendly aliases (no provider → category/any rotation).
/** Any embed (rotates across all providers). */
export function embedCode(rng: Rng = defaultRng): string {
  return embedFor(undefined, undefined, rng);
}
/** A video embed (rotates YouTube / Vimeo). */
export function videoEmbed(rng: Rng = defaultRng): string {
  return embedFor(undefined, 'video', rng);
}
/** An audio embed (rotates Spotify / SoundCloud). */
export function audioEmbed(rng: Rng = defaultRng): string {
  return embedFor(undefined, 'audio', rng);
}
/** A video link (rotates YouTube / Vimeo). */
export function videoUrl(rng: Rng = defaultRng): string {
  return linkFor(undefined, 'video', rng);
}
/** An audio link (rotates Spotify / SoundCloud). */
export function audioUrl(rng: Rng = defaultRng): string {
  return linkFor(undefined, 'audio', rng);
}

/**
 * Named-generator registry for Custom Field Rules (builtin fill kind + template
 * placeholders). Maps the generator names from the plan's table to functions.
 * Unknown names resolve to a readable sentence so a rule never throws.
 */
export const BUILTIN_GENERATORS = new Set<string>([
  'firstName',
  'lastName',
  'fullName',
  'email',
  'username',
  'phone',
  'street',
  'city',
  'state',
  'zip',
  'country',
  'company',
  'jobTitle',
  'url',
  'sentence',
  'paragraph',
  'number',
  'date',
  'color',
  'password',
  'cardNumber',
  'cardExpiry',
  'cardCvc',
  'dummyText',
  'title',
  'searchTerm',
  'subdomain',
  'taxName',
  'objective',
  'embedCode',
  'videoEmbed',
  'audioEmbed',
  'videoUrl',
  'audioUrl',
  'youtubeEmbed',
  'vimeoEmbed',
  'spotifyEmbed',
  'soundcloudEmbed',
  'youtubeLink',
  'vimeoLink',
  'spotifyLink',
  'soundcloudLink',
]);

export function generateByName(name: string, rng: Rng = defaultRng): string {
  switch (name) {
    case 'firstName':
      return firstName(rng);
    case 'lastName':
      return lastName(rng);
    case 'fullName':
      return fullName({ rng });
    case 'email':
      return email({ rng });
    case 'username':
      return username({ rng });
    case 'phone':
      return phone(rng);
    case 'street':
      return street(rng);
    case 'city':
      return city(rng);
    case 'state':
      return state(rng);
    case 'zip':
      return zip(rng);
    case 'country':
      return country(rng);
    case 'company':
      return company(rng);
    case 'jobTitle':
      return jobTitle(rng);
    case 'url':
      return url({ rng });
    case 'sentence':
      return sentence('general', rng);
    case 'paragraph':
      return paragraph(3, 'general', rng);
    case 'number':
      return number(1, 9999, 1, rng);
    case 'date':
      return date(rng);
    case 'color':
      return color(rng);
    case 'password':
      return password({ rng });
    case 'cardNumber':
      return cardNumber();
    case 'cardExpiry':
      return cardExpiry();
    case 'cardCvc':
      return cardCvc();
    case 'dummyText':
      return dummyText(200, 'general', rng);
    case 'title':
      return title(rng);
    case 'searchTerm':
      return searchTerm(rng);
    case 'subdomain':
      return subdomain(rng);
    case 'taxName':
      return taxName(rng);
    case 'objective':
      return objective(rng);
    case 'embedCode':
      return embedCode(rng);
    case 'videoEmbed':
      return videoEmbed(rng);
    case 'audioEmbed':
      return audioEmbed(rng);
    case 'videoUrl':
      return videoUrl(rng);
    case 'audioUrl':
      return audioUrl(rng);
    case 'youtubeEmbed':
      return embedFor('youtube', undefined, rng);
    case 'vimeoEmbed':
      return embedFor('vimeo', undefined, rng);
    case 'spotifyEmbed':
      return embedFor('spotify', undefined, rng);
    case 'soundcloudEmbed':
      return embedFor('soundcloud', undefined, rng);
    case 'youtubeLink':
      return linkFor('youtube', undefined, rng);
    case 'vimeoLink':
      return linkFor('vimeo', undefined, rng);
    case 'spotifyLink':
      return linkFor('spotify', undefined, rng);
    case 'soundcloudLink':
      return linkFor('soundcloud', undefined, rng);
    default:
      return sentence('general', rng);
  }
}
