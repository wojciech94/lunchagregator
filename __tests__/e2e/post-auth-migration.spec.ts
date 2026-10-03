import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const MIGRATION_WARNING_MESSAGE =
  'Nie udało się przypisać wcześniejszych danych do konta. Skontaktuj się z pomocą techniczną.';
const APP_BASE_URL = 'http://localhost:3000';
const LEGACY_COOKIE_NAME = 'lunch_session_token';
const FAILURE_TOKEN_PREFIX = 'playwright-migration-failure-';
const TEST_TOKEN_PREFIX = 'playwright-post-auth-migration-';
const testRunId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const testPassword = `Playwright-${testRunId}-secure`;
const testSupabaseUrl = process.env.PLAYWRIGHT_SUPABASE_TEST_URL;
const testServiceRoleKey = process.env.PLAYWRIGHT_SUPABASE_TEST_SERVICE_ROLE_KEY;

/**
 * This suite creates users and legacy rows with a Supabase service-role key. It
 * runs only when all of the following explicitly identify a disposable test
 * project:
 *
 *   PLAYWRIGHT_SUPABASE_TEST_ENABLED=true
 *   PLAYWRIGHT_SUPABASE_TEST_URL=<same value as NEXT_PUBLIC_SUPABASE_URL>
 *   PLAYWRIGHT_SUPABASE_TEST_SERVICE_ROLE_KEY=<test-project service-role key>
 *   PLAYWRIGHT_SUPABASE_TEST_MIGRATION_FAILURE_FIXTURE=installed
 *
 * Before enabling the suite, apply
 * `supabase/tests/fixtures/playwright-migration-failure.sql` to that disposable
 * database. The fixture raises an error only for test tokens beginning with
 * `playwright-migration-failure-`, allowing the non-fatal failure path to be
 * exercised without changing application behavior.
 */
const runAgainstDisposableSupabase =
  process.env.PLAYWRIGHT_SUPABASE_TEST_ENABLED === 'true' &&
  process.env.PLAYWRIGHT_SUPABASE_TEST_MIGRATION_FAILURE_FIXTURE === 'installed' &&
  Boolean(testSupabaseUrl) &&
  Boolean(testServiceRoleKey) &&
  testSupabaseUrl === process.env.NEXT_PUBLIC_SUPABASE_URL;

interface LegacyRestaurantRow {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  session_token: string | null;
  user_id: string | null;
}

interface LegacyOfferRow {
  id: string;
  dish_name: string;
  description: string | null;
  price: number | string;
  restaurant_name: string;
  restaurant_address: string | null;
  available_date: string;
  source_type: string;
  session_token: string | null;
  user_id: string | null;
}

interface SeededLegacyRows {
  matchingRestaurant: LegacyRestaurantRow;
  nonMatchingRestaurant: LegacyRestaurantRow;
  alreadyOwnedRestaurant: LegacyRestaurantRow;
  matchingOffer: LegacyOfferRow;
  nonMatchingOffer: LegacyOfferRow;
  alreadyOwnedOffer: LegacyOfferRow;
}

const createdUserIds = new Set<string>();

