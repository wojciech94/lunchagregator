import { describe, expect, it } from 'vitest';
import { shouldAudit } from '@/lib/audit';

describe('shouldAudit', () => {
  it('logs an admin action', () => {
    expect(shouldAudit(true)).toBe(true);
  });

  it('does not log an ordinary owner', () => {
    // The table is `admin_audit_log`. Logging every owner edit would bury the
    // admin entries under the ordinary majority, and owners are already
    // constrained by RLS and `checkOwnership` -- that pair is the record of their
    // own authority.
    expect(shouldAudit(false)).toBe(false);
  });
});