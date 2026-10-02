"use client";

import { ColumnResizer } from "@/components/crm/column-resizer";
import { PageHeader } from "@/components/crm/page-header";
import type { InboxMobilePaneTab } from "@/features/inbox-v2/hooks/use-inbox-mobile-pane";
import { cn } from "@/lib/utils";

import {
  InboxCollapseHeaderButton,
  InboxCollapsiblePageHeader,
  InboxExpandHeaderButton,
  InboxMobileCompactBar,
  InboxMobilePaneToggle,
} from "./inbox-header-controls";

/**
 * Esqueleto da página do inbox: NavRail + lista + chat + contato, nas
 * variantes com/sem cabeçalho de página e desktop/mobile.
 */
export function InboxShell({
  pageHeader,
  isDesktop,
  navRail,
  hasActiveConversation,
  onCloseConversation,
  headerCollapsed,
  headerHydrated,
  setHeaderCollapsed,
  mobilePaneTab,
  setMobilePaneTab,
  conversationColumn,
  chat,
  aside,
  asideCollapsed,
  convWidth,
  asideWidth,
  setAsideWidth,
  period,
  searchFilter,
  searchFilterWithPeriod,
  compactSearchFilter,
  mobileCallButton,
  templateModal,
  extraDialogs,
}: {
  pageHeader?: { icon: React.ReactNode; title: string };
  isDesktop: boolean;
  navRail: React.ReactNode;
  hasActiveConversation: boolean;
  onCloseConversation: () => void;
  headerCollapsed: boolean;
  headerHydrated: boolean;
  setHeaderCollapsed: (collapsed: boolean) => void;
  mobilePaneTab: InboxMobilePaneTab;
  setMobilePaneTab: (tab: InboxMobilePaneTab) => void;
  conversationColumn: React.ReactNode;
  chat: React.ReactNode;
  aside: React.ReactNode;
  /** Aside efetivamente colapsado (preferência ou sem conversa ativa). */
  asideCollapsed: boolean;
  convWidth: number;
  asideWidth: number;
  setAsideWidth: (width: number) => void;
  period: React.ReactNode;
  searchFilter: React.ReactNode;
  searchFilterWithPeriod: React.ReactNode;
  compactSearchFilter: React.ReactNode;
  mobileCallButton: React.ReactNode;
  templateModal: React.ReactNode;
  extraDialogs: React.ReactNode;
}) {
  // Gate em `headerHydrated`: o default é `headerCollapsed=false`, então
  // sem gate o pill nunca aparecia indevidamente — MAS, se por qualquer
  // razão o default virasse `true` ou o SSR divergisse do client, o pill
  // "fantasma" apareceria por 1 frame. Manter o gate garante que a
  // decisão de mostrar/esconder o pill nunca dependa de estado
  // pré-hidratação.
  const expandHeaderBtn = headerHydrated && headerCollapsed ? (
    <InboxExpandHeaderButton onExpand={() => setHeaderCollapsed(false)} />
  ) : null;

  const mobilePaneToggle = (
    <InboxMobilePaneToggle value={mobilePaneTab} onChange={setMobilePaneTab} />
  );

  // Layout COM cabeçalho de página (estilo "Caixa de entrada" da
  // referência): NavRail fixo à esquerda; à direita o header no topo e
  // as 3 colunas (lista/chat/contato) numa grade abaixo.
  if (pageHeader) {
    // ── Mobile: layout de painel único (lista → chat/negócio) ──────
    if (!isDesktop) {
      return (
        <div className="v2-screen relative grid grid-cols-[var(--nav-rail-w,72px)_minmax(0,1fr)] overflow-hidden">
          {navRail}
          <div
            className={cn(
              "relative flex min-h-0 min-w-0 flex-col overflow-hidden",
              headerCollapsed ? "gap-0" : hasActiveConversation ? "gap-1" : "gap-4",
            )}
          >
            <InboxCollapsiblePageHeader
              headerHydrated={headerHydrated}
              headerCollapsed={headerCollapsed}
            >
              <PageHeader
                icon={pageHeader.icon}
                title={pageHeader.title}
                titleAccessory={hasActiveConversation ? mobilePaneToggle : undefined}
                pinAccessoryEnd={hasActiveConversation}
                className={hasActiveConversation ? "max-md:gap-y-0 max-md:pb-0" : undefined}
                center={hasActiveConversation ? undefined : searchFilterWithPeriod}
              />
            </InboxCollapsiblePageHeader>
            {!hasActiveConversation ? (
              <div className="min-h-0 flex-1 overflow-hidden">
                {conversationColumn}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {/* Barra compacta: Voltar | busca/filtro | ligação */}
                <InboxMobileCompactBar
                  onBack={onCloseConversation}
                  search={compactSearchFilter}
                  trailing={<div className="shrink-0">{mobileCallButton}</div>}
                />
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  {mobilePaneTab === "chat" ? chat : aside}
                </div>
              </div>
            )}
          </div>
          {expandHeaderBtn}
          {templateModal}
          {extraDialogs}
        </div>
      );
    }

    // ── Desktop: layout original de 3 colunas ─────────────────────
    return (
      <div
        className="v2-screen relative grid h-full min-h-0 overflow-hidden"
        style={{
          gridTemplateColumns: "var(--nav-rail-w, 72px) minmax(0, 1fr)",
          gridTemplateRows: "minmax(0, 1fr)",
        }}
      >
        {navRail}
        <div
          className={cn(
            "relative flex min-h-0 min-w-0 flex-col overflow-hidden",
            headerCollapsed ? "gap-0" : "gap-4",
          )}
        >
          <InboxCollapsiblePageHeader
            headerHydrated={headerHydrated}
            headerCollapsed={headerCollapsed}
          >
            <PageHeader
              icon={pageHeader.icon}
              title={pageHeader.title}
              center={searchFilter}
              actions={
                <>
                  {period}
                  <InboxCollapseHeaderButton onCollapse={() => setHeaderCollapsed(true)} />
                </>
              }
            />
          </InboxCollapsiblePageHeader>
          <div
            className="grid min-h-0 flex-1 gap-2 transition-[grid-template-columns] duration-200"
            style={{ gridTemplateColumns: `${convWidth}px 1fr ${asideCollapsed ? "0px" : `${asideWidth}px`}` }}
          >
            {conversationColumn}
            {chat}
            <div className="relative h-full min-h-0 overflow-hidden">
              {!asideCollapsed && (
                <ColumnResizer
                  direction="left"
                  value={asideWidth}
                  onChange={setAsideWidth}
                  min={240}
                  max={400}
                />
              )}
              {aside}
            </div>
          </div>
        </div>
        {expandHeaderBtn}
        {templateModal}
        {extraDialogs}
      </div>
    );
  }

  // Layout legado (linha única, sem topo) — usado por `(v2)/inbox-v2`.

  // ── Mobile: layout de painel único (lista → chat/negócio) ──────
  if (!isDesktop) {
    return (
      <div className="v2-screen grid grid-cols-[var(--nav-rail-w,72px)_minmax(0,1fr)] overflow-hidden">
        {navRail}
        <div className="flex min-h-0 min-w-0 flex-col gap-2 overflow-hidden">
          {!hasActiveConversation ? (
            <div className="min-h-0 flex-1 overflow-hidden">
              {conversationColumn}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {/* Barra compacta: Voltar | busca/filtro | Chat | Negócio */}
              <InboxMobileCompactBar
                onBack={onCloseConversation}
                search={compactSearchFilter}
                trailing={mobilePaneToggle}
              />
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {mobilePaneTab === "chat" ? chat : aside}
              </div>
            </div>
          )}
        </div>
        {templateModal}
        {extraDialogs}
      </div>
    );
  }

  // ── Desktop: layout original de 4 colunas ─────────────────────
  return (
    <div
      className="v2-screen grid h-full min-h-0 overflow-hidden"
      style={{
        // Coluna 1 fixa (NavRail), 2 controlada pelo resizer, 3 flexível, 4 redimensionável.
        gridTemplateColumns: `var(--nav-rail-w, 72px) ${convWidth}px 1fr ${asideCollapsed ? "0px" : `${asideWidth}px`}`,
        gridTemplateRows: "minmax(0, 1fr)",
      }}
    >
      {navRail}
      {conversationColumn}
      {chat}
      <div className="relative h-full min-h-0 overflow-hidden">
        {!asideCollapsed && (
          <ColumnResizer
            direction="left"
            value={asideWidth}
            onChange={setAsideWidth}
            min={240}
            max={400}
          />
        )}
        {aside}
      </div>
      {templateModal}
      {extraDialogs}
    </div>
  );
}
