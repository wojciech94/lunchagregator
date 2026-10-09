/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { setMockPathname, setMockSearchParams } from "../../tests/setup";
import { AccountMenu } from "./AccountMenu";
import { appVersionLabel } from "@/lib/app-version";

vi.mock("@/components/location/LocationDialog", () => ({
  LocationDialog: ({ open }: { open: boolean }) => open ? <div role="dialog" aria-label="Ustawienia lokalizacji" /> : null,
}));
afterEach(cleanup);
function menu(admin = false) {
  return <AccountMenu email="long-account@example.test" isAdmin={admin} logout={<button>Wyloguj się</button>} />;
}
it("keeps personal links and logout inside the profile, including role-appropriate admin navigation", () => {
  const view = render(menu());
  expect(screen.queryByRole("link", { name: "Moje oferty" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Menu profilu" }));
  expect(screen.getByRole("link", { name: "Moje oferty" })).toBeVisible();
  expect(screen.queryByRole("link", { name: "Panel admina" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Wyloguj się" })).toBeVisible();
  expect(within(screen.getByRole("dialog", { name: "Menu profilu" })).getByText("long-account@example.test")).toBeVisible();
  const badge = screen.getByText(appVersionLabel);
  expect(badge).toBeVisible();
  expect(within(badge.parentElement!).getByRole('button')).toBeVisible();
  expect(badge).not.toHaveAttribute('tabindex');
  view.rerender(menu(true));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Menu profilu" }));
  expect(screen.getByRole("link", { name: "Panel admina" })).toBeVisible();
});
it("marks personal destinations active and closes on query navigation", () => {
  setMockPathname("/my-offers");
  const view = render(menu());
  fireEvent.click(screen.getByRole("button", { name: "Menu profilu" }));
  expect(screen.getByRole("link", { name: "Moje oferty" })).toHaveAttribute("aria-current", "page");
  setMockSearchParams("page=2");
  view.rerender(menu());
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("supports arrow navigation and Escape with focus restoration", async () => {
  render(menu(true));
  const trigger = screen.getByRole("button", { name: "Menu profilu" });
  fireEvent.click(trigger);
  await waitFor(() => expect(screen.getByRole("link", { name: "Moje menu" })).toHaveFocus());
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
  expect(screen.getByRole("link", { name: "Moje oferty" })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
  expect(screen.getByRole("link", { name: "Panel admina" })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: "End" });
  expect(screen.getByRole("button", { name: "Wyloguj się" })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(trigger).toHaveAttribute("aria-expanded", "false");
});
it("opens a sibling location dialog after dismissing the profile", () => {
  render(menu());
  fireEvent.click(screen.getByRole("button", { name: "Menu profilu" }));
  fireEvent.click(screen.getByRole("button", { name: "Ustaw lokalizację" }));
  expect(screen.queryByRole("dialog", { name: "Menu profilu" })).not.toBeInTheDocument();
  expect(screen.getByRole("dialog", { name: "Ustawienia lokalizacji" })).toBeVisible();
});
