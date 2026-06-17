'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  ACTION_SHORTCUTS,
  LOCAL_ACTION_SHORTCUT_KEYS,
  NAVIGATION_SHORTCUTS,
  getAltShiftShortcutKey,
  getNavigationShortcutByHref,
} from '@/lib/keyboard-shortcuts';

const editableSelector = [
  'input:not([type="hidden"]):not([disabled]):not([readonly])',
  'textarea:not([disabled]):not([readonly])',
  'select:not([disabled]):not([readonly])',
  '[contenteditable="true"]',
].join(',');

const actionSelector = [
  'button:not(:disabled)',
  'a[href]',
  '[role="button"]:not([aria-disabled="true"])',
  '[role="link"]:not([aria-disabled="true"])',
  '[data-slot="select-trigger"]:not([data-disabled])',
].join(',');

const generatedHintAttr = 'data-keyboard-generated-hint';
const shortcutKeyAttr = 'data-keyboard-shortcut-key';
const shortcutDisplayAttr = 'data-keyboard-shortcut-display';

const shortcutByAction = {
  new: ACTION_SHORTCUTS.primary,
  primary: ACTION_SHORTCUTS.primary,
  create: ACTION_SHORTCUTS.primary,
  search: ACTION_SHORTCUTS.focusField,
  submit: ACTION_SHORTCUTS.submit,
  save: ACTION_SHORTCUTS.submit,
  'add-line': ACTION_SHORTCUTS.addLine,
  add: ACTION_SHORTCUTS.addLine,
  browse: ACTION_SHORTCUTS.browse,
  open: ACTION_SHORTCUTS.browse,
  manage: ACTION_SHORTCUTS.browse,
  view: ACTION_SHORTCUTS.browse,
  edit: ACTION_SHORTCUTS.edit,
  delete: ACTION_SHORTCUTS.delete,
  remove: ACTION_SHORTCUTS.delete,
  download: ACTION_SHORTCUTS.download,
  export: ACTION_SHORTCUTS.download,
  share: ACTION_SHORTCUTS.share,
  print: ACTION_SHORTCUTS.print,
  clear: ACTION_SHORTCUTS.clear,
  reset: ACTION_SHORTCUTS.clear,
  previous: ACTION_SHORTCUTS.previous,
  back: ACTION_SHORTCUTS.previous,
  next: ACTION_SHORTCUTS.next,
  cancel: ACTION_SHORTCUTS.cancel,
  close: ACTION_SHORTCUTS.cancel,
} as const;

const excludedEnterInputTypes = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

type ShortcutTooltip = {
  text: string;
  label?: string;
  keys?: string[];
  left: number;
  top: number;
  placement: 'top' | 'bottom';
};

type ShortcutAssignment = {
  key: string;
  display: string;
  aria: string;
  hint: string;
  identity: string;
};

function isHTMLElement(value: EventTarget | null): value is HTMLElement {
  return value instanceof HTMLElement;
}

function isVisible(element: HTMLElement) {
  if (element.closest('[hidden], [aria-hidden="true"]')) return false;
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  return element.getClientRects().length > 0;
}

function isTextEntryElement(element: HTMLElement) {
  if (element.isContentEditable) return true;
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLSelectElement) return true;
  if (element instanceof HTMLInputElement) {
    return !excludedEnterInputTypes.has(element.type);
  }
  return false;
}

function canAdvanceWithEnter(element: HTMLElement) {
  if (!isTextEntryElement(element)) return false;
  if (element instanceof HTMLTextAreaElement) return false;
  if (element instanceof HTMLSelectElement) return false;
  if (element.closest('[data-enter-next="false"]')) return false;
  if (element.closest('[role="combobox"], [role="listbox"], [role="menu"], [data-slot="select-trigger"], [data-slot="select-content"]')) {
    return false;
  }
  return true;
}

