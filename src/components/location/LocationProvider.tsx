'use client';

import * as React from 'react';
import type { StoredLocation } from '@/lib/location';

const LocationContext = React.createContext<StoredLocation | null>(null);

/**
 * Seeds the location state for every client component in the tree.
 *
 * The cookie is `httpOnly`, so no client can read it. The root layout reads it
 * on the server and passes the value here once, rather than each of the five
 * `useGeolocation` consumers needing its own server round trip.
 */
export function LocationProvider({
  initialLocation,
  children,
}: {
  initialLocation: StoredLocation | null;
  // Optional because createElement passes it as the third argument, and the
  // props type is what it type-checks against.
  children?: React.ReactNode;
}) {
  return (
    <LocationContext.Provider value={initialLocation}>{children}</LocationContext.Provider>
  );
}

export function useInitialLocation(): StoredLocation | null {
  return React.useContext(LocationContext);
}