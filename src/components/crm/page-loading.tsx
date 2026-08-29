import { AppLoading } from "@/components/crm/app-loading";

/**
 * Compat: `PageLoading` / `PanelLoading` continuam existindo como nomes.
 * Delegam para o `AppLoading` inline (marca 32px + anel, centro do pane).
 */

export function PageLoading() {
  return <AppLoading variant="inline" className="min-h-[100dvh]" />;
}

export function PanelLoading() {
  return <AppLoading variant="inline" className="min-h-0 flex-1" />;
}
