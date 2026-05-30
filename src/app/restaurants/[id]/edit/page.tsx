"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RestaurantForm } from "@/components/restaurants/RestaurantForm";
import { getRestaurant } from "@/actions/restaurants";
import { ensureSessionToken } from "@/actions/session";
import type { Restaurant } from "@/types/restaurants";

interface EditRestaurantPageProps {
  params: Promise<{ id: string }>;
}

type LoadState =
  | { status: "loading" }
  | { status: "not_found" }
  | { status: "forbidden" }
  | { status: "ready"; restaurant: Restaurant; sessionToken: string };

export default function EditRestaurantPage({ params }: EditRestaurantPageProps) {
  const router = useRouter();
  const [state, setState] = React.useState<LoadState>({ status: "loading" });

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      const { id } = await params;
      const [restaurant, sessionToken] = await Promise.all([
        getRestaurant(id),
        ensureSessionToken(),
      ]);

      if (cancelled) return;

      if (!restaurant) {
        setState({ status: "not_found" });
        return;
      }

      if (restaurant.sessionToken !== sessionToken) {
        setState({ status: "forbidden" });
        return;
      }

      setState({ status: "ready", restaurant, sessionToken });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [params]);

  function handleSuccess(restaurant: Restaurant) {
    router.push(`/restaurants/${restaurant.id}`);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="mb-4"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Powrót
        </Button>
        <h1 className="text-2xl font-bold text-foreground">Edytuj restaurację</h1>
      </div>

      {state.status === "loading" && (
        <p className="text-sm text-muted-foreground">Ładowanie...</p>
      )}

      {state.status === "not_found" && (
        <div className="rounded-md border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Nie znaleziono restauracji.
          </p>
        </div>
      )}

      {state.status === "forbidden" && (
        <div className="rounded-[4px] border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">
            Nie masz uprawnień do edycji tej restauracji.
          </p>
        </div>
      )}

      {state.status === "ready" && (
        <RestaurantForm
          sessionToken={state.sessionToken}
          restaurantId={state.restaurant.id}
          initialData={state.restaurant}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