function getKeyboardScope(target: HTMLElement) {
  return (
    target.closest<HTMLElement>('[role="dialog"][data-state="open"]') ||
    target.closest<HTMLElement>('form') ||
    document.querySelector<HTMLElement>('main') ||
    document.body
  );
}

function getEditableFields(scope: HTMLElement) {
  return Array.from(scope.querySelectorAll<HTMLElement>(editableSelector)).filter((element) => {
    if (!isVisible(element)) return false;
    return isTextEntryElement(element);
  });
}

function focusElement(element: HTMLElement) {
  element.focus({ preventScroll: false });
  if (element instanceof HTMLInputElement && element.type !== 'date') {
    element.select();
  }
}

function clickElement(element: HTMLElement) {
  element.click();
  return true;
}

function isEnabledVisibleAction(element: HTMLElement) {
  if (!isVisible(element)) return false;
  if (
    (element instanceof HTMLButtonElement ||
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement) &&
    element.disabled
  ) {
    return false;
  }
  if (element.getAttribute('aria-disabled') === 'true') return false;
  return true;
}

function findVisibleElementIn(scope: ParentNode, selector: string) {
  return Array.from(scope.querySelectorAll<HTMLElement>(selector)).find((element) => {
    return isEnabledVisibleAction(element);
  });
}

function findVisibleElement(selector: string) {
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).find((element) => {
    return isEnabledVisibleAction(element);
  });
}

function getElementText(element: HTMLElement) {
  return (element.innerText || element.textContent || element.getAttribute('aria-label') || '').trim();
}

function normalizeShortcutKey(value: string) {
  const key = value
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
    .pop();

  if (!key) return '';
  if (key.length === 1) return key.toUpperCase();
  if (key.toLowerCase() === 'enter') return 'Enter';
  if (key.toLowerCase() === 'delete') return 'Delete';
  if (key.toLowerCase() === 'space') return 'Space';
  return key;
}

function makeShortcutAssignment(
  shortcut: { key: string; display: string; aria: string },
  identity: string
): ShortcutAssignment {
  return {
    key: shortcut.key,
    display: shortcut.display,
    aria: shortcut.aria,
    hint: `Shortcut: ${shortcut.display}`,
    identity,
  };
}

function getElementHref(element: HTMLElement) {
  if (!(element instanceof HTMLAnchorElement)) return '';
  try {
    const url = new URL(element.href, window.location.origin);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return element.getAttribute('href') || '';
  }
}

function isGeneratedShortcut(element: HTMLElement) {
  return element.getAttribute(generatedHintAttr) === 'true';
}

function isAutoShortcutTarget(element: HTMLElement) {
  if (element.matches('[data-slot="select-trigger"]')) return false;
  if (element instanceof HTMLInputElement) return false;
  if (element instanceof HTMLTextAreaElement) return false;
  if (element instanceof HTMLSelectElement) return false;
  if (!element.matches('button, a[href], [role="button"], [role="link"]')) return false;

  const text = getElementText(element);
  return text.length > 0;
}

function getTextActionShortcut(element: HTMLElement) {
  if (!isAutoShortcutTarget(element)) return null;

  const text = getElementText(element).toLowerCase();
  if (!text) return null;

  if (element.closest('form, [role="dialog"]') && isSubmitLike(element)) return ACTION_SHORTCUTS.submit;
  if (/\b(delete|remove|discard)\b/.test(text)) return ACTION_SHORTCUTS.delete;
  if (/\b(download|export|pdf)\b/.test(text)) return ACTION_SHORTCUTS.download;
  if (/\b(share|whatsapp|copy link)\b/.test(text)) return ACTION_SHORTCUTS.share;
  if (/\b(print)\b/.test(text)) return ACTION_SHORTCUTS.print;
  if (/\b(edit|modify)\b/.test(text)) return ACTION_SHORTCUTS.edit;
  if (/\b(clear|reset)\b/.test(text)) return ACTION_SHORTCUTS.clear;
  if (/\b(next|more|load more|show more)\b/.test(text)) return ACTION_SHORTCUTS.next;
  if (/\b(previous|prev|back)\b/.test(text)) return ACTION_SHORTCUTS.previous;
  if (/\b(cancel|close|dismiss)\b/.test(text)) return ACTION_SHORTCUTS.cancel;
  if (/\b(browse|open|manage|view|see all|show all)\b/.test(text)) return ACTION_SHORTCUTS.browse;
  if (/\b(add|new|create|record)\b/.test(text) && !/\b(cancel|delete|remove|back)\b/.test(text)) {
    return ACTION_SHORTCUTS.primary;
  }

  return null;
}

