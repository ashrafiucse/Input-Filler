// Static content script: WXT registers it from this entrypoint, so it loads on
// every page (all frames) without on-demand injection. It only handles messages
// from the background (relay via tabs.sendMessage); popup broadcasts carry
// source:'popup' and are ignored here so the active tab isn't double-filled.
// Orchestration lives in src/lib/orchestrate.ts (unit-tested).

import { fillAllForms, fillCurrentForm, clearAllForms } from '@/src/lib/orchestrate';
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
          case 'fillAll':
            return fillAllForms(document, { settings, rules, origin });
          case 'fillForm':
            return fillCurrentForm(document, lastFocused ?? document.activeElement, { settings, rules, origin });
          case 'clear':
            return { cleared: clearAllForms(document) };
          default:
            return undefined;
        }
      })();
    });
  },
});
