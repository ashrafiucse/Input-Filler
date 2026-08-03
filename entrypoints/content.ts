// Static content script: WXT registers it from this entrypoint, so it loads on
// every page (all frames) without on-demand injection. The background messages
// it to fill/clear; orchestration lives in src/lib/orchestrate.ts (unit-tested).

import { fillAllForms, fillCurrentForm, clearAllForms } from '@/src/lib/orchestrate';
import { loadSettings, getDefaultStorageAdapter } from '@/src/lib/settings';
import { loadRules } from '@/src/lib/rules';

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_idle',
  async main() {
    browser.runtime.onMessage.addListener((msg: unknown) => {
      if (!msg || typeof msg !== 'object') return undefined;
      const { action } = msg as { action?: string };
      if (!action) return undefined;

      return (async () => {
        const adapter = getDefaultStorageAdapter();
        const [settings, rules] = await Promise.all([loadSettings(adapter), loadRules(adapter)]);
        const origin = location.href;
        switch (action) {
          case 'fillAll':
            return fillAllForms(document, { settings, rules, origin });
          case 'fillForm':
            return fillCurrentForm(document, document.activeElement, { settings, rules, origin });
          case 'clear':
            return { cleared: clearAllForms(document) };
          default:
            return undefined;
        }
      })();
    });
  },
});