function getBaseShortcutAssignment(element: HTMLElement): ShortcutAssignment | null {
  const explicit = element.getAttribute('data-app-shortcut') || element.getAttribute('aria-keyshortcuts');
  if (explicit) {
    const key = normalizeShortcutKey(explicit);
    if (key) {
      return {
        key,
        display: explicit,
        aria: explicit,
        hint: `Shortcut: ${explicit}`,
        identity: `${element.tagName}:${getElementHref(element)}:${getElementText(element)}`,
      };
    }
  }

  const action = element.getAttribute('data-shortcut-action');
  if (action && action in shortcutByAction) {
    return makeShortcutAssignment(
      shortcutByAction[action as keyof typeof shortcutByAction],
      `action:${action}:${getElementHref(element)}:${getElementText(element)}`
    );
  }

  if (element instanceof HTMLAnchorElement) {
    const navigationShortcut = getNavigationShortcutByHref(element.pathname);
    if (navigationShortcut) {
      return makeShortcutAssignment(navigationShortcut, `href:${element.pathname}`);
    }
  }

  const textShortcut = getTextActionShortcut(element);
  if (textShortcut) {
    return makeShortcutAssignment(
      textShortcut,
      `text:${textShortcut.id}:${getElementHref(element)}:${getElementText(element)}`
    );
  }

  return null;
}

function getAutoShortcutAssignment(element: HTMLElement, usedKeys: Map<string, string>) {
  if (!isAutoShortcutTarget(element)) return null;

  for (const key of LOCAL_ACTION_SHORTCUT_KEYS) {
    if (usedKeys.has(key)) continue;
    const display = `Alt+Shift+${key}`;
    return {
      key,
      display,
      aria: display,
      hint: `Shortcut: ${display}`,
      identity: `auto:${getElementHref(element)}:${getElementText(element)}`,
    };
  }

  return null;
}

function clearGeneratedShortcut(element: HTMLElement) {
  if (!isGeneratedShortcut(element)) return;
  element.removeAttribute('data-keyboard-hint');
  element.removeAttribute(generatedHintAttr);
  element.removeAttribute(shortcutKeyAttr);
  element.removeAttribute(shortcutDisplayAttr);
  element.removeAttribute('aria-keyshortcuts');
}

function setShortcutAssignment(element: HTMLElement, assignment: ShortcutAssignment) {
  element.setAttribute('data-keyboard-hint', assignment.hint);
  element.setAttribute(generatedHintAttr, 'true');
  element.setAttribute(shortcutKeyAttr, assignment.key);
  element.setAttribute(shortcutDisplayAttr, assignment.display);
  element.setAttribute('aria-keyshortcuts', assignment.aria);
}

function getActiveActionScope() {
  const activeElement = document.activeElement;
  return (
    document.querySelector<HTMLElement>('[role="dialog"][data-state="open"]') ||
    (activeElement instanceof HTMLElement ? activeElement.closest<HTMLElement>('form') : null) ||
    document.querySelector<HTMLElement>('main') ||
    document.body
  );
}

function getActiveSubmitScope() {
  const activeElement = document.activeElement;
  return (
    document.querySelector<HTMLElement>('[role="dialog"][data-state="open"]') ||
    (activeElement instanceof HTMLElement ? activeElement.closest<HTMLElement>('form') : null)
  );
}

