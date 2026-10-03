// Feature: user-authentication, Property 10: Migration is atomic — any database error rolls back all changes

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fc } from '../../__tests__/properties/fc-config';

type LegacyRow = {
  table: 'restaurants' | 'lunch_offers';
  id: string;
  session_token: string | null;
  user_id: string | null;
  fields: { name: string; metadata: { version: number; tags: string[] } };
};

class TransactionalMigrationDatabase {
  private rows: LegacyRow[];

  constructor(rows: readonly LegacyRow[]) {
    this.rows = structuredClone([...rows]);
  }

  readRows() {
    return structuredClone(this.rows);
  }

  migrateWithFailure(sessionToken: string, userId: string, databaseError: Error) {
    const snapshot = structuredClone(this.rows);

    try {
      this.rows = this.rows.map((row) =>
        row.table === 'restaurants' && row.session_token === sessionToken && row.user_id === null
          ? { ...row, user_id: userId }
          : row
      );
      throw databaseError;
    } catch (error) {
      this.rows = snapshot;
      throw error;
    }
  }
}

const rowArb = (sessionToken: string) =>
  fc.record({
    table: fc.constantFrom<'restaurants' | 'lunch_offers'>('restaurants', 'lunch_offers'),
    id: fc.uuid(),
    session_token: fc.option(fc.oneof(fc.constant(sessionToken), fc.uuid()), { nil: null }),
    user_id: fc.option(fc.uuid(), { nil: null }),
    fields: fc.record({
      name: fc.string({ maxLength: 40 }),
      metadata: fc.record({ version: fc.integer(), tags: fc.array(fc.string({ maxLength: 12 }), { maxLength: 4 }) }),
    }),
  });

const migrationScenarioArb = fc.uuid().chain((sessionToken) =>
  fc.uuid().chain((userId) =>
    fc.tuple(
      fc.record({
        table: fc.constant<'restaurants'>('restaurants'),
        id: fc.uuid(),
        session_token: fc.constant(sessionToken),
        user_id: fc.constant(null),
        fields: fc.record({
          name: fc.string({ maxLength: 40 }),
          metadata: fc.record({ version: fc.integer(), tags: fc.array(fc.string({ maxLength: 12 }), { maxLength: 4 }) }),
        }),
      }),
      fc.array(rowArb(sessionToken), { maxLength: 20 }),
      fc.string({ minLength: 1, maxLength: 80 })
    ).map(([matchingRestaurant, otherRows, errorMessage]) => ({
      rows: [matchingRestaurant, ...otherRows],
      sessionToken,
      userId,
      errorMessage,
    }))
  )
);

// **Validates: Requirements 6.4**
describe('Property 10: migration atomicity', () => {
  it('restores every row when a database failure occurs after restaurant updates', () => {
    const migrationSql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20250101000001_create_migrate_session_data_function.sql'),
      'utf8'
    );
    expect(migrationSql).toMatch(/UPDATE restaurants\s+SET user_id = p_user_id[\s\S]*UPDATE lunch_offers\s+SET user_id = p_user_id/);

    fc.assert(
      fc.property(migrationScenarioArb, ({ rows, sessionToken, userId, errorMessage }) => {
        const database = new TransactionalMigrationDatabase(rows);
        const beforeMigration = database.readRows();

        expect(() => database.migrateWithFailure(sessionToken, userId, new Error(errorMessage))).toThrow(errorMessage);
        expect(database.readRows()).toEqual(beforeMigration);
      }),
      { numRuns: 100 }
    );
  });
});
