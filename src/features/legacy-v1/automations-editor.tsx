"use client";

import { apiUrl } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconArrowLeft as ArrowLeft,
  IconChevronDown as ChevronDown,
  IconChevronRight as ChevronRight,
  IconDownload as Download,
  IconPencil as Pencil,
  IconDeviceFloppy as Save,
  IconAdjustments as Settings2,
  IconTrash as Trash2,
  IconCheck,
  IconAlertTriangle,
  IconMicroscope,
  IconCopy,
  IconCode,
  IconSitemap,
  IconBriefcase,
  IconCircleCheck,
  IconCircleCheckFilled,
  IconCircleXFilled,
} from "@tabler/icons-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type { AutomationStats } from "@/lib/automation-stats-types";
import { useMobileChatChrome } from "@/hooks/use-mobile-chat-chrome";

const WorkflowCanvas = dynamic(
  () => import("@/components/automations/workflow-canvas").then((m) => m.WorkflowCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-[var(--bg-base)]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    ),
  },
);
import {
  TriggerConfigFields,
  TriggerTypeSelect,
} from "@/components/automations/trigger-config-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { TooltipHost } from "@/components/ui/tooltip";
import {
  type AutomationStep,
  apiStepsToWorkflow,
  defaultTriggerConfig,
  findFirstMessageStepIndex,
  stepTypeLabel,
  validateFirstMessageChannel,
  workflowStepsToPayload,
} from "@/lib/automation-workflow";
import { ALIGN_TRIGGER_POS, autoAlignWorkflowSteps } from "@/lib/automation-layout";
import { useConnectedStepChannels } from "@/components/automations/step-channel-picker";
import { cn, formatDateTime } from "@/lib/utils";

/** Mensagem amigável para o único código de erro de validação de canal (ver `automations.ts`). */
const CHANNEL_VALIDATION_MESSAGES: Record<string, string> = {
  MISSING_CHANNEL_ON_FIRST_MESSAGE_STEP:
    "Selecione o canal do primeiro passo de mensagem — a organização tem mais de um canal conectado.",
};

function firstMessageChannelError(
  steps: AutomationStep[],
  connectedWaCount: number,
  connectedEmailCount: number,
  triggerType?: string,
  triggerConfig?: unknown,
): string | null {
  const idx = findFirstMessageStepIndex(steps);
  if (idx < 0) return null;
  const count = steps[idx].type === "send_email" ? connectedEmailCount : connectedWaCount;
  const code = validateFirstMessageChannel(steps, count, { triggerType, triggerConfig });
  return code ? (CHANNEL_VALIDATION_MESSAGES[code] ?? code) : null;
}

type AutomationDetail = {
  id: string;
  name: string;
  description: string | null;
  triggerType: string;
  triggerConfig: unknown;
  active: boolean;
  allowManualRun?: boolean;
  updatedAt: string;
  steps: {
    id: string;
    type: string;
    config: unknown;
    position: number;
  }[];
};

type MetaWebhookEventLite = {
  id: string;
  receivedAt: string;
  eventType: string;
  objectType: string | null;
  phoneNumberId: string | null;
  waMessageId: string | null;
  fromPhone: string | null;
  signatureValid: boolean;
  processed: boolean;
  processingError: string | null;
  headers: Record<string, unknown> | null;
  rawBody: Record<string, unknown> | null;
};

type ContactAdTracking = {
  id: string;
  adSourceId: string | null;
  adSourceType: string | null;
  adCtwaClid: string | null;
  adHeadline: string | null;
  adResolvedId: string | null;
  adResolvedName: string | null;
  adResolvedAdsetId: string | null;
  adResolvedAdsetName: string | null;
  adResolvedCampaignId: string | null;
  adResolvedCampaignName: string | null;
  adResolvedAt: string | null;
  adResolveStatus: string | null;
  adResolveError: string | null;
  adUtmSource: string | null;
  adUtmMedium: string | null;
  adUtmCampaign: string | null;
  adUtmContent: string | null;
  adUtmTerm: string | null;
};

type LogRow = {
  id: string;
  status: string;
  message: string | null;
  contactId: string | null;
  dealId: string | null;
  executedAt: string;
  payload?: Record<string, unknown> | null;
  metaWebhookEvent?: MetaWebhookEventLite | null;
  contactAdTracking?: ContactAdTracking | null;
  // Enriched fields (may be present in API response)
  contactName?: string | null;
  dealName?: string | null;
  dealNumber?: number | null;
  stageName?: string | null;
  stageColor?: string | null;
};

