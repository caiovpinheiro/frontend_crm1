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
  IconBulb,
  IconCheck,
  IconChevronDown,
  IconClipboardCheck,
  IconCopy,
  IconHistory,
  IconInfoCircle,
  IconLoader2,
  IconMessages,
  IconPhoto,
  IconPlayerPlay,
  IconPlayerStop,
  IconPlugConnected,
  IconRefresh,
  IconRobot,
  IconUpload,
  IconUser,
  IconUsers,
  IconX,
} from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, parseApiResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

import { BlockHeader, IconChip, Pill, SURFACE, Segmented, type Tone } from "./ui";

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

const CAUSE: Record<Verdict["causa"], { label: string; hint: string; tone: Tone; icon: React.ComponentType<{ className?: string }> }> = {
  ok: { label: "Sem diferença", hint: "O agente fez o mesmo que a pessoa.", tone: "emerald", icon: IconCheck },
  material: {
    label: "Material",
    hint: "Falta ou está errada a informação nos materiais de consulta ou nas mensagens prontas.",
    tone: "amber",
    icon: IconBook,
  },
  comportamento: {
    label: "Comportamento",
    hint: "A informação existia, mas ele respondeu mal: não perguntou o necessário, fugiu do pedido, tom, não transferiu.",
    tone: "violet",
    icon: IconMessages,
  },
  integracao: {
    label: "Integração",
    hint: "A pessoa consultou dados do cliente num sistema. Sem integração, o certo é transferir com resumo.",
    tone: "sky",
    icon: IconPlugConnected,
  },
  midia: { label: "Mídia", hint: "Dependia de ouvir áudio ou ver imagem.", tone: "slate", icon: IconPhoto },
};

/** Resultado único de cada ponto (as categorias somam 100% dos avaliados). */
const OUTCOME: Record<Outcome, { label: string; hint: string; hit: boolean; bar: string; tone: Tone }> = {
  igual: { label: "Igual à pessoa", hint: "Levou o cliente ao mesmo resultado.", hit: true, bar: "bg-emerald-500", tone: "emerald" },
  parcial: { label: "Resolveu em parte", hint: "Foi na mesma direção, mas cobriu só parte do que a pessoa fez.", hit: true, bar: "bg-emerald-300", tone: "emerald" },
  transferiu_certo: { label: "Transferiu certo", hint: "A pessoa precisou consultar um sistema e o agente passou para a equipe.", hit: true, bar: "bg-teal-500", tone: "teal" },
  inventou: { label: "Inventou", hint: "Afirmou algo (prazo, valor, regra, link) que não está no material.", hit: false, bar: "bg-rose-600", tone: "rose" },
  incorreto: { label: "Informação errada", hint: "Contradiz o que a pessoa disse ou o material.", hit: false, bar: "bg-rose-400", tone: "rose" },
  deveria_transferir: { label: "Deveria transferir", hint: "A pessoa consultou um sistema; o agente tentou responder sozinho.", hit: false, bar: "bg-amber-500", tone: "amber" },
  transferiu_sem_precisar: { label: "Transferiu sem precisar", hint: "A pessoa resolveu só conversando; o agente passou para a equipe.", hit: false, bar: "bg-amber-300", tone: "amber" },
  diferente: { label: "Caminho diferente", hint: "Não inventou nem errou, mas não levou ao que a pessoa fez.", hit: false, bar: "bg-slate-400", tone: "slate" },
};
const OUTCOME_ORDER = Object.keys(OUTCOME) as Outcome[];

const SOURCE_OPTIONS = [
  { value: "crm", label: "Por período" },
  { value: "crm_ids", label: "Conversas escolhidas" },
  { value: "import", label: "Anexar conversas" },
] as const;

function pct(n: number, d: number): string {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : "—";
}

