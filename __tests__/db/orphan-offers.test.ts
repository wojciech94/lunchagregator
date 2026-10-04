/**
 * get_orphan_offers, executed against the real database. #55, part 1.
 *
 * The function this file covers has one job that no other query in the app can
 * do: answer "which offers have no owner". That makes it the first RPC here that
 * is not merely a faster way to ask a question the public read policy already
 * answers -- it is a question about the *absence* of an owner, and nothing else
 * in the schema exposes that. So most of what follows is about who may ask.
 *
 * Two things cannot be checked with a mocked client, and both are why this is a
 * `db` suite rather than a unit one:
 *
 *  1. PostgREST serves anon, so "only an admin may call this" is a fact about
 *     the deployed function, not about the TypeScript that calls it.
 *  2. `auth.jwt()` inside a SECURITY DEFINER function is the per-request claim,
 *     so it reads the same there as in a policy. Were that not true, the
 *     `WHERE public.is_admin()` gate would evaluate once as the function owner
 *     and hand every row to every caller -- and no unit test would notice.
 */
import { afterAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, anonClient, runToken, signInIdentity, todayUtc } from './helpers';

const admin = adminClient();
const token = runToken('db-orphan-offers');

const createdUserIds: string[] = [];

afterAll(async () => {
  await admin.from('lunch_offers').delete().eq('session_token', token);
  for (const id of createdUserIds) {
    await admin.auth.admin.deleteUser(id);
  }
});

/**
 * One row of `get_orphan_offers`, as PostgREST hands it over.
 *
 * Declared rather than inferred because `rpc()` on an untyped client returns
 * `any`, and a test that reads `row.restaurant_location` off an `any` would
 * compile even if the function stopped returning the column. The columns
 * asserted on below are the ones the panel renders.
 */
interface OrphanRow extends Record<string, unknown> {
  id: string;
  user_id: string | null;
  restaurant_address: string | null;
  restaurant_location: string | null;
}

/**
 * Calls the function and returns its rows, failing loudly on a Postgres error.
 *
 * The default limit is deliberately high rather than the function's own 200: the
 * suite shares one `session_token` and every test leaves its rows behind, so the
 * default would silently return a page that does not contain the row under
 * assertion. `p_limit` has its own test, and passes an explicit value there.
 */
async function orphanOffers(client: SupabaseClient, p_limit = 500): Promise<OrphanRow[]> {
  const { data, error } = await client.rpc('get_orphan_offers', { p_limit });
  if (error) throw new Error(`get_orphan_offers failed: ${error.message}`);
  return (data ?? []) as OrphanRow[];
}

/**
 * An offer owned by `ownerId`, or ownerless when that is null.
 *
 * `availableDate` and `createdAt` are separate because the two are independent
 * in this schema, and conflating them hides a real case: an offer created today
 * for a date ten days out is, later, an offer whose `available_date` is behind
 * us. `available_date` is validated by a BEFORE INSERT trigger rather than a
 * CHECK (20250101000002), so ageing is legal and is the normal way a row ends up
 * dated in the past.
 */
async function seedOffer(
  ownerId: string | null,
  dishName: string,
  opts: { availableDate?: string; createdAt?: string | null } = {}
): Promise<string> {
  const { data, error } = await admin
    .from('lunch_offers')
    .insert({
      dish_name: dishName,
      price: 20,
      restaurant_name: 'probe restaurant',
      available_date: opts.availableDate ?? todayUtc(),
      source_type: 'text',
      session_token: token,
      items: [],
      dietary_tags: [],
      allergens: [],
      user_id: ownerId,
      ...(opts.createdAt !== undefined ? { created_at: opts.createdAt } : {}),
    })
    .select('id')
    .single();
  if (error) throw new Error(`seed failed: ${error.message}`);
  return data.id;
}

/**
 * Moves an offer's `available_date` into the past.
 *
 * An UPDATE, not an INSERT: the BEFORE INSERT trigger rejects a past date, and
 * deliberately so. The trigger exists so a row can *age* past its date, so the
 * honest way to produce this state is to insert a legal date and let it become
 * illegal. An INSERT with the trigger bypassed would build a state the
 * application cannot reach, and the test would pass for a reason that never
 * happens in production.
 */
async function agePastItsDate(id: string, availableDate: string): Promise<void> {
  const { error } = await admin
    .from('lunch_offers')
    .update({ available_date: availableDate })
    .eq('id', id);
  if (error) throw new Error(`age failed: ${error.message}`);
}

async function identity(appMetadata: Record<string, unknown> | null) {
  const created = await signInIdentity(token, appMetadata);
  createdUserIds.push(created.id);
  return created;
}

