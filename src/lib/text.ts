// Readable dummy-text engine: real-sentence corpus banks per theme, joined
// whole at sentence boundaries (no mid-word cuts), with a grammatical fallback
// when no corpus sentence fits. All sentences are original compositions
// (license-clean).

import { pick, type Rng, defaultRng } from './rng';
import business from './corpus/business.json';
import tech from './corpus/tech.json';
import casual from './corpus/casual.json';
import support from './corpus/support.json';
import reviews from './corpus/reviews.json';
import general from './corpus/general.json';
import lms from './corpus/lms.json';

export type TextTheme = 'general' | 'business' | 'tech' | 'casual' | 'support' | 'reviews' | 'lms';

export const CORPUS: Record<TextTheme, readonly string[]> = {
  general,
  business,
  tech,
  casual,
  support,
  reviews,
  lms,
};

const GRAMMAR_SUBJECTS = ['The team', 'Management', 'The group', 'Leadership', 'The committee', 'Staff', 'The panel'];
const GRAMMAR_VERBS = ['approved', 'reviewed', 'scheduled', 'finalized', 'discussed', 'confirmed', 'delivered'];
const GRAMMAR_OBJECTS = ['the plan', 'the proposal', 'the update', 'the report', 'the timeline', 'the agenda'];

function grammarSentence(rng: Rng): string {
  return `${pick(GRAMMAR_SUBJECTS, rng)} ${pick(GRAMMAR_VERBS, rng)} ${pick(GRAMMAR_OBJECTS, rng)}.`;
}

function clipToWordBoundary(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  const slice = s.slice(0, maxLen);
  const i = slice.lastIndexOf(' ');
  return (i > 0 ? slice.slice(0, i) : slice).trimEnd();
}

function bankFor(theme: TextTheme): readonly string[] {
  const b = CORPUS[theme];
  return b && b.length ? b : CORPUS.general;
}

/** One readable corpus sentence for the theme; grammar fallback if the bank is empty. */
export function randomSentence(theme: TextTheme = 'general', rng: Rng = defaultRng): string {
  const bank = bankFor(theme);
  return bank.length ? (pick(bank, rng) as string) : grammarSentence(rng);
}

/**
 * Readable text fitted to `maxLen`. Joins whole corpus sentences that fit
 * (never cuts mid-word), shuffled so each call is fresh and no sentence repeats
 * within a call. Falls back to a grammatical sentence when no corpus sentence
 * fits, and to a single readable word for very small budgets.
 */
export function dummyTextFromBank(maxLen: number, bank: readonly string[], rng: Rng = defaultRng): string {
  if (maxLen <= 0) return '';

  // Fisher-Yates shuffle of indices for a fresh, repeat-free order.
  const order = bank.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = order[i] as number;
    const b = order[j] as number;
    order[i] = b;
    order[j] = a;
  }

  const out: string[] = [];
  let len = 0;
  for (const i of order) {
    const s = bank[i] as string;
    const add = out.length === 0 ? s.length : len + 1 + s.length;
    if (add > maxLen) continue; // skip whole sentence rather than cut it
    out.push(s);
    len = add;
  }
  if (out.length) return out.join(' ');

  // No corpus sentence fit — grammatical fallback, clipped to a word boundary.
  const g = grammarSentence(rng);
  const clipped = clipToWordBoundary(g, maxLen);
  if (clipped) return clipped;
  return clipToWordBoundary(pick(GRAMMAR_OBJECTS, rng), maxLen);
}

/** Readable text fitted to `maxLen`, drawn from the theme's corpus bank. */
export function dummyText(maxLen: number, theme: TextTheme = 'general', rng: Rng = defaultRng): string {
  return dummyTextFromBank(maxLen, bankFor(theme), rng);
}
