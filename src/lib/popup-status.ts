// Pure status formatter for the popup footer, extracted so the loading / zero /
// error / disabled states are unit-testable without the browser runtime.

export type PopupAction = 'fillAll' | 'fillForm' | 'clear';

export interface PopupResponse {
  ignored?: boolean;
  error?: string;
  result?: { filled?: number; skipped?: number; cleared?: number };
}

export interface PopupStatus {
  text: string;
  cls: 'ready' | 'busy' | 'ok' | 'muted' | 'error';
}

export function formatPopupStatus(action: PopupAction, res: PopupResponse | null | undefined): PopupStatus {
  if (!res) return { text: 'No response', cls: 'error' };
  if (res.ignored) return { text: 'Disabled on this site', cls: 'muted' };
  if (res.error) {
    return { text: res.error === 'no-content-script' ? 'Cannot run on this page' : 'Action failed', cls: 'error' };
  }
  const result = res.result ?? {};
  if (action === 'clear') {
    const n = result.cleared ?? 0;
    return { text: `Cleared ${n} field${n === 1 ? '' : 's'}`, cls: 'ok' };
  }
  const n = result.filled ?? 0;
  return { text: n === 0 ? 'Filled 0 fields' : `Filled ${n} field${n === 1 ? '' : 's'}`, cls: n === 0 ? 'muted' : 'ok' };
}
