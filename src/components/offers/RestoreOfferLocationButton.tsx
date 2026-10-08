"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { updateOfferAction } from '@/actions/offers';

/** Explicitly repairs a published snapshot through the authorized, audited edit. */
export function RestoreOfferLocationButton({ offerId }: { offerId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function restore() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await updateOfferAction(offerId, { useRestaurantLocation: true });
      if (!result.success) {
        setMessage(result.error);
        return;
      }
      setMessage(result.locationWarning
        ? 'Adres zapisano, ale nie udało się ustalić współrzędnych. Oferta nie będzie widoczna w wyszukiwaniu po odległości.'
        : result.data.restaurantAddress || result.data.restaurantLocation
          ? 'Pobrano adres i lokalizację restauracji.'
          : 'Restauracja nie ma adresu ani współrzędnych. Uzupełnij jej dane.');
      router.refresh();
    } catch {
      setMessage('Nie udało się pobrać adresu restauracji. Spróbuj ponownie.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-w-sm flex-col gap-2">
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={restore}>
        {busy ? 'Pobieram adres...' : 'Pobierz adres restauracji'}
      </Button>
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
