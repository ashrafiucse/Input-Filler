// Background service worker. Owns the trigger surfaces per the corrected MV3
// model: the toolbar icon opens the popup, and fill is initiated from popup
// buttons -> background -> active-tab content script. Also handles keyboard
// commands and the context-menu items. Ignores fill actions on blocklisted
// origins (R4). No on-demand script injection; the content script is static.

import { actionForCommand, actionForMenuItem, MENU_ITEMS, type FillAction } from '@/src/lib/background-actions';
import { loadSettings, getDefaultStorageAdapter, isIgnoredOrigin } from '@/src/lib/settings';

export default defineBackground(() => {
  const adapter = getDefaultStorageAdapter();

  async function runOnActiveTab(
    action: FillAction,
  ): Promise<{ ignored?: boolean; result?: unknown; error?: string }> {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id) return { error: 'no-active-tab' };
    const settings = await loadSettings(adapter);
    const origin = tab.url ?? '';
    // "clear" still runs on ignored domains so users can reset; fill actions are no-ops there.
    if (action !== 'clear' && isIgnoredOrigin(origin, settings.general.ignoredDomains)) {
      return { ignored: true };
    }
    try {
      const result = await browser.tabs.sendMessage(tab.id, { action });
      return { result };
    } catch {
      // Restricted page (chrome://, store) or content script not loaded.
      return { error: 'no-content-script' };
    }
  }

  // Keyboard shortcuts.
  browser.commands.onCommand.addListener((command) => {
    const action = actionForCommand(command);
    if (action) void runOnActiveTab(action);
  });

  // Context menu: rebuild from settings (on install and when settings change).
  async function rebuildContextMenu(): Promise<void> {
    const settings = await loadSettings(adapter);
    try {
      await browser.contextMenus.removeAll();
    } catch {
      /* ignore */
    }
    if (settings.general.contextMenu) {
      for (const item of MENU_ITEMS) browser.contextMenus.create({ id: item.id, title: item.title });
    }
  }
  browser.runtime.onInstalled.addListener(() => void rebuildContextMenu());
  browser.storage.onChanged.addListener((_changes, area) => {
    if (area === 'sync' || area === 'local') void rebuildContextMenu();
  });
  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (!tab?.id) return;
    const action = actionForMenuItem(String(info.menuItemId));
    if (action) void runOnActiveTab(action);
  });

  // Clicking the toolbar icon fills all forms on the active tab immediately
  // (there is no popup). action.onClicked only fires when default_popup is unset.
  browser.action.onClicked.addListener(() => void runOnActiveTab('fillAll'));
});