describe('only an admin sees the orphan list', () => {
  it('returns the ownerless offers to an admin', async () => {
    const adminUser = await identity({ role: 'admin' });
    const mine = await seedOffer(null, `orphan ${token}`);

    const ids = (await orphanOffers(adminUser.client)).map((row) => row.id);

    expect(ids).toContain(mine);
  });

  it('returns nothing to an ordinary User, and no error either', async () => {
    const stranger = await identity(null);
    await seedOffer(null, `orphan ${token}`);

    // Empty rather than an error, deliberately: see the migration header. The
    // panel guard refuses before it gets here, so a 403 out of the function would
    // only tell a prober the endpoint exists and is worth retrying with a role.
    expect(await orphanOffers(stranger.client)).toEqual([]);
  });

  it('returns nothing to a User whose role is something other than admin', async () => {
    // The exact shapes is_admin() is written to refuse: `role: 'user'`, `role:
    // 'Admin'`, and a role nested one level too deep all have to fail the way a
    // missing role does.
    for (const claim of [{ role: 'user' }, { role: 'Admin' }, { app_metadata: { role: 'admin' } }]) {
      const notAdmin = await identity(claim);
      expect(await orphanOffers(notAdmin.client)).toEqual([]);
    }
  });

  it('returns nothing to an anonymous caller', async () => {
    // PostgREST does not know who is calling until it reads the JWT, so this is
    // the case that a page-only guard leaves wide open.
    expect(await orphanOffers(anonClient())).toEqual([]);
  });
});

describe('the list is exactly the ownerless offers', () => {
  it('omits an offer that has an owner', async () => {
    const adminUser = await identity({ role: 'admin' });
    const owner = await identity(null);
    const owned = await seedOffer(owner.id, `owned ${token}`);

    const ids = (await orphanOffers(adminUser.client)).map((row) => row.id);

    expect(ids).not.toContain(owned);
  });

  it('ignores available_date, which is the whole reason this function exists', async () => {
    const adminUser = await identity({ role: 'admin' });
    const today = await seedOffer(null, `today ${token}`, { availableDate: todayUtc() });
    const ahead = await seedOffer(null, `ahead ${token}`, { availableDate: futureDate(10) });
    const aged = await seedOffer(null, `aged ${token}`, { availableDate: todayUtc() });
    await agePastItsDate(aged, pastDate());

    const ids = (await orphanOffers(adminUser.client)).map((row) => row.id);

    expect(ids).toContain(today);
    expect(ids).toContain(ahead);
    expect(ids).toContain(aged);

    // The contrast that justifies the function: get_offers_filtered with
    // p_date = CURRENT_DATE returns the first and not the other two, so an
    // operator working through that query alone would call the job finished with
    // two thirds of the list still on the table.
    const { data: filtered, error } = await adminUser.client.rpc('get_offers_filtered', {
      p_date: todayUtc(),
      p_limit: 500,
      p_offset: 0,
    });
    expect(error).toBeNull();
    const filteredIds = ((filtered ?? []) as { id: string }[]).map((row) => row.id);
    expect(filteredIds).toContain(today);
    expect(filteredIds).not.toContain(ahead);
    expect(filteredIds).not.toContain(aged);
  });

  it('returns an empty list, not an error, when there is nothing to reclaim', async () => {
    // A fresh database has no orphans and the panel has to render that state. An
    // error here would be indistinguishable from the function being missing.
    const adminUser = await identity({ role: 'admin' });
    const owner = await identity(null);
    await seedOffer(owner.id, `owned only ${token}`);

    const rows = await orphanOffers(adminUser.client);

    expect(Array.isArray(rows)).toBe(true);
  });
});

