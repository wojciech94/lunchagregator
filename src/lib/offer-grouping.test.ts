/**
 * Tests for the "Moje oferty" grouping (Req 8.4, #71): per-restaurant groups
 * named by the offer's own snapshot (Req 6.2), the shared unlinked bucket,
 * and a stable, readable order.
 */

import { describe, expect, it } from "vitest";
import {
  groupOffersByRestaurant,
  UNLINKED_GROUP_KEY,
  UNLINKED_GROUP_NAME,
  type GroupableOffer,
} from "./offer-grouping";

function offer(
  id: string,
  restaurantId: string | null,
  restaurantName: string,
  availableDate: string
): GroupableOffer {
  return { id, restaurantId, restaurantName, availableDate };
}

describe("groupOffersByRestaurant", () => {
  it("groups by restaurant id and names the group by the newest snapshot", () => {
    // The restaurant was renamed between the two offers; the snapshot on the
    // newer offer is what the group is called.
    const groups = groupOffersByRestaurant([
      offer("o-1", "r-1", "Bar Mleko", "2026-10-05"),
      offer("o-2", "r-1", "Bar Mleko Nowy Świat", "2026-10-09"),
      offer("o-3", "r-2", "Pierogarnia U Ali", "2026-10-06"),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].key).toBe("r-1");
    expect(groups[0].name).toBe("Bar Mleko Nowy Świat");
    expect(groups[0].offers.map((offer) => offer.id)).toEqual(["o-1", "o-2"]);
    expect(groups[1].name).toBe("Pierogarnia U Ali");
  });

  it("puts every unlinked offer into one shared bucket, named 'Bez restauracji'", () => {
    const groups = groupOffersByRestaurant([
      offer("o-1", null, "Bar A", "2026-10-05"),
      offer("o-2", null, "Bar B", "2026-10-06"),
      offer("o-3", "r-1", "Bar Mleko", "2026-10-07"),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].key).toBe("r-1");
    const unlinked = groups[1];
    expect(unlinked.key).toBe(UNLINKED_GROUP_KEY);
    expect(unlinked.name).toBe(UNLINKED_GROUP_NAME);
    expect(unlinked.restaurantId).toBeNull();
    expect(unlinked.offers.map((offer) => offer.id)).toEqual(["o-1", "o-2"]);
  });

  it("orders linked groups by their newest offer, newest group first", () => {
    const groups = groupOffersByRestaurant([
      offer("o-1", "r-old", "Stara", "2026-09-14"),
      offer("o-2", "r-new", "Nowa", "2026-10-07"),
      offer("o-3", "r-mid", "Środkowa", "2026-09-30"),
    ]);

    expect(groups.map((group) => group.name)).toEqual(["Nowa", "Środkowa", "Stara"]);
  });

  it("sorts offers inside a group oldest first, regardless of input order", () => {
    const groups = groupOffersByRestaurant([
      offer("o-2", "r-1", "Bar Mleko", "2026-10-09"),
      offer("o-1", "r-1", "Bar Mleko", "2026-10-05"),
    ]);

    expect(groups[0].offers.map((offer) => offer.availableDate)).toEqual([
      "2026-10-05",
      "2026-10-09",
    ]);
  });
});
