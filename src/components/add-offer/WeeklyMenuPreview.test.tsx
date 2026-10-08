/**
 * @vitest-environment jsdom
 */
// Tests for the weekly-menu batch preview under the restaurant-first flow
// (Req 8.1–8.3, #70).
//
// History worth keeping: publishing a weekly menu used to fail with a bare
// "Validation failed" when the AI read no restaurant name off the photo —
// one bad shared field sank every day at once (#39). The preview used to
// carry an editable name field as the workaround. That field is gone: the
// assignment step now guarantees a restaurant — name, address and
// `restaurantId` — before any preview opens, so the batch cannot be published
// without them. The component's own responsibility is narrower and is what
// these tests pin: showing the assigned restaurant, selecting days, and
// dropping dishes the schema would reject.

import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrefilledOffer } from "@/lib/validations/extraction";
import type { AssignedRestaurant } from "@/lib/restaurant-match";
import { WeeklyMenuPreview } from "./WeeklyMenuPreview";

afterEach(cleanup);

const ASSIGNED: AssignedRestaurant = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  name: "Bar Mleko",
  address: "Marszałkowska 10, Warszawa",
};

/** A weekly menu as the AI returns it when it read no restaurant name. */
function menuWithoutName(): PrefilledOffer {
  return {
    restaurantName: null,
    address: "Marszałkowska 10, Warszawa",
    dishes: [
      {
        name: "Kotlet schabowy",
        price: 24.9,
        description: "",
        items: ["Zupa", "Kotlet"],
        dietaryTags: [],
        allergens: [],
        dayOfWeek: "monday",
        missingFields: [],
      },
      {
        name: "Pierogi ruskie",
        price: 22.0,
        description: "",
        items: [],
        dietaryTags: [],
        allergens: [],
        dayOfWeek: "tuesday",
        missingFields: [],
      },
    ],
    missingFields: ["restaurantName"],
  };
}

function menuWithName(): PrefilledOffer {
  return {
    ...menuWithoutName(),
    restaurantName: "Bar Mleko",
    missingFields: [],
  };
}

function publishButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: /Opublikuj/ }) as HTMLButtonElement;
}

