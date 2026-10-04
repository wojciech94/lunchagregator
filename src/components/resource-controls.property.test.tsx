/**
 * @vitest-environment jsdom
 */
// Feature: user-authentication, Property 8: Edit/delete UI controls are only shown to the resource owner

import { cleanup, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LunchOffer } from '@/types/offers';
import type { RestaurantWithDistance } from '@/types/restaurants';
import { fc } from '../../__tests__/properties/fc-config';
import { RestaurantDetail } from './restaurants/RestaurantDetail';

const offerPageMocks = vi.hoisted(() => ({
  getOfferById: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('@/actions/offers', () => ({
  getOfferById: offerPageMocks.getOfferById,
}));
vi.mock('@/lib/auth', () => ({
  getUser: offerPageMocks.getUser,
}));

import OfferDetailsPage from '@/app/offers/[id]/page';

type VisibilityCase = {
  resourceId: string;
  resourceUserId: string | null;
  viewerId: string | null;
};

const visibilityCaseArb = fc.oneof(
  fc.uuid().chain((userId) =>
    fc.uuid().map((resourceId) => ({
      resourceId,
      resourceUserId: userId,
      viewerId: userId,
    }))
  ),
  fc.record({
    resourceId: fc.uuid(),
    resourceUserId: fc.option(fc.uuid(), { nil: null }),
    viewerId: fc.option(fc.uuid(), { nil: null }),
  })
);

function controlsShouldBeVisible({ resourceUserId, viewerId }: VisibilityCase) {
  return viewerId !== null && resourceUserId !== null && viewerId === resourceUserId;
}

function createRestaurant({ resourceId, resourceUserId }: VisibilityCase): RestaurantWithDistance {
  return {
    id: resourceId,
    name: 'Testowa restauracja',
    description: null,
    address: null,
    location: null,
    priceLevel: null,
    lunchHours: null,
    cuisineTypes: [],
    phoneNumber: null,
    websiteUrl: null,
    sessionToken: null,
    userId: resourceUserId,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    distanceKm: null,
    activeOffersCount: 0,
  };
}

function createOffer({ resourceId, resourceUserId }: VisibilityCase): LunchOffer {
  return {
    id: resourceId,
    dishName: 'Testowe danie',
    items: [],
    price: 25,
    currency: 'PLN',
    description: null,
    restaurantName: 'Testowa restauracja',
    restaurantAddress: null,
    restaurantLocation: null,
    availableDate: '2025-01-01',
    cuisineType: null,
    dietaryTags: [],
    allergens: [],
    sourceType: 'text',
    userId: resourceUserId,
    sessionToken: 'legacy-session',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
}

function expectRestaurantOwnerControls(visible: boolean) {
  if (visible) {
    expect(screen.getByRole('link', { name: 'Edytuj' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Usuń' })).toBeInTheDocument();
    return;
  }

  expect(screen.queryByRole('link', { name: 'Edytuj' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Usuń' })).not.toBeInTheDocument();
}

function expectOfferOwnerControls(visible: boolean) {
  if (visible) {
    expect(screen.getByRole('link', { name: 'Edytuj' })).toBeInTheDocument();
    // A button, not a link to `/offers/[id]/delete`. Deletion is a dialog on the
    // page you are already on, which is also how restaurants have always done it
    // -- so this is the offer controls catching up, not a new inconsistency.
    expect(screen.getByRole('button', { name: /usuń/i })).toBeInTheDocument();
    return;
  }

  expect(screen.queryByRole('link', { name: 'Edytuj' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /usuń/i })).not.toBeInTheDocument();
}

/**
 * Property 8: Edit/delete UI controls are only shown to the resource owner.
 *
 * **Validates: Requirements 5.6**
 */
// The component renders capabilities and nothing else. Whether a given caller
// has them is the server's answer, which is what these two cases pin down --
// Property 8 above covers the owner path, and #54 added the admin one.
describe('record actions follow the capabilities the server computed', () => {
  it('shows actions to an admin on a record owned by somebody else', () => {
    const stranger: VisibilityCase = {
      resourceId: fc.sample(fc.uuid(), 1)[0]!,
      resourceUserId: fc.sample(fc.uuid(), 1)[0]!,
      viewerId: null,
    };

    render(
      <RestaurantDetail
        restaurant={createRestaurant(stranger)}
        canEdit={true}
        canDelete={true}
      />
    );

    expect(screen.getByRole('link', { name: /Edytuj/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Usuń/ })).toBeInTheDocument();

    cleanup();
  });

  it('shows nothing when the server said no, even on an owned record', () => {
    const owned: VisibilityCase = {
      resourceId: fc.sample(fc.uuid(), 1)[0]!,
      resourceUserId: fc.sample(fc.uuid(), 1)[0]!,
      viewerId: fc.sample(fc.uuid(), 1)[0]!,
    };

    render(
      <RestaurantDetail
        restaurant={createRestaurant(owned)}
        canEdit={false}
        canDelete={false}
      />
    );

    expect(screen.queryByRole('link', { name: /Edytuj/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Usuń/ })).not.toBeInTheDocument();

    cleanup();
  });
});

describe('Property 8: Edit/delete UI controls are only shown to the resource owner', () => {
  it('renders restaurant controls if and only if the viewer and resource have the same non-null ID', () => {
    fc.assert(
      fc.property(visibilityCaseArb, (visibilityCase) => {
        try {
          render(
            <RestaurantDetail
              restaurant={createRestaurant(visibilityCase)}
              canEdit={controlsShouldBeVisible(visibilityCase)}
              canDelete={controlsShouldBeVisible(visibilityCase)}
            />
          );

          expectRestaurantOwnerControls(controlsShouldBeVisible(visibilityCase));
        } finally {
          cleanup();
        }
      })
    );
  });

  it('renders offer controls if and only if the viewer and resource have the same non-null ID', async () => {
    await fc.assert(
      fc.asyncProperty(visibilityCaseArb, async (visibilityCase) => {
        try {
          offerPageMocks.getOfferById.mockResolvedValue({
            success: true,
            data: createOffer(visibilityCase),
          });
          offerPageMocks.getUser.mockResolvedValue(
            visibilityCase.viewerId === null
              ? null
              : { id: visibilityCase.viewerId, email: 'viewer@example.com' }
          );

          render(
            await OfferDetailsPage({ params: Promise.resolve({ id: visibilityCase.resourceId }) })
          );

          expectOfferOwnerControls(controlsShouldBeVisible(visibilityCase));
        } finally {
          cleanup();
        }
      })
    );
  });
});