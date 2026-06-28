import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InstallPrompt from '@/components/InstallPrompt';

function dispatchInstallPrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: ReturnType<typeof vi.fn>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  };
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome });
  window.dispatchEvent(event);
  return event;
}

async function showPrompt(eventOutcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = dispatchInstallPrompt(eventOutcome);
  await act(async () => {
    vi.advanceTimersByTime(2000);
    vi.advanceTimersByTime(1);
  });
  return event;
}

describe('InstallPrompt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-28T10:00:00.000Z'));
    localStorage.clear();
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: (callback: FrameRequestCallback) => window.setTimeout(callback, 0),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not show when the prompt was dismissed inside the cooldown window', async () => {
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
    render(<InstallPrompt />);

    await showPrompt();

    expect(screen.queryByRole('dialog', { name: 'Install EasyRakh app' })).not.toBeInTheDocument();
  });

  it('prompts the native installer and hides after the install is accepted', async () => {
    render(<InstallPrompt />);

    const event = await showPrompt('accepted');

    expect(screen.getByRole('dialog', { name: 'Install EasyRakh app' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^install$/i }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(event.prompt).toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Install EasyRakh app' })).not.toBeInTheDocument();
  });

  it('stores a dismissal timestamp after the close animation', async () => {
    render(<InstallPrompt />);
    await showPrompt();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss install prompt' }));
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(localStorage.getItem('pwa-install-dismissed')).toBe(Date.now().toString());
    expect(screen.queryByRole('dialog', { name: 'Install EasyRakh app' })).not.toBeInTheDocument();
  });
});
