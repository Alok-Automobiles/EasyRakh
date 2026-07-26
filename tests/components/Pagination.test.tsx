import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Pagination } from '@/components/ui/pagination';

describe('Pagination', () => {
  it('jumps directly to any requested page', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();

    render(
      <Pagination currentPage={1} totalPages={50} onPageChange={onPageChange} />
    );

    const pageInput = screen.getByLabelText('Current page. Enter a number from 1 to 50');
    await user.clear(pageInput);
    await user.type(pageInput, '37');
    await user.keyboard('{Enter}');

    expect(onPageChange).toHaveBeenCalledWith(37);
  });

  it('shows the editable current page and total in a compact control', () => {
    render(
      <Pagination currentPage={37} totalPages={50} onPageChange={vi.fn()} />
    );

    expect(screen.getByLabelText('Current page. Enter a number from 1 to 50')).toHaveValue(37);
    expect(screen.getByText('out of 50')).toBeInTheDocument();
  });

  it('applies an edited page when the field loses focus', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();

    render(
      <Pagination currentPage={1} totalPages={12} onPageChange={onPageChange} />
    );

    const pageInput = screen.getByLabelText('Current page. Enter a number from 1 to 12');
    await user.clear(pageInput);
    await user.type(pageInput, '8');
    await user.tab();

    expect(onPageChange).toHaveBeenCalledWith(8);
  });

  it('supports previous and next icon navigation', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();

    render(
      <Pagination currentPage={5} totalPages={12} onPageChange={onPageChange} />
    );

    await user.click(screen.getByRole('button', { name: 'Previous page' }));
    await user.click(screen.getByRole('button', { name: 'Next page' }));

    expect(onPageChange).toHaveBeenNthCalledWith(1, 4);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 6);
  });

  it('clamps an out-of-range page to the final page', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();

    render(
      <Pagination currentPage={1} totalPages={12} onPageChange={onPageChange} />
    );

    const pageInput = screen.getByLabelText('Current page. Enter a number from 1 to 12');
    await user.clear(pageInput);
    await user.type(pageInput, '99');
    await user.tab();

    expect(onPageChange).toHaveBeenCalledWith(12);
  });

  it('does not render when there is only one page', () => {
    const { container } = render(
      <Pagination currentPage={1} totalPages={1} onPageChange={vi.fn()} />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
