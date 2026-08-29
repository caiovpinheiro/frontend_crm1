"use client";

/**
 * CallsClientPage — histórico de chamadas dentro da Central de Widgets.
 *
 * Gating:
 *   - Se o widget `calls_history` está INSTALADO: renderiza a UI normal
 *     (filtros + lista).
 *   - Se NÃO está instalado: mostra `NotEnabledState` com CTA pra
 *     `/widgets` (espelha o padrão de `/widgets/distribution`).
 *   - Enquanto a query carrega: skeleton (evita flash do estado vazio).
 *
 * O SoftphoneWidget global e o DealCallButton nos cards usam o MESMO
 * gate (`useCallsWidget`) — quem desinstala aqui desliga TUDO de
 * telefonia, sem precisar mexer em mais nada.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { IconPhone, IconRefresh, IconSettings } from "@tabler/icons-react";
import { toast } from "sonner";

import { AppLoading } from "@/components/crm/app-loading";
import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";
import { PageHeader } from "@/components/crm/page-header";
import { PageGhostButton, pageGhostButtonClass } from "@/components/crm/page-toolbar";
import { CallHistoryTimeline } from "@/features/softphone/components/call-history-timeline";
import {
  CallsSearchFilterBar,
  type CallsFilterState,
} from "@/features/softphone/components/calls-search-filter-bar";
import { useCallsWidget } from "@/features/softphone/hooks/use-calls-widget";
import { syncCalls } from "@/features/softphone/api/extensions";

interface CallsClientPageProps {
  navRail?: React.ReactNode;
}

export default function CallsClientPage({ navRail }: CallsClientPageProps = {}) {
  const { status: sessionStatus } = useSession();
  const isAuthenticated = sessionStatus === "authenticated";
  const callsWidget = useCallsWidget(isAuthenticated);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters] = useState<CallsFilterState>({});
  const queryClient = useQueryClient();
  const autoSyncedRef = useRef(false);

  // Debounce search → query
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const syncMutation = useMutation({
    mutationFn: syncCalls,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["calls"] });
      if (res?.reason === "no_api4com_token") {
        // Sem conta Api4com conectada — silencioso (a UI de settings cobre isso).
        return;
      }
      const total = (res?.created ?? 0) + (res?.updated ?? 0);
      if (total > 0) {
        toast.success(
          `Chamadas sincronizadas (${res.created} nova(s), ${res.updated} atualizada(s)).`,
        );
      }
    },
    onError: () => {
      toast.error("Não foi possível sincronizar as chamadas agora.");
    },
  });

  // Sync automático ao abrir a página (uma vez, quando o widget está ativo).
  useEffect(() => {
    if (callsWidget.enabled === true && !autoSyncedRef.current) {
      autoSyncedRef.current = true;
      syncMutation.mutate();
    }
  }, [callsWidget.enabled, syncMutation]);

  return (
    <div className="v2-screen grid min-w-0 grid-cols-[var(--nav-rail-w,72px)_minmax(0,1fr)] gap-3 overflow-hidden p-3 sm:gap-4 sm:p-4">
      {navRail ?? <NavRailSpacer />}

      <main className="flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden sm:gap-4">
        <PageHeader
          icon={<IconPhone size={22} stroke={2.2} />}
          title="Chamadas"
          center={
            <CallsSearchFilterBar
              search={search}
              onSearch={setSearch}
              filters={filters}
              onFiltersChange={setFilters}
            />
          }
          actions={
            <div className="flex shrink-0 items-center gap-2">
              <PageGhostButton
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                title="Sincronizar chamadas com a Api4com"
              >
                <IconRefresh
                  size={15}
                  className={syncMutation.isPending ? "animate-spin" : undefined}
                />
                <span className="hidden sm:inline">
                  {syncMutation.isPending ? "Sincronizando…" : "Sincronizar"}
                </span>
                <span className="sm:hidden">
                  {syncMutation.isPending ? "Sinc…" : "Sinc"}
                </span>
              </PageGhostButton>
              <Link
                href="/widgets?configure=calls_history"
                className={pageGhostButtonClass()}
                title="Configurações do softphone"
              >
                <IconSettings size={15} />
                <span className="hidden sm:inline">Configurações</span>
              </Link>
            </div>
          }
        />

        {callsWidget.isLoading ? (
          <SkeletonState />
        ) : callsWidget.enabled !== true ? (
          <NotEnabledState />
        ) : (
          <CallHistoryTimeline search={debouncedSearch} filters={filters} />
        )}
      </main>
    </div>
  );
}

function NotEnabledState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] p-12 text-center shadow-[var(--glass-shadow-sm)] backdrop-blur-md">
      <IconPhone size={36} className="text-[var(--text-muted)]" />
      <p className="font-display text-[16px] font-bold text-[var(--text-primary)]">
        Módulo de Telefonia não habilitado
      </p>
      <p className="max-w-md font-body text-[13px] text-[var(--text-muted)]">
        O histórico de chamadas, o softphone integrado e o botão de ligar nos
        cards fazem parte do widget de Telefonia. Ative-o na Central de Widgets
        para liberar esta área.
      </p>
      <a
        href="/widgets"
        className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-primary)] px-4 py-2 font-display text-[13px] font-bold text-white transition-all hover:-translate-y-px"
      >
        Ir para a Central de Widgets
      </a>
    </div>
  );
}

function SkeletonState() {
  return (
    <AppLoading variant="inline" className="min-h-[280px]" />
  );
}
