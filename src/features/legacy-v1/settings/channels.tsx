"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconBrandFacebook,
  IconBrandInstagram,
  IconBrandWhatsapp,
  IconLayoutGrid,
  IconLoader2,
  IconMail,
  IconPlus,
  IconQrcode,
  IconRadio,
  IconSettings,
  IconTrash,
  IconWifi,
  IconWifiOff,
  IconWorld,
} from "@tabler/icons-react";

import { apiUrl } from "@/lib/api";
import { useConfirm } from "@/hooks/use-confirm";
import { cn } from "@/lib/utils";

import { ChannelPipelineSelect } from "@/components/channels/channel-pipeline-select";
import { CreateChannelDialog } from "@/components/channels/create-channel-dialog";
import { MetaConfigPanel } from "@/components/channels/meta-config-panel";
import { WebchatConfigPanel } from "@/components/channels/webchat-config-panel";
import type { ApiChannel } from "@/components/channels/types";
import { WhatsappQrModal } from "@/components/channels/whatsapp-qr-modal";
import { ButtonGlass } from "@/components/crm/button-glass";
import { GlassCard } from "@/components/crm/glass-card";
import { KpiCard, type KpiTone } from "@/components/crm/kpi-card";
import { KpiStrip } from "@/components/crm/kpi-strip";
import { MobileTableScroll } from "@/components/crm/mobile-table-scroll";
import { PageActionsMenu } from "@/components/crm/page-toolbar";
import {
  SettingsListFilterBar,
  type SettingsFilterGroup,
} from "@/components/crm/settings-filter-bar";
import {
  ListColumnLabel,
  SortableHeader,
  listTableHeadRowClass,
  type SortDir,
} from "@/components/crm/sortable-header";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InputGlass } from "@/components/crm/input-glass";
import { Label } from "@/components/ui/label";
import { useSettingsHeaderSlots } from "@/app/(app)/settings/_v2-shell";

// ──────────────────────────────────────────────────────────────────────────────
// Grid & types
// ──────────────────────────────────────────────────────────────────────────────

/** Nome | Tipo | Provedor | Status | Telefone | Criado em | Ações */
const LIST_GRID = "minmax(0,1fr) 100px 130px 120px 140px 110px 108px";

type SortField = "name" | "type" | "provider" | "status" | "phone" | "createdAt";

type KpiSegment = "" | "CONNECTED" | "DISCONNECTED_FAILED" | "QR_CONNECTING" | "WHATSAPP";

// ──────────────────────────────────────────────────────────────────────────────
// Display maps
// ──────────────────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  EMAIL: "E-mail",
  WEBCHAT: "Webchat",
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  WHATSAPP: <IconBrandWhatsapp size={17} stroke={2} />,
  INSTAGRAM: <IconBrandInstagram size={17} stroke={2} />,
  FACEBOOK: <IconBrandFacebook size={17} stroke={2} />,
  EMAIL: <IconMail size={17} stroke={2} />,
  WEBCHAT: <IconWorld size={17} stroke={2} />,
};

const PROVIDER_LABEL: Record<string, string> = {
  META_CLOUD_API: "Meta Cloud API",
  BAILEYS_MD: "Baileys MD",
  META_INSTAGRAM_LOGIN: "Instagram",
  WEBCHAT: "Widget no site",
};

const STATUS_LABEL: Record<string, string> = {
  CONNECTED: "Conectado",
  DISCONNECTED: "Desconectado",
  CONNECTING: "Conectando",
  QR_READY: "Aguard. QR",
  FAILED: "Falha",
};

const STATUS_PILL_CLASS: Record<string, string> = {
  CONNECTED: "bg-[var(--color-success-bg)] text-[var(--color-success)]",
  DISCONNECTED: "bg-[var(--glass-bg-overlay)] text-[var(--text-muted)]",
  CONNECTING: "bg-[var(--color-lead-bg)] text-[var(--color-warning)]",
  QR_READY: "bg-[var(--color-enterprise-bg)] text-[var(--brand-primary)]",
  FAILED:
    "bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] text-[var(--color-danger)]",
};

// ──────────────────────────────────────────────────────────────────────────────
// KPI segments
// ──────────────────────────────────────────────────────────────────────────────

