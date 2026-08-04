import { describe, it, expect, afterEach } from 'vitest';
import { isOnDeviceAIAvailable, enhanceTextFieldsWithAI } from '../src/lib/on-device-ai';
import { mergeDefaults, DEFAULT_SETTINGS, type FillerSettings } from '../src/lib/settings';

const G = globalThis as Record<string, unknown>;

function mockLanguageModel(response: string): void {
  G.LanguageModel = {
    availability: async () => 'available',
    create: async () => ({ prompt: async () => response, destroy: () => undefined }),
  };
}
function clearLanguageModel(): void {
  delete G.LanguageModel;
}

afterEach(() => clearLanguageModel());

describe('on-device AI availability', () => {
  it('is unavailable when LanguageModel is absent', () => {
    clearLanguageModel();
    expect(isOnDeviceAIAvailable()).toBe(false);
  });
  it('is available when LanguageModel is present', () => {
    mockLanguageModel('x');
    expect(isOnDeviceAIAvailable()).toBe(true);
  });
  it('no-ops (returns 0, no throw) when unavailable', async () => {
    clearLanguageModel();
    const n = await enhanceTextFieldsWithAI(document, mergeDefaults(DEFAULT_SETTINGS));
    expect(n).toBe(0);
  });
  it('no-ops when availability is not "available"', async () => {
    G.LanguageModel = { availability: async () => 'downloadable', create: async () => ({ prompt: async () => 'x' }) };
    document.documentElement.innerHTML = '<body><form><input name="desc" type="text"></form></body>';
    const n = await enhanceTextFieldsWithAI(document, mergeDefaults(DEFAULT_SETTINGS));
    expect(n).toBe(0);
  });
});

describe('on-device AI enhancement', () => {
  it('refines only free-text fields and skips honeypots + non-text fields', async () => {
    document.documentElement.innerHTML = `<body><form>
      <input id="desc" name="course_description" type="text">
      <input id="email" name="email" type="email">
      <div style="display:none" aria-hidden="true">
        <input id="hp" name="phone_number__x" type="text">
      </div>
    </form></body>`;
    mockLanguageModel('AI-generated course overview');

    const settings: FillerSettings = mergeDefaults(DEFAULT_SETTINGS);
    const refined = await enhanceTextFieldsWithAI(document, settings);

    expect(refined).toBe(1); // only the visible free-text "description" field
    expect((document.getElementById('desc') as HTMLInputElement).value).toBe('AI-generated course overview');
    // email is not a free-text type → untouched by AI
    expect((document.getElementById('email') as HTMLInputElement).value).toBe('');
    // honeypot hidden by a display:none wrapper → untouched (no bot-trip)
    expect((document.getElementById('hp') as HTMLInputElement).value).toBe('');
  });

  it('strips wrapping quotes from model output', async () => {
    document.documentElement.innerHTML = '<body><form><input id="t" name="bio" type="text"></form></body>';
    mockLanguageModel('"a concise bio"');
    await enhanceTextFieldsWithAI(document, mergeDefaults(DEFAULT_SETTINGS));
    expect((document.getElementById('t') as HTMLInputElement).value).toBe('a concise bio');
  });

  it('keeps going when a single field errors', async () => {
    document.documentElement.innerHTML =
      '<body><form><input id="a" name="notes_a" type="text"><input id="b" name="notes_b" type="text"></form></body>';
    let calls = 0;
    G.LanguageModel = {
      availability: async () => 'available',
      create: async () => ({
        prompt: async () => {
          calls++;
          if (calls === 1) throw new Error('transient');
          return 'ok';
        },
        destroy: () => undefined,
      }),
    };
    const refined = await enhanceTextFieldsWithAI(document, mergeDefaults(DEFAULT_SETTINGS));
    expect(refined).toBe(1); // first field errored, second succeeded
    expect((document.getElementById('b') as HTMLInputElement).value).toBe('ok');
  });
});
