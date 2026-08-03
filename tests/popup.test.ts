import { describe, it, expect } from 'vitest';
import { formatPopupStatus } from '../src/lib/popup-status';

describe('popup status formatting', () => {
  it('reports a non-zero fill count', () => {
    const s = formatPopupStatus('fillAll', { result: { filled: 3 } });
    expect(s.text).toBe('Filled 3 fields');
    expect(s.cls).toBe('ok');
  });
  it('reports a zero fill count distinctly (F-D3)', () => {
    const s = formatPopupStatus('fillAll', { result: { filled: 0 } });
    expect(s.text).toBe('Filled 0 fields');
    expect(s.cls).toBe('muted');
  });
  it('singularizes one field', () => {
    expect(formatPopupStatus('fillForm', { result: { filled: 1 } }).text).toBe('Filled 1 field');
  });
  it('formats a clear result', () => {
    expect(formatPopupStatus('clear', { result: { cleared: 5 } }).text).toBe('Cleared 5 fields');
  });
  it('surfaces an ignored (blocklisted) site', () => {
    expect(formatPopupStatus('fillAll', { ignored: true }).cls).toBe('muted');
  });
  it('surfaces a no-content-script error gracefully', () => {
    const s = formatPopupStatus('fillAll', { error: 'no-content-script' });
    expect(s.cls).toBe('error');
    expect(s.text).toBe('Cannot run on this page');
  });
});
