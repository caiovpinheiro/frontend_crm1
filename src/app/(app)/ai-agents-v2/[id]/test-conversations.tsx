"use client";

/**
 * Conversas de teste do agente v2: o que os números de teste conversaram com
 * o agente, turno a turno, com o rastro de decisões do motor e a opção de
 * marcar onde ele errou para receber um diagnóstico do que corrigir.
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
  IconMessageReport,
  IconRefresh,
  IconRotate,
  IconStethoscope,
} from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, parseApiResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

type TraceStep = { step: string; detail: string; at: number; data?: Record<string, unknown> };

type Diagnosis = {
  resumo: string;
  causa: string;
  categoria: "configuracao" | "material" | "modelo" | "motor";
  correcoes: Array<{ onde: string; oque: string }>;
  pedidoParaDev: string | null;
  confianca: "alta" | "media" | "baixa";
};

type Feedback = {
  comment: string;
  createdAt: string;
  diagnosis: Diagnosis | null;
  diagnosisError?: string;
};

type TestTurn = {
  id: string;
  createdAt: string;
  isReset: boolean;
  inbound: string;
  reply: string | null;
  handoff: boolean;
  closed: boolean;
  error: string | null;
  stage: string | null;
  theme: string | null;
  rule: string | null;
  llmReason: string | null;
  trace: TraceStep[];
  /** Texto dos trechos da base que o modelo leu no turno. */
  sources?: Array<{ title: string; content: string; similarity: number | null }>;
  discardedActions: string[];
  latencyMs: number | null;
  tokens: number;
  feedback: Feedback | null;
};

type TestContact = {
  contactId: string;
  name: string | null;
  phone: string | null;
  sessions: Array<{ startedAt: string; turns: TestTurn[] }>;
};

type TestLogsResponse = { testNumbers: string[]; contacts: TestContact[] };

const CATEGORY_LABEL: Record<Diagnosis["categoria"], string> = {
  configuracao: "Ajuste na configuração",
  material: "Ajuste no material de consulta",
  modelo: "Instrução mais clara para o modelo",
  motor: "Correção no motor (pedir ao dev)",
};

const CONFIDENCE_LABEL: Record<Diagnosis["confianca"], string> = {
  alta: "confiança alta",
  media: "confiança média",
  baixa: "confiança baixa",
};

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Passos que indicam problema — aparecem mesmo com o rastro recolhido. */
function isProblem(step: TraceStep): boolean {
  if (step.step === "parada" || step.step === "limites") return true;
  if (step.step === "resposta" && step.detail.startsWith("NÃO enviada")) return true;
  if (step.step === "llm" && step.detail.startsWith("O modelo não respondeu")) return true;
  if (step.step === "base" && step.detail.startsWith("Falha")) return true;
  return false;
}

async function fetchTestLogs(agentId: string): Promise<TestLogsResponse> {
  const res = await apiFetch(`/api/ai-agents-v2/${agentId}/test-logs?days=7`);
  return parseApiResponse<TestLogsResponse>(res, "Erro ao carregar conversas de teste.");
}