const KPI_SEGMENTS: {
  id: Exclude<KpiSegment, "">;
  label: string;
  tone: KpiTone;
  icon: React.ReactNode;
}[] = [
  {
    id: "CONNECTED",
    label: "Conectados",
    tone: "success",
    icon: <IconWifi size={20} stroke={2.2} />,
  },
  {
    id: "DISCONNECTED_FAILED",
    label: "Desconect./falha",
    tone: "neutral",
    icon: <IconWifiOff size={20} stroke={2.2} />,
  },
  {
    id: "QR_CONNECTING",
    label: "Aguardando",
    tone: "warning",
    icon: <IconQrcode size={20} stroke={2.2} />,
  },
  {
    id: "WHATSAPP",
    label: "WhatsApp",
    tone: "violet",
    icon: <IconBrandWhatsapp size={20} stroke={2} />,
  },
];

// ──────────────────────────────────────────────────────────────────────────────
// Fetch
// ──────────────────────────────────────────────────────────────────────────────

async function fetchChannels(): Promise<ApiChannel[]> {
  const res = await fetch(apiUrl("/api/channels"));
  const data = (await res.json()) as unknown;
  if (!res.ok) {
    const msg =
      data &&
      typeof data === "object" &&
      "message" in data &&
      typeof (data as { message: unknown }).message === "string"
        ? (data as { message: string }).message
        : "Erro ao carregar canais.";
    throw new Error(msg);
  }
  if (Array.isArray(data)) return data as ApiChannel[];
  if (data && typeof data === "object" && "channels" in data) {
    const ch = (data as { channels: unknown }).channels;
    if (Array.isArray(ch)) return ch as ApiChannel[];
  }
  return [];
}

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────

