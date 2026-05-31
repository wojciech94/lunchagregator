"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RestaurantForm } from "@/components/restaurants/RestaurantForm";
import type { Restaurant } from "@/types/restaurants";

export default function NewRestaurantPage() {
  const router = useRouter();

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
          onClick={() => router.push("/restaurants")}
          className="mb-4"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Powrót do restauracji
        </Button>
        <h1 className="text-2xl font-bold text-foreground">Dodaj restaurację</h1>
      </div>

      {/* Form */}
      <RestaurantForm onSuccess={handleSuccess} />
    </div>
  );
}
