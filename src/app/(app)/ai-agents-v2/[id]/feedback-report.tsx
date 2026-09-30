"use client";

/**
 * Feedback do agente: relatório tirado das conversas reais, dos testes e das
 * comparações com a equipe — o que falta nos materiais, o que ajustar nos
 * assuntos, onde transfere sem precisar — com a evidência e o atalho para
 * corrigir. Também o cartão-resumo do Início.
 */

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconBook,
  IconBookOff,
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconFileSearch,
  IconFilePlus,
  IconHistory,
  IconLoader2,
  IconLock,
  IconMessages,
  IconPhoto,
  IconPlayerPlay,
  IconPlayerStop,
  IconRobot,
  IconRoute,
  IconSparkles,
  IconTarget,
  IconTool,
  IconUser,
  IconUsers,
  IconX,
} from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, parseApiResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

import { BlockHeader, IconChip, Pill, SURFACE, Segmented, type Tone } from "./ui";

type SourceType = "turn" | "test_turn" | "replay_point";

type Category =
  | "material_faltando"
  | "material_nao_liberado"
  | "busca_nao_achou"
  | "material_ruim"
  | "instrucao_assunto"
  | "regra_global"
  | "reconhecimento_assunto"
  | "tom"
  | "transferencia_desnecessaria"
  | "transferencia_faltando"
  | "acao_nao_liberada"
  | "mensagem_pronta"
  | "escopo"
  | "midia"
  | "integracao"
  | "motor";

export type FeedbackTarget = { section: string; tab?: string; themeId?: string; docId?: string; docTitle?: string; themeName?: string };

type Evidence = { sourceType: SourceType; sourceId: string; conversationId: string; at: string; client: string; agent: string; human?: string; pills: string[] };

type Item = {
  id: string;
  category: Category;
  severity: number;
  score: number;
  minor: boolean;
  title: string;
  summary: string;
  target: FeedbackTarget | null;
  recommendation: { action: string; text: string; questions: string[]; triggers: string[] } | null;
  conversations: number;
  evidenceCount: number;
  evidences: Evidence[];
  status: "open" | "resolved" | "ignored";
};

type Report = {
  id: string;
  status: "running" | "done" | "error" | "canceled";
  params: { days: number; sources: SourceType[] };
  stats: { turns: number; candidates: number; sampled: boolean; items: number; bySource: Partial<Record<SourceType, number>> } | null;
  total: number;
  done: number;
  costUsd: number;
  error: string | null;
  createdAt: string;
};

type Estimate = {
  turns: number;
  bySource: Partial<Record<SourceType, number>>;
  candidates: number;
  sampled: boolean;
  calls: number;
  estimatedCostUsd: number;
  model: string;
};

type Group = "materiais" | "assuntos" | "transferencias" | "acoes" | "escopo" | "outros";

const GROUPS: Record<Group, { label: string; icon: React.ComponentType<{ className?: string }>; tone: Tone }> = {
  materiais: { label: "Materiais", icon: IconBook, tone: "amber" },
  assuntos: { label: "Assuntos", icon: IconTarget, tone: "emerald" },
  transferencias: { label: "Transferências", icon: IconRoute, tone: "rose" },
  acoes: { label: "Ações", icon: IconTool, tone: "violet" },
  escopo: { label: "Escopo", icon: IconLock, tone: "slate" },
  outros: { label: "Outros", icon: IconPhoto, tone: "sky" },
};

