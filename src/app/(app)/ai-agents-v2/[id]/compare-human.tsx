"use client";

/**
 * Comparar com humano: reproduz conversas reais atendidas por pessoas e
 * mostra, ponto a ponto, o que o agente responderia no lugar — com o placar
 * por assunto e a causa de cada diferença (material, comportamento,
 * integração, mídia). Nada é enviado ao cliente.
 */

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconAlertTriangle,
  IconBook,
  IconChevronDown,
  IconChevronUp,
  IconCopy,
  IconLoader2,
  IconPlayerPlay,
  IconRefresh,
  IconUsers,
} from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, parseApiResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

type Verdict = {
  desfecho: "igual" | "parcial" | "diferente";
  correto: "sim" | "nao" | "nao_verificavel";
  inventou: boolean;
  invencao: string;
  humanoConsultouSistema: boolean;
  causa: "ok" | "material" | "comportamento" | "integracao" | "midia";
  tom: "adequado" | "inadequado";
  assunto: string;
  explicacao: string;
};

type Item = {
  id: string;
  conversationId: string;
  pointIndex: number;
  at: string | null;
  clientText: string;
  humanText: string;
  agentText: string | null;
  agentHandoff: boolean;
  themeName: string | null;
  sources: Array<{ title: string; content: string; similarity: number | null }>;
  verdict: Verdict | null;
  skipReason: string | null;
  error: string | null;
};

type Metrics = {
  avaliados: number;
  igual: number;
  parcial: number;
  diferente: number;
  inventou: number;
  transferenciaCorreta: number;
  resolveuComoHumano: number;
};

type Summary = {
  pontos: number;
  naoAvaliaveis: number;
  motivosNaoAvaliavel: Record<string, number>;
  erros: number;
  geral: Metrics;
  causas: Record<string, number>;
  porAssunto: Array<{ assunto: string } & Metrics>;
};

type Params = { days: number; conversations: number; config: "draft" | "published" };

type Run = {
  id: string;
  status: "running" | "done" | "error";
  params: Params;
  total: number;
  done: number;
  summary: Summary | null;
  error: string | null;
  costUsd: number;
  createdAt: string;
  finishedAt: string | null;
};

type Estimate = {
  availableConversations: number;
  conversations: number;
  estimatedPoints: number;
  estimatedCalls: number;
  estimatedCostUsd: number;
  model: string;
};

const CAUSE: Record<Verdict["causa"], { label: string; hint: string }> = {
  ok: { label: "Sem diferença", hint: "O agente fez o mesmo que a pessoa." },
  material: { label: "Material", hint: "Falta ou está errada a informação nos materiais de consulta ou nas mensagens prontas." },
  comportamento: { label: "Comportamento", hint: "A informação existia, mas ele respondeu mal: não perguntou o necessário, fugiu do pedido, tom, não transferiu." },
  integracao: { label: "Integração", hint: "A pessoa consultou dados do cliente num sistema. Sem integração, o certo é transferir com resumo." },
  midia: { label: "Mídia", hint: "Dependia de ouvir áudio ou ver imagem." },
};

const OUTCOME: Record<Verdict["desfecho"], { label: string; variant: "success" | "warning" | "destructive" }> = {
  igual: { label: "mesmo desfecho", variant: "success" },
  parcial: { label: "desfecho parcial", variant: "warning" },
  diferente: { label: "desfecho diferente", variant: "destructive" },
};

function pct(n: number, d: number): string {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : "—";
}

function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Mesmo critério do servidor: transferir quando a pessoa usou o sistema conta como acerto. */
function resolvedLikeHuman(item: Item): boolean {
  const v = item.verdict;
  if (!v) return false;
  if (v.humanoConsultouSistema) return item.agentHandoff && !v.inventou;
  return v.desfecho !== "diferente" && !v.inventou && v.correto !== "nao" && !item.agentHandoff;
}

