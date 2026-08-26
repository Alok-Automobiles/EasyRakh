import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Input } from '@/components/ui/input';
import { parseNumberInput } from '@/lib/number-input';
import { useState } from 'react';

function ClearableNumberHarness() {
  const [value, setValue] = useState<number | undefined>(5);

  return (
    <Input
      aria-label="Amount"
      type="number"
      inputMode="decimal"
      min="0"
      step="0.01"
      value={value ?? ''}
      onChange={(event) => setValue(parseNumberInput(event.target.value))}
    />
  );
}

describe('Input number handling', () => {
  it('blocks exponent and signed characters for non-negative number inputs', () => {
    const onKeyDown = vi.fn();
    render(
      <Input
        aria-label="Amount"
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        onKeyDown={onKeyDown}
      />
    );

    const input = screen.getByLabelText('Amount');

    expect(fireEvent.keyDown(input, { key: 'e' })).toBe(false);
    expect(fireEvent.keyDown(input, { key: 'E' })).toBe(false);
    expect(fireEvent.keyDown(input, { key: '+' })).toBe(false);
    expect(fireEvent.keyDown(input, { key: '-' })).toBe(false);
    expect(onKeyDown).not.toHaveBeenCalled();

    expect(fireEvent.keyDown(input, { key: '1' })).toBe(true);
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });

  it('blocks decimal separators on integer inputs', () => {
    render(
      <Input
        aria-label="Quantity"
        type="number"
        inputMode="numeric"
        min="0"
        step="1"
      />
    );

    const input = screen.getByLabelText('Quantity');

    expect(fireEvent.keyDown(input, { key: '.' })).toBe(false);
    expect(fireEvent.keyDown(input, { key: ',' })).toBe(false);
    expect(fireEvent.keyDown(input, { key: '4' })).toBe(true);
  });

  it('blocks arrow keys from stepping number inputs', () => {
    const onKeyDown = vi.fn();
    render(
      <Input
        aria-label="Quantity"
        type="number"
        inputMode="numeric"
        min="0"
        step="1"
        onKeyDown={onKeyDown}
      />
    );

    const input = screen.getByLabelText('Quantity');

    expect(fireEvent.keyDown(input, { key: 'ArrowUp' })).toBe(false);
    expect(fireEvent.keyDown(input, { key: 'ArrowDown' })).toBe(false);
    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it('blurs a focused number input before the browser handles a wheel event', () => {
    const onWheel = vi.fn();
    render(
      <Input
        aria-label="Quantity"
        type="number"
        defaultValue="5"
        onWheel={onWheel}
      />
    );

    const input = screen.getByLabelText('Quantity');
    input.focus();
    expect(input).toHaveFocus();

    fireEvent.wheel(input, { deltaY: 100 });

    expect(input).not.toHaveFocus();
    expect(input).toHaveValue(5);
    expect(onWheel).toHaveBeenCalledTimes(1);
  });

  it('blocks invalid pasted number values', () => {
    const onPaste = vi.fn();
    render(
      <Input
        aria-label="Amount"
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        onPaste={onPaste}
      />
    );

    const input = screen.getByLabelText('Amount');

    expect(
      fireEvent.paste(input, {
        clipboardData: {
          getData: () => '1e5',
        },
      })
    ).toBe(false);
    expect(onPaste).not.toHaveBeenCalled();

    expect(
      fireEvent.paste(input, {
        clipboardData: {
          getData: () => '125.50',
        },
      })
    ).toBe(true);
    expect(onPaste).toHaveBeenCalledTimes(1);
  });

  it('allows a controlled numeric value to be cleared fully', () => {
    render(<ClearableNumberHarness />);

    const input = screen.getByLabelText('Amount');
    expect(input).toHaveValue(5);

    fireEvent.change(input, { target: { value: '' } });

    expect(input).toHaveValue(null);
  });
});