const CATEGORY: Record<Category, { label: string; group: Group; icon: React.ComponentType<{ className?: string }> }> = {
  material_faltando: { label: "Material faltando", group: "materiais", icon: IconFilePlus },
  material_nao_liberado: { label: "Material não liberado", group: "materiais", icon: IconBookOff },
  busca_nao_achou: { label: "A busca não encontra", group: "materiais", icon: IconFileSearch },
  material_ruim: { label: "Material a melhorar", group: "materiais", icon: IconBook },
  instrucao_assunto: { label: "Instrução do assunto", group: "assuntos", icon: IconTarget },
  reconhecimento_assunto: { label: "Reconhecimento de assunto", group: "assuntos", icon: IconTarget },
  regra_global: { label: "Regra geral", group: "assuntos", icon: IconUser },
  tom: { label: "Tom", group: "assuntos", icon: IconUser },
  transferencia_desnecessaria: { label: "Transfere sem precisar", group: "transferencias", icon: IconRoute },
  transferencia_faltando: { label: "Deveria transferir", group: "transferencias", icon: IconRoute },
  acao_nao_liberada: { label: "Ação não liberada", group: "acoes", icon: IconTool },
  mensagem_pronta: { label: "Mensagem pronta", group: "acoes", icon: IconMessages },
  escopo: { label: "Fora do escopo", group: "escopo", icon: IconLock },
  midia: { label: "Mídia", group: "outros", icon: IconPhoto },
  integracao: { label: "Integração", group: "outros", icon: IconTool },
  motor: { label: "Falha técnica", group: "outros", icon: IconAlertTriangle },
};

const SOURCE_LABEL: Record<SourceType, string> = { turn: "Conversas reais", test_turn: "Testes", replay_point: "Comparações" };
const DRAFTABLE = new Set<Category>(["material_faltando", "material_ruim", "busca_nao_achou"]);

function severityPill(sev: number): { label: string; tone: Tone } {
  if (sev >= 5) return { label: "inventou", tone: "rose" };
  if (sev >= 4) return { label: "errou", tone: "rose" };
  if (sev >= 3) return { label: "importante", tone: "amber" };
  return { label: "ajuste", tone: "slate" };
}

const STRIPE: Record<string, string> = { rose: "before:bg-rose-500", amber: "before:bg-amber-400", slate: "before:bg-slate-300" };

function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function targetLabel(t: FeedbackTarget | null): string | null {
  if (!t) return null;
  if (t.section === "cuida" && t.themeId) return `Abrir o assunto${t.themeName ? ` ${t.themeName}` : ""}`;
  if (t.section === "cuida" && t.tab === "acoes") return "Abrir O que ele pode fazer";
  if (t.section === "cuida" && t.tab === "escopo") return "Abrir Fora do escopo";
  if (t.section === "cuida") return "Abrir assuntos";
  if (t.section === "sabe" && t.tab === "prontas") return "Abrir mensagens prontas";
  if (t.section === "sabe") return "Abrir materiais";
  if (t.section === "quem") return "Abrir Quem é o agente";
  return null;
}

async function fetchReports(agentId: string): Promise<Report[]> {
  const res = await apiFetch(`/api/ai-agents-v2/${agentId}/feedback`);
  return (await parseApiResponse<{ reports: Report[] }>(res, "Erro ao carregar relatórios.")).reports;
}

async function fetchReport(agentId: string, reportId: string): Promise<{ report: Report; items: Item[] }> {
  const res = await apiFetch(`/api/ai-agents-v2/${agentId}/feedback/${reportId}`);
  return parseApiResponse<{ report: Report; items: Item[] }>(res, "Erro ao carregar o relatório.");
}

async function post<T>(url: string, body: unknown, fallback: string, method = "POST"): Promise<T> {
  const res = await apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return parseApiResponse<T>(res, fallback);
}

// ─── Aba Feedback ───────────────────────────────────────────────────────

