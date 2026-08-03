import { loadSettings, getDefaultStorageAdapter } from '@/src/lib/settings';
import { formatPopupStatus, type PopupAction } from '@/src/lib/popup-status';

const status = document.getElementById('status') as HTMLElement;
const actionButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('button[data-action]'));

function setStatus(text: string, cls: string): void {
  status.textContent = text;
  status.className = `status ${cls}`;
}

function setBusy(busy: boolean): void {
  for (const b of actionButtons) b.disabled = busy;
}

async function run(action: PopupAction): Promise<void> {
  setBusy(true);
  setStatus('Working…', 'busy');
  try {
    const res = await browser.runtime.sendMessage({ action });
    const s = formatPopupStatus(action, res as Parameters<typeof formatPopupStatus>[1]);
    setStatus(s.text, s.cls);
  } catch {
    setStatus('Action failed', 'error');
  } finally {
    setBusy(false);
  }
}

for (const b of actionButtons) {
  const action = b.dataset.action as PopupAction;
  b.addEventListener('click', () => void run(action));
}

document.getElementById('options')?.addEventListener('click', () => {
  void browser.runtime.openOptionsPage();
});

// Apply the saved UI theme (light/dark).
(async () => {
  try {
    const settings = await loadSettings(getDefaultStorageAdapter());
    document.documentElement.dataset.theme = settings.general.theme;
  } catch {
    /* fall back to the default light theme */
  }
})();
