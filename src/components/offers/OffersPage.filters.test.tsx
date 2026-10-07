/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, act } from "@testing-library/react";
import { mockRouter, setMockSearchParams } from "../../../tests/setup";
import { OffersPage } from "./OffersPage";

vi.mock("@/hooks/useGeolocation", () => ({ useGeolocation: () => ({ coordinates: null, loading: false, error: null, permissionState: null, requestLocation: vi.fn(), setManualCoordinates: vi.fn() }) }));
vi.mock("@/components/location/AddressInput", () => ({ AddressInput: () => null }));
// The real Radix interaction and geometry are covered in the browser suite.
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: { children: React.ReactNode; value?: string; onValueChange: (v: string) => void }) => <select aria-label="Sortowanie" value={value ?? ""} onChange={e => onValueChange(e.target.value)}>{children}</select>,
  SelectTrigger: () => null, SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => <option value={value}>{children}</option>,
}));

const empty = { offers: [], total: 0, page: 1, limit: 50, hasMore: false };
afterEach(() => { cleanup(); vi.useRealTimers(); });
const pushed = () => new URL(mockRouter.push.mock.calls.at(-1)![0], "https://test.local").searchParams;

describe("real filter form and page URL integration", () => {
  it("keeps selected day, search, price, cuisine and radius when adding a diet and resets pagination", () => {
    setMockSearchParams("date=2026-10-08&q=zupa&priceMin=20&priceMax=50&cuisines=polska&radius=5&page=3");
    render(<OffersPage initialData={empty} />);
    fireEvent.click(screen.getByRole("button", { name: "Wegetariańskie" }));
    expect(Object.fromEntries(pushed())).toEqual({ date: "2026-10-08", q: "zupa", priceMin: "20", priceMax: "50", cuisines: "polska", diets: "vegetarian", radius: "5" });
  });

  it("preserves the selected day on reset but removes radius, sort, prices and other criteria", () => {
    setMockSearchParams("date=2026-10-08&radius=5&sort=price_asc&priceMin=20&priceMax=50&page=2");
    render(<OffersPage initialData={empty} />);
    fireEvent.click(screen.getByRole("button", { name: "Wyczyść filtry" }));
    expect(Object.fromEntries(pushed())).toEqual({ date: "2026-10-08" });
  });

  it("can reset a sort-only selection and choose default ordering without losing the day", () => {
    setMockSearchParams("date=2026-10-08&sort=price_asc");
    render(<OffersPage initialData={empty} />);
    expect(screen.getByRole("button", { name: "Wyczyść filtry" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Sortowanie"), { target: { value: "default" } });
    expect(pushed().get("sort")).toBeNull();
    expect(pushed().get("date")).toBe("2026-10-08");
  });

  it("shows a Polish price error without erasing the linked inputs or other criteria", () => {
    setMockSearchParams("date=2026-10-08&priceMin=50&priceMax=30&cuisines=polska");
    render(<OffersPage initialData={empty} />);
    expect(screen.getByLabelText("Cena minimalna")).toHaveValue(50);
    expect(screen.getByLabelText("Cena maksymalna")).toHaveValue(30);
    expect(screen.getByRole("alert")).toHaveTextContent(/minimalna.*maksymalnej/i);
    fireEvent.click(screen.getByRole("button", { name: "Wegetariańskie" }));
    expect(pushed().get("priceMin")).toBe("50");
    expect(pushed().get("cuisines")).toBe("polska");
  });

  it("does not let a pending search timer resurrect filters after reset", () => {
    vi.useFakeTimers();
    setMockSearchParams("date=2026-10-08&cuisines=polska");
    render(<OffersPage initialData={empty} />);
    fireEvent.change(screen.getByLabelText("Szukaj ofert"), { target: { value: "zupa" } });
    fireEvent.click(screen.getByRole("button", { name: "Wyczyść filtry" }));
    act(() => vi.advanceTimersByTime(350));
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(Object.fromEntries(pushed())).toEqual({ date: "2026-10-08" });
  });

  it("keeps reset in a stable row even when no criteria are selected", () => {
    render(<OffersPage initialData={empty} />);
    expect(screen.getByRole("button", { name: "Wyczyść filtry" })).toBeDisabled();
  });

  it("replaces history for debounced search while retaining date and criteria", () => {
    vi.useFakeTimers();
    setMockSearchParams("date=2026-10-08&cuisines=polska&radius=5");
    render(<OffersPage initialData={empty} />);
    fireEvent.change(screen.getByLabelText("Szukaj ofert"), { target: { value: "zu" } });
    fireEvent.change(screen.getByLabelText("Szukaj ofert"), { target: { value: "zupa" } });
    act(() => vi.advanceTimersByTime(350));
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    const params = new URL(mockRouter.replace.mock.calls[0][0], "https://test.local").searchParams;
    expect(Object.fromEntries(params)).toEqual({ date: "2026-10-08", cuisines: "polska", radius: "5", q: "zupa" });
  });

  it("does not let stale search undo a subsequent committed diet", () => {
    vi.useFakeTimers();
    setMockSearchParams("date=2026-10-08");
    render(<OffersPage initialData={empty} />);
    fireEvent.change(screen.getByLabelText("Szukaj ofert"), { target: { value: "zupa" } });
    fireEvent.click(screen.getByRole("button", { name: "Wegetariańskie" }));
    act(() => vi.advanceTimersByTime(350));
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(pushed().get("diets")).toBe("vegetarian");
    expect(pushed().get("q")).toBe("zupa");
  });

  it("keeps newer search text and its timer when an older search navigation completes", () => {
    vi.useFakeTimers();
    setMockSearchParams("date=2026-10-08&cuisines=polska");
    const view = render(<OffersPage initialData={empty} />);
    fireEvent.change(screen.getByLabelText("Szukaj ofert"), { target: { value: "zu" } });
    act(() => vi.advanceTimersByTime(300));
    fireEvent.change(screen.getByLabelText("Szukaj ofert"), { target: { value: "zupa" } });
    setMockSearchParams("date=2026-10-08&cuisines=polska&q=zu");
    view.rerender(<OffersPage initialData={empty} />);
    expect(screen.getByLabelText("Szukaj ofert")).toHaveValue("zupa");
    act(() => vi.advanceTimersByTime(300));
    expect(mockRouter.replace).toHaveBeenCalledTimes(2);
    expect(mockRouter.replace.mock.calls[1][0]).toContain("q=zupa");
  });

  it("follows navigation to a different day even when the filter values are unchanged", () => {
    vi.useFakeTimers();
    setMockSearchParams("date=2026-10-08&cuisines=polska");
    const view = render(<OffersPage initialData={empty} />);
    fireEvent.change(screen.getByLabelText("Szukaj ofert"), { target: { value: "zupa" } });
    setMockSearchParams("date=2026-10-09&cuisines=polska");
    view.rerender(<OffersPage initialData={empty} />);
    act(() => vi.advanceTimersByTime(350));
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Szukaj ofert")).toHaveValue("");
  });

  it("keeps the newest already-emitted search while older responses settle", () => {
    vi.useFakeTimers();
    setMockSearchParams("date=2026-10-08");
    const view = render(<OffersPage initialData={empty} />);
    for (const value of ["zu", "zupa"]) {
      fireEvent.change(screen.getByLabelText("Szukaj ofert"), { target: { value } });
      act(() => vi.advanceTimersByTime(300));
    }
    setMockSearchParams("date=2026-10-08&q=zu");
    view.rerender(<OffersPage initialData={empty} />);
    expect(screen.getByLabelText("Szukaj ofert")).toHaveValue("zupa");
    setMockSearchParams("date=2026-10-08&q=zupa");
    view.rerender(<OffersPage initialData={empty} />);
    expect(screen.getByLabelText("Szukaj ofert")).toHaveValue("zupa");
  });

  it("lets Back override a newer draft even when its query matches an outstanding search", () => {
    vi.useFakeTimers();
    setMockSearchParams("date=2026-10-08");
    const view = render(<OffersPage initialData={empty} />);
    fireEvent.change(screen.getByLabelText("Szukaj ofert"), { target: { value: "zu" } });
    act(() => vi.advanceTimersByTime(300));
    fireEvent.change(screen.getByLabelText("Szukaj ofert"), { target: { value: "zupa" } });
    fireEvent(window, new PopStateEvent("popstate"));
    setMockSearchParams("date=2026-10-08&q=zu");
    view.rerender(<OffersPage initialData={empty} />);
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByLabelText("Szukaj ofert")).toHaveValue("zu");
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
  });
});
