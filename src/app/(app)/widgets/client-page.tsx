"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  IconInfoCircle,
  IconLayoutGrid,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { AppLoading } from "@/components/crm/app-loading";
import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";
import { WidgetsIcon } from "@/components/icons/widgets-icon";
import { PageHeader } from "@/components/crm/page-header";
import {
  PageSearchBar,
  PageSegmentedControl,
} from "@/components/crm/page-toolbar";

import {
  useInstallWidget,
  useUninstallWidget,
  useWidgets,
} from "@/features/widgets/hooks";
import type { WidgetDto } from "@/features/widgets/types";
import { WIDGET_CONFIG_REGISTRY } from "@/features/widgets/config-registry";
import { useMyPermissions } from "@/hooks/use-my-permissions";

import { WidgetsBento } from "./_components/widgets-bento";
import { WidgetConfigDrawer } from "./_components/widget-config-drawer";

interface WidgetsClientPageProps {
  navRail?: React.ReactNode;
}

export default function WidgetsClientPage({
  navRail,
}: WidgetsClientPageProps = {}) {
  const { data: session, status: sessionStatus } = useSession();
  const isAuthenticated = sessionStatus === "authenticated";
  const canManage = session?.user?.role === "ADMIN";

  const widgetsQuery = useWidgets(isAuthenticated);
  const installMutation = useInstallWidget();
  const uninstallMutation = useUninstallWidget();

  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "installed" | "available">("all");
  const [query, setQuery] = useState("");
  const [configSlug, setConfigSlug] = useState<string | null>(null);

  const widgets: WidgetDto[] = widgetsQuery.data?.items ?? [];

  // Permissões: computa uma vez o conjunto de slugs para os quais o
  // usuário pode ver o botão "Configurar" (widget instalado + permissão).
  const { data: perms } = useMyPermissions();
  const configurableSlugs = useMemo(() => {
    const set = new Set<string>();
    const list = perms?.permissions ?? [];
    const hasWildcard = list.includes("*");
    for (const w of widgets) {
      if (!w.installed || w.disabled) continue;
      const entry = WIDGET_CONFIG_REGISTRY[w.slug];
      if (!entry) continue;
      if (hasWildcard || list.includes(entry.requiredPermission)) {
        set.add(w.slug);
      }
    }
    return set;
  }, [widgets, perms]);

  // Deep link: `/widgets?configure=<slug>` abre o drawer direto. Suporta os
  // redirects vindos das antigas rotas `/settings/distribution` e
  // `/settings/softphone`. Só abre depois que os widgets carregam e o
  // slug é configurável para este usuário.
  const searchParams = useSearchParams();
  const configureParam = searchParams?.get("configure") ?? null;
  useEffect(() => {
    if (!configureParam) return;
    if (widgets.length === 0) return;
    if (!configurableSlugs.has(configureParam)) return;
    setConfigSlug(configureParam);
  }, [configureParam, widgets, configurableSlugs]);

  const counts = useMemo(
    () => ({
      all: widgets.length,
      installed: widgets.filter((w) => w.installed).length,
      available: widgets.filter((w) => !w.installed).length,
    }),
    [widgets],
  );

  const filteredWidgets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return widgets.filter((w) => {
      const okFilter =
        filter === "all" ||
        (filter === "installed" && w.installed) ||
        (filter === "available" && !w.installed);
      const okQuery =
        !q ||
        w.name.toLowerCase().includes(q) ||
        w.category.toLowerCase().includes(q);
      return okFilter && okQuery;
    });
  }, [widgets, filter, query]);

  const handleInstall = (slug: string) => {
    const widget = widgets.find((w) => w.slug === slug);
    setPendingSlug(slug);
    installMutation.mutate(slug, {
      onSuccess: () => {
        toast.success(`${widget?.name ?? "Widget"} instalado com sucesso.`);
      },
      onError: (err) => {
        toast.error(err.message || "Erro ao instalar widget.");
      },
      onSettled: () => setPendingSlug(null),
    });
  };

  const handleUninstall = (slug: string) => {
    const widget = widgets.find((w) => w.slug === slug);
    setPendingSlug(slug);
    uninstallMutation.mutate(slug, {
      onSuccess: () => {
        toast.success(`${widget?.name ?? "Widget"} removido.`);
      },
      onError: (err) => {
        toast.error(err.message || "Erro ao remover widget.");
      },
      onSettled: () => setPendingSlug(null),
    });
  };

  return (
    <div className="v2-screen grid min-w-0 grid-cols-[var(--nav-rail-w,72px)_1fr] gap-3 overflow-hidden p-3 sm:gap-4 sm:p-4">
      {navRail ?? <NavRailSpacer />}

      <main className="flex min-w-0 flex-col gap-3 overflow-y-auto pr-1 sm:gap-4">
        <PageHeader
          icon={<WidgetsIcon size={22} />}
          title="Widgets"
          center={
            <PageSearchBar
              variant="compact"
              value={query}
              onChange={setQuery}
              placeholder="Buscar widgets…"
              aria-label="Buscar widgets por nome ou categoria"
            />
          }
          actions={
            <PageSegmentedControl
              size="compact"
              aria-label="Filtrar widgets"
              value={filter}
              onChange={(v) => setFilter(v as typeof filter)}
              items={[
                { value: "all", label: <>Todos <span className="opacity-60">{counts.all}</span></> },
                { value: "installed", label: <>Instalados <span className="opacity-60">{counts.installed}</span></> },
                { value: "available", label: <>Disponíveis <span className="opacity-60">{counts.available}</span></> },
              ]}
            />
          }
        />

        {widgetsQuery.isLoading ? (
          <LoadingState />
        ) : widgetsQuery.error ? (
          <ErrorState message={widgetsQuery.error.message} />
        ) : widgets.length === 0 ? (
          <EmptyState />
        ) : filteredWidgets.length === 0 ? (
          <NoResultsState />
        ) : (
          <WidgetsBento
            widgets={filteredWidgets}
            canManage={canManage}
            pendingSlug={pendingSlug}
            configurableSlugs={configurableSlugs}
            onInstall={handleInstall}
            onUninstall={handleUninstall}
            onConfigure={setConfigSlug}
          />
        )}

        <WidgetConfigDrawer
          slug={configSlug}
          onClose={() => setConfigSlug(null)}
        />

        {/* Rodapé do marketplace (ref. mockup) */}
        <footer className="mt-auto flex flex-col gap-3 border-t border-[var(--glass-border)] pb-2 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2 font-body text-[12px] text-[var(--text-muted)]">
            <IconInfoCircle size={15} className="shrink-0" />
            Precisa de um widget customizado? Entre em contato com o suporte.
          </span>
          <div className="flex items-center gap-5 font-display text-[12px] font-bold text-[#2563eb]">
            <span className="cursor-pointer hover:underline">Documentação da API</span>
            <span className="cursor-pointer hover:underline">Termos de Uso</span>
          </div>
        </footer>
      </main>
    </div>
  );
}

function LoadingState() {
  return <AppLoading variant="inline" className="min-h-[240px]" />;
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--color-danger)]/20 bg-[color-mix(in_srgb,var(--color-danger)_8%,transparent)] p-6 text-center font-body text-[13px] text-[var(--color-danger-text)]">
      {message || "Erro ao carregar widgets."}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-12 text-center">
      <IconLayoutGrid size={32} className="text-[var(--text-muted)]" />
      <p className="font-display text-[15px] font-semibold text-[var(--text-primary)]">
        Nenhum widget disponível
      </p>
      <p className="font-body text-[13px] text-[var(--text-muted)]">
        Em breve novos recursos aparecerão por aqui.
      </p>
    </div>
  );
}

function NoResultsState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-12 text-center">
      <IconLayoutGrid size={32} className="text-[var(--text-muted)]" />
      <p className="font-display text-[15px] font-semibold text-[var(--text-primary)]">
        Nenhum widget encontrado
      </p>
      <p className="font-body text-[13px] text-[var(--text-muted)]">
        Ajuste a busca ou o filtro selecionado.
      </p>
    </div>
  );
}
