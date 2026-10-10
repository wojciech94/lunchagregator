/** @vitest-environment jsdom */
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ThemeToggle } from "./ThemeToggle";

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("dark");
  document.cookie = "lunch-theme=; Path=/; Max-Age=0";
});

it("restores the server theme and persists both theme choices", () => {
  document.documentElement.classList.add("dark");
  render(<ThemeToggle />);
  fireEvent.click(screen.getByRole("button", { name: "Włącz tryb jasny" }));
  expect(document.documentElement).not.toHaveClass("dark");
  expect(document.cookie).toContain("lunch-theme=light");
  fireEvent.click(screen.getByRole("button", { name: "Włącz tryb ciemny" }));
  expect(document.documentElement).toHaveClass("dark");
  expect(document.cookie).toContain("lunch-theme=dark");
});
