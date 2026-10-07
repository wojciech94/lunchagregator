/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeTextAction } from "@/actions/analyze";
import { createOffersBatchAction } from "@/actions/offers";
import AddOfferWizard from "./AddOfferWizard";
import type { AssignedRestaurant } from "@/lib/restaurant-match";
import type { PrefilledDish } from "@/lib/validations/extraction";

vi.mock("@/actions/analyze", () => ({
  analyzeTextAction: vi.fn(),
  analyzeUrlAction: vi.fn(),
  analyzeImageAction: vi.fn(),
}));
vi.mock("@/actions/offers", () => ({
  createOfferAction: vi.fn(),
  createOffersBatchAction: vi.fn(),
}));
vi.mock("@/components/add-offer/InputSelector", () => ({
  InputSelector: ({ onSubmit }: { onSubmit: (value: unknown) => void }) => (
    <button onClick={() => onSubmit({ type: "text", value: "Menu" })}>
      Analizuj
    </button>
  ),
}));
vi.mock("@/components/add-offer/RestaurantAssignment", () => ({
  RestaurantAssignment: ({
    onAssigned,
  }: {
    onAssigned: (value: AssignedRestaurant) => void;
  }) => (
    <button
      onClick={() =>
        onAssigned({
          id: "550e8400-e29b-41d4-a716-446655440001",
          name: "Inny bar",
          address: "Inny adres",
        })
      }
    >
      Wybierz inną
    </button>
  ),
}));
vi.mock("@/components/add-offer/WeeklyMenuPreview", () => ({
  WeeklyMenuPreview: ({
    assignedRestaurant,
    onConfirm,
  }: {
    assignedRestaurant: AssignedRestaurant;
    onConfirm: (offers: unknown[]) => void;
  }) => (
    <button
      onClick={() =>
        onConfirm([
          {
            dish: { name: "Pierogi", price: 20, items: [] },
            date: "2030-01-01",
          },
        ])
      }
    >
      Menu dla {assignedRestaurant.name}
    </button>
  ),
}));
vi.mock("@/components/add-offer/OfferPreview", () => ({
  OfferPreview: ({ onEdit }: { onEdit: () => void }) => (
    <button onClick={onEdit}>Edytuj ofertę</button>
  ),
}));
vi.mock("@/components/add-offer/OfferForm", () => ({
  OfferForm: ({
    assignedRestaurant,
  }: {
    assignedRestaurant: AssignedRestaurant;
  }) => <p>Formularz dla {assignedRestaurant.name}</p>,
}));

const initialRestaurant = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  name: "Wybrany bar",
  address: "Wybrany adres",
};
const dish: PrefilledDish = {
  name: "Pierogi",
  price: 20,
  items: [],
  description: "",
  dietaryTags: [],
  allergens: [],
  dayOfWeek: "monday",
  missingFields: [],
};
afterEach(cleanup);
beforeEach(() => {
  vi.mocked(analyzeTextAction).mockResolvedValue({
    success: true,
    data: {
      offers: [
        {
          restaurantName: "Nazwa z AI",
          address: "Adres z AI",
          dishes: [dish, { ...dish, dayOfWeek: "tuesday" }],
        },
      ],
      confidence: 0.9,
      sourceType: "text",
      missingFields: [],
    },
  });
});

describe("creation in restaurant context", () => {
  it("keeps the selected restaurant through extraction and batch publication", async () => {
    vi.mocked(createOffersBatchAction).mockResolvedValue({
      success: false,
      error: "Spróbuj ponownie",
    });
    render(<AddOfferWizard initialRestaurant={initialRestaurant} />);
    fireEvent.click(screen.getByRole("button", { name: "Analizuj" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Menu dla Wybrany bar" }),
    );
    await waitFor(() =>
      expect(createOffersBatchAction).toHaveBeenCalledWith([
        expect.objectContaining({
          restaurantId: initialRestaurant.id,
          restaurantName: initialRestaurant.name,
          restaurantAddress: initialRestaurant.address,
        }),
      ]),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Spróbuj ponownie",
    );
    expect(
      screen.getByRole("button", { name: "Menu dla Wybrany bar" }),
    ).toBeInTheDocument();
  });
  it("permits explicit reassignment and then returns to entering source data", async () => {
    render(<AddOfferWizard initialRestaurant={initialRestaurant} />);
    fireEvent.click(screen.getByRole("button", { name: "Zmień restaurację" }));
    fireEvent.click(screen.getByRole("button", { name: "Wybierz inną" }));
    fireEvent.click(screen.getByRole("button", { name: "Analizuj" }));
    expect(
      await screen.findByRole("button", { name: "Menu dla Inny bar" }),
    ).toBeInTheDocument();
  });
  it("keeps the context when using manual entry after failed extraction", async () => {
    vi.mocked(analyzeTextAction).mockResolvedValue({
      success: false,
      error: "Nie odczytano menu",
    });
    render(<AddOfferWizard initialRestaurant={initialRestaurant} />);
    fireEvent.click(screen.getByRole("button", { name: "Analizuj" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Wprowadź dane ręcznie" }),
    );
    expect(screen.getByText("Formularz dla Wybrany bar")).toBeInTheDocument();
  });
  it("keeps the context for a single extracted offer", async () => {
    vi.mocked(analyzeTextAction).mockResolvedValue({
      success: true,
      data: {
        offers: [
          {
            restaurantName: "Nazwa z AI",
            address: "",
            dishes: [{ ...dish, dayOfWeek: null }],
          },
        ],
        confidence: 0.9,
        sourceType: "text",
        missingFields: [],
      },
    });
    render(<AddOfferWizard initialRestaurant={initialRestaurant} />);
    fireEvent.click(screen.getByRole("button", { name: "Analizuj" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Edytuj ofertę" }),
    );
    expect(screen.getByText("Formularz dla Wybrany bar")).toBeInTheDocument();
  });
});

it('offers manual entry immediately without calling extraction', () => {
  render(<AddOfferWizard initialRestaurant={initialRestaurant} />);
  fireEvent.click(screen.getByRole('button', { name: 'Wprowadź dane ręcznie' }));
  expect(screen.getByText('Formularz dla Wybrany bar')).toBeInTheDocument();
  expect(analyzeTextAction).not.toHaveBeenCalled();
});
