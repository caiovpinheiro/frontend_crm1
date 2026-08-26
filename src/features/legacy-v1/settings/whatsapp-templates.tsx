"use client";

import { apiUrl, parseApiResponse } from "@/lib/api";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconAlertTriangle as AlertTriangle, IconArrowLeft as ArrowLeft, IconBook2 as BookOpen, IconCheck as Check, IconCircleCheck as CheckCircle2, IconClipboard as ClipboardCopy, IconClock as Clock, IconCopy as Copy, IconEye as Eye, IconStack as Layers, IconLoader2 as Loader2, IconMessageCircle as MessageCircle, IconMessage as MessageSquare, IconPencil as Pencil, IconPhone as Phone, IconPlus as Plus, IconRefresh as RefreshCw, IconSearch as Search, IconTrash as Trash2, IconUserCheck as UserCheck } from "@tabler/icons-react";
import { toast } from "sonner";

import type { ApiChannel } from "@/components/channels/types";
import { useConfirm } from "@/hooks/use-confirm";
import { ButtonGlass } from "@/components/crm/button-glass";
import { InputGlass } from "@/components/crm/input-glass";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { FormDialog } from "@/components/ui/form-dialog";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { analyzeTemplateComponents } from "@/lib/meta-whatsapp/analyze-template-components";
import {
  fetchMetaCloudWhatsAppChannels,
  formatMetaChannelLabel,
} from "@/lib/meta-whatsapp/meta-cloud-channels";
import {
  extractMetaPlaceholderKeys,
  extractUnsupportedPlaceholderTokens,
  mergeOperatorVariables,
  type OperatorVariableMeta,
} from "@/lib/meta-whatsapp/operator-template-variables";
import {
  useCrmVariableOptions,
  VariableShortcutHint,
  VariableShortcutInput,
} from "@/components/crm/variable-shortcut-input";
import { cn } from "@/lib/utils";
import { ListHScroll } from "@/components/crm/list-hscroll";
import { ListColumnLabel, listTableHeadRowClass } from "@/components/crm/sortable-header";
import {
  HubCallout,
  HubChip,
  HubPanel,
  HubStat,
  HubStatGrid,
  HubSubHeader,
  HubToolbar,
} from "./message-models/hub-ui";

const TPL_GRID_COLS =
  "minmax(240px,1.6fr) 160px 84px 150px 150px 100px 84px 120px";

const DOCS_LIST =
  "https://developers.facebook.com/docs/graph-api/reference/whats-app-business-account/message_templates/";
const DOCS_COMPONENTS =
  "https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/components/";
const DOCS_CALL_PERMISSION =
  "https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/marketing-templates/call-permission-request-message-template";

type MetaTemplateRow = {
  id: string;
  name: string;
  status: string;
  category?: string;
  sub_category?: string;
  language?: string;
  parameter_format?: string;
  components?: unknown[];
  quality_score?: { score?: string };
  rejected_reason?: string;
};

type TemplateConfig = {
  id: string;
  metaTemplateId: string;
  metaTemplateName: string;
  label: string;
  agentEnabled: boolean;
  language: string;
  category: string | null;
  bodyPreview: string;
  hasButtons: boolean;
  buttonTypes: string[];
  hasVariables: boolean;
  flowAction: string | null;
  flowId: string | null;
  operatorVariables?: OperatorVariableMeta[] | null;
};

type ListResponse = {
  data?: MetaTemplateRow[];
  paging?: { cursors?: { after?: string; before?: string } };
};

const STATUS_PT: Record<string, string> = {
  APPROVED: "Aprovado",
  PENDING: "Em análise",
  PENDING_APPROVAL: "Em análise",
  REJECTED: "Rejeitado",
  PAUSED: "Pausado",
  DISABLED: "Desativado",
  IN_APPEAL: "Em recurso",
  LIMIT_EXCEEDED: "Limite excedido",
};

const QUALITY_PT: Record<string, string> = {
  GREEN: "Alta",
  YELLOW: "Média",
  RED: "Baixa",
  UNKNOWN: "—",
  NONE: "—",
};

/** A Meta às vezes envia `rejected_reason: "NONE"` mesmo com status APPROVED — não é rejeição real. */
/**
 * Heurística de identificação de templates do tipo "permissão de ligação"
 * (Call Permission Request). A Meta expõe essa tipagem via `sub_category =
 * CALL_PERMISSIONS_REQUEST` para templates WhatsApp Business Calling — e,
 * por convenção, os operadores nomeiam esses templates começando com
 * `call_permission`. Capturamos os dois sinais para robustez.
 */
function isCallPermissionTemplate(row: Pick<MetaTemplateRow, "name" | "sub_category">): boolean {
  const sub = (row.sub_category ?? "").toUpperCase();
  if (sub.includes("CALL_PERMISSIONS_REQUEST") || sub.includes("CALL_PERMISSION_REQUEST")) {
    return true;
  }
  const n = (row.name ?? "").toLowerCase();
  return n.startsWith("call_permission") || n.includes("call_permission_request");
}

function meaningfulRejectedReason(status: string, reason: string | undefined): string | null {
  if (!reason) return null;
  const r = reason.trim();
  if (!r) return null;
  if (status === "APPROVED" && /^none$/i.test(r)) return null;
  if (/^none$/i.test(r)) return null;
  return r;
}

/**
 * Busca TODOS os templates da WABA percorrendo todas as páginas de cursor da
 * Graph API. A Meta lista no máximo 500 por página; sem esse loop, o CRM ficava
 * preso na primeira página (até 100) e não exibia o total real da conta.
 * Com `channelId`, lista a WABA daquele canal (necessário com 2+ Cloud API).
 */
async function fetchAllTemplates(channelId?: string | null): Promise<MetaTemplateRow[]> {
  const all: MetaTemplateRow[] = [];
  let after: string | undefined;
  // Guarda de segurança contra loop infinito (500 * 200 = 100k templates).
  for (let guard = 0; guard < 200; guard++) {
    const q = new URLSearchParams();
    q.set("limit", "500");
    if (after) q.set("after", after);
    if (channelId?.trim()) q.set("channelId", channelId.trim());
    const res = await fetch(apiUrl(`/api/meta/whatsapp/message-templates?${q.toString()}`));
    const data = (await res.json().catch(() => ({}))) as ListResponse & { message?: string };
    if (!res.ok) {
      throw new Error(typeof data?.message === "string" ? data.message : "Erro ao listar");
    }
    if (Array.isArray(data.data)) all.push(...data.data);
    const next = data.paging?.cursors?.after;
    if (!next || next === after) break;
    after = next;
  }
  return all;
}

type CloneReport = {
  created?: Array<{ name: string; language: string; id?: string }>;
  skipped?: Array<{ name: string; language: string; reason: string }>;
  failed?: Array<{ name: string; language: string; error: string }>;
  sourceWabaId?: string;
  targetWabaId?: string;
  message?: string;
};

