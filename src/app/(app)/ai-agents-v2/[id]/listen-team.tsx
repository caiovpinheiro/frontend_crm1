"use client";

/**
 * "Escutar a equipe": liga a leitura dos atendimentos de uma origem
 * acadêmica, de pessoas da equipe, ou das duas, por um período. O agente não muda o atendimento enquanto escuta;
 * monta propostas de conhecimento (material), abordagem (regras) e tom de
 * voz, que quem configura adiciona ao rascunho ou recusa.
 */

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  IconArrowBackUp,
  IconBook,
  IconCheck,
  IconEar,
  IconLoader2,
  IconMessageCircle,
  IconPlayerPause,
  IconPlayerPlay,
  IconPower,
  IconRefresh,
  IconRoute,
  IconX,
} from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MultiSelectPopover } from "@/features/dashboard-v2/components/multi-select-popover";
import { apiFetch, parseApiResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

import { BlockHeader, IconChip, Pill, SURFACE, Segmented, type Tone } from "./ui";

type Status = "on" | "paused" | "expired" | "off";
type Kind = "knowledge" | "approach" | "tone";
type Change = { path: string; op: "set" | "add" | "remove"; value?: unknown; before?: unknown };

type Session = {
  id: string;
  status: Status;
  people: Array<{ id: string; name: string }>;
  origins?: Array<{ id: string; name: string; pipelineName: string }>;
  mode: "today" | "days" | "range" | "continuous";
  endsAt: string | null;
  maxUsdPerDay: number;
  lastSweepAt: string | null;
  stats: { conversations?: number; samples?: number; skipped?: number; covered?: number; capHit?: boolean };
  costUsd: number;
  costTodayUsd: number;
};

type Proposal = {
  id: string;
  kind: Kind;
  title: string;
  summary: string;
  occurrences: number;
  sampleCount: number;
  evidence: Array<{ conversationNumber: number | null; quote: string }>;
  payload: { title?: string; content?: string; confirm?: boolean; alteracoes?: Change[] };
  status: "open" | "applied" | "refused" | "stale";
  error: string | null;
};

type Run = { id: string; status: "running" | "done" | "error"; total: number; done: number; error: string | null; createdAt: string };

type State = { session: Session | null; runs: Run[]; proposals: Proposal[] };

type Period = "today" | "7" | "30" | "continuous";

const STATUS: Record<Status, { label: string; tone: Tone }> = {
  on: { label: "Escutando", tone: "emerald" },
  paused: { label: "Pausada", tone: "amber" },
  expired: { label: "Encerrou", tone: "slate" },
  off: { label: "Desligada", tone: "slate" },
};

const KIND: Record<Kind, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  knowledge: { label: "Conhecimento", icon: IconBook },
  approach: { label: "Abordagem", icon: IconRoute },
  tone: { label: "Tom de voz", icon: IconMessageCircle },
};

const OP_LABEL: Record<Change["op"], string> = { set: "trocar", add: "acrescentar", remove: "tirar" };
const VALUE_LABEL: Record<string, Record<string, string>> = {
  emojis: { none: "sem emojis", light: "poucos emojis", moderate: "emojis moderados" },
  responseLength: { short: "curtas", medium: "médias", long: "longas" },
  bold: { auto: "automático", key: "destacar palavras-chave", off: "sem negrito" },
};
const valueLabel = (path: string, v: unknown) => (typeof v === "string" ? VALUE_LABEL[path]?.[v] ?? v : v);
const PATH_LABEL: Record<string, string> = { tone: "Tom de voz", responseLength: "Tamanho das respostas", emojis: "Emojis", bold: "Negrito", globalRules: "Regras gerais" };

async function send<T>(url: string, body: unknown, fallback: string, method = "POST"): Promise<T> {
  const res = await apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return parseApiResponse<T>(res, fallback);
}

const fetchState = async (agentId: string) =>
  parseApiResponse<State>(await apiFetch(`/api/ai-agents-v2/${agentId}/listen`), "Erro ao carregar a escuta.");

