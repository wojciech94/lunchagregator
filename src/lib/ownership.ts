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