type LogsResponse = {
  logs?: LogRow[];
  items?: LogRow[];
  total: number;
};

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { message?: string };
    return j.message ?? `Erro ${res.status}`;
  } catch {
    return `Erro ${res.status}`;
  }
}

function ActiveSwitch({
  active,
  disabled,
  onToggle,
}: {
  active: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      disabled={disabled}
      onClick={() => onToggle()}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 rounded-full border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        active ? "bg-success" : "bg-muted"
      )}
    >
      <span
        className={cn(
          "pointer-events-none block size-5 translate-x-0.5 rounded-full bg-[var(--color-bg-card)] shadow-sm transition-transform",
          active && "translate-x-5"
        )}
      />
    </button>
  );
}

/** ─── Status helpers ─────────────────────────────────────────── */
function statusMeta(status: string) {
  if (status === "SUCCESS")
    return {
      icon: <IconCircleCheckFilled size={17} className="text-emerald-500" />,
      label: "Concluído com sucesso",
      badge: "bg-emerald-100 text-emerald-700",
    };
  if (status === "FAILED")
    return {
      icon: <IconCircleXFilled size={17} className="text-red-500" />,
      label: "Falhou",
      badge: "bg-red-100 text-red-700",
    };
  if (status === "SKIPPED")
    return {
      icon: <IconAlertTriangle size={16} className="text-amber-500" />,
      label: "Ignorado",
      badge: "bg-amber-100 text-amber-700",
    };
  return {
    icon: <IconCircleCheck size={16} className="text-slate-400" />,
    label: status,
    badge: "bg-slate-100 text-slate-600",
  };
}

