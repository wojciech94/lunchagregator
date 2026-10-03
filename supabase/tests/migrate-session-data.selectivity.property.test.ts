// Feature: user-authentication, Property 9: Migration updates only user_id on matching NULL records and leaves all other fields unchanged

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fc } from '../../__tests__/properties/fc-config';

type LegacyRecord = {
  table: 'restaurants' | 'lunch_offers';
  id: string;
  session_token: string | null;
  user_id: string | null;
  fields: {
    name: string;
    description: string | null;
    tags: string[];
    metadata: { created_at: string; version: number };
  };
};

const otherToken = (sessionToken: string) =>
  fc.uuid().filter((candidate) => candidate !== sessionToken);

const preservedFieldsArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 40 }),
  description: fc.option(fc.string({ maxLength: 80 }), { nil: null }),
  tags: fc.array(fc.string({ maxLength: 12 }), { maxLength: 4 }),
  metadata: fc.record({
    created_at: fc
      .integer({ min: Date.UTC(2020, 0, 1), max: Date.UTC(2030, 0, 1) })
      .map((timestamp) => new Date(timestamp).toISOString()),
    version: fc.integer({ min: 0, max: 100 }),
  }),
});

const recordArb = (sessionToken: string, targetUserId: string, kind: 'matching-unowned' | 'matching-owned' | 'other-unowned' | 'other-owned') =>
  fc.tuple(fc.constantFrom('restaurants', 'lunch_offers'), fc.uuid(), preservedFieldsArb, otherToken(sessionToken), fc.uuid()).map(
    ([table, id, fields, nonMatchingToken, existingUserId]): LegacyRecord => ({
      table,
      id,
      fields,
      session_token: kind.startsWith('matching') ? sessionToken : nonMatchingToken,
      user_id: kind.endsWith('unowned') ? null : existingUserId === targetUserId ? `${existingUserId}-owner` : existingUserId,
    })
  );

const migrateSessionData = (records: readonly LegacyRecord[], sessionToken: string, userId: string): LegacyRecord[] =>
  records.map((record) =>
    record.session_token === sessionToken && record.user_id === null
      ? { ...record, user_id: userId }
      : record
  );

const mixedRecordsArb = (
  sessionToken: string,
  userId: string
): fc.Arbitrary<LegacyRecord[]> => {
  const kinds = ['matching-unowned', 'matching-owned', 'other-unowned', 'other-owned'] as const;
  const additionalRecordsArb: fc.Arbitrary<LegacyRecord[]> = fc.array(
    fc.constantFrom(...kinds).chain((kind) => recordArb(sessionToken, userId, kind)),
    { maxLength: 20 }
  );

  // The four fixed-shape records go in an inner tuple rather than being
  // spread as separate arguments to fc.tuple. Spreading loses the arity,
  // so the trailing `additional` element widens to
  // `LegacyRecord | LegacyRecord[]` and poisons every later use.
  const fixedRecordsArb = fc.tuple(...kinds.map((kind) => recordArb(sessionToken, userId, kind)));

  return fc
    .tuple(fixedRecordsArb, additionalRecordsArb)
    .map(([fixed, additional]) => [...fixed, ...additional]);
};

const migrationScenarioArb = fc.uuid().chain((sessionToken) =>
  fc.uuid().chain((userId) =>
    mixedRecordsArb(sessionToken, userId).map((records) => ({ records, sessionToken, userId }))
  )
);

// **Validates: Requirements 6.2, 6.5, 6.6**
describe('Property 9: migration selectivity and field preservation', () => {
  it('updates only matching unowned records and preserves every other field', () => {
    const migrationSql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20250101000001_create_migrate_session_data_function.sql'),
      'utf8'
    );
    expect(migrationSql).toMatch(/UPDATE restaurants\s+SET user_id = p_user_id\s+WHERE session_token = p_session_token\s+AND user_id IS NULL;/);
    expect(migrationSql).toMatch(/UPDATE lunch_offers\s+SET user_id = p_user_id\s+WHERE session_token = p_session_token\s+AND user_id IS NULL;/);

    fc.assert(
      fc.property(migrationScenarioArb, ({ records, sessionToken, userId }) => {
        const migrated = migrateSessionData(records, sessionToken, userId);

        migrated.forEach((record, index) => {
          const original = records[index];
          const shouldMigrate = original.session_token === sessionToken && original.user_id === null;

          if (shouldMigrate) {
            expect(record.user_id).toBe(userId);
            expect({ ...record, user_id: original.user_id }).toEqual(original);
          } else {
            expect(record).toEqual(original);
          }
        });
      })
    );
  });
});
