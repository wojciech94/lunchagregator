/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getAdmin: async () => ({ id: 'admin' }) }));
vi.mock('@/actions/admin', () => ({ listAuditLog: mocks.list }));
import AdminLogsPage from '@/app/admin/logs/page';

it('shows binding creation, correct Restaurant link, actor and superseded evidence', async () => {
  mocks.list.mockResolvedValue({ rows: [{ id: 'log', actorId: 'acting-admin', action: 'insert',
    tableName: 'lunch_import_bindings', recordId: 'restaurant-uuid', createdAt: '2026-10-09T05:00:00Z',
    before: { verification_note: 'Old evidence' }, after: { verification_note: 'New evidence', enabled: true } }],
    total: 1, page: 1, pageSize: 50 });
  render(await AdminLogsPage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByText('utworzenie')).toBeInTheDocument();
  expect(screen.getByText('źródła importu')).toBeInTheDocument();
  expect(screen.getByText('acting-admin')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'restaura' })).toHaveAttribute('href', '/restaurants/restaurant-uuid');
  const details = screen.getByText('Stan przed i po zmianie').closest('details');
  expect(details?.textContent).toContain('Old evidence');
  expect(details?.textContent).toContain('New evidence');
});
