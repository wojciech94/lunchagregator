/**
 * Writes to `admin_audit_log` on behalf of an admin action.
 *
 * Called from the action layer, through the caller's own Supabase client, so the
 * insert is subject to the same RLS policies as the action that caused it. That
 * matters: if the caller is not an admin, the mutation is refused and so is the
 * log entry, and there is no window where one succeeds while the other does not.
 *
 * A failure here is logged and swallowed, deliberately. The mutation has already
 * happened -- refusing to report it would leave the log silently incomplete, which
 * is worse than a missing entry that is at least visible as a gap. The alternative
 * of rolling the mutation back is not available without a transaction, which the
 * delete paths do not have.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type AuditAction = 'update' | 'delete';
export type AuditTable = 'lunch_offers' | 'restaurants';

export interface AuditEntry {
  action: AuditAction;
  tableName: AuditTable;
  recordId: string;
  /** The row as it was, if the caller captured it. Null for a delete without a snapshot. */
  before?: Record<string, unknown> | null;
  /** The row as it now is. Null for a delete. */
  after?: Record<string, unknown> | null;
}

/**
 * Actor id, taken from the caller's own user.
 *
 * Not passed in by the action. Passing it would let a caller attribute an action
 * to somebody else, which is the one thing an audit log must not allow. Reading
 * it from the client means the id and the JWT that authorised the mutation are the
 * same fact.
 */
export async function recordAudit(
  client: SupabaseClient,
  actorId: string,
  entry: AuditEntry
): Promise<void> {
  const { error } = await client.from('admin_audit_log').insert({
    actor_id: actorId,
    action: entry.action,
    table_name: entry.tableName,
    record_id: entry.recordId,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });

  if (error) {
    console.error(
      `[audit] failed to record ${entry.action} on ${entry.tableName}/${entry.recordId}: ${error.message}`
    );
  }
}

/**
 * Whether to log this action at all.
 *
 * Ordinary owners are not logged. The table is `admin_audit_log`, the role exists
 * because an ownerless record is unreclaimable, and logging every owner edit would
 * grow the table with the overwhelming majority of writes while making the admin
 * entries harder to find. Owners are already constrained by RLS and by
 * `checkOwnership`, which is the record of their own authority.
 */
export function shouldAudit(actorIsAdmin: boolean): boolean {
  return actorIsAdmin;
}