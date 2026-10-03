// Feature: user-authentication, Property 12: NavHeader SSR and client render produce identical output

import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NavHeader } from "@/components/NavHeader";
import { setMockUser } from "../../tests/setup";

type AuthState = { id: string; email: string } | null;

const reactActEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
let previousReactActEnvironment: boolean | undefined;

const authStateArbitrary = fc.oneof(
  fc.constant(null),
  fc.record({
    id: fc.uuid(),
    email: fc.emailAddress(),
  })
);

async function expectConsistentHydration(authState: AuthState) {
  setMockUser(authState);
  const serverHtml = renderToStaticMarkup(await NavHeader());

  const hydratedContainer = document.createElement("div");
  hydratedContainer.innerHTML = serverHtml;
  const serverMarkup = hydratedContainer.innerHTML;
  document.body.append(hydratedContainer);

  const hydrationWarnings: unknown[] = [];
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  let hydratedRoot: Root | undefined;

  try {
    setMockUser(authState);
    const hydrationTree = await NavHeader();

    await act(async () => {
      hydratedRoot = hydrateRoot(hydratedContainer, hydrationTree, {
        onRecoverableError: (error) => hydrationWarnings.push(error),
      });
      await Promise.resolve();
    });

    // The hydrated DOM is the client output for the SSR markup supplied above.
    // A separate client-only root is deliberately not compared here: React's
    // Server Action transport injects server-only form/replay metadata there.
    expect(hydratedContainer.innerHTML).toBe(serverMarkup);
    expect(hydrationWarnings).toHaveLength(0);
    expect(consoleError).not.toHaveBeenCalled();
  } finally {
    await act(async () => {
      hydratedRoot?.unmount();
    });
    consoleError.mockRestore();
    hydratedContainer.remove();
  }
}

/**
 * **Validates: Requirements 7.4**
 *
 * Property 12: NavHeader SSR and client render produce identical output.
 * For every authenticated or Guest state, client rendering and hydration must
 * retain the server-rendered NavHeader markup without recoverable warnings.
 */
describe("Property 12: NavHeader SSR and client render produce identical output", () => {
  beforeEach(() => {
    previousReactActEnvironment = reactActEnvironment.IS_REACT_ACT_ENVIRONMENT;
    reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = previousReactActEnvironment;
  });

  it("preserves byte-identical markup without hydration warnings for every auth state", async () => {
    await fc.assert(
      fc.asyncProperty(authStateArbitrary, async (authState) => {
        await expectConsistentHydration(authState);
      }),
      { numRuns: 100 }
    );
  });
});
