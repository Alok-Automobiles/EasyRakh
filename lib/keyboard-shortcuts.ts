export type AppShortcut = {
  id: string;
  label: string;
  key: string;
  display: string;
  aria: string;
};

export type NavigationShortcut = AppShortcut & {
  href: string;
};

const shortcut = (id: string, label: string, key: string): AppShortcut => ({
  id,
  label,
  key,
  display: `Alt+Shift+${key}`,
  aria: `Alt+Shift+${key}`,
});

export const NAVIGATION_SHORTCUTS: NavigationShortcut[] = [
  { ...shortcut('dashboard', 'Dashboard', 'D'), href: '/dashboard' },
  { ...shortcut('customers', 'Customers', 'C'), href: '/customers' },
  { ...shortcut('suppliers', 'Suppliers', 'S'), href: '/suppliers' },
  { ...shortcut('new-transaction', 'New Transaction', 'T'), href: '/transactions/new' },
  { ...shortcut('invoices', 'Invoices', 'V'), href: '/invoices' },
  { ...shortcut('inventory', 'Inventory', 'I'), href: '/inventory' },
  { ...shortcut('cash-record', 'Cash Record', 'R'), href: '/daily-cash-record' },
  { ...shortcut('notes', 'Notes', 'O'), href: '/notes' },
  { ...shortcut('collections', 'Collections', 'M'), href: '/collection-types' },
  { ...shortcut('profile', 'Profile', 'P'), href: '/profile' },
];

export const ACTION_SHORTCUTS = {
  primary: shortcut('primary-action', 'Primary new action', 'N'),
  focusField: shortcut('focus-field', 'Focus search or first field', 'F'),
  submit: shortcut('submit', 'Save or submit', 'Enter'),
  addLine: shortcut('add-line', 'Add line item', 'A'),
  browse: shortcut('browse-open', 'Browse, open, or manage', 'B'),
  edit: shortcut('edit', 'Edit', 'E'),
  delete: shortcut('delete', 'Delete or remove', 'Delete'),
  download: shortcut('download', 'Download', 'X'),
  share: shortcut('share', 'Share', 'H'),
  print: shortcut('print', 'Print', 'L'),
  clear: shortcut('clear', 'Clear or reset', 'K'),
  previous: shortcut('previous', 'Previous or back', 'Q'),
  next: shortcut('next', 'Next', 'J'),
  cancel: shortcut('cancel', 'Cancel or close', 'Z'),
} as const;

export const LOCAL_ACTION_SHORTCUT_KEYS = [
  'G',
  'U',
  'W',
  'Y',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '0',
  'C',
  'D',
  'I',
  'M',
  'O',
  'P',
  'R',
  'S',
  'T',
  'V',
] as const;

export function getNavigationShortcutByHref(href: string) {
  return NAVIGATION_SHORTCUTS.find((shortcutItem) => shortcutItem.href === href);
}

export function getAltShiftShortcutKey(event: KeyboardEvent) {
  if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) {
    return null;
  }

  if (event.key === 'Enter') return 'Enter';
  if (event.key === ' ') return 'Space';
  if (event.key.length === 1) return event.key.toUpperCase();
  return event.key;
}
