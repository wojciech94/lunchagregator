/**
 * Grouping for the "Moje oferty" page (Req 8.4, #71): the User's own offers
 * grouped per restaurant. The snapshot name on the offer is the display
 * truth (Req 6.2) -- the group never reads the restaurants table to label
 * itself. Offers with no restaurant land in one shared "bez restauracji"
 * bucket; since #74 they are not dead rows anymore -- they can be attached
 * to a restaurant, attach-when-null only, and the bucket's sub-grouping is
 * what makes that one decision per menu.
 */

import { normalizeRestaurantName } from "./restaurant-match";

export interface GroupableOffer {
  id: string;
  restaurantId: string | null;
  /** The offer's snapshot name — the display truth (Req 6.2). */
  restaurantName: string;
  availableDate: string;
}

export interface OfferGroup {
  /** `restaurantId` when linked, `unlinked` for the shared bucket. */
  key: string;
  restaurantId: string | null;
  name: string;
  offers: GroupableOffer[];
}

export const UNLINKED_GROUP_KEY = "unlinked";
export const UNLINKED_GROUP_NAME = "Bez restauracji";

/**
 * Sub-grouping inside the „Bez restauracji" bucket (#74): offers without a
 * restaurant are grouped by the normalized snapshot name, so one decision --
 * "this name is that restaurant" -- attaches a whole menu at once. The
 * snapshot name finally becomes visible on the page: it is what the
 * assignment step matches against.
 */

export interface UnlinkedNameGroup {
  /** The snapshot name as first seen, trimmed. */
  name: string;
  offers: GroupableOffer[];
}

export function groupUnlinkedByName(offers: GroupableOffer[]): UnlinkedNameGroup[] {
  const byName = new Map<string, UnlinkedNameGroup>();

  for (const offer of offers) {
    const key = normalizeRestaurantName(offer.restaurantName) || "(bez nazwy)";
    let group = byName.get(key);
    if (!group) {
      group = {
        name: offer.restaurantName.trim() || "(bez nazwy)",
        offers: [],
      };
      byName.set(key, group);
    }
    group.offers.push(offer);
  }

  const groups = Array.from(byName.values());

  for (const group of groups) {
    group.offers.sort((a, b) => a.availableDate.localeCompare(b.availableDate));
  }

  groups.sort((a, b) => {
    const aNewest = a.offers[a.offers.length - 1]?.availableDate ?? "";
    const bNewest = b.offers[b.offers.length - 1]?.availableDate ?? "";
    return bNewest.localeCompare(aNewest);
  });

  return groups;
}

/**
 * Groups offers per restaurant, keeping a stable order: linked groups by the
 * newest offer date (newest group first), the unlinked bucket last. Within a
 * group the offers read oldest first, like a menu.
 */
export function groupOffersByRestaurant(offers: GroupableOffer[]): OfferGroup[] {
  const byKey = new Map<string, OfferGroup>();

  for (const offer of offers) {
    const key = offer.restaurantId ?? UNLINKED_GROUP_KEY;
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        restaurantId: offer.restaurantId,
        name: offer.restaurantName,
        offers: [],
      };
      byKey.set(key, group);
    }
    group.offers.push(offer);
  }

  const groups = Array.from(byKey.values());

  for (const group of groups) {
    group.offers.sort((a, b) => a.availableDate.localeCompare(b.availableDate));
    if (group.restaurantId === null) {
      group.name = UNLINKED_GROUP_NAME;
    } else {
      // The newest offer's snapshot names the group: the most recent
      // statement of what this restaurant is called.
      const newest = group.offers.reduce((max, current) =>
        current.availableDate > max.availableDate ? current : max
      );
      group.name = newest.restaurantName;
    }
  }

  groups.sort((a, b) => {
    if (a.key === UNLINKED_GROUP_KEY) return 1;
    if (b.key === UNLINKED_GROUP_KEY) return -1;
    const aNewest = a.offers[a.offers.length - 1]?.availableDate ?? "";
    const bNewest = b.offers[b.offers.length - 1]?.availableDate ?? "";
    return bNewest.localeCompare(aNewest);
  });

  return groups;
}
