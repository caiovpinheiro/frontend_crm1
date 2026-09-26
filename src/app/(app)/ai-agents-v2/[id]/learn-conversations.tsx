"use client";

/**
 * Aprender com conversas: busca no CRM atendimentos reais sobre um assunto
 * que deram certo e escreve rascunhos de material para a base do agente,
 * com as conversas que sustentam cada passo.
 */

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconDownload,
  IconFilePlus,
  IconHistory,
  IconLoader2,
  IconMessages,
  IconPlayerPlay,
  IconPlayerStop,
  IconSchool,
} from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { MultiSelectPopover } from "@/features/dashboard-v2/components/multi-select-popover";
import { apiFetch, parseApiResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

import { BlockHeader, Pill, SURFACE, Segmented } from "./ui";

type Who = "human" | "agent" | "both";
type Params = { topic: string; days: number; tabulationIds: string[]; who: Who; onlyResolved: boolean };
type Stats = { terms: number; candidates: number; analyzed: number; onTopic: number; success: number };
type Conversation = {
  conversationId: string;
  number: number;
  at: string;
  tabulationName: string | null;
  onTopic: boolean;
  outcome: "resolved" | "unresolved" | "unclear";
  success: boolean;
  ref: number | null;
  confirmation: string | null;
  clientAsked: string;
};
type Doc = { id: string; title: string; content: string; basedOn: number[]; addedDocId: string | null };
type Run = {
  id: string;
  status: "running" | "done" | "error" | "canceled";
  params: Params;
  stats: Stats | null;
  result: { terms: string[]; conversations: Conversation[]; docs: Doc[] } | null;
  total: number;
  done: number;
  costUsd: number;
  error: string | null;
  createdAt: string;
};
type Tabulation = { id: string; name: string; parentName: string | null };

async function send<T>(url: string, body: unknown, fallback: string, method = "POST"): Promise<T> {
  const res = await apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return parseApiResponse<T>(res, fallback);
}

function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const WHO_LABEL: Record<Who, string> = { both: "Equipe e agente", human: "Só a equipe", agent: "Só o agente IA" };

export function LearnFromConversations({
  agentId,
  onDocAdded,
}: {
  agentId: string;
  /** Material criado na base: libera para o agente. */
  onDocAdded: (doc: { id: string; title: string }) => void;
}) {
  const queryClient = useQueryClient();
  const [topic, setTopic] = React.useState("");
  const [days, setDays] = React.useState<"30" | "90" | "180">("90");
  const [who, setWho] = React.useState<Who>("both");
  const [onlyResolved, setOnlyResolved] = React.useState(true);
  const [tabulationIds, setTabulationIds] = React.useState<string[]>([]);
  const [runId, setRunId] = React.useState<string | null>(null);

  const list = useQuery({
    queryKey: ["ai-agents-v2-learn", agentId],
    queryFn: () =>
      apiFetch(`/api/ai-agents-v2/${agentId}/learn`).then((r) =>
        parseApiResponse<{ runs: Run[]; tabulations: Tabulation[] }>(r, "Erro ao carregar as buscas."),
      ),
    refetchInterval: (q) => ((q.state.data?.runs ?? []).some((r) => r.status === "running") ? 4000 : false),
  });
  const start = useMutation({
    mutationFn: () =>
      send<{ runId: string }>(
        `/api/ai-agents-v2/${agentId}/learn`,
        { topic, days: Number(days), who, onlyResolved, tabulationIds },
        "Erro ao iniciar a busca.",
      ),
    onSuccess: (r) => {
      setRunId(r.runId);
      queryClient.invalidateQueries({ queryKey: ["ai-agents-v2-learn", agentId] });
    },
  });

  const runs = list.data?.runs ?? [];
  const tabulations = list.data?.tabulations ?? [];
  const running = runs.find((r) => r.status === "running");
  const currentId = runId ?? runs[0]?.id ?? null;

  return (
    <div className="space-y-4">
      <section className={cn(SURFACE, "space-y-5 p-5 sm:p-6")}>
        <BlockHeader
          icon={IconSchool}
          tone="teal"
          title="Aprender com conversas"
          description="Busca no CRM atendimentos sobre um assunto que deram certo e escreve o material com o caminho que funcionou. Você revisa e adiciona à base."
        />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <label className="space-y-1.5">
            <span className="text-[13px] font-medium">Assunto</span>
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              maxLength={200}
              placeholder="Com as palavras do cliente. Ex.: o processo que você quer documentar"
              onKeyDown={(e) => e.key === "Enter" && topic.trim().length >= 3 && !running && start.mutate()}
            />
          </label>
          <div className="space-y-1.5">
            <span className="block text-[13px] font-medium">Período</span>
            <Segmented
              value={days}
              onChange={setDays}
              options={[
                { value: "30", label: "30 dias" },
                { value: "90", label: "90 dias" },
                { value: "180", label: "180 dias" },
              ]}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <div className="space-y-1.5">
            <span className="block text-[13px] font-medium">Respostas de</span>
            <Segmented
              value={who}
              onChange={setWho}
              options={(Object.keys(WHO_LABEL) as Who[]).map((w) => ({ value: w, label: WHO_LABEL[w] }))}
            />
          </div>
          <div className="min-w-[240px] space-y-1.5">
            <span className="block text-[13px] font-medium">Só com estas tabulações (opcional)</span>
            <MultiSelectPopover
              label={tabulationIds.length ? `${tabulationIds.length} tabulação(ões)` : "Qualquer tabulação"}
              options={tabulations.map((t) => ({ value: t.id, label: t.parentName ? `${t.parentName} › ${t.name}` : t.name }))}
              selected={tabulationIds}
              onChange={setTabulationIds}
              emptyLabel="Nenhuma tabulação cadastrada."
              searchable
            />
          </div>
          <label className="flex h-9 cursor-pointer items-center gap-2.5">
            <Switch checked={onlyResolved} onCheckedChange={setOnlyResolved} aria-label="Só atendimentos encerrados" />
            <span className="text-[13px]">Só atendimentos encerrados</span>
          </label>
        </div>
        <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center v2-dark:bg-muted/40">
          <p className="flex-1 text-[13px] text-muted-foreground">
            Conta como sucesso quando o cliente confirma na conversa que deu certo. Com tabulação escolhida, vale também o atendimento sem
            confirmação, desde que ele não diga que não resolveu. Analisa até 40 conversas.
          </p>
          <Button className="gap-1.5 sm:ml-auto" disabled={start.isPending || !!running || topic.trim().length < 3} onClick={() => start.mutate()}>
            {start.isPending ? <IconLoader2 className="size-4 animate-spin" /> : <IconPlayerPlay className="size-4" />}
            Buscar conversas
          </Button>
        </div>
        {start.isError && <p className="text-sm text-destructive">{(start.error as Error)?.message}</p>}
      </section>

      {runs.length > 1 && <RunHistory runs={runs} currentId={currentId} onSelect={setRunId} />}
      {list.isLoading && <Skeleton className="h-40 rounded-2xl" />}
      {currentId && <RunDetail agentId={agentId} runId={currentId} onDocAdded={onDocAdded} />}
    </div>
  );
}

function RunHistory({ runs, currentId, onSelect }: { runs: Run[]; currentId: string | null; onSelect: (id: string) => void }) {
  return (
    <section className={cn(SURFACE, "overflow-hidden")}>
      <div className="flex items-center gap-2 border-b border-border/70 px-5 py-3">
        <IconHistory className="size-4 text-muted-foreground" />
        <h4 className="text-[13px] font-semibold">Buscas</h4>
      </div>
      <ul className="divide-y divide-border/60">
        {runs.slice(0, 6).map((r) => (
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
                <p className="truncate text-[13px] font-medium">{r.params.topic}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {dateTime(r.createdAt)} · últimos {r.params.days} dias · {WHO_LABEL[r.params.who].toLowerCase()}
                </p>
              </div>
              {r.status === "running" && <Pill tone="sky">buscando</Pill>}
              {r.status === "error" && <Pill tone="rose">parou</Pill>}
              {r.status === "canceled" && <Pill tone="slate">interrompida</Pill>}
              {r.status === "done" && r.stats && <Pill tone="teal">{r.stats.success} com sucesso</Pill>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RunDetail({ agentId, runId, onDocAdded }: { agentId: string; runId: string; onDocAdded: (doc: { id: string; title: string }) => void }) {
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ["ai-agents-v2-learn-run", agentId, runId],
    queryFn: () =>
      apiFetch(`/api/ai-agents-v2/${agentId}/learn/${runId}`).then((r) => parseApiResponse<{ run: Run }>(r, "Erro ao carregar a busca.")),
    refetchInterval: (query) => (query.state.data?.run.status === "running" ? 3000 : false),
  });
  const cancel = useMutation({
    mutationFn: () => send(`/api/ai-agents-v2/${agentId}/learn/${runId}`, {}, "Erro ao cancelar.", "DELETE"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-agents-v2-learn", agentId] }),
  });

  const run = q.data?.run;
  if (q.isLoading || !run) return <Skeleton className="h-40 rounded-2xl" />;
  if (run.status === "running") {
    const pct = run.total > 0 ? Math.round((run.done / run.total) * 100) : 0;
    return (
      <section className={cn(SURFACE, "space-y-3 p-5")}>
        <div className="flex items-center gap-3">
          <IconLoader2 className="size-4 animate-spin text-primary" />
          <p className="flex-1 text-sm">
            {run.total === 0
              ? "Procurando conversas sobre o assunto…"
              : `Lendo as conversas: ${run.done} de ${run.total}${run.stats ? ` · ${run.stats.onTopic} no assunto` : ""}`}
          </p>
          <Button variant="outline" size="sm" className="gap-1.5" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
            <IconPlayerStop className="size-3.5" />
            Parar
          </Button>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 v2-dark:bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      </section>
    );
  }
  if (run.status === "error" || run.status === "canceled") {
    return (
      <section className={cn(SURFACE, "p-5 text-sm text-muted-foreground")}>
        {run.status === "canceled" ? "Busca interrompida." : (run.error ?? "A busca falhou.")}
      </section>
    );
  }

  const result = run.result;
  const stats = run.stats;
  const successes = (result?.conversations ?? []).filter((c) => c.success).sort((a, b) => (a.ref ?? 0) - (b.ref ?? 0));
  const byRef = new Map(successes.map((c) => [c.ref!, c]));

  return (
    <div className="space-y-4">
      <section className={cn(SURFACE, "flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 text-[13px]")}>
        <span>
          <b className="tabular-nums">{stats?.candidates ?? 0}</b> conversas citam o assunto
        </span>
        <span>
          <b className="tabular-nums">{stats?.analyzed ?? 0}</b> lidas
        </span>
        <span>
          <b className="tabular-nums">{stats?.onTopic ?? 0}</b> eram mesmo sobre ele
        </span>
        <span className="font-semibold text-teal-700 v2-dark:text-teal-300">
          <b className="tabular-nums">{stats?.success ?? 0}</b> deram certo
        </span>
        <span className="ml-auto text-xs text-muted-foreground">US$ {run.costUsd.toFixed(2)}</span>
      </section>

      {(result?.docs.length ?? 0) === 0 ? (
        <section className={cn(SURFACE, "p-5 text-sm text-muted-foreground")}>
          {stats?.candidates === 0
            ? "Nenhuma conversa no período cita o assunto. Tente outras palavras ou um período maior."
            : "Nenhum atendimento com sucesso comprovado para escrever o material. Tente escolher as tabulações que indicam atendimento resolvido."}
        </section>
      ) : (
        result!.docs.map((d) => (
          <DocDraft key={d.id} agentId={agentId} runId={run.id} doc={d} sources={d.basedOn.map((n) => byRef.get(n)).filter(Boolean) as Conversation[]} onDocAdded={onDocAdded} />
        ))
      )}

      {(result?.conversations.length ?? 0) > 0 && <ConversationList conversations={result!.conversations} />}
    </div>
  );
}

function DocDraft({
  agentId,
  runId,
  doc,
  sources,
  onDocAdded,
}: {
  agentId: string;
  runId: string;
  doc: Doc;
  sources: Conversation[];
  onDocAdded: (doc: { id: string; title: string }) => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = React.useState(doc.title);
  const [content, setContent] = React.useState(doc.content);
  const [copied, setCopied] = React.useState(false);
  const add = useMutation({
    mutationFn: async () => {
      const created = await send<{ id: string; title: string }>(`/api/ai-agents/${agentId}/knowledge`, { title, content }, "Erro ao salvar o material.");
      await send(`/api/ai-agents-v2/${agentId}/learn/${runId}`, { docId: doc.id, knowledgeDocId: created.id }, "Erro ao salvar.", "PATCH").catch(() => undefined);
      return created;
    },
    onSuccess: (created) => {
      onDocAdded(created);
      queryClient.invalidateQueries({ queryKey: ["ai-agents-v2-learn-run", agentId, runId] });
    },
  });
  const added = !!doc.addedDocId || add.isSuccess;
  const download = () => {
    const blob = new Blob([`${title}\n\n${content}\n`], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[\\/:*?"<>|]+/g, " ").trim() || "material"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className={cn(SURFACE, "space-y-3 p-5 sm:p-6")}>
      <div className="flex flex-wrap items-start gap-3">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-9 min-w-0 flex-1 text-[15px] font-semibold" aria-label="Título do material" />
        <Pill tone={sources.length >= 2 ? "teal" : "amber"}>
          baseado em {sources.length} atendimento{sources.length === 1 ? "" : "s"}
        </Pill>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={Math.min(24, Math.max(8, content.split("\n").length + 1))}
        aria-label="Conteúdo do material"
        className="w-full resize-y rounded-xl border bg-background px-3.5 py-3 text-[13.5px] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      />
      <p className="text-xs text-muted-foreground">
        Passos marcados com “(confirmar)” apareceram em um só atendimento; “[confirmar]” substitui número ou nome que não estava nas conversas.
      </p>
      {sources.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sources.map((c) => (
            <a
              key={c.conversationId}
              href={`/inbox?c=${encodeURIComponent(String(c.number))}`}
              target="_blank"
              rel="noreferrer"
              title={c.confirmation ? `Cliente: “${c.confirmation}”` : undefined}
              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <IconMessages className="size-3" />#{c.number}
            </a>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button className="gap-1.5" disabled={added || add.isPending || !title.trim() || content.trim().length < 20} onClick={() => add.mutate()}>
          {add.isPending ? <IconLoader2 className="size-4 animate-spin" /> : added ? <IconCheck className="size-4" /> : <IconFilePlus className="size-4" />}
          {added ? "Na base do agente" : "Adicionar à base do agente"}
        </Button>
        <Button variant="outline" className="gap-1.5" onClick={download}>
          <IconDownload className="size-4" />
          Baixar
        </Button>
        <Button
          variant="ghost"
          className="gap-1.5"
          onClick={() => {
            void navigator.clipboard.writeText(`${title}\n\n${content}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <IconCheck className="size-4" /> : <IconCopy className="size-4" />}
          {copied ? "Copiado" : "Copiar"}
        </Button>
        {add.isError && <p className="text-sm text-destructive">{(add.error as Error)?.message}</p>}
      </div>
    </section>
  );
}

const OUTCOME: Record<Conversation["outcome"], { label: string; tone: "teal" | "rose" | "slate" }> = {
  resolved: { label: "deu certo", tone: "teal" },
  unresolved: { label: "não resolveu", tone: "rose" },
  unclear: { label: "sem confirmação", tone: "slate" },
};

function ConversationList({ conversations }: { conversations: Conversation[] }) {
  const [open, setOpen] = React.useState(false);
  const shown = [...conversations].sort((a, b) => Number(b.success) - Number(a.success) || Number(b.onTopic) - Number(a.onTopic));
  return (
    <section className={cn(SURFACE, "overflow-hidden")}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-5 py-3 text-left">
        <IconMessages className="size-4 text-muted-foreground" />
        <h4 className="flex-1 text-[13px] font-semibold">Conversas lidas ({conversations.length})</h4>
        <IconChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="divide-y divide-border/60 border-t border-border/70">
          {shown.map((c) => (
            <li key={c.conversationId} className="flex flex-col gap-1 px-5 py-2.5 sm:flex-row sm:items-center sm:gap-4">
              <a
                href={`/inbox?c=${encodeURIComponent(String(c.number))}`}
                target="_blank"
                rel="noreferrer"
                className="w-16 shrink-0 text-[13px] font-medium text-primary hover:underline"
              >
                #{c.number}
              </a>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px]">{c.clientAsked || "—"}</p>
                {c.confirmation && <p className="truncate text-xs text-muted-foreground">Cliente: “{c.confirmation}”</p>}
              </div>
              <span className="text-xs text-muted-foreground">{c.tabulationName ?? ""}</span>
              {c.onTopic ? <Pill tone={OUTCOME[c.outcome].tone}>{OUTCOME[c.outcome].label}</Pill> : <Pill tone="slate">outro assunto</Pill>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
