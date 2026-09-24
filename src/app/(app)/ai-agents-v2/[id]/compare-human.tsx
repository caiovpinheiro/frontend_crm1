"use client";

/**
 * Comparar com humano: reproduz conversas reais atendidas por pessoas e
 * mostra, ponto a ponto, o que o agente responderia no lugar — com um
 * resultado único por ponto, o placar por assunto e o que falta para acertar
 * (material, comportamento, integração, mídia). Nada é enviado ao cliente.
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
  IconPlayerStop,
  IconRefresh,
  IconUpload,
  IconUsers,
} from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
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

type Outcome =
  | "igual"
  | "parcial"
  | "transferiu_certo"
  | "inventou"
  | "incorreto"
  | "deveria_transferir"
  | "transferiu_sem_precisar"
  | "diferente";

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
  outcome: Outcome | null;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
};

type Metrics = {
  avaliados: number;
  resolveuComoHumano: number;
  resultados: Partial<Record<Outcome, number>>;
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

type Params = {
  days: number;
  conversations: number;
  config: "draft" | "published";
  source?: "crm" | "crm_ids" | "import";
  files?: string[];
  conversationIds?: string[];
};

type Run = {
  id: string;
  status: "running" | "done" | "error" | "canceled";
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
  evaluablePoints?: number;
  notFound?: string[];
  audioPoints?: number;
  transcription?: boolean;
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

/** Resultado único de cada ponto (as categorias somam 100% dos avaliados). */
const OUTCOME: Record<Outcome, { label: string; hint: string; hit: boolean; bar: string; variant: "success" | "warning" | "destructive" | "muted" }> = {
  igual: { label: "Igual à pessoa", hint: "Levou o cliente ao mesmo resultado.", hit: true, bar: "bg-emerald-500", variant: "success" },
  parcial: { label: "Resolveu em parte", hint: "Foi na mesma direção, mas cobriu só parte do que a pessoa fez.", hit: true, bar: "bg-emerald-300", variant: "success" },
  transferiu_certo: { label: "Transferiu certo", hint: "A pessoa precisou consultar um sistema e o agente passou para a equipe.", hit: true, bar: "bg-sky-500", variant: "success" },
  inventou: { label: "Inventou", hint: "Afirmou algo (prazo, valor, regra, link) que não está no material.", hit: false, bar: "bg-red-600", variant: "destructive" },
  incorreto: { label: "Informação errada", hint: "Contradiz o que a pessoa disse ou o material.", hit: false, bar: "bg-red-400", variant: "destructive" },
  deveria_transferir: { label: "Deveria transferir", hint: "A pessoa consultou um sistema; o agente tentou responder sozinho.", hit: false, bar: "bg-amber-500", variant: "warning" },
  transferiu_sem_precisar: { label: "Transferiu sem precisar", hint: "A pessoa resolveu só conversando; o agente passou para a equipe.", hit: false, bar: "bg-amber-300", variant: "warning" },
  diferente: { label: "Caminho diferente", hint: "Não inventou nem errou, mas não levou ao que a pessoa fez.", hit: false, bar: "bg-slate-400", variant: "muted" },
};
const OUTCOME_ORDER = Object.keys(OUTCOME) as Outcome[];

function pct(n: number, d: number): string {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : "—";
}

function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function isHit(item: Item): boolean {
  return !!item.outcome && OUTCOME[item.outcome].hit;
}