async function sendFeedback(agentId: string, logId: string, comment: string): Promise<Feedback> {
  const res = await apiFetch(`/api/ai-agents-v2/${agentId}/test-logs/${logId}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ comment }),
  });
  const data = await parseApiResponse<{ feedback: Feedback }>(res, "Erro ao diagnosticar.");
  return data.feedback;
}

export function TestConversations({ agentId }: { agentId: string }) {
  const query = useQuery({
    queryKey: ["ai-agents-v2-test-logs", agentId],
    queryFn: () => fetchTestLogs(agentId),
    // Enquanto a pessoa testa pelo WhatsApp, os turnos aparecem sozinhos.
    refetchInterval: 10_000,
  });
  const [selected, setSelected] = React.useState<string | null>(null);

  const contacts = query.data?.contacts ?? [];
  const current = contacts.find((c) => c.contactId === selected) ?? contacts[0] ?? null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Conversas de teste</CardTitle>
          <CardDescription>
            O que os números de teste conversaram com o agente (últimos 7 dias), com o passo a passo de cada decisão.
            Mande <code className="rounded bg-muted px-1">#reset</code> pelo WhatsApp de um número de teste para começar um
            atendimento do zero.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Números de teste:</span>
          {(query.data?.testNumbers ?? []).length > 0 ? (
            query.data!.testNumbers.map((n) => (
              <Badge key={n} variant="muted">
                {n}
              </Badge>
            ))
          ) : (
            <span className="text-muted-foreground">
              nenhum — cadastre em “Começar” › “Responder só para estes números” e publique.
            </span>
          )}
          <Button variant="ghost" size="sm" className="ml-auto gap-1" onClick={() => query.refetch()}>
            <IconRefresh className={cn("size-4", query.isFetching && "animate-spin")} />
            Atualizar
          </Button>
        </CardContent>
      </Card>

      {query.isLoading && <Skeleton className="h-48" />}
      {query.isError && (
        <p className="text-sm text-destructive">{(query.error as Error)?.message ?? "Erro ao carregar."}</p>
      )}
      {!query.isLoading && contacts.length === 0 && (query.data?.testNumbers ?? []).length > 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma conversa dos números de teste nos últimos 7 dias.</p>
      )}

      {contacts.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {contacts.map((c) => (
            <Button
              key={c.contactId}
              size="sm"
              variant={current?.contactId === c.contactId ? "default" : "outline"}
              onClick={() => setSelected(c.contactId)}
            >
              {c.name ?? c.phone ?? c.contactId}
            </Button>
          ))}
        </div>
      )}

      {current?.sessions.map((session, i) => (
        <Card key={`${session.startedAt}-${i}`}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              {session.turns[0]?.isReset && <IconRotate className="size-4 text-muted-foreground" />}
              Sessão de {dateTime(session.startedAt)}
              {i === 0 && <Badge variant="indigo">mais recente</Badge>}
              <span className="font-normal text-muted-foreground">
                · {current.name ?? ""} {current.phone ?? ""}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {session.turns.map((turn) =>
              turn.isReset ? (
                <div key={turn.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="h-px flex-1 bg-border" />
                  <IconRotate className="size-3" /> #reset às {time(turn.createdAt)}
                  <div className="h-px flex-1 bg-border" />
                </div>
              ) : (
                <TurnCard key={turn.id} agentId={agentId} turn={turn} />
              ),
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function TurnCard({ agentId, turn }: { agentId: string; turn: TestTurn }) {
  const [open, setOpen] = React.useState(false);
  const [sourcesOpen, setSourcesOpen] = React.useState(false);
  const [reporting, setReporting] = React.useState(false);
  const [comment, setComment] = React.useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => sendFeedback(agentId, turn.id, comment),
    onSuccess: () => {
      setReporting(false);
      setComment("");
      queryClient.invalidateQueries({ queryKey: ["ai-agents-v2-test-logs", agentId] });
    },
  });

  const problems = turn.trace.filter(isProblem);
  const noReply = !turn.reply && !turn.handoff && !turn.closed;

  return (
    <div className={cn("rounded-lg border p-3", turn.feedback && "border-amber-500/50")}>
      {/* cliente */}
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-lg bg-success/15 px-3 py-2 text-sm whitespace-pre-wrap">
          {turn.inbound || <span className="italic text-muted-foreground">(sem texto)</span>}
          <div className="mt-1 text-right text-[10px] text-muted-foreground">{time(turn.createdAt)}</div>
        </div>
      </div>

      {/* agente */}
      <div className="mt-2 flex">
        <div className="max-w-[80%] rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap">
          {turn.reply ?? (
            <span className="italic text-muted-foreground">
              {turn.error ? `Sem resposta — ${turn.error}` : noReply ? "Sem resposta" : "—"}
            </span>
          )}
        </div>
      </div>

      {/* resumo da decisão */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        {turn.rule && <Badge variant="warning">regra: {turn.rule}</Badge>}
        {turn.theme && <Badge variant="indigo">assunto: {turn.theme}</Badge>}
        {turn.stage && <Badge variant="muted">etapa: {turn.stage}</Badge>}
        {turn.handoff && <Badge variant="destructive">transferiu</Badge>}
        {turn.closed && <Badge variant="secondary">encerrou</Badge>}
        {turn.discardedActions.length > 0 && (
          <Badge variant="outline">ações descartadas: {turn.discardedActions.join(", ")}</Badge>
        )}
        {turn.latencyMs != null && turn.latencyMs > 0 && (
          <span className="text-muted-foreground">
            {(turn.latencyMs / 1000).toFixed(1)}s · {turn.tokens} tokens
          </span>
        )}
      </div>
      {turn.llmReason && (
        <p className="mt-1 text-xs text-muted-foreground">
          <span className="font-medium">Por que respondeu assim:</span> {turn.llmReason}
        </p>
      )}

      {/* problemas sempre visíveis */}
      {problems.length > 0 && (
        <div className="mt-2 space-y-1">
          {problems.map((p, i) => (
            <p key={i} className="flex items-start gap-1 text-xs text-destructive">
              <IconAlertTriangle className="mt-0.5 size-3 shrink-0" />
              <span>
                <span className="font-medium">{p.step}:</span> {p.detail}
              </span>
            </p>
          ))}
        </div>
      )}

      {/* rastro */}
      <div className="mt-2 flex flex-wrap gap-2">
        {turn.trace.length > 0 && (
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => setOpen((v) => !v)}>
            {open ? <IconChevronUp className="size-3" /> : <IconChevronDown className="size-3" />}
            {open ? "Esconder passos" : `Ver passos (${turn.trace.length})`}
          </Button>
        )}
        {(turn.sources?.length ?? 0) > 0 && (
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => setSourcesOpen((v) => !v)}>
            <IconBook className="size-3" />
            {sourcesOpen ? "Esconder trechos" : `Trechos que o agente leu (${turn.sources!.length})`}
          </Button>
        )}
        {!turn.feedback && !reporting && (
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => setReporting(true)}>
            <IconMessageReport className="size-3" />
            Marcar erro
          </Button>
        )}
      </div>
      {open && (
        <ol className="mt-2 space-y-1 border-l pl-3">
          {turn.trace.map((s, i) => (
            <li key={i} className={cn("text-xs", isProblem(s) && "text-destructive")}>
              <span className="mr-1 font-medium">{s.step}</span>
              <span className="text-muted-foreground">+{s.at}ms</span> — {s.detail}
            </li>
          ))}
        </ol>
      )}

      {sourcesOpen && (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-muted-foreground">
            Tudo o que a resposta disser e não estiver aqui (nem nos dados do cliente) foi o modelo que acrescentou.
          </p>
          {turn.sources!.map((src, i) => (
            <div key={i} className="rounded-md border bg-muted/40 p-2 text-xs">
              <p className="mb-1 font-medium">
                {src.title || "Material"}
                {src.similarity != null && (
                  <span className="ml-1 font-normal text-muted-foreground">(similaridade {src.similarity.toFixed(2)})</span>
                )}
              </p>
              <p className="whitespace-pre-wrap text-muted-foreground">{src.content}</p>
            </div>
          ))}
        </div>
      )}

      {/* marcar erro */}
      {reporting && (
        <div className="mt-3 space-y-2">
          <Textarea
            rows={3}
            placeholder="Onde o agente errou e o que você esperava? Ex.: devia ter respondido com o passo a passo do material X em vez de transferir."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={!comment.trim() || mutation.isPending} onClick={() => mutation.mutate()} className="gap-1">
              {mutation.isPending ? <IconLoader2 className="size-4 animate-spin" /> : <IconStethoscope className="size-4" />}
              {mutation.isPending ? "Analisando…" : "Diagnosticar"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setReporting(false)} disabled={mutation.isPending}>
              Cancelar
            </Button>
          </div>
          {mutation.isError && (
            <p className="text-xs text-destructive">{(mutation.error as Error)?.message ?? "Erro ao diagnosticar."}</p>
          )}
        </div>
      )}

      {turn.feedback && <FeedbackView feedback={turn.feedback} />}
    </div>
  );
}

function FeedbackView({ feedback }: { feedback: Feedback }) {
  const [copied, setCopied] = React.useState(false);
  const d = feedback.diagnosis;

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* navegador sem permissão de área de transferência */
    }
  }

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Você marcou:</span> {feedback.comment}
      </p>
      {!d ? (
        <p className="text-xs text-destructive">
          Não foi possível gerar o diagnóstico{feedback.diagnosisError ? `: ${feedback.diagnosisError}` : "."}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={d.categoria === "motor" ? "destructive" : "indigo"}>{CATEGORY_LABEL[d.categoria]}</Badge>
            <span className="text-xs text-muted-foreground">{CONFIDENCE_LABEL[d.confianca]}</span>
          </div>
          <p>
            <span className="font-medium">O que aconteceu:</span> {d.resumo}
          </p>
          <p>
            <span className="font-medium">Causa:</span> {d.causa}
          </p>
          {d.correcoes.length > 0 && (
            <div>
              <p className="font-medium">O que corrigir:</p>
              <ul className="ml-4 list-disc space-y-1">
                {d.correcoes.map((c, i) => (
                  <li key={i}>
                    <span className="font-medium">{c.onde}:</span> {c.oque}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {d.pedidoParaDev && (
            <div className="space-y-1">
              <p className="font-medium">Pedido para o dev:</p>
              <pre className="whitespace-pre-wrap rounded bg-muted p-2 text-xs">{d.pedidoParaDev}</pre>
              <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => copy(d.pedidoParaDev!)}>
                <IconCopy className="size-3" />
                {copied ? "Copiado" : "Copiar"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
