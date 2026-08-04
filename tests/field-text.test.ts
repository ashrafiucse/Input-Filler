import { describe, it, expect } from 'vitest';
import { fieldIntent, fieldSentence } from '../src/lib/field-text';
import { createRng } from '../src/lib/rng';
import type { FieldDescriptor } from '../src/lib/detect';

function desc(attrs: Partial<FieldDescriptor>): FieldDescriptor {
  return { tag: 'input', type: 'text', ...attrs };
}

describe('fieldIntent (label → intent matching)', () => {
  it('routes LMS labels to the course intent', () => {
    expect(fieldIntent(desc({ name: 'course_description' }))?.name).toBe('course');
    expect(fieldIntent(desc({ label: 'Module summary' }))?.name).toBe('course');
    expect(fieldIntent(desc({ placeholder: 'Assignment title' }))?.name).toBe('course');
  });
  it('routes feedback/comment labels to feedback', () => {
    expect(fieldIntent(desc({ name: 'feedback' }))?.name).toBe('feedback');
    expect(fieldIntent(desc({ placeholder: 'Leave a comment' }))?.name).toBe('feedback');
  });
  it('routes about/bio labels to bio', () => {
    expect(fieldIntent(desc({ label: 'About you' }))?.name).toBe('bio');
    expect(fieldIntent(desc({ name: 'short_bio' }))?.name).toBe('bio');
  });
  it('routes message/note/reply labels to message', () => {
    expect(fieldIntent(desc({ name: 'support_message' }))?.name).toBe('message');
    expect(fieldIntent(desc({ label: 'Your reply' }))?.name).toBe('message');
  });
  it('returns undefined for a label with no recognisable intent', () => {
    expect(fieldIntent(desc({ name: 'foo_bar_baz' }))).toBeUndefined();
  });
  it('ignores an empty descriptor', () => {
    expect(fieldIntent(desc({}))).toBeUndefined();
  });
});

describe('fieldSentence', () => {
  it('returns a pool sentence for a matched field', () => {
    const rng = createRng(3);
    const out = fieldSentence(desc({ name: 'course_description' }), 'general', rng);
    expect(out.length).toBeGreaterThan(0);
    // Determinism with a seeded rng: same seed → same sentence.
    expect(fieldSentence(desc({ name: 'course_description' }), 'general', createRng(3))).toBe(out);
  });
  it('falls back to the theme corpus when no intent matches', () => {
    // An unmatched field still yields a readable, non-empty sentence.
    const out = fieldSentence(desc({ name: 'zzz_unmatched' }), 'tech', createRng(1));
    expect(out.length).toBeGreaterThan(0);
  });
});
