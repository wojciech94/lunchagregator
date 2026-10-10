import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAdmin } from '@/lib/auth';
import { getImportRestaurant, listImportBindings, resolveImportSource } from '@/lib/lunch-import/bindings';
import { LunchImportPanel } from '@/components/admin/LunchImportPanel';
import { importSourceStatus } from '@/lib/lunch-import/source-status';

export default async function LunchImportPage() {
  if (!(await getAdmin())) notFound();
  try {
    const bindings = await listImportBindings();
    const configured = await Promise.all(bindings.map(async binding => {
      const resolved = await resolveImportSource(binding.source_id);
      return { binding, resolved, restaurant: resolved?.restaurant ?? await getImportRestaurant(binding.restaurant_id) };
    }));
    return <div className="space-y-6">
      <h1 className="text-2xl font-bold">Import menu — pilotaż</h1>
      <p>Źródła są przypisane do istniejących restauracji i potwierdzane przez Admina.</p>
      <p>Aktywna konfiguracja nie potwierdza aktualności lunchu. Przed każdą publikacją sprawdź oryginał, dostępność, datę, cenę i kanał sprzedaży.</p>
      <Link className="underline" href="/admin/restaurants">Konfiguruj import na szczegółach restauracji</Link>
      {!configured.length && <p role="status">Brak skonfigurowanych źródeł. Otwórz właściwą restaurację, sprawdź źródło i potwierdź oddział.</p>}
      {configured.map(({ binding, resolved, restaurant }) => <section key={binding.source_id} className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="text-lg font-semibold">{restaurant?.name ?? binding.source_name}</h2>
        <p>{restaurant?.address ?? binding.source_address}</p>
        {!restaurant && <p className="text-sm text-muted-foreground">Zapisana tożsamość źródła; aktualne dane lokalu sprawdź w ustawieniach.</p>}
        {binding.verified_at && <p className="text-sm text-muted-foreground">Wcześniej potwierdzony oddział: {binding.verified_name} — {binding.verified_address}</p>}
        <p role="status">Status: {importSourceStatus(binding, !!resolved, restaurant)}</p>
        <a className="underline break-all" href={binding.source_url} target="_blank" rel="noreferrer">Oficjalne źródło menu</a>
        <Link className="underline" href={`/restaurants/${binding.restaurant_id}`}>Ustawienia źródła — {binding.source_name}</Link>
        {binding.source_id === 'sofa' && <p role="alert">Sofa: w pilotażu wykryto ukrytą kategorię lunchową z ceną 40,31 zł. Nie potwierdzono jej aktualności. Odczyt kategorii oznaczonej jako ukryta jest blokowany; sprawdź widoczne menu lub potwierdź ofertę bezpośrednio w lokalu.</p>}
        {binding.trial?.limitations.map(message => <p role="alert" key={message}>{message}</p>)}
        {resolved ? <LunchImportPanel enabled sourceId={binding.source_id} name={resolved.restaurant.name}
          address={resolved.restaurant.address} label={resolved.source.label} />
          : <p>Otwórz ustawienia restauracji, aby sprawdzić konfigurację i potwierdzić źródło.</p>}
      </section>)}
    </div>;
  } catch {
    return <p role="alert">Konfiguracja importu jest niedostępna. Sprawdź migrację bazy.</p>;
  }
}
