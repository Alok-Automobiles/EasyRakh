import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration';

describe('ServiceWorkerRegistration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('unregisters service workers and clears app caches outside production', async () => {
    const unregister = vi.fn().mockResolvedValue(true);
    const getRegistrations = vi.fn().mockResolvedValue([{ unregister }]);
    const cacheDelete = vi.fn().mockResolvedValue(true);

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: null,
        getRegistrations,
      },
    });
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: {
        keys: vi.fn().mockResolvedValue(['easyrakh-v1', 'easyrakh-images', 'third-party-cache']),
        delete: cacheDelete,
      },
    });

    render(<ServiceWorkerRegistration />);

    await waitFor(() => expect(unregister).toHaveBeenCalled());
    await waitFor(() => {
      expect(cacheDelete).toHaveBeenCalledWith('easyrakh-v1');
      expect(cacheDelete).toHaveBeenCalledWith('easyrakh-images');
      expect(cacheDelete).not.toHaveBeenCalledWith('third-party-cache');
    });
  });
});
