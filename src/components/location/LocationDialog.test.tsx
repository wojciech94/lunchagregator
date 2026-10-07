/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LocationIndicator } from "./LocationIndicator";
import { LocationProvider } from "./LocationProvider";
import { AccountMenu } from "../AccountMenu";

const geocode = vi.hoisted(() => vi.fn());
vi.mock("@/actions/geocode", () => ({ geocodeAddressAction: geocode }));
vi.mock("@/actions/location", () => ({ saveUserLocationAction: vi.fn(), clearUserLocationAction: vi.fn() }));
afterEach(cleanup);

it("sets a manual address, synchronizes all controls, and restores trigger focus", async () => {
  geocode.mockResolvedValue({ success: true, data: { latitude: 51.1, longitude: 17 } });
  render(<><LocationIndicator /><AccountMenu email="user@example.test" isAdmin={false} logout={<button>Wyloguj się</button>} /></>);
  const trigger = screen.getByRole("button", { name: "Ustaw lokalizację" });
  fireEvent.click(trigger);
  fireEvent.change(screen.getByRole("textbox", { name: "Wpisz swój adres" }), { target: { value: "Rynek, Wrocław" } });
  fireEvent.click(screen.getByRole("button", { name: "Znajdź" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
  expect(screen.getByText("Rynek, Wrocław")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Menu profilu" }));
  expect(screen.getAllByText("Rynek, Wrocław")).toHaveLength(2);
  expect(screen.getAllByRole("button", { name: "Zmień lokalizację" })).toHaveLength(2);
});
it("shows geocoding errors without dismissing the dialog", async () => {
  geocode.mockResolvedValue({ success: false, error: "Nie znaleziono adresu" });
  render(<LocationIndicator />);
  fireEvent.click(screen.getByRole("button", { name: "Ustaw lokalizację" }));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Nieznany adres" } });
  fireEvent.click(screen.getByRole("button", { name: "Znajdź" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Nie znaleziono adresu");
  expect(screen.getByRole("dialog")).toBeVisible();
});
it("reports GPS denial and retains the manual address option", async () => {
  const getCurrentPosition = vi.fn((_success, failure) => failure({ code: 1, PERMISSION_DENIED: 1 }));
  const previous = Object.getOwnPropertyDescriptor(navigator, "geolocation");
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } });
  try {
    render(<LocationIndicator />);
    fireEvent.click(screen.getByRole("button", { name: "Ustaw lokalizację" }));
    fireEvent.click(screen.getByRole("button", { name: "Użyj mojej lokalizacji" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("odrzucony");
    expect(screen.getByRole("textbox", { name: "Wpisz swój adres" })).toBeVisible();
  } finally {
    if (previous) Object.defineProperty(navigator, "geolocation", previous);
    else Reflect.deleteProperty(navigator, "geolocation");
  }
});
it("clears stored location and closes with Escape, returning focus", async () => {
  render(<LocationProvider initialLocation={{ coordinates: { latitude: 51.1, longitude: 17 }, label: "Wrocław", source: "manual", savedAt: 1 }}><LocationIndicator /></LocationProvider>);
  const trigger = screen.getByRole("button", { name: "Zmień lokalizację" });
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole("button", { name: "Wyczyść lokalizację" }));
  expect(screen.getByText("Lokalizacja nieustawiona")).toBeVisible();
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
