import { RouteLoading } from "@/components/crm/page-loading";

/**
 * Fallback de Suspense do route group `(app)`.
 * Um loader no centro da área de conteúdo (abaixo do NavRail).
 * A página destino, ao montar, assume o loader do próprio main —
 * este fallback some e não empilha um segundo.
 */
export default function Loading() {
  return <RouteLoading />;
}
