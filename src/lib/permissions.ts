import { getUser } from "@/lib/auth";
import { canModify, checkOwnership, isAdmin } from "@/lib/ownership";

/**
 * What the signed-in User may do to one record.
 *
 * Decided on the server, always. A client that worked this out for itself
 * would be a second source of truth, which is the failure this shape exists to
 * avoid: RLS filters rows out silently and returns no error, so a client can
 * disagree with the database and never find out.
 */
export interface Capabilities {
  canEdit: boolean;
  canDelete: boolean;
}

/**
 * Resolves capabilities for a record owned by `ownerId`.
 *
 * An admin gets both regardless of ownership. That is deliberate and now
 * recorded as behaviour rather than left as an accident of `canDelete` being
 * aliased to `canModify` -- #54 left the asymmetry open on purpose, and this is
 * the decision that closes it.
 *
 * `ownerId` null means the record has nobody to own it, so only an admin can
 * act on it. `checkOwnership` already returns false for a null owner rather
 * than throwing, which is what makes the anonymous-era leftovers reachable at
 * all.
 */
export async function capabilitiesFor(
  ownerId: string | null
): Promise<Capabilities> {
  const user = await getUser();
  const principal = user ?? null;

  if (principal && isAdmin(principal)) {
    return { canEdit: true, canDelete: true };
  }

  return {
    canEdit: canModify(principal, ownerId),
    canDelete: canModify(principal, ownerId),
  };
}

/** Exported so a caller can explain a denial without re-deriving it. */
export function isOwnedByUser(ownerId: string | null, userId: string | null): boolean {
  return checkOwnership(userId, ownerId);
}