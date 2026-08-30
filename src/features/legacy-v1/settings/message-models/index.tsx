"use client";

import { apiUrl } from "@/lib/api";
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconCircleCheck as CheckCircle2, IconChevronRight as ChevronRight, IconClock as Clock, IconDownload as Download, IconFileText as FileText, IconInfoCircle as Info, IconTemplate as LayoutTemplate, IconLoader2 as Loader2, IconMessageCircle as MessageCircle, IconPlus as Plus, IconSearch as Search, IconTrash as Trash2, IconUpload as Upload, IconHierarchy as Workflow } from "@tabler/icons-react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";

import { ButtonGlass } from "@/components/crm/button-glass";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import { KpiCard, KpiSquareScroll } from "@/components/crm/kpi-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMetaChannelLabel } from "@/lib/meta-whatsapp/meta-cloud-channels";
import { cn } from "@/lib/utils";

import { useSettingsHeaderSlots } from "@/app/(app)/settings/_v2-shell";
import { PageActionsMenu } from "@/components/crm/page-toolbar";
import { HeaderTabs } from "@/components/crm/section-header";
import { SettingsListFilterBar } from "@/components/crm/settings-filter-bar";
import { CsvIoDialog } from "@/features/data-io/csv-io-dialog";
import InternalTemplatesPage from "../templates";
import WhatsAppTemplatesPage from "../whatsapp-templates";
import {
  HubCallout,
  HubPanel,
  HubSubHeader,
} from "./hub-ui";

type InternalRow = {
  id: string;
  name: string;
  content: string;
  category: string | null;
  language: string;
  status: string;
  channelType: string | null;
};

type MetaRow = {
  id: string;
  name: string;
  status: string;
  category?: string;
  language?: string;
};

type FlowListRow = {
  id: string;
  shortId: string | null;
  name: string;
  status: string;
  metaFlowId: string | null;
  updatedAt: string;
};

type MetaFlowListItem = {
  id: string;
  name: string;
  status: string;
  categories: string[];
  alreadyImported: boolean;
  crmFlowDefinitionId: string | null;
};

const META_STATUS: Record<string, string> = {
  APPROVED: "Aprovado",
  PENDING: "Em análise",
  PENDING_APPROVAL: "Em análise",
  REJECTED: "Rejeitado",
};