export function FeedbackReport({ agentId, onNavigate }: { agentId: string; onNavigate: (t: FeedbackTarget) => void }) {
  const queryClient = useQueryClient();
  const [days, setDays] = React.useState<"7" | "30" | "90">("30");
  const [sources, setSources] = React.useState<SourceType[]>(["turn", "test_turn", "replay_point"]);
  const [reportId, setReportId] = React.useState<string | null>(null);
  const params = { days: Number(days), sources };

  const reports = useQuery({
    queryKey: ["ai-agents-v2-feedback", agentId],
    queryFn: () => fetchReports(agentId),
    refetchInterval: (q) => ((q.state.data ?? []).some((r) => r.status === "running") ? 4000 : false),
  });
  const estimate = useQuery({
    queryKey: ["ai-agents-v2-feedback-estimate", agentId, params],
    queryFn: () => post<Estimate>(`/api/ai-agents-v2/${agentId}/feedback`, { ...params, estimate: true }, "Erro ao estimar."),
    enabled: sources.length > 0,
  });
  const start = useMutation({
    mutationFn: () => post<{ reportId: string }>(`/api/ai-agents-v2/${agentId}/feedback`, params, "Erro ao gerar o relatório."),
    onSuccess: (r) => {
      setReportId(r.reportId);
      queryClient.invalidateQueries({ queryKey: ["ai-agents-v2-feedback", agentId] });
    },
  });

  const list = reports.data ?? [];
  const running = list.find((r) => r.status === "running");
  const currentId = reportId ?? list.find((r) => r.status !== "error")?.id ?? list[0]?.id ?? null;
  const est = estimate.data;
  const toggleSource = (s: SourceType) => setSources((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  return (
    <div className="space-y-4">
      <section className={cn(SURFACE, "space-y-5 p-5 sm:p-6")}>
        <BlockHeader
          icon={IconSparkles}
          tone="orange"
          title="Feedback do agente"
          description="O que falta nos materiais, o que ajustar nos assuntos e onde ele transfere sem precisar — tirado das conversas, dos testes e das comparações com a equipe."
        />
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            value={days}
            onChange={setDays}
            options={[
              { value: "7", label: "7 dias" },
              { value: "30", label: "30 dias" },
              { value: "90", label: "90 dias" },
            ]}
          />
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(SOURCE_LABEL) as SourceType[]).map((s) => {
              const on = sources.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSource(s)}
                  aria-pressed={on}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors",
                    on
                      ? "border-orange-200 bg-orange-50 text-orange-800 v2-dark:border-orange-500/30 v2-dark:bg-orange-500/15 v2-dark:text-orange-300"
                      : "border-border bg-white text-muted-foreground hover:text-foreground v2-dark:bg-card",
                  )}
                >
                  {on && <IconCheck className="size-3.5" />}
                  {SOURCE_LABEL[s]}
                  {est?.bySource[s] !== undefined && <span className="tabular-nums opacity-70">{est.bySource[s]}</span>}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center v2-dark:bg-muted/40">
          <p className="flex-1 text-[13px] text-muted-foreground">
            {sources.length === 0
              ? "Escolha ao menos uma fonte."
              : estimate.isError
                ? ((estimate.error as Error)?.message ?? "Erro ao estimar.")
                : !est
                  ? "Calculando…"
                  : est.turns === 0
                    ? "Nenhuma conversa desse agente no período."
                    : (
                      <>
                        <b className="text-foreground tabular-nums">{est.turns}</b> turnos · <b className="text-foreground tabular-nums">{est.candidates}</b> com sinal de problema
                        {est.sampled && " (analisa os mais graves)"} · ~<b className="text-foreground tabular-nums">US$ {est.estimatedCostUsd.toFixed(2)}</b>
                      </>
                    )}
          </p>
          <Button
            className="gap-1.5 sm:ml-auto"
            disabled={start.isPending || !!running || !est?.candidates || sources.length === 0}
            onClick={() => start.mutate()}
          >
            {start.isPending ? <IconLoader2 className="size-4 animate-spin" /> : <IconPlayerPlay className="size-4" />}
            Gerar relatório
          </Button>
        </div>
        {start.isError && <p className="text-sm text-destructive">{(start.error as Error)?.message}</p>}
      </section>

      {list.length > 1 && <ReportHistory reports={list} currentId={currentId} onSelect={setReportId} />}
      {reports.isLoading && <Skeleton className="h-40 rounded-2xl" />}
      {currentId && <ReportDetail agentId={agentId} reportId={currentId} onNavigate={onNavigate} />}
    </div>
  );
}

