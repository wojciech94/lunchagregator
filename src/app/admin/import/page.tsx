import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAdmin } from '@/lib/auth';
import { listImportBindings, resolveImportSource } from '@/lib/lunch-import/bindings';
import { LunchImportPanel } from '@/components/admin/LunchImportPanel';

export default async function LunchImportPage() {
  if (!(await getAdmin())) notFound();
  try {
    const bindings = await listImportBindings();
    const configured = await Promise.all(bindings.map(async binding => ({ binding,
      resolved: await resolveImportSource(binding.source_id) })));
    return <div className="space-y-6">
      <h1 className="text-2xl font-bold">Import menu — pilotaż</h1>
      <p>Źródła są przypisane do istniejących restauracji i potwierdzane przez Admina.</p>
      <Link className="underline" href="/admin/restaurants">Konfiguruj import na szczegółach restauracji</Link>
      {!configured.length && <p role="status">Brak skonfigurowanych źródeł. Otwórz właściwą restaurację, sprawdź źródło i potwierdź oddział.</p>}
      {configured.map(({ binding, resolved }) => <section key={binding.source_id} className="space-y-3">
        <Link className="underline" href={`/restaurants/${binding.restaurant_id}`}>Ustawienia źródła {binding.source_id}</Link>
        {resolved ? <LunchImportPanel enabled sourceId={binding.source_id} name={resolved.restaurant.name}
          address={resolved.restaurant.address} label={resolved.source.label} />
          : <p role="status">Import wyłączony lub wymaga ponownego potwierdzenia oddziału.</p>}
      </section>)}
    </div>;
  } catch {
    return <p role="alert">Konfiguracja importu jest niedostępna. Sprawdź migrację bazy.</p>;
  }
}
