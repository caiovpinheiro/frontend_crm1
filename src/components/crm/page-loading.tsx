import { AppLoading } from "@/components/crm/app-loading";
import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";

/**
 * Compat: `PageLoading` / `PanelLoading` / `RouteLoading` delegam para
 * `AppLoading` inline (marca 32px + anel). Um loader só, centro do pane.
 */

/** Loader de container / painel (settings, lista, chat). */
export function PageLoading() {
  return <AppLoading variant="inline" className="min-h-0 flex-1" />;
}

export function PanelLoading() {
  return <AppLoading variant="inline" className="min-h-0 flex-1" />;
}

/**
 * Fallback de navegação do route group `(app)`: centro da área de
 * conteúdo, abaixo do shell/nav. Não é overlay de viewport.
 */
export function RouteLoading() {
  return (
    <div className="v2-screen grid grid-cols-[var(--nav-rail-w,72px)_1fr] overflow-hidden bg-background">
      <NavRailSpacer />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <PageLoading />
      </main>
    </div>
  );
}