/** Cor do placar: verde a partir de 70%, âmbar a partir de 40%. */
function scoreTone(n: number, d: number): { text: string; bar: string; tone: Tone } {
  const r = d > 0 ? n / d : 0;
  if (r >= 0.7) return { text: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500", tone: "emerald" };
  if (r >= 0.4) return { text: "text-amber-600 dark:text-amber-400", bar: "bg-amber-500", tone: "amber" };
  return { text: "text-rose-600 dark:text-rose-400", bar: "bg-rose-500", tone: "rose" };
}

function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function money(v: number, digits = 2): string {
  return `US$ ${v.toFixed(digits)}`;
}

function isHit(item: Item): boolean {
  return !!item.outcome && OUTCOME[item.outcome].hit;
}

function runSourceLabel(r: Run): string {
  if (r.params.source === "import") {
    const n = r.params.files?.length ?? r.params.conversations;
    return `${n} ${n === 1 ? "conversa anexada" : "conversas anexadas"}`;
  }
  if (r.params.source === "crm_ids") {
    return `${r.params.conversations} ${r.params.conversations === 1 ? "conversa escolhida" : "conversas escolhidas"}`;
  }
  return `${r.params.conversations} conversas · ${r.params.days === 1 ? "último dia" : `últimos ${r.params.days} dias`}`;
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

/** Número em destaque dentro do texto da estimativa. */
function B({ children }: { children: React.ReactNode }) {
  return <span className="font-semibold text-foreground tabular-nums">{children}</span>;
}

function HowItWorks() {
  const steps = [
    {
      title: "Separa os pontos",
      text: "Cada vez que o cliente escreve e uma pessoa da equipe responde vira um ponto.",
    },
    {
      title: "Simula o agente",
      text: "Com o mesmo histórico, o agente responde no lugar da pessoa. Nada é enviado ao cliente.",
    },
    {
      title: "Avalia",
      text: "Um avaliador compara as duas respostas e diz se acertou (igual, em parte ou transferiu quando precisava) ou o motivo do erro.",
    },
  ];
  return (
    <div className="space-y-3 rounded-xl bg-slate-50 p-4 dark:bg-muted/40">
      <ol className="grid gap-3 sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-2.5">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
              {i + 1}
            </span>
            <div className="space-y-0.5">
              <p className="text-[13px] font-semibold">{s.title}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">
        Pontos em que a pessoa respondeu só com áudio ou arquivo ficam de fora. Documentos, e-mails e senhas aparecem
        mascarados.
      </p>
    </div>
  );
}

export function CompareHuman({ agentId }: { agentId: string }) {
  const queryClient = useQueryClient();
  const [source, setSource] = React.useState<"crm" | "crm_ids" | "import">("crm");
  const [refs, setRefs] = React.useState("");
  const refsKey = refs.trim();
  const [params, setParams] = React.useState<Params>({ days: 1, conversations: 30, config: "draft" });
  const [imported, setImported] = React.useState<Imported[]>([]);
  const [runId, setRunId] = React.useState<string | null>(null);
  const [howOpen, setHowOpen] = React.useState(false);

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

  let estimateText: React.ReactNode = null;
  let estimateWarn = false;
  if (estimate.isError) {
    estimateText = (estimate.error as Error)?.message ?? "Erro ao estimar.";
    estimateWarn = true;
  } else if (source === "import" && usable.length === 0) {
    estimateText = "Anexe ou cole ao menos uma conversa.";
  } else if (source === "import" && missingTeam) {
    estimateText = "Marque quem é da equipe em cada conversa.";
    estimateWarn = true;
  } else if (source === "crm_ids" && !refsKey) {
    estimateText = "Cole o link de ao menos uma conversa.";
  } else if (estimate.isFetching && !est) {
    estimateText = "Calculando…";
  } else if (est && source === "crm") {
    if (est.availableConversations === 0) {
      estimateText = "Nenhuma conversa com resposta de pessoa da equipe no período. Aumente o período.";
      estimateWarn = true;
    } else {
      estimateText = (
        <>
          <B>{est.availableConversations}</B> {est.availableConversations === 1 ? "conversa" : "conversas"} no período ·
          compara <B>{est.conversations}</B> · ~<B>{est.estimatedPoints}</B> pontos · ~<B>{money(est.estimatedCostUsd)}</B>
          {est.availableConversations < params.conversations && (
            <span className="block text-xs">Há menos conversas que a amostra pedida. Para mais, aumente o período.</span>
          )}
        </>
      );
    }
  } else if (est && source === "crm_ids") {
    if (est.conversations === 0) {
      estimateText = "Nenhuma conversa encontrada com esses links nesta organização.";
      estimateWarn = true;
    } else {
      estimateText = (
        <>
          <B>{est.conversations}</B> {est.conversations === 1 ? "conversa" : "conversas"} · <B>{est.estimatedPoints}</B> pontos ·
          ~<B>{money(est.estimatedCostUsd)}</B>
          {!!est.notFound?.length && <span className="block text-xs">Não encontradas: {est.notFound.join(", ")}</span>}
          {!!est.audioPoints && (
            <span className="block text-xs">
              {est.audioPoints} {est.audioPoints === 1 ? "ponto depende" : "pontos dependem"} de áudio
              {est.transcription ? " — serão transcritos." : " — transcrição não configurada no servidor, ficam fora."}
            </span>
          )}
        </>
      );
    }
  } else if (est && source === "import") {
    if (est.estimatedPoints === 0) {
      estimateText = "Nenhum ponto para comparar: não há mensagem do cliente seguida de resposta da equipe.";
      estimateWarn = true;
    } else {
      estimateText = (
        <>
          <B>{usable.length}</B> {usable.length === 1 ? "conversa" : "conversas"} · <B>{est.estimatedPoints}</B> pontos (
          {est.evaluablePoints ?? est.estimatedPoints} avaliáveis) · ~<B>{money(est.estimatedCostUsd)}</B>
        </>
      );
    }
  }

  return (
    <div className="space-y-4">
      <section className={cn(SURFACE, "space-y-5 p-5 sm:p-6")}>
        <BlockHeader
          icon={IconUsers}
          tone="violet"
          title="Comparar com a equipe"
          description="Mede o quanto o agente já atende como a sua equipe, usando conversas reais. Nada é enviado ao cliente."
          actions={
            <Button variant="ghost" size="sm" className="h-8 gap-1 text-muted-foreground" onClick={() => setHowOpen((v) => !v)}>
              <IconInfoCircle className="size-4" />
              Como funciona
              <IconChevronDown className={cn("size-3.5 transition-transform", howOpen && "rotate-180")} />
            </Button>
          }
        />
        {howOpen && <HowItWorks />}

        <div className="space-y-4">
          <Segmented value={source} onChange={setSource} options={SOURCE_OPTIONS} />

          <div className={cn("grid gap-3", source === "crm" ? "sm:grid-cols-3" : "sm:max-w-sm")}>
            {source === "crm" && (
              <>
                <div className="space-y-1.5">
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
                <div className="space-y-1.5">
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
            <div className="space-y-1.5">
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
            <div className="space-y-1.5">
              <Label>Links das conversas</Label>
              <Textarea
                value={refs}
                onChange={(e) => setRefs(e.target.value)}
                rows={3}
                placeholder={"Cole o link da conversa (abra a conversa na caixa de entrada e copie o endereço), um por linha.\nTambém aceita o número do atendimento (#1234)."}
              />
              <p className="text-xs text-muted-foreground">
                Usa a conversa inteira, como está no CRM. Áudios são transcritos para entrar na comparação.
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center dark:bg-muted/40">
          <p className={cn("flex-1 text-[13px] text-muted-foreground", estimateWarn && "text-amber-700 dark:text-amber-400")}>
            {estimateText}
          </p>
          <Button className="gap-1.5 sm:ml-auto" disabled={!canStart} onClick={() => start.mutate()}>
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
      </section>

      {list.length > 0 && <RunHistory runs={list} currentId={currentId} onSelect={setRunId} />}

      {runs.isLoading && <Skeleton className="h-40 rounded-2xl" />}
      {currentId && <RunDetail agentId={agentId} runId={currentId} />}
    </div>
  );
}

/** Comparações anteriores: lista compacta, a escolhida aparece abaixo. */
function RunHistory({ runs, currentId, onSelect }: { runs: Run[]; currentId: string | null; onSelect: (id: string) => void }) {
  const [all, setAll] = React.useState(false);
  const shown = all ? runs : runs.slice(0, 4);
  return (
    <section className={cn(SURFACE, "overflow-hidden")}>
      <div className="flex items-center gap-2 border-b border-border/70 px-5 py-3">
        <IconHistory className="size-4 text-muted-foreground" />
        <h4 className="text-[13px] font-semibold">Comparações feitas</h4>
        <span className="text-xs text-muted-foreground">· {runs.length}</span>
      </div>
      <ul className="divide-y divide-border/60">
        {shown.map((r) => {
          const on = r.id === currentId;
          const g = r.summary?.geral;
          const score = g ? scoreTone(g.resolveuComoHumano, g.avaliados) : null;
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onSelect(r.id)}
                className={cn(
                  "flex w-full items-center gap-4 px-5 py-2.5 text-left transition-colors",
                  on ? "bg-blue-50/70 dark:bg-primary/10" : "hover:bg-slate-50 dark:hover:bg-muted/40",
                )}
              >
                <span className={cn("h-8 w-1 shrink-0 rounded-full", on ? "bg-primary" : "bg-transparent")} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">{dateTime(r.createdAt)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {runSourceLabel(r)} · {r.params.config === "published" ? "versão publicada" : "rascunho"}
                  </p>
                </div>
                {r.status === "running" && (
                  <Pill tone="sky" icon={IconLoader2} className="[&>svg]:animate-spin">
                    {r.total ? `${r.done} de ${r.total}` : "começando"}
                  </Pill>
                )}
                {r.status === "error" && <Pill tone="rose">parou</Pill>}
                {r.status === "canceled" && <Pill tone="slate">interrompida</Pill>}
                {g && g.avaliados > 0 && score && (
                  <div className="flex w-28 shrink-0 items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-muted">
                      <div className={cn("h-full rounded-full", score.bar)} style={{ width: pct(g.resolveuComoHumano, g.avaliados) }} />
                    </div>
                    <span className={cn("w-9 text-right text-[13px] font-semibold tabular-nums", score.text)}>
                      {pct(g.resolveuComoHumano, g.avaliados)}
                    </span>
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {runs.length > 4 && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="w-full border-t border-border/70 py-2 text-xs font-medium text-muted-foreground hover:bg-slate-50 hover:text-foreground dark:hover:bg-muted/40"
        >
          {all ? "Mostrar menos" : `Ver todas (${runs.length})`}
        </button>
      )}
    </section>
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
    <div className="space-y-3 rounded-xl border border-dashed border-border bg-slate-50/60 p-4 dark:bg-muted/30">
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
        <Button size="sm" variant="outline" className="gap-1 bg-white dark:bg-card" disabled={parse.isPending} onClick={() => fileRef.current?.click()}>
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
        <Button size="sm" variant="ghost" disabled={!pasted.trim() || parse.isPending} onClick={() => parse.mutate({ text: pasted })}>
          Adicionar conversa colada
        </Button>
      </div>
      {parse.isError && <p className="text-sm text-destructive">{(parse.error as Error)?.message}</p>}

      {items.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Clique nos nomes para marcar quem é da equipe. Os demais contam como cliente.</p>
          {items.map((t, i) => (
            <div key={`${t.name}-${i}`} className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-white p-2.5 text-sm dark:bg-card">
              <span className="font-medium">{t.name}</span>
              {t.error ? (
                <span className="text-destructive">
                  {t.error} Se a conversa está no CRM, use “Conversas escolhidas” e cole o link.
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

type PointFilter = "divergent" | "invented" | "errors" | "skipped" | "all";

function matchesFilter(it: Item, f: PointFilter): boolean {
  if (f === "skipped") return !!it.skipReason;
  if (it.skipReason) return false;
  if (f === "errors") return !!it.error;
  if (f === "invented") return !!it.verdict?.inventou;
  if (f === "divergent") return !it.error && !isHit(it);
  return true;
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
  const [filter, setFilter] = React.useState<PointFilter>("divergent");
  const [theme, setTheme] = React.useState<string | null>(null);

  if (q.isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  if (q.isError || !q.data) return <p className="text-sm text-destructive">{(q.error as Error)?.message ?? "Erro."}</p>;
  const { run, items, summary } = q.data;
  const g = summary.geral;
  const score = scoreTone(g.resolveuComoHumano, g.avaliados);

  const themeOf = (it: Item) => it.themeName || it.verdict?.assunto || "Sem assunto";
  const inTheme = items.filter((it) => !theme || themeOf(it) === theme);
  const count = (f: PointFilter) => inTheme.filter((it) => matchesFilter(it, f)).length;
  const visible = inTheme.filter((it) => matchesFilter(it, filter));
  const errorCount = count("errors");
  const filters: Array<{ value: PointFilter; label: string; count: number; tone?: "danger" | "warning" }> = [
    { value: "divergent", label: "Onde errou", count: count("divergent"), tone: "danger" },
    { value: "invented", label: "Inventou", count: count("invented"), tone: "danger" },
    ...(errorCount > 0 ? [{ value: "errors" as const, label: "Falha técnica", count: errorCount, tone: "warning" as const }] : []),
    { value: "skipped", label: "Fora da conta", count: count("skipped") },
    { value: "all", label: "Todos", count: count("all") },
  ];
  const causes = (Object.entries(summary.causas) as Array<[Verdict["causa"], number]>)
    .filter(([c]) => c !== "ok")
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      {run.status === "running" && (
        <section className={cn(SURFACE, "space-y-3 p-5")}>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <IconChip icon={IconLoader2} tone="sky" size="sm" className="[&>svg]:animate-spin" />
            <span className="font-medium">
              {run.total > 0 ? `Comparando ${run.done} de ${run.total} pontos…` : "Separando as conversas…"}
            </span>
            <span className="ml-auto text-xs text-muted-foreground">{money(run.costUsd, 3)} até agora</span>
            <CancelButton agentId={agentId} runId={run.id} />
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-muted">
            <div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${run.total ? (run.done / run.total) * 100 : 0}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">
            Cada ponto leva de 10 a 40 segundos. Pode sair da tela: a comparação continua. O placar abaixo é parcial.
          </p>
        </section>
      )}
      {run.status === "error" && (
        <p className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          <IconAlertTriangle className="size-4 shrink-0" /> {run.error === "NO_OPENAI_KEY" ? "Configure a chave do modelo para comparar." : run.error}
        </p>
      )}
      {run.status === "canceled" && (
        <p className="rounded-xl border border-border bg-white px-4 py-3 text-sm text-muted-foreground dark:bg-card">
          Comparação interrompida em {run.done} de {run.total} pontos. O placar mostra só o que foi comparado.
        </p>
      )}

      {/* placar */}
      <section className={cn(SURFACE, "divide-y divide-border/70")}>
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
          <div className="flex items-center gap-4">
            <IconChip icon={IconClipboardCheck} tone={g.avaliados > 0 ? score.tone : "slate"} size="lg" />
            <div>
              <p className={cn("text-4xl font-bold leading-none tracking-tight tabular-nums", g.avaliados > 0 ? score.text : "text-muted-foreground")}>
                {pct(g.resolveuComoHumano, g.avaliados)}
              </p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {g.avaliados > 0 ? (
                  <>
                    acertou como a pessoa em <B>{g.resolveuComoHumano}</B> de <B>{g.avaliados}</B> pontos
                    {run.status === "running" && " (até agora)"}
                  </>
                ) : (
                  "nenhum ponto avaliado ainda"
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 sm:ml-auto sm:justify-end">
            {summary.naoAvaliaveis > 0 && (
              <Pill tone="slate" title="Só mídia, ou resposta da pessoa sem conteúdo, como “ok” ou “por nada”.">
                {summary.naoAvaliaveis} fora da conta
              </Pill>
            )}
            {summary.erros > 0 && (
              <Pill tone="amber" icon={IconAlertTriangle} title="Não entram no placar. Rode de novo para incluí-los.">
                {summary.erros} com falha técnica
              </Pill>
            )}
            {run.status !== "running" && <Pill tone="slate">custo {money(run.costUsd, 3)}</Pill>}
          </div>
        </div>

        {g.avaliados > 0 && (
          <div className="space-y-4 p-5 sm:p-6">
            <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-slate-100 dark:bg-muted">
              {OUTCOME_ORDER.map((o) =>
                g.resultados?.[o] ? (
                  <div
                    key={o}
                    className={cn("first:rounded-l-full last:rounded-r-full", OUTCOME[o].bar)}
                    style={{ width: `${((g.resultados[o] ?? 0) / g.avaliados) * 100}%` }}
                    title={OUTCOME[o].label}
                  />
                ) : null,
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {OUTCOME_ORDER.filter((o) => g.resultados?.[o]).map((o) => (
                <div key={o} title={OUTCOME[o].hint} className="flex items-center gap-2.5 rounded-xl border border-border/70 px-3 py-2">
                  <span className={cn("size-2.5 shrink-0 rounded-full", OUTCOME[o].bar)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-muted-foreground">{OUTCOME[o].label}</p>
                    <p className="text-sm font-semibold tabular-nums">
                      {g.resultados[o]} <span className="text-xs font-normal text-muted-foreground">· {pct(g.resultados[o] ?? 0, g.avaliados)}</span>
                    </p>
                  </div>
                  {OUTCOME[o].hit ? (
                    <IconCheck className="size-4 shrink-0 text-emerald-500" />
                  ) : (
                    <IconX className="size-4 shrink-0 text-rose-400" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {causes.length > 0 && (
          <div className="space-y-3 p-5 sm:p-6">
            <p className="text-[13px] font-semibold">O que falta para acertar mais</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {causes.map(([c, n]) => {
                const info = CAUSE[c];
                return (
                  <div key={c} className="flex gap-3 rounded-xl border border-border/70 p-3">
                    <IconChip icon={info?.icon ?? IconBulb} tone={info?.tone ?? "slate"} size="sm" />
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-[13px] font-semibold">
                        {info?.label ?? c} <span className="font-normal text-muted-foreground">· {n} {n === 1 ? "ponto" : "pontos"}</span>
                      </p>
                      <p className="text-xs leading-relaxed text-muted-foreground">{info?.hint}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {summary.porAssunto.length > 0 && (
          <div className="space-y-2 p-5 sm:p-6">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[13px] font-semibold">Por assunto</p>
              <p className="text-xs text-muted-foreground">Clique num assunto para ver só os pontos dele.</p>
            </div>
            <div className="overflow-x-auto rounded-xl border border-border/70">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-slate-50 text-xs text-muted-foreground dark:bg-muted/40">
                  <tr>
                    <th className="px-3 py-2 font-medium">Assunto</th>
                    <th className="px-3 py-2 text-right font-medium">Pontos</th>
                    <th className="px-3 py-2 font-medium">Acertos</th>
                    <th className="px-3 py-2 font-medium">Erro mais comum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {summary.porAssunto.map((a) => {
                    const worst = OUTCOME_ORDER.filter((o) => !OUTCOME[o].hit && a.resultados?.[o]).sort(
                      (x, y) => (a.resultados[y] ?? 0) - (a.resultados[x] ?? 0),
                    )[0];
                    const t = scoreTone(a.resolveuComoHumano, a.avaliados);
                    return (
                      <tr
                        key={a.assunto}
                        className={cn(
                          "cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-muted/40",
                          theme === a.assunto && "bg-blue-50/70 dark:bg-primary/10",
                        )}
                        onClick={() => setTheme((cur) => (cur === a.assunto ? null : a.assunto))}
                      >
                        <td className="px-3 py-2 font-medium">{a.assunto}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{a.avaliados}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100 dark:bg-muted">
                              <div className={cn("h-full rounded-full", t.bar)} style={{ width: pct(a.resolveuComoHumano, a.avaliados) }} />
                            </div>
                            <span className={cn("font-semibold tabular-nums", t.text)}>{pct(a.resolveuComoHumano, a.avaliados)}</span>
                            <span className="text-xs text-muted-foreground">({a.resolveuComoHumano})</span>
                          </div>
                        </td>
                        <td className="px-3 py-2">{worst ? <Pill tone={OUTCOME[worst].tone}>{OUTCOME[worst].label}</Pill> : <span className="text-muted-foreground">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* pontos */}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={filter} onChange={setFilter} options={filters} />
        {theme && (
          <button
            type="button"
            onClick={() => setTheme(null)}
            className="inline-flex h-8 items-center gap-1 rounded-lg bg-blue-50 px-2.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-100 hover:bg-blue-100 dark:bg-primary/15 dark:text-blue-300"
          >
            {theme} <IconX className="size-3" />
          </button>
        )}
        <Button variant="ghost" size="sm" className="ml-auto gap-1 text-muted-foreground" onClick={() => q.refetch()}>
          <IconRefresh className={cn("size-4", q.isFetching && "animate-spin")} /> Atualizar
        </Button>
      </div>

      {visible.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border bg-white px-4 py-8 text-center text-sm text-muted-foreground dark:bg-card">
          Nenhum ponto neste filtro.
        </p>
      )}
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
    <Button size="sm" variant="ghost" className="h-7 gap-1" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
      {cancel.isPending ? <IconLoader2 className="size-3 animate-spin" /> : <IconPlayerStop className="size-3" />}
      Interromper
    </Button>
  );
}

const STRIPE: Record<Tone, string> = {
  emerald: "before:bg-emerald-500",
  teal: "before:bg-teal-500",
  rose: "before:bg-rose-500",
  amber: "before:bg-amber-400",
  slate: "before:bg-slate-300",
  blue: "before:bg-blue-500",
  violet: "before:bg-violet-500",
  sky: "before:bg-sky-500",
  orange: "before:bg-orange-500",
  indigo: "before:bg-indigo-500",
};

function PointCard({ item }: { item: Item }) {
  const [showSources, setShowSources] = React.useState(false);
  const [showHistory, setShowHistory] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const v = item.verdict;
  const o = item.outcome ? OUTCOME[item.outcome] : null;
  const stripe: Tone = item.error ? "amber" : item.skipReason ? "slate" : (o?.tone ?? "slate");

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

  const historyCount = item.history?.length ?? 0;

  return (
    <article
      className={cn(
        SURFACE,
        "relative overflow-hidden before:absolute before:inset-y-0 before:left-0 before:w-1",
        STRIPE[stripe],
      )}
    >
      <header className="flex flex-wrap items-center gap-1.5 px-5 pb-2 pt-4">
        {item.error ? (
          <Pill tone="amber" icon={IconAlertTriangle} title="Não entra no placar.">
            Falha técnica
          </Pill>
        ) : item.skipReason ? (
          <Pill tone="slate">Fora da conta</Pill>
        ) : (
          o && (
            <Pill tone={o.tone} icon={o.hit ? IconCheck : IconX} title={o.hint}>
              {o.label}
            </Pill>
          )
        )}
        <Pill tone="slate" className="bg-white dark:bg-card">
          {item.themeName || v?.assunto || "Sem assunto"}
        </Pill>
        {v && o && !o.hit && v.causa !== "ok" && CAUSE[v.causa] && (
          <Pill tone={CAUSE[v.causa].tone} icon={CAUSE[v.causa].icon} title={CAUSE[v.causa].hint}>
            falta {CAUSE[v.causa].label.toLowerCase()}
          </Pill>
        )}
        {v?.tom === "inadequado" && <Pill tone="amber">tom</Pill>}
        {item.at && <span className="ml-1 text-xs text-muted-foreground">{dateTime(item.at)}</span>}
        <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1 text-xs text-muted-foreground" onClick={copyScenario}>
          <IconCopy className="size-3.5" /> {copied ? "Copiado" : "Copiar como cenário"}
        </Button>
      </header>

      <div className="space-y-3 px-5 pb-4 text-sm">
        {item.skipReason && <p className="text-[13px] text-muted-foreground">{item.skipReason}</p>}

        <div className="grid gap-3 md:grid-cols-3">
          <Bubble icon={IconUser} title="Cliente" text={item.clientText} tone="client" />
          <Bubble icon={IconUsers} title="Pessoa da equipe" text={item.humanText} tone="team" />
          <Bubble
            icon={IconRobot}
            title={item.agentHandoff ? "Agente · transferiu" : "Agente"}
            text={item.error ? item.error : item.agentText || (item.skipReason ? "(não simulado)" : "(sem texto)")}
            tone={item.error ? "error" : "agent"}
            muted={!item.error && !item.agentText}
          />
        </div>

        {(v?.explicacao || (o && !o.hit)) && !item.error && (
          <div className="flex gap-2.5 rounded-xl bg-slate-50 px-3.5 py-2.5 text-[13px] dark:bg-muted/40">
            <IconClipboardCheck className="mt-0.5 size-4 shrink-0 text-violet-500" />
            <p className="leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Avaliador: </span>
              {v?.explicacao || o?.hint}
            </p>
          </div>
        )}
        {v?.inventou && v.invencao && (
          <div className="flex gap-2.5 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-800 dark:bg-rose-500/10 dark:text-rose-300">
            <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>
              <span className="font-semibold">Inventado: </span>
              {v.invencao}
            </p>
          </div>
        )}

        {(historyCount > 0 || item.sources.length > 0) && (
          <div className="flex flex-wrap gap-1 border-t border-border/60 pt-2">
            {historyCount > 0 && (
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-muted-foreground" onClick={() => setShowHistory((s) => !s)}>
                <IconMessages className="size-3.5" />
                Conversa até aqui ({historyCount})
                <IconChevronDown className={cn("size-3 transition-transform", showHistory && "rotate-180")} />
              </Button>
            )}
            {item.sources.length > 0 && (
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-muted-foreground" onClick={() => setShowSources((s) => !s)}>
                <IconBook className="size-3.5" />
                Trechos que o agente leu ({item.sources.length})
                <IconChevronDown className={cn("size-3 transition-transform", showSources && "rotate-180")} />
              </Button>
            )}
          </div>
        )}
        {showHistory && (
          <div className="space-y-1.5 rounded-xl bg-[#EFEAE2] p-3 text-[12.5px] dark:bg-muted/40">
            {item.history!.map((h, i) => (
              <div key={i} className={cn("flex", h.role === "user" ? "justify-end" : "justify-start")}>
                <p
                  className={cn(
                    "max-w-[80%] whitespace-pre-wrap rounded-lg px-2.5 py-1.5 text-[#111B21] shadow-sm",
                    h.role === "user" ? "bg-[#D9FDD3]" : "bg-white",
                  )}
                >
                  {h.content}
                </p>
              </div>
            ))}
          </div>
        )}
        {showSources && (
          <div className="space-y-2">
            {item.sources.map((s, i) => (
              <div key={i} className="rounded-xl border border-border/70 bg-slate-50 p-3 text-xs dark:bg-muted/40">
                <p className="mb-1 font-semibold">
                  {s.title || "Material"} {s.similarity !== null && <span className="font-normal text-muted-foreground">· {s.similarity}</span>}
                </p>
                <p className="whitespace-pre-wrap text-muted-foreground">{s.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

const BUBBLE_TONE = {
  client: { box: "border-border/70 bg-slate-50 dark:bg-muted/40", label: "text-slate-500" },
  team: { box: "border-emerald-100 bg-emerald-50/60 dark:border-emerald-500/20 dark:bg-emerald-500/10", label: "text-emerald-700 dark:text-emerald-400" },
  agent: { box: "border-blue-100 bg-blue-50/60 dark:border-blue-500/20 dark:bg-blue-500/10", label: "text-blue-700 dark:text-blue-400" },
  error: { box: "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10", label: "text-amber-700 dark:text-amber-400" },
} as const;

function Bubble({
  icon: Icon,
  title,
  text,
  tone,
  muted,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
  tone: keyof typeof BUBBLE_TONE;
  muted?: boolean;
}) {
  const t = BUBBLE_TONE[tone];
  return (
    <div className={cn("rounded-xl border p-3", t.box)}>
      <p className={cn("mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide", t.label)}>
        <Icon className="size-3.5" />
        {title}
      </p>
      <p className={cn("whitespace-pre-wrap text-[13px] leading-relaxed", muted && "italic text-muted-foreground")}>{text}</p>
    </div>
  );
}
