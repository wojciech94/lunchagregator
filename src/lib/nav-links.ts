/**
 * The navigation entries, in one place.
 *
 * Extracted because two components render this list -- `NavLinks` for desktop and
 * `NavMobileMenu` for the hamburger -- and they had drifted into two copies of
 * the same array. That is survivable for four static links and not survivable for
 * the admin-only one: a link that exists in one copy is a link a person can reach
 * from one viewport and not the other, which for the admin panel means "works on
 * desktop, 404s on mobile" with nothing to indicate why.
 *
 * Data rather than a component, because neither consumer wants the same markup:
 * one is a horizontal bar of text links, the other a vertical stack that closes on
 * click. Only the entries are shared.
 */

export interface NavLink {
  readonly href: string;
  readonly label: string;
}

/** Shown to everybody, signed in or not. */
export const navLinks: readonly NavLink[] = [
  { href: "/", label: "Oferty" },
  { href: "/restaurants", label: "Restauracje" },
  { href: "/add", label: "Dodaj ofertę" },
  { href: "/chat", label: "Czat AI" },
];

/**
 * Appended for an admin only.
 *
 * The role is read in `NavHeader` and passed down as a boolean, rather than being
 * resolved in either client component: `isAdmin` reads `app_metadata`, and a
 * client component asking Supabase for the session to check it would be doing
 * network work on every render to learn something the server already knows.
 *
 * Kept out of `navLinks` entirely, so a consumer that forgets the flag shows the
 * public list rather than leaking the panel to everybody.
 */
export const adminNavLinks: readonly NavLink[] = [
  { href: "/admin/offers", label: "Panel admina" },
];

/** The links a given viewer should see: the public ones, plus admin's if they are one. */
export function linksFor(isAdmin: boolean): readonly NavLink[] {
  return isAdmin ? [...navLinks, ...adminNavLinks] : navLinks;
}