function findPrimaryAction() {
  const scope = getActiveActionScope();
  const explicit =
    findVisibleElementIn(scope, '[data-shortcut-action="new"]') ||
    findVisibleElement('[data-shortcut-action="new"]');
  if (explicit) return explicit;

  return Array.from(scope.querySelectorAll<HTMLElement>(actionSelector)).find((element) => {
    if (!isEnabledVisibleAction(element)) return false;
    const text = getElementText(element).toLowerCase();
    return /\b(add|new|create)\b/.test(text) && !/\b(cancel|delete|remove|back)\b/.test(text);
  });
}

function isSubmitLike(element: HTMLElement) {
  if (element.getAttribute('data-shortcut-action') === 'new') return false;
  if (element instanceof HTMLButtonElement && element.type === 'submit') return true;
  if (element instanceof HTMLInputElement && element.type === 'submit') return true;
  const text = getElementText(element).toLowerCase();
  return /\b(save|submit|create|update|login|register|send|reset|confirm)\b/.test(text);
}

function findSubmitAction() {
  const explicit = findVisibleElement('[data-shortcut-action="submit"]');
  if (explicit) return explicit;

  const scope = getActiveSubmitScope();
  if (!scope) return undefined;

  return Array.from(scope.querySelectorAll<HTMLElement>(actionSelector)).find((element) => {
    if (!isVisible(element)) return false;
    return isSubmitLike(element);
  });
}

function findShortcutActionIn(scope: ParentNode, shortcutKey: string) {
  return Array.from(scope.querySelectorAll<HTMLElement>(`[${shortcutKeyAttr}]`)).find((element) => {
    if (element.getAttribute(shortcutKeyAttr) !== shortcutKey) return false;
    return isEnabledVisibleAction(element);
  });
}

function findShortcutAction(shortcutKey: string) {
  const scope = getActiveActionScope();
  return findShortcutActionIn(scope, shortcutKey) || findShortcutActionIn(document, shortcutKey);
}

function focusFirstField() {
  const explicit =
    findVisibleElement('[data-shortcut-action="search"], [data-global-search-input]') ||
    findVisibleElement('input[type="search"], input[placeholder*="Search"], input[placeholder*="search"]');

  if (explicit) {
    focusElement(explicit);
    return true;
  }

  const scope =
    document.querySelector<HTMLElement>('[role="dialog"][data-state="open"]') ||
    document.querySelector<HTMLElement>('main') ||
    document.body;
  const firstField = getEditableFields(scope)[0];
  if (!firstField) return false;
  focusElement(firstField);
  return true;
}

function handleEnterAdvance(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) {
    return false;
  }

  const target = event.target;
  if (!isHTMLElement(target) || !canAdvanceWithEnter(target)) return false;

  const fields = getEditableFields(getKeyboardScope(target));
  const currentIndex = fields.indexOf(target);
  if (currentIndex < 0) return false;

  const nextIndex = event.shiftKey ? currentIndex - 1 : currentIndex + 1;
  const nextField = fields[nextIndex];
  if (!nextField) return false;

  event.preventDefault();
  focusElement(nextField);
  return true;
}

function getShortcutHint(element: HTMLElement) {
  const generatedDisplay = element.getAttribute(shortcutDisplayAttr);
  if (generatedDisplay) return `Shortcut: ${generatedDisplay}`;

  const assignment = getBaseShortcutAssignment(element);
  return assignment?.hint || '';
}

function getHintElement(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>(`[data-keyboard-hint], ${actionSelector}`);
}

function getTooltipText(element: HTMLElement) {
  const existing = element.getAttribute('data-keyboard-hint');
  const computed = getShortcutHint(element);
  const text = existing || computed;

  if (computed && existing !== computed) {
    element.setAttribute('data-keyboard-hint', computed);
  }

  return text;
}

