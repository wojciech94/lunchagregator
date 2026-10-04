/**
 * The authorization model, executed rather than described.
 *
 * `AGENTS.md` and the migration headers both claim a two-layer model: RLS
 * tests `auth.uid() = user_id`, and application code calls `getUser()` plus
 * `checkOwnership()`. Until now that claim was only verifiable by reading SQL
 * by hand. These tests are the first place it is checked by running it.
 *
 * The layer under test here is the database. The application layer is
 * covered by unit tests with a mocked client, and the combination is covered
 * by Playwright.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, anonClient, runToken } from './helpers';

const admin = adminClient();
const anon = anonClient();
const token = runToken('db-authorization');
const probeId = '00000000-0000-4000-8000-0000000000a1';

/**
 * File-level setup, not per-describe. An `afterAll` inside the first describe
 * tore down the row the second one needed, which is the failure mode the seed
 * contract warns about: no test may depend on another test's fixtures.
 */
beforeAll(async () => {
  await admin.from('lunch_offers').delete().eq('id', probeId);
  const { error } = await admin.from('lunch_offers').insert({
    id: probeId,
    dish_name: 'probe',
    price: 25.0,
    restaurant_name: 'probe',
    available_date: new Date().toISOString().slice(0, 10),
    source_type: 'text',
    session_token: token,
  });
  if (error) throw new Error(`seed failed: ${error.message}`);
});

afterAll(async () => {
  await admin.from('lunch_offers').delete().eq('session_token', token);
});

async function readProbe(): Promise<string | undefined> {
  const { data } = await admin
    .from('lunch_offers')
    .select('dish_name')
    .eq('id', probeId)
    .single();
  return data?.dish_name;
}

describe('row level security', () => {
  it('lets an anonymous caller read offers', async () => {
    const { data, error } = await anon.from('lunch_offers').select('id').limit(1);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('refuses an anonymous insert', async () => {
    // The whole write path is behind `owners can modify lunch_offers`, which is
    // `USING (auth.uid() = user_id)`. An anonymous caller has no auth.uid(), so
    // the comparison is NULL = NULL, which is not true, and no row qualifies.
    // An INSERT also trips WITH CHECK, and that does raise.
    const { error } = await anon.from('lunch_offers').insert({
      dish_name: 'should not exist',
      price: 10.0,
      restaurant_name: 'should not exist',
      available_date: new Date().toISOString().slice(0, 10),
      source_type: 'text',
      session_token: token,
    });
    expect(error).not.toBeNull();
  });

  it('ignores an anonymous update instead of erroring', async () => {
    // The important asymmetry, and the reason this suite asserts on data
    // rather than on `error`. RLS filters rows through USING, so an UPDATE
    // matching zero rows is a success: HTTP 200, empty body, no error. Only
    // INSERT trips WITH CHECK and raises.
    //
    // Application code that checks `if (error)` after an update would believe
    // it had written. Nothing in this repo does that alone -- `checkOwnership`
    // runs first -- but the database alone will not save a future caller that
    // does.
    const { error } = await anon
      .from('lunch_offers')
      .update({ dish_name: 'hijacked' })
      .eq('id', probeId);

    expect(error).toBeNull();
    expect(await readProbe()).toBe('probe');
  });

  it('ignores an anonymous delete instead of erroring', async () => {
    const { error } = await anon.from('lunch_offers').delete().eq('id', probeId);

    expect(error).toBeNull();
    expect(await readProbe()).toBe('probe');
  });

  it('refuses an anonymous insert on restaurants too', async () => {
    const { error } = await anon.from('restaurants').insert({
      name: 'should not exist',
      session_token: token,
    });
    expect(error).not.toBeNull();
  });

  it('lets the service role write, which is how seeds get in', async () => {
    // service_role bypasses RLS. This is what makes the suite possible at all,
    // and it is also why the anon assertions above mean something.
    expect(await readProbe()).toBe('probe');
  });
});

describe('ownership of a row with no user_id', () => {
  it('is writable by nobody except an admin', async () => {
    // `user_id IS NULL` on an anonymous-era row. `checkOwnership` returns
    // false for a null record user id, so the application layer refuses too.
    //
    // The title used to say "except the migration function", and that was true
    // when this file was written. `20250101000005` added the admin role, which is
    // now the only way such a row can be reclaimed. An admin who edits one does
    // not become its owner -- `user_id` stays null -- so the row is still owned
    // by nobody after the correction. See admin-role.test.ts for the admin side,
    // which is where that behaviour is pinned.
    const { data, error } = await admin
      .from('lunch_offers')
      .select('user_id')
      .eq('id', probeId)
      .single();

    expect(error).toBeNull();
    expect(data?.user_id).toBeNull();

    const { error: anonError } = await anon
      .from('lunch_offers')
      .update({ dish_name: 'claimed' })
      .eq('id', probeId);

    expect(anonError).toBeNull();
    expect(await readProbe()).toBe('probe');
  });
});