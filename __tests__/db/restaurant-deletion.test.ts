import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ADMIN_CLAIM,
  adminClient,
  anonClient,
  runToken,
  signInIdentity,
  todayUtc,
} from "./helpers";

const service = adminClient();
const token = runToken("db-restaurant-delete");
const identities: string[] = [];
let owner: Awaited<ReturnType<typeof signInIdentity>>;
let other: Awaited<ReturnType<typeof signInIdentity>>;
let operator: Awaited<ReturnType<typeof signInIdentity>>;

beforeAll(async () => {
  owner = await signInIdentity(token);
  identities.push(owner.id);
  other = await signInIdentity(token);
  identities.push(other.id);
  operator = await signInIdentity(token, ADMIN_CLAIM);
  identities.push(operator.id);
});

afterAll(async () => {
  await service.from("lunch_offers").delete().eq("session_token", token);
  await service.from("restaurants").delete().eq("session_token", token);
  for (const id of identities) await service.auth.admin.deleteUser(id);
});

async function fixture() {
  const { data: restaurant, error } = await owner.client
    .from("restaurants")
    .insert({
      name: `${token}-original`,
      address: "Stary adres",
      user_id: owner.id,
      session_token: token,
      location: "SRID=4326;POINT(21 52)",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  for (const identity of [owner, other]) {
    const { error: offerError } = await identity.client
      .from("lunch_offers")
      .insert({
        dish_name: `${token}-${identity.id}`,
        price: 25,
        restaurant_id: restaurant.id,
        restaurant_name: `${token}-original`,
        restaurant_address: "Stary adres",
        restaurant_location: "SRID=4326;POINT(21 52)",
        available_date: todayUtc(),
        source_type: "text",
        user_id: identity.id,
        session_token: token,
        items: ["Zupa", "Danie"],
        description: "Oryginalny opis",
        dietary_tags: ["vegetarian"],
        allergens: ["mleko"],
      });
    if (offerError) throw new Error(offerError.message);
  }
  const { error: renameError } = await owner.client
    .from("restaurants")
    .update({
      name: `${token}-renamed`,
      address: "Nowy adres",
      location: "SRID=4326;POINT(22 53)",
    })
    .eq("id", restaurant.id);
  if (renameError) throw new Error(renameError.message);
  const rows = await linkedRows(restaurant.id);
  // Include an expired offer: only INSERT enforces the availability window.
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const { error: expireError } = await service
    .from("lunch_offers")
    .update({ available_date: yesterday.toISOString().slice(0, 10) })
    .eq("id", rows[0].id);
  if (expireError) throw new Error(expireError.message);
  return {
    id: restaurant.id as string,
    before: await linkedRows(restaurant.id),
  };
}

async function linkedRows(id: string) {
  const { data, error } = await service
    .from("lunch_offers")
    .select("*")
    .eq("restaurant_id", id)
    .order("id");
  if (error) throw new Error(error.message);
  return data!;
}

async function assertPreservedAfterDelete(client: SupabaseClient) {
  const { id, before } = await fixture();
  const { data: deleted, error } = await client
    .from("restaurants")
    .delete()
    .eq("id", id)
    .select("id");
  expect(error).toBeNull();
  expect(deleted).toEqual([{ id }]);
  const { data: after, error: readError } = await service
    .from("lunch_offers")
    .select("*")
    .in(
      "id",
      before.map((row) => row.id),
    )
    .order("id");
  expect(readError).toBeNull();
  expect(after).toEqual(before.map((row) => ({ ...row, restaurant_id: null })));
}

describe("restaurant deletion: FK and RLS preserve publication snapshots", () => {
  it("lets the owner detach offers belonging to different users without rewriting any data", async () => {
    await assertPreservedAfterDelete(owner.client);
  });
  it("lets an admin detach offers while preserving their snapshots", async () => {
    await assertPreservedAfterDelete(operator.client);
  });
  it("leaves the restaurant and offers intact when a different owner or guest attempts deletion", async () => {
    const { id, before } = await fixture();
    for (const client of [other.client, anonClient()]) {
      const { data, error } = await client
        .from("restaurants")
        .delete()
        .eq("id", id)
        .select("id");
      expect(error).toBeNull();
      expect(data).toEqual([]);
      expect(await linkedRows(id)).toEqual(before);
      const { data: retained } = await service
        .from("restaurants")
        .select("id")
        .eq("id", id)
        .single();
      expect(retained).toEqual({ id });
    }
  });
});
