import { describe, expect, it } from 'vitest';
import { stableDatedRequest } from '@/lib/idempotent-client-request';

describe('stableDatedRequest', () => {
  it('keeps the original date and key when the same action is retried after midnight', () => {
    const first = stableDatedRequest(null, 'same-cash-entry', '20-09-2026', () => 'request-one');
    const retry = stableDatedRequest(first, 'same-cash-entry', '21-09-2026', () => 'request-two');

    expect(retry).toBe(first);
    expect(retry).toEqual({ fingerprint: 'same-cash-entry', date: '20-09-2026', key: 'request-one' });
  });

  it('assigns a new date and key when the action details change', () => {
    const first = stableDatedRequest(null, 'first-entry', '20-09-2026', () => 'request-one');
    const next = stableDatedRequest(first, 'changed-entry', '21-09-2026', () => 'request-two');

    expect(next).toEqual({ fingerprint: 'changed-entry', date: '21-09-2026', key: 'request-two' });
  });
});
