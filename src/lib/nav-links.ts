export interface NavLink {
  readonly href: string;
  readonly label: string;
}

/** Public browsing destinations, shared by desktop and mobile navigation. */
export const navLinks: readonly NavLink[] = [
  { href: "/", label: "Oferty" },
  { href: "/restaurants", label: "Restauracje" },
  { href: "/chat", label: "Czat AI" },
];

export const contributionLink: NavLink = { href: "/add", label: "Dodaj ofertę" };
export const userNavLinks: readonly NavLink[] = [{ href: "/my-offers", label: "Moje oferty" }];
export const adminNavLinks: readonly NavLink[] = [{ href: "/admin/offers", label: "Panel admina" }];

/** Presentation only; permissions remain enforced by the server and RLS. */
export function accountLinksFor(isAdmin: boolean, isAuthenticated = false): readonly NavLink[] {
  if (!isAuthenticated) return [];
  return isAdmin ? [...userNavLinks, ...adminNavLinks] : userNavLinks;
}

export function linksFor(isAdmin: boolean, isAuthenticated = false): readonly NavLink[] {
  return [...navLinks, contributionLink, ...accountLinksFor(isAdmin, isAuthenticated)];
}

export function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
}