/** ─── JSON Tree Viewer ───────────────────────────────────────── */
function JsonNode({
  value,
  depth = 0,
}: {
  value: unknown;
  depth?: number;
}) {
  const [open, setOpen] = useState(true);
  if (value === null) return <span className="text-slate-400">null</span>;
  if (typeof value === "boolean")
    return (
      <span className={value ? "text-emerald-600" : "text-red-500"}>
        {String(value)}
      </span>
    );
  if (typeof value === "number")
    return <span className="text-blue-600">{value}</span>;
  if (typeof value === "string")
    return <span className="text-amber-700">&quot;{value}&quot;</span>;
  if (Array.isArray(value)) {
    if (value.length === 0)
      return <span className="text-slate-400">[]</span>;
    return (
      <span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mr-1 font-mono text-slate-400 hover:text-slate-600"
        >
          {open ? "▾" : "▸"}
        </button>
        <span className="text-slate-500">[{value.length}]</span>
        {open && (
          <div className="ml-4">
            {value.map((item, i) => (
              <div key={i}>
                <span className="text-slate-400 mr-1">{i}:</span>
                <JsonNode value={item} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as object);
    if (keys.length === 0)
      return <span className="text-slate-400">{"{}"}</span>;
    return (
      <span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mr-1 font-mono text-slate-400 hover:text-slate-600"
        >
          {open ? "▾" : "▸"}
        </button>
        <span className="text-slate-500">{"{"}…{"}"}</span>
        {open && (
          <div className="ml-4">
            {keys.map((k) => (
              <div key={k} className="leading-5">
                <span className="text-[var(--brand-primary)] font-medium">{k}</span>
                <span className="text-slate-400">: </span>
                <JsonNode
                  value={(value as Record<string, unknown>)[k]}
                  depth={depth + 1}
                />
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }
  return <span>{String(value)}</span>;
}

/** ─── Log Inspect Modal ─────────────────────────────────────── */
function LogInspectModal({
  row,
  onClose,
}: {
  row: LogRow | null;
  onClose: () => void;
}) {
  const [activeSection, setActiveSection] = useState<string>("resumo");
  const [viewMode, setViewMode] = useState<"tree" | "raw">("tree");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (row) setActiveSection("resumo");
  }, [row?.id]);

  if (!row) return null;

  const sections: {
    key: string;
    label: string;
    count: string;
    data: unknown;
  }[] = [
    {
      key: "resumo",
      label: "Resumo / metadados",
      count: "6 chaves",
      data: {
        id: row.id,
        status: row.status,
        message: row.message,
        executedAt: row.executedAt,
        contactId: row.contactId,
        dealId: row.dealId,
      },
    },
    ...(row.payload && Object.keys(row.payload).length > 0
      ? [
          {
            key: "payload",
            label: "Parâmetros",
            count: `${Object.keys(row.payload).length} chaves`,
            data: row.payload,
          },
        ]
      : []),
    ...(row.metaWebhookEvent
      ? [
          {
            key: "meta",
            label: "Evento Meta",
            count: "webhook",
            data: {
              eventType: row.metaWebhookEvent.eventType,
              waMessageId: row.metaWebhookEvent.waMessageId,
              fromPhone: row.metaWebhookEvent.fromPhone,
              phoneNumberId: row.metaWebhookEvent.phoneNumberId,
              signatureValid: row.metaWebhookEvent.signatureValid,
              receivedAt: row.metaWebhookEvent.receivedAt,
              rawBody: row.metaWebhookEvent.rawBody,
              headers: row.metaWebhookEvent.headers,
            },
          },
        ]
      : []),
    ...(row.contactAdTracking &&
    (row.contactAdTracking.adSourceId || row.contactAdTracking.adResolvedId)
      ? [
          {
            key: "ad",
            label: "Rastreamento",
            count: "anúncio",
            data: row.contactAdTracking,
          },
        ]
      : []),
  ];

  const activeData = sections.find((s) => s.key === activeSection)?.data;
  const rawJson = JSON.stringify(activeData, null, 2);

  function handleCopy() {
    void navigator.clipboard.writeText(rawJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const sm = statusMeta(row.status);

  return (
    <Dialog open={!!row} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent size="xl" panelClassName="max-h-[88vh] p-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[var(--glass-border)] px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <IconMicroscope size={18} className="text-[var(--brand-primary)]" />
              <DialogTitle className="text-base font-semibold">
                Inspeção da sessão
              </DialogTitle>
            </div>
            <DialogDescription className="mt-0.5 font-mono text-[11px] text-[var(--text-muted)]">
              Sessão {row.id}
            </DialogDescription>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", sm.badge)}>
              {sm.icon}
              {sm.label}
            </span>
            <DialogClose className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]" />
          </div>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Left sidebar */}
          <div className="w-52 shrink-0 border-r border-[var(--glass-border)] bg-[var(--glass-bg)] p-3">
            <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              Seções
            </p>
            <nav className="space-y-0.5">
              {sections.map((sec) => (
                <button
                  key={sec.key}
                  type="button"
                  onClick={() => setActiveSection(sec.key)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                    activeSection === sec.key
                      ? "bg-[var(--brand-primary)]/10 font-medium text-[var(--brand-primary)]"
                      : "text-[var(--text-primary)] hover:bg-[var(--glass-bg-overlay)]"
                  )}
                >
                  <span className="truncate">{sec.label}</span>
                  <span className="ml-1 shrink-0 text-[10px] text-[var(--text-muted)]">
                    {sec.count}
                  </span>
                </button>
              ))}
            </nav>
          </div>

          {/* Right panel */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {/* Toolbar */}
            <div className="flex shrink-0 items-center gap-2 border-b border-[var(--glass-border)] px-4 py-2">
              <span className="text-xs font-medium text-[var(--text-primary)]">
                {sections.find((s) => s.key === activeSection)?.label}
              </span>
              <div className="flex-1" />
              {/* View mode toggle */}
              <div className="flex items-center rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("tree")}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-all",
                    viewMode === "tree"
                      ? "bg-white font-medium text-[var(--text-primary)] shadow-sm"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  )}
                >
                  <IconSitemap size={12} />
                  Árvore
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("raw")}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-all",
                    viewMode === "raw"
                      ? "bg-white font-medium text-[var(--text-primary)] shadow-sm"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  )}
                >
                  <IconCode size={12} />
                  Raw
                </button>
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] px-2.5 py-1 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
              >
                {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
            {/* Content */}
            <div className="flex-1 overflow-auto p-4">
              {viewMode === "raw" ? (
                <pre className="text-[12px] leading-relaxed text-[var(--text-primary)] font-mono whitespace-pre-wrap">
                  {rawJson}
                </pre>
              ) : (
                <div className="text-[12px] font-mono leading-5">
                  <JsonNode value={activeData} />
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** ─── Log Row Card ───────────────────────────────────────────── */
function LogRowCard({
  row,
  onInspect,
}: {
  row: LogRow;
  onInspect: (row: LogRow) => void;
}) {
  const sm = statusMeta(row.status);
  const hasDetail =
    (row.payload && Object.keys(row.payload).length > 0) ||
    !!row.metaWebhookEvent ||
    !!(
      row.contactAdTracking &&
      (row.contactAdTracking.adSourceId || row.contactAdTracking.adResolvedId)
    ) ||
    !!row.message;

  return (
    <div className="rounded-xl border border-[var(--glass-border)] bg-white px-4 py-3">
      {/* Top row: status + date + inspect */}
      <div className="flex items-center gap-2.5">
        <span className="shrink-0">{sm.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">
              {sm.label}
            </span>
            {row.message && row.status !== "SUCCESS" && (
              <span className="truncate text-xs text-[var(--text-muted)]">
                — {row.message}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
            {formatDateTime(row.executedAt)}
          </p>
        </div>
        {hasDetail && (
          <button
            type="button"
            onClick={() => onInspect(row)}
            title="Inspecionar sessão"
            className="flex shrink-0 items-center gap-1 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] px-2.5 py-1.5 text-[11px] text-[var(--text-muted)] transition-colors hover:border-[var(--brand-primary)]/40 hover:bg-[var(--brand-primary)]/5 hover:text-[var(--brand-primary)]"
          >
            <IconMicroscope size={13} />
            Detalhes
          </button>
        )}
      </div>

      {/* Bottom row: lead + deal */}
      {(row.contactId || row.dealId) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--glass-border)] pt-2">
          {row.contactId && (
            <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)]/20 text-[8px] font-bold text-[var(--brand-primary)] uppercase">
                {(row.contactName ?? row.contactId ?? "L").charAt(0)}
              </span>
              <span className="font-medium">
                {row.contactName ?? `Contato ${row.contactId.slice(0, 6)}`}
              </span>
            </div>
          )}
          {row.dealId && (
            <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600">
              <IconBriefcase size={11} className="shrink-0 text-slate-500" />
              <span className="font-medium">
                {row.dealName
                  ? `${row.dealName}${row.dealNumber ? ` #${row.dealNumber}` : ""}`
                  : `Negócio ${row.dealId.slice(0, 6)}`}
              </span>
            </div>
          )}
          {row.stageName && (
            <div
              className="h-1.5 w-16 rounded-full"
              style={{ backgroundColor: row.stageColor ?? "#6366f1" }}
              title={row.stageName}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** ─── Logs List View ─────────────────────────────────────────── */
type LogStatusFilter = "all" | "SUCCESS" | "FAILED" | "SKIPPED";

const STATUS_TABS: { key: LogStatusFilter; label: string }[] = [
  { key: "all", label: "Entraram" },
  { key: "SUCCESS", label: "Sucessos" },
  { key: "SKIPPED", label: "Alertas" },
  { key: "FAILED", label: "Erros" },
];

function LogsListView({
  rows,
  onInspect,
}: {
  rows: LogRow[];
  onInspect: (row: LogRow) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<LogStatusFilter>("all");

  const filtered =
    statusFilter === "all"
      ? rows
      : rows.filter((r) => r.status === statusFilter);

  const counts = {
    all: rows.length,
    SUCCESS: rows.filter((r) => r.status === "SUCCESS").length,
    SKIPPED: rows.filter((r) => r.status === "SKIPPED").length,
    FAILED: rows.filter((r) => r.status === "FAILED").length,
  };

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="flex items-center gap-1 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setStatusFilter(tab.key)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
              statusFilter === tab.key
                ? "bg-white text-[var(--text-primary)] shadow-sm"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            )}
          >
            {tab.label}
            {counts[tab.key] > 0 && (
              <span
                className={cn(
                  "min-w-[18px] rounded-full px-1 text-center text-[10px] font-semibold",
                  statusFilter === tab.key
                    ? tab.key === "FAILED"
                      ? "bg-red-100 text-red-600"
                      : tab.key === "SKIPPED"
                        ? "bg-amber-100 text-amber-600"
                        : tab.key === "SUCCESS"
                          ? "bg-emerald-100 text-emerald-600"
                          : "bg-slate-100 text-slate-600"
                    : "bg-slate-100 text-slate-500"
                )}
              >
                {counts[tab.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Rows */}
      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--text-muted)]">
          Nenhum registro nesta categoria.
        </p>
      ) : (
        <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
          {filtered.map((row) => (
            <LogRowCard key={row.id} row={row} onInspect={onInspect} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── (removed legacy table view) ───────────────────────────────


export default function AutomationDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const router = useRouter();
  const queryClient = useQueryClient();
  // O editor é reusado em duas rotas: /old/automations/[id] (legado) e
  // /automations/[id] (v2). A navegação "voltar à lista" deve respeitar a
  // origem — senão sair do editor v2 jogava o usuário de volta no /old.
  const pathname = usePathname();
  const listHref = pathname?.startsWith("/old/")
    ? "/old/automations"
    : "/automations";

  // Mobile: esconde a bottom nav enquanto o canvas de automação está aberto.
  useMobileChatChrome(true);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState("contact_created");
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>(
    {}
  );
  const [steps, setSteps] = useState<AutomationStep[]>([]);
  const [active, setActive] = useState(false);
  const [allowManualRun, setAllowManualRun] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [stepLogsId, setStepLogsId] = useState<string | null>(null);
  const [inspectRow, setInspectRow] = useState<LogRow | null>(null);
  // 27/mai/26 — Contador pra trigger `fitView` no canvas após o
  // auto-alinhar. Incrementa a cada click; canvas observa via
  // `autoAlignVersion` prop.
  const [autoAlignVersion, setAutoAlignVersion] = useState(0);

  const detailQuery = useQuery({
    queryKey: ["automation", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/automations/${id}`));
      if (!res.ok) throw new Error(await readErrorMessage(res));
      return (await res.json()) as AutomationDetail;
    },
  });

  const logsQuery = useQuery({
    queryKey: ["automation-logs", id],
    enabled: Boolean(id) && logsOpen,
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/automations/${id}/logs?perPage=50`));
      if (!res.ok) throw new Error(await readErrorMessage(res));
      return (await res.json()) as LogsResponse;
    },
  });

  const statsQuery = useQuery({
    queryKey: ["automation-stats", id],
    enabled: Boolean(id) && hydrated,
    refetchInterval: 30_000,
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/automations/${id}/stats`));
      if (!res.ok) return null;
      return (await res.json()) as AutomationStats;
    },
  });

  const stepLogsQuery = useQuery({
    queryKey: ["automation-step-logs", id, stepLogsId],
    enabled: Boolean(id) && Boolean(stepLogsId),
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/automations/${id}/logs?perPage=50&stepId=${stepLogsId}`)
      );
      if (!res.ok) throw new Error(await readErrorMessage(res));
      return (await res.json()) as LogsResponse;
    },
  });

  const stepLogsLabel = useMemo(() => {
    if (!stepLogsId) return "";
    if (stepLogsId === "trigger") return "Gatilho";
    const st = steps.find((s) => s.id === stepLogsId);
    if (!st) return stepLogsId.slice(0, 8);
    return stepTypeLabel(st.type);
  }, [stepLogsId, steps]);

  const stepLogRows = stepLogsQuery.data?.logs ?? stepLogsQuery.data?.items ?? [];

  const handleStepLogsOpen = useCallback((stepId: string) => {
    setStepLogsId(stepId);
  }, []);

  // Refetch de ["automation", id] (foco na janela, reconexão) não pode
  // sobrescrever edição não salva — o passo que o operador acabou de
  // configurar voltava pro estado do servidor sem aviso.
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  useEffect(() => {
    const d = detailQuery.data;
    if (!d) return;
    if (dirtyRef.current) return;
    setName(d.name);
    setDescription(d.description ?? "");
    setTriggerType(d.triggerType);
    const tc =
      typeof d.triggerConfig === "object" &&
      d.triggerConfig !== null &&
      !Array.isArray(d.triggerConfig)
        ? { ...(d.triggerConfig as Record<string, unknown>) }
        : defaultTriggerConfig(d.triggerType);
    setTriggerConfig(tc);
    setSteps(apiStepsToWorkflow(d.steps));
    setActive(d.active);
    setAllowManualRun(d.allowManualRun ?? false);
    setHydrated(true);
    setDirty(false);
  }, [detailQuery.data]);

  const onTriggerTypeChange = useCallback((t: string) => {
    setTriggerType(t);
    setTriggerConfig(defaultTriggerConfig(t));
    setDirty(true);
  }, []);

  const handleStepsChange = useCallback(
    (s: AutomationStep[]) => {
      setSteps(s);
      setDirty(true);
    },
    []
  );

  const { options: connectedWaChannels } = useConnectedStepChannels("send_whatsapp_message");
  const { options: connectedEmailChannels } = useConnectedStepChannels("send_email");

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(apiUrl(`/api/automations/${id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          triggerType,
          triggerConfig,
          allowManualRun,
          steps: workflowStepsToPayload(steps),
        }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      return (await res.json()) as AutomationDetail;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["automation", id], data);
      void queryClient.invalidateQueries({ queryKey: ["automations"] });
      void queryClient.invalidateQueries({
        queryKey: ["automation-logs", id],
      });
      setDirty(false);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(apiUrl(`/api/automations/${id}/toggle`), {
        method: "POST",
      });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      return (await res.json()) as AutomationDetail;
    },
    onMutate: async () => {
      setActive((a) => !a);
    },
    onError: () => {
      setActive(detailQuery.data?.active ?? false);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["automation", id], data);
      setActive(data.active);
      void queryClient.invalidateQueries({ queryKey: ["automations"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(apiUrl(`/api/automations/${id}`), { method: "DELETE" });
      if (!res.ok) throw new Error(await readErrorMessage(res));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["automations"] });
      router.push(listHref);
    },
  });

  const handleSaveClick = useCallback(() => {
    if (active) {
      const err = firstMessageChannelError(
        steps,
        connectedWaChannels.length,
        connectedEmailChannels.length,
        triggerType,
        triggerConfig,
      );
      if (err) {
        toast.error(err);
        return;
      }
    }
    saveMutation.mutate();
  }, [active, steps, connectedWaChannels, connectedEmailChannels, saveMutation, triggerType, triggerConfig]);

  const handleToggleClick = useCallback(() => {
    if (!active) {
      const err = firstMessageChannelError(
        steps,
        connectedWaChannels.length,
        connectedEmailChannels.length,
        triggerType,
        triggerConfig,
      );
      if (err) {
        toast.error(err);
        return;
      }
    }
    toggleMutation.mutate();
  }, [active, steps, connectedWaChannels, connectedEmailChannels, toggleMutation, triggerType, triggerConfig]);

  const openNameEdit = () => {
    setNameDraft(name);
    setNameDialogOpen(true);
  };

  const saveName = () => {
    const t = nameDraft.trim();
    if (t) {
      setName(t);
      setDirty(true);
    }
    setNameDialogOpen(false);
  };

  const handleAutoAlign = useCallback(() => {
    setSteps((prev) => autoAlignWorkflowSteps(prev));
    // Gatilho volta pra (32, 300) no mesmo tick que os steps recebem
    // `__rfPos` — sem isso um trigger arrastado fica fora do fitView.
    setTriggerConfig((tc) => ({
      ...tc,
      __rfPos: { ...ALIGN_TRIGGER_POS },
    }));
    setDirty(true);
    setAutoAlignVersion((v) => v + 1);
  }, []);

  const handleExportJson = useCallback(() => {
    const payload = {
      id,
      name: name.trim(),
      description: description.trim() || null,
      triggerType,
      triggerConfig,
      active,
      steps: workflowStepsToPayload(steps),
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const safeName = (name.trim() || "automacao")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName || "automacao"}-fluxo.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [active, description, id, name, steps, triggerConfig, triggerType]);

  const logRows = logsQuery.data?.logs ?? logsQuery.data?.items ?? [];

  if (!id) {
    return <p className="text-sm text-muted-foreground">ID inválido.</p>;
  }

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[480px] w-full rounded-xl" />
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="flex flex-col items-center gap-4 py-20">
        <p className="text-sm text-destructive">
          {(detailQuery.error as Error)?.message ?? "Não foi possível carregar"}
        </p>
        <Button type="button" variant="outline" size="sm" asChild>
          <Link href={listHref}>Voltar à lista</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      {/* ═══ Top bar — glass (padrão PageHeader / builder-topbar v2) ═══
          Mobile: overflow-x para não cortar Ativa/Inativa, Salvar, etc. */}
      <div className="min-w-0 shrink-0 overflow-x-auto overscroll-x-contain rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] shadow-[var(--glass-shadow-sm)] backdrop-blur-md [-webkit-overflow-scrolling:touch]">
        <div className="flex w-max min-w-full items-center gap-3 px-4 py-2.5">
        {/* Breadcrumb */}
        <Link
          href={listHref}
          className="group/back flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1 text-[13px] font-bold tracking-tight text-[var(--color-ink-soft)] transition-colors hover:bg-[var(--color-primary-soft)]/60 hover:text-primary"
        >
          <ArrowLeft className="size-4 transition-transform group-hover/back:-translate-x-0.5" strokeWidth={2.4} />
          Automações
        </Link>
        <ChevronRight className="size-3.5 shrink-0 text-[var(--color-text-muted)]" />
        <button
          type="button"
          onClick={openNameEdit}
          className="group/name flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1 text-[14px] font-extrabold tracking-tighter text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-subtle)]"
        >
          {name}
          <Pencil className="size-3 text-[var(--color-ink-muted)] transition-colors group-hover/name:text-primary" strokeWidth={2.4} />
        </button>

        {/* Unsaved indicator — pílula âmbar */}
        {dirty && (
          <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-[var(--color-amber-soft)] px-2.5 py-0.5 text-[11px] font-extrabold tracking-tight text-[var(--color-amber-text)] ring-1 ring-amber-200">
            <span className="size-1.5 animate-pulse-soft rounded-full bg-amber-500" />
            Alterações não salvas
          </span>
        )}

        <div className="min-w-3 flex-1" />

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-2">
          <div
            className={cn(
              "flex items-center gap-2 rounded-full px-3 py-1 ring-1 transition-colors",
              active
                ? "bg-[var(--color-success-subtle)] ring-[var(--color-success-subtle)]"
                : "bg-[var(--color-bg-subtle)] ring-[var(--color-border-soft)]"
            )}
          >
            <span
              className={cn(
                "text-[11px] font-semibold uppercase tracking-widest",
                active ? "text-emerald-700" : "text-[var(--color-text-secondary)]"
              )}
            >
              {active ? "Ativa" : "Inativa"}
            </span>
            <ActiveSwitch
              active={active}
              disabled={toggleMutation.isPending}
              onToggle={handleToggleClick}
            />
          </div>

          <TooltipHost label="Configuração" side="bottom">
            <button
              type="button"
              onClick={() => setConfigOpen(true)}
              className="flex size-9 items-center justify-center rounded-full text-[var(--color-text-secondary)] transition-all hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)]"
              aria-label="Configuração"
            >
              <Settings2 className="size-4" strokeWidth={2.2} />
            </button>
          </TooltipHost>

          <TooltipHost label="Auto alinhar fluxo" side="bottom">
            <button
              type="button"
              onClick={handleAutoAlign}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-[var(--color-bg-card)] px-3.5 text-[12px] font-bold tracking-tight text-foreground transition-all hover:-translate-y-px hover:border-primary/20 hover:text-primary hover:shadow-sm"
            >
              <IconSitemap className="size-3.5" strokeWidth={2.4} />
              Auto alinhar
            </button>
          </TooltipHost>

          <TooltipHost label="Exportar fluxo em JSON" side="bottom">
            <button
              type="button"
              onClick={handleExportJson}
              className="flex h-9 items-center gap-1.5 rounded-full border border-border bg-[var(--color-bg-card)] px-3.5 text-[12px] font-bold tracking-tight text-foreground transition-all hover:-translate-y-px hover:border-primary/20 hover:text-primary hover:shadow-sm"
            >
              <Download className="size-3.5" strokeWidth={2.4} />
              Exportar JSON
            </button>
          </TooltipHost>

          <button
            type="button"
            onClick={() => setLogsOpen(true)}
            className="h-9 rounded-full border border-border bg-[var(--color-bg-card)] px-3.5 text-[12px] font-bold tracking-tight text-foreground transition-all hover:-translate-y-px hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-subtle)] hover:shadow-sm"
          >
            Logs
          </button>

          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="flex h-9 items-center gap-1.5 rounded-full bg-rose-500 px-3.5 text-[12px] font-bold tracking-tight text-white shadow-[0_10px_30px_-10px_rgba(244,63,94,0.4)] transition-all hover:-translate-y-px hover:bg-rose-600 hover:shadow-[0_12px_30px_-8px_rgba(244,63,94,0.5)]"
          >
            <Trash2 className="size-3.5" strokeWidth={2.4} />
            Excluir
          </button>

          <button
            type="button"
            disabled={!hydrated || saveMutation.isPending || !name.trim()}
            onClick={handleSaveClick}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-[12px] font-extrabold tracking-tight text-white shadow-[var(--shadow-indigo-glow)] transition-all",
              !hydrated || saveMutation.isPending || !name.trim()
                ? "cursor-not-allowed opacity-60"
                : "hover:-translate-y-px hover:bg-[var(--brand-primary-hover)] hover:shadow-[0_14px_30px_-6px_rgba(80,125,241,0.45)]"
            )}
          >
            <Save className="size-3.5" strokeWidth={2.4} />
            {saveMutation.isPending ? "Salvando…" : "Salvar"}
          </button>
        </div>
        </div>
      </div>

      {saveMutation.isError && (
        <div className="shrink-0 border-b border-[var(--color-danger-subtle)]/60 bg-[var(--color-rose-soft)]/70 px-4 py-2 text-[12px] font-bold text-rose-700 backdrop-blur-sm">
          {(saveMutation.error as Error).message}
        </div>
      )}

      {/* ═══ Canvas ═══ */}
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] shadow-[var(--glass-shadow-sm)]">
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          {hydrated ? (
            <WorkflowCanvas
              steps={steps}
              onStepsChange={handleStepsChange}
              triggerType={triggerType}
              triggerConfig={triggerConfig}
              stats={statsQuery.data}
              onStepLogsOpen={handleStepLogsOpen}
              onTriggerClick={() => setConfigOpen(true)}
              onTriggerConfigChange={(next) => {
                setTriggerConfig(next);
                setDirty(true);
              }}
              autoAlignVersion={autoAlignVersion}
              className="h-full"
            />
          ) : (
            <Skeleton className="h-full w-full" />
          )}
        </div>
      </div>

      {/* ═══ Config dialog ═══ */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent size="lg" panelClassName="max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Configuração</DialogTitle>
            <DialogDescription>
              Nome, descrição e parâmetros de gatilho.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="ad-name">Nome</Label>
              <Input
                id="ad-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setDirty(true);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ad-desc">Descrição</Label>
              <Textarea
                id="ad-desc"
                rows={3}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setDirty(true);
                }}
              />
            </div>
            <TriggerTypeSelect
              value={triggerType}
              onChange={onTriggerTypeChange}
            />
            <TriggerConfigFields
              triggerType={triggerType}
              value={triggerConfig}
              onChange={(v) => {
                setTriggerConfig(v);
                setDirty(true);
              }}
            />

            <div className="space-y-2 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Habilitar para o agente enviar</p>
                  <p className="text-xs text-muted-foreground">
                    Deixa esta automação disponível para o agente disparar
                    manualmente pela conversa (menu “+” do composer), além do
                    gatilho automático.
                  </p>
                </div>
                <ActiveSwitch
                  active={allowManualRun}
                  onToggle={() => {
                    setAllowManualRun((v) => !v);
                    setDirty(true);
                  }}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-border p-4">
              <p className="text-sm font-medium">Simular comportamento humano</p>
              <p className="text-xs text-muted-foreground">
                Faz o robô parecer uma pessoa real para o cliente no WhatsApp.
              </p>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm">Marcar como lida</p>
                  <p className="text-xs text-muted-foreground">
                    Exibe ticks azuis ao receber mensagem.
                  </p>
                </div>
                <ActiveSwitch
                  active={triggerConfig.markAsRead === true}
                  onToggle={() => {
                    setTriggerConfig((tc) => ({ ...tc, markAsRead: !tc.markAsRead }));
                    setDirty(true);
                  }}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm">Simular digitação</p>
                  <p className="text-xs text-muted-foreground">
                    Mostra &ldquo;digitando...&rdquo; antes de cada resposta.
                  </p>
                </div>
                <ActiveSwitch
                  active={triggerConfig.simulateTyping === true}
                  onToggle={() => {
                    setTriggerConfig((tc) => ({ ...tc, simulateTyping: !tc.simulateTyping }));
                    setDirty(true);
                  }}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfigOpen(false)}
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Logs dialog ═══ */}
      <Dialog open={logsOpen} onOpenChange={setLogsOpen}>
        <DialogContent size="xl" panelClassName="max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Logs do bloco</DialogTitle>
            <DialogDescription>
              {logsQuery.data
                ? `${logsQuery.data.total} execução(ões) registrada(s)`
                : "Carregando registros…"}
            </DialogDescription>
          </DialogHeader>
          {logsQuery.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : logsQuery.isError ? (
            <p className="text-sm text-destructive">
              {(logsQuery.error as Error).message}
            </p>
          ) : logRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum log ainda.
            </p>
          ) : (
            <LogsListView rows={logRows} onInspect={setInspectRow} />
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setLogsOpen(false)}
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Step logs dialog ═══ */}
      <Dialog open={Boolean(stepLogsId)} onOpenChange={(open) => { if (!open) setStepLogsId(null); }}>
        <DialogContent size="xl" panelClassName="max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Logs — {stepLogsLabel}</DialogTitle>
            <DialogDescription>
              {stepLogsQuery.data
                ? `${stepLogsQuery.data.total} registro(s)`
                : "Carregando…"}
            </DialogDescription>
          </DialogHeader>
          {stepLogsQuery.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : stepLogsQuery.isError ? (
            <p className="text-sm text-destructive">
              {(stepLogsQuery.error as Error).message}
            </p>
          ) : stepLogRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum evento ainda.
            </p>
          ) : (
            <LogsListView rows={stepLogRows} onInspect={setInspectRow} />
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setStepLogsId(null)}
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Log inspect modal ═══ */}
      <LogInspectModal row={inspectRow} onClose={() => setInspectRow(null)} />

      {/* ═══ Name edit ═══ */}
      <FormDialog
        open={nameDialogOpen}
        onOpenChange={setNameDialogOpen}
        title="Editar nome"
        description="Altere o nome desta automação."
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setNameDialogOpen(false)}>Cancelar</Button>
            <Button type="button" onClick={saveName} disabled={!nameDraft.trim()}>OK</Button>
          </>
        }
      >
        <Input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") saveName(); }}
        />
      </FormDialog>

      {/* ═══ Delete confirm ═══ */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir automação?</DialogTitle>
            <DialogDescription>
              Esta ação não pode ser desfeita. A automação e seus passos serão
              removidos.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending ? "Excluindo…" : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
