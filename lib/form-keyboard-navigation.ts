import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

const focusableFormSelector = [
  'input:not([type="button"]):not([type="checkbox"]):not([type="file"]):not([type="hidden"]):not([type="radio"]):not([type="reset"]):not([type="submit"]):not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[data-slot="select-trigger"]:not([disabled]):not([data-disabled])',
  'button[type="submit"]:not([disabled])',
  '[data-form-advance]:not([disabled])',
].join(',');

function isHTMLElement(value: EventTarget | Element | null): value is HTMLElement {
  return value instanceof HTMLElement;
}

function isVisible(element: HTMLElement) {
  if (element.hasAttribute('hidden')) return false;
  if (element.getAttribute('aria-hidden') === 'true') return false;
  if (element.closest('[hidden], [aria-hidden="true"], [data-form-navigation-skip]')) return false;

  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function getNavigationRoot(element: HTMLElement) {
  return (
    element.closest<HTMLElement>('form') ||
    element.closest<HTMLElement>('[data-form-navigation-root]') ||
    element.closest<HTMLElement>('[data-slot="dialog-content"]') ||
    document.body
  );
}

function getFocusableFormElements(root: HTMLElement) {
  const elements = Array.from(root.querySelectorAll<HTMLElement>(focusableFormSelector));
  return elements.filter((element, index, list) => {
    if (list.indexOf(element) !== index) return false;
    if (element.tabIndex < 0) return false;
    return isVisible(element);
  });
}

function focusRelativeTo(element: HTMLElement, direction: 1 | -1) {
  const root = getNavigationRoot(element);
  const elements = getFocusableFormElements(root);
  const current = element.closest<HTMLElement>(focusableFormSelector) || element;
  const index = elements.findIndex((candidate) => candidate === current);
  if (index < 0) return;

  const next = elements[index + direction];
  next?.focus();
}

export function focusNextFormField(element: HTMLElement | null) {
  if (!element) return;
  focusRelativeTo(element, 1);
}

export function focusPreviousFormField(element: HTMLElement | null) {
  if (!element) return;
  focusRelativeTo(element, -1);
}

export function focusNextFormFieldAfterSelect(element: HTMLElement | null) {
  if (!element) return;

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => focusNextFormField(element));
  });
}

export function handleEnterToNextFormField(event: ReactKeyboardEvent<HTMLElement>) {
  if (event.key !== 'Enter') return;
  if (event.altKey || event.ctrlKey || event.metaKey) return;

  const target = event.target;
  if (!isHTMLElement(target)) return;
  if (target.closest('[data-slot="select-content"]')) return;
  if (target.closest('[data-slot="select-trigger"]')) return;

  const tagName = target.tagName;

  if (tagName === 'BUTTON') {
    return;
  }

  if (tagName === 'INPUT') {
    const input = target as HTMLInputElement;
    if (['button', 'checkbox', 'file', 'hidden', 'radio', 'reset', 'submit'].includes(input.type)) {
      return;
    }
  } else if (tagName !== 'TEXTAREA' && tagName !== 'SELECT' && !target.hasAttribute('data-form-advance')) {
    return;
  }

  event.preventDefault();

  if (event.shiftKey) {
    focusPreviousFormField(target);
  } else {
    focusNextFormField(target);
  }
}
