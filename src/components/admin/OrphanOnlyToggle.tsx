import Link from 'next/link';

export interface OrphanOnlyToggleProps {
  /** Path this filter applies to, e.g. `/admin/offers`. */
  href: string;
  checked: boolean;
  /** What the checkbox filters -- shown next to it so the control is not a label-less box. */
  subject: string;
}

/**
 * "Only orphaned records", as a URL parameter rather than component state.
 *
 * A checkbox the server cannot see would put the filter back in the client,
 * which is where the panel's data does not live. And a filtered panel that can
 * be linked is consistent with the rest of the app: filters belong in the
 * address bar, which is the same decision Requirement 2 settled for offers.
 *
 * The `Link` wraps a real checkbox so the control is focusable and announces
 * its state, and the URL is what actually holds the value.
 */
export function OrphanOnlyToggle({
  href,
  checked,
  subject,
}: OrphanOnlyToggleProps) {
  const target = checked ? href : `${href}?orphan=1`;

  return (
    <label className="mt-4 inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
      <input
        type="checkbox"
        checked={checked}
        // No onChange: navigation is the state change. The checkbox is driven by
        // the URL, so back and forward move it like everything else.
        className="size-4 rounded border-border accent-primary"
        aria-label={`Pokaż tylko ${subject} bez właściciela`}
      />
      <span>
        Tylko {subject} bez właściciela (
        <Link href={target} className="underline underline-offset-4 hover:text-primary">
          {checked ? 'pokaż wszystkie' : 'wyłącz ten filtr'}
        </Link>
        )
      </span>
    </label>
  );
}

/** Reads the filter out of the query string. Absent means "show everything". */
export function isOrphanOnly(params: Record<string, string | string[] | undefined>): boolean {
  const value = params.orphan;
  return value === '1';
}