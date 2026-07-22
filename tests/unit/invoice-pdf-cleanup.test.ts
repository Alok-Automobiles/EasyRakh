import { describe, expect, it } from 'vitest';
import { transactionCommitMayBeUnknown } from '@/lib/invoice-pdf-cleanup';

describe('invoice PDF transaction cleanup safety', () => {
  it('keeps uploaded files when MongoDB cannot confirm whether commit succeeded', () => {
    expect(transactionCommitMayBeUnknown({
      errorLabels: ['UnknownTransactionCommitResult'],
    })).toBe(true);
    expect(transactionCommitMayBeUnknown({
      hasErrorLabel: (label: string) => label === 'UnknownTransactionCommitResult',
    })).toBe(true);
  });

  it('allows cleanup for normal validation or transaction errors', () => {
    expect(transactionCommitMayBeUnknown(new Error('validation failed'))).toBe(false);
  });
});
