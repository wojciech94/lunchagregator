import { expect as baseExpect, test, type BrowserContext, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";

// No database or real credentials: run a fresh app with these two variables,
// then this suite with --project chromium --workers 1.
// NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54330
// NEXT_PUBLIC_SUPABASE_ANON_KEY=offer-filter-test-key
const origin = "http://localhost:3000";
// Cold Next.js development compilations can exceed Playwright's default 5 s.
// Keep this allowance local; geometry is still asserted during the transition.
const expect = baseExpect.configure({ timeout: 15_000 });
let backend: Server;
let delay = 0;
let heldSearch: string | null = null;
let releaseSearch: (() => void) | undefined;
const requests: Record<string, unknown>[] = [];
function dateAfter(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

async function seedLocation(context: BrowserContext) {
  await context.addCookies([{ name: "lunchagregator_location", value: JSON.stringify({ coordinates: { latitude: 51.1, longitude: 17.03 }, label: "Wroclaw", source: "manual", savedAt: Date.now() }), url: origin, httpOnly: true }]);
}
async function ready(page: Page) {
  await expect(page.getByRole("list", { name: "Lista ofert lunchowych" })).toBeVisible();
  // Wait for hydration/location refresh before comparing positions.
  await expect(page.getByRole("button", { name: "Pokaż filtry" })).toBeVisible();
  await expect(page.getByText("Określanie lokalizacji...")).toHaveCount(0);
  await page.getByLabel("Szukaj ofert").focus();
}
async function geometry(page: Page) {
  return page.locator('[role="list"]').evaluate(node => ({
    top: node.getBoundingClientRect().top + scrollY,
    height: node.getBoundingClientRect().height,
  }));
}
async function openFilters(page: Page) {
  // Cold dev navigation can expose the server-rendered trigger before React
  // hydrates it. Retry the interaction until the actual dialog is mounted.
  await expect(async () => {
    await page.getByRole("button", { name: "Pokaż filtry" }).click();
    await expect(page.getByRole("dialog", { name: "Twój lunch, Twoje zasady" })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
}
async function applyFilters(page: Page) {
  await page.getByRole("button", { name: "Pokaż oferty", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
test.describe("audit #88 offer filters", () => {
  test.setTimeout(60_000);
  test.skip(process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54330", "requires isolated HTTP fixture; see file header");
  test.describe.configure({ mode: "serial" });
  test.beforeAll(async () => {
    backend = createServer((req, res) => {
      res.setHeader("Content-Type", "application/json");
      if (req.url?.startsWith("/rest/v1/rpc/get_offers_filtered")) {
        let body = "";
        req.on("data", chunk => { body += chunk; });
        req.on("end", () => {
          const params = JSON.parse(body);
          requests.push(params);
          const rows = Array.from({ length: 51 }, (_, i) => ({
            id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
            dish_name: `Zupa ${params.p_date} ${i + 1}`, price: 25, currency: "PLN", items: ["Zupa", "Napój"],
            description: "Deterministic filter fixture", restaurant_name: "Testowa restauracja", restaurant_address: "Wrocław",
            available_date: params.p_date, cuisine_type: "polska", dietary_tags: ["vegetarian"], allergens: [],
            source_type: "manual", user_id: null, session_token: "fixture", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", distance_km: params.p_user_lat ? 1 : null,
          }));
          const respond = () => res.end(JSON.stringify(rows.slice(params.p_offset, params.p_offset + params.p_limit)));
          if (heldSearch !== null && params.p_search_query === heldSearch) releaseSearch = respond;
          else setTimeout(respond, delay);
        });
      } else if (req.method === "HEAD") {
        res.setHeader("Content-Range", "0-50/51"); res.end();
      } else { res.end("[]"); }
    });
    await new Promise<void>(resolve => backend.listen(54330, "127.0.0.1", resolve));
  });
  test.afterAll(async () => { if (backend) await new Promise<void>(resolve => backend.close(() => resolve())); });
  test.beforeEach(() => { delay = 0; requests.length = 0; heldSearch = null; releaseSearch = undefined; });
  test.afterEach(() => { releaseSearch?.(); releaseSearch = undefined; });

  for (const width of [320, 1280]) {
    test(`filter drafts preserve results and apply/cancel work at ${width}px`, async ({ page, context }) => {
      await seedLocation(context);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(origin);
      await ready(page);
      const beforeUrl = page.url();
      await openFilters(page);
      await expect(page.getByLabel(/Maksymalna odległość/)).toBeVisible();
      const before = await geometry(page);
      await page.getByRole("button", { name: "Wegetariańskie", exact: true }).click();
      await page.getByRole("checkbox", { name: "Polska", exact: true }).check();
      expect(page.url()).toBe(beforeUrl);
      expect(await geometry(page)).toEqual(before);
      delay = 500;
      await applyFilters(page);
      await expect(page).toHaveURL(/diets=vegetarian/);
      await expect(page).toHaveURL(/cuisines=polska/);
      await expect(page.getByRole("listitem")).toHaveCount(50);
      await openFilters(page);
      await page.getByRole("button", { name: "Wegetariańskie", exact: true }).click();
      await page.getByRole("button", { name: "Anuluj", exact: true }).click();
      await expect(page).toHaveURL(/diets=vegetarian/);
      await openFilters(page);
      await expect(page.getByRole("button", { name: "Wegetariańskie", exact: true })).toHaveAttribute("aria-pressed", "true");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: "Pokaż filtry" })).toBeFocused();
      await page.getByRole("button", { name: "Wyczyść filtry", exact: true }).click();
      await expect(page).not.toHaveURL(/diets=|cuisines=/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });
  }
  test("day, unrelated criteria, pagination, history, refresh and default reset stay consistent", async ({ page, context }) => {
    await seedLocation(context);
    const date = dateAfter(2);
    await page.goto(`${origin}/?date=${date}&cuisines=polska&priceMin=20&priceMax=50&q=zupa&radius=5&page=2`);
    await ready(page);
    await openFilters(page);
    await page.getByRole("button", { name: "Wegetariańskie", exact: true }).click();
    await applyFilters(page);
    await expect(page).toHaveURL(/diets=vegetarian/);
    let params = new URL(page.url()).searchParams;
    for (const [key, value] of Object.entries({ date, cuisines: "polska", priceMin: "20", priceMax: "50", q: "zupa", radius: "5" })) expect(params.get(key)).toBe(value);
    expect(params.has("page")).toBe(false);
    await page.goBack();
    await expect(page).toHaveURL(/page=2/);
    await openFilters(page);
    await expect(page.getByRole("button", { name: "Wegetariańskie", exact: true })).toHaveAttribute("aria-pressed", "false");
    await expect(page).toHaveURL(/page=2/);
    await page.getByRole("button", { name: "Anuluj", exact: true }).click();
    await page.goForward();
    await expect(page).toHaveURL(/diets=vegetarian/);
    await openFilters(page);
    await expect(page.getByRole("button", { name: "Wegetariańskie", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Anuluj", exact: true }).click();
    await page.reload();
    await openFilters(page);
    await expect(page.getByLabel("Cena minimalna")).toHaveValue("20");
    await page.getByRole("button", { name: "Anuluj", exact: true }).click();
    await page.getByRole("combobox", { name: "Sortowanie" }).click();
    await page.getByRole("option", { name: "Cena rosnąco" }).click();
    await expect(page).toHaveURL(/sort=price_asc/);
    await page.getByRole("combobox", { name: "Sortowanie" }).click();
    await page.getByRole("option", { name: "Najbliżej", exact: true }).click();
    await expect(page).not.toHaveURL(/sort=/);
    await page.getByRole("button", { name: "Wyczyść filtry" }).click();
    await expect(page).toHaveURL(`${origin}/?date=${date}`);
    await openFilters(page);
    await expect(page.getByLabel("Cena minimalna")).toHaveValue("");
    await page.getByRole("button", { name: "Anuluj", exact: true }).click();
    expect(requests.filter(request => request.p_date === date).at(-1)).toMatchObject({ p_date: date, p_price_min: null, p_price_max: null, p_radius_km: null, p_sort_by: "distance" });
  });

  test("invalid prices stay visible and cannot broaden a linked search", async ({ page, context }) => {
    await seedLocation(context);
    const date = dateAfter(2);
    await page.goto(`${origin}/?date=${date}&priceMin=50&priceMax=30&cuisines=polska`);
    await expect(page.locator("main").getByRole("alert").filter({ hasText: /minimalna.*maksymalnej/i })).toBeVisible();
    expect(requests.filter(request => request.p_date === date)).toHaveLength(0);
    await openFilters(page);
    await expect(page.getByLabel("Cena minimalna")).toHaveValue("50");
    await expect(page.getByLabel("Cena maksymalna")).toHaveValue("30");
    await expect(page.getByRole("button", { name: "Pokaż oferty", exact: true })).toBeDisabled();
    await page.getByLabel("Cena maksymalna").fill("60");
    await applyFilters(page);
    await expect(page).toHaveURL(/priceMax=60/);
    expect(new URL(page.url()).searchParams.get("date")).toBe(date);
    expect(new URL(page.url()).searchParams.get("cuisines")).toBe("polska");
    await expect(page.getByRole("list")).toBeVisible();
    await openFilters(page);
    await page.getByLabel("Cena maksymalna").fill("30");
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(/minimalna.*maksymalnej/i);
    await expect(page.getByRole("button", { name: "Pokaż oferty", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Anuluj", exact: true }).click();
    await expect(page).toHaveURL(/priceMax=60/);
  });
  test("search replaces history and cannot resurrect a reset or overwrite a committed diet", async ({ page, context }) => {
    await seedLocation(context);
    const date = dateAfter(1);
    await page.goto(`${origin}/?date=${date}`);
    await ready(page);
    await page.getByLabel("Szukaj ofert").fill("zupa");
    await openFilters(page);
    await page.getByRole("button", { name: "Wegetariańskie", exact: true }).click();
    await applyFilters(page);
    await expect(page).toHaveURL(/diets=vegetarian/);
    await page.waitForTimeout(400);
    expect(new URL(page.url()).searchParams.get("diets")).toBe("vegetarian");
    await page.getByLabel("Szukaj ofert").fill("obiad");
    await page.getByRole("button", { name: "Wyczyść filtry" }).click();
    await expect(page).toHaveURL(`${origin}/?date=${date}`);
    await page.waitForTimeout(400);
    await expect(page.getByLabel("Szukaj ofert")).toHaveValue("");
    await expect(page).toHaveURL(`${origin}/?date=${date}`);
  });

  test("an older search response preserves a newer draft and its debounce", async ({ page, context }) => {
    await seedLocation(context);
    await page.goto(`${origin}/?date=${dateAfter(1)}`);
    await ready(page);
    heldSearch = "zu";
    await page.getByLabel("Szukaj ofert").fill("zu");
    await expect.poll(() => !!releaseSearch).toBe(true);
    await page.getByLabel("Szukaj ofert").fill("zupa");
    releaseSearch!();
    releaseSearch = undefined;
    await expect(page.getByLabel("Szukaj ofert")).toHaveValue("zupa");
    await expect(page).toHaveURL(/q=zupa/);
    await expect(page.getByLabel("Szukaj ofert")).toHaveValue("zupa");
  });

  test("out-of-strip heading and distance link without location remain informative", async ({ page }) => {
    const date = dateAfter(14);
    await page.goto(`${origin}/?date=${date}&radius=5&sort=distance`);
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("Oferty lunchowe na dziś");
    await expect(page.getByTestId("distance-needs-location")).toBeVisible();
    await openFilters(page);
    await page.getByRole("button", { name: "Wegetariańskie", exact: true }).click();
    await applyFilters(page);
    await expect(page).toHaveURL(/diets=vegetarian/);
    expect(new URL(page.url()).searchParams.get("radius")).toBe("5");
    expect(new URL(page.url()).searchParams.get("sort")).toBe("distance");
    expect(new URL(page.url()).searchParams.get("date")).toBe(date);
  });
});