async function postReplay<T>(agentId: string, body: Record<string, unknown>, fallback: string): Promise<T> {
  const res = await apiFetch(`/api/ai-agents-v2/${agentId}/replay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseApiResponse<T>(res, fallback);
}

type Imported = {
  name: string;
  text: string;
  messages: number;
  participants: Array<{ name: string; messages: number }>;
  team: string[];
  error?: string;
};

type ParsedTranscript = Omit<Imported, "team"> & { teamGuess: string[] };

export function CompareHuman({ agentId }: { agentId: string }) {
  const queryClient = useQueryClient();
  const [source, setSource] = React.useState<"crm" | "crm_ids" | "import">("crm");
  const [refs, setRefs] = React.useState("");
  const refsKey = refs.trim();
  const [params, setParams] = React.useState<Params>({ days: 1, conversations: 30, config: "draft" });
  const [imported, setImported] = React.useState<Imported[]>([]);
  const [runId, setRunId] = React.useState<string | null>(null);

  const usable = imported.filter((t) => !t.error && t.messages > 0);
  const missingTeam = usable.some((t) => t.team.length === 0);
  const importBody = {
    source: "import",
    config: params.config,
    transcripts: usable.map((t) => ({ name: t.name, text: t.text, teamAuthors: t.team })),
  };
  const idsBody = { source: "crm_ids", config: params.config, conversationRefs: refs };
  // A chave não leva o texto inteiro: nome + equipe + tamanho bastam.
  const importKey = usable.map((t) => `${t.name}|${t.text.length}|${t.team.join(",")}`);

  const estimate = useQuery({
    queryKey: ["ai-agents-v2-replay-estimate", agentId, source, params, importKey, source === "crm_ids" ? refsKey : ""],
    queryFn: () =>
      source === "import"
        ? postReplay<Estimate>(agentId, { ...importBody, estimate: true }, "Erro ao estimar.")
        : source === "crm_ids"
          ? postReplay<Estimate>(agentId, { ...idsBody, estimate: true }, "Erro ao estimar.")
          : postReplay<Estimate>(agentId, { ...params, estimate: true }, "Erro ao estimar."),
    enabled: source === "crm" || (source === "crm_ids" ? !!refsKey : usable.length > 0 && !missingTeam),
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
    mutationFn: () =>
      postReplay<{ runId: string }>(
        agentId,
        source === "import" ? importBody : source === "crm_ids" ? idsBody : params,
        "Erro ao iniciar comparação.",
      ),
    onSuccess: (r) => {
      setRunId(r.runId);
      queryClient.invalidateQueries({ queryKey: ["ai-agents-v2-replay-runs", agentId] });
    },
  });

  const list = runs.data?.runs ?? [];
  const currentId = runId ?? list[0]?.id ?? null;
  const running = list.find((r) => r.status === "running");
  const est = estimate.data;
  const canStart =
    !start.isPending &&
    !running &&
    (source === "crm"
      ? !!est?.conversations
      : source === "crm_ids"
        ? !!refsKey && !!est?.estimatedPoints
        : usable.length > 0 && !missingTeam && !!est?.estimatedPoints);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <IconUsers className="size-4" /> Comparar com humano
          </CardTitle>
          <CardDescription>Mede o quanto o agente já atende como a sua equipe, usando conversas reais.</CardDescription>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              Usamos conversas em que uma pessoa da equipe respondeu: do CRM, pelo período, ou conversas que você
              anexar. Cada vez que o cliente escreve e a pessoa responde vira um{" "}
              <span className="font-medium text-foreground">ponto</span>.
            </li>
            <li>
              Em cada ponto, o agente recebe o mesmo histórico e a mesma mensagem e responde numa simulação.{" "}
              <span className="font-medium text-foreground">Nada é enviado ao cliente.</span>
            </li>
            <li>
              Um avaliador compara a resposta do agente com a da pessoa e dá um resultado ao ponto: acertou (igual, em
              parte ou transferiu quando precisava) ou errou, com o motivo.
            </li>
          </ol>
          <p className="mt-2 text-xs text-muted-foreground">
            Pontos em que a pessoa respondeu só com áudio ou arquivo ficam de fora por enquanto. Documentos, e-mails e
            senhas aparecem mascarados.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {([
              ["crm", "Conversas do CRM (período)"],
              ["crm_ids", "Conversas escolhidas do CRM"],
              ["import", "Conversas anexadas"],
            ] as const).map(([k, label]) => (
              <Button key={k} size="sm" variant={source === k ? "default" : "outline"} onClick={() => setSource(k)}>
                {label}
              </Button>
            ))}
          </div>

          <div className={cn("grid gap-3", source === "crm" ? "sm:grid-cols-3" : "sm:grid-cols-1 sm:max-w-sm")}>
            {source === "crm" && (
              <>
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
              </>
            )}
            <div className="space-y-1">
              <Label>Versão do agente</Label>
              <Select value={params.config} onValueChange={(v) => setParams((p) => ({ ...p, config: v as Params["config"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Rascunho salvo (ainda não publicado)</SelectItem>
                  <SelectItem value="published">Publicada (a que atende hoje)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {source === "import" && <ImportPanel agentId={agentId} items={imported} onChange={setImported} />}
          {source === "crm_ids" && (
            <div className="space-y-1">
              <Label>Links das conversas</Label>
              <Textarea
                value={refs}
                onChange={(e) => setRefs(e.target.value)}
                rows={3}
                placeholder={"Cole o link da conversa (abra a conversa na caixa de entrada e copie o endereço), um por linha.\nTambém aceita o número do atendimento (#1234)."}
              />
              <p className="text-xs text-muted-foreground">
                Usa a conversa inteira, com quem é cliente, robô e equipe como está no CRM. Áudios são transcritos para
                entrar na comparação.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <div className="text-muted-foreground">
              {source === "import" && usable.length === 0 && "Anexe ou cole ao menos uma conversa."}
              {source === "import" && usable.length > 0 && missingTeam && "Marque quem é da equipe em cada conversa."}
              {estimate.isFetching && !est && "Calculando…"}
              {estimate.isError && ((estimate.error as Error)?.message ?? "Erro ao estimar.")}
              {source === "crm" && est &&
                (est.availableConversations === 0
                  ? "Nenhuma conversa com resposta de pessoa da equipe no período. Aumente o período."
                  : `${est.availableConversations} ${est.availableConversations === 1 ? "conversa" : "conversas"} com resposta de pessoa da equipe no período. Vamos comparar ${est.conversations} (~${est.estimatedPoints} pontos, custo estimado US$ ${est.estimatedCostUsd.toFixed(2)} com ${est.model}).`)}
              {source === "crm" && est && est.availableConversations > 0 && est.availableConversations < params.conversations && (
                <span className="block text-xs">Há menos conversas que a amostra pedida. Para uma amostra maior, aumente o período.</span>
              )}
              {source === "crm_ids" && !refsKey && "Cole o link de ao menos uma conversa."}
              {source === "crm_ids" && refsKey && est && (
                <>
                  {est.conversations === 0
                    ? "Nenhuma conversa encontrada com esses links nesta organização."
                    : `${est.conversations} ${est.conversations === 1 ? "conversa" : "conversas"} · ${est.estimatedPoints} pontos · custo estimado US$ ${est.estimatedCostUsd.toFixed(2)} com ${est.model}.`}
                  {!!est.notFound?.length && <span className="block text-xs">Não encontradas: {est.notFound.join(", ")}</span>}
                  {!!est.audioPoints && (
                    <span className="block text-xs">
                      {est.audioPoints} {est.audioPoints === 1 ? "ponto depende" : "pontos dependem"} de áudio
                      {est.transcription ? " — serão transcritos." : " — transcrição não configurada no servidor, ficam fora."}
                    </span>
                  )}
                </>
              )}
              {source === "import" && usable.length > 0 && !missingTeam && est &&
                (est.estimatedPoints === 0
                  ? "Nenhum ponto para comparar: não há mensagem do cliente seguida de resposta da equipe."
                  : `${usable.length} ${usable.length === 1 ? "conversa" : "conversas"} · ${est.estimatedPoints} pontos (${est.evaluablePoints ?? est.estimatedPoints} avaliáveis) · custo estimado US$ ${est.estimatedCostUsd.toFixed(2)} com ${est.model}.`)}
            </div>
            <Button className="ml-auto gap-1" disabled={!canStart} onClick={() => start.mutate()}>
              {start.isPending ? <IconLoader2 className="size-4 animate-spin" /> : <IconPlayerPlay className="size-4" />}
              Comparar
            </Button>
          </div>
          {start.isError && <p className="text-sm text-destructive">{(start.error as Error)?.message}</p>}
          {running && (
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              Uma comparação está em andamento. Espere terminar ou interrompa para iniciar outra.
              <CancelButton agentId={agentId} runId={running.id} />
            </p>
          )}
        </CardContent>
      </Card>

      {list.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {list.map((r) => (
            <Button key={r.id} size="sm" variant={currentId === r.id ? "default" : "outline"} onClick={() => setRunId(r.id)} className="gap-1">
              {r.status === "running" && <IconLoader2 className="size-3 animate-spin" />}
              {dateTime(r.createdAt)} ·{" "}
              {r.params.source === "import"
                ? `${r.params.files?.length ?? r.params.conversations} anexada${(r.params.files?.length ?? 0) === 1 ? "" : "s"}`
                : r.params.source === "crm_ids"
                  ? `${r.params.conversations} escolhida${r.params.conversations === 1 ? "" : "s"}`
                  : `${r.params.days}d · ${r.params.conversations} conv.`}
              {r.status === "done" && r.summary && ` · ${pct(r.summary.geral.resolveuComoHumano, r.summary.geral.avaliados)}`}
              {r.status === "error" && " · parou"}
              {r.status === "canceled" && " · interrompida"}
            </Button>
          ))}
        </div>
      )}

      {runs.isLoading && <Skeleton className="h-40" />}
      {currentId && <RunDetail agentId={agentId} runId={currentId} />}
    </div>
  );
}

/** Anexar ou colar conversas e marcar quem é da equipe em cada uma. */
function ImportPanel({ agentId, items, onChange }: { agentId: string; items: Imported[]; onChange: (v: Imported[]) => void }) {
  const [pasted, setPasted] = React.useState("");
  const fileRef = React.useRef<HTMLInputElement>(null);

  const toImported = (list: ParsedTranscript[]): Imported[] =>
    list.map((t) => ({ name: t.name, text: t.text, messages: t.messages, participants: t.participants, team: t.teamGuess, error: t.error }));

  const parse = useMutation({
    mutationFn: async (input: { files?: File[]; text?: string }) => {
      let res: Response;
      if (input.files) {
        const form = new FormData();
        input.files.forEach((f) => form.append("files", f));
        res = await apiFetch(`/api/ai-agents-v2/${agentId}/replay/parse`, { method: "POST", body: form });
      } else {
        res = await apiFetch(`/api/ai-agents-v2/${agentId}/replay/parse`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: `Conversa colada ${items.length + 1}`, text: input.text }),
        });
      }
      return parseApiResponse<{ transcripts: ParsedTranscript[] }>(res, "Erro ao ler as conversas.");
    },
    onSuccess: (r, input) => {
      onChange([...items, ...toImported(r.transcripts)].slice(0, 20));
      if (input.text) setPasted("");
    },
  });

  const toggleTeam = (i: number, name: string) =>
    onChange(
      items.map((t, j) =>
        j !== i ? t : { ...t, team: t.team.includes(name) ? t.team.filter((n) => n !== name) : [...t.team, name] },
      ),
    );

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.zip,text/plain,application/zip"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) parse.mutate({ files });
            e.target.value = "";
          }}
        />
        <Button size="sm" variant="outline" className="gap-1" disabled={parse.isPending} onClick={() => fileRef.current?.click()}>
          {parse.isPending ? <IconLoader2 className="size-4 animate-spin" /> : <IconUpload className="size-4" />}
          Anexar conversas
        </Button>
        <span className="text-xs text-muted-foreground">
          Exportação do WhatsApp (“Exportar conversa”, .txt ou .zip). Até 20 conversas.
        </span>
      </div>
      <div className="space-y-2">
        <Textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          rows={4}
          placeholder={"Ou cole uma conversa, uma mensagem por linha:\nCliente: quero a segunda via\nAna: Claro! Você emite pela área do cliente…"}
        />
        <Button size="sm" variant="outline" disabled={!pasted.trim() || parse.isPending} onClick={() => parse.mutate({ text: pasted })}>
          Adicionar conversa colada
        </Button>
      </div>
      {parse.isError && <p className="text-sm text-destructive">{(parse.error as Error)?.message}</p>}

      {items.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Clique nos nomes para marcar quem é da equipe. Os demais contam como cliente.</p>
          {items.map((t, i) => (
            <div key={`${t.name}-${i}`} className="flex flex-wrap items-center gap-2 rounded border bg-muted/30 p-2 text-sm">
              <span className="font-medium">{t.name}</span>
              {t.error ? (
                <span className="text-destructive">
                  {t.error} Se a conversa está no CRM, use “Conversas escolhidas do CRM” e cole o link.
                </span>
              ) : (
                <>
                  <span className="text-muted-foreground">{t.messages} mensagens ·</span>
                  {t.participants.map((p) => {
                    const isTeam = t.team.includes(p.name);
                    return (
                      <Badge
                        key={p.name}
                        variant={isTeam ? "indigo" : "outline"}
                        className="cursor-pointer"
                        onClick={() => toggleTeam(i, p.name)}
                        title={isTeam ? "Equipe (clique para marcar como cliente)" : "Cliente (clique para marcar como equipe)"}
                      >
                        {p.name} · {isTeam ? "equipe" : "cliente"} ({p.messages})
                      </Badge>
                    );
                  })}
                  {t.team.length === 0 && <span className="text-xs text-destructive">marque a equipe</span>}
                </>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-7"
                onClick={() => onChange(items.filter((_, j) => j !== i))}
              >
                Remover
              </Button>
            </div>
          ))}
        </div>
      )}
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
    if (filter === "divergent") return !isHit(it);
    return true;
  });

  return (
    <div className="space-y-4">
      {run.status === "running" && (
        <Card>
          <CardContent className="space-y-2 py-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <IconLoader2 className="size-4 animate-spin" />
              {run.total > 0 ? `Comparando ${run.done} de ${run.total} pontos…` : "Separando as conversas…"}
              <span className="ml-auto text-muted-foreground">US$ {run.costUsd.toFixed(3)} até agora</span>
              <CancelButton agentId={agentId} runId={run.id} />
            </div>
            <div className="h-2 rounded bg-muted">
              <div className="h-2 rounded bg-primary transition-all" style={{ width: `${run.total ? (run.done / run.total) * 100 : 0}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">
              Cada ponto leva de 10 a 40 segundos. Pode sair da tela: a comparação continua. O placar abaixo é parcial.
            </p>
          </CardContent>
        </Card>
      )}
      {run.status === "error" && (
        <p className="flex items-center gap-2 text-sm text-destructive">
          <IconAlertTriangle className="size-4" /> {run.error === "NO_OPENAI_KEY" ? "Configure a chave do modelo para comparar." : run.error}
        </p>
      )}
      {run.status === "canceled" && (
        <p className="text-sm text-muted-foreground">
          Comparação interrompida em {run.done} de {run.total} pontos. O placar mostra só o que foi comparado.
        </p>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {g.avaliados > 0
              ? `Acertou como a pessoa em ${g.resolveuComoHumano} de ${g.avaliados} pontos (${pct(g.resolveuComoHumano, g.avaliados)})`
              : "Nenhum ponto avaliado ainda"}
            {run.status === "running" && <span className="ml-2 text-sm font-normal text-muted-foreground">até agora</span>}
          </CardTitle>
          <CardDescription>
            Acerto = igual à pessoa, resolveu em parte (sem inventar nem errar) ou transferiu quando a pessoa precisou
            consultar um sistema.
            {summary.naoAvaliaveis > 0 &&
              ` ${summary.naoAvaliaveis} ${summary.naoAvaliaveis === 1 ? "ponto ficou" : "pontos ficaram"} de fora (áudio/arquivo).`}
            {summary.erros > 0 && ` ${summary.erros} com falha técnica.`}
            {run.status !== "running" && ` Custo: US$ ${run.costUsd.toFixed(3)}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {g.avaliados > 0 && (
            <div className="space-y-2">
              <div className="flex h-3 overflow-hidden rounded bg-muted">
                {OUTCOME_ORDER.map((o) =>
                  g.resultados?.[o] ? (
                    <div
                      key={o}
                      className={OUTCOME[o].bar}
                      style={{ width: `${((g.resultados[o] ?? 0) / g.avaliados) * 100}%` }}
                      title={OUTCOME[o].label}
                    />
                  ) : null,
                )}
              </div>
              <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                {OUTCOME_ORDER.filter((o) => g.resultados?.[o]).map((o) => (
                  <p key={o} className="flex items-start gap-2">
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", OUTCOME[o].bar)} />
                    <span>
                      <span className="font-medium">
                        {OUTCOME[o].hit ? "✓" : "✗"} {OUTCOME[o].label}: {g.resultados[o]} ({pct(g.resultados[o] ?? 0, g.avaliados)})
                      </span>{" "}
                      <span className="text-muted-foreground">— {OUTCOME[o].hint}</span>
                    </span>
                  </p>
                ))}
              </div>
            </div>
          )}

          {Object.keys(summary.causas).some((c) => c !== "ok") && (
            <div className="space-y-1">
              <p className="font-medium">O que falta para acertar mais</p>
              {(Object.entries(summary.causas) as Array<[Verdict["causa"], number]>)
                .filter(([c]) => c !== "ok")
                .sort((a, b) => b[1] - a[1])
                .map(([c, n]) => (
                  <p key={c} className="text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {CAUSE[c]?.label ?? c} ({n} {n === 1 ? "ponto" : "pontos"})
                    </span>{" "}
                    — {CAUSE[c]?.hint}
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
                    <th className="py-1 pr-2">Acertos</th>
                    <th className="py-1">Erro mais comum</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.porAssunto.map((a) => {
                    const worst = OUTCOME_ORDER.filter((o) => !OUTCOME[o].hit && a.resultados?.[o]).sort(
                      (x, y) => (a.resultados[y] ?? 0) - (a.resultados[x] ?? 0),
                    )[0];
                    return (
                      <tr
                        key={a.assunto}
                        className={cn("cursor-pointer border-t hover:bg-muted/50", theme === a.assunto && "bg-muted")}
                        onClick={() => setTheme((t) => (t === a.assunto ? null : a.assunto))}
                      >
                        <td className="py-1 pr-2">{a.assunto}</td>
                        <td className="py-1 pr-2">{a.avaliados}</td>
                        <td className="py-1 pr-2">
                          {a.resolveuComoHumano} ({pct(a.resolveuComoHumano, a.avaliados)})
                        </td>
                        <td className="py-1 text-muted-foreground">{worst ? OUTCOME[worst].label : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-1 text-xs text-muted-foreground">Clique num assunto para ver só os pontos dele.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {([
          ["divergent", "Onde errou"],
          ["invented", "Inventou"],
          ["all", "Todos"],
          ["skipped", "Fora da conta"],
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

function CancelButton({ agentId, runId }: { agentId: string; runId: string }) {
  const queryClient = useQueryClient();
  const cancel = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/ai-agents-v2/${agentId}/replay/${runId}`, { method: "DELETE" });
      return parseApiResponse<{ ok: boolean }>(res, "Erro ao interromper.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agents-v2-replay-runs", agentId] });
      queryClient.invalidateQueries({ queryKey: ["ai-agents-v2-replay-run", agentId, runId] });
    },
  });
  return (
    <Button size="sm" variant="outline" className="h-7 gap-1" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
      {cancel.isPending ? <IconLoader2 className="size-3 animate-spin" /> : <IconPlayerStop className="size-3" />}
      Interromper
    </Button>
  );
}