function getAdminClient(): SupabaseClient {
  if (!testSupabaseUrl || !testServiceRoleKey) {
    throw new Error('Disposable Supabase test credentials are required.');
  }

  return createClient(testSupabaseUrl, testServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function requireData<T>(data: T | null, error: { message: string } | null): T {
  if (error) {
    throw new Error(error.message);
  }
  if (data === null) {
    throw new Error('Supabase returned no data.');
  }
  return data;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function createAuthenticatedUser(
  admin: SupabaseClient,
  label: string
): Promise<{ id: string; email: string }> {
  const email = `playwright-${label}-${testRunId}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: testPassword,
    email_confirm: true,
  });
  const user = requireData(data.user, error);
  createdUserIds.add(user.id);

  return { id: user.id, email };
}

async function seedLegacyRows(
  admin: SupabaseClient,
  sessionToken: string,
  existingOwnerId: string
): Promise<SeededLegacyRows> {
  const nonMatchingToken = `${TEST_TOKEN_PREFIX}other-${testRunId}`;
  const offerDate = today();
  const { data: restaurants, error: restaurantError } = await admin
    .from('restaurants')
    .insert([
      {
        name: `Migrated restaurant ${testRunId}`,
        description: 'Matching restaurant must preserve this description.',
        address: 'Migration Street 1',
        cuisine_types: ['polska'],
        session_token: sessionToken,
        user_id: null,
      },
      {
        name: `Unmatched restaurant ${testRunId}`,
        description: 'Different token must stay unowned.',
        address: 'Migration Street 2',
        cuisine_types: ['włoska'],
        session_token: nonMatchingToken,
        user_id: null,
      },
      {
        name: `Already owned restaurant ${testRunId}`,
        description: 'Existing ownership must not change.',
        address: 'Migration Street 3',
        cuisine_types: ['azjatycka'],
        session_token: sessionToken,
        user_id: existingOwnerId,
      },
    ])
    .select('id, name, description, address, session_token, user_id');
  const seededRestaurants = requireData(restaurants, restaurantError) as LegacyRestaurantRow[];

  const { data: offers, error: offerError } = await admin
    .from('lunch_offers')
    .insert([
      {
        dish_name: `Migrated offer ${testRunId}`,
        description: 'Matching offer must preserve this description.',
        price: 24.5,
        restaurant_name: `Migrated restaurant ${testRunId}`,
        restaurant_address: 'Migration Street 1',
        available_date: offerDate,
        source_type: 'text',
        session_token: sessionToken,
        user_id: null,
      },
      {
        dish_name: `Unmatched offer ${testRunId}`,
        description: 'Different-token offer must stay unowned.',
        price: 25.5,
        restaurant_name: `Unmatched restaurant ${testRunId}`,
        restaurant_address: 'Migration Street 2',
        available_date: offerDate,
        source_type: 'text',
        session_token: nonMatchingToken,
        user_id: null,
      },
      {
        dish_name: `Already owned offer ${testRunId}`,
        description: 'Existing offer ownership must not change.',
        price: 26.5,
        restaurant_name: `Already owned restaurant ${testRunId}`,
        restaurant_address: 'Migration Street 3',
        available_date: offerDate,
        source_type: 'text',
        session_token: sessionToken,
        user_id: existingOwnerId,
      },
    ])
    .select(
      'id, dish_name, description, price, restaurant_name, restaurant_address, available_date, source_type, session_token, user_id'
    );
  const seededOffers = requireData(offers, offerError) as LegacyOfferRow[];

  return {
    matchingRestaurant: seededRestaurants[0],
    nonMatchingRestaurant: seededRestaurants[1],
    alreadyOwnedRestaurant: seededRestaurants[2],
    matchingOffer: seededOffers[0],
    nonMatchingOffer: seededOffers[1],
    alreadyOwnedOffer: seededOffers[2],
  };
}

async function setLegacySessionCookie(
  context: BrowserContext,
  token: string
): Promise<void> {
  await context.addCookies([
    {
      name: LEGACY_COOKIE_NAME,
      value: token,
      url: APP_BASE_URL,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto('/auth/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(testPassword);
  await page.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
  await page.waitForURL('/');
}

async function loadSeededRows(
  admin: SupabaseClient,
  seededRows: SeededLegacyRows
): Promise<{ restaurants: LegacyRestaurantRow[]; offers: LegacyOfferRow[] }> {
  const restaurantIds = [
    seededRows.matchingRestaurant.id,
    seededRows.nonMatchingRestaurant.id,
    seededRows.alreadyOwnedRestaurant.id,
  ];
  const offerIds = [
    seededRows.matchingOffer.id,
    seededRows.nonMatchingOffer.id,
    seededRows.alreadyOwnedOffer.id,
  ];
  const { data: restaurants, error: restaurantError } = await admin
    .from('restaurants')
    .select('id, name, description, address, session_token, user_id')
    .in('id', restaurantIds);
  const { data: offers, error: offerError } = await admin
    .from('lunch_offers')
    .select(
      'id, dish_name, description, price, restaurant_name, restaurant_address, available_date, source_type, session_token, user_id'
    )
    .in('id', offerIds);

  return {
    restaurants: requireData(restaurants, restaurantError) as LegacyRestaurantRow[],
    offers: requireData(offers, offerError) as LegacyOfferRow[],
  };
}

function rowById<T extends { id: string }>(rows: T[], id: string): T {
  const row = rows.find((candidate) => candidate.id === id);
  if (!row) {
    throw new Error(`Expected seeded row ${id} to exist.`);
  }
  return row;
}

async function cleanupTestData(): Promise<void> {
  if (!runAgainstDisposableSupabase) {
    return;
  }

  const admin = getAdminClient();
  const tokenPatterns = [`${TEST_TOKEN_PREFIX}%`, `${FAILURE_TOKEN_PREFIX}%`];

  for (const tokenPattern of tokenPatterns) {
    const { error: offerError } = await admin
      .from('lunch_offers')
      .delete()
      .like('session_token', tokenPattern);
    if (offerError) {
      throw new Error(`Could not clean up test offers: ${offerError.message}`);
    }

    const { error: restaurantError } = await admin
      .from('restaurants')
      .delete()
      .like('session_token', tokenPattern);
    if (restaurantError) {
      throw new Error(`Could not clean up test restaurants: ${restaurantError.message}`);
    }
  }

  for (const userId of createdUserIds) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      throw new Error(`Could not clean up test user ${userId}: ${error.message}`);
    }
  }
  createdUserIds.clear();
}

test.describe('post-auth legacy data migration', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ viewport: { width: 1440, height: 900 } });

  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      !runAgainstDisposableSupabase,
      'Requires explicitly enabled credentials for a disposable Supabase test project and its failure fixture.'
    );
    test.skip(
      testInfo.project.name !== 'chromium',
      'Runs once in Chromium to avoid duplicate service-role database writes across projects.'
    );
  });

  test.afterEach(async () => {
    await cleanupTestData();
  });

  test('migrates matching unowned legacy rows, preserves unrelated rows, and clears the legacy cookie', async ({
    page,
    context,
  }) => {
    const admin = getAdminClient();
    const migratingUser = await createAuthenticatedUser(admin, 'migration-user');
    const existingOwner = await createAuthenticatedUser(admin, 'existing-owner');
    const sessionToken = `${TEST_TOKEN_PREFIX}success-${testRunId}`;
    const seededRows = await seedLegacyRows(admin, sessionToken, existingOwner.id);

    await setLegacySessionCookie(context, sessionToken);
    await login(page, migratingUser.email);
    await expect(page.getByText(migratingUser.email, { exact: true })).toBeVisible();

    const cookieNames = (await context.cookies()).map((cookie) => cookie.name);
    expect(cookieNames).not.toContain(LEGACY_COOKIE_NAME);

    const { restaurants, offers } = await loadSeededRows(admin, seededRows);
    expect(rowById(restaurants, seededRows.matchingRestaurant.id)).toMatchObject({
      ...seededRows.matchingRestaurant,
      user_id: migratingUser.id,
    });
    expect(rowById(offers, seededRows.matchingOffer.id)).toMatchObject({
      ...seededRows.matchingOffer,
      user_id: migratingUser.id,
    });
    expect(rowById(restaurants, seededRows.nonMatchingRestaurant.id)).toEqual(
      seededRows.nonMatchingRestaurant
    );
    expect(rowById(offers, seededRows.nonMatchingOffer.id)).toEqual(
      seededRows.nonMatchingOffer
    );
    expect(rowById(restaurants, seededRows.alreadyOwnedRestaurant.id)).toMatchObject({
      ...seededRows.alreadyOwnedRestaurant,
      user_id: existingOwner.id,
    });
    expect(rowById(offers, seededRows.alreadyOwnedOffer.id)).toMatchObject({
      ...seededRows.alreadyOwnedOffer,
      user_id: existingOwner.id,
    });
  });

  test('keeps authentication active and displays the support warning when migration fails', async ({
    page,
    context,
  }) => {
    const admin = getAdminClient();
    const migratingUser = await createAuthenticatedUser(admin, 'migration-failure-user');
    const existingOwner = await createAuthenticatedUser(admin, 'migration-failure-owner');
    const sessionToken = `${FAILURE_TOKEN_PREFIX}${testRunId}`;
    const seededRows = await seedLegacyRows(admin, sessionToken, existingOwner.id);

    await setLegacySessionCookie(context, sessionToken);
    await login(page, migratingUser.email);
    await expect(page.getByText(migratingUser.email, { exact: true })).toBeVisible();
    await expect(
      page.getByText(MIGRATION_WARNING_MESSAGE, { exact: true })
    ).toBeVisible();

    const cookieNames = (await context.cookies()).map((cookie) => cookie.name);
    expect(cookieNames).toContain(LEGACY_COOKIE_NAME);

    const { restaurants, offers } = await loadSeededRows(admin, seededRows);
    expect(rowById(restaurants, seededRows.matchingRestaurant.id)).toEqual(
      seededRows.matchingRestaurant
    );
    expect(rowById(offers, seededRows.matchingOffer.id)).toEqual(seededRows.matchingOffer);
  });
});
