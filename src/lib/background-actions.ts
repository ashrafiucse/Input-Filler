// Pure helpers for the background service worker: keyboard-command and
// context-menu mapping, plus the menu-item definitions. Kept separate from the
// background.ts wiring so the routing logic is unit-testable.

export type FillAction = 'fillAll' | 'fillForm' | 'clear';

export function actionForCommand(command: string): FillAction | null {
  if (command === 'fill-all') return 'fillAll';
  if (command === 'fill-form') return 'fillForm';
  return null;
}

export const MENU_ITEMS = [
  { id: 'if-fill-all', title: 'Input Filler: Fill all forms' },
  { id: 'if-fill-form', title: 'Input Filler: Fill this form' },
  { id: 'if-clear', title: 'Input Filler: Clear' },
] as const;

export function actionForMenuItem(id: string): FillAction | null {
  switch (id) {
    case 'if-fill-all':
      return 'fillAll';
    case 'if-fill-form':
      return 'fillForm';
    case 'if-clear':
      return 'clear';
    default:
      return null;
  }
}
