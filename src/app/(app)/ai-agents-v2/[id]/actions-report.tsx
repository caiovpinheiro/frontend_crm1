"use client";

/**
 * Relatório de ações do agente: tudo o que ele fez nas conversas — respondeu,
 * transferiu (e por quê), etiquetou, moveu etapa, criou tarefa, enviou
 * mensagem pronta, encerrou — e o que tentou e foi barrado. Filtros e CSV.
 */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  IconAlertTriangle,
  IconArrowsRightLeft,
  IconBan,
  IconBrandWhatsapp,
  IconBriefcase,
  IconCheck,
  IconChecklist,
  IconChevronLeft,
  IconChevronRight,
  IconCircleX,
  IconDownload,
  IconEdit,
  IconExternalLink,
  IconFlag,
  IconListCheck,
  IconLoader2,
  IconMessage2,
  IconMessages,
  IconMoodEmpty,
  IconNote,
  IconPackage,
  IconQuestionMark,
  IconReportAnalytics,
  IconRoute,
  IconSearch,
  IconSend,
  IconStar,
  IconTag,
  IconX,
} from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MultiSelectPopover } from "@/features/dashboard-v2/components/multi-select-popover";
import { apiFetch, parseApiResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

import { BlockHeader, IconChip, Pill, SURFACE, Segmented, type Tone } from "./ui";

type EventType =
  | "reply"
  | "handoff"
  | "close"
  | "ask_with_options"
  | "add_tag"
  | "move_stage"
  | "create_activity"
  | "add_note"
  | "send_message_model"
  | "send_message"
  | "send_product"
  | "send_whatsapp_template"
  | "create_deal"
  | "update_field"
  | "tabulate_conversation"
  | "start_survey"
  | "record_knowledge_gap"
  | "no_reply"
  | "failure";
type Status = "ok" | "failed" | "discarded";

type ActionEvent = {
  id: string;
  at: string;
  conversationId: string;
  conversationNumber: number | null;
  contactName: string | null;
  contactPhone: string | null;
  clientMessage: string;
  type: EventType;
  status: Status;
  detail: string;
  themeId: string | null;
  themeName: string | null;
  source: "production" | "test";
  handoffCause: string | null;
  ruleName: string | null;
};

type ReportData = {
  total: number;
  conversations: number;
  turns: number;
  truncated: boolean;
  page: number;
  pageSize: number;
  events: ActionEvent[];
  byType: Partial<Record<EventType, number>>;
  byStatus: Partial<Record<Status, number>>;
  themes: Array<{ id: string; name: string }>;
};

const TYPE: Record<EventType, { label: string; icon: React.ComponentType<{ className?: string }>; tone: Tone }> = {
  reply: { label: "Respondeu", icon: IconMessage2, tone: "blue" },
  handoff: { label: "Transferiu", icon: IconRoute, tone: "rose" },
  close: { label: "Encerrou", icon: IconFlag, tone: "slate" },
  ask_with_options: { label: "Perguntou com botões", icon: IconListCheck, tone: "sky" },
  add_tag: { label: "Colocou etiqueta", icon: IconTag, tone: "violet" },
  move_stage: { label: "Moveu de etapa", icon: IconArrowsRightLeft, tone: "teal" },
  create_activity: { label: "Criou tarefa", icon: IconChecklist, tone: "amber" },
  add_note: { label: "Anotação interna", icon: IconNote, tone: "slate" },
  send_message_model: { label: "Mensagem pronta", icon: IconMessages, tone: "indigo" },
  send_message: { label: "Enviou mensagem", icon: IconSend, tone: "indigo" },
  send_product: { label: "Enviou produto", icon: IconPackage, tone: "orange" },
  send_whatsapp_template: { label: "Modelo do WhatsApp", icon: IconBrandWhatsapp, tone: "emerald" },
  create_deal: { label: "Criou negócio", icon: IconBriefcase, tone: "teal" },
  update_field: { label: "Atualizou campo", icon: IconEdit, tone: "slate" },
  tabulate_conversation: { label: "Tabulou", icon: IconCheck, tone: "slate" },
  start_survey: { label: "Enviou pesquisa", icon: IconStar, tone: "amber" },
  record_knowledge_gap: { label: "Dúvida sem resposta", icon: IconQuestionMark, tone: "amber" },
  no_reply: { label: "Não respondeu", icon: IconMoodEmpty, tone: "slate" },
  failure: { label: "Falha técnica", icon: IconAlertTriangle, tone: "rose" },
};

const STATUS: Record<Status, { label: string; tone: Tone; icon: React.ComponentType<{ className?: string }> }> = {
  ok: { label: "Feita", tone: "emerald", icon: IconCheck },
  failed: { label: "Falhou", tone: "rose", icon: IconCircleX },
  discarded: { label: "Barrada", tone: "amber", icon: IconBan },
};

const CAUSES: Array<{ value: string; label: string }> = [
  { value: "model", label: "Decisão do modelo" },
  { value: "human_request", label: "Cliente pediu pessoa" },
  { value: "no_source", label: "Sem material" },
  { value: "verification", label: "Citava algo sem fonte" },
  { value: "rule", label: "Atalho" },
  { value: "direct_theme", label: "Assunto só encaminha" },
  { value: "media", label: "Mídia" },
  { value: "identification", label: "Identificação" },
  { value: "sentiment", label: "Cliente insatisfeito" },
  { value: "limit", label: "Limite" },
  { value: "guard", label: "Promessa de retorno" },
  { value: "message_model_not_allowed", label: "Mensagem pronta não liberada" },
  { value: "message_model_failed", label: "Mensagem pronta não enviada" },
  { value: "error", label: "Erro do modelo" },
];

type Period = "today" | "7" | "30" | "90" | "custom";

/** yyyy-mm-dd no fuso do navegador. */
function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function periodRange(period: Period, custom: { from: string; to: string }): { from: string; to: string } {
  const today = new Date();
  if (period === "custom") return custom;
  if (period === "today") return { from: isoDay(today), to: isoDay(today) };
  const from = new Date(today);
  from.setDate(from.getDate() - (Number(period) - 1));
  return { from: isoDay(from), to: isoDay(today) };
}

function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function ActionsReport({ agentId }: { agentId: string }) {
  const [period, setPeriod] = React.useState<Period>("30");
  const [custom, setCustom] = React.useState(() => periodRange("30", { from: "", to: "" }));
  const [types, setTypes] = React.useState<string[]>([]);
  const [statuses, setStatuses] = React.useState<string[]>([]);
  const [sources, setSources] = React.useState<string[]>([]);
  const [themes, setThemes] = React.useState<string[]>([]);
  const [causes, setCauses] = React.useState<string[]>([]);
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [open, setOpen] = React.useState<string | null>(null);
  const [exporting, setExporting] = React.useState(false);
  const [exportError, setExportError] = React.useState<string | null>(null);
  const q = useDebounced(search, 350);

  const range = periodRange(period, custom);
  const params = new URLSearchParams({ from: range.from, to: range.to });
  if (types.length) params.set("types", types.join(","));
  if (statuses.length) params.set("status", statuses.join(","));
  if (sources.length) params.set("source", sources.join(","));
  if (themes.length) params.set("themes", themes.join(","));
  if (causes.length) params.set("causes", causes.join(","));
  if (q.trim()) params.set("q", q.trim());
  const filterKey = params.toString();

  // Filtro mudou: volta para a primeira página (ajuste durante a renderização).
  const [lastKey, setLastKey] = React.useState(filterKey);
  if (lastKey !== filterKey) {
    setLastKey(filterKey);
    setPage(1);
  }

  const report = useQuery({
    queryKey: ["ai-agents-v2-actions-report", agentId, filterKey, page],
    queryFn: async () => {
      const res = await apiFetch(`/api/ai-agents-v2/${agentId}/actions-report?${filterKey}&page=${page}`);
      return parseApiResponse<ReportData>(res, "Erro ao carregar o relatório.");
    },
    placeholderData: (prev) => prev,
  });
  const data = report.data;

  const hasFilters = types.length + statuses.length + sources.length + themes.length + causes.length > 0 || !!search.trim();
  const clear = () => {
    setTypes([]);
    setStatuses([]);
    setSources([]);
    setThemes([]);
    setCauses([]);
    setSearch("");
  };
  const toggleType = (t: string) => setTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  const exportCsv = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const res = await apiFetch(`/api/ai-agents-v2/${agentId}/actions-report/export?${filterKey}`);
      if (!res.ok || !(res.headers.get("content-type") ?? "").includes("text/csv")) {
        await parseApiResponse(res, "Erro ao exportar.");
        throw new Error("Erro ao exportar.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `acoes-do-agente-${range.from}-a-${range.to}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Erro ao exportar.");
    } finally {
      setExporting(false);
    }
  };

  const typeCounts = (Object.keys(TYPE) as EventType[])
    .map((t) => ({ t, n: data?.byType[t] ?? 0 }))
    .filter((x) => x.n > 0 || types.includes(x.t))
    .sort((a, b) => b.n - a.n);
  const first = data ? (data.page - 1) * data.pageSize + 1 : 0;
  const last = data ? Math.min(data.page * data.pageSize, data.total) : 0;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <section className={cn(SURFACE, "space-y-4 p-5 sm:p-6")}>
        <BlockHeader
          icon={IconReportAnalytics}
          tone="indigo"
          title="Relatório de ações"
          description="Tudo o que o agente fez nas conversas, e o que ele tentou e foi barrado pela configuração."
          actions={
            <Button variant="outline" className="h-9 gap-1.5 bg-white v2-dark:bg-card" disabled={exporting || !data?.total} onClick={exportCsv}>
              {exporting ? <IconLoader2 className="size-4 animate-spin" /> : <IconDownload className="size-4" />}
              Exportar CSV
            </Button>
          }
        />
        {exportError && <p className="text-sm text-destructive">{exportError}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={period}
            onChange={setPeriod}
            options={[
              { value: "today", label: "Hoje" },
              { value: "7", label: "7 dias" },
              { value: "30", label: "30 dias" },
              { value: "90", label: "90 dias" },
              { value: "custom", label: "Escolher" },
            ]}
          />
          {period === "custom" && (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <input
                type="date"
                value={custom.from}
                max={custom.to}
                onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                className="h-9 rounded-lg border border-border bg-white px-2 text-sm text-foreground v2-dark:bg-card"
                aria-label="De"
              />
              até
              <input
                type="date"
                value={custom.to}
                min={custom.from}
                onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                className="h-9 rounded-lg border border-border bg-white px-2 text-sm text-foreground v2-dark:bg-card"
                aria-label="Até"
              />
            </span>
          )}
          <label className="flex h-9 min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-border bg-white px-3 focus-within:border-primary/50 v2-dark:bg-card">
            <IconSearch className="size-4 shrink-0 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cliente, telefone, mensagem ou nº da conversa"
              className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              aria-label="Buscar"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <MultiSelectPopover
            label="Ação"
            options={(Object.keys(TYPE) as EventType[]).map((t) => ({ value: t, label: TYPE[t].label }))}
            selected={types}
            onChange={setTypes}
          />
          <MultiSelectPopover
            label="Situação"
            options={(Object.keys(STATUS) as Status[]).map((s) => ({ value: s, label: STATUS[s].label }))}
            selected={statuses}
            onChange={setStatuses}
            searchable={false}
          />
          <MultiSelectPopover
            label="Origem"
            options={[
              { value: "production", label: "Conversas reais" },
              { value: "test", label: "Números de teste" },
            ]}
            selected={sources}
            onChange={setSources}
            searchable={false}
          />
          <MultiSelectPopover
            label="Assunto"
            options={[...(data?.themes ?? []).map((t) => ({ value: t.id, label: t.name })), { value: "__none__", label: "Sem assunto" }]}
            selected={themes}
            onChange={setThemes}
          />
          <MultiSelectPopover label="Motivo da transferência" options={CAUSES} selected={causes} onChange={setCauses} />
          {hasFilters && (
            <button type="button" onClick={clear} className="inline-flex h-8 items-center gap-1 px-2 text-xs font-medium text-muted-foreground hover:text-foreground">
              <IconX className="size-3.5" /> Limpar filtros
            </button>
          )}
        </div>
      </section>

      {data && typeCounts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {typeCounts.map(({ t, n }) => {
            const meta = TYPE[t];
            const on = types.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleType(t)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border bg-white py-1.5 pl-1.5 pr-3 text-left transition-colors v2-dark:bg-card",
                  on ? "border-primary/40 ring-1 ring-primary/15" : "border-border hover:border-primary/30",
                )}
              >
                <IconChip icon={meta.icon} tone={meta.tone} size="sm" />
                <span>
                  <span className="block text-sm font-bold leading-none tabular-nums">{n.toLocaleString("pt-BR")}</span>
                  <span className="block text-[11.5px] text-muted-foreground">{meta.label}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <section className={cn(SURFACE, "overflow-hidden")}>
        <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-5 py-3 text-[13px]">
          {data ? (
            <span className="text-muted-foreground">
              <b className="text-foreground tabular-nums">{data.total.toLocaleString("pt-BR")}</b> ações em{" "}
              <b className="text-foreground tabular-nums">{data.conversations.toLocaleString("pt-BR")}</b> conversas
              {data.byStatus.failed ? <> · <span className="text-rose-600 v2-dark:text-rose-400">{data.byStatus.failed} falharam</span></> : null}
              {data.byStatus.discarded ? <> · <span className="text-amber-700 v2-dark:text-amber-400">{data.byStatus.discarded} barradas</span></> : null}
            </span>
          ) : (
            <span className="text-muted-foreground">Carregando…</span>
          )}
          {report.isFetching && <IconLoader2 className="size-3.5 animate-spin text-muted-foreground" />}
        </div>
        {data?.truncated && (
          <p className="flex items-center gap-2 border-b border-border/70 bg-amber-50 px-5 py-2 text-xs text-amber-800 v2-dark:bg-amber-500/10 v2-dark:text-amber-300">
            <IconAlertTriangle className="size-3.5 shrink-0" /> Período grande: o relatório considera os {data.turns.toLocaleString("pt-BR")} turnos mais recentes. Diminua o período para ver tudo.
          </p>
        )}

        <div className="hidden grid-cols-[110px_minmax(150px,1fr)_180px_minmax(180px,1.4fr)_130px_96px] gap-3 border-b border-border/70 bg-slate-50 px-5 py-2 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground lg:grid v2-dark:bg-muted/40">
          <span>Quando</span>
          <span>Cliente</span>
          <span>Ação</span>
          <span>Detalhe</span>
          <span>Assunto</span>
          <span>Situação</span>
        </div>

        {report.isLoading && (
          <div className="space-y-2 p-5">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        )}
        {report.isError && <p className="px-5 py-6 text-sm text-destructive">{(report.error as Error)?.message}</p>}
        {data && data.events.length === 0 && (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">Nenhuma ação com esses filtros no período.</p>
        )}

        <ul className="divide-y divide-border/60">
          {data?.events.map((e) => {
            const meta = TYPE[e.type] ?? TYPE.failure;
            const st = STATUS[e.status];
            const isOpen = open === e.id;
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : e.id)}
                  aria-expanded={isOpen}
                  className="grid w-full grid-cols-1 gap-1.5 px-5 py-2.5 text-left transition-colors hover:bg-slate-50 lg:grid-cols-[110px_minmax(150px,1fr)_180px_minmax(180px,1.4fr)_130px_96px] lg:items-center lg:gap-3 v2-dark:hover:bg-muted/40"
                >
                  <span className="text-xs tabular-nums text-muted-foreground">{dateTime(e.at)}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium">{e.contactName || e.contactPhone || "Cliente"}</span>
                    <span className="block truncate text-[11.5px] text-muted-foreground">
                      {e.conversationNumber ? `#${e.conversationNumber}` : ""}
                      {e.source === "test" && " · teste"}
                    </span>
                  </span>
                  <span className="flex min-w-0 items-center gap-2">
                    <IconChip icon={meta.icon} tone={meta.tone} size="sm" className="size-6 rounded-md [&>svg]:size-3.5" />
                    <span className="truncate text-[13px]">{meta.label}</span>
                  </span>
                  <span className="truncate text-[13px] text-muted-foreground" title={e.detail}>
                    {e.detail || "—"}
                  </span>
                  <span className="truncate text-[13px] text-muted-foreground">{e.themeName ?? "—"}</span>
                  <span>
                    <Pill tone={st.tone} icon={st.icon}>
                      {st.label}
                    </Pill>
                  </span>
                </button>
                {isOpen && (
                  <div className="space-y-2 bg-slate-50/70 px-5 pb-4 pt-1 text-[13px] v2-dark:bg-muted/30">
                    <div className="grid gap-2 md:grid-cols-2">
                      <div className="rounded-lg border border-border/70 bg-white p-2.5 v2-dark:bg-card">
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Mensagem do cliente</p>
                        <p className="whitespace-pre-wrap">{e.clientMessage || "—"}</p>
                      </div>
                      <div className="rounded-lg border border-border/70 bg-white p-2.5 v2-dark:bg-card">
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{meta.label}</p>
                        <p className="whitespace-pre-wrap">{e.detail || "—"}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {e.contactPhone && <Pill tone="slate">{e.contactPhone}</Pill>}
                      {e.ruleName && <Pill tone="amber">atalho: {e.ruleName}</Pill>}
                      <Pill tone={e.source === "test" ? "sky" : "slate"}>{e.source === "test" ? "número de teste" : "conversa real"}</Pill>
                      {e.conversationNumber && (
                        <a
                          href={`/inbox?c=${encodeURIComponent(String(e.conversationNumber))}`}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-auto inline-flex items-center gap-1 font-medium text-primary hover:underline"
                        >
                          Abrir conversa <IconExternalLink className="size-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {data && data.total > data.pageSize && (
          <div className="flex items-center gap-2 border-t border-border/70 px-5 py-2.5 text-[13px] text-muted-foreground">
            <span className="tabular-nums">
              {first.toLocaleString("pt-BR")}–{last.toLocaleString("pt-BR")} de {data.total.toLocaleString("pt-BR")}
            </span>
            <span className="ml-auto flex gap-1">
              <Button variant="ghost" size="sm" className="h-8 gap-1" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <IconChevronLeft className="size-4" /> Anterior
              </Button>
              <Button variant="ghost" size="sm" className="h-8 gap-1" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                Próxima <IconChevronRight className="size-4" />
              </Button>
            </span>
          </div>
        )}
      </section>
    </div>
  );
}