async function fetchTemplateConfigs(): Promise<TemplateConfig[]> {
  const res = await fetch(apiUrl("/api/whatsapp-template-configs"));
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function upsertTemplateConfig(payload: Record<string, unknown>): Promise<TemplateConfig> {
  const res = await fetch(apiUrl("/api/whatsapp-template-configs"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data?.message === "string" ? data.message : "Erro ao salvar config");
  return data as TemplateConfig;
}

function extractBodyText(components: unknown[] | undefined): string {
  if (!components?.length) return "";
  for (const c of components) {
    if (!c || typeof c !== "object") continue;
    const o = c as Record<string, unknown>;
    if (String(o.type ?? "").toUpperCase() === "BODY" && typeof o.text === "string") return o.text;
  }
  return "";
}

/** Extrai textos exibíveis dos componentes retornados pela Graph API. */
function componentPreviewBlocks(components: unknown[] | undefined): { title: string; body: string }[] {
  if (!components?.length) return [];
  const blocks: { title: string; body: string }[] = [];
  for (const c of components) {
    if (!c || typeof c !== "object") continue;
    const o = c as Record<string, unknown>;
    const type = String(o.type ?? "?");
    const text = typeof o.text === "string" ? o.text : "";
    const fmt = typeof o.format === "string" ? o.format : "";
    if (text) {
      blocks.push({
        title: fmt ? `${type} (${fmt})` : type,
        body: text,
      });
    }
    if (type === "BUTTONS" && Array.isArray(o.buttons)) {
      for (const b of o.buttons) {
        if (!b || typeof b !== "object") continue;
        const btn = b as Record<string, unknown>;
        const bt = typeof btn.text === "string" ? btn.text : "";
        if (bt) {
          blocks.push({
            title: `Botão · ${String(btn.type ?? "?")}`,
            body: bt,
          });
        }
      }
    }
  }
  return blocks;
}

/**
 * Um marcador do texto em edição no assistente de criação. Cabeçalho e corpo
 * têm numeração independente na Meta (os dois podem ter `{{1}}`), por isso o
 * componente entra na identidade do slot.
 */
type CreateVarSlot = { component: "header" | "body"; key: string };

function createVarSlotId(slot: CreateVarSlot): string {
  return `${slot.component}::${slot.key}`;
}

function createVarSlotLabel(slot: CreateVarSlot): string {
  return `${slot.component === "header" ? "Cabeçalho" : "Corpo"} {{${slot.key}}}`;
}

class TemplateBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="w-full space-y-4">
          <Link href="/settings" className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <ArrowLeft className="size-4" /> Configurações
          </Link>
          <div className="rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--color-danger)_30%,transparent)] bg-[var(--color-danger-bg)] p-6 text-sm">
            <div className="mb-2 flex items-center gap-2 font-bold text-[var(--color-danger)]">
              <AlertTriangle className="size-5" />
              Erro ao carregar Templates WhatsApp
            </div>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-[var(--radius-md)] border border-[var(--glass-border-subtle)] bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)] p-3 font-mono text-xs text-[var(--text-secondary)]">
              {this.state.error.message}
              {this.state.error.stack ? `\n\n${this.state.error.stack}` : ""}
            </pre>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="mt-4 rounded-[var(--radius-full)] bg-[var(--brand-primary)] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[var(--brand-primary-dark)]"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function WhatsappMetaTemplatesPageWrapper({ embedded = false }: { embedded?: boolean } = {}) {
  return (
    <TemplateBoundary>
      <WhatsappMetaTemplatesPage embedded={embedded} />
    </TemplateBoundary>
  );
}