describe("WeeklyMenuPreview: the assigned restaurant", () => {
  it("shows the assigned restaurant the offer will publish under", () => {
    render(
      <WeeklyMenuPreview
        offer={menuWithoutName()}
        assignedRestaurant={ASSIGNED}
        onConfirm={vi.fn()}
      />,
    );

    // The extraction read no name — the binding supplies it anyway.
    expect(screen.getByText("Bar Mleko")).toBeInTheDocument();
    expect(screen.getByText(/Marszałkowska 10, Warszawa/)).toBeInTheDocument();
    expect(screen.getByText(/Wszystkie dni tego menu/)).toBeInTheDocument();
  });

  it("publishes the selected days; the name comes from the binding, not the component", () => {
    const onConfirm = vi.fn();
    render(
      <WeeklyMenuPreview
        offer={menuWithName()}
        assignedRestaurant={ASSIGNED}
        onConfirm={onConfirm}
      />,
    );

    expect(publishButton()).not.toBeDisabled();
    fireEvent.click(publishButton());

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const [selected] = onConfirm.mock.calls[0];
    expect(selected).toHaveLength(2);
    expect(
      selected.map((entry: { dish: { name: string } }) => entry.dish.name),
    ).toEqual(["Kotlet schabowy", "Pierogi ruskie"]);
  });

  it("disables publishing when every day is deselected", () => {
    const onConfirm = vi.fn();
    render(
      <WeeklyMenuPreview
        offer={menuWithName()}
        assignedRestaurant={ASSIGNED}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByText(/Poniedziałek/));
    fireEvent.click(screen.getByText(/Wtorek/));

    expect(publishButton()).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("WeeklyMenuPreview: dishes without a usable price", () => {
  it("blocks a selected dish whose price is null", () => {
    const onConfirm = vi.fn();
    const offer = menuWithName();
    offer.dishes = [
      { ...offer.dishes[0], dayOfWeek: "monday" },
      {
        name: "Bez ceny",
        price: null,
        description: "",
        items: [],
        dietaryTags: [],
        allergens: [],
        dayOfWeek: "tuesday",
        missingFields: ["price"],
      },
    ];
    render(
      <WeeklyMenuPreview
        offer={offer}
        assignedRestaurant={ASSIGNED}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(publishButton());
    expect(publishButton()).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Publikuj ofertę 2" }),
    );
    fireEvent.click(publishButton());
    expect(onConfirm.mock.calls[0][0]).toHaveLength(1);
  });

  it("blocks a selected dish whose price is undefined", () => {
    // `price !== null` lets undefined through, which then fails validation on
    // the server as `price: Required` and sinks the whole batch.
    const onConfirm = vi.fn();
    const offer = menuWithName();
    offer.dishes = [
      { ...offer.dishes[0], dayOfWeek: "monday" },
      {
        name: "Bez ceny",
        price: undefined as unknown as number,
        description: "",
        items: [],
        dietaryTags: [],
        allergens: [],
        dayOfWeek: "tuesday",
        missingFields: ["price"],
      },
    ];
    render(
      <WeeklyMenuPreview
        offer={offer}
        assignedRestaurant={ASSIGNED}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(publishButton());
    expect(publishButton()).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Publikuj ofertę 2" }),
    );
    fireEvent.click(publishButton());
    expect(onConfirm.mock.calls[0][0]).toHaveLength(1);
  });

  it("blocks a selected dish priced at zero", () => {
    const onConfirm = vi.fn();
    const offer = menuWithName();
    offer.dishes = [
      { ...offer.dishes[0], dayOfWeek: "monday" },
      {
        name: "Za darmo",
        price: 0,
        description: "",
        items: [],
        dietaryTags: [],
        allergens: [],
        dayOfWeek: "tuesday",
        missingFields: [],
      },
    ];
    render(
      <WeeklyMenuPreview
        offer={offer}
        assignedRestaurant={ASSIGNED}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(publishButton());
    expect(publishButton()).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Publikuj ofertę 2" }),
    );
    fireEvent.click(publishButton());
    expect(onConfirm.mock.calls[0][0]).toHaveLength(1);
  });
});

describe("WeeklyMenuPreview: draft review", () => {
  it("publishes corrected fields and preserves unedited metadata", () => {
    const onConfirm = vi.fn();
    const offer = menuWithName();
    offer.dishes[0] = {
      ...offer.dishes[0],
      price: null,
      description: "Opis",
      dietaryTags: ["vegetarian"],
      allergens: ["mleko"],
    };
    render(
      <WeeklyMenuPreview
        offer={offer}
        assignedRestaurant={ASSIGNED}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.change(screen.getAllByLabelText("Nazwa dania")[0], {
      target: { value: "Nowy zestaw" },
    });
    fireEvent.change(screen.getAllByLabelText("Cena (PLN)")[0], {
      target: { value: "29.50" },
    });
    fireEvent.change(screen.getAllByLabelText(/Skład zestawu/)[0], {
      target: { value: "Zupa\nPierogi" },
    });
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const date = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
    fireEvent.change(screen.getAllByLabelText("Data publikacji")[0], {
      target: { value: date },
    });
    fireEvent.click(publishButton());
    expect(onConfirm.mock.calls[0][0][0]).toMatchObject({
      date,
      dish: {
        name: "Nowy zestaw",
        price: 29.5,
        items: ["Zupa", "Pierogi"],
        description: "Opis",
        dietaryTags: ["vegetarian"],
        allergens: ["mleko"],
      },
    });
    expect(offer.dishes[0].price).toBeNull();
  });

  it("counts dishes on the same day and retains corrections after a rejected submission", () => {
    const offer = menuWithName();
    offer.dishes[1].dayOfWeek = "monday";
    const props = { offer, assignedRestaurant: ASSIGNED, onConfirm: vi.fn() };
    const { rerender } = render(<WeeklyMenuPreview {...props} />);
    expect(publishButton()).toHaveTextContent("Opublikuj 2 ofert");
    fireEvent.change(screen.getAllByLabelText("Nazwa dania")[0], {
      target: { value: "Poprawione" },
    });
    rerender(<WeeklyMenuPreview {...props} isSubmitting />);
    rerender(<WeeklyMenuPreview {...props} />);
    expect(screen.getAllByLabelText("Nazwa dania")[0]).toHaveValue(
      "Poprawione",
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Publikuj ofertę 2" }),
    );
    expect(publishButton()).toHaveTextContent("Opublikuj 1 ofertę");
  });

  it("blocks past dates and allows recovery", () => {
    render(
      <WeeklyMenuPreview
        offer={menuWithName()}
        assignedRestaurant={ASSIGNED}
        onConfirm={vi.fn()}
      />,
    );
    fireEvent.change(screen.getAllByLabelText("Data publikacji")[0], {
      target: { value: "2020-01-01" },
    });
    expect(publishButton()).toBeDisabled();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Publikuj ofertę 1" }),
    );
    expect(publishButton()).not.toBeDisabled();
  });
});

it("requires reducing an oversized menu selection before publication", () => {
  const offer = menuWithName();
  offer.dishes = Array.from({ length: 51 }, () => ({ ...offer.dishes[0] }));
  render(
    <WeeklyMenuPreview
      offer={offer}
      assignedRestaurant={ASSIGNED}
      onConfirm={vi.fn()}
    />,
  );
  expect(publishButton()).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent("maksymalnie 50");
  fireEvent.click(screen.getByRole("checkbox", { name: "Publikuj ofertę 51" }));
  expect(publishButton()).not.toBeDisabled();
  expect(publishButton()).toHaveTextContent("Opublikuj 50 ofert");
});
