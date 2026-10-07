/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ analyzeTextAction: vi.fn() }));
vi.mock('@/actions/analyze', () => ({ analyzeTextAction: mocks.analyzeTextAction, analyzeUrlAction: vi.fn(), analyzeImageAction: vi.fn() }));
import AddOfferPage from '@/components/add-offer/AddOfferWizard';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('retains the original text and input mode after an analysis failure', async () => {
  mocks.analyzeTextAction.mockResolvedValue({ success: false, error: 'AI jest chwilowo niedostępne.' });
  render(<AddOfferPage />);
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Tekst' }), { button: 0, ctrlKey: false });
  const input = await screen.findByRole('textbox', { name: /Wklej tekst/ });
  fireEvent.change(input, { target: { value: 'Restauracja: Pizza Si. Lunch: Margherita, 34 zł.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Analizuj' }));
  await screen.findByText('AI jest chwilowo niedostępne.');
  expect(screen.getByRole('tab', { name: 'Tekst' })).toHaveAttribute('data-state', 'active');
  expect(screen.getByRole('textbox', { name: /Wklej tekst/ })).toHaveValue('Restauracja: Pizza Si. Lunch: Margherita, 34 zł.');
});