function ReportHistory({ reports, currentId, onSelect }: { reports: Report[]; currentId: string | null; onSelect: (id: string) => void }) {
  return (
    <section className={cn(SURFACE, "overflow-hidden")}>
      <div className="flex items-center gap-2 border-b border-border/70 px-5 py-3">
        <IconHistory className="size-4 text-muted-foreground" />
        <h4 className="text-[13px] font-semibold">Relatórios</h4>
      </div>
      <ul className="divide-y divide-border/60">
        {reports.slice(0, 5).map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onSelect(r.id)}
              className={cn(
                "flex w-full items-center gap-4 px-5 py-2.5 text-left transition-colors",
                r.id === currentId ? "bg-blue-50/70 v2-dark:bg-primary/10" : "hover:bg-slate-50 v2-dark:hover:bg-muted/40",
              )}
            >
              <span className={cn("h-8 w-1 shrink-0 rounded-full", r.id === currentId ? "bg-primary" : "bg-transparent")} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">{dateTime(r.createdAt)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  últimos {r.params.days} dias · {r.params.sources.map((s) => SOURCE_LABEL[s].toLowerCase()).join(", ")}
                </p>
              </div>
              {r.status === "running" && <Pill tone="sky">gerando</Pill>}
              {r.status === "error" && <Pill tone="rose">parou</Pill>}
              {r.status === "canceled" && <Pill tone="slate">interrompido</Pill>}
              {r.status === "done" && r.stats && <Pill tone="orange">{r.stats.items} itens</Pill>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReportDetail({ agentId, reportId, onNavigate }: { agentId: string; reportId: string; onNavigate: (t: FeedbackTarget) => void }) {
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ["ai-agents-v2-feedback-report", agentId, reportId],
    queryFn: () => fetchReport(agentId, reportId),
    refetchInterval: (query) => (query.state.data?.report.status === "running" ? 3000 : false),
  });
  const [group, setGroup] = React.useState<Group | "all">("all");
  const [status, setStatus] = React.useState<Item["status"]>("open");
  const [minorOpen, setMinorOpen] = React.useState(false);
  const cancel = useMutation({
    mutationFn: () => post(`/api/ai-agents-v2/${agentId}/feedback/${reportId}`, {}, "Erro ao interromper.", "DELETE"),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agents-v2-feedback", agentId] });
      queryClient.invalidateQueries({ queryKey: ["ai-agents-v2-feedback-report", agentId, reportId] });
    },
  });

  if (q.isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  if (q.isError || !q.data) return <p className="text-sm text-destructive">{(q.error as Error)?.message ?? "Erro."}</p>;
  const { report, items } = q.data;

  if (report.status === "running") {
    return (
      <section className={cn(SURFACE, "space-y-3 p-5")}>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <IconChip icon={IconLoader2} tone="sky" size="sm" className="[&>svg]:animate-spin" />
          <span className="font-medium">
            {report.total > 0 ? `Analisando… etapa ${Math.min(report.done + 1, report.total)} de ${report.total}` : "Lendo as conversas…"}
          </span>
          <span className="ml-auto text-xs text-muted-foreground">US$ {report.costUsd.toFixed(3)} até agora</span>
          <Button size="sm" variant="ghost" className="h-7 gap-1" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
            <IconPlayerStop className="size-3" /> Interromper
          </Button>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100 v2-dark:bg-muted">
          <div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${report.total ? (report.done / report.total) * 100 : 5}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">Pode sair da tela: o relatório continua sendo gerado.</p>
      </section>
    );
  }
  if (report.status === "error") {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 v2-dark:border-rose-500/30 v2-dark:bg-rose-500/10 v2-dark:text-rose-300">
        <IconAlertTriangle className="size-4 shrink-0" /> {report.error ?? "O relatório falhou."}
      </p>
    );
  }

  const byStatus = items.filter((i) => i.status === status);
  const main = byStatus.filter((i) => !i.minor);
  const minor = byStatus.filter((i) => i.minor);
  const count = (g: Group) => main.filter((i) => CATEGORY[i.category]?.group === g).length;
  const visible = main.filter((i) => group === "all" || CATEGORY[i.category]?.group === group);
  const statusCount = (s: Item["status"]) => items.filter((i) => i.status === s).length;

  return (
    <div className="space-y-4">
      <section className={cn(SURFACE, "space-y-4 p-5")}>
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
          <span>
            {report.stats?.turns ?? 0} turnos analisados · {report.stats?.candidates ?? 0} com sinal de problema
            {report.stats?.sampled && " (os mais graves)"} · custo US$ {report.costUsd.toFixed(3)}
          </span>
          <span className="ml-auto">{dateTime(report.createdAt)}</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {(Object.keys(GROUPS) as Group[]).map((g) => {
            const meta = GROUPS[g];
            const n = count(g);
            const on = group === g;
            return (
              <button
                key={g}
                type="button"
                onClick={() => setGroup(on ? "all" : g)}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors",
                  on ? "border-primary/40 bg-blue-50/60 ring-1 ring-primary/15 v2-dark:bg-primary/10" : "border-border/70 hover:bg-slate-50 v2-dark:hover:bg-muted/40",
                  n === 0 && !on && "opacity-60",
                )}
              >
                <IconChip icon={meta.icon} tone={meta.tone} size="sm" />
                <span className="min-w-0">
                  <span className="block text-lg font-bold leading-none tabular-nums">{n}</span>
                  <span className="block truncate text-[11.5px] text-muted-foreground">{meta.label}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { value: "open", label: "Abertos", count: statusCount("open") },
            { value: "resolved", label: "Resolvidos", count: statusCount("resolved") },
            { value: "ignored", label: "Ignorados", count: statusCount("ignored") },
          ]}
        />
        {group !== "all" && (
          <button
            type="button"
            onClick={() => setGroup("all")}
            className="inline-flex h-8 items-center gap-1 rounded-lg bg-blue-50 px-2.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-100 hover:bg-blue-100 v2-dark:bg-primary/15 v2-dark:text-blue-300"
          >
            {GROUPS[group].label} <IconX className="size-3" />
          </button>
        )}
      </div>

      {visible.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border bg-white px-4 py-8 text-center text-sm text-muted-foreground v2-dark:bg-card">
          {status === "open" ? "Nada aberto aqui." : "Nenhum item."}
        </p>
      )}
      {visible.map((it) => (
        <ItemCard key={it.id} agentId={agentId} reportId={reportId} item={it} onNavigate={onNavigate} />
      ))}

      {minor.length > 0 && group === "all" && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setMinorOpen((v) => !v)}
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <IconChevronDown className={cn("size-4 transition-transform", minorOpen && "rotate-180")} />
            Outros sinais ({minor.length}) — uma conversa só, gravidade baixa
          </button>
          {minorOpen && minor.map((it) => <ItemCard key={it.id} agentId={agentId} reportId={reportId} item={it} onNavigate={onNavigate} />)}
        </div>
      )}
    </div>
  );
}

