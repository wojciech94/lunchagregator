import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { mkdirSync } from "node:fs";

const widths = [320, 390, 768, 1000, 1023, 1024, 1280, 1440, 1920];
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const local = !!url && /^http:\/\/(localhost|127\.0\.0\.1):54321\/?$/.test(url);
const longLabel = "Wrocław, bardzo długa nazwa lokalizacji i ulicy ".repeat(6);

/** Real session cookies on the local stack; no auth bypass or production writes. */
async function signIn(context: BrowserContext, role: "user" | "admin") {
  if (!url || !anon || !service || !local) throw new Error("Local Supabase credentials required");
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const token = crypto.randomUUID().slice(0, 8);
  const email = "header-" + role + "-" + token + "@" + "long-restaurant-domain.".repeat(5) + "example.test";
  const password = "Header93-" + crypto.randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    app_metadata: role === "admin" ? { role: "admin" } : {},
  });
  if (error || !data.user) throw error ?? new Error("User not created");
  try {
    const pending: { name: string; value: string }[] = [];
    const auth = createServerClient(url, anon, {
      cookies: { getAll: () => [], setAll: (cookies) => { pending.push(...cookies); } },
    });
    const result = await auth.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    await context.addCookies(pending.map(({ name, value }) => ({
      name, value, url: "http://localhost:3000", httpOnly: true, sameSite: "Lax" as const,
    })));
    return { email, cleanup: async () => {
      const deleted = await admin.auth.admin.deleteUser(data.user!.id);
      if (deleted.error) throw deleted.error;
    } };
  } catch (error) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw error;
  }
}

async function seedLocation(context: BrowserContext) {
  await context.addCookies([{
    name: "lunchagregator_location",
    value: encodeURIComponent(JSON.stringify({ coordinates: { latitude: 51.1, longitude: 17 }, label: longLabel, source: "manual", savedAt: Date.now() })),
    url: "http://localhost:3000", httpOnly: true, sameSite: "Lax",
  }]);
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}
async function openNavigation(page: Page, width: number, authenticated: boolean) {
  if (width < 1440) {
    await page.getByRole("button", { name: "Otwórz menu" }).click();
    return page.getByRole("navigation", { name: "Nawigacja mobilna" });
  }
  if (authenticated) {
    await page.getByRole("button", { name: "Menu profilu" }).click();
    return page.getByRole("dialog", { name: "Menu profilu" });
  }
  return page.locator("header");
}

test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "chromium", "Matrix runs once in Chromium");
});
for (const role of ["guest", "user", "admin"] as const) {
  test(role + " has grouped navigation without overflow at every breakpoint", async ({ page, context }) => {
    test.skip(role !== "guest" && (!local || !service), "Authenticated roles require local Supabase");
    test.setTimeout(120000);
    const account = role === "guest" ? null : await signIn(context, role);
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/");
      const unset = await openNavigation(page, 1440, !!account);
      await expect(unset.getByText("Lokalizacja nieustawiona")).toBeVisible();
      await expect(unset.getByRole("button", { name: "Ustaw lokalizację" })).toBeVisible();
      await page.keyboard.press("Escape");
      await seedLocation(context);
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/?date=2026-10-08");
        await noOverflow(page);
        const nav = await openNavigation(page, width, !!account);
        await expect(nav.getByRole("button", { name: "Zmień lokalizację" })).toBeVisible();
        if (account) {
          await expect(nav.getByText(account.email, { exact: true })).toBeVisible();
          await expect(nav.getByRole("link", { name: "Moje oferty" })).toBeVisible();
          await expect(nav.getByRole("button", { name: "Wyloguj się" })).toBeVisible();
          await expect(nav.getByRole("link", { name: "Panel admina" })).toHaveCount(role === "admin" ? 1 : 0);
        } else {
          await expect(nav.getByRole("link", { name: "Zaloguj się" })).toHaveAttribute("href", "/auth/login?redirectTo=" + encodeURIComponent("/?date=2026-10-08"));
          await expect(nav.getByRole("link", { name: "Zarejestruj się" })).toBeVisible();
          await expect(nav.getByRole("link", { name: "Panel admina" })).toHaveCount(0);
        }
        await noOverflow(page);
        await nav.getByRole("button", { name: "Zmień lokalizację" }).click();
        await expect(page.getByRole("dialog", { name: "Ustawienia lokalizacji" })).toBeVisible();
        await expect(page.getByRole("textbox", { name: "Wpisz swój adres" })).toBeVisible();
        await noOverflow(page);
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog", { name: "Ustawienia lokalizacji" })).toHaveCount(0);
        if (width < 1440) await expect(page.getByRole("button", { name: "Otwórz menu" })).toBeFocused();
        else if (account) await expect(page.getByRole("button", { name: "Menu profilu" })).toBeFocused();
      }
    } finally { await account?.cleanup(); }
  });
}