async function postReplay<T>(agentId: string, body: Record<string, unknown>, fallback: string): Promise<T> {
  const res = await apiFetch(`/api/ai-agents-v2/${agentId}/replay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseApiResponse<T>(res, fallback);
}

export function CompareHuman({ agentId }: { agentId: string }) {
  const queryClient = useQueryClient();
  const [params, setParams] = React.useState<Params>({ days: 1, conversations: 30, config: "draft" });
  const [runId, setRunId] = React.useState<string | null>(null);

  const estimate = useQuery({
    queryKey: ["ai-agents-v2-replay-estimate", agentId, params],
    queryFn: () => postReplay<Estimate>(agentId, { ...params, estimate: true }, "Erro ao estimar."),
  });

  const runs = useQuery({
    queryKey: ["ai-agents-v2-replay-runs", agentId],
    queryFn: async () => {
      const res = await apiFetch(`/api/ai-agents-v2/${agentId}/replay`);
      return parseApiResponse<{ runs: Run[] }>(res, "Erro ao carregar comparações.");
    },
    refetchInterval: (q) => ((q.state.data?.runs ?? []).some((r) => r.status === "running") ? 5000 : false),
  });

  const start = useMutation({
    mutationFn: () => postReplay<{ runId: string }>(agentId, params, "Erro ao iniciar comparação."),
    onSuccess: (r) => {
      setRunId(r.runId);
      queryClient.invalidateQueries({ queryKey: ["ai-agents-v2-replay-runs", agentId] });
    },
  });

  const list = runs.data?.runs ?? [];
  const currentId = runId ?? list[0]?.id ?? null;
  const anyRunning = list.some((r) => r.status === "running");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <IconUsers className="size-4" /> Comparar com humano
          </CardTitle>
          <CardDescription>
            Pega conversas reais que a sua equipe atendeu e, a cada mensagem do cliente, mostra o que o agente
            responderia no lugar. Nada é enviado ao cliente. Um avaliador compara as duas respostas e aponta a causa
            de cada diferença. Documentos, e-mails e senhas aparecem mascarados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>Período</Label>
              <Select value={String(params.days)} onValueChange={(v) => setParams((p) => ({ ...p, days: Number(v) }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Último dia</SelectItem>
                  <SelectItem value="3">Últimos 3 dias</SelectItem>
                  <SelectItem value="7">Últimos 7 dias</SelectItem>
                  <SelectItem value="15">Últimos 15 dias</SelectItem>
                  <SelectItem value="30">Últimos 30 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Conversas na amostra</Label>
              <Select value={String(params.conversations)} onValueChange={(v) => setParams((p) => ({ ...p, conversations: Number(v) }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="30">30</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Versão do agente</Label>
              <Select value={params.config} onValueChange={(v) => setParams((p) => ({ ...p, config: v as Params["config"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Rascunho (o que está editando)</SelectItem>
                  <SelectItem value="published">Publicada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted-foreground">
              {estimate.isLoading && "Calculando…"}
              {estimate.isError && ((estimate.error as Error)?.message ?? "Erro ao estimar.")}
              {estimate.data &&
                (estimate.data.availableConversations === 0
                  ? "Nenhuma conversa atendida por pessoas no período."
                  : `${estimate.data.availableConversations} conversas atendidas por pessoas no período · amostra de ${estimate.data.conversations} · ~${estimate.data.estimatedPoints} pontos · custo estimado US$ ${estimate.data.estimatedCostUsd.toFixed(2)} (${estimate.data.model})`)}
            </span>
            <Button
              className="ml-auto gap-1"
              disabled={start.isPending || anyRunning || !estimate.data?.conversations}
              onClick={() => start.mutate()}
            >
              {start.isPending ? <IconLoader2 className="size-4 animate-spin" /> : <IconPlayerPlay className="size-4" />}
              Comparar
            </Button>
          </div>
          {start.isError && <p className="text-sm text-destructive">{(start.error as Error)?.message}</p>}
          {anyRunning && <p className="text-xs text-muted-foreground">Uma comparação está em andamento. Espere terminar para iniciar outra.</p>}
        </CardContent>
      </Card>

      {list.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {list.map((r) => (
            <Button key={r.id} size="sm" variant={currentId === r.id ? "default" : "outline"} onClick={() => setRunId(r.id)} className="gap-1">
              {r.status === "running" && <IconLoader2 className="size-3 animate-spin" />}
              {dateTime(r.createdAt)} · {r.params.days}d · {r.params.conversations} conv.
              {r.status === "done" && r.summary && ` · ${pct(r.summary.geral.resolveuComoHumano, r.summary.geral.avaliados)}`}
              {r.status === "error" && " · erro"}
            </Button>
          ))}
        </div>
      )}

      {runs.isLoading && <Skeleton className="h-40" />}
      {currentId && <RunDetail agentId={agentId} runId={currentId} />}
    </div>
  );
}

function RunDetail({ agentId, runId }: { agentId: string; runId: string }) {
  const q = useQuery({
    queryKey: ["ai-agents-v2-replay-run", agentId, runId],
    queryFn: async () => {
      const res = await apiFetch(`/api/ai-agents-v2/${agentId}/replay/${runId}`);
      return parseApiResponse<{ run: Run; items: Item[]; summary: Summary }>(res, "Erro ao carregar comparação.");
    },
    refetchInterval: (query) => (query.state.data?.run.status === "running" ? 4000 : false),
  });
  const [filter, setFilter] = React.useState<"divergent" | "invented" | "all" | "skipped">("divergent");
  const [theme, setTheme] = React.useState<string | null>(null);

  if (q.isLoading) return <Skeleton className="h-64" />;
  if (q.isError || !q.data) return <p className="text-sm text-destructive">{(q.error as Error)?.message ?? "Erro."}</p>;
  const { run, items, summary } = q.data;
  const g = summary.geral;

  const themeOf = (it: Item) => it.themeName || it.verdict?.assunto || "Sem assunto";
  const visible = items.filter((it) => {
    if (theme && themeOf(it) !== theme) return false;
    if (filter === "skipped") return !!it.skipReason;
    if (it.skipReason) return false;
    if (filter === "invented") return !!it.verdict?.inventou;
    if (filter === "divergent") return !it.verdict || !resolvedLikeHuman(it);
    return true;
  });

  return (
    <div className="space-y-4">
      {run.status === "running" && (
        <Card>
          <CardContent className="space-y-2 py-4 text-sm">
            <div className="flex items-center gap-2">
              <IconLoader2 className="size-4 animate-spin" />
              {run.total > 0 ? `Comparando ${run.done} de ${run.total} pontos…` : "Separando as conversas…"}
              <span className="ml-auto text-muted-foreground">US$ {run.costUsd.toFixed(3)} até agora</span>
            </div>
            <div className="h-2 rounded bg-muted">
              <div className="h-2 rounded bg-primary transition-all" style={{ width: `${run.total ? (run.done / run.total) * 100 : 0}%` }} />
            </div>
          </CardContent>
        </Card>
      )}
      {run.status === "error" && (
        <p className="flex items-center gap-2 text-sm text-destructive">
          <IconAlertTriangle className="size-4" /> {run.error === "NO_OPENAI_KEY" ? "Configure a chave do modelo para comparar." : run.error}
        </p>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Resolveu como a pessoa: {pct(g.resolveuComoHumano, g.avaliados)}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({g.resolveuComoHumano} de {g.avaliados} pontos avaliados)
            </span>
          </CardTitle>
          <CardDescription>
            Conta como acerto: mesmo desfecho (ou parcial) sem inventar nada; ou transferir quando a pessoa precisou
            consultar o sistema. {summary.naoAvaliaveis > 0 && `${summary.naoAvaliaveis} pontos não avaliáveis (mídia).`}
            {run.status === "done" && ` Custo: US$ ${run.costUsd.toFixed(3)}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge variant="success">mesmo desfecho {pct(g.igual, g.avaliados)}</Badge>
            <Badge variant="warning">parcial {pct(g.parcial, g.avaliados)}</Badge>
            <Badge variant="destructive">diferente {pct(g.diferente, g.avaliados)}</Badge>
            <Badge variant={g.inventou > 0 ? "destructive" : "outline"}>inventou em {g.inventou}</Badge>
            <Badge variant="outline">transferência certa {pct(g.transferenciaCorreta, g.avaliados)}</Badge>
          </div>

          {Object.keys(summary.causas).length > 0 && (
            <div className="space-y-1">
              <p className="font-medium">Por que difere</p>
              {(Object.entries(summary.causas) as Array<[Verdict["causa"], number]>)
                .filter(([c]) => c !== "ok")
                .sort((a, b) => b[1] - a[1])
                .map(([c, n]) => (
                  <p key={c} className="text-muted-foreground">
                    <span className="font-medium text-foreground">{CAUSE[c]?.label ?? c}: {n}</span> — {CAUSE[c]?.hint}
                  </p>
                ))}
            </div>
          )}

          {summary.porAssunto.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-2">Assunto</th>
                    <th className="py-1 pr-2">Pontos</th>
                    <th className="py-1 pr-2">Resolveu como a pessoa</th>
                    <th className="py-1 pr-2">Inventou</th>
                    <th className="py-1">Transferência certa</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.porAssunto.map((a) => (
                    <tr
                      key={a.assunto}
                      className={cn("cursor-pointer border-t hover:bg-muted/50", theme === a.assunto && "bg-muted")}
                      onClick={() => setTheme((t) => (t === a.assunto ? null : a.assunto))}
                    >
                      <td className="py-1 pr-2">{a.assunto}</td>
                      <td className="py-1 pr-2">{a.avaliados}</td>
                      <td className="py-1 pr-2">{pct(a.resolveuComoHumano, a.avaliados)}</td>
                      <td className="py-1 pr-2">{a.inventou || "—"}</td>
                      <td className="py-1">{pct(a.transferenciaCorreta, a.avaliados)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-xs text-muted-foreground">Clique num assunto para ver só os pontos dele.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {([
          ["divergent", "Onde difere"],
          ["invented", "Inventou"],
          ["all", "Todos"],
          ["skipped", "Não avaliáveis"],
        ] as const).map(([k, label]) => (
          <Button key={k} size="sm" variant={filter === k ? "default" : "outline"} onClick={() => setFilter(k)}>
            {label}
          </Button>
        ))}
        {theme && (
          <Badge variant="indigo" className="cursor-pointer" onClick={() => setTheme(null)}>
            {theme} ✕
          </Badge>
        )}
        <Button variant="ghost" size="sm" className="ml-auto gap-1" onClick={() => q.refetch()}>
          <IconRefresh className={cn("size-4", q.isFetching && "animate-spin")} /> Atualizar
        </Button>
      </div>

      {visible.length === 0 && <p className="text-sm text-muted-foreground">Nenhum ponto neste filtro.</p>}
      {visible.map((it) => (
        <PointCard key={it.id} item={it} />
      ))}
    </div>
  );
}

function PointCard({ item }: { item: Item }) {
  const [showSources, setShowSources] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const v = item.verdict;

  const copyScenario = async () => {
    const scenario = {
      mensagens: [item.clientText],
      respostaDaPessoa: item.humanText,
      esperado: v?.humanoConsultouSistema ? "Transferir com resumo (a pessoa consultou o sistema)." : item.humanText,
    };
    await navigator.clipboard.writeText(JSON.stringify(scenario, null, 2)).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline">{item.themeName || v?.assunto || "Sem assunto"}</Badge>
          {item.at && <span className="text-muted-foreground">{dateTime(item.at)}</span>}
          {v && <Badge variant={OUTCOME[v.desfecho].variant}>{OUTCOME[v.desfecho].label}</Badge>}
          {v && resolvedLikeHuman(item) && <Badge variant="success">resolveu como a pessoa</Badge>}
          {v?.inventou && <Badge variant="destructive">inventou</Badge>}
          {v?.humanoConsultouSistema && <Badge variant="warning">pessoa consultou o sistema</Badge>}
          {item.agentHandoff && <Badge variant="secondary">agente transferiu</Badge>}
          {v && v.causa !== "ok" && <Badge variant="indigo">{CAUSE[v.causa]?.label}</Badge>}
          {v?.tom === "inadequado" && <Badge variant="warning">tom</Badge>}
          <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1" onClick={copyScenario}>
            <IconCopy className="size-3" /> {copied ? "Copiado" : "Copiar como cenário"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <Bubble title="Cliente" text={item.clientText} />
          <Bubble title="Pessoa da equipe" text={item.humanText} />
          <Bubble
            title="Agente"
            text={item.skipReason ? item.skipReason : item.error ? `Erro: ${item.error}` : item.agentText || "(sem texto)"}
            muted={!!item.skipReason || !!item.error}
          />
        </div>
        {v?.explicacao && <p className="text-muted-foreground">{v.explicacao}</p>}
        {v?.inventou && v.invencao && (
          <p className="text-destructive">
            <span className="font-medium">Inventado:</span> {v.invencao}
          </p>
        )}
        {item.sources.length > 0 && (
          <div>
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2" onClick={() => setShowSources((s) => !s)}>
              <IconBook className="size-3" /> Trechos que o agente leu ({item.sources.length})
              {showSources ? <IconChevronUp className="size-3" /> : <IconChevronDown className="size-3" />}
            </Button>
            {showSources && (
              <div className="mt-2 space-y-2">
                {item.sources.map((s, i) => (
                  <div key={i} className="rounded border bg-muted/40 p-2 text-xs">
                    <p className="font-medium">
                      {s.title || "Material"} {s.similarity !== null && <span className="text-muted-foreground">· {s.similarity}</span>}
                    </p>
                    <p className="whitespace-pre-wrap text-muted-foreground">{s.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Bubble({ title, text, muted }: { title: string; text: string; muted?: boolean }) {
  return (
    <div className="rounded-md border p-2">
      <p className="mb-1 text-xs font-medium text-muted-foreground">{title}</p>
      <p className={cn("whitespace-pre-wrap", muted && "italic text-muted-foreground")}>{text}</p>
    </div>
  );
}
