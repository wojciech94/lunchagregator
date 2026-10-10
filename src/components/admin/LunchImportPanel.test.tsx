/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ImportPreviewResult } from '@/lib/lunch-import/types';

const mocks = vi.hoisted(() => ({ preview: vi.fn() }));
vi.mock('@/actions/lunch-import', () => ({ previewLunchImport: mocks.preview }));
import { LunchImportPanel } from './LunchImportPanel';
afterEach(cleanup);

const preview: ImportPreviewResult = {
  success: true,
  data: {
    restaurant: { id: 'sofa-id', name: 'Sofa Lounge & Restaurant', address: 'al. Paderewskiego 35, Wrocław' },
    sourceUrl: 'https://www.sofa.wroclaw.pl/restauracja/sofa-lounge-restaurant',
    fetchedAt: '2026-10-08T06:00:00Z', date: null, conditions: '12–17', extractionMethod: 'ai',
    excerpt: 'Placki z gulaszem lub śmietaną; 40,31 zł',
    warnings: ['Potwierdź datę przed publikacją.'],
    dishes: [{ name: 'Zestaw 1', price: 40.31, items: ['Zupa dnia', 'Placki z gulaszem lub śmietaną'] }],
  },
};

describe('operator import preview', () => {
  it('shows a downloadable exact PDF and hash, and labels the excerpt as AI transcription', async () => {
    if (!preview.success) throw new Error('Invalid fixture');
    const dataUrl = 'data:application/pdf;base64,fixture';
    mocks.preview.mockResolvedValue({ success: true, data: { ...preview.data,
      menuPdf: { dataUrl, assetUrl: 'https://sushicorner.pl/menu.pdf', contentHash: 'b'.repeat(64) },
    } });
    render(<LunchImportPanel enabled />);
    fireEvent.click(screen.getByRole('button', { name: 'Pobierz menu Sofa' }));
    expect(await screen.findByRole('link', { name: 'Pobierz dokładny PDF użyty do odczytu' })).toHaveAttribute('href', dataUrl);
    expect(screen.getByRole('link', { name: 'Otwórz PDF na stronie restauracji' })).toHaveAttribute('href', 'https://sushicorner.pl/menu.pdf');
    expect(screen.getByText(`SHA-256: ${'b'.repeat(64)}`)).toBeInTheDocument();
    expect(screen.getByText('Odczyt AI z PDF — porównaj z oryginałem')).toBeInTheDocument();
    expect(screen.getByText('Data menu: nieznana')).toBeInTheDocument();
  });
  it('shows the exact downloaded image, asset provenance and availability alongside review', async () => {
    if (!preview.success) throw new Error('Invalid fixture');
    const dataUrl = 'data:image/jpeg;base64,fixture';
    mocks.preview.mockResolvedValue({ success: true, data: { ...preview.data,
      conditions: 'w dni robocze do 16:00', menuImage: { dataUrl, assetUrl: 'https://cdn.shopify.com/lunch.jpg', contentHash: 'a'.repeat(64) },
    } });
    render(<LunchImportPanel enabled />);
    fireEvent.click(screen.getByRole('button', { name: 'Pobierz menu Sofa' }));
    expect(await screen.findByRole('img')).toHaveAttribute('src', dataUrl);
    expect(screen.getByText('w dni robocze do 16:00')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Otwórz plik menu' })).toHaveAttribute('href', 'https://cdn.shopify.com/lunch.jpg');
  });
  it('keeps the two source controls and previews independent', async () => {
    mocks.preview.mockResolvedValue(preview);
    render(<><LunchImportPanel enabled /><LunchImportPanel enabled sourceId="sushi" name="Sushi Friends Bar & Resto" address="ul. Marco Polo 9e, Wrocław" label="Sushi Friends" /></>);
    fireEvent.click(screen.getByRole('button', { name: 'Pobierz menu Sushi Friends' }));
    await screen.findByText('Data menu: nieznana');
    expect(mocks.preview).toHaveBeenCalledWith({ sourceId: 'sushi' });
    expect(screen.getByRole('button', { name: 'Pobierz menu Sofa' })).toBeEnabled();
  });
  it.each(['AI chwilowo niedostępne.', 'Menu zbyt długie do analizy AI. Wyświetlamy pełny odczyt HTML.'])('identifies source-derived dishes and their fallback reason: %s', async warning => {
    mocks.preview.mockResolvedValue({ ...preview, data: { ...preview.data, extractionMethod: 'html', warnings: [warning] } });
    render(<LunchImportPanel enabled />);
    fireEvent.click(screen.getByRole('button', { name: 'Pobierz menu Sofa' }));
    expect(await screen.findByRole('heading', { name: 'Dania odczytane ze strony' })).toBeInTheDocument();
    expect(screen.getByText(/bezpośrednio ze strony \(bez analizy AI\)/)).toBeInTheDocument();
    expect(screen.getByText(warning)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Dania rozpoznane przez AI' })).not.toBeInTheDocument();
    expect(screen.getByText('Data menu: nieznana')).toBeInTheDocument();
  });
  it('shows provenance, unknown date and alternatives without a publish control', async () => {
    mocks.preview.mockResolvedValue(preview);
    render(<LunchImportPanel enabled />);
    fireEvent.click(screen.getByRole('button', { name: 'Pobierz menu Sofa' }));
    expect(await screen.findByText('Data menu: nieznana')).toBeInTheDocument();
    expect(screen.getByText('Potwierdź datę przed publikacją.')).toBeInTheDocument();
    expect(screen.getByText('Placki z gulaszem lub śmietaną')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Otwórz źródło menu' })).toHaveAttribute('href', preview.data.sourceUrl);
    expect(screen.queryByRole('button', { name: /publikuj/i })).not.toBeInTheDocument();
  });

  it('blocks repeated clicks while pending and permits retry after failure', async () => {
    let complete: (value: ImportPreviewResult) => void = () => {};
    mocks.preview.mockReturnValue(new Promise<ImportPreviewResult>(resolve => { complete = resolve; }));
    render(<LunchImportPanel enabled />);
    fireEvent.click(screen.getByRole('button', { name: 'Pobierz menu Sofa' }));
    expect(screen.getByRole('button', { name: 'Pobieranie i analiza Sofa…' })).toBeDisabled();
    complete({ success: false, error: 'HTTP 503' });
    expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 503');
    expect(screen.getByRole('button', { name: 'Pobierz menu Sofa' })).toBeEnabled();
    mocks.preview.mockResolvedValue(preview);
    fireEvent.click(screen.getByRole('button', { name: 'Pobierz menu Sofa' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('disables an unconfigured source', () => {
    render(<LunchImportPanel enabled={false} />);
    expect(screen.getByRole('button', { name: 'Pobierz menu Sofa' })).toBeDisabled();
  });
});
