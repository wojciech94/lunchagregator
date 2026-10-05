'use client';

import { useRouter } from 'next/navigation';

export interface OrphanOnlyToggleProps {
  /** Path this filter applies to, e.g. `/admin/offers`. */
  href: string;
  checked: boolean;
  /** What the checkbox filters -- the label names it, the checkbox drives it. */
  subject: string;
}

/**
 * "Only orphaned records", as a URL parameter rather than component state.
 *
 * #77: this used to be a server component with a static checkbox and the
 * navigation wired to an underlined link nested in parentheses -- clicking
 * the checkbox did nothing, which is the one interaction a checkbox promises.
 * Now the checkbox itself navigates: `onChange` pushes the target URL, the
 * server re-renders with the filter, and back/forward still move it like
 * every other URL-driven control in the app.
 */
export function OrphanOnlyToggle({
  href,
  checked,
  subject,
}: OrphanOnlyToggleProps) {
  const router = useRouter();
  const target = checked ? href : `${href}?orphan=1`;

  return (
    <label className="mt-4 inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={() => router.push(target)}
        className="size-4 cursor-pointer rounded border-border accent-primary"
        aria-label={`Pokaż tylko ${subject} bez właściciela`}
      />
      <span>Tylko {subject} bez właściciela</span>
    </label>
  );
}
