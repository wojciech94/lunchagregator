/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const mocks = vi.hoisted(() => ({ publish: vi.fn() }));
vi.mock('@/actions/publish-lunch-import', () => ({ publishLunchImport: mocks.publish }));
import { LunchImportReview } from './LunchImportReview';
afterEach(cleanup);
const review = { receipt: 'signed-preview', dishes: [
  { itemKey: 'a'.repeat(64), name: 'Set 1', price: 31, description: 'Fish or tofu', items: ['Soup or wakame'] },
  { itemKey: 'b'.repeat(64), name: 'Set 2', price: 32 },
] };
function approve() {
  fireEvent.change(screen.getByLabelText('Potwierdzona data dostępności'), { target: { value: new Date().toISOString().slice(0, 10) } });
  fireEvent.click(screen.getByRole('checkbox', { name: /Potwierdzam dostępność/ }));
}
describe('operator publication review', () => {
  it('requires explicit date/approval and resets approval after a correction', () => {
    render(<LunchImportReview review={review} onBusyChange={vi.fn()} />);
    const publish = screen.getByRole('button', { name: 'Opublikuj zatwierdzone pozycje' });
    expect(publish).toBeDisabled(); approve(); expect(publish).toBeEnabled();
    fireEvent.change(screen.getAllByLabelText('Cena w PLN')[0], { target: { value: '29,50' } });
    expect(publish).toBeDisabled();
    expect(screen.getByDisplayValue('Soup or wakame')).toBeInTheDocument();
  });
  it('locks the publication date, reports partial saves and retries only missing items', async () => {
    mocks.publish.mockResolvedValueOnce({ success: true, data: { saved: [{ itemKey: review.dishes[0].itemKey, offerId: 'saved', existing: false, missingCoordinates: false }],
      failed: [{ itemKey: review.dishes[1].itemKey, error: 'Retry me' }] } });
    mocks.publish.mockResolvedValueOnce({ success: true, data: { saved: [{ itemKey: review.dishes[1].itemKey, offerId: 'existing', existing: true, missingCoordinates: false }], failed: [] } });
    render(<LunchImportReview review={review} onBusyChange={vi.fn()} />); approve();
    fireEvent.click(screen.getByRole('button', { name: 'Opublikuj zatwierdzone pozycje' }));
    expect(await screen.findByText('Retry me')).toBeInTheDocument();
    expect(screen.getByLabelText('Potwierdzona data dostępności')).toBeDisabled();
    expect(screen.getAllByLabelText('Nazwa dania')[0]).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Ponów niezapisane pozycje' }));
    await screen.findByText('Już opublikowano — zachowano istniejącą ofertę.');
    expect(mocks.publish.mock.calls[1][0].dishes).toHaveLength(1);
    expect(mocks.publish.mock.calls[1][0].dishes[0].itemKey).toBe(review.dishes[1].itemKey);
  });
  it('preserves the same payload for retry after an ambiguous network failure', async () => {
    mocks.publish.mockRejectedValueOnce(new Error('network'));
    mocks.publish.mockResolvedValueOnce({ success: true, data: { saved: [], failed: [] } });
    render(<LunchImportReview review={review} onBusyChange={vi.fn()} />); approve();
    fireEvent.click(screen.getByRole('button', { name: 'Opublikuj zatwierdzone pozycje' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Ponów niezapisane pozycje' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ponów niezapisane pozycje' })).toBeEnabled());
    expect(mocks.publish.mock.calls[1][0]).toEqual(mocks.publish.mock.calls[0][0]);
  });
});
