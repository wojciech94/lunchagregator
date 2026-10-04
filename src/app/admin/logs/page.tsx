import Link from "next/link";
import { notFound } from "next/navigation";

import { listAuditLog } from "@/actions/admin";
import { getAdmin } from "@/lib/auth";

/**
 * What admins did, newest first. Read-only by construction.
 *
 * `admin_audit_log` has no UPDATE and no DELETE policy, so there is nothing
 * here to write even by accident -- an admin who can rewrite the log has no
 * log. This page therefore offers no controls beyond navigation.
 */
export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await getAdmin())) {
    notFound();
  }

  const params = await searchParams;
  const raw = params.page;
  const requested = Array.isArray(raw) ? raw[0] : raw;
  const page = Math.max(1, Number.parseInt(requested ?? '1', 10) || 1);

  const result = await listAuditLog({ page });
  const rows = result.rows;

  const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Log administracji</h1>

      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Każda edycja i każde usunięcie wykonane przez administratora. Wpisów nie
        da się zmienić ani usunąć — tabela ma polityki tylko do odczytu.
      </p>

      {rows === null && (
        <div
          className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3"
          role="alert"
        >
          <p className="text-sm text-destructive">
            Nie udało się pobrać logu. Spróbuj ponownie za chwilę.
          </p>
        </div>
      )}

      {rows !== null && rows.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          {page > 1 ? 'Ta strona logu jest pusta.' : 'Nie ma jeszcze żadnych wpisów.'}
        </p>
      )}

      {rows !== null && rows.length > 0 && (
        <>
          <p className="mt-4 text-sm text-muted-foreground">
            {result.total} wpisów, strona {result.page} z {lastPage}
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <caption className="sr-only">
                Wpisy logu administracji, najnowsze pierwsze
              </caption>
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="py-2 pr-4 font-medium">Kiedy</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Akcja</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Tabela</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Rekord</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/50">
                    <td className="py-2 pr-4 align-top text-muted-foreground">
                      {new Date(row.createdAt).toLocaleString('pl-PL')}
                    </td>
                    <td className="py-2 pr-4 align-top">
                      {row.action === 'delete' ? 'usunięcie' : 'edycja'}
                    </td>
                    <td className="py-2 pr-4 align-top">
                      {row.tableName === 'restaurants' ? 'restauracje' : 'oferty'}
                    </td>
                    <td className="py-2 align-top">
                      <Link
                        href={
                          row.tableName === 'restaurants'
                            ? `/restaurants/${row.recordId}`
                            : `/offers/${row.recordId}`
                        }
                        className="font-mono text-xs underline-offset-4 hover:underline"
                      >
                        {row.recordId.slice(0, 8)}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <nav
            aria-label="Stronicowanie logu"
            className="mt-6 flex items-center gap-4 text-sm"
          >
            {result.page > 1 && (
              <Link
                href={`/admin/logs?page=${result.page - 1}`}
                className="text-muted-foreground underline underline-offset-4 hover:text-primary"
              >
                Poprzednia
              </Link>
            )}
            {result.page < lastPage && (
              <Link
                href={`/admin/logs?page=${result.page + 1}`}
                className="text-muted-foreground underline underline-offset-4 hover:text-primary"
              >
                Następna
              </Link>
            )}
          </nav>
        </>
      )}
    </div>
  );
}