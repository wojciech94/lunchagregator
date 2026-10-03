import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  MIGRATION_WARNING_MESSAGE,
  MIGRATION_WARNING_STORAGE_KEY,
} from '@/lib/migration-warning';
import { PostAuthMigrationWarning } from './PostAuthMigrationWarning';

afterEach(() => {
  window.sessionStorage.clear();
});

describe('PostAuthMigrationWarning', () => {
  it('shows the required support message once after an auth redirect', async () => {
    window.sessionStorage.setItem(
      MIGRATION_WARNING_STORAGE_KEY,
      MIGRATION_WARNING_MESSAGE
    );

    render(<PostAuthMigrationWarning />);

    expect(
      await screen.findByText(MIGRATION_WARNING_MESSAGE)
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(window.sessionStorage.getItem(MIGRATION_WARNING_STORAGE_KEY)).toBeNull();
    });
  });
});