function PointCard({ item }: { item: Item }) {
  const [showSources, setShowSources] = React.useState(false);
  const [showHistory, setShowHistory] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const v = item.verdict;
  const o = item.outcome ? OUTCOME[item.outcome] : null;

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
          {o && (
            <Badge variant={o.variant}>
              {o.hit ? "✓" : "✗"} {o.label}
            </Badge>
          )}
          {item.skipReason && <Badge variant="muted">fora da conta</Badge>}
          {item.error && <Badge variant="muted">falha técnica</Badge>}
          <Badge variant="outline">{item.themeName || v?.assunto || "Sem assunto"}</Badge>
          {item.at && <span className="text-muted-foreground">{dateTime(item.at)}</span>}
          {v && o && !o.hit && v.causa !== "ok" && <Badge variant="indigo">falta: {CAUSE[v.causa]?.label.toLowerCase()}</Badge>}
          {v?.tom === "inadequado" && <Badge variant="warning">tom</Badge>}
          <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1" onClick={copyScenario}>
            <IconCopy className="size-3" /> {copied ? "Copiado" : "Copiar como cenário"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {(item.history?.length ?? 0) > 0 && (
          <div>
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2" onClick={() => setShowHistory((s) => !s)}>
              Conversa até aqui ({item.history!.length} {item.history!.length === 1 ? "mensagem" : "mensagens"})
              {showHistory ? <IconChevronUp className="size-3" /> : <IconChevronDown className="size-3" />}
            </Button>
            {showHistory && (
              <div className="mt-2 space-y-1 rounded border bg-muted/40 p-2 text-xs">
                {item.history!.map((h, i) => (
                  <p key={i} className="whitespace-pre-wrap">
                    <span className="font-medium">{h.role === "user" ? "Cliente" : "Atendimento"}:</span> {h.content}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
        {item.skipReason && (
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Fora da conta:</span> {item.skipReason}
          </p>
        )}
        <div className="grid gap-3 md:grid-cols-3">
          <Bubble title="Cliente" text={item.clientText} />
          <Bubble title="Pessoa da equipe" text={item.humanText} />
          <Bubble
            title={item.agentHandoff ? "Agente (transferiu para a equipe)" : "Agente"}
            text={item.error ? `Erro: ${item.error}` : item.agentText || (item.skipReason ? "(não simulado)" : "(sem texto)")}
            muted={!!item.error || !item.agentText}
          />
        </div>
        {o && !o.hit && <p className="text-muted-foreground">{o.hint}</p>}
        {v?.explicacao && (
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Avaliador:</span> {v.explicacao}
          </p>
        )}
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