function getTooltipContent(text: string) {
  const [rawLabel, rawKeys] = text.includes(':') ? text.split(/:(.+)/) : ['Shortcut', text];
  const label = rawLabel.trim() || 'Shortcut';
  const keyText = (rawKeys || text).trim();
  const keys = keyText
    .split('+')
    .map((key) => key.trim())
    .filter(Boolean);

  return {
    text,
    label,
    keys: keys.length > 0 ? keys : [keyText],
  };
}

function applyKeyboardHints() {
  const usedKeys = new Map<string, string>();
  const elements = Array.from(document.querySelectorAll<HTMLElement>(actionSelector)).filter(isEnabledVisibleAction);

  elements.forEach((element) => {
    let assignment = getBaseShortcutAssignment(element);

    if (assignment) {
      const usedIdentity = usedKeys.get(assignment.key);
      if (usedIdentity && usedIdentity !== assignment.identity) {
        assignment = getAutoShortcutAssignment(element, usedKeys);
      }
    } else {
      assignment = getAutoShortcutAssignment(element, usedKeys);
    }

    if (!assignment) {
      clearGeneratedShortcut(element);
      return;
    }

    usedKeys.set(assignment.key, assignment.identity);
    setShortcutAssignment(element, assignment);

    const originalTitle = element.getAttribute('data-keyboard-original-title') || '';
    const currentTitle = element.getAttribute('title');
    const oldGeneratedTitle = originalTitle ? `${originalTitle} (${assignment.hint})` : assignment.hint;

    if (!element.hasAttribute('data-keyboard-original-title')) {
      element.setAttribute('data-keyboard-original-title', currentTitle || '');
    }

    if (currentTitle === assignment.hint || currentTitle === oldGeneratedTitle) {
      if (originalTitle) {
        element.setAttribute('title', originalTitle);
      } else {
        element.removeAttribute('title');
      }
    }
  });
}