function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function until(s: Session): string {
  if (!s.endsAt) return "até você desligar";
  const end = new Date(s.endsAt);
  const sameDay = end.toDateString() === new Date().toDateString();
  return sameDay ? `até hoje ${end.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : `até ${dateTime(s.endsAt)}`;
}

const usd = (n: number) => `US$ ${n.toFixed(2).replace(".", ",")}`;

function show(v: unknown): string {
  if (v === undefined || v === null || v === "") return "(vazio)";
  const plainList = Array.isArray(v) && v.every((x) => typeof x === "string" || typeof x === "number");
  const s = typeof v === "string" ? v : plainList ? (v as unknown[]).map((x) => `• ${x}`).join("\n") : JSON.stringify(v, null, 1);
  return s.length > 900 ? `${s.slice(0, 900)}…` : s;
}

function pathLabel(path: string, themeName: (id: string) => string | undefined): string {
  const theme = /^themes\[id=([^\]]+)\]\.instructions$/.exec(path);
  if (theme) return `Instruções do assunto “${themeName(theme[1]) ?? theme[1]}”`;
  return PATH_LABEL[path] ?? path;
}

// ─── Aba ────────────────────────────────────────────────────────────────

export function ListenTeam({
  agentId,
  users,
  pipelines,
  themes,
  dirty,
  saving,
  onDocAdded,
  onConfigApplied,
}: {
  agentId: string;
  users: Array<{ id: string; name: string }>;
  pipelines: Array<{ id: string; name: string; stages: Array<{ id: string; name: string }> }>;
  themes: Array<{ id: string; name: string }>;
  /** Alterações na tela ainda não salvas: aplicar no rascunho espera. */
  dirty: boolean;
  saving: boolean;
  onDocAdded: (doc: { id: string; title: string }) => void;
  onConfigApplied: () => void;
}) {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const state = useQuery({
    queryKey: ["ai-agents-v2-listen", agentId],
    queryFn: () => fetchState(agentId),
    refetchInterval: (q) => (q.state.data?.runs.some((r) => r.status === "running") ? 4000 : q.state.data?.session?.status === "on" ? 60_000 : false),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["ai-agents-v2-listen", agentId] });
  const session = state.data?.session ?? null;
  const active = session && (session.status === "on" || session.status === "paused") ? session : null;
  const running = state.data?.runs.find((r) => r.status === "running");
  const lastRun = state.data?.runs[0];

  const control = useMutation({
    mutationFn: (body: Record<string, unknown>) => send(`/api/ai-agents-v2/${agentId}/listen/${active!.id}`, body, "Erro ao atualizar a escuta.", "PATCH"),
    onSuccess: refresh,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao atualizar a escuta."),
  });
  const sweep = useMutation({
    mutationFn: () => send(`/api/ai-agents-v2/${agentId}/listen/${active!.id}/sweep`, {}, "Erro ao ler agora."),
    onSuccess: () => {
      toast.success("Lendo os atendimentos prontos…");
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao ler agora."),
  });

  const turnOff = async () => {
    const ok = await confirm({
      title: "Desligar a escuta?",
      description: "O agente para de ler os atendimentos. As propostas que já apareceram continuam aqui.",
      confirmLabel: "Desligar",
      destructive: true,
    });
    if (ok) control.mutate({ action: "off" });
  };

  if (state.isLoading) return <Skeleton className="h-64 w-full rounded-2xl" />;
  if (state.error) return <div className={cn(SURFACE, "p-5 text-sm text-destructive")}>Erro ao carregar a escuta.</div>;

  const proposals = state.data?.proposals ?? [];

  return (
    <div className="space-y-4">
      {dialog}
      {active ? (
        <section className={cn(SURFACE, "space-y-4 p-5 sm:p-6")}>
          <div className="flex flex-wrap items-start gap-3">
            <IconChip icon={IconEar} tone="teal" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[15px] font-semibold leading-tight">
                  {[
                    active.origins?.length ? active.origins.map((o) => o.name).join(", ") : "",
                    active.people.map((p) => p.name).join(", "),
                  ].filter(Boolean).join(" · ") || "Equipe"}
                </h3>
                <Pill tone={STATUS[active.status].tone}>{STATUS[active.status].label}</Pill>
                {active.stats.capHit && <Pill tone="amber">limite do dia atingido</Pill>}
              </div>
              <p className="text-[13px] text-muted-foreground">
                {until(active)} · lê os atendimentos depois que encerram ou ficam 1 h sem mensagens
              </p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Stat label="Atendimentos lidos" value={String(active.stats.samples ?? 0)} hint={active.stats.skipped ? `${active.stats.skipped} pulados` : undefined} />
            <Stat label="Propostas abertas" value={String(proposals.filter((p) => p.status === "open").length)} />
            <Stat label="Custo hoje" value={usd(active.costTodayUsd)} hint={`limite ${usd(active.maxUsdPerDay)}`} />
            <Stat label="Última leitura" value={active.lastSweepAt ? dateTime(active.lastSweepAt) : "ainda não"} />
          </dl>
          {running && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <IconLoader2 className="size-4 animate-spin" /> Lendo {running.done} de {running.total} atendimento(s)…
            </p>
          )}
          {!running && lastRun?.status === "error" && <p className="text-sm text-rose-600 v2-dark:text-rose-300">{lastRun.error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" disabled={!!running || sweep.isPending || active.status !== "on"} onClick={() => sweep.mutate()}>
              <IconRefresh className="size-4" /> Ler agora
            </Button>
            {active.status === "on" ? (
              <Button size="sm" variant="outline" className="gap-1.5" disabled={control.isPending} onClick={() => control.mutate({ action: "pause" })}>
                <IconPlayerPause className="size-4" /> Pausar
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="gap-1.5" disabled={control.isPending} onClick={() => control.mutate({ action: "resume" })}>
                <IconPlayerPlay className="size-4" /> Retomar
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={control.isPending} onClick={() => control.mutate({ action: "extend", mode: "days", days: 7 })}>
              Estender 7 dias
            </Button>
            <Button size="sm" variant="ghost" className="gap-1.5 text-rose-600 hover:text-rose-700" disabled={control.isPending} onClick={() => void turnOff()}>
              <IconPower className="size-4" /> Desligar
            </Button>
          </div>
        </section>
      ) : (
        <StartListening agentId={agentId} users={users} pipelines={pipelines} previous={session} onStarted={refresh} />
      )}

      <Proposals
        agentId={agentId}
        proposals={proposals}
        themes={themes}
        blockApply={dirty || saving}
        onDocAdded={onDocAdded}
        onConfigApplied={onConfigApplied}
        onChanged={refresh}
        listening={!!active}
      />
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2 v2-dark:bg-muted/40">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="text-[15px] font-semibold tabular-nums">{value}</dd>
      {hint && <dd className="text-[11px] text-muted-foreground">{hint}</dd>}
    </div>
  );
}

// ─── Ligar ──────────────────────────────────────────────────────────────

function StartListening({
  agentId,
  users,
  pipelines,
  previous,
  onStarted,
}: {
  agentId: string;
  users: Array<{ id: string; name: string }>;
  pipelines: Array<{ id: string; name: string; stages: Array<{ id: string; name: string }> }>;
  previous: Session | null;
  onStarted: () => void;
}) {
  const [people, setPeople] = React.useState<string[]>([]);
  const [origins, setOrigins] = React.useState<string[]>([]);
  const [period, setPeriod] = React.useState<Period>("today");
  const [limit, setLimit] = React.useState("1");
  const originOptions = pipelines
    .filter((p) => !/atendimento/i.test(p.name))
    .flatMap((p) =>
      p.stages
        .filter((s) => !/^(ganho|perdido)$/i.test(s.name))
        .map((s) => ({ value: s.id, label: `${p.name} · ${s.name}` })),
    );
  const estimate = useQuery({
    queryKey: ["ai-agents-v2-listen-estimate", agentId, people, origins],
    queryFn: () =>
      send<{ conversationsPerDay: number; usdPerDay: number }>(
        `/api/ai-agents-v2/${agentId}/listen/estimate`,
        { userIds: people, originStageIds: origins },
        "Erro ao estimar.",
      ),
    enabled: people.length > 0 || origins.length > 0,
    staleTime: 60_000,
  });
  const start = useMutation({
    mutationFn: () =>
      send(`/api/ai-agents-v2/${agentId}/listen`, {
        userIds: people,
        originStageIds: origins,
        mode: period === "today" ? "today" : period === "continuous" ? "continuous" : "days",
        days: period === "7" ? 7 : period === "30" ? 30 : undefined,
        maxUsdPerDay: Number(limit.replace(",", ".")) || 1,
      }, "Erro ao ligar a escuta."),
    onSuccess: () => {
      toast.success("Escuta ligada. Os atendimentos entram depois que encerram ou ficam 1 h sem mensagens.");
      onStarted();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao ligar a escuta."),
  });
  const names = users.filter((u) => people.includes(u.id)).map((u) => u.name);
  const originNames = originOptions.filter((o) => origins.includes(o.value)).map((o) => o.label);
  const ready = people.length > 0 || origins.length > 0;

  return (
    <section className={cn(SURFACE, "space-y-4 p-5 sm:p-6")}>
      <BlockHeader
        icon={IconEar}
        tone="teal"
        title="Escutar a equipe"
        description="Escolha a origem do aluno, as pessoas da equipe, ou as duas. Ele lê esses atendimentos e propõe conhecimento, jeito de conduzir e tom de voz — você decide o que entra no rascunho."
      />
      {previous && (
        <p className="text-xs text-muted-foreground">
          Última escuta: {[
            previous.origins?.length ? previous.origins.map((o) => o.name).join(", ") : "",
            previous.people.map((p) => p.name).join(", "),
          ].filter(Boolean).join(" · ") || "sem filtro"} · {STATUS[previous.status].label.toLowerCase()} · {previous.stats.samples ?? 0} atendimento(s) lido(s)
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Origem</span>
          <MultiSelectPopover
            label={originNames.length ? originNames.join(", ") : "Etapa de onde veio"}
            options={originOptions}
            selected={origins}
            onChange={setOrigins}
            emptyLabel="Nenhuma etapa fora do funil Atendimento."
            searchable
          />
        </div>
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Quem</span>
          <MultiSelectPopover
            label={names.length ? names.join(", ") : "Qualquer consultor"}
            options={users.map((u) => ({ value: u.id, label: u.name }))}
            selected={people}
            onChange={setPeople}
            emptyLabel="Nenhuma pessoa na equipe."
            searchable
          />
        </div>
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Por quanto tempo</span>
          <Segmented
            size="sm"
            value={period}
            onChange={setPeriod}
            options={[
              { value: "today", label: "Hoje" },
              { value: "7", label: "7 dias" },
              { value: "30", label: "30 dias" },
              { value: "continuous", label: "Até eu desligar" },
            ]}
          />
        </div>
        <label className="space-y-1">
          <span className="block text-xs font-medium text-muted-foreground">Limite por dia (US$)</span>
          <Input value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="decimal" className="h-9 w-24" />
        </label>
      </div>
      {ready && (
        <p className="text-xs text-muted-foreground">
          {estimate.isLoading
            ? "Calculando…"
            : estimate.data
              ? estimate.data.conversationsPerDay > 0
                ? `Pelos últimos 7 dias: ~${String(estimate.data.conversationsPerDay).replace(".", ",")} atendimento(s) por dia · ≈ ${usd(estimate.data.usdPerDay)} por dia`
                : "Nada nesse recorte nos últimos 7 dias: a escuta pode demorar a ter o que ler."
              : ""}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        A origem é a etapa de onde o aluno veio antes de entrar em atendimento. Vale mesmo com o card em Em Atendimento. Nada muda no atendimento enquanto escuta. Dados de clientes são mascarados antes de ir ao modelo.
      </p>
      <Button className="gap-1.5" disabled={!ready || start.isPending} onClick={() => start.mutate()}>
        {start.isPending ? <IconLoader2 className="size-4 animate-spin" /> : <IconEar className="size-4" />} Começar a escutar
      </Button>
    </section>
  );
}

// ─── Propostas ──────────────────────────────────────────────────────────

type ProposalTab = Kind | "decided";

function Proposals({
  agentId,
  proposals,
  themes,
  blockApply,
  onDocAdded,
  onConfigApplied,
  onChanged,
  listening,
}: {
  agentId: string;
  proposals: Proposal[];
  themes: Array<{ id: string; name: string }>;
  blockApply: boolean;
  onDocAdded: (doc: { id: string; title: string }) => void;
  onConfigApplied: () => void;
  onChanged: () => void;
  listening: boolean;
}) {
  const [tab, setTab] = React.useState<ProposalTab>("knowledge");
  const open = proposals.filter((p) => p.status === "open");
  const decided = proposals.filter((p) => p.status === "applied" || p.status === "refused");
  const list = tab === "decided" ? decided : open.filter((p) => p.kind === tab);
  const themeName = (id: string) => themes.find((t) => t.id === id)?.name;
  if (proposals.length === 0) {
    return listening ? (
      <p className={cn(SURFACE, "p-5 text-sm text-muted-foreground")}>
        Ainda nada: os atendimentos entram depois de encerrar ou ficar 1 h sem mensagens. Um jeito de atender só vira proposta quando aparece em pelo menos 3 atendimentos.
      </p>
    ) : null;
  }
  return (
    <section className="space-y-3">
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          ...(["knowledge", "approach", "tone"] as Kind[]).map((k) => ({ value: k, label: KIND[k].label, count: open.filter((p) => p.kind === k).length })),
          { value: "decided" as const, label: "Decididas", count: decided.length },
        ]}
      />
      {list.length === 0 && <p className="text-sm text-muted-foreground">{tab === "decided" ? "Nada decidido ainda." : "Nenhuma proposta aberta deste tipo."}</p>}
      {list.map((p) =>
        p.kind === "knowledge" && p.status === "open" ? (
          <KnowledgeCard key={p.id} agentId={agentId} p={p} onDocAdded={onDocAdded} onChanged={onChanged} />
        ) : (
          <ConfigCard key={p.id} agentId={agentId} p={p} themeName={themeName} blockApply={blockApply} onConfigApplied={onConfigApplied} onChanged={onChanged} />
        ),
      )}
    </section>
  );
}

function Evidence({ p }: { p: Proposal }) {
  if (p.evidence.length === 0) return null;
  return (
    <ul className="space-y-1">
      {p.evidence.slice(0, 3).map((e, i) => (
        <li key={i} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-muted-foreground v2-dark:bg-muted/40">
          “{e.quote}”{e.conversationNumber ? <span className="ml-1 text-[11px]">· atendimento #{e.conversationNumber}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function useRefuse(agentId: string, p: Proposal, onChanged: () => void) {
  return useMutation({
    mutationFn: (refused: boolean) => send(`/api/ai-agents-v2/${agentId}/listen/proposals/${p.id}/refuse`, { refused }, "Erro ao recusar."),
    onSuccess: onChanged,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao recusar."),
  });
}

function KnowledgeCard({ agentId, p, onDocAdded, onChanged }: { agentId: string; p: Proposal; onDocAdded: (doc: { id: string; title: string }) => void; onChanged: () => void }) {
  const [title, setTitle] = React.useState(p.payload.title ?? p.title);
  const [content, setContent] = React.useState(p.payload.content ?? p.summary);
  const refuse = useRefuse(agentId, p, onChanged);
  const add = useMutation({
    mutationFn: async () => {
      const created = await send<{ id: string; title: string }>(`/api/ai-agents/${agentId}/knowledge`, { title, content }, "Erro ao salvar o material.");
      await send(`/api/ai-agents-v2/${agentId}/listen/proposals/${p.id}/apply`, { knowledgeDocId: created.id }, "Erro ao registrar.");
      return created;
    },
    onSuccess: (created) => {
      toast.success("Material adicionado à base e liberado no rascunho.");
      onDocAdded(created);
      onChanged();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar o material."),
  });
  return (
    <article className={cn(SURFACE, "space-y-3 p-5")}>
      <div className="flex flex-wrap items-center gap-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-9 min-w-0 flex-1 text-[15px] font-semibold" aria-label="Título do material" />
        <Pill tone="teal">em {p.occurrences} atendimento{p.occurrences === 1 ? "" : "s"}</Pill>
        {p.payload.confirm && <Pill tone="amber">confirmar os passos</Pill>}
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={Math.min(18, Math.max(6, content.split("\n").length + 1))}
        aria-label="Conteúdo do material"
        className="w-full resize-y rounded-xl border bg-background px-3.5 py-3 text-[13.5px] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      />
      <Evidence p={p} />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className="gap-1.5" disabled={add.isPending || !title.trim() || content.trim().length < 20} onClick={() => add.mutate()}>
          {add.isPending ? <IconLoader2 className="size-4 animate-spin" /> : <IconCheck className="size-4" />} Adicionar à base
        </Button>
        <Button size="sm" variant="ghost" className="gap-1" disabled={refuse.isPending} onClick={() => refuse.mutate(true)}>
          <IconX className="size-4" /> Recusar
        </Button>
        <span className="text-xs text-muted-foreground">Revise antes: o texto vem do que a equipe respondeu. “[confirmar]” marca o que não dá para garantir.</span>
      </div>
    </article>
  );
}

function ConfigCard({
  agentId,
  p,
  themeName,
  blockApply,
  onConfigApplied,
  onChanged,
}: {
  agentId: string;
  p: Proposal;
  themeName: (id: string) => string | undefined;
  blockApply: boolean;
  onConfigApplied: () => void;
  onChanged: () => void;
}) {
  const refuse = useRefuse(agentId, p, onChanged);
  const apply = useMutation({
    mutationFn: () => send<{ applied: boolean; error?: string }>(`/api/ai-agents-v2/${agentId}/listen/proposals/${p.id}/apply`, {}, "Erro ao aplicar."),
    onSuccess: (r) => {
      if (r.applied) {
        toast.success("Aplicado no rascunho. Teste e publique para valer.");
        onConfigApplied();
      } else toast.error(r.error ?? "Não foi possível aplicar.");
      onChanged();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao aplicar."),
  });
  const Icon = KIND[p.kind].icon;
  return (
    <article className={cn(SURFACE, "space-y-3 p-5", p.status === "refused" && "opacity-70")}>
      <div className="flex flex-wrap items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <h4 className="text-sm font-semibold">{p.title}</h4>
        <Pill tone="teal">em {p.occurrences} de {p.sampleCount} atendimentos</Pill>
        {p.status === "applied" && <Pill tone="emerald" icon={IconCheck}>no rascunho</Pill>}
        {p.status === "refused" && <Pill tone="slate">recusada</Pill>}
      </div>
      {p.kind !== "tone" && p.summary && <p className="text-[13px]">{p.summary}</p>}
      {(p.payload.alteracoes ?? []).map((a, i) => (
        <div key={i} className="space-y-1 rounded-lg bg-slate-50 p-2 text-xs v2-dark:bg-muted/40">
          <p className="font-medium">
            {pathLabel(a.path, themeName)} <span className="font-normal text-muted-foreground">· {OP_LABEL[a.op]}</span>
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-rose-50 p-1.5 text-[11px] v2-dark:bg-rose-500/10">{show(valueLabel(a.path, a.before))}</pre>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-emerald-50 p-1.5 text-[11px] v2-dark:bg-emerald-500/10">
              {`${a.op === "add" ? "+ " : ""}${show(valueLabel(a.path, a.value))}`}
            </pre>
          </div>
        </div>
      ))}
      <Evidence p={p} />
      <div className="flex flex-wrap items-center gap-2">
        {p.status === "open" && (
          <>
            <Button size="sm" className="gap-1.5" disabled={apply.isPending || blockApply} onClick={() => apply.mutate()}>
              {apply.isPending ? <IconLoader2 className="size-4 animate-spin" /> : <IconCheck className="size-4" />} Aplicar no rascunho
            </Button>
            <Button size="sm" variant="ghost" className="gap-1" disabled={refuse.isPending} onClick={() => refuse.mutate(true)}>
              <IconX className="size-4" /> Recusar
            </Button>
            {blockApply && <span className="text-xs text-muted-foreground">Aguarde salvar as alterações da tela.</span>}
          </>
        )}
        {p.status === "refused" && (
          <Button size="sm" variant="ghost" className="gap-1" disabled={refuse.isPending} onClick={() => refuse.mutate(false)}>
            <IconArrowBackUp className="size-4" /> Desfazer recusa
          </Button>
        )}
      </div>
    </article>
  );
}

// ─── Card do Início ─────────────────────────────────────────────────────

export function ListenHomeCard({ agentId, onOpen }: { agentId: string; onOpen: () => void }) {
  const state = useQuery({ queryKey: ["ai-agents-v2-listen", agentId], queryFn: () => fetchState(agentId) });
  const s = state.data?.session;
  const open = (state.data?.proposals ?? []).filter((p) => p.status === "open").length;
  const active = s && (s.status === "on" || s.status === "paused");
  // Sempre visível: escondido sem escuta ativa, ninguém achava a opção (fica
  // na 6ª aba de "O que ele sabe").
  const idle = !active && open === 0;
  return (
    <section className={cn(SURFACE, "flex flex-wrap items-center gap-3 p-5")}>
      <IconChip icon={IconEar} tone="teal" />
      <div className="min-w-0 flex-1">
        <h3 className="text-[15px] font-semibold leading-tight">Escutar a equipe</h3>
        <p className="text-[13px] text-muted-foreground">
          {idle
            ? "O agente acompanha atendimentos reais pela origem do aluno ou pelas pessoas da equipe, e propõe materiais, jeito de conduzir e tom de voz. Você decide o que entra."
            : active
              ? `${STATUS[s!.status].label} ${[
                  s!.origins?.length ? s!.origins.map((o) => o.name).join(", ") : "",
                  s!.people.map((p) => p.name).join(", "),
                ].filter(Boolean).join(" · ") || "qualquer consultor"} · ${until(s!)}`
              : "Escuta encerrada"}
          {open > 0 ? ` · ${open} proposta${open === 1 ? "" : "s"} para decidir` : ""}
        </p>
      </div>
      <Button size="sm" variant={idle ? "outline" : "ghost"} onClick={onOpen}>
        {idle ? "Configurar escuta" : "Ver"}
      </Button>
    </section>
  );
}