function WhatsappMetaTemplatesPage({ embedded = false }: { embedded?: boolean }) {
  const queryClient = useQueryClient();
  const confirmDialog = useConfirm();
  const router = useRouter();
  const searchParams = useSearchParams();

  const { data: metaChannels = [] } = useQuery({
    queryKey: ["meta-cloud-whatsapp-channels"],
    queryFn: fetchMetaCloudWhatsAppChannels,
    staleTime: 60_000,
  });

  const [channelId, setChannelId] = React.useState<string>("");
  React.useEffect(() => {
    if (!metaChannels.length) return;
    if (channelId && metaChannels.some((c) => c.id === channelId)) return;
    const connected = metaChannels.find((c) => c.status === "CONNECTED");
    setChannelId((connected ?? metaChannels[0]).id);
  }, [metaChannels, channelId]);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["meta-whatsapp-templates", "all", channelId || "none"],
    queryFn: () => fetchAllTemplates(channelId),
    enabled: Boolean(channelId),
  });

  const rows = data ?? [];

  const [cloneOpen, setCloneOpen] = React.useState(false);
  const [cloneSourceId, setCloneSourceId] = React.useState("");
  const [cloneTargetId, setCloneTargetId] = React.useState("");
  const [cloneReport, setCloneReport] = React.useState<CloneReport | null>(null);

  const { data: templateConfigs = [] } = useQuery({
    queryKey: ["whatsapp-template-configs"],
    queryFn: fetchTemplateConfigs,
  });
  const configByMetaId = React.useMemo(() => {
    const m = new Map<string, TemplateConfig>();
    for (const c of templateConfigs) m.set(c.metaTemplateId, c);
    return m;
  }, [templateConfigs]);

  const countUtility = rows.filter((r) => (r.category ?? "").toUpperCase() === "UTILITY").length;
  const countMarketing = rows.filter((r) => (r.category ?? "").toUpperCase() === "MARKETING").length;
  const countAuth = rows.filter((r) => (r.category ?? "").toUpperCase() === "AUTHENTICATION").length;
  const countApproved = rows.filter((r) => r.status === "APPROVED").length;
  const countPending = rows.filter(
    (r) => r.status === "PENDING" || r.status === "PENDING_APPROVAL",
  ).length;
  const countAgent = rows.filter((r) => configByMetaId.get(r.id)?.agentEnabled).length;

  const [query, setQuery] = React.useState("");
  const [catFilter, setCatFilter] = React.useState<"all" | "UTILITY" | "MARKETING" | "AUTHENTICATION">("all");

  const filteredRows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const okC = catFilter === "all" || (r.category ?? "").toUpperCase() === catFilter;
      const cfgLabel = configByMetaId.get(r.id)?.label ?? "";
      const okQ = !q || r.name.toLowerCase().includes(q) || cfgLabel.toLowerCase().includes(q);
      return okC && okQ;
    });
  }, [rows, query, catFilter, configByMetaId]);

  const configMutation = useMutation({
    mutationFn: upsertTemplateConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-template-configs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [editingLabelId, setEditingLabelId] = React.useState<string | null>(null);
  const [labelDraft, setLabelDraft] = React.useState("");
  const labelInputRef = React.useRef<HTMLInputElement>(null);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [createMode, setCreateMode] = React.useState<"assisted" | "json">("assisted");
  const [previewRow, setPreviewRow] = React.useState<MetaTemplateRow | null>(null);

  const [name, setName] = React.useState("");
  const [language, setLanguage] = React.useState("pt_BR");
  const [category, setCategory] = React.useState<"UTILITY" | "MARKETING" | "AUTHENTICATION">("UTILITY");
  const [parameterFormat, setParameterFormat] = React.useState<"POSITIONAL" | "NAMED">("POSITIONAL");
  const [body, setBody] = React.useState("");
  const [headerFormat, setHeaderFormat] = React.useState<"NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT">("NONE");
  const [headerText, setHeaderText] = React.useState("");
  const [headerMediaUrl, setHeaderMediaUrl] = React.useState("");
  const [headerMediaFileName, setHeaderMediaFileName] = React.useState("");
  const [headerMediaUploading, setHeaderMediaUploading] = React.useState(false);
  const headerMediaInputRef = React.useRef<HTMLInputElement>(null);
  const isHeaderMedia = headerFormat === "IMAGE" || headerFormat === "VIDEO" || headerFormat === "DOCUMENT";
  const [footer, setFooter] = React.useState("");
  const [addSecurityRecommendation, setAddSecurityRecommendation] = React.useState(true);
  const [codeExpirationMinutes, setCodeExpirationMinutes] = React.useState(10);
  const [otpType, setOtpType] = React.useState("COPY_CODE");
  const [otpButtonText, setOtpButtonText] = React.useState("Copiar código");
  const [quickTexts, setQuickTexts] = React.useState<string[]>([""]);
  const [urlRows, setUrlRows] = React.useState<{ text: string; url: string }[]>([{ text: "", url: "" }]);
  const [rawJson, setRawJson] = React.useState(
    '{\n  "name": "meu_template",\n  "language": "pt_BR",\n  "category": "MARKETING",\n  "parameter_format": "POSITIONAL",\n  "components": [\n    { "type": "BODY", "text": "Olá {{1}}" }\n  ]\n}',
  );

  // Um valor por marcador, indexado por `createVarSlotId`. `varExamples` vai
  // para a Meta (`example` do componente, obrigatório quando há variável);
  // `varCrmFields` fica só no CRM, como preenchimento padrão no envio.
  const [varExamples, setVarExamples] = React.useState<Record<string, string>>({});
  const [varCrmFields, setVarCrmFields] = React.useState<Record<string, string>>({});

  const crmVariableOptions = useCrmVariableOptions(createOpen && createMode === "assisted");

  /**
   * Marcadores que a Meta promove a parâmetro, na ordem em que o contato lê a
   * mensagem. AUTHENTICATION fica fora: o corpo é fixo da Meta e o `{{1}}` é o
   * próprio código OTP, que não aceita exemplo.
   */
  const createVarSlots = React.useMemo<CreateVarSlot[]>(() => {
    if (category === "AUTHENTICATION") return [];
    const slots: CreateVarSlot[] = [];
    if (headerFormat === "TEXT") {
      for (const key of extractMetaPlaceholderKeys(headerText)) {
        slots.push({ component: "header", key });
      }
    }
    for (const key of extractMetaPlaceholderKeys(body)) {
      slots.push({ component: "body", key });
    }
    return slots;
  }, [category, headerFormat, headerText, body]);

  /**
   * Tokens entre chaves que a Meta NÃO reconhece (ponto, maiúscula, hífen).
   * É exatamente o erro que originou o bug do `ativacao_perdidos`: escrever
   * `{{dealCustomFields.x}}` no corpo faz a Meta aprovar o texto literal.
   */
  const unsupportedTokens = React.useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const text of [headerFormat === "TEXT" ? headerText : "", body]) {
      for (const token of extractUnsupportedPlaceholderTokens(text)) {
        if (seen.has(token)) continue;
        seen.add(token);
        out.push(token);
      }
    }
    return out;
  }, [body, headerText, headerFormat]);

  /** POSITIONAL exige `{{1}}`; NAMED exige nomes. Misturar = rejeição na Meta. */
  const parameterFormatMismatch = React.useMemo(() => {
    const keys = createVarSlots.map((s) => s.key);
    if (keys.length === 0) return null;
    const numeric = keys.filter((k) => /^\d+$/.test(k));
    if (parameterFormat === "POSITIONAL" && numeric.length !== keys.length) {
      return "POSITIONAL aceita apenas marcadores numéricos ({{1}}, {{2}}…). Troque para NAMED ou renumere o texto.";
    }
    if (parameterFormat === "NAMED" && numeric.length > 0) {
      return "NAMED aceita apenas marcadores com nome ({{nome_curso}}). Troque para POSITIONAL ou renomeie os marcadores.";
    }
    return null;
  }, [createVarSlots, parameterFormat]);

  const { data: flowDefsList = [] } = useQuery({
    queryKey: ["whatsapp-flow-definitions"],
    queryFn: async () => {
      const r = await fetch(apiUrl("/api/whatsapp-flow-definitions"));
      if (!r.ok) return [] as { id: string; name: string; status: string; metaFlowId: string | null }[];
      return r.json() as Promise<{ id: string; name: string; status: string; metaFlowId: string | null }[]>;
    },
    enabled: createOpen && category !== "AUTHENTICATION",
  });
  const publishedFlows = React.useMemo(
    () => flowDefsList.filter((f) => f.status === "PUBLISHED" && f.metaFlowId?.trim()),
    [flowDefsList],
  );

  const [flowAssistEnabled, setFlowAssistEnabled] = React.useState(false);
  const [flowPickId, setFlowPickId] = React.useState("");
  const [flowButtonText, setFlowButtonText] = React.useState("Abrir formulário");
  const [flowActionMeta, setFlowActionMeta] = React.useState<"NAVIGATE" | "DATA_EXCHANGE">("NAVIGATE");

  React.useEffect(() => {
    if (searchParams.get("create") !== "1") return;
    queueMicrotask(() => {
      setCreateOpen(true);
      const sp = new URLSearchParams(searchParams.toString());
      sp.delete("create");
      const qs = sp.toString();
      router.replace(qs ? `/settings/message-models?${qs}` : "/settings/message-models?tab=whatsapp");
    });
  }, [router, searchParams]);

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown> | { raw: true; payload: Record<string, unknown> }) => {
      const body =
        channelId && typeof payload === "object"
          ? { ...payload, channelId }
          : payload;
      const q = channelId ? `?channelId=${encodeURIComponent(channelId)}` : "";
      const res = await fetch(apiUrl(`/api/meta/whatsapp/message-templates${q}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      // `parseApiResponse` preserva a mensagem de validação da Meta (exemplo
      // faltando, formato de parâmetro trocado) em vez de trocá-la por um
      // texto fixo quando o proxy devolve HTML.
      return parseApiResponse<{ id?: string }>(res, "Erro ao criar template na Meta.");
    },
    onSuccess: () => {
      toast.success("Template enviado à Meta para análise.");
      queryClient.invalidateQueries({ queryKey: ["meta-whatsapp-templates"] });
      setCreateOpen(false);
      resetForm();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    // A Graph exige `name` junto do `hsm_id` para excluir — só o id devolve
    // "Unsupported delete request".
    mutationFn: async (vars: { id: string; name: string }) => {
      const q = new URLSearchParams();
      q.set("name", vars.name);
      if (channelId) q.set("channelId", channelId);
      const res = await fetch(
        apiUrl(
          `/api/meta/whatsapp/message-templates/${encodeURIComponent(vars.id)}?${q.toString()}`,
        ),
        { method: "DELETE" },
      );
      return parseApiResponse<unknown>(res, "Erro ao excluir template na Meta.");
    },
    onSuccess: () => {
      toast.success("Template removido na Meta.");
      queryClient.invalidateQueries({ queryKey: ["meta-whatsapp-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cloneMutation = useMutation({
    mutationFn: async (vars: { sourceChannelId: string; targetChannelId: string }) => {
      const res = await fetch(apiUrl("/api/meta/whatsapp/message-templates/clone"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceChannelId: vars.sourceChannelId,
          targetChannelId: vars.targetChannelId,
          skipNames: ["hello_world"],
        }),
      });
      const j = (await res.json().catch(() => ({}))) as CloneReport;
      if (!res.ok) {
        throw new Error(typeof j?.message === "string" ? j.message : "Erro ao clonar templates");
      }
      return j;
    },
    onSuccess: (report) => {
      setCloneReport(report);
      const n = report.created?.length ?? 0;
      const f = report.failed?.length ?? 0;
      toast.success(
        `Clone concluído: ${n} criado(s)${f ? `, ${f} falha(s)` : ""}. A Meta ainda precisa aprovar.`,
      );
      queryClient.invalidateQueries({ queryKey: ["meta-whatsapp-templates"] });
      queryClient.invalidateQueries({ queryKey: ["automation-whatsapp-templates"] });
      queryClient.invalidateQueries({ queryKey: ["editor-wa-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openCloneDialog() {
    const others = metaChannels.filter((c) => c.id !== channelId);
    setCloneSourceId(channelId || metaChannels[0]?.id || "");
    setCloneTargetId(others[0]?.id || "");
    setCloneReport(null);
    setCloneOpen(true);
  }

  function resetForm() {
    setName("");
    setBody("");
    setFooter("");
    setHeaderText("");
    setHeaderFormat("NONE");
    setHeaderMediaUrl("");
    setHeaderMediaFileName("");
    setQuickTexts([""]);
    setUrlRows([{ text: "", url: "" }]);
    setVarExamples({});
    setVarCrmFields({});
    setCreateMode("assisted");
    setFlowAssistEnabled(false);
    setFlowPickId("");
    setFlowButtonText("Abrir formulário");
    setFlowActionMeta("NAVIGATE");
  }

  async function submitAssisted() {
    const buttons: Record<string, unknown>[] = [];
    for (const t of quickTexts) {
      const x = t.trim();
      if (x) buttons.push({ type: "QUICK_REPLY", text: x });
    }
    for (const u of urlRows) {
      if (u.text.trim() && u.url.trim()) {
        buttons.push({ type: "URL", text: u.text.trim(), url: u.url.trim() });
      }
    }
    if (flowAssistEnabled && flowPickId.trim()) {
      buttons.push({
        type: "FLOW",
        text: (flowButtonText.trim() || "Abrir fluxo").slice(0, 25),
        flow_id: flowPickId.trim(),
        flow_action: flowActionMeta,
      });
    }

    // A Meta rejeita template que tem variável e não tem `example`. Bloquear
    // aqui poupa uma ida à Graph que voltaria erro de qualquer forma.
    const missing = createVarSlots.filter(
      (slot) => !(varExamples[createVarSlotId(slot)] ?? "").trim(),
    );
    if (missing.length > 0) {
      toast.error(
        `Informe o exemplo de ${missing.map(createVarSlotLabel).join(", ")} — a Meta rejeita template com variável sem exemplo.`,
      );
      return;
    }

    const exampleMapOf = (component: "header" | "body") => {
      const out: Record<string, string> = {};
      for (const slot of createVarSlots) {
        if (slot.component !== component) continue;
        out[slot.key] = (varExamples[createVarSlotId(slot)] ?? "").trim();
      }
      return Object.keys(out).length > 0 ? out : undefined;
    };

    const created = await createMutation
      .mutateAsync({
        name,
        language,
        category,
        parameterFormat,
        body,
        headerFormat,
        headerText: headerFormat === "TEXT" ? headerText : undefined,
        headerMediaUrl: isHeaderMedia ? headerMediaUrl.trim() : undefined,
        footer: category !== "AUTHENTICATION" ? footer : undefined,
        buttons: category !== "AUTHENTICATION" && buttons.length ? buttons : undefined,
        bodyExamples: exampleMapOf("body"),
        headerExamples: exampleMapOf("header"),
        addSecurityRecommendation,
        codeExpirationMinutes,
        otpType,
        otpButtonText,
      })
      .catch(() => null);
    if (!created) return;

    // Mapeamento variável → campo do CRM: fica no CRM (não vai para a Meta) e
    // serve de padrão quando o template for usado numa automação.
    const metaTemplateId = typeof created.id === "string" ? created.id.trim() : "";
    const operatorVariables: OperatorVariableMeta[] = createVarSlots
      .filter((slot) => slot.component === "body")
      .map((slot) => {
        const id = createVarSlotId(slot);
        const example = (varExamples[id] ?? "").trim();
        const crmField = (varCrmFields[id] ?? "").trim();
        return {
          key: slot.key,
          label: slot.key,
          ...(example ? { example } : {}),
          ...(crmField ? { crmField } : {}),
        };
      });
    if (!metaTemplateId || operatorVariables.length === 0) return;
    configMutation.mutate({
      metaTemplateId,
      metaTemplateName: name.trim().toLowerCase().replace(/-/g, "_"),
      label: "",
      agentEnabled: false,
      language,
      category,
      bodyPreview: body,
      hasButtons: buttons.length > 0,
      buttonTypes: [...new Set(buttons.map((b) => String(b.type)))],
      hasVariables: createVarSlots.length > 0,
      flowAction: null,
      flowId: null,
      operatorVariables,
    });
  }

  async function onHeaderMediaFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) {
      toast.error("Arquivo excede o limite de 16 MB.");
      return;
    }
    setHeaderMediaUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(apiUrl("/api/uploads/automation-media"), { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data?.message === "string" ? data.message : "Erro ao enviar arquivo.");
        return;
      }
      setHeaderMediaUrl(data.url);
      setHeaderMediaFileName(data.fileName ?? "");
    } catch {
      toast.error("Erro de rede ao enviar arquivo.");
    } finally {
      setHeaderMediaUploading(false);
      if (headerMediaInputRef.current) headerMediaInputRef.current.value = "";
    }
  }

  function submitJson() {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawJson) as Record<string, unknown>;
    } catch {
      toast.error("JSON inválido.");
      return;
    }
    createMutation.mutate({ raw: true, payload: parsed });
  }

  return (
    <div className={embedded ? "w-full space-y-4" : "w-full space-y-6"}>
      {!embedded && (
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft className="size-4" /> Configurações
        </Link>
      )}

      <HubSubHeader
        tone="success"
        icon={<MessageCircle className="size-[22px]" />}
        title="Templates WhatsApp (Meta)"
        actions={
          <>
            {metaChannels.length > 1 ? (
              <ButtonGlass
                type="button"
                variant="glass"
                size="sm"
                onClick={openCloneDialog}
                disabled={metaChannels.length < 2}
              >
                <Copy className="size-4" />
                <span className="ml-2">Clonar entre canais</span>
              </ButtonGlass>
            ) : null}
            <ButtonGlass type="button" variant="glass" size="sm" onClick={() => void refetch()} disabled={isFetching || !channelId}>
              {isFetching ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              <span className="ml-2">Atualizar</span>
            </ButtonGlass>
            <ButtonGlass
              type="button"
              variant="primary"
              size="sm"
              onClick={() => setCreateOpen(true)}
              disabled={!channelId}
            >
              <Plus className="size-4" />
              <span className="ml-2">Novo template</span>
            </ButtonGlass>
          </>
        }
      >
        Lista, criação e exclusão na conta comercial (WABA). Tipos suportados no assistente:{" "}
        <strong className="font-bold text-[var(--text-secondary)]">UTILITY</strong>,{" "}
        <strong className="font-bold text-[var(--text-secondary)]">MARKETING</strong> e{" "}
        <strong className="font-bold text-[var(--text-secondary)]">AUTHENTICATION</strong>. O assistente também permite{" "}
        <strong className="font-bold text-[var(--text-secondary)]">botão Flow</strong> com{" "}
        <code className="rounded-[var(--radius-sm)] border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] px-1 py-0.5 font-mono text-[11px] text-[var(--text-secondary)]">
          flow_id
        </code>{" "}
        publicado no CRM (aba Flows). Carrossel e permissão de ligação continuam no modo{" "}
        <strong className="font-bold text-[var(--text-secondary)]">JSON avançado</strong>.
        <div className="mt-2.5 flex flex-wrap items-center gap-4">
          <a
            href={DOCS_LIST}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[var(--brand-primary)] hover:text-[var(--brand-primary-dark)]"
          >
            <BookOpen className="size-3.5" /> API message_templates
          </a>
          <a
            href={DOCS_COMPONENTS}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[var(--brand-primary)] hover:text-[var(--brand-primary-dark)]"
          >
            <Layers className="size-3.5" /> Componentes
          </a>
          <a
            href={DOCS_CALL_PERMISSION}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[var(--brand-primary)] hover:text-[var(--brand-primary-dark)]"
          >
            <Phone className="size-3.5" /> Permissão de ligação
          </a>
        </div>
      </HubSubHeader>

      <HubStatGrid mobileCompact>
        <HubStat mobileCompact tone="success" icon={<CheckCircle2 className="size-5" />} value={countApproved} label="Aprovados pela Meta" />
        <HubStat mobileCompact tone="warn" icon={<Clock className="size-5" />} value={countPending} label="Em revisão" />
        <HubStat mobileCompact tone="brand" icon={<MessageSquare className="size-5" />} value={rows.length} label="Templates na WABA" />
        <HubStat mobileCompact tone="violet" icon={<UserCheck className="size-5" />} value={countAgent} label="Habilitados p/ Agente" />
      </HubStatGrid>

      {isError ? (
        <HubCallout tone="danger" icon={<AlertTriangle className="size-[18px]" />}>
          {error instanceof Error ? error.message : "Erro ao falar com a Meta."}{" "}
          Se aparecer configuração em falta, confira no servidor{" "}
          <code className="rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] px-1.5 py-0.5 font-mono text-[12px] text-[var(--color-danger)]">
            META_WHATSAPP_*
          </code>{" "}
          e o escopo{" "}
          <code className="rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] px-1.5 py-0.5 font-mono text-[12px] text-[var(--color-danger)]">
            whatsapp_business_management
          </code>{" "}
          no token.
        </HubCallout>
      ) : null}

      <HubPanel>
        {metaChannels.length > 0 ? (
          <div className="flex flex-col gap-2 border-b border-[var(--glass-border-subtle)] px-[18px] py-3 sm:flex-row sm:items-end sm:gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label className="text-[11px] font-semibold text-[var(--text-muted)]">
                Canal / número (WABA)
              </Label>
              <DropdownGlass
                triggerClassName="w-full"
                placeholder="Selecione o canal…"
                value={channelId}
                options={metaChannels.map((c: ApiChannel) => ({
                  value: c.id,
                  label: formatMetaChannelLabel(c),
                  description: c.status === "CONNECTED" ? "Conectado" : c.status,
                }))}
                onValueChange={(v) => setChannelId(v)}
              />
            </div>
            <p className="pb-1 text-[11px] text-[var(--text-muted)] sm:max-w-[280px]">
              Cada canal Cloud API tem sua própria lista de templates na Meta.
            </p>
          </div>
        ) : null}

        <HubToolbar
          searchValue={query}
          onSearchChange={setQuery}
          placeholder="Buscar por nome do template..."
        >
          <HubChip active={catFilter === "all"} onClick={() => setCatFilter("all")} count={rows.length}>
            Todos
          </HubChip>
          <HubChip active={catFilter === "UTILITY"} onClick={() => setCatFilter("UTILITY")} count={countUtility}>
            Utility
          </HubChip>
          <HubChip active={catFilter === "MARKETING"} onClick={() => setCatFilter("MARKETING")} count={countMarketing}>
            Marketing
          </HubChip>
          <HubChip active={catFilter === "AUTHENTICATION"} onClick={() => setCatFilter("AUTHENTICATION")} count={countAuth}>
            Auth
          </HubChip>
        </HubToolbar>

        <p className="px-[18px] pt-3 text-[12px] text-[var(--text-muted)]">
          Com a lista a carregar, o token no servidor já tem acesso à WABA do canal selecionado.{" "}
          <strong className="font-bold text-[var(--text-secondary)]">Dica:</strong> não reutilize o mesmo nome de template
          enquanto outro com esse nome estiver pendente na Meta.
        </p>

        {isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2.5 px-5 py-14 text-center">
            <AlertTriangle className="size-9 text-[var(--color-danger)] opacity-70" />
            <p className="text-[13px] text-[var(--text-muted)]">
              Não foi possível carregar os templates da WABA. Veja o aviso acima.
            </p>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
            <Search className="size-9 text-[var(--glass-border)]" />
            <p className="text-[13px] text-[var(--text-muted)]">
              {rows.length === 0 ? "Nenhum template encontrado nesta WABA." : "Nenhum template com esses filtros."}
            </p>
          </div>
        ) : (
          <div className="p-4">
          <ListHScroll scrollerClassName="pb-1">
            <div className="flex w-max min-w-full flex-col gap-2">
              <div
                className={listTableHeadRowClass("grid gap-3 border border-transparent px-4 py-2")}
                style={{ gridTemplateColumns: TPL_GRID_COLS }}
              >
                <ListColumnLabel>Nome</ListColumnLabel>
                <ListColumnLabel>Label</ListColumnLabel>
                <ListColumnLabel>Idioma</ListColumnLabel>
                <ListColumnLabel>Categoria</ListColumnLabel>
                <ListColumnLabel>Estado</ListColumnLabel>
                <ListColumnLabel>Qualidade</ListColumnLabel>
                <ListColumnLabel className="text-center">
                  <span className="inline-flex items-center gap-1.5">
                    <UserCheck className="size-3.5" />
                    Agente
                  </span>
                </ListColumnLabel>
                <ListColumnLabel align="right">Ações</ListColumnLabel>
              </div>
              {filteredRows.map((row) => {
                const st = STATUS_PT[row.status] ?? row.status;
                const scoreRaw =
                  row.quality_score?.score == null ? "" : String(row.quality_score.score).trim();
                const q =
                  scoreRaw && !/^none$/i.test(String(scoreRaw))
                    ? QUALITY_PT[String(scoreRaw).toUpperCase()] ?? scoreRaw
                    : "—";
                const rejectReason = meaningfulRejectedReason(row.status, row.rejected_reason);
                const cfg = configByMetaId.get(row.id);
                const isEditingLabel = editingLabelId === row.id;

                function saveConfig(patch: Partial<{ label: string; agentEnabled: boolean }>) {
                  const analysis = analyzeTemplateComponents(
                    Array.isArray(row.components) ? row.components : undefined,
                    { parameterFormat: row.parameter_format },
                  );
                  const bodyTxt = extractBodyText(row.components);
                  const prevVars = Array.isArray(cfg?.operatorVariables)
                    ? (cfg!.operatorVariables as OperatorVariableMeta[])
                    : undefined;
                  const operatorVariables = mergeOperatorVariables(bodyTxt, prevVars);
                  configMutation.mutate({
                    metaTemplateId: row.id,
                    metaTemplateName: row.name,
                    label: patch.label ?? cfg?.label ?? "",
                    agentEnabled: patch.agentEnabled ?? cfg?.agentEnabled ?? false,
                    language: row.language ?? "pt_BR",
                    category: row.category ?? null,
                    bodyPreview: bodyTxt,
                    hasButtons: analysis.hasButtons,
                    buttonTypes: analysis.buttonTypes,
                    hasVariables: analysis.hasVariables,
                    flowAction: analysis.flowAction,
                    flowId: analysis.flowId,
                    operatorVariables,
                  });
                }

                const isCallPermission = isCallPermissionTemplate(row);

                return (
                  <div
                    key={row.id}
                    style={{ gridTemplateColumns: TPL_GRID_COLS }}
                    className="group grid items-center gap-3 rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-4 py-3 shadow-[var(--glass-shadow-sm)] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:shadow-[var(--glass-shadow)]"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[color-mix(in_srgb,var(--color-success)_14%,transparent)] text-[var(--color-success)]">
                        <MessageSquare className="size-[18px]" />
                      </span>
                      <div className="min-w-0 flex-1 leading-tight">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-mono text-[13px] font-semibold text-[var(--text-primary)]">{row.name}</span>
                          {isCallPermission ? (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--color-info)_14%,transparent)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-info)] ring-1 ring-[color-mix(in_srgb,var(--color-info)_30%,transparent)]">
                              <Phone className="size-2.5" />
                              Voz
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="min-w-0">
                      {isEditingLabel ? (
                        <form className="flex items-center gap-1" onSubmit={(e) => {
                          e.preventDefault();
                          saveConfig({ label: labelDraft });
                          setEditingLabelId(null);
                        }}>
                          <InputGlass
                            ref={labelInputRef}
                            value={labelDraft}
                            onChange={(e) => setLabelDraft(e.target.value)}
                            className="h-7 w-36 text-xs"
                            placeholder="Ex: Boas-vindas"
                            autoFocus
                            onBlur={() => {
                              saveConfig({ label: labelDraft });
                              setEditingLabelId(null);
                            }}
                          />
                          <button type="submit" className="rounded p-0.5 text-[var(--color-success)] hover:bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)]">
                            <Check className="size-3.5" />
                          </button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          className="group/lbl flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                          onClick={() => { setEditingLabelId(row.id); setLabelDraft(cfg?.label ?? ""); }}
                        >
                          <span className={cn(cfg?.label ? "font-medium text-[var(--text-primary)]" : "italic")}>
                            {cfg?.label || "Sem label"}
                          </span>
                          <Pencil className="size-3 opacity-0 group-hover/lbl:opacity-100" />
                        </button>
                      )}
                    </div>
                    <div className="min-w-0 truncate tabular-nums text-xs text-[var(--text-muted)]">{row.language ?? "—"}</div>
                    <div className="min-w-0">
                      <span className="text-xs text-[var(--text-secondary)]">
                        {row.category ?? "—"}
                        {row.sub_category ? (
                          <span className="text-[var(--text-muted)]"> · {row.sub_category}</span>
                        ) : null}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                          row.status === "APPROVED" && "bg-[var(--color-success-bg)] text-[var(--color-success-text)]",
                          (row.status === "PENDING" || row.status === "PENDING_APPROVAL") && "bg-[var(--color-warn-bg)] text-[var(--color-warn)]",
                          (row.status === "PAUSED") && "bg-[var(--color-warn-bg)] text-[var(--color-warn)]",
                          row.status === "REJECTED" && "bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]",
                          row.status === "DISABLED" && "bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]",
                          !["APPROVED", "PENDING", "PENDING_APPROVAL", "PAUSED", "REJECTED", "DISABLED"].includes(row.status) && "border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-muted)]",
                        )}
                      >
                        {st}
                      </span>
                      {rejectReason ? (
                        <p className="mt-1 max-w-xs text-xs text-[var(--color-danger)]">
                          {rejectReason}
                        </p>
                      ) : null}
                    </div>
                    <div className="min-w-0 truncate text-xs text-[var(--text-secondary)]">{q}</div>
                    <div className="flex min-w-0 justify-center">
                      <button
                        type="button"
                        aria-label={cfg?.agentEnabled ? "Bloquear para agentes" : "Liberar para agentes"}
                        className={cn(
                          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                          cfg?.agentEnabled
                            ? "border-[var(--color-success)] bg-[var(--color-success)]"
                            : "border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--text-muted)_35%,transparent)]",
                          row.status !== "APPROVED" && "cursor-not-allowed opacity-40",
                        )}
                        onClick={() => saveConfig({ agentEnabled: !cfg?.agentEnabled })}
                        disabled={row.status !== "APPROVED"}
                      >
                        <span className={cn(
                          "pointer-events-none inline-block size-5 rounded-full bg-[var(--color-bg-card)] shadow-sm ring-0 transition-transform duration-200",
                          cfg?.agentEnabled ? "translate-x-5" : "translate-x-0",
                        )} />
                      </button>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center justify-end gap-1">
                        <ButtonGlass
                          type="button"
                          variant="glass"
                          size="icon"
                          className="size-8"
                          aria-label="Ver texto do template"
                          onClick={() => setPreviewRow(row)}
                        >
                          <Eye className="size-3.5" />
                        </ButtonGlass>
                        <ButtonGlass
                          type="button"
                          variant="glass"
                          size="icon"
                          className="size-8"
                          aria-label="Copiar ID Graph"
                          onClick={() => {
                            void navigator.clipboard.writeText(row.id);
                            toast.message("ID copiado");
                          }}
                        >
                          <ClipboardCopy className="size-3.5" />
                        </ButtonGlass>
                        <ButtonGlass
                          type="button"
                          variant="glass"
                          size="icon"
                          className="size-8 text-[var(--color-danger)] hover:text-[var(--color-danger)]"
                          aria-label="Excluir na Meta"
                          onClick={async () => {
                            const ok = await confirmDialog({
                              title: "Excluir template",
                              description: `Excluir o template "${row.name}" na Meta? Esta ação não pode ser desfeita.`,
                              confirmLabel: "Excluir",
                              variant: "destructive",
                            });
                            if (ok) deleteMutation.mutate({ id: row.id, name: row.name });
                          }}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="size-3.5" />
                        </ButtonGlass>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ListHScroll>
          </div>
        )}
      </HubPanel>

      <FormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        busy={createMutation.isPending}
        size="2xl"
        icon={<MessageCircle className="size-5 text-[var(--brand-primary)]" />}
        title="Novo template na Meta"
        description={<>O template segue para análise automática da Meta. Campos variáveis: <code className="font-mono text-xs text-[var(--text-secondary)]">{"{{1}}"}</code> (POSITIONAL) ou nomes em NAMED, conforme a doc.</>}
        footer={
          <>
            <ButtonGlass type="button" variant="glass" onClick={() => setCreateOpen(false)}>Cancelar</ButtonGlass>
            <ButtonGlass
              type="button"
              variant="primary"
              disabled={createMutation.isPending}
              onClick={() => {
                if (createMode === "json") submitJson();
                else void submitAssisted();
              }}
            >
              {createMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              <span className={cn(createMutation.isPending && "ml-2")}>Criar na Meta</span>
            </ButtonGlass>
          </>
        }
      >

          <div className="flex gap-2 border-b border-[var(--glass-border-subtle)] pb-2">
            <ButtonGlass
              type="button"
              variant="glass"
              size="sm"
              onClick={() => setCreateMode("assisted")}
            >
              Assistido
            </ButtonGlass>
            <ButtonGlass
              type="button"
              variant="glass"
              size="sm"
              onClick={() => setCreateMode("json")}
            >
              JSON avançado
            </ButtonGlass>
          </div>

          {createMode === "json" ? (
            <div className="space-y-2">
              <label className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Cole o JSON do corpo do POST (oficial Meta)</label>
              <textarea
                value={rawJson}
                onChange={(e) => setRawJson(e.target.value)}
                className="w-full resize-none rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-3.5 py-2.5 font-body text-[13px] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/10 min-h-[220px] font-mono text-xs"
                spellCheck={false}
              />
              <p className="text-xs text-[var(--text-muted)]">
                Use para <strong className="font-bold text-[var(--text-secondary)]">FLOW</strong>,{" "}
                <strong className="font-bold text-[var(--text-secondary)]">carousel</strong>,{" "}
                <strong className="font-bold text-[var(--text-secondary)]">call permission request</strong>, MPM, etc. — copie a estrutura dos exemplos da Meta e
                ajuste nomes/IDs.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_236px]">
              <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Nome interno (snake_case)</label>
                  <InputGlass
                    value={name}
                    onChange={(e) => setName(e.target.value.toLowerCase())}
                    placeholder="ex.: lembrete_pagamento"
                    className="font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Idioma</label>
                  <InputGlass value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="pt_BR" />
                </div>
              </div>
              <div>
                <label className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Categoria</label>
                <DropdownGlass
                  options={[
                    { value: "UTILITY", label: "UTILITY (transacional)" },
                    { value: "MARKETING", label: "MARKETING" },
                    { value: "AUTHENTICATION", label: "AUTHENTICATION (OTP)" },
                  ]}
                  value={category}
                  onValueChange={(v) => setCategory(v as "UTILITY" | "MARKETING" | "AUTHENTICATION")}
                  triggerClassName="w-full"
                />
              </div>
              {category !== "AUTHENTICATION" ? (
                <div>
                  <label className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Formato de parâmetros</label>
                  <DropdownGlass
                    options={[
                      { value: "POSITIONAL", label: "POSITIONAL ({{1}}, {{2}}…)" },
                      { value: "NAMED", label: "NAMED (nomes na doc Meta)" },
                    ]}
                    value={parameterFormat}
                    onValueChange={(v) => setParameterFormat(v as "POSITIONAL" | "NAMED")}
                    triggerClassName="w-full"
                  />
                </div>
              ) : null}

              {category !== "AUTHENTICATION" ? (
                <>
                  <div>
                    <label className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Cabeçalho</label>
                    <DropdownGlass
                      options={[
                        { value: "NONE", label: "Sem cabeçalho" },
                        { value: "TEXT", label: "TEXT" },
                        { value: "IMAGE", label: "IMAGE" },
                        { value: "VIDEO", label: "VIDEO" },
                        { value: "DOCUMENT", label: "DOCUMENT" },
                      ]}
                      value={headerFormat}
                      onValueChange={(v) => {
                        setHeaderFormat(v as typeof headerFormat);
                        if (v !== "IMAGE" && v !== "VIDEO" && v !== "DOCUMENT") {
                          setHeaderMediaUrl("");
                          setHeaderMediaFileName("");
                        }
                      }}
                      triggerClassName="w-full"
                    />
                  </div>
                  {headerFormat === "TEXT" ? (
                    <div>
                      <label className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Texto do cabeçalho</label>
                      <InputGlass value={headerText} onChange={(e) => setHeaderText(e.target.value)} />
                    </div>
                  ) : null}
                  {isHeaderMedia ? (
                    <div className="space-y-1.5 rounded-[var(--radius-lg)] border border-[var(--glass-border-subtle)] bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)] p-3">
                      <label className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                        URL HTTPS da mídia de exemplo (obrigatório)
                      </label>
                      <InputGlass
                        value={headerMediaUrl}
                        onChange={(e) => { setHeaderMediaUrl(e.target.value); setHeaderMediaFileName(""); }}
                        placeholder="https://exemplo.com/exemplo.mp4"
                      />
                      <input
                        ref={headerMediaInputRef}
                        type="file"
                        className="hidden"
                        onChange={onHeaderMediaFile}
                      />
                      <ButtonGlass
                        type="button"
                        variant="glass"
                        size="sm"
                        disabled={headerMediaUploading}
                        onClick={() => headerMediaInputRef.current?.click()}
                      >
                        {headerMediaUploading ? <Loader2 className="size-3.5 animate-spin" /> : null}
                        <span className={cn(headerMediaUploading && "ml-2")}>
                          {headerMediaFileName ? `Enviado: ${headerMediaFileName}` : "ou fazer upload de um arquivo"}
                        </span>
                      </ButtonGlass>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        A Meta exige uma mídia de exemplo na criação (vira <code className="font-mono">header_handle</code>).
                        No envio da automação você poderá usar outra mídia.
                      </p>
                    </div>
                  ) : null}
                </>
              ) : null}

              <div>
                <label className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Corpo {category === "AUTHENTICATION" ? "(ex.: {{1}} é seu código)" : ""}</label>
                <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className="w-full resize-none rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-3.5 py-2.5 font-body text-[13px] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/10 text-sm" />
                {category !== "AUTHENTICATION" ? (
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                    Use <code className="font-mono">{"{{1}}"}</code>,{" "}
                    <code className="font-mono">{"{{2}}"}</code>… onde o texto muda a cada envio.
                    Cada marcador vira um campo abaixo.
                  </p>
                ) : null}
              </div>

              {unsupportedTokens.length > 0 ? (
                <div className="rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--color-danger)_30%,transparent)] bg-[var(--color-danger-bg)] p-3 text-[12px] text-[var(--color-danger-text)]">
                  <p className="font-bold">
                    {unsupportedTokens.map((t) => `{{${t}}}`).join(", ")} não é variável para a
                    Meta.
                  </p>
                  <p className="mt-1">
                    Marcador com ponto, maiúscula ou hífen é aprovado como <strong>texto
                    literal</strong> — o contato recebe exatamente{" "}
                    <code className="font-mono">{`{{${unsupportedTokens[0]}}}`}</code>. Escreva{" "}
                    <code className="font-mono">{"{{1}}"}</code> no texto e escolha o campo do CRM
                    no bloco de variáveis, abaixo.
                  </p>
                </div>
              ) : null}

              {createVarSlots.length > 0 ? (
                <div className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--glass-border-subtle)] bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)] p-3">
                  <div>
                    <p className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                      Variáveis do template ({createVarSlots.length})
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
                      O <strong className="text-[var(--text-secondary)]">exemplo</strong> vai para a
                      Meta na análise e é obrigatório. O{" "}
                      <strong className="text-[var(--text-secondary)]">campo do CRM</strong> fica só
                      aqui: é o valor padrão que o CRM usa ao enviar o template.
                    </p>
                  </div>
                  {parameterFormatMismatch ? (
                    <p className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--color-warn)_35%,transparent)] bg-[var(--color-warn-bg)] px-2.5 py-1.5 text-[11px] text-[var(--color-warn)]">
                      {parameterFormatMismatch}
                    </p>
                  ) : null}
                  {createVarSlots.map((slot) => {
                    const slotId = createVarSlotId(slot);
                    return (
                      <div key={slotId} className="space-y-1.5">
                        <p className="font-mono text-[12px] font-bold text-[var(--text-primary)]">
                          {createVarSlotLabel(slot)}
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="space-y-1">
                            <label
                              htmlFor={`tpl-example-${slotId}`}
                              className="block text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]"
                            >
                              Exemplo (vai para a Meta)
                            </label>
                            <InputGlass
                              id={`tpl-example-${slotId}`}
                              value={varExamples[slotId] ?? ""}
                              onChange={(e) =>
                                setVarExamples((prev) => ({ ...prev, [slotId]: e.target.value }))
                              }
                              placeholder="ex.: Auxiliar de Logística"
                            />
                          </div>
                          {slot.component === "body" ? (
                            <div className="space-y-1">
                              <label
                                htmlFor={`tpl-crm-${slotId}`}
                                className="block text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]"
                              >
                                Campo do CRM (fica no CRM)
                              </label>
                              <VariableShortcutInput
                                id={`tpl-crm-${slotId}`}
                                value={varCrmFields[slotId] ?? ""}
                                onChange={(next) =>
                                  setVarCrmFields((prev) => ({ ...prev, [slotId]: next }))
                                }
                                options={crmVariableOptions}
                                placeholder="{ para escolher o campo"
                              />
                            </div>
                          ) : (
                            <p className="self-end pb-2.5 text-[11px] text-[var(--text-muted)]">
                              Variável de cabeçalho é preenchida no envio; o mapeamento padrão só
                              existe para o corpo.
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <VariableShortcutHint />
                </div>
              ) : null}

              {category === "AUTHENTICATION" ? (
                <div className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--glass-border-subtle)] bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)] p-3 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={addSecurityRecommendation}
                      onChange={(e) => setAddSecurityRecommendation(e.target.checked)}
                    />
                    Recomendação de segurança (Meta)
                  </label>
                  <div>
                    <label className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Expiração do código (minutos)</label>
                    <InputGlass
                      type="number"
                      min={1}
                      max={90}
                      value={codeExpirationMinutes}
                      onChange={(e) => setCodeExpirationMinutes(Number(e.target.value) || 10)}
                    />
                  </div>
                  <div>
                    <label className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Tipo OTP</label>
                    <DropdownGlass
                      options={[
                        { value: "COPY_CODE", label: "COPY_CODE" },
                        { value: "ONE_TAP", label: "ONE_TAP" },
                      ]}
                      value={otpType}
                      onValueChange={(v) => setOtpType(v)}
                      triggerClassName="w-full"
                    />
                  </div>
                  <div>
                    <label className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Texto do botão OTP</label>
                    <InputGlass value={otpButtonText} onChange={(e) => setOtpButtonText(e.target.value)} />
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <label className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Rodapé (opcional)</label>
                    <InputGlass value={footer} onChange={(e) => setFooter(e.target.value)} />
                  </div>
                  <div>
                    <label className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Botões rápidos (um por linha)</label>
                    {quickTexts.map((q, i) => (
                      <InputGlass
                        key={i}
                        className="mb-1 mt-1"
                        value={q}
                        onChange={(e) => {
                          const n = [...quickTexts];
                          n[i] = e.target.value;
                          setQuickTexts(n);
                        }}
                        placeholder="Texto do quick reply"
                      />
                    ))}
                    <ButtonGlass
                      type="button"
                      variant="glass"
                      size="sm"
                      className="mt-1"
                      onClick={() => setQuickTexts((q) => [...q, ""])}
                    >
                      + Quick reply
                    </ButtonGlass>
                  </div>
                  <div>
                    <label className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Botões URL</label>
                    {urlRows.map((r, i) => (
                      <div key={i} className="mb-2 flex gap-2">
                        <InputGlass
                          placeholder="Texto"
                          value={r.text}
                          onChange={(e) => {
                            const n = [...urlRows];
                            n[i] = { ...n[i], text: e.target.value };
                            setUrlRows(n);
                          }}
                        />
                        <InputGlass
                          placeholder="https://..."
                          value={r.url}
                          onChange={(e) => {
                            const n = [...urlRows];
                            n[i] = { ...n[i], url: e.target.value };
                            setUrlRows(n);
                          }}
                        />
                      </div>
                    ))}
                    <ButtonGlass
                      type="button"
                      variant="glass"
                      size="sm"
                      onClick={() => setUrlRows((u) => [...u, { text: "", url: "" }])}
                    >
                      + URL
                    </ButtonGlass>
                  </div>
                  <div className="rounded-[var(--radius-lg)] border border-[var(--color-info-border)] bg-[var(--color-info-bg)] p-3">
                    <label className="flex items-center gap-2 text-sm font-bold text-[var(--text-secondary)]">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--brand-primary)]"
                        checked={flowAssistEnabled}
                        onChange={(e) => setFlowAssistEnabled(e.target.checked)}
                      />
                      Botão WhatsApp Flow (assistido)
                    </label>
                    {flowAssistEnabled ? (
                      <div className="mt-3 space-y-2">
                        <div>
                          <label className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Flow publicado (CRM)</label>
                          <DropdownGlass
                            options={publishedFlows.map((f) => ({
                              value: f.metaFlowId!.trim(),
                              label: `${f.name} (${f.metaFlowId})`,
                            }))}
                            value={flowPickId || undefined}
                            onValueChange={(v) => setFlowPickId(v)}
                            placeholder="— escolha —"
                            triggerClassName="mt-1 w-full"
                          />
                          {publishedFlows.length === 0 ? (
                            <p className="mt-1 text-xs text-[var(--text-muted)]">
                              Publique um flow em{" "}
                              <Link
                                href="/settings/message-models?tab=flows"
                                className="font-bold text-[var(--brand-primary)] underline-offset-2 hover:underline"
                              >
                                Modelos → Flows
                              </Link>
                              .
                            </p>
                          ) : null}
                        </div>
                        <div>
                          <label className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Texto do botão (máx. 25)</label>
                          <InputGlass
                            value={flowButtonText}
                            onChange={(e) => setFlowButtonText(e.target.value.slice(0, 25))}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <label className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">flow_action</label>
                          <DropdownGlass
                            options={[
                              { value: "NAVIGATE", label: "NAVIGATE" },
                              { value: "DATA_EXCHANGE", label: "DATA_EXCHANGE" },
                            ]}
                            value={flowActionMeta}
                            onValueChange={(v) => setFlowActionMeta(v as "NAVIGATE" | "DATA_EXCHANGE")}
                            triggerClassName="mt-1 w-full"
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                </>
              )}
              </div>
              <WhatsappTemplatePreview
                category={category}
                headerFormat={headerFormat}
                headerText={headerText}
                body={body}
                footer={footer}
                quickTexts={quickTexts}
                urlRows={urlRows}
                otpButtonText={otpButtonText}
              />
            </div>
          )}

      </FormDialog>

      <Dialog open={!!previewRow} onOpenChange={(open) => { if (!open) setPreviewRow(null); }}>
        <DialogContent size="xl" panelClassName="max-h-[min(88vh,640px)]">
          <DialogHeader>
            <DialogTitle className="font-mono text-base">{previewRow?.name ?? "Template"}</DialogTitle>
            <DialogDescription>
              {previewRow?.language ?? "—"} · {previewRow?.status ?? "—"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {previewRow && componentPreviewBlocks(previewRow.components).length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">
                Não há campo de texto nos componentes devolvidos pela API (pode ocorrer em tipos especiais).
                Consulte o conteúdo no{" "}
                <a
                  href="https://business.facebook.com/latest/whatsapp_manager/message_templates"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-[var(--brand-primary)] underline underline-offset-2"
                >
                  Gestor do WhatsApp
                </a>
                .
              </p>
            ) : null}
            {previewRow
              ? componentPreviewBlocks(previewRow.components).map((b, i) => (
                  <div key={`${b.title}-${i}`}>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                      {b.title}
                    </p>
                    <pre className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-[var(--radius-md)] border border-[var(--glass-border-subtle)] bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)] p-3 text-sm text-[var(--text-secondary)]">
                      {b.body}
                    </pre>
                  </div>
                ))
              : null}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-[var(--glass-border-subtle)] pt-4">
            <ButtonGlass type="button" variant="glass" onClick={() => setPreviewRow(null)}>
              Fechar
            </ButtonGlass>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={cloneOpen}
        onOpenChange={(open) => {
          setCloneOpen(open);
          if (!open) setCloneReport(null);
        }}
      >
        <DialogContent size="lg" panelClassName="max-h-[min(88vh,720px)]">
          <DialogHeader>
            <DialogTitle>Clonar templates entre canais</DialogTitle>
            <DialogDescription>
              Copia os message templates da WABA de origem para a de destino. Cada cópia entra em
              análise na Meta (não herda o status Aprovado).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Canal origem (tem os templates)</Label>
              <DropdownGlass
                triggerClassName="w-full"
                placeholder="Origem…"
                value={cloneSourceId}
                options={metaChannels.map((c) => ({
                  value: c.id,
                  label: formatMetaChannelLabel(c),
                }))}
                onValueChange={setCloneSourceId}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Canal destino (receber clones)</Label>
              <DropdownGlass
                triggerClassName="w-full"
                placeholder="Destino…"
                value={cloneTargetId}
                options={metaChannels
                  .filter((c) => c.id !== cloneSourceId)
                  .map((c) => ({
                    value: c.id,
                    label: formatMetaChannelLabel(c),
                  }))}
                onValueChange={setCloneTargetId}
              />
            </div>
            {cloneReport ? (
              <div className="max-h-64 space-y-2 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--glass-border-subtle)] bg-[color-mix(in_srgb,var(--text-primary)_3%,transparent)] p-3 text-xs">
                <p className="font-semibold text-[var(--text-secondary)]">
                  Criados: {cloneReport.created?.length ?? 0} · Ignorados:{" "}
                  {cloneReport.skipped?.length ?? 0} · Falhas: {cloneReport.failed?.length ?? 0}
                </p>
                {(cloneReport.failed?.length ?? 0) > 0 ? (
                  <ul className="space-y-1 text-[var(--color-danger)]">
                    {cloneReport.failed!.map((f) => (
                      <li key={`${f.name}-${f.language}`}>
                        <span className="font-mono">{f.name}</span> ({f.language}): {f.error}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {(cloneReport.created?.length ?? 0) > 0 ? (
                  <ul className="space-y-0.5 text-[var(--color-success-text)]">
                    {cloneReport.created!.slice(0, 40).map((c) => (
                      <li key={`${c.name}-${c.language}`} className="font-mono">
                        {c.name} · {c.language}
                      </li>
                    ))}
                    {(cloneReport.created!.length ?? 0) > 40 ? (
                      <li>… e mais {cloneReport.created!.length - 40}</li>
                    ) : null}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <ButtonGlass type="button" variant="glass" onClick={() => setCloneOpen(false)}>
              Fechar
            </ButtonGlass>
            <ButtonGlass
              type="button"
              variant="primary"
              disabled={
                cloneMutation.isPending ||
                !cloneSourceId ||
                !cloneTargetId ||
                cloneSourceId === cloneTargetId
              }
              onClick={() =>
                cloneMutation.mutate({
                  sourceChannelId: cloneSourceId,
                  targetChannelId: cloneTargetId,
                })
              }
            >
              {cloneMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Copy className="size-4" />
              )}
              <span className="ml-2">Clonar agora</span>
            </ButtonGlass>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Faixa placeholder exibida no preview quando o cabeçalho é mídia (sem preview real do arquivo). */
const HEADER_MEDIA_PLACEHOLDER: Record<string, string> = {
  IMAGE: "Imagem",
  VIDEO: "Vídeo",
  DOCUMENT: "Documento",
};

/** Realça variáveis {{...}} dentro do corpo no preview do balão. */
function highlightTemplateVars(text: string): React.ReactNode {
  const parts = text.split(/(\{\{.*?\}\})/g);
  return parts.map((p, i) =>
    /^\{\{.*\}\}$/.test(p) ? (
      <span
        key={i}
        className="rounded-[var(--radius-sm)] px-1 font-mono text-[11px] font-bold"
        style={{ background: "color-mix(in srgb, var(--wa-accent) 22%, transparent)", color: "var(--wa-accent-strong)" }}
      >
        {p}
      </span>
    ) : (
      <React.Fragment key={i}>{p}</React.Fragment>
    ),
  );
}

/**
 * Pré-visualização do balão WhatsApp em tempo real (modo assistido do modal
 * "Novo template na Meta"). Apenas apresentação: consome o estado já existente
 * do formulário, sem chamadas de API. Cores ISOLADAS em --wa-* (não tokens
 * globais), por serem cores de marca do canal.
 */
function WhatsappTemplatePreview({
  category,
  headerFormat,
  headerText,
  body,
  footer,
  quickTexts,
  urlRows,
  otpButtonText,
}: {
  category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
  headerFormat: "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
  headerText: string;
  body: string;
  footer: string;
  quickTexts: string[];
  urlRows: { text: string; url: string }[];
  otpButtonText: string;
}) {
  const isAuth = category === "AUTHENTICATION";
  const buttons: { text: string; kind: "reply" | "url" }[] = [];
  if (isAuth) {
    if (otpButtonText.trim()) buttons.push({ text: otpButtonText.trim(), kind: "url" });
  } else {
    for (const q of quickTexts) {
      if (q.trim()) buttons.push({ text: q.trim(), kind: "reply" });
    }
    for (const u of urlRows) {
      if (u.text.trim()) buttons.push({ text: u.text.trim(), kind: "url" });
    }
  }

  return (
    <aside aria-label="Pré-visualização do WhatsApp" className="space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">Pré-visualização</p>
      <div
        className="overflow-hidden rounded-[var(--radius-card)] border-[5px] shadow-[var(--glass-shadow)]"
        style={{ borderColor: "var(--wa-frame)", background: "var(--wa-bg)" }}
      >
        <div className="flex items-center gap-2 px-3 py-1.5" style={{ background: "var(--wa-header)" }}>
          <span className="text-[10px] font-bold text-white">WhatsApp Business</span>
        </div>
        <div className="space-y-1.5 p-3">
          <div
            className="rounded-xl rounded-tl px-2.5 py-2 text-[12px] shadow-sm"
            style={{ background: "var(--wa-bubble)", color: "var(--wa-text)" }}
          >
            {headerFormat === "TEXT" && headerText.trim() ? (
              <p className="mb-1 font-bold">{headerText}</p>
            ) : null}
            {HEADER_MEDIA_PLACEHOLDER[headerFormat] ? (
              <div
                className="mb-1.5 flex items-center justify-center gap-1.5 rounded-[var(--radius-sm)] py-4 text-[11px] font-bold uppercase tracking-wide"
                style={{ background: "color-mix(in srgb, var(--wa-accent) 14%, transparent)", color: "var(--wa-accent-strong)" }}
              >
                {HEADER_MEDIA_PLACEHOLDER[headerFormat]}
              </div>
            ) : null}
            <p className="whitespace-pre-line leading-relaxed">
              {body.trim() ? highlightTemplateVars(body) : "Corpo da mensagem…"}
            </p>
            {!isAuth && footer.trim() ? (
              <p className="mt-1.5 text-[10px]" style={{ color: "var(--wa-text-muted)" }}>{footer}</p>
            ) : null}
          </div>
          {buttons.length ? (
            <div className="space-y-1">
              {buttons.map((b, i) => (
                <div
                  key={`${b.text}-${i}`}
                  className="rounded-[var(--radius-input)] py-1.5 text-center text-[11px] font-bold"
                  style={{ background: "var(--wa-bubble)", color: "var(--wa-accent-strong)", border: "1px solid var(--wa-field-border)" }}
                >
                  {b.text}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}


