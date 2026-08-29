import { AppLoading } from "@/components/crm/app-loading";

/**
 * Compat: `PageLoading` / `PanelLoading` continuam existindo como nomes.
 * Delegam para o `AppLoading` (marca + anel).
 *
 * - `PageLoading` / `PanelLoading`: overlay fixo, marca no centro do
 *   viewport. `PanelLoading` não centra mais na coluna do conteúdo —
 *   isso fazia a marca pular depois do `loading.tsx` da rota.
 */

export function PageLoading() {
  return <AppLoading variant="screen" />;
}

export function PanelLoading() {
  return <AppLoading variant="panel" />;
}
