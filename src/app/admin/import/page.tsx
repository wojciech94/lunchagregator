import { notFound } from 'next/navigation';
import { getAdmin } from '@/lib/auth';
import { getImportSource, IMPORT_SOURCES } from '@/lib/lunch-import/sources';
import { LunchImportPanel } from '@/components/admin/LunchImportPanel';

export default async function LunchImportPage() {
  if (!(await getAdmin())) notFound();
  return <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold">Import menu — pilotaż</h1>
      <p className="mt-2 text-sm text-muted-foreground">Pobierz menu, sprawdź dane i potwierdź datę przed zatwierdzeniem publikacji.</p>
    </div>
    {Object.values(IMPORT_SOURCES).map(source => <LunchImportPanel key={source.id}
      sourceId={source.id} name={source.restaurantName} address={getImportSource(source.id)?.branchAddress ?? source.branchAddress}
      label={source.label} enabled={!!getImportSource(source.id)} />)}
  </div>;
}
