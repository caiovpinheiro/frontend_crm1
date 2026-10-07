"use client";

import { useEffect } from "react";
import { IconChevronLeft, IconX } from "@tabler/icons-react";

import { ColumnResizer } from "@/components/crm/column-resizer";
import { PageHeader } from "@/components/crm/page-header";
import type { InboxMobilePaneTab } from "@/features/inbox-v2/hooks/use-inbox-mobile-pane";
import type { ViewportLayout } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

import {
  InboxCollapseHeaderButton,
  InboxCollapsiblePageHeader,
  InboxExpandHeaderButton,
  InboxMobileCompactBar,
  InboxMobilePaneToggle,
} from "./inbox-header-controls";

/**
 * Tablet (768–1023 px): lista + conversa lado a lado; o contato abre numa
 * gaveta sobre a conversa (não cabe um terceiro painel fixo).
 */
function InboxTabletBody({
  convWidth,
  conversationColumn,
  chat,
  aside,
  hasActiveConversation,
  drawerOpen,
  onDrawerChange,
}: {
  convWidth: number;
  conversationColumn: React.ReactNode;
  chat: React.ReactNode;
  aside: React.ReactNode;
  hasActiveConversation: boolean;
  drawerOpen: boolean;
  onDrawerChange: (open: boolean) => void;
}) {
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDrawerChange(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen, onDrawerChange]);

  return (
    <div
      data-testid="inbox-tablet-body"
      className="relative grid min-h-0 flex-1 gap-2"
      style={{ gridTemplateColumns: `${convWidth}px minmax(0, 1fr)` }}
    >
      {conversationColumn}
      {chat}
      {hasActiveConversation && !drawerOpen ? (
        <button
          type="button"
          onClick={() => onDrawerChange(true)}
          aria-label="Abrir painel do contato"
          title="Abrir painel do contato"
          className="absolute right-0 top-1/2 z-20 flex h-14 w-6 -translate-y-1/2 items-center justify-center rounded-l-[var(--radius-md)] border border-r-0 border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--brand-primary)] shadow-[var(--glass-shadow)] backdrop-blur-md transition-colors hover:bg-[var(--brand-primary)] hover:text-white"
        >
          <IconChevronLeft size={14} stroke={3} />
        </button>
      ) : null}
      {hasActiveConversation && drawerOpen ? (
        <>
          <button
            type="button"
            aria-label="Fechar painel do contato"
            tabIndex={-1}
            onClick={() => onDrawerChange(false)}
            className="absolute inset-0 z-30 cursor-default rounded-[var(--radius-xl)] bg-black/25"
          />
          <div
            data-testid="inbox-tablet-drawer"
            role="dialog"
            aria-label="Detalhes do contato"
            className="absolute inset-y-0 right-0 z-40 w-[min(380px,92%)] overflow-hidden rounded-[var(--radius-xl)] shadow-[0_12px_32px_rgba(15,23,42,0.28)]"
          >
            {aside}
            <button
              type="button"
              onClick={() => onDrawerChange(false)}
              aria-label="Fechar painel do contato"
              className="absolute right-2 top-2 z-50 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-muted)] backdrop-blur hover:text-[var(--brand-primary)]"
            >
              <IconX size={16} />
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * Esqueleto da página do inbox: NavRail + lista + chat + contato, nas
 * variantes com/sem cabeçalho de página e desktop/mobile.
 */
export function InboxShell({
  pageHeader,
  layout,
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
  asideMinWidth = 240,
  asideMaxWidth = 400,
  tabletDrawerOpen,
  onTabletDrawerChange,
  period,
  searchFilter,
  searchFilterWithPeriod,
  compactSearchFilter,
  mobileCallButton,
  templateModal,
  extraDialogs,
}: {
  pageHeader?: { icon: React.ReactNode; title: string };
  /** Faixa de layout: celular (painel único), tablet (lista + conversa) ou desktop (3 colunas). */
  layout: ViewportLayout;
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
  asideMinWidth?: number;
  asideMaxWidth?: number;
  /** Tablet: gaveta do contato aberta. */
  tabletDrawerOpen: boolean;
  onTabletDrawerChange: (open: boolean) => void;
  period: React.ReactNode;
  searchFilter: React.ReactNode;
  searchFilterWithPeriod: React.ReactNode;
  compactSearchFilter: React.ReactNode;
  mobileCallButton: React.ReactNode;
  templateModal: React.ReactNode;
  extraDialogs: React.ReactNode;
}) {
  const isDesktop = layout === "desktop";
  const isTablet = layout === "tablet";
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
    // ── Tablet: lista + conversa, contato em gaveta ────────────────
    if (isTablet) {
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
                center={searchFilterWithPeriod}
                actions={<InboxCollapseHeaderButton onCollapse={() => setHeaderCollapsed(true)} />}
              />
            </InboxCollapsiblePageHeader>
            <InboxTabletBody
              convWidth={convWidth}
              conversationColumn={conversationColumn}
              chat={chat}
              aside={aside}
              hasActiveConversation={hasActiveConversation}
              drawerOpen={tabletDrawerOpen}
              onDrawerChange={onTabletDrawerChange}
            />
          </div>
          {expandHeaderBtn}
          {templateModal}
          {extraDialogs}
        </div>
      );
    }

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
            style={{ gridTemplateColumns: `${convWidth}px minmax(0, 1fr) ${asideCollapsed ? "0px" : `${asideWidth}px`}` }}
          >
            {conversationColumn}
            {chat}
            <div className="relative h-full min-h-0 overflow-hidden">
              {!asideCollapsed && (
                <ColumnResizer
                  direction="left"
                  value={asideWidth}
                  onChange={setAsideWidth}
                  min={asideMinWidth}
                  max={asideMaxWidth}
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

  // ── Tablet: lista + conversa, contato em gaveta ────────────────
  if (isTablet) {
    return (
      <div className="v2-screen grid h-full min-h-0 grid-cols-[var(--nav-rail-w,72px)_minmax(0,1fr)] overflow-hidden">
        {navRail}
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <InboxTabletBody
            convWidth={convWidth}
            conversationColumn={conversationColumn}
            chat={chat}
            aside={aside}
            hasActiveConversation={hasActiveConversation}
            drawerOpen={tabletDrawerOpen}
            onDrawerChange={onTabletDrawerChange}
          />
        </div>
        {templateModal}
        {extraDialogs}
      </div>
    );
  }

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
        gridTemplateColumns: `var(--nav-rail-w, 72px) ${convWidth}px minmax(0, 1fr) ${asideCollapsed ? "0px" : `${asideWidth}px`}`,
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
            min={asideMinWidth}
            max={asideMaxWidth}
          />
        )}
        {aside}
      </div>
      {templateModal}
      {extraDialogs}
    </div>
  );
}
