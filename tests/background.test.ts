import { describe, it, expect } from 'vitest';
import { actionForCommand, actionForMenuItem, MENU_ITEMS } from '../src/lib/background-actions';

describe('command mapping', () => {
  it('maps keyboard commands to fill actions', () => {
    expect(actionForCommand('fill-all')).toBe('fillAll');
    expect(actionForCommand('fill-form')).toBe('fillForm');
    expect(actionForCommand('unknown')).toBeNull();
  });
});

describe('context-menu mapping', () => {
  it('maps menu item ids to fill actions', () => {
    expect(actionForMenuItem('if-fill-all')).toBe('fillAll');
    expect(actionForMenuItem('if-fill-form')).toBe('fillForm');
    expect(actionForMenuItem('if-clear')).toBe('clear');
    expect(actionForMenuItem('other')).toBeNull();
  });
  it('defines exactly the three menu items', () => {
    expect(MENU_ITEMS).toHaveLength(3);
    expect(MENU_ITEMS.map((i) => i.id).sort()).toEqual(['if-clear', 'if-fill-all', 'if-fill-form']);
  });
});
