// Optional on-device text generation via Chrome's built-in AI (Gemini Nano),
// exposed as the global `LanguageModel` API (the "Prompt API"). This is the
// "local AI" layer of the hybrid text engine: when enabled in Options and
// available in the browser, it rewrites free-text fields with realistic values
// generated from the field's own label.
//
// IMPORTANT constraints (by design):
// - Chrome-only and availability-gated. Firefox/older Chrome: unavailable ->
//   every function here no-ops, and the field-aware snippet library (the
//   always-on base) keeps working unchanged.
// - Runs in the content script. If `LanguageModel` is not exposed in the
//   content-script world on a given Chrome build, `isOnDeviceAIAvailable()`
//   returns false and nothing happens.
// - Off by default and slower (per-field generation). The snippet fill still
//   happens instantly first; this pass only refines free-text fields afterward.

import { discoverFields, shouldSkip } from './orchestrate';
import { describeField, detectType } from './detect';
import { fillField } from './fillers';
import type { FillerSettings } from './settings';

/** Cap so a large form can't make the AI pass run for minutes. */
const MAX_FIELDS = 12;

interface SessionLike {
  prompt: (input: string) => Promise<string>;
  destroy?: () => void;
}
interface LanguageModelLike {
  availability?: () => Promise<string> | string;
  create: (options?: unknown) => Promise<SessionLike>;
}

function api(): LanguageModelLike | undefined {
  const g = globalThis as Record<string, unknown>;
  return g.LanguageModel as LanguageModelLike | undefined;
}

/** True only if the on-device LanguageModel API is present and ready. */
export function isOnDeviceAIAvailable(): boolean {
  return !!api();
}

async function createSession(): Promise<SessionLike | null> {
  const lm = api();
  if (!lm) return null;
  try {
    if (typeof lm.availability === 'function') {
      const status = await lm.availability();
      if (status !== 'available') return null;
    }
    return await lm.create();
  } catch {
    return null;
  }
}

function buildPrompt(label: string, kind: string, maxLen: number): string {
  const shape = kind === 'paragraph' ? 'one short paragraph' : 'one short phrase';
  return (
    `You are filling a web form with realistic sample data. ` +
    `For a field labeled "${label}", write ${shape} of realistic sample content. ` +
    `Return ONLY the value (no quotes, no explanation), at most ${maxLen} characters.`
  );
}

function cleanModelOutput(raw: string, maxLen: number): string {
  return raw
    .trim()
    .replace(/^["'`]|["'`]$/g, '') // strip wrapping quotes
    .replace(/\s+/g, ' ')
    .slice(0, maxLen)
    .trim();
}

/**
 * Refine free-text fields on the page using on-device AI. The instant field-aware
 * snippet fill runs first (in the orchestrator); this only overwrites free-text
 * fields it can improve, and respects the same skip rules (honeypots, hidden,
 * disabled, readonly, ignored). Returns how many fields it refined.
 */
export async function enhanceTextFieldsWithAI(
  doc: Document,
  settings: FillerSettings,
): Promise<number> {
  const session = await createSession();
  if (!session) return 0;

  let refined = 0;
  try {
    for (const el of discoverFields(doc.body)) {
      if (refined >= MAX_FIELDS) break;
      const desc = describeField(el);
      if (shouldSkip(el, desc, settings)) continue;
      const type = detectType(desc, settings.fields.matchFieldsUsing);
      if (type !== 'text' && type !== 'sentence' && type !== 'paragraph') continue;

      const label =
        desc.label || desc.placeholder || desc.ariaLabel || desc.name || desc.id || 'this field';
      const maxLen =
        type === 'paragraph' ? settings.fields.maxLength : Math.min(settings.fields.maxLength, 80);

      try {
        const raw = await session.prompt(buildPrompt(label, type, maxLen));
        const value = cleanModelOutput(raw, maxLen);
        if (value) {
          fillField(el, type, value, { triggerEvents: true });
          refined++;
        }
      } catch {
        // A single field failing must not abort the whole pass.
      }
    }
  } finally {
    session.destroy?.();
  }
  return refined;
}
