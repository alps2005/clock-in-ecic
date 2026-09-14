import { errorMessage } from '../lib/attendance'
export function Loading() { return <div className="empty-state" role="status"><span className="loader" />Cargando tu espacio…</div> }
export function Failure({ error, retry }: { error: unknown; retry: () => void }) {
  return <div className="feedback error" role="alert"><p>{errorMessage(error)}</p><button className="button secondary" onClick={retry}>Volver a intentar</button></div>
}
export function Pager({ page, total, onPage }: { page: number; total: number; onPage: (page: number) => void }) {
  return <div className="pager"><span>{total} registros · Página {page + 1} de {Math.max(1, Math.ceil(total / 25))}</span><div><button className="button secondary" disabled={page === 0} onClick={() => onPage(page - 1)}>Anterior</button><button className="button secondary" disabled={(page + 1) * 25 >= total} onClick={() => onPage(page + 1)}>Siguiente</button></div></div>
}
