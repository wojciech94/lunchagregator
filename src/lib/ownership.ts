/**
 * Checks whether the requesting user owns the given record.
 *
 * Returns `true` only when both `requestingUserId` and `recordUserId` are
 * non-null and strictly equal. Any null value (unauthenticated caller or
 * un-migrated record) results in `false`.
 *
 * Requirements: 5.3, 5.4, 5.5
 */
export function checkOwnership(
  requestingUserId: string | null,
  recordUserId: string | null
): boolean {
  if (requestingUserId === null || recordUserId === null) {
    return false;
  }
  return requestingUserId === recordUserId;
}

/** The role value that grants administrative access. */
/**
 * The claim key that carries the role, and the value that grants it.
 *
 * Two constants because they are different strings that happen to share a name:
 * the key is `role`, the value is `admin`. Reading `app_metadata['admin']` instead
 * would make the check silently never match -- and would pass every test written
 * against a principal shaped the same wrong way.
 */
const ROLE_KEY = 'role';
const ROLE_ADMIN = 'admin';

/**
 * Minimal shape this module needs from a Supabase user.
 *
 * Declared locally rather than importing `User`, so the predicates stay pure and
 * carry no SDK dependency. A caller holding a real `User` satisfies this
 * structurally, so passing one needs no cast.
 */
export interface Principal {
  id?: string | null;
  /**
   * Server-controlled claims. This is the field the role is read from.
   *
   * `user_metadata` is deliberately absent: it is writable by the account holder
   * through `supabase.auth.updateUser`, so a role read from there would be a role
   * anyone assigns to themselves. `app_metadata` is writable only with the
   * service role, and it is signed into the JWT, which is what lets an RLS policy
   * read the same value as `auth.jwt() -> 'app_metadata' ->> 'role'`.
   */
  app_metadata?: Record<string, unknown> | null;
}

/**
 * True when the principal carries the admin role.
 *
 * Absence is false rather than an error: a user with no metadata, an empty
 * object, or metadata without a `role` is simply not an admin. The value is
 * compared, not tested for truthiness, so `role: 'user'` cannot pass.
 *
 * Null is false, matching how `checkOwnership` treats an unauthenticated caller.
 *
 * The role is assigned by hand in the Supabase dashboard. No UI, no self-service:
 * granting is the one operation where a bug is worth a long time to find.
 */
export function isAdmin(principal: Principal | null | undefined): boolean {
  if (!principal) return false;
  return principal.app_metadata?.[ROLE_KEY] === ROLE_ADMIN;
}

/**
 * Whether the principal may modify the record: an admin, or its owner.
 *
 * Composed rather than folded into `checkOwnership`, which answers "is this the
 * owner?" -- one question, one clear answer. Widening it would make a function
 * named after one thing answer two, with every call site silently deciding which
 * was meant.
 *
 * The admin branch is what makes an ownerless record reachable at all.
 * `checkOwnership` returns false whenever the record has no owner, by design
 * (see `20250101000000`), so without it an offer orphaned by `ON DELETE SET NULL`
 * stays permanently unmanageable. That is the defect #54 closes.
 *
 * Takes the record's owner rather than the record, because the admin branch needs
 * only the caller's role.
 */
export function canModify(
  principal: Principal | null | undefined,
  recordUserId: string | null
): boolean {
  if (isAdmin(principal)) return true;
  return checkOwnership(principal?.id ?? null, recordUserId);
}

/**
 * Whether the principal may delete the record.
 *
 * Identical to `canModify` today, and deliberately a separate function anyway.
 * #54 leaves open whether an admin may delete a record that has an owner; naming
 * the two separately makes that decision one changed line here rather than an
 * archaeology exercise through the action layer later.
 */
export function canDelete(
  principal: Principal | null | undefined,
  recordUserId: string | null
): boolean {
  return canModify(principal, recordUserId);
}