function ItemCard({ agentId, reportId, item, onNavigate }: { agentId: string; reportId: string; item: Item; onNavigate: (t: FeedbackTarget) => void }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [draftOpen, setDraftOpen] = React.useState(false);
  const cat = CATEGORY[item.category] ?? CATEGORY.motor;
  const group = GROUPS[cat.group];
  const sev = severityPill(item.severity);
  const go = targetLabel(item.target);

  const setStatus = useMutation({
    mutationFn: (status: Item["status"]) => post(`/api/ai-agents-v2/${agentId}/feedback/items/${item.id}`, { status }, "Erro ao salvar.", "PATCH"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-agents-v2-feedback-report", agentId, reportId] }),
  });
  const draft = useMutation({
    mutationFn: () => post<{ text: string }>(`/api/ai-agents-v2/${agentId}/feedback/items/${item.id}/draft`, {}, "Erro ao gerar o rascunho."),
  });
  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <article className={cn(SURFACE, "relative overflow-hidden before:absolute before:inset-y-0 before:left-0 before:w-1", STRIPE[sev.tone])}>
      <div className="space-y-3 px-5 py-4">
        <div className="flex items-start gap-3">
          <IconChip icon={cat.icon} tone={group.tone} />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Pill tone={sev.tone}>{sev.label}</Pill>
              <Pill tone={group.tone}>{cat.label}</Pill>
              <span className="text-xs text-muted-foreground">
                {item.conversations} {item.conversations === 1 ? "conversa" : "conversas"} · {item.evidenceCount} {item.evidenceCount === 1 ? "evidência" : "evidências"}
              </span>
            </div>
            <h4 className="text-[15px] font-semibold leading-snug">{item.title}</h4>
            {item.summary && <p className="text-[13px] leading-relaxed text-muted-foreground">{item.summary}</p>}
          </div>
        </div>

        {item.recommendation && (item.recommendation.text || item.recommendation.questions.length > 0 || item.recommendation.triggers.length > 0) && (
          <div className="space-y-2 rounded-xl bg-slate-50 p-3.5 v2-dark:bg-muted/40">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              <IconSparkles className="size-3.5 text-orange-500" /> O que fazer
            </p>
            {item.recommendation.text && <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{item.recommendation.text}</p>}
            {item.recommendation.questions.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Perguntas dos clientes que isso precisa responder</p>
                <ul className="ml-4 list-disc space-y-0.5 text-[13px]">
                  {item.recommendation.questions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
            {item.recommendation.triggers.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Palavras sugeridas:</span>
                {item.recommendation.triggers.map((t) => (
                  <Pill key={t} tone="emerald">
                    {t}
                  </Pill>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {go && item.target && (
            <Button size="sm" className="h-8 gap-1.5" onClick={() => onNavigate(item.target!)}>
              {go} <IconArrowRight className="size-3.5" />
            </Button>
          )}
          {DRAFTABLE.has(item.category) && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 bg-white v2-dark:bg-card"
              onClick={() => {
                setDraftOpen(true);
                if (!draft.data) draft.mutate();
              }}
            >
              <IconFilePlus className="size-3.5" /> Gerar rascunho do material
            </Button>
          )}
          {item.recommendation?.text && (
            <Button size="sm" variant="ghost" className="h-8 gap-1 text-muted-foreground" onClick={() => copy(item.recommendation!.text)}>
              <IconCopy className="size-3.5" /> {copied ? "Copiado" : "Copiar texto"}
            </Button>
          )}
          <span className="ml-auto flex gap-1">
            {item.status === "open" ? (
              <>
                <Button size="sm" variant="ghost" className="h-8 gap-1 text-emerald-700 hover:bg-emerald-50 v2-dark:text-emerald-400" disabled={setStatus.isPending} onClick={() => setStatus.mutate("resolved")}>
                  <IconCheck className="size-3.5" /> Resolvido
                </Button>
                <Button size="sm" variant="ghost" className="h-8 text-muted-foreground" disabled={setStatus.isPending} onClick={() => setStatus.mutate("ignored")}>
                  Ignorar
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" className="h-8 text-muted-foreground" disabled={setStatus.isPending} onClick={() => setStatus.mutate("open")}>
                Reabrir
              </Button>
            )}
          </span>
        </div>

        {item.evidences.length > 0 && (
          <div className="border-t border-border/60 pt-2">
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-muted-foreground" onClick={() => setOpen((v) => !v)}>
              <IconMessages className="size-3.5" />
              {open ? "Esconder evidências" : `Ver evidências (${item.evidences.length})`}
              <IconChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
            </Button>
            {open && (
              <div className="mt-2 space-y-3">
                {item.evidences.map((e) => (
                  <EvidenceView key={e.sourceId} e={e} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={draftOpen} onOpenChange={setDraftOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Rascunho do material</DialogTitle>
            <DialogDescription>
              Feito a partir das perguntas e das respostas reais da equipe. Complete os trechos [preencher] antes de adicionar aos materiais.
            </DialogDescription>
          </DialogHeader>
          {draft.isPending && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <IconLoader2 className="size-4 animate-spin" /> Escrevendo o rascunho…
            </p>
          )}
          {draft.isError && <p className="text-sm text-destructive">{(draft.error as Error)?.message}</p>}
          {draft.data && (
            <div className="space-y-3">
              <pre className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-slate-50 p-4 font-sans text-[13px] leading-relaxed v2-dark:bg-muted/40">
                {draft.data.text}
              </pre>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => copy(draft.data!.text)} className="gap-1.5">
                  <IconCopy className="size-4" /> {copied ? "Copiado" : "Copiar"}
                </Button>
                <Button
                  onClick={() => {
                    setDraftOpen(false);
                    onNavigate({ section: "sabe", tab: "materiais" });
                  }}
                  className="gap-1.5"
                >
                  Abrir materiais <IconArrowRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </article>
  );
}

function EvidenceView({ e }: { e: Evidence }) {
  return (
    <div className="space-y-2 rounded-xl border border-border/70 p-3">
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <Pill tone={e.sourceType === "replay_point" ? "violet" : e.sourceType === "test_turn" ? "sky" : "slate"}>{SOURCE_LABEL[e.sourceType]}</Pill>
        <span>{dateTime(e.at)}</span>
        {e.pills.map((p) => (
          <Pill key={p} tone="slate" className="bg-white v2-dark:bg-card">
            {p}
          </Pill>
        ))}
      </div>
      <div className={cn("grid gap-2", e.human ? "md:grid-cols-3" : "md:grid-cols-2")}>
        <Bubble icon={IconUser} title="Cliente" text={e.client} box="border-border/70 bg-slate-50 v2-dark:bg-muted/40" />
        <Bubble icon={IconRobot} title="Agente" text={e.agent} box="border-blue-100 bg-blue-50/60 v2-dark:border-blue-500/20 v2-dark:bg-blue-500/10" />
        {e.human && <Bubble icon={IconUsers} title="Equipe" text={e.human} box="border-emerald-100 bg-emerald-50/60 v2-dark:border-emerald-500/20 v2-dark:bg-emerald-500/10" />}
      </div>
    </div>
  );
}

function Bubble({ icon: Icon, title, text, box }: { icon: React.ComponentType<{ className?: string }>; title: string; text: string; box: string }) {
  return (
    <div className={cn("rounded-lg border p-2.5", box)}>
      <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" /> {title}
      </p>
      <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{text}</p>
    </div>
  );
}

// ─── Cartão do Início ───────────────────────────────────────────────────

export function FeedbackHomeCard({ agentId, onOpen }: { agentId: string; onOpen: () => void }) {
  const reports = useQuery({ queryKey: ["ai-agents-v2-feedback", agentId], queryFn: () => fetchReports(agentId) });
  const latest = (reports.data ?? []).find((r) => r.status === "done");
  const detail = useQuery({
    queryKey: ["ai-agents-v2-feedback-report", agentId, latest?.id],
    queryFn: () => fetchReport(agentId, latest!.id),
    enabled: !!latest,
  });
  const open = (detail.data?.items ?? []).filter((i) => i.status === "open" && !i.minor);
  const serious = open.filter((i) => i.severity >= 4).length;
  const important = open.filter((i) => i.severity === 3).length;
  const other = open.length - serious - important;

  return (
    <section className={cn(SURFACE, "space-y-3 p-5")}>
      <div className="flex items-start gap-3">
        <IconChip icon={IconSparkles} tone="orange" />
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold leading-tight">Feedback do agente</h3>
          <p className="text-[13px] text-muted-foreground">
            {latest ? `Último relatório: ${dateTime(latest.createdAt)}` : "Veja o que falta nos materiais e o que ajustar, a partir das conversas."}
          </p>
        </div>
        <Button size="sm" variant={latest ? "ghost" : "default"} className="gap-1" onClick={onOpen}>
          {latest ? "Ver relatório" : "Gerar relatório"} <IconArrowRight className="size-3.5" />
        </Button>
      </div>
      {latest && detail.data && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {serious > 0 && <Pill tone="rose">{serious} graves</Pill>}
            {important > 0 && <Pill tone="amber">{important} importantes</Pill>}
            {other > 0 && <Pill tone="slate">{other} ajustes</Pill>}
            {open.length === 0 && <Pill tone="emerald">nada aberto</Pill>}
          </div>
          {open.length > 0 && (
            <ul className="space-y-1.5">
              {open.slice(0, 3).map((i) => {
                const cat = CATEGORY[i.category] ?? CATEGORY.motor;
                return (
                  <li key={i.id} className="flex items-center gap-2 text-[13px]">
                    <IconChip icon={cat.icon} tone={GROUPS[cat.group].tone} size="sm" className="size-6 rounded-md [&>svg]:size-3.5" />
                    <span className="min-w-0 flex-1 truncate">{i.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{i.conversations} conv.</span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
