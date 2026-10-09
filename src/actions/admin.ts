'use server';

import { getAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { listOrphanOffers, listAllOffersForAdmin } from '@/services/offers';
import { listRestaurants } from '@/actions/restaurants';
import type { LunchOffer } from '@/types/offers';
import type { RestaurantWithDistance } from '@/types/restaurants';

/**
 * Reads for the admin panel.
 *
 * Every action here refuses a non-admin by returning `null` data rather than
 * an empty list. The distinction matters: an empty list renders as "nothing to
 * do", and an operator told that when the database is unreachable stops
 * checking.
 *
 * `orphanOnly` is a URL-driven filter, not a view setting, so a filtered panel
 * can be linked like any other page in the app.
 */

export interface AdminListResult<T> {
  rows: T[] | null;
  total: number;
  error?: string;
  /**
   * True when the underlying listing is paginated and only one page came back.
   * The panel says so instead of implying it showed everything -- an operator
   * told "14 restaurants" while there are 200 has been told something false,
   * just quietly.
   */
  partial?: boolean;
}

function refusal<T>(): AdminListResult<T> {
  return { rows: null, total: 0, error: 'Brak uprawnień' };
}

/** Offers, either everything or only the ones nobody owns. */
export async function listAdminOffers(
  options: { orphanOnly: boolean } = { orphanOnly: false }
): Promise<AdminListResult<LunchOffer>> {
  if (!(await getAdmin())) return refusal();

  try {
    if (options.orphanOnly) {
      const orphans = await listOrphanOffers();
      return { rows: orphans, total: orphans.length };
    }

    // The operator's queue, not the public listing: every offer, from every
    // date, newest first, with an exact count. The service maps the rows --
    // the panel renders `LunchOffer`, not database columns. The first cut of
    // this (#79) passed raw snake_case rows where the component expected
    // camelCase fields, and the panel rendered empty records (#81 report).
    const { offers, total } = await listAllOffersForAdmin();
    return { rows: offers, total, partial: total > offers.length };
  } catch (error) {
    return {
      rows: null,
      total: 0,
      error: error instanceof Error ? error.message : 'Failed to fetch offers',
    };
  }
}

/**
 * Restaurants, either everything or only the ones nobody owns.
 *
 * No dedicated RPC: `public read restaurants` is `USING (true)`, so the
 * orphan subset is an ordinary `user_id is null` filter rather than a function.
 * `get_orphan_offers` needed an RPC because the offer list it filters is
 * already shaped around distance and date.
 */
export async function listAdminRestaurants(
  options: { orphanOnly: boolean } = { orphanOnly: false }
): Promise<AdminListResult<RestaurantWithDistance>> {
  if (!(await getAdmin())) return refusal();

  try {
    if (options.orphanOnly) {
      const supabase = await createClient();
      const { data, error, count } = await supabase
        .from('restaurants')
        .select('*', { count: 'exact' })
        .is('user_id', null);

      if (error) throw new Error(error.message);
      return { rows: (data ?? []) as unknown as RestaurantWithDistance[], total: count ?? 0 };
    }

    const page = await listRestaurants({});
    return { rows: page.restaurants, total: page.total, partial: page.hasMore };
  } catch (error) {
    return {
      rows: null,
      total: 0,
      error: error instanceof Error ? error.message : 'Failed to fetch restaurants',
    };
  }
}

export interface AuditRow {
  id: string;
  actorId: string | null;
  action: 'insert' | 'update' | 'delete';
  tableName: string;
  recordId: string;
  before: unknown;
  after: unknown;
  createdAt: string;
}

/**
 * Not exported: a `'use server'` module may only export async functions. The
 * page reads the page size back off the result rather than importing it.
 */
const AUDIT_PAGE_SIZE = 50;

/**
 * One page of the admin audit log, newest first.
 *
 * Paginated in SQL rather than fetched whole. The table is append-only and
 * grows for the life of the deployment, so a "last N" cap in the panel would
 * quietly stop showing the oldest entries without saying so -- and the oldest
 * entries are the ones that explain why a record looks the way it does.
 *
 * `range` returns a Content-Range header, which is where the total comes from;
 * a second COUNT query would race with this one.
 */
export async function listAuditLog(
  options: { page: number } = { page: 1 }
): Promise<AdminListResult<AuditRow> & { page: number; pageSize: number }> {
  if (!(await getAdmin())) {
    return { rows: null, total: 0, page: 1, pageSize: AUDIT_PAGE_SIZE, error: 'Brak uprawnień' };
  }

  const page = Math.max(1, Math.floor(options.page) || 1);
  const from = (page - 1) * AUDIT_PAGE_SIZE;
  const to = from + AUDIT_PAGE_SIZE - 1;

  try {
    const supabase = await createClient();
    const { data, error, count } = await supabase
      .from('admin_audit_log')
      .select('id, actor_id, action, table_name, record_id, before, after, created_at', {
        count: 'exact',
      })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);

    if (error) throw new Error(error.message);

    const rows = (data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: String(r.id),
        actorId: r.actor_id == null ? null : String(r.actor_id),
        action: r.action as AuditRow['action'],
        tableName: String(r.table_name),
        recordId: String(r.record_id),
        before: r.before ?? null,
        after: r.after ?? null,
        createdAt: String(r.created_at),
      };
    });

    return { rows, total: count ?? rows.length, page, pageSize: AUDIT_PAGE_SIZE };
  } catch (error) {
    return {
      rows: null,
      total: 0,
      page,
      pageSize: AUDIT_PAGE_SIZE,
      error: error instanceof Error ? error.message : 'Failed to fetch the audit log',
    };
  }
}
