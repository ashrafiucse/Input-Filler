// Field-aware readable text: instead of a generic theme sentence, pick a
// sentence pool that matches what the field is ASKING for (its label / name /
// placeholder / aria-label / id). A "Course description" field gets a course
// description, a "Feedback" field gets feedback, a "Bio" field gets a bio, etc.
// First-matching intent wins; if nothing matches we fall back to the theme
// corpus (general/business/tech/lms/...). All sentences are original
// compositions (license-clean).
//
// Optional on-device AI (Chrome built-in LanguageModel) can layer on top in the
// content script; this module is the always-on, offline, every-browser base.

import { pick, type Rng, defaultRng } from './rng';
import { randomSentence, dummyTextFromBank, CORPUS, type TextTheme } from './text';
import type { FieldDescriptor } from './detect';

interface FieldIntent {
  name: string;
  test: (haystack: string) => boolean;
  pool: readonly string[];
}

const BIO: readonly string[] = [
  'I enjoy turning messy problems into clean, repeatable processes.',
  'Background in product, with a soft spot for well-written documentation.',
  'I work best where curiosity and accountability overlap.',
  'Five years building tools that people actually want to use.',
  'I like small teams, short feedback loops, and shipping often.',
  'Always learning; currently curious about design systems and accessibility.',
  'I care about clear writing as much as clean code.',
  'Calm under deadlines, pragmatic about scope, serious about quality.',
];

const FEEDBACK: readonly string[] = [
  'The flow felt smooth overall, and the final step was satisfying.',
  'I loved the clarity of the instructions; the layout could breathe a bit more.',
  'Everything I needed was never more than one click away.',
  'Quick to pick up, with thoughtful defaults that saved me time.',
  'A couple of edges felt rough, but the core worked reliably.',
  'Honestly delightful once it got going.',
  'Clear, fast, and it never got in my way.',
  'I would suggest a short example right near the start.',
];

const MESSAGE: readonly string[] = [
  'Following up to keep this moving; happy to jump on a quick call.',
  'Noted for the next iteration, thanks for flagging it.',
  'This looks good to me, proceeding unless I hear otherwise.',
  'Quick reminder that the review window closes at the end of the week.',
  'Thanks for the context, that clears it up for me.',
  'Parking this until we have the updated numbers.',
  'Confirming receipt; I will circle back with details shortly.',
];

const DESCRIPTION: readonly string[] = [
  'A focused, end-to-end experience with sensible defaults throughout.',
  'Lightweight by design, with the common path always one step away.',
  'Built to be predictable, fast, and easy to maintain over time.',
  'Covers the main workflow plus a handful of useful power moves.',
  'Designed for everyday use, with room to grow as needs change.',
  'Straightforward on the surface, flexible once you dig in.',
];

const REASON: readonly string[] = [
  'The change removes a recurring source of confusion for new users.',
  'It is a small adjustment with an outsized impact on clarity.',
  'This keeps behavior consistent across both entry points.',
  'The goal is fewer support tickets and a smoother first run.',
  'It aligns the feature with how people already expect it to work.',
];

const EXPERIENCE: readonly string[] = [
  'Several years across product and platform work, mostly on internal tools.',
  'Comfortable owning a feature from early sketch through to support.',
  'Experience leading small projects from start to finish.',
  'Background spanning frontend, a bit of backend, and plenty of debugging.',
  'Used to wearing a few hats and switching context without dropping the ball.',
];

const ADDRESS: readonly string[] = [
  '1428 Maple Avenue, Apartment 4B',
  '88 Riverside Drive, Suite 200',
  '27 Oakwood Lane',
  '5309 Cedar Court, Building C',
  '1912 Elm Street, Floor 3',
  '421 Birchwood Hollow',
];

const SUBJECT: readonly string[] = [
  'Quick follow-up',
  'New project kickoff',
  'Feedback on the latest draft',
  'Team sync notes',
  'Onboarding checklist',
  'Q3 roadmap draft',
  'Triage priorities',
];

// Order matters: more specific intents first; the generic "description" last.
const INTENTS: readonly FieldIntent[] = [
  { name: 'course', test: (h) => /\b(course|lesson|module|syllabus|curriculum|assignment|quiz|lecture|enroll\w*)\b/.test(h), pool: CORPUS.lms },
  { name: 'feedback', test: (h) => /\b(feedback|review|testimonial|comment|opinion)\b/.test(h), pool: FEEDBACK },
  { name: 'message', test: (h) => /\b(message|notes?|remark|reply|response)\b/.test(h), pool: MESSAGE },
  { name: 'reason', test: (h) => /\b(reason|why|explain\w*|justification|motivation|cover[-_ ]?letter)\b/.test(h), pool: REASON },
  { name: 'experience', test: (h) => /\b(experience|background|qualification|achievement)\b/.test(h), pool: EXPERIENCE },
  { name: 'address', test: (h) => /\b(address|street|addr)\b/.test(h), pool: ADDRESS },
  { name: 'subject', test: (h) => /\b(subject|title|heading|topic)\b/.test(h), pool: SUBJECT },
  { name: 'bio', test: (h) => /\b(bio|biography|about|profile|yourself)\b/.test(h), pool: BIO },
  { name: 'description', test: (h) => /\b(description|desc|details?|summary)\b/.test(h), pool: DESCRIPTION },
];

function fieldHay(desc: FieldDescriptor): string {
  return [desc.label, desc.placeholder, desc.ariaLabel, desc.name, desc.id, desc.className]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[_\-/]+/g, ' '); // treat snake/kebab/slash as word separators (\b ignores '_')
}

/** The first intent whose keyword pattern matches the field's label/name/etc. */
export function fieldIntent(desc: FieldDescriptor): FieldIntent | undefined {
  const hay = fieldHay(desc);
  if (!hay) return undefined;
  return INTENTS.find((i) => i.test(hay));
}

/** One readable sentence matched to the field, falling back to the theme corpus. */
export function fieldSentence(desc: FieldDescriptor, theme: TextTheme = 'general', rng: Rng = defaultRng): string {
  const intent = fieldIntent(desc);
  return intent ? (pick(intent.pool, rng) as string) : randomSentence(theme, rng);
}

/** Readable multi-sentence text matched to the field, falling back to the theme. */
export function fieldParagraph(desc: FieldDescriptor, maxLen: number, theme: TextTheme = 'general', rng: Rng = defaultRng): string {
  const intent = fieldIntent(desc);
  return intent ? dummyTextFromBank(maxLen, intent.pool, rng) : dummyTextFromBank(maxLen, CORPUS[theme] ?? CORPUS.general, rng);
}
