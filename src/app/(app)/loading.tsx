/**
 * Fallback de Suspense do route group `(app)`.
 * Não usa overlay de tela cheia: cada clique na rail disparava o
 * AppLoading em cima do CRM e dava a sensação de que o sistema
 * “recarregou” (ícones/contagens sumindo). A página destino já tem
 * skeleton próprio; aqui só um fio no topo.
 */
export default function Loading() {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[45] h-0.5 overflow-hidden bg-transparent"
      aria-hidden
    >
      <div className="h-full w-full animate-pulse bg-primary/70" />
    </div>
  );
}
