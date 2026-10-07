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
  await expect(page.getByLabel(/Maksymalna odległość/)).toBeAttached();
  await page.getByLabel("Szukaj ofert").focus();
}
async function geometry(page: Page) {
  return page.evaluate(() => {
    const panel = document.getElementById("offer-filters-panel")!;
    const chip = [...panel.querySelectorAll("button")].find(b => b.textContent === "Wegetariańskie")!;
    return { chip: chip.getBoundingClientRect().top + scrollY, panel: panel.getBoundingClientRect().height, results: document.querySelector('[role="list"]')!.getBoundingClientRect().top + scrollY };
  });
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
          setTimeout(() => res.end(JSON.stringify(rows.slice(params.p_offset, params.p_offset + params.p_limit))), delay);
        });
      } else if (req.method === "HEAD") {
        res.setHeader("Content-Range", "0-50/51"); res.end();
      } else { res.end("[]"); }
    });
    await new Promise<void>(resolve => backend.listen(54330, "127.0.0.1", resolve));
  });
  test.afterAll(async () => { if (backend) await new Promise<void>(resolve => backend.close(() => resolve())); });
  test.beforeEach(() => { delay = 0; requests.length = 0; });

  for (const width of [1280, 390]) {
    test(`stable filter and results geometry at ${width}px, including pending navigation`, async ({ page, context }) => {
      await seedLocation(context);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(origin);
      await ready(page);
      if (width < 768) await page.getByRole("button", { name: "Pokaż filtry" }).click();
      await expect(page.getByLabel(/Maksymalna odległość/)).toBeVisible();
      const before = await geometry(page);
      delay = 500;
      const vegetarian = page.getByRole("button", { name: "Wegetariańskie", exact: true });
      await vegetarian.click();
      await expect(vegetarian).toHaveAttribute("aria-pressed", "true");
      // Check while the server is still pending, as well as after it settles.
      expect(await geometry(page)).toEqual(before);
      await expect(page).toHaveURL(/diets=vegetarian/);
      expect(await geometry(page)).toEqual(before);
      await page.getByRole("button", { name: "Polska", exact: true }).click();
      await expect(page).toHaveURL(/cuisines=polska/);
      expect(await geometry(page)).toEqual(before);
      await page.getByRole("button", { name: "Wyczyść filtry" }).click();
      await expect(vegetarian).toHaveAttribute("aria-pressed", "false");
      await expect(page).not.toHaveURL(/diets=|cuisines=/);
      expect(await geometry(page)).toEqual(before);
      await vegetarian.click();
      await expect(page).toHaveURL(/diets=vegetarian/);
      await vegetarian.click();
      await expect(page).not.toHaveURL(/diets=/);
      expect(await geometry(page)).toEqual(before);
    });
  }

  test("day, unrelated criteria, pagination, history, refresh and default reset stay consistent", async ({ page, context }) => {
    await seedLocation(context);
    const date = dateAfter(2);
    await page.goto(`${origin}/?date=${date}&cuisines=polska&priceMin=20&priceMax=50&q=zupa&radius=5&page=2`);
    await ready(page);
    await page.getByRole("button", { name: "Wegetariańskie", exact: true }).click();
    await expect(page).toHaveURL(/diets=vegetarian/);
    let params = new URL(page.url()).searchParams;
    for (const [key, value] of Object.entries({ date, cuisines: "polska", priceMin: "20", priceMax: "50", q: "zupa", radius: "5" })) expect(params.get(key)).toBe(value);
    expect(params.has("page")).toBe(false);
    await page.goBack();
    await expect(page.getByRole("button", { name: "Wegetariańskie", exact: true })).toHaveAttribute("aria-pressed", "false");
    await expect(page).toHaveURL(/page=2/);
    await page.goForward();
    await expect(page.getByRole("button", { name: "Wegetariańskie", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(page.getByLabel("Cena minimalna")).toHaveValue("20");
    await page.getByRole("combobox", { name: "Sortowanie" }).click();
    await page.getByRole("option", { name: "Cena rosnąco" }).click();
    await expect(page).toHaveURL(/sort=price_asc/);
    await page.getByRole("combobox", { name: "Sortowanie" }).click();
    await page.getByRole("option", { name: /Domyślnie/ }).click();
    await expect(page).not.toHaveURL(/sort=/);
    await page.getByRole("button", { name: "Wyczyść filtry" }).click();
    await expect(page).toHaveURL(`${origin}/?date=${date}`);
    await expect(page.getByLabel("Cena minimalna")).toHaveValue("");
    expect(requests.filter(request => request.p_date === date).at(-1)).toMatchObject({ p_date: date, p_price_min: null, p_price_max: null, p_radius_km: null, p_sort_by: "distance" });
  });

  test("invalid prices stay visible and cannot broaden a linked search", async ({ page, context }) => {
    await seedLocation(context);
    const date = dateAfter(2);
    await page.goto(`${origin}/?date=${date}&priceMin=50&priceMax=30&cuisines=polska`);
    await expect(page.getByLabel("Cena minimalna")).toHaveValue("50");
    await expect(page.getByLabel("Cena maksymalna")).toHaveValue("30");
    await expect(page.locator("main").getByRole("alert")).toContainText(/minimalna.*maksymalnej/i);
    // Navigation links may prefetch today's unfiltered page. They must not
    // be mistaken for a query for this invalid, selected-day search.
    expect(requests.filter(request => request.p_date === date)).toHaveLength(0);
    await expect(page.locator("main").getByRole("list")).toHaveCount(0);
    await page.getByLabel("Cena maksymalna").fill("60");
    await expect(page).toHaveURL(/priceMax=60/);
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get("date")).toBe(date);
    expect(new URL(page.url()).searchParams.get("cuisines")).toBe("polska");
    await expect(page.getByRole("list")).toBeVisible();
    await page.getByLabel("Cena maksymalna").fill("30");
    await expect(page.locator("main").getByRole("alert")).toBeVisible();
    await expect(page.getByLabel("Cena minimalna")).toHaveValue("50");
  });

  test("search replaces history and cannot resurrect a reset or overwrite a committed diet", async ({ page, context }) => {
    await seedLocation(context);
    const date = dateAfter(1);
    await page.goto(`${origin}/?date=${date}`);
    await ready(page);
    await page.getByLabel("Szukaj ofert").fill("zupa");
    await page.getByRole("button", { name: "Wegetariańskie", exact: true }).click();
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

  test("out-of-strip heading and distance link without location remain informative", async ({ page }) => {
    const date = dateAfter(14);
    await page.goto(`${origin}/?date=${date}&radius=5&sort=distance`);
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("Oferty lunchowe na dziś");
    await expect(page.getByTestId("distance-needs-location")).toBeVisible();
    await page.getByRole("button", { name: "Wegetariańskie", exact: true }).click();
    await expect(page).toHaveURL(/diets=vegetarian/);
    expect(new URL(page.url()).searchParams.get("radius")).toBe("5");
    expect(new URL(page.url()).searchParams.get("sort")).toBe("distance");
    expect(new URL(page.url()).searchParams.get("date")).toBe(date);
  });
});
