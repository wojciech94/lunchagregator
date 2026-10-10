/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { setMockPathname } from "../../tests/setup";
import { AddOfferLink } from "./AddOfferLink";

afterEach(cleanup);

it("marks the contribution destination active and clears it on navigation", () => {
  setMockPathname("/add");
  const view = render(<AddOfferLink />);
  const link = screen.getByRole("link", { name: "Dodaj ofertę" });
  expect(link).toHaveAttribute("aria-current", "page");
  expect(link).toHaveAttribute("href", "/add");
  setMockPathname("/add-other");
  view.rerender(<AddOfferLink />);
  expect(link).not.toHaveAttribute("aria-current");
});