export default function MessageModelsHubPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [newOpen, setNewOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [ioMode, setIoMode] = React.useState<"import" | "export" | null>(null);

  const tab = searchParams.get("tab") ?? "overview";
  const validTab = ["overview", "internal", "whatsapp", "flows"].includes(tab) ? tab : "overview";

  const { data: permissionsPanel } = useQuery<{ permissionKeys: string[] }>({
    queryKey: ["settings-permissions-panel"],
    queryFn: async () => {
      const r = await fetch(apiUrl("/api/settings/permissions"));
      if (!r.ok) return { permissionKeys: [] };
      return r.json();
    },
  });
  const perms = new Set(permissionsPanel?.permissionKeys ?? []);
  const role = (session?.user as { role?: string } | undefined)?.role;
  const isGestor = role === "ADMIN" || role === "MANAGER";
  const canSubmitMeta = isGestor || perms.has("*") || perms.has("template:submit_meta");
  const canViewTemplates = isGestor || perms.has("*") || perms.has("template:view");

  const safeTab = React.useMemo(() => {
    if (validTab === "internal" && !canViewTemplates) return "overview";
    if ((validTab === "whatsapp" || validTab === "flows") && !canSubmitMeta) return "overview";
    return validTab;
  }, [validTab, canViewTemplates, canSubmitMeta]);

  const setTab = React.useCallback(
    (next: string, extra?: Record<string, string | null>) => {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("tab", next);
      if (extra) {
        for (const [k, v] of Object.entries(extra)) {
          if (v == null || v === "") sp.delete(k);
          else sp.set(k, v);
        }
      }
      // Preserva a rota atual: quando o hub roda dentro do shell v2
      // (`/settings/message-models`), navega na rota canônica; quando roda
      // standalone em `/old/...`, mantém o caminho legado.
      router.replace(`${pathname}?${sp.toString()}`);
    },
    [router, pathname, searchParams],
  );

  const { data: internals = [], isLoading: loadingInt, isError: errorInt } = useQuery({
    queryKey: ["templates"],
    queryFn: async () => {
      const r = await fetch(apiUrl("/api/templates"));
      // NÃO engolir erro como lista vazia: um 500 (ex.: migração de banco
      // pendente) aparecia como "Internos = 0", mascarando o incidente.
      if (!r.ok) throw new Error(`Falha ao carregar modelos internos (HTTP ${r.status}).`);
      return r.json() as Promise<InternalRow[]>;
    },
  });

  const { data: hubMetaChannels = [] } = useQuery({
    queryKey: ["meta-cloud-whatsapp-channels"],
    queryFn: async () => {
      const { fetchMetaCloudWhatsAppChannels } = await import(
        "@/lib/meta-whatsapp/meta-cloud-channels"
      );
      return fetchMetaCloudWhatsAppChannels();
    },
    staleTime: 60_000,
    enabled: safeTab === "overview",
  });
  const [hubChannelId, setHubChannelId] = React.useState("");
  React.useEffect(() => {
    if (!hubMetaChannels.length) return;
    if (hubChannelId && hubMetaChannels.some((c) => c.id === hubChannelId)) return;
    const connected = hubMetaChannels.find((c) => c.status === "CONNECTED");
    setHubChannelId((connected ?? hubMetaChannels[0]).id);
  }, [hubMetaChannels, hubChannelId]);

  const { data: metaPage, isLoading: loadingMeta } = useQuery({
    queryKey: ["meta-whatsapp-templates", "hub-first", hubChannelId || "none"],
    queryFn: async () => {
      // limit=500 pega todos os templates da WABA (padrão da Graph é 100 e o
      // hub não pagina). Alinha os contadores da Visão geral / WhatsApp (Meta)
      // com a aba detalhada, que já usa limit=500.
      const q = new URLSearchParams({ limit: "500" });
      if (hubChannelId) q.set("channelId", hubChannelId);
      const r = await fetch(apiUrl(`/api/meta/whatsapp/message-templates?${q.toString()}`));
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { data: [] as MetaRow[] };
      return j as { data?: MetaRow[] };
    },
    enabled: safeTab === "overview" && (Boolean(hubChannelId) || hubMetaChannels.length === 0),
  });

  const { data: flows = [], isLoading: loadingFlows } = useQuery({
    queryKey: ["whatsapp-flow-definitions"],
    queryFn: async () => {
      const r = await fetch(apiUrl("/api/whatsapp-flow-definitions"));
      if (!r.ok) return [] as FlowListRow[];
      return r.json() as Promise<FlowListRow[]>;
    },
  });

  const createFlowMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(apiUrl("/api/whatsapp-flow-definitions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Novo flow ${new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`,
          flowCategory: "LEAD_GENERATION",
          screens: [
            {
              title: "Formulário",
              fields: [{ fieldKey: "nome", label: "Nome", fieldType: "TEXT", required: true }],
            },
          ],
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof j?.message === "string" ? j.message : "Erro ao criar flow.");
      return j as { id: string };
    },
    onSuccess: (out) => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-flow-definitions"] });
      router.push(`/settings/message-models/flows/${out.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteFlowMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(apiUrl(`/api/whatsapp-flow-definitions/${id}`), { method: "DELETE" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(typeof j?.message === "string" ? j.message : "Erro ao excluir flow.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-flow-definitions"] });
      toast.success("Flow excluído.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const {
    data: metaFlowsData,
    isLoading: loadingMetaFlows,
    refetch: refetchMetaFlows,
  } = useQuery({
    queryKey: ["whatsapp-flow-meta-list"],
    queryFn: async () => {
      const r = await fetch(apiUrl("/api/whatsapp-flow-definitions/meta-flows"));
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(typeof j?.message === "string" ? j.message : "Erro ao listar flows na Meta.");
      }
      return (j.items ?? []) as MetaFlowListItem[];
    },
    enabled: importOpen && canSubmitMeta,
  });

  const importFlowMutation = useMutation({
    mutationFn: async (metaFlowId: string) => {
      const r = await fetch(apiUrl("/api/whatsapp-flow-definitions/import"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metaFlowId }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof j?.message === "string" ? j.message : "Erro ao importar.");
      return j as { id: string; created: boolean };
    },
    onSuccess: (out) => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-flow-definitions"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-flow-meta-list"] });
      setImportOpen(false);
      toast.success(out.created ? "Flow importado da Meta." : "Flow já estava no CRM — abrindo editor.");
      router.push(`/settings/message-models/flows/${out.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [ovQuery, setOvQuery] = React.useState("");
  const [ovFilter, setOvFilter] = React.useState<"all" | "interno" | "waba" | "flow">("all");
  const [flowQuery, setFlowQuery] = React.useState("");
  const [flowFilter, setFlowFilter] = React.useState<"all" | "PUBLISHED" | "DRAFT">("all");

  const metaRows = metaPage?.data ?? [];
  const metaLoaded = !!metaPage;
  const internalCount = internals.length;
  const metaCount = metaRows.length;
  const flowCount = flows.length;
  const totalCount = internalCount + metaCount + flowCount;
  const metaApproved = metaRows.filter((r) => r.status === "APPROVED").length;
  const metaPending = metaRows.filter(
    (r) => r.status === "PENDING" || r.status === "PENDING_APPROVAL",
  ).length;
  const flowPublished = flows.filter((f) => f.status === "PUBLISHED").length;
  const flowDraft = flows.filter((f) => f.status !== "PUBLISHED").length;
  const flowWithMeta = flows.filter((f) => f.metaFlowId?.trim()).length;

  const tabItems = React.useMemo(() => {
    const items: { key: string; label: string; badge?: number }[] = [
      { key: "overview", label: "Visão geral", badge: totalCount || undefined },
    ];
    if (canViewTemplates) {
      items.push({ key: "internal", label: "Internos", badge: internalCount });
    }
    if (canSubmitMeta) {
      items.push({
        key: "whatsapp",
        label: "WhatsApp",
        badge: metaLoaded ? metaCount : undefined,
      });
      items.push({ key: "flows", label: "Flows", badge: flowCount });
    }
    return items;
  }, [canViewTemplates, canSubmitMeta, totalCount, internalCount, metaLoaded, metaCount, flowCount]);

  const overviewRows = React.useMemo(() => {
    const q = ovQuery.trim().toLowerCase();
    type OvRow = {
      key: string;
      type: "interno" | "waba" | "flow";
      name: string;
      preview: string;
      vars: string[];
      statusKind: "approved" | "pending" | "rejected" | "none";
      statusLabel: string;
      channel: string;
      onOpen: () => void;
    };
    const out: OvRow[] = [];
    if (ovFilter === "all" || ovFilter === "interno") {
      for (const t of internals) {
        out.push({
          key: `int-${t.id}`,
          type: "interno",
          name: t.name,
          preview: t.content ?? "",
          vars: [...new Set((t.content?.match(/\{\{(.*?)\}\}/g) ?? []))],
          statusKind: "none",
          statusLabel: "Modelo interno",
          channel: [t.category, t.channelType].filter(Boolean).join(" · ") || "Interno · todos os canais",
          onOpen: () => setTab("internal"),
        });
      }
    }
    if (ovFilter === "all" || ovFilter === "waba") {
      for (const t of metaRows) {
        const kind =
          t.status === "APPROVED"
            ? "approved"
            : t.status === "REJECTED"
              ? "rejected"
              : "pending";
        out.push({
          key: `meta-${t.id}`,
          type: "waba",
          name: t.name,
          preview: "",
          vars: [],
          statusKind: kind,
          statusLabel: META_STATUS[t.status] ?? t.status,
          channel: ["WhatsApp", t.category, t.language].filter(Boolean).join(" · "),
          onOpen: () => setTab("whatsapp"),
        });
      }
    }
    if (ovFilter === "all" || ovFilter === "flow") {
      for (const f of flows) {
        out.push({
          key: `flow-${f.id}`,
          type: "flow",
          name: f.name,
          preview: f.metaFlowId ? `Meta flow id ${f.metaFlowId}` : "Flow criado no CRM",
          vars: [],
          statusKind: "none",
          statusLabel: f.status === "PUBLISHED" ? "Publicado" : "Rascunho",
          channel: f.status === "PUBLISHED" ? "Flow · publicado" : "Flow · rascunho",
          onOpen: () => router.push(`/settings/message-models/flows/${f.shortId ?? f.id}`),
        });
      }
    }
    if (!q) return out;
    return out.filter(
      (r) => r.name.toLowerCase().includes(q) || r.preview.toLowerCase().includes(q),
    );
  }, [internals, metaRows, flows, ovFilter, ovQuery, router, setTab]);

  const flowRows = React.useMemo(() => {
    const q = flowQuery.trim().toLowerCase();
    return flows.filter((f) => {
      const okF = flowFilter === "all" || f.status === flowFilter;
      const okQ = !q || f.name.toLowerCase().includes(q) || (f.metaFlowId ?? "").includes(q);
      return okF && okQ;
    });
  }, [flows, flowFilter, flowQuery]);

  const headerSlots = useSettingsHeaderSlots();

  const tabBarNode = React.useMemo(
    () => (
      <HeaderTabs
        tabs={tabItems}
        value={safeTab}
        onChange={(value) => setTab(value, { new: null, create: null })}
      />
    ),
    [tabItems, safeTab, setTab],
  );

  // Busca na posição padrão (centro do PageHeader) com filtros segmentados
  // no popover — contextual por aba (visão geral: canais; flows: estado).
  const searchNode = React.useMemo(() => {
    if (safeTab === "overview") {
      return (
        <SettingsListFilterBar
          search={ovQuery}
          onSearch={setOvQuery}
          placeholder="Buscar por nome, conteúdo ou variável..."
          popoverTitle="Filtrar por canal"
          onClearAll={() => {
            setOvQuery("");
            setOvFilter("all");
          }}
          groups={[
            {
              key: "canal",
              label: "Filtrar por canal",
              value: ovFilter,
              onChange: (v) => setOvFilter(v as typeof ovFilter),
              options: [
                { value: "all", label: "Todos os canais", count: totalCount },
                { value: "interno", label: "Interno", count: internalCount },
                { value: "waba", label: "WhatsApp", count: metaCount },
                { value: "flow", label: "Flow", count: flowCount },
              ],
            },
          ]}
        />
      );
    }
    if (safeTab === "flows" && canSubmitMeta) {
      return (
        <SettingsListFilterBar
          search={flowQuery}
          onSearch={setFlowQuery}
          placeholder="Buscar flow por nome ou Meta flow id..."
          popoverTitle="Filtrar por estado"
          onClearAll={() => {
            setFlowQuery("");
            setFlowFilter("all");
          }}
          groups={[
            {
              key: "estado",
              label: "Filtrar por estado",
              value: flowFilter,
              onChange: (v) => setFlowFilter(v as typeof flowFilter),
              options: [
                { value: "all", label: "Todos", count: flowCount },
                { value: "PUBLISHED", label: "Publicados", count: flowPublished },
                { value: "DRAFT", label: "Rascunhos", count: flowDraft },
              ],
            },
          ]}
        />
      );
    }
    return null;
  }, [
    safeTab,
    ovQuery,
    ovFilter,
    flowQuery,
    flowFilter,
    canSubmitMeta,
    totalCount,
    internalCount,
    metaCount,
    flowCount,
    flowPublished,
    flowDraft,
  ]);

  // Pills (abas) + hambúrguer com os CTAs da página, à direita do PageHeader.
  const actionsNode = React.useMemo(() => {
    const menuItems: ModelsMenuItem[] =
      safeTab === "flows" && canSubmitMeta
        ? [
            {
              icon: createFlowMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Workflow className="size-4" />
              ),
              label: "Novo flow",
              onClick: () => createFlowMutation.mutate(),
              disabled: createFlowMutation.isPending,
            },
            {
              icon: <Download className="size-4" />,
              label: "Importar da Meta",
              onClick: () => {
                setImportOpen(true);
                void refetchMetaFlows();
              },
              divider: true,
            },
          ]
        : [
            {
              icon: <Plus className="size-4" />,
              label: "Novo modelo",
              onClick: () => setNewOpen(true),
            },
            ...(isGestor && (safeTab === "overview" || safeTab === "internal")
              ? [
                  {
                    icon: <Upload className="size-4" />,
                    label: "Importar CSV",
                    onClick: () => setIoMode("import"),
                    divider: true,
                  },
                  {
                    icon: <Download className="size-4" />,
                    label: "Exportar CSV",
                    onClick: () => setIoMode("export"),
                  },
                ]
              : []),
          ];
    return (
      <div className="flex items-center gap-2">
        {tabBarNode}
        <ModelsActionsMenu items={menuItems} />
      </div>
    );
  }, [safeTab, canSubmitMeta, isGestor, tabBarNode, createFlowMutation, refetchMetaFlows]);

  // Injeta busca (centro) + abas/ação (direita) na linha do PageHeader quando
  // rodando dentro do SettingsV2Shell. Sem o shell (rota /old) cai no
  // render inline abaixo.
  React.useEffect(() => {
    if (!headerSlots) return;
    headerSlots.setCenter(searchNode);
    headerSlots.setActions(actionsNode);
    return () => {
      headerSlots.setCenter(null);
      headerSlots.setActions(null);
    };
  }, [headerSlots, searchNode, actionsNode]);

  const overviewKpis = [
    {
      key: "total",
      label: "Total modelos",
      value: totalCount.toLocaleString("pt-BR"),
      icon: <LayoutTemplate className="size-5" />,
      tone: "brand" as const,
    },
    {
      key: "internal",
      label: "Internos",
      value: internalCount.toLocaleString("pt-BR"),
      icon: <FileText className="size-5" />,
      tone: "violet" as const,
    },
    {
      key: "wa-approved",
      label: "WhatsApp aprovados",
      value: metaApproved.toLocaleString("pt-BR"),
      icon: <CheckCircle2 className="size-5" />,
      tone: "success" as const,
    },
    {
      key: "wa-pending",
      label: "Aguardando Meta",
      value: metaPending.toLocaleString("pt-BR"),
      icon: <Clock className="size-5" />,
      tone: "warning" as const,
    },
    {
      key: "flows-pub",
      label: "Flows publicados",
      value: flowPublished.toLocaleString("pt-BR"),
      icon: <Workflow className="size-5" />,
      tone: "neutral" as const,
    },
  ];

  const flowKpis = [
    {
      key: "total",
      label: "Flows no total",
      value: flowCount.toLocaleString("pt-BR"),
      icon: <Workflow className="size-5" />,
      tone: "brand" as const,
    },
    {
      key: "published",
      label: "Publicados",
      value: flowPublished.toLocaleString("pt-BR"),
      icon: <CheckCircle2 className="size-5" />,
      tone: "success" as const,
    },
    {
      key: "draft",
      label: "Rascunhos",
      value: flowDraft.toLocaleString("pt-BR"),
      icon: <FileText className="size-5" />,
      tone: "warning" as const,
    },
    {
      key: "meta-id",
      label: "Com Meta flow id",
      value: flowWithMeta.toLocaleString("pt-BR"),
      icon: <LayoutTemplate className="size-5" />,
      tone: "violet" as const,
    },
  ];

  return (
    <div className="min-w-0 w-full max-w-full space-y-3 sm:space-y-4">
      {!headerSlots ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {searchNode ? <div className="min-w-0 flex-1">{searchNode}</div> : <div />}
          {actionsNode}
        </div>
      ) : null}

      {errorInt ? (
        <div className="flex items-start gap-2.5 rounded-[var(--radius-lg)] border border-[var(--color-danger)]/30 bg-[var(--color-danger-bg)] px-3.5 py-3 text-[var(--color-danger-text)]">
          <Info className="mt-0.5 size-[18px] shrink-0" />
          <div className="min-w-0 text-[12.5px]">
            <p className="font-bold">Não foi possível carregar os modelos internos.</p>
            <p className="mt-0.5 opacity-90">
              O servidor retornou erro — os contadores acima podem estar zerados por engano.
              Se isso persistir após um deploy, verifique se há migração de banco pendente.
            </p>
          </div>
        </div>
      ) : null}

      {safeTab === "overview" && (
        <div className="space-y-4">
          {hubMetaChannels.length > 1 ? (
            <div className="max-w-md space-y-1.5">
              <Label className="text-[11px] font-semibold text-[var(--text-muted)]">
                Contadores WhatsApp por canal
              </Label>
              <DropdownGlass
                triggerClassName="w-full"
                placeholder="Canal…"
                value={hubChannelId}
                options={hubMetaChannels.map((c) => ({
                  value: c.id,
                  label: formatMetaChannelLabel(c),
                }))}
                onValueChange={setHubChannelId}
              />
            </div>
          ) : null}
          <section className="shrink-0" aria-label="Indicadores de modelos de mensagem">
            <KpiSquareScroll items={overviewKpis} />
            <div className="hidden gap-2.5 sm:gap-3.5 lg:grid lg:grid-cols-5">
              {overviewKpis.map((kpi) => (
                <KpiCard
                  key={kpi.key}
                  label={kpi.label}
                  value={kpi.value}
                  icon={kpi.icon}
                  tone={kpi.tone}
                />
              ))}
            </div>
          </section>

          {loadingInt || loadingMeta || loadingFlows ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Skeleton className="h-[92px] w-full rounded-[var(--radius-lg)]" />
              <Skeleton className="h-[92px] w-full rounded-[var(--radius-lg)]" />
              <Skeleton className="h-[92px] w-full rounded-[var(--radius-lg)]" />
            </div>
          ) : overviewRows.length === 0 ? (
            <HubPanel>
              <div className="flex flex-col items-center gap-2.5 px-5 py-14 text-center">
                <Search className="size-9 text-[var(--glass-border)]" />
                <p className="text-[13px] text-[var(--text-muted)]">Nenhum modelo encontrado.</p>
              </div>
            </HubPanel>
          ) : (
            <div className="space-y-4">
              {OVERVIEW_GROUPS.map((g) => {
                const rows = overviewRows.filter((r) => r.type === g.type);
                if (!rows.length) return null;
                return (
                  <div key={g.type} className="min-w-0">
                    <div className="mb-2.5 flex items-center gap-2 px-0.5">
                      <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-md)]", g.badge)}>
                        {g.icon}
                      </span>
                      <span className="font-display text-[13px] font-bold text-[var(--text-secondary)]">
                        {g.title}
                      </span>
                      <span className="rounded-full bg-[var(--glass-bg-strong)] px-1.5 text-[11px] font-bold text-[var(--text-secondary)]">
                        {rows.length}
                      </span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {rows.map((r) => (
                        <div
                          key={r.key}
                          role="button"
                          tabIndex={0}
                          onClick={r.onOpen}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              r.onOpen();
                            }
                          }}
                          className="group relative flex min-w-0 cursor-pointer items-center gap-3 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-3.5 py-3 shadow-[var(--glass-shadow-sm)] backdrop-blur-md transition-all duration-150 hover:-translate-y-0.5 hover:border-[var(--input-border-focus)] hover:shadow-[var(--glass-shadow)]"
                        >
                          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)]", g.badge)}>
                            {g.icon}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[14px] font-bold text-[var(--text-primary)]">{r.name}</div>
                            {r.preview ? (
                              <div className="mt-0.5 truncate text-[12px] text-[var(--text-muted)]">{r.preview}</div>
                            ) : null}
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                              <StatusPill kind={r.statusKind} label={r.statusLabel} />
                              <span className="truncate text-[11px] text-[var(--text-muted)]">{r.channel}</span>
                            </div>
                            {r.vars.length ? (
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                {r.vars.map((v) => (
                                  <span
                                    key={v}
                                    className="rounded-[var(--radius-sm)] border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] px-1.5 py-0.5 font-mono text-[10.5px] text-[var(--text-secondary)]"
                                  >
                                    {v}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          <ChevronRight className="size-4 shrink-0 text-[var(--text-muted)] opacity-40 transition-all group-hover:translate-x-0.5 group-hover:text-[var(--brand-primary)] group-hover:opacity-100" />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {safeTab === "internal" &&
        (canViewTemplates ? (
          <InternalTemplatesPage embedded />
        ) : (
          <p className="text-sm text-[var(--text-muted)]">Sem permissão para modelos internos.</p>
        ))}

      {safeTab === "whatsapp" &&
        (canSubmitMeta ? (
          <WhatsAppTemplatesPage embedded />
        ) : (
          <p className="text-sm text-[var(--text-muted)]">Sem permissão para templates na Meta.</p>
        ))}

      {safeTab === "flows" && canSubmitMeta && (
        <div className="space-y-4">
          <HubSubHeader
            icon={<Workflow className="size-5" />}
            title="Flows interativos"
          >
            Desenhe um flow direto no CRM ou importe um já publicado na WABA; depois{" "}
            <strong className="font-bold text-[var(--text-secondary)]">mapeie cada resposta para o campo do lead</strong>.
            Flows publicados podem ser anexados como{" "}
            <code className="rounded-[var(--radius-sm)] border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--text-secondary)]">
              botão Flow
            </code>{" "}
            nos templates da Meta.
          </HubSubHeader>

          <section className="shrink-0" aria-label="Indicadores de flows">
            <KpiSquareScroll items={flowKpis} />
            <div className="hidden gap-2.5 sm:gap-3.5 lg:grid lg:grid-cols-5">
              {flowKpis.map((kpi) => (
                <KpiCard
                  key={kpi.key}
                  label={kpi.label}
                  value={kpi.value}
                  icon={kpi.icon}
                  tone={kpi.tone}
                />
              ))}
            </div>
          </section>

          <HubCallout tone="info" icon={<Info className="size-[18px]" />}>
            Flows criados só no <strong className="font-bold text-[var(--brand-primary-dark)]">Meta Business Manager</strong>{" "}
            não aparecem aqui automaticamente. Use{" "}
            <strong className="font-bold text-[var(--brand-primary-dark)]">Importar da Meta</strong> para trazer o cadastro
            (ex.: estagiário) e configurar o mapeamento das respostas no lead.
          </HubCallout>

          {loadingFlows ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Skeleton className="h-[104px] w-full rounded-[var(--radius-lg)]" />
              <Skeleton className="h-[104px] w-full rounded-[var(--radius-lg)]" />
            </div>
          ) : flowRows.length === 0 ? (
            <HubPanel>
              <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
                <Workflow className="size-9 text-[var(--glass-border)]" />
                <h3 className="text-[15px] font-bold text-[var(--text-secondary)]">Nenhum flow encontrado</h3>
                <p className="text-[13px] text-[var(--text-muted)]">Ajuste a busca ou importe um flow já publicado na Meta.</p>
              </div>
            </HubPanel>
          ) : (
            <div className="space-y-2.5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {flowRows.map((f) => (
                  <div
                    key={f.id}
                    className="group relative flex min-w-0 items-center gap-3 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-3.5 py-3 shadow-[var(--glass-shadow-sm)] backdrop-blur-md transition-all duration-150 hover:-translate-y-0.5 hover:border-[var(--input-border-focus)] hover:shadow-[var(--glass-shadow)]"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-enterprise-bg)] text-[var(--brand-primary)]">
                      <Workflow className="size-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-bold text-[var(--text-primary)]">{f.name}</div>
                      <div className="mt-0.5 truncate text-[11.5px] text-[var(--text-muted)]">
                        {f.metaFlowId ? `Meta flow id ${f.metaFlowId}` : "Criado no CRM"}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <FlowStateBadge published={f.status === "PUBLISHED"} />
                        <span className="text-[11px] text-[var(--text-muted)]">
                          {new Date(f.updatedAt).toLocaleDateString("pt-BR")}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        aria-label="Excluir flow"
                        onClick={() => deleteFlowMutation.mutate(f.id)}
                        disabled={deleteFlowMutation.isPending}
                        className="flex size-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-muted)] transition-colors hover:border-[var(--color-danger)]/40 hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)] disabled:opacity-50"
                      >
                        <Trash2 className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => router.push(`/settings/message-models/flows/${f.shortId ?? f.id}`)}
                        className="rounded-[var(--radius-full)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-4 py-1.5 text-[12.5px] font-bold text-[var(--brand-primary)] transition-colors hover:border-[var(--input-border-focus)] hover:bg-[var(--color-enterprise-bg)]"
                      >
                        Editar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-0.5">
                <span className="text-[12.5px] text-[var(--text-muted)]">
                  {flowRows.length} {flowRows.length === 1 ? "flow" : "flows"}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {ioMode ? (
        <CsvIoDialog
          open
          onOpenChange={(next) => {
            if (!next) setIoMode(null);
          }}
          entity="templates"
          mode={ioMode}
          onDone={() => {
            void queryClient.invalidateQueries({ queryKey: ["templates"] });
          }}
        />
      ) : null}

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Novo modelo</DialogTitle>
            <DialogDescription>Escolha o tipo de modelo, como no Kommo.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              className="flex flex-col items-start gap-2 rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] p-4 text-left transition-colors hover:border-[var(--brand-primary)]/40 hover:bg-[color-mix(in_srgb,var(--brand-primary)_6%,transparent)]"
              onClick={() => {
                setNewOpen(false);
                setTab("internal", { new: "1" });
              }}
            >
              <FileText className="size-6 text-[var(--brand-primary)]" />
              <span className="font-semibold text-[var(--text-primary)]">Modelo geral</span>
              <span className="text-xs text-[var(--text-muted)]">Texto reutilizável no CRM (vários canais).</span>
            </button>
            <button
              type="button"
              className="flex flex-col items-start gap-2 rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] p-4 text-left transition-colors hover:border-[var(--brand-primary)]/40 hover:bg-[color-mix(in_srgb,var(--brand-primary)_6%,transparent)] disabled:opacity-50"
              disabled={!canSubmitMeta}
              onClick={() => {
                setNewOpen(false);
                setTab("whatsapp", { create: "1" });
              }}
            >
              <MessageCircle className="size-6 text-[var(--color-success)]" />
              <span className="font-semibold text-[var(--text-primary)]">Template WhatsApp</span>
              <span className="text-xs text-[var(--text-muted)]">Envio oficial na Meta (WABA).</span>
            </button>
          </div>
          {canSubmitMeta ? (
            <button
              type="button"
              className="flex w-full flex-col items-start gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-4 text-left transition-colors hover:bg-[var(--glass-bg-strong)]"
              onClick={() => {
                setNewOpen(false);
                setTab("flows");
                createFlowMutation.mutate();
              }}
            >
              <Workflow className="size-6 text-[var(--brand-primary)]" />
              <span className="font-semibold text-[var(--text-primary)]">Novo WhatsApp Flow</span>
              <span className="text-xs text-[var(--text-muted)]">Formulário interativo + publicação na Meta.</span>
            </button>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Importar flow da Meta</DialogTitle>
            <DialogDescription>
              Selecione um flow já publicado na sua conta WhatsApp Business. O CRM importa os campos para você
              configurar o mapeamento no lead.
            </DialogDescription>
          </DialogHeader>
          {loadingMetaFlows ? (
            <div className="space-y-2 py-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (metaFlowsData ?? []).length === 0 ? (
            <p className="py-4 text-sm text-[var(--text-muted)]">
              Nenhum flow encontrado na WABA ou API Meta não configurada.
            </p>
          ) : (
            <ul className="max-h-[320px] space-y-2 overflow-y-auto py-1">
              {(metaFlowsData ?? []).map((mf) => (
                <li
                  key={mf.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-lg)] border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">{mf.name}</p>
                    <p className="font-mono text-[10px] text-[var(--text-muted)]">
                      {mf.id} · {mf.status}
                    </p>
                  </div>
                  {mf.alreadyImported ? (
                    <ButtonGlass
                      type="button"
                      size="sm"
                      variant="glass"
                      onClick={() => {
                        if (mf.crmFlowDefinitionId) {
                          setImportOpen(false);
                          router.push(`/settings/message-models/flows/${mf.crmFlowDefinitionId}`);
                        }
                      }}
                    >
                      Abrir no CRM
                    </ButtonGlass>
                  ) : (
                    <ButtonGlass
                      type="button"
                      variant="primary"
                      size="sm"
                      disabled={importFlowMutation.isPending}
                      onClick={() => importFlowMutation.mutate(mf.id)}
                    >
                      {importFlowMutation.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        "Importar"
                      )}
                    </ButtonGlass>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Grupos da Visão geral (cards agrupados por canal). */
const OVERVIEW_GROUPS = [
  {
    type: "interno",
    title: "Internos",
    icon: <FileText className="size-[17px]" />,
    badge: "bg-[var(--color-enterprise-bg)] text-[var(--brand-primary)]",
  },
  {
    type: "waba",
    title: "WhatsApp",
    icon: <MessageCircle className="size-[17px]" />,
    badge: "bg-[var(--color-success-bg)] text-[var(--color-success-text)]",
  },
  {
    type: "flow",
    title: "Flows",
    icon: <Workflow className="size-[17px]" />,
    badge: "bg-[var(--color-info-bg)] text-[var(--color-info)]",
  },
] as const;

function StatusPill({
  kind,
  label,
}: {
  kind: "approved" | "pending" | "rejected" | "none";
  label: string;
}) {
  const map = {
    approved: { color: "text-[var(--color-success-text)]", dot: "bg-[var(--color-online)]" },
    pending: { color: "text-[var(--color-warn)]", dot: "bg-[var(--color-warn)]" },
    rejected: { color: "text-[var(--color-danger-text)]", dot: "bg-[var(--color-danger)]" },
    none: { color: "text-[var(--text-muted)]", dot: "bg-[var(--glass-border)]" },
  } as const;
  const m = map[kind];
  return (
    <span className={cn("inline-flex w-fit items-center gap-1.5 text-[11.5px] font-bold", m.color)}>
      <span className={cn("size-[7px] rounded-full", m.dot)} />
      {label}
    </span>
  );
}

function FlowStateBadge({ published }: { published: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--radius-full)] px-2.5 py-1 text-[11.5px] font-bold",
        published
          ? "bg-[var(--color-success-bg)] text-[var(--color-success-text)]"
          : "border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-muted)]",
      )}
    >
      <span className={cn("size-1.5 rounded-full", published ? "bg-[var(--color-online)]" : "bg-[var(--text-muted)] opacity-60")} />
      {published ? "Publicado" : "Rascunho"}
    </span>
  );
}

// ── Menu hamburger (CTAs da página) ────────────────────────────────────────

type ModelsMenuItem = {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  divider?: boolean;
};

function ModelsActionsMenu({ items }: { items: ModelsMenuItem[] }) {
  return (
    <PageActionsMenu
      items={items.map((it, idx) => ({
        icon: it.icon,
        label: it.label,
        onClick: it.onClick,
        disabled: it.disabled,
        divider: it.divider,
        primary: idx === 0,
      }))}
    />
  );
}