test("profile supports keyboard, outside dismissal, active links, resize, and logout", async ({ page, context }) => {
  test.skip(!local || !service, "Requires local Supabase");
  const account = await signIn(context, "admin");
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/my-offers");
    const trigger = page.getByRole("button", { name: "Menu profilu" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("link", { name: "Moje oferty" })).toBeFocused();
    await expect(page.getByRole("link", { name: "Moje oferty" })).toHaveAttribute("aria-current", "page");
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("link", { name: "Panel admina" })).toBeFocused();
    await page.keyboard.press("End");
    await expect(page.getByRole("button", { name: "Wyloguj się" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.getByRole("heading", { name: "Moje oferty" }).click();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await trigger.click();
    await page.setViewportSize({ width: 1024, height: 900 });
    await expect(page.getByRole("dialog", { name: "Menu profilu" })).toHaveCount(0);
    await page.getByRole("button", { name: "Otwórz menu" }).click();
    await page.getByRole("link", { name: "Restauracje", exact: true }).click();
    await expect(page.getByRole("navigation", { name: "Nawigacja mobilna" })).toHaveCount(0);
    await page.getByRole("button", { name: "Otwórz menu" }).click();
    await page.getByRole("button", { name: "Wyloguj się" }).click();
    await page.waitForURL("/");
    await expect(page.getByRole("heading", { name: /Oferty lunchowe/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Menu profilu" })).toHaveCount(0);
    await page.getByRole("button", { name: "Otwórz menu" }).click();
    await expect(page.getByRole("navigation", { name: "Nawigacja mobilna" }).getByRole("link", { name: "Zaloguj się" })).toBeVisible();
  } finally { await account.cleanup(); }
});

test("GPS changes persist and stay synchronized in search and profile", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 51.1, longitude: 17 });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const control = page.locator("main").getByRole("button", { name: "Ustaw lokalizację" });
  await control.click();
  const dialog = page.getByRole("dialog", { name: "Ustawienia lokalizacji" });
  await dialog.getByRole("button", { name: "Użyj mojej lokalizacji" }).click();
  await expect(dialog.getByText("Bieżąca lokalizacja", { exact: true })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await dialog.getByRole("button", { name: "Zamknij", exact: true }).focus();
  await page.keyboard.press("Tab");
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Zamknij", exact: true })).toBeFocused();
  await expect.poll(async () => (await context.cookies()).some((cookie) => cookie.name === "lunchagregator_location")).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator("main").getByText("Bieżąca lokalizacja", { exact: true })).toBeVisible();
  await page.goto("/restaurants");
  await page.locator("main").getByRole("button", { name: "Zmień lokalizację" }).click();
  await dialog.getByRole("button", { name: "Wyczyść lokalizację" }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("main").getByText("Lokalizacja nieustawiona")).toBeVisible();
});

test("capture desktop, profile, location and mobile layouts", async ({ page, context }, testInfo) => {
  test.skip(!local || !service, "Requires local Supabase");
  const account = await signIn(context, "admin");
  const screenshotDir = process.env.HEADER_MENU_SCREENSHOTS === "1" ? "docs/qa/issue-93" : testInfo.outputPath("layouts");
  mkdirSync(screenshotDir, { recursive: true });
  const screenshot = (name: string) => page.screenshot({ path: screenshotDir + "/" + name + ".png", style: "nextjs-portal { display: none; }" });
  try {
    await seedLocation(context);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await screenshot("desktop");
    await page.getByRole("button", { name: "Menu profilu" }).click();
    await screenshot("profile");
    await page.getByRole("dialog", { name: "Menu profilu" }).getByRole("button", { name: "Zmień lokalizację" }).click();
    await screenshot("location");
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 390, height: 900 });
    await page.getByRole("button", { name: "Otwórz menu" }).click();
    await screenshot("mobile");
  } finally { await account.cleanup(); }
});