export default function SettingsChannelsPage({
  search: searchProp,
  createOpen: createOpenProp,
  onCreateOpenChange,
  hideToolbar = false,
}: {
  /** Filtro de busca controlado pelo header (quando fornecido). */
  search?: string;
  /** Estado controlado do diálogo "Novo Canal" (quando fornecido). */
  createOpen?: boolean;
  onCreateOpenChange?: (open: boolean) => void;
  /** Oculta a barra interna de ação (botão sobe para o header). */
  hideToolbar?: boolean;
} = {}) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const slots = useSettingsHeaderSlots();

  // ─── Controlled / uncontrolled create dialog ─────────────────────────────
  const [createOpenInternal, setCreateOpenInternal] = React.useState(false);
  const createOpen = createOpenProp ?? createOpenInternal;
  const setCreateOpen = onCreateOpenChange ?? setCreateOpenInternal;

  // ─── Search & status filter (header bar) ─────────────────────────────────
  const [search, setSearch] = React.useState(searchProp ?? "");
  const [statusFilter, setStatusFilter] = React.useState("all");

  // ─── KPI minidash filter (local, none active by default) ─────────────────
  const [kpiFilter, setKpiFilter] = React.useState<KpiSegment>("");

  // ─── Sorting ──────────────────────────────────────────────────────────────
  const [sortBy, setSortBy] = React.useState<SortField>("name");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");

  // ─── QR modal ─────────────────────────────────────────────────────────────
  const [qrChannel, setQrChannel] = React.useState<ApiChannel | null>(null);
  const [qrOpen, setQrOpen] = React.useState(false);
  const [qrInitial, setQrInitial] = React.useState<string | null>(null);

  // ─── Configure dialogs ────────────────────────────────────────────────────
  const [metaChannel, setMetaChannel] = React.useState<ApiChannel | null>(null);
  const [webchatChannel, setWebchatChannel] = React.useState<ApiChannel | null>(null);
  const [simpleChannel, setSimpleChannel] = React.useState<ApiChannel | null>(null);
  const [simpleName, setSimpleName] = React.useState("");
  const [simplePhone, setSimplePhone] = React.useState("");
  const [simplePipelineId, setSimplePipelineId] = React.useState<string | null>(null);

  // ─── Query ────────────────────────────────────────────────────────────────
  const {
    data: channels = [],
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ["channels"], queryFn: fetchChannels });

  // ─── Mutations (all preserved exactly) ───────────────────────────────────
  const connectMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(apiUrl(`/api/channels/${id}/connect`), { method: "POST" });
      const data = (await res.json()) as {
        status?: string;
        qrCode?: string;
        message?: string;
      };
      if (!res.ok) throw new Error(data.message ?? "Erro ao conectar.");
      return { id, ...data };
    },
    onSuccess: async (result) => {
      await queryClient.refetchQueries({ queryKey: ["channels"] });
      const list = queryClient.getQueryData<ApiChannel[]>(["channels"]);
      const ch = list?.find((c) => c.id === result.id);
      const shouldOpenQr =
        result.qrCode || result.status === "QR_READY" || result.status === "CONNECTING";
      if (shouldOpenQr && ch) {
        setQrChannel({
          ...ch,
          status: (result.status as ApiChannel["status"]) ?? "QR_READY",
          qrCode: result.qrCode ?? ch.qrCode,
        });
        setQrInitial(result.qrCode ?? ch.qrCode ?? null);
        setQrOpen(true);
      }
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(apiUrl(`/api/channels/${id}/disconnect`), { method: "POST" });
      const data = (await res.json()) as { message?: string };
      if (!res.ok) throw new Error(data.message ?? "Erro ao desconectar.");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["channels"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(apiUrl(`/api/channels/${id}`), { method: "DELETE" });
      const data = (await res.json()) as { message?: string };
      if (!res.ok) throw new Error(data.message ?? "Erro ao excluir.");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["channels"] });
    },
  });

  const saveSimpleMutation = useMutation({
    mutationFn: async () => {
      if (!simpleChannel) return;
      const res = await fetch(apiUrl(`/api/channels/${simpleChannel.id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: simpleName.trim(),
          phoneNumber: simplePhone.trim() || null,
          defaultPipelineId: simplePipelineId,
        }),
      });
      const data = (await res.json()) as { message?: string };
      if (!res.ok) throw new Error(data.message ?? "Erro ao salvar.");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["channels"] });
      setSimpleChannel(null);
    },
  });

  // ─── Handlers ─────────────────────────────────────────────────────────────
  function openConfigure(ch: ApiChannel) {
    if (ch.type === "WEBCHAT" || ch.provider === "WEBCHAT") {
      setWebchatChannel(ch);
      return;
    }
    if (
      ch.provider === "META_CLOUD_API" ||
      ch.provider === "META_INSTAGRAM_LOGIN" ||
      ch.type === "INSTAGRAM" ||
      ch.type === "FACEBOOK"
    ) {
      setMetaChannel(ch);
      return;
    }
    setSimpleName(ch.name);
    setSimplePhone(ch.phoneNumber ?? "");
    setSimplePipelineId(ch.defaultPipelineId ?? null);
    setSimpleChannel(ch);
  }

  function openQr(ch: ApiChannel) {
    setQrChannel(ch);
    setQrInitial(ch.qrCode);
    setQrOpen(true);
  }

  function handleConnect(ch: ApiChannel) {
    connectMutation.mutate(ch.id);
  }

  async function handleDisconnect(ch: ApiChannel) {
    const ok = await confirm({
      title: "Desconectar canal",
      description: "Desconectar este canal?",
      confirmLabel: "Desconectar",
      variant: "destructive",
    });
    if (ok) disconnectMutation.mutate(ch.id);
  }

  async function handleDelete(ch: ApiChannel) {
    const ok = await confirm({
      title: `Excluir canal "${ch.name}"?`,
      description:
        "Atenção: as conversas vinculadas a este canal serão desvinculadas — o histórico permanece no banco, mas ficará sem canal associado e não será mais possível enviar novas mensagens por aqui. Esta ação não pode ser desfeita.",
      confirmLabel: "Excluir canal",
      variant: "destructive",
    });
    if (ok) deleteMutation.mutate(ch.id);
  }

  // ─── KPI counts (from all channels) ──────────────────────────────────────
  const statusCounts = React.useMemo(() => {
    const acc: Record<string, number> = {};
    for (const c of channels) acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, [channels]);

  const kpiCounts: Record<Exclude<KpiSegment, "">, number> = React.useMemo(
    () => ({
      CONNECTED: statusCounts.CONNECTED ?? 0,
      DISCONNECTED_FAILED:
        (statusCounts.DISCONNECTED ?? 0) + (statusCounts.FAILED ?? 0),
      QR_CONNECTING:
        (statusCounts.QR_READY ?? 0) + (statusCounts.CONNECTING ?? 0),
      WHATSAPP: channels.filter((c) => c.type === "WHATSAPP").length,
    }),
    [statusCounts, channels],
  );

  // ─── Filter bar groups ────────────────────────────────────────────────────
  const filterGroups = React.useMemo<SettingsFilterGroup[]>(
    () => [
      {
        key: "status",
        label: "Filtrar por status",
        value: statusFilter,
        onChange: setStatusFilter,
        options: [
          { value: "all", label: "Todos", count: channels.length },
          { value: "CONNECTED", label: "Conectado", count: statusCounts.CONNECTED },
          { value: "DISCONNECTED", label: "Desconectado", count: statusCounts.DISCONNECTED },
          { value: "CONNECTING", label: "Conectando", count: statusCounts.CONNECTING },
          { value: "QR_READY", label: "Aguardando QR", count: statusCounts.QR_READY },
          { value: "FAILED", label: "Falha", count: statusCounts.FAILED },
        ],
      },
    ],
    [statusFilter, statusCounts, channels.length],
  );

  // ─── Filter + sort ────────────────────────────────────────────────────────
  const filteredChannels = React.useMemo(() => {
    const ns = search.trim().toLowerCase();
    return channels.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (kpiFilter === "CONNECTED" && c.status !== "CONNECTED") return false;
      if (
        kpiFilter === "DISCONNECTED_FAILED" &&
        c.status !== "DISCONNECTED" &&
        c.status !== "FAILED"
      )
        return false;
      if (
        kpiFilter === "QR_CONNECTING" &&
        c.status !== "QR_READY" &&
        c.status !== "CONNECTING"
      )
        return false;
      if (kpiFilter === "WHATSAPP" && c.type !== "WHATSAPP") return false;
      if (!ns) return true;
      return [c.name, c.phoneNumber, c.provider, c.type]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(ns);
    });
  }, [channels, statusFilter, kpiFilter, search]);

  const sorted = React.useMemo(() => {
    const arr = [...filteredChannels];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "name":
          cmp = a.name.localeCompare(b.name, "pt-BR");
          break;
        case "type":
          cmp = (TYPE_LABEL[a.type] ?? "").localeCompare(
            TYPE_LABEL[b.type] ?? "",
            "pt-BR",
          );
          break;
        case "provider":
          cmp = (PROVIDER_LABEL[a.provider] ?? "").localeCompare(
            PROVIDER_LABEL[b.provider] ?? "",
            "pt-BR",
          );
          break;
        case "status":
          cmp = (STATUS_LABEL[a.status] ?? "").localeCompare(
            STATUS_LABEL[b.status] ?? "",
            "pt-BR",
          );
          break;
        case "phone":
          cmp = (a.phoneNumber ?? "").localeCompare(b.phoneNumber ?? "", "pt-BR");
          break;
        case "createdAt":
          cmp = a.createdAt.localeCompare(b.createdAt);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filteredChannels, sortBy, sortDir]);

  const toggleSort = React.useCallback((field: SortField) => {
    setSortBy((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir("asc");
      return field;
    });
  }, []);

  const dirFor = (f: SortField): SortDir => (sortBy === f ? sortDir : null);

  // ─── Toolbar slots ─────────────────────────────────────────────────────────
  const searchNode = React.useMemo(
    () => (
      <SettingsListFilterBar
        search={search}
        onSearch={setSearch}
        placeholder="Buscar canais por nome, telefone..."
        ariaLabel="Buscar canais"
        groups={filterGroups}
        onClearAll={() => {
          setSearch("");
          setStatusFilter("all");
        }}
      />
    ),
    [search, filterGroups],
  );

  const actionsNode = React.useMemo(
    () => (
      <PageActionsMenu
        items={[
          {
            icon: <IconPlus size={16} />,
            label: "Novo canal",
            onClick: () => setCreateOpen(true),
            primary: true,
          },
        ]}
      />
    ),
    [setCreateOpen],
  );

  React.useEffect(() => {
    if (!slots) return;
    slots.setCenter(searchNode);
    slots.setActions(actionsNode);
    return () => {
      slots.setCenter(null);
      slots.setActions(null);
    };
  }, [slots, searchNode, actionsNode]);

  // ──────────────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex w-full min-w-0 flex-col gap-3.5">
      {!slots && !hideToolbar ? (
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">{searchNode}</div>
          {actionsNode}
        </div>
      ) : null}

      {/* ── KPI mini-dash ── */}
      <KpiStrip aria-label="Indicadores de canais">
        <KpiCard
          label="Todos"
          value={channels.length.toLocaleString("pt-BR")}
          icon={<IconLayoutGrid size={20} stroke={2.2} />}
          tone="brand"
          onClick={() => setKpiFilter("")}
        />
        {KPI_SEGMENTS.map((seg) => (
          <KpiCard
            key={seg.id}
            label={seg.label}
            value={kpiCounts[seg.id].toLocaleString("pt-BR")}
            icon={seg.icon}
            tone={seg.tone}
            active={kpiFilter === seg.id}
            onClick={() => setKpiFilter((prev) => (prev === seg.id ? "" : seg.id))}
          />
        ))}
      </KpiStrip>

      {/* ── Error ── */}
      {isError ? (
        <p className="rounded-[var(--radius-lg)] border border-[var(--color-danger)]/30 bg-[color-mix(in_srgb,var(--color-danger)_8%,transparent)] px-4 py-3 text-sm text-[var(--color-danger)]">
          {error instanceof Error ? error.message : "Erro ao carregar canais."}
        </p>
      ) : null}

      {/* ── Loading skeletons ── */}
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-[64px] animate-pulse rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] shadow-[var(--glass-shadow-sm)]"
            />
          ))}
        </div>
      ) : channels.length === 0 ? (
        /* ── Empty: no channels yet ── */
        <GlassCard
          variant="subtle"
          className="flex flex-col items-center justify-center border-dashed px-6 py-16 text-center"
        >
          <IconRadio className="mb-3 size-10 text-[var(--text-muted)]" />
          <p className="font-medium text-[var(--text-primary)]">Nenhum canal ainda</p>
          <p className="mt-1 max-w-sm text-sm text-[var(--text-muted)]">
            Crie um canal para começar a receber conversas no CRM.
          </p>
          <ButtonGlass
            type="button"
            variant="primary"
            className="mt-6"
            onClick={() => setCreateOpen(true)}
          >
            <IconPlus className="size-4" /> Novo Canal
          </ButtonGlass>
        </GlassCard>
      ) : (
        /* ── Row list ── */
        <MobileTableScroll minWidth={900}>
          {/* Column header */}
          <div
            className={listTableHeadRowClass("gap-3 border border-transparent px-4")}
            style={{ gridTemplateColumns: LIST_GRID }}
          >
            <SortableHeader
              label="Nome"
              sort={dirFor("name")}
              onSort={() => toggleSort("name")}
            />
            <SortableHeader
              label="Tipo"
              sort={dirFor("type")}
              onSort={() => toggleSort("type")}
            />
            <SortableHeader
              label="Provedor"
              sort={dirFor("provider")}
              onSort={() => toggleSort("provider")}
            />
            <SortableHeader
              label="Status"
              sort={dirFor("status")}
              onSort={() => toggleSort("status")}
            />
            <SortableHeader
              label="Telefone"
              sort={dirFor("phone")}
              onSort={() => toggleSort("phone")}
            />
            <SortableHeader
              label="Criado em"
              sort={dirFor("createdAt")}
              onSort={() => toggleSort("createdAt")}
            />
            <ListColumnLabel align="right">Ações</ListColumnLabel>
          </div>

          {sorted.length === 0 ? (
            <GlassCard
              variant="subtle"
              className="flex flex-col items-center justify-center border-dashed px-6 py-12 text-center"
            >
              <IconRadio className="mb-3 size-10 text-[var(--text-muted)]" />
              <p className="font-medium text-[var(--text-primary)]">
                Nenhum canal encontrado
              </p>
              <p className="mt-1 max-w-sm text-sm text-[var(--text-muted)]">
                Nenhum canal corresponde ao filtro atual.
              </p>
            </GlassCard>
          ) : (
            sorted.map((ch) => {
              const isConnectPending =
                connectMutation.isPending && connectMutation.variables === ch.id;
              const isDisconnectPending =
                disconnectMutation.isPending && disconnectMutation.variables === ch.id;
              const isDeletePending =
                deleteMutation.isPending && deleteMutation.variables === ch.id;

              const canConnect = ch.status === "DISCONNECTED" || ch.status === "FAILED";
              const canOpenQr = ch.status === "QR_READY" || ch.status === "CONNECTING";
              const canDisconnect = ch.status === "CONNECTED";

              return (
                <div
                  key={ch.id}
                  style={{ gridTemplateColumns: LIST_GRID }}
                  className="group grid items-center gap-3 rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-4 py-3 shadow-[var(--glass-shadow-sm)] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-[var(--input-border-focus)] hover:shadow-[var(--glass-shadow)]"
                >
                  {/* Nome + avatar */}
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--glass-bg-overlay)] text-[var(--text-secondary)]">
                      {TYPE_ICON[ch.type]}
                    </span>
                    <div className="min-w-0 leading-tight">
                      <button
                        type="button"
                        onClick={() => openConfigure(ch)}
                        className="block max-w-full truncate text-left font-display text-[14px] font-bold text-[var(--text-primary)] transition-colors hover:text-[var(--brand-primary)]"
                      >
                        {ch.name}
                      </button>
                      <div className="truncate font-body text-[12px] text-[var(--text-muted)]">
                        {PROVIDER_LABEL[ch.provider] ?? ch.provider}
                      </div>
                    </div>
                  </div>

                  {/* Tipo */}
                  <span className="truncate font-display text-[13px] text-[var(--text-secondary)]">
                    {TYPE_LABEL[ch.type] ?? ch.type}
                  </span>

                  {/* Provedor */}
                  <span className="truncate font-display text-[13px] text-[var(--text-secondary)]">
                    {PROVIDER_LABEL[ch.provider] ?? ch.provider}
                  </span>

                  {/* Status pill */}
                  <span>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 font-display text-[11px] font-bold",
                        STATUS_PILL_CLASS[ch.status] ??
                          "bg-[var(--glass-bg-overlay)] text-[var(--text-muted)]",
                      )}
                    >
                      {STATUS_LABEL[ch.status] ?? ch.status}
                    </span>
                  </span>

                  {/* Telefone */}
                  <span className="truncate font-display text-[13px] text-[var(--text-secondary)]">
                    {ch.phoneNumber ?? "—"}
                  </span>

                  {/* Criado em */}
                  <span className="font-display text-[13px] text-[var(--text-secondary)]">
                    {new Date(ch.createdAt).toLocaleDateString("pt-BR")}
                  </span>

                  {/* Ações */}
                  <div className="flex items-center justify-end gap-1">
                    {/* Conectar (DISCONNECTED ou FAILED) */}
                    {canConnect && (
                      <button
                        type="button"
                        onClick={() => handleConnect(ch)}
                        disabled={isConnectPending}
                        aria-label={`Conectar ${ch.name}`}
                        className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] text-[var(--color-success)] transition-colors hover:bg-[var(--color-success-bg)] disabled:opacity-40"
                      >
                        {isConnectPending ? (
                          <IconLoader2 size={14} className="animate-spin" />
                        ) : (
                          <IconWifi size={14} />
                        )}
                      </button>
                    )}

                    {/* Ver QR (QR_READY ou CONNECTING) */}
                    {canOpenQr && (
                      <button
                        type="button"
                        onClick={() => openQr(ch)}
                        aria-label={`Ver QR de ${ch.name}`}
                        className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] text-[var(--brand-primary)] transition-colors hover:bg-[var(--color-primary-soft)]"
                      >
                        <IconQrcode size={14} />
                      </button>
                    )}

                    {/* Desconectar (CONNECTED) */}
                    {canDisconnect && (
                      <button
                        type="button"
                        onClick={() => void handleDisconnect(ch)}
                        disabled={isDisconnectPending}
                        aria-label={`Desconectar ${ch.name}`}
                        className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] text-[var(--color-warning)] transition-colors hover:bg-[var(--color-lead-bg)] disabled:opacity-40"
                      >
                        {isDisconnectPending ? (
                          <IconLoader2 size={14} className="animate-spin" />
                        ) : (
                          <IconWifiOff size={14} />
                        )}
                      </button>
                    )}

                    {/* Configurar */}
                    <button
                      type="button"
                      onClick={() => openConfigure(ch)}
                      aria-label={`Configurar ${ch.name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] text-[var(--brand-primary)] transition-colors hover:bg-[var(--color-primary-soft)]"
                    >
                      <IconSettings size={14} />
                    </button>

                    {/* Excluir */}
                    <button
                      type="button"
                      onClick={() => void handleDelete(ch)}
                      disabled={isDeletePending}
                      aria-label={`Excluir ${ch.name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] hover:text-[var(--color-danger)] disabled:opacity-40"
                    >
                      {isDeletePending ? (
                        <IconLoader2 size={14} className="animate-spin" />
                      ) : (
                        <IconTrash size={14} />
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </MobileTableScroll>
      )}

      {/* ── Modals (all preserved exactly) ── */}
      <CreateChannelDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(created) => {
          void queryClient.invalidateQueries({ queryKey: ["channels"] });
          // Webchat: já abre o painel (snippet, sites liberados, aparência).
          if (created?.type === "WEBCHAT") setWebchatChannel(created);
        }}
      />

      <Dialog
        open={!!webchatChannel}
        onOpenChange={(o) => {
          if (!o) setWebchatChannel(null);
        }}
      >
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>Configurar Webchat</DialogTitle>
          </DialogHeader>
          {webchatChannel ? (
            <WebchatConfigPanel
              key={webchatChannel.id}
              channel={webchatChannel}
              onSaved={() => setWebchatChannel(null)}
            />
          ) : null}
          <DialogClose />
        </DialogContent>
      </Dialog>

      <WhatsappQrModal
        channel={qrChannel}
        open={qrOpen}
        onOpenChange={(o) => {
          setQrOpen(o);
          if (!o) {
            setQrChannel(null);
            setQrInitial(null);
            void queryClient.invalidateQueries({ queryKey: ["channels"] });
          }
        }}
        initialQr={qrInitial}
      />

      <Dialog
        open={!!metaChannel}
        onOpenChange={(o) => {
          if (!o) setMetaChannel(null);
        }}
      >
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>
              {metaChannel?.type === "INSTAGRAM"
                ? "Configurar Instagram"
                : metaChannel?.type === "FACEBOOK"
                  ? "Configurar Messenger"
                  : "Configurar Meta Cloud API"}
            </DialogTitle>
          </DialogHeader>
          {metaChannel ? (
            <MetaConfigPanel channel={metaChannel} onSaved={() => setMetaChannel(null)} />
          ) : null}
          <DialogClose />
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!simpleChannel}
        onOpenChange={(o) => {
          if (!o) setSimpleChannel(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurar canal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="simp-name">Nome</Label>
              <InputGlass
                id="simp-name"
                value={simpleName}
                onChange={(e) => setSimpleName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="simp-phone">Telefone (opcional)</Label>
              <InputGlass
                id="simp-phone"
                value={simplePhone}
                onChange={(e) => setSimplePhone(e.target.value)}
              />
            </div>
            <ChannelPipelineSelect
              id="simp-pipeline"
              value={simplePipelineId}
              onChange={setSimplePipelineId}
            />
          </div>
          <DialogFooter>
            <ButtonGlass
              type="button"
              variant="glass"
              onClick={() => setSimpleChannel(null)}
            >
              Cancelar
            </ButtonGlass>
            <ButtonGlass
              type="button"
              variant="primary"
              disabled={saveSimpleMutation.isPending || !simpleName.trim()}
              onClick={() => saveSimpleMutation.mutate()}
            >
              Salvar
            </ButtonGlass>
          </DialogFooter>
          <DialogClose />
        </DialogContent>
      </Dialog>
    </div>
  );
}