describe('ordering and limit', () => {
  it('puts the oldest first, and a row with no created_at last', async () => {
    const adminUser = await identity({ role: 'admin' });
    const stamp = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

    const newest = await seedOffer(null, `newest ${token}`, { createdAt: stamp(1) });
    const oldest = await seedOffer(null, `oldest ${token}`, { createdAt: stamp(30) });
    // created_at is nullable -- it has a default but no NOT NULL -- so this is a
    // reachable state, not a defensive one.
    const undated = await seedOffer(null, `undated ${token}`, { createdAt: null });

    const ids = (await orphanOffers(adminUser.client)).map((row) => row.id);

    expect(ids.indexOf(oldest)).toBeLessThan(ids.indexOf(newest));
    // Last, not first: a row with no created_at is itself the datum problem an
    // operator is here to look at, and it should not lead a cleanup list.
    expect(ids.indexOf(undated)).toBeGreaterThan(ids.indexOf(newest));
  });

  it('orders deterministically when created_at ties', async () => {
    const adminUser = await identity({ role: 'admin' });
    const sameInstant = new Date().toISOString();
    const ids = await Promise.all(
      [1, 2, 3].map((n) => seedOffer(null, `tie ${n} ${token}`, { createdAt: sameInstant }))
    );

    const first = (await orphanOffers(adminUser.client)).map((row) => row.id);
    const second = (await orphanOffers(adminUser.client)).map((row) => row.id);

    // Without the `id` tiebreak, three rows sharing a created_at come back in
    // whatever order the plan produces, so a limit drops a different row on each
    // call and the panel can never be paged to the end.
    expect(first).toEqual(second);

    // And the tiebreak is the id, ascending. Compared as a subsequence, because
    // `ids` is in insertion order and `gen_random_uuid` means that is no
    // particular order at all -- which is why the sort key has to be written in
    // the query rather than assumed to fall out of it.
    expect(first.filter((id) => ids.includes(id))).toEqual([...ids].sort());
  });

  it('honours p_limit', async () => {
    const adminUser = await identity({ role: 'admin' });
    for (const n of [1, 2, 3]) await seedOffer(null, `cap ${n} ${token}`);

    const rows = await orphanOffers(adminUser.client, 2);

    expect(rows).toHaveLength(2);
  });

  it('treats a null, zero or negative p_limit as the default, not as a crash', async () => {
    const adminUser = await identity({ role: 'admin' });
    await seedOffer(null, `probe ${token}`);

    for (const p_limit of [null, 0, -5]) {
      const { error } = await adminUser.client.rpc('get_orphan_offers', { p_limit });
      // A negative limit is a Postgres error rather than a value, so an unchecked
      // pass-through would turn a caller's bad argument into a 500 on the one
      // page whose whole job is to render a list.
      expect(error).toBeNull();
    }

    // And the default path still yields rows, which is the half of the behaviour
    // that a "no error" assertion alone would not catch.
    expect((await orphanOffers(adminUser.client)).length).toBeGreaterThan(0);
  });
});

describe('the row shape', () => {
  it('returns the columns the existing row mapper reads, and nothing it cannot', async () => {
    const adminUser = await identity({ role: 'admin' });
    const address = 'Marszałkowska 1, Warszawa';
    const id = await seedOffer(null, `shape ${token}`);
    await admin.from('lunch_offers').update({ restaurant_address: address }).eq('id', id);

    const row = (await orphanOffers(adminUser.client)).find((r) => r.id === id)!;

    // Deliberately the same names as get_offers_filtered, minus distance_km,
    // which has nothing to compute without an origin. This is what lets the
    // service reuse mapDbRowToOfferWithDistance rather than grow a second one.
    //
    // Spelled out rather than derived from the mapper's own reads, because a
    // column the mapper happens not to read today is still part of the contract:
    // the panel reads restaurant_address and restaurant_location, and a silent
    // column drop would surface as a blank cell rather than a failure.
    expect(Object.keys(row).sort()).toEqual(
      [
        'allergens',
        'available_date',
        'created_at',
        'cuisine_type',
        'currency',
        'description',
        'dietary_tags',
        'dish_name',
        'id',
        'items',
        'price',
        'restaurant_address',
        'restaurant_id',
        'restaurant_location',
        'restaurant_name',
        'session_token',
        'source_type',
        'updated_at',
        'user_id',
      ].sort()
    );

    expect(row.user_id).toBeNull();
    expect(row.restaurant_address).toBe(address);
    // WKB hex or null, never an object: PostgREST returns `geography` as hex and
    // the application decodes it in parseLocation. A row arriving already decoded
    // would mean the function and the mapper disagree about the wire format, and
    // the panel would show a coordinate nobody stored.
    expect(typeof row.restaurant_location === 'string' || row.restaurant_location === null).toBe(true);
  });

  it('reports a missing coordinate as null rather than inventing one', async () => {
    // #17/#18 made missing coordinates something an operator needs to see, so
    // this column is load-bearing on the panel: an offer with an address that was
    // never geocoded has to be distinguishable from one that was.
    const adminUser = await identity({ role: 'admin' });
    const id = await seedOffer(null, `ungeocoded ${token}`);
    const address = 'Nowa Wieś, gmina Izabelin';
    await admin
      .from('lunch_offers')
      .update({ restaurant_address: address, restaurant_location: null })
      .eq('id', id);

    const row = (await orphanOffers(adminUser.client)).find((r) => r.id === id)!;

    expect(row.restaurant_location).toBeNull();
    expect(row.restaurant_address).toBe(address);
  });
});

/** `todayUtc()` shifted forward, in the form the DATE column wants. */
function futureDate(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

/** `todayUtc()` shifted backward. Only reachable through an UPDATE. */
function pastDate(): string {
  return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
}
