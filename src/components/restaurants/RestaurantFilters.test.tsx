/** @vitest-environment jsdom */
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RestaurantFilters } from "./RestaurantFilters";
import type { RestaurantFilters as Filters } from "@/types/restaurants";

const location = { latitude: 51.1, longitude: 17.03 };
beforeEach(() => vi.stubGlobal("ResizeObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
}));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function setup(initial: Filters = {}) {
  const changed = vi.fn();
  function Harness() {
    const [filters, setFilters] = React.useState(initial);
    return <RestaurantFilters filters={filters} userLocation={location} onChange={next => {
      changed(next);
      setFilters(next);
    }} />;
  }
  render(<Harness />);
  return changed;
}
const open = () => fireEvent.click(screen.getByRole("button", { name: "Pokaż filtry" }));
const apply = () => fireEvent.click(screen.getByRole("button", { name: "Pokaż restauracje" }));

describe("restaurant filter panel", () => {
  it("keeps choices in a draft until apply, then shows counted removable criteria", () => {
    const changed = setup();
    open();
    fireEvent.click(screen.getByRole("button", { name: "Średnia" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Polska" }));
    fireEvent.change(screen.getByLabelText("Godzina serwowania lunchu"), { target: { value: "13:00" } });
    expect(changed).not.toHaveBeenCalled();
    apply();
    expect(changed).toHaveBeenLastCalledWith({ priceLevels: ["średnia"], cuisineTypes: ["polska"], lunchTimeAt: "13:00" });
    expect(screen.getByRole("button", { name: "Pokaż filtry" })).toHaveTextContent("Filtry (3)");
    expect(screen.getByRole("button", { name: "Usuń filtr: Lunch o 13:00" })).toBeVisible();
  });

  it("discards canceled choices and reopens the applied filters", () => {
    const changed = setup({ cuisineTypes: ["polska"] });
    open();
    fireEvent.click(screen.getByRole("checkbox", { name: "Polska" }));
    fireEvent.click(screen.getByRole("button", { name: "Premium" }));
    fireEvent.click(screen.getByRole("button", { name: "Anuluj" }));
    expect(changed).not.toHaveBeenCalled();
    open();
    expect(screen.getByRole("checkbox", { name: "Polska" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Premium" })).toHaveAttribute("aria-pressed", "false");
  });

  it("removes only the chosen criterion and preserves search, distance, price and time", () => {
    const changed = setup({ searchQuery: "bistro", priceLevels: ["premium"], cuisineTypes: ["polska", "wloska"],
      distance: { radius: 5, from: location }, lunchTimeAt: "13:00", page: 3 });
    fireEvent.click(screen.getByRole("button", { name: "Usuń filtr: Polska" }));
    expect(changed).toHaveBeenLastCalledWith({ searchQuery: "bistro", priceLevels: ["premium"], cuisineTypes: ["wloska"],
      distance: { radius: 5, from: location }, lunchTimeAt: "13:00" });
    fireEvent.click(screen.getByRole("button", { name: "Usuń filtr: Do 5 km" }));
    expect(changed.mock.calls.at(-1)![0]).not.toHaveProperty("distance");
  });

  it("cancels pending search on reset so it cannot restore old filters", () => {
    vi.useFakeTimers();
    const changed = setup({ cuisineTypes: ["polska"] });
    fireEvent.change(screen.getByRole("searchbox", { name: "Szukaj restauracji" }), { target: { value: "pizza" } });
    fireEvent.click(screen.getByRole("button", { name: "Wyczyść filtry" }));
    act(() => vi.advanceTimersByTime(350));
    expect(changed).toHaveBeenCalledExactlyOnceWith({});
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Wyczyść filtry" })).toBeDisabled();
  });

  it("debounces search with applied criteria and ignores single-character queries", () => {
    vi.useFakeTimers();
    const changed = setup({ priceLevels: ["premium"] });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "p" } });
    act(() => vi.advanceTimersByTime(300));
    expect(changed).toHaveBeenLastCalledWith({ priceLevels: ["premium"] });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "pizza" } });
    act(() => vi.advanceTimersByTime(299));
    expect(changed).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1));
    expect(changed).toHaveBeenLastCalledWith({ priceLevels: ["premium"], searchQuery: "pizza" });
  });

  it("finishes pending search when opening without sending draft selections later", () => {
    vi.useFakeTimers();
    const changed = setup();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "pizza" } });
    open();
    expect(changed).toHaveBeenCalledExactlyOnceWith({ searchQuery: "pizza" });
    fireEvent.click(screen.getByRole("button", { name: "Premium" }));
    act(() => vi.advanceTimersByTime(350));
    expect(changed).toHaveBeenCalledTimes(1);
    apply();
    expect(changed).toHaveBeenLastCalledWith({ searchQuery: "pizza", priceLevels: ["premium"] });
  });
});
