// Static content script: WXT registers it from this entrypoint, so it loads on
// every page (all frames) without on-demand injection. It only handles messages
// from the background (relay via tabs.sendMessage); popup broadcasts carry
// source:'popup' and are ignored here so the active tab isn't double-filled.
// Orchestration lives in src/lib/orchestrate.ts (unit-tested).

import { fillAllForms, fillCurrentForm, clearAllForms } from '@/src/lib/orchestrate';
import { flushComboboxFills, flushDeferredSelects } from '@/src/lib/fillers';
import { isOnDeviceAIAvailable, enhanceTextFieldsWithAI } from '@/src/lib/on-device-ai';
import { loadSettings, getDefaultStorageAdapter } from '@/src/lib/settings';
import { loadRules } from '@/src/lib/rules';

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_idle',
  async main() {
    // Track the last focusable field so "fill this form" targets the form the
    // user was actually working in (document.activeElement is often <body> by
    // the time a popup/menu message arrives).
    let lastFocused: HTMLElement | null = null;
    document.addEventListener('focusin', (e) => {
      if (e.target instanceof HTMLElement) lastFocused = e.target;
    });

    browser.runtime.onMessage.addListener((msg: unknown) => {
      if (!msg || typeof msg !== 'object') return undefined;
      // Ignore popup broadcasts (handled by the background). This listener only
      // answers the background's tabs.sendMessage relay, which carries no source.
      const { source, action } = msg as { source?: string; action?: string };
      if (source === 'popup' || !action) return undefined;

      return (async () => {
        const adapter = getDefaultStorageAdapter();
        const [settings, rules] = await Promise.all([loadSettings(adapter), loadRules(adapter)]);
        const origin = location.href;
        switch (action) {
          case 'fillAll': {
            const result = fillAllForms(document, { settings, rules, origin });
            // Combobox (Mantine/MUI/Chakra) fills are queued because opening a
            // dropdown and waiting for its portal options to render is async;
            // settle them before reporting the fill done (and before the optional
            // AI pass, which only refines free-text fields and never touches them).
            await flushComboboxFills();
            await flushDeferredSelects();
            // AI refinement is best-effort: a failure there must never lose the
            // fill result the user asked for.
            try {
              if (settings.general.useOnDeviceAI && isOnDeviceAIAvailable()) {
                await enhanceTextFieldsWithAI(document, settings);
              }
            } catch {
              // keep the fill result
            }
            return result;
          }
          case 'fillForm': {
            const result = fillCurrentForm(document, lastFocused ?? document.activeElement, { settings, rules, origin });
            await flushComboboxFills();
            await flushDeferredSelects();
            return result;
          }
          case 'clear':
            return { cleared: clearAllForms(document) };
          default:
            return undefined;
        }
      })();
    });
  },
});