export default function KeyboardNavigation() {
  const router = useRouter();
  const [tooltip, setTooltip] = useState<ShortcutTooltip | null>(null);

  useEffect(() => {
    const routeByKey = new Map(NAVIGATION_SHORTCUTS.map((shortcut) => [shortcut.key, shortcut.href]));
    let hintFrame = 0;

    const scheduleHints = () => {
      window.cancelAnimationFrame(hintFrame);
      hintFrame = window.requestAnimationFrame(applyKeyboardHints);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (handleEnterAdvance(event)) return;

      const shortcutKey = getAltShiftShortcutKey(event);
      if (!shortcutKey || event.defaultPrevented) return;

      applyKeyboardHints();

      const shortcutAction = findShortcutAction(shortcutKey);
      if (shortcutAction) {
        event.preventDefault();
        clickElement(shortcutAction);
        return;
      }

      if (shortcutKey === ACTION_SHORTCUTS.submit.key) {
        const submitAction = findSubmitAction();
        if (submitAction) {
          event.preventDefault();
          clickElement(submitAction);
        }
        return;
      }

      if (shortcutKey === ACTION_SHORTCUTS.focusField.key) {
        event.preventDefault();
        focusFirstField();
        return;
      }

      if (shortcutKey === ACTION_SHORTCUTS.primary.key) {
        const primaryAction = findPrimaryAction();
        if (primaryAction) {
          event.preventDefault();
          clickElement(primaryAction);
        }
        return;
      }

      if (shortcutKey === ACTION_SHORTCUTS.addLine.key) {
        const addLineAction = findVisibleElement('[data-shortcut-action="add-line"]');
        if (addLineAction) {
          event.preventDefault();
          clickElement(addLineAction);
        }
        return;
      }

      if (shortcutKey === ACTION_SHORTCUTS.edit.key) {
        const editAction = findVisibleElement('[data-shortcut-action="edit"]');
        if (editAction) {
          event.preventDefault();
          clickElement(editAction);
        }
        return;
      }

      if (shortcutKey === ACTION_SHORTCUTS.download.key) {
        const downloadAction = findVisibleElement('[data-shortcut-action="download"]');
        if (downloadAction) {
          event.preventDefault();
          clickElement(downloadAction);
        }
        return;
      }

      const href = routeByKey.get(shortcutKey);
      if (href) {
        event.preventDefault();
        router.push(href);
      }
    };

    scheduleHints();
    const observer = new MutationObserver(scheduleHints);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      observer.disconnect();
      window.cancelAnimationFrame(hintFrame);
    };
  }, [router]);

  useEffect(() => {
    const showTooltip = (element: HTMLElement) => {
      const text = getTooltipText(element);
      if (!text || !isVisible(element)) {
        setTooltip(null);
        return;
      }

      const rect = element.getBoundingClientRect();
      const left = Math.min(Math.max(rect.left + rect.width / 2, 24), window.innerWidth - 24);
      const placement = rect.bottom + 56 > window.innerHeight && rect.top > 56 ? 'top' : 'bottom';
      const top = placement === 'top' ? rect.top - 10 : rect.bottom + 10;
      const content = getTooltipContent(text);

      setTooltip({ ...content, left, top, placement });
    };

    const onPointerOver = (event: PointerEvent) => {
      const element = getHintElement(event.target);
      if (element) showTooltip(element);
    };

    const onPointerMove = (event: PointerEvent) => {
      const element = getHintElement(event.target);
      if (element) showTooltip(element);
    };

    const onPointerOut = (event: PointerEvent) => {
      const element = getHintElement(event.target);
      const related = getHintElement(event.relatedTarget);
      if (element && related === element) return;
      setTooltip(null);
    };

    const onMouseOver = (event: MouseEvent) => {
      const element = getHintElement(event.target);
      if (element) showTooltip(element);
    };

    const onMouseMove = (event: MouseEvent) => {
      const element = getHintElement(event.target);
      if (element) showTooltip(element);
    };

    const onMouseOut = (event: MouseEvent) => {
      const element = getHintElement(event.target);
      const related = getHintElement(event.relatedTarget);
      if (element && related === element) return;
      setTooltip(null);
    };

    const onFocusIn = (event: FocusEvent) => {
      const element = getHintElement(event.target);
      if (element) showTooltip(element);
    };

    const onFocusOut = (event: FocusEvent) => {
      const element = getHintElement(event.target);
      const related = getHintElement(event.relatedTarget);
      if (element && related === element) return;
      setTooltip(null);
    };

    const hideTooltip = () => setTooltip(null);

    document.addEventListener('pointerover', onPointerOver);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerout', onPointerOut);
    document.addEventListener('mouseover', onMouseOver);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseout', onMouseOut);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    window.addEventListener('scroll', hideTooltip, true);
    window.addEventListener('resize', hideTooltip);

    return () => {
      document.removeEventListener('pointerover', onPointerOver);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerout', onPointerOut);
      document.removeEventListener('mouseover', onMouseOver);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseout', onMouseOut);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      window.removeEventListener('scroll', hideTooltip, true);
      window.removeEventListener('resize', hideTooltip);
    };
  }, []);

  if (!tooltip || typeof document === 'undefined') return null;

  const fallbackContent = getTooltipContent(tooltip.text);
  const label = tooltip.label || fallbackContent.label;
  const keys = tooltip.keys?.length ? tooltip.keys : fallbackContent.keys;

  return createPortal(
    <div
      className="keyboard-shortcut-tooltip"
      data-placement={tooltip.placement}
      style={{ left: tooltip.left, top: tooltip.top }}
      role="tooltip"
      aria-hidden="true"
    >
      <span className="keyboard-shortcut-tooltip__label">{label}</span>
      <span className="keyboard-shortcut-tooltip__keys" aria-label={tooltip.text}>
        {keys.map((key, index) => (
          <span className="keyboard-shortcut-tooltip__key-group" key={`${key}-${index}`}>
            {index > 0 && <span className="keyboard-shortcut-tooltip__plus">+</span>}
            <kbd className="keyboard-shortcut-tooltip__key">{key}</kbd>
          </span>
        ))}
      </span>
    </div>,
    document.body
  );
}
