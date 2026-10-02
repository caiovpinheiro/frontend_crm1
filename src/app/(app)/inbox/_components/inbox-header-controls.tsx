"use client";

import {
  IconArrowLeft,
  IconBriefcase,
  IconChevronsDown,
  IconChevronsUp,
  IconMessageCircle,
} from "@tabler/icons-react";

import { TooltipGlass } from "@/components/crm/tooltip-glass";
import type { InboxMobilePaneTab } from "@/features/inbox-v2/hooks/use-inbox-mobile-pane";
import { cn } from "@/lib/utils";

// Cabeçalho da página com colapso animado (slide up/down) — dá mais
// altura ao chat/asides. Não renderiza toggle inline; o controle
// fica integrado ao PageHeader (actions) ou flutua no canto sup.
// direito quando colapsado.
export function InboxCollapsiblePageHeader({
  headerHydrated,
  headerCollapsed,
  children,
}: {
  headerHydrated: boolean;
  headerCollapsed: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid shrink-0 overflow-hidden",
        // Só ligamos a transição APÓS a hidratação. Sem isso, quando o
        // usuário tinha `headerCollapsed=true` salvo, o SSR pintava o header
        // aberto e o `useLayoutEffect` flipava pra `true` logo depois — o
        // browser animava o fechamento em 300ms ("fantasma": header pisca
        // visível → colapsa animado → pill aparece). Com o gate, o estado
        // salvo é aplicado sem animação no primeiro paint pós-hidratação.
        headerHydrated && "transition-[grid-template-rows,opacity] duration-300 ease-out",
        headerCollapsed
          ? "pointer-events-none grid-rows-[0fr] opacity-0"
          : "grid-rows-[1fr] opacity-100",
      )}
      aria-hidden={headerCollapsed}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

// Botão "ocultar cabeçalho" — vai dentro do slot `actions` do
// PageHeader (extremo direito, ao lado dos demais controles).
export function InboxCollapseHeaderButton({ onCollapse }: { onCollapse: () => void }) {
  return (
    <TooltipGlass label="Ocultar cabeçalho" side="bottom">
      <button
        type="button"
        onClick={(e) => {
          e.currentTarget.blur();
          onCollapse();
        }}
        aria-label="Ocultar cabeçalho"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-muted)] shadow-[var(--glass-shadow-sm)] backdrop-blur transition-all hover:bg-[var(--glass-bg-base)] hover:text-[var(--brand-primary)] active:scale-95"
      >
        <IconChevronsUp size={16} stroke={2.2} />
      </button>
    </TooltipGlass>
  );
}

// Botão "mostrar cabeçalho" — pill circular no padrão da NavRailV2
// (border-brand + bg branco + shadow + hover fills). Fica no CANTO
// SUPERIOR DIREITO do outer grid (fora do container com overflow-hidden,
// senão é cortado). Alinhado verticalmente com o pill da NavRail
// (`top-6` = mesmo offset dela).
export function InboxExpandHeaderButton({ onExpand }: { onExpand: () => void }) {
  return (
    <TooltipGlass label="Mostrar cabeçalho" side="left">
      <button
        type="button"
        onClick={onExpand}
        aria-label="Mostrar cabeçalho"
        className="fixed right-6 top-6 z-50 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[var(--brand-primary)] bg-white text-[var(--brand-primary)] shadow-[0_2px_8px_rgba(15,23,42,0.25)] transition-all hover:scale-110 hover:bg-[var(--brand-primary)] hover:text-white"
      >
        <IconChevronsDown size={14} stroke={2.5} />
      </button>
    </TooltipGlass>
  );
}

/** Alternância Chat | Negócio do layout mobile. */
export function InboxMobilePaneToggle({
  value,
  onChange,
}: {
  value: InboxMobilePaneTab;
  onChange: (tab: InboxMobilePaneTab) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] p-0.5">
      <button
        type="button"
        onClick={() => onChange("chat")}
        className={cn(
          "flex items-center gap-1 rounded-[calc(var(--radius-md)-2px)] px-2 py-1 text-[11px] font-semibold transition-colors",
          value === "chat"
            ? "bg-[var(--brand-primary)] text-white shadow-sm"
            : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
        )}
      >
        <IconMessageCircle size={13} stroke={2} />
        Chat
      </button>
      <button
        type="button"
        onClick={() => onChange("negocio")}
        className={cn(
          "flex items-center gap-1 rounded-[calc(var(--radius-md)-2px)] px-2 py-1 text-[11px] font-semibold transition-colors",
          value === "negocio"
            ? "bg-[var(--brand-primary)] text-white shadow-sm"
            : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
        )}
      >
        <IconBriefcase size={13} stroke={2} />
        Negócio
      </button>
    </div>
  );
}

/** Barra compacta do mobile: Voltar | busca/filtro | ações à direita. */
export function InboxMobileCompactBar({
  onBack,
  search,
  trailing,
}: {
  onBack: () => void;
  search: React.ReactNode;
  trailing: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 shrink-0 items-center gap-1 overflow-hidden border-b border-[var(--glass-border)] bg-[var(--glass-bg)] px-2 py-1.5">
      <button
        type="button"
        onClick={onBack}
        className="flex shrink-0 items-center gap-1 rounded-[var(--radius-md)] px-1.5 py-1 text-[12px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--glass-bg-overlay)]"
      >
        <IconArrowLeft size={14} stroke={2} />
        Voltar
      </button>
      <div className="min-w-0 flex-1">
        {search}
      </div>
      {trailing}
    </div>
  );
}
