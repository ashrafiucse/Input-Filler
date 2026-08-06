import { defineConfig } from 'wxt';

// One config drives every browser target. Per-browser differences (e.g. the
// Firefox gecko id) live in the shared manifest; Chromium ignores them.
export default defineConfig({
  srcDir: '.',
  manifest: {
    name: 'Input Filler',
    description: 'Fill every form field on the page with realistic, human-readable data.',
    version: '0.6.3',
    // The content script is a static entrypoint (entrypoints/content.ts) that
    // runs on all pages; no on-demand scripting injection. Popup/options are
    // HTML entrypoints. Storage holds settings + rules; contextMenus adds the
    // right-click fill items.
    permissions: ['storage', 'contextMenus'],
    host_permissions: ['<all_urls>'],
    // No popup: clicking the toolbar icon fills all forms immediately via
    // action.onClicked in the background.
    action: {
      default_title: 'Input Filler',
    },
    commands: {
      'fill-all': { description: 'Fill all forms on the page' },
      'fill-form': { description: 'Fill the current form' },
    },
    // Firefox requires a gecko id to persist across updates; ignored by Chromium.
    browser_specific_settings: {
      gecko: { id: 'input-filler@input-filler.local' },
    },
  },
});
