import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EntityCard from '@/components/EntityCard';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

describe('EntityCard', () => {
  beforeEach(() => {
    pushMock.mockClear();
  });

  const entity = {
    id: 'customer-1',
    name: 'Raj Traders',
    phone: '9876543210',
    email: 'raj@example.com',
    address: 'Main market',
    totalBalance: -3200,
  };

  it('renders contact information and signed balance', () => {
    render(
      <EntityCard
        entity={entity}
        entityType="customer"
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText('Raj Traders')).toBeInTheDocument();
    expect(screen.getByText('9876543210')).toBeInTheDocument();
    expect(screen.getByText('raj@example.com')).toBeInTheDocument();
    expect(screen.getByText('Main market')).toBeInTheDocument();
    expect(screen.getByText('-₹3,200')).toBeInTheDocument();
  });

  it('navigates to the ledger when the card is clicked', async () => {
    const user = userEvent.setup();
    render(
      <EntityCard
        entity={entity}
        entityType="customer"
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    await user.click(screen.getByText('Raj Traders'));

    expect(pushMock).toHaveBeenCalledWith('/ledger/customer/customer-1');
  });

  it('does not navigate when edit or delete actions are clicked', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const { container } = render(
      <EntityCard
        entity={entity}
        entityType="customer"
        onEdit={onEdit}
        onDelete={onDelete}
      />
    );
    const [editButton, deleteButton] = Array.from(container.querySelectorAll('button'));

    await user.click(editButton);
    await user.click(deleteButton);

    expect(onEdit).toHaveBeenCalledWith('customer-1');
    expect(onDelete).toHaveBeenCalledWith('customer-1');
    expect(pushMock).not.toHaveBeenCalled();
  });
});
