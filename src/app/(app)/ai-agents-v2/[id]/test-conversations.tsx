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
  IconBrandWhatsapp,
  IconBulb,
  IconChevronDown,
  IconCopy,
  IconDeviceMobile,
  IconLoader2,
  IconMessageReport,
  IconMessages,
  IconRefresh,
  IconRotate,
  IconStethoscope,
} from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, parseApiResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

import { BlockHeader, IconChip, Pill, SURFACE, Segmented } from "./ui";

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
  const testNumbers = query.data?.testNumbers ?? [];

  return (
    <div className="space-y-4">
      <section className={cn(SURFACE, "space-y-4 p-5 sm:p-6")}>
        <BlockHeader
          icon={IconBrandWhatsapp}
          tone="emerald"
          title="Conversas pelo WhatsApp"
          description="O que os números de teste conversaram com o agente nos últimos 7 dias, com o passo a passo de cada decisão."
          actions={
            <Button variant="ghost" size="sm" className="h-8 gap-1 text-muted-foreground" onClick={() => query.refetch()}>
              <IconRefresh className={cn("size-4", query.isFetching && "animate-spin")} />
              Atualizar
            </Button>
          }
        />
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-[13px] dark:bg-muted/40">
          <span className="text-muted-foreground">Números de teste</span>
          {testNumbers.length > 0 ? (
            testNumbers.map((n) => (
              <Pill key={n} tone="emerald" icon={IconDeviceMobile}>
                {n}
              </Pill>
            ))
          ) : (
            <span className="text-amber-700 dark:text-amber-400">
              nenhum — cadastre em “Publicação” › “Fase de teste” e publique.
            </span>
          )}
          <span className="text-xs text-muted-foreground sm:ml-auto">
            Mande <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px] text-foreground ring-1 ring-border dark:bg-card">#reset</code> para
            recomeçar do zero
          </span>
        </div>
      </section>

      {query.isLoading && <Skeleton className="h-48 rounded-2xl" />}
      {query.isError && (
        <p className="text-sm text-destructive">{(query.error as Error)?.message ?? "Erro ao carregar."}</p>
      )}
      {!query.isLoading && contacts.length === 0 && testNumbers.length > 0 && (
        <p className="rounded-2xl border border-dashed border-border bg-white px-4 py-8 text-center text-sm text-muted-foreground dark:bg-card">
          Nenhuma conversa dos números de teste nos últimos 7 dias.
        </p>
      )}

      {contacts.length > 1 && current && (
        <Segmented
          value={current.contactId}
          onChange={setSelected}
          options={contacts.map((c) => ({ value: c.contactId, label: c.name ?? c.phone ?? c.contactId }))}
        />
      )}

      {current?.sessions.map((session, i) => {
        const turns = session.turns.filter((t) => !t.isReset).length;
        return (
          <section key={`${session.startedAt}-${i}`} className={cn(SURFACE, "overflow-hidden")}>
            <header className="flex flex-wrap items-center gap-3 border-b border-border/70 px-5 py-3">
              <IconChip icon={session.turns[0]?.isReset ? IconRotate : IconMessages} tone={i === 0 ? "emerald" : "slate"} size="sm" />
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[13px] font-semibold">
                  Sessão de {dateTime(session.startedAt)}
                  {i === 0 && <Pill tone="blue">mais recente</Pill>}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[current.name, current.phone].filter(Boolean).join(" · ")}
                </p>
              </div>
              <span className="ml-auto text-xs text-muted-foreground">
                {turns} {turns === 1 ? "mensagem" : "mensagens"}
              </span>
            </header>
            <div className="space-y-4 bg-[#EFEAE2] px-3 py-4 sm:px-5 dark:bg-muted/30">
              {session.turns.map((turn) =>
                turn.isReset ? (
                  <p
                    key={turn.id}
                    className="mx-auto flex w-fit items-center gap-1.5 rounded-md bg-[#FFF3C4] px-2.5 py-1 text-[11px] text-[#54656F] shadow-sm"
                  >
                    <IconRotate className="size-3" /> #reset às {time(turn.createdAt)}
                  </p>
                ) : (
                  <TurnCard key={turn.id} agentId={agentId} turn={turn} />
                ),
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Botão pequeno sob a bolha, no estilo do celular de teste. */
function ChatAction({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-full bg-white/85 px-2.5 py-0.5 text-[11px] font-medium text-[#54656F] shadow-sm hover:bg-white hover:text-foreground dark:bg-card dark:text-muted-foreground"
    >
      {children}
    </button>
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
    <div className="space-y-1.5">
      {/* cliente */}
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-lg rounded-tr-none bg-[#D9FDD3] px-2.5 pb-1 pt-1.5 text-[13.5px] leading-snug text-[#111B21] shadow-sm">
          <span className="whitespace-pre-wrap">{turn.inbound || <span className="italic text-[#667781]">(sem texto)</span>}</span>
          <span className="ml-2 inline-block translate-y-0.5 whitespace-nowrap text-[10px] text-[#667781]">{time(turn.createdAt)}</span>
        </div>
      </div>

      {/* agente */}
      <div className="flex flex-col items-start gap-1.5">
        <div
          className={cn(
            "max-w-[85%] rounded-lg rounded-tl-none px-2.5 pb-1.5 pt-1.5 text-[13.5px] leading-snug shadow-sm",
            turn.reply ? "bg-white text-[#111B21]" : "bg-white/70 text-[#667781]",
          )}
        >
          <span className="whitespace-pre-wrap">
            {turn.reply ?? (
              <span className="italic">{turn.error ? `Sem resposta — ${turn.error}` : noReply ? "Sem resposta" : "—"}</span>
            )}
          </span>
        </div>

        {/* resumo da decisão */}
        <div className="flex max-w-full flex-wrap items-center gap-1">
          {turn.theme && <Pill tone="violet">{turn.theme}</Pill>}
          {turn.rule && <Pill tone="amber">atalho: {turn.rule}</Pill>}
          {turn.stage && <Pill tone="slate">etapa: {turn.stage}</Pill>}
          {turn.handoff && <Pill tone="rose">transferiu</Pill>}
          {turn.closed && <Pill tone="slate">encerrou</Pill>}
          {turn.discardedActions.length > 0 && <Pill tone="amber">descartou: {turn.discardedActions.join(", ")}</Pill>}
          {turn.latencyMs != null && turn.latencyMs > 0 && (
            <span className="px-1 text-[10.5px] text-[#54656F] dark:text-muted-foreground">
              {(turn.latencyMs / 1000).toFixed(1)}s · {turn.tokens} tokens
            </span>
          )}
        </div>

        {turn.llmReason && (
          <p className="flex max-w-[85%] gap-1.5 rounded-lg bg-white/80 px-2.5 py-1.5 text-xs text-[#54656F] dark:bg-card dark:text-muted-foreground">
            <IconBulb className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
            <span>{turn.llmReason}</span>
          </p>
        )}

        {/* problemas sempre visíveis */}
        {problems.length > 0 && (
          <div className="max-w-[85%] space-y-1 rounded-lg bg-rose-50 px-2.5 py-1.5 dark:bg-rose-500/10">
            {problems.map((p, i) => (
              <p key={i} className="flex items-start gap-1 text-xs text-rose-700 dark:text-rose-300">
                <IconAlertTriangle className="mt-0.5 size-3 shrink-0" />
                <span>
                  <span className="font-medium">{p.step}:</span> {p.detail}
                </span>
              </p>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-1">
          {turn.trace.length > 0 && (
            <ChatAction onClick={() => setOpen((v) => !v)}>
              <IconChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
              {open ? "Esconder passos" : `Passos (${turn.trace.length})`}
            </ChatAction>
          )}
          {(turn.sources?.length ?? 0) > 0 && (
            <ChatAction onClick={() => setSourcesOpen((v) => !v)}>
              <IconBook className="size-3" />
              {sourcesOpen ? "Esconder trechos" : `Trechos lidos (${turn.sources!.length})`}
            </ChatAction>
          )}
          {!turn.feedback && !reporting && (
            <ChatAction onClick={() => setReporting(true)}>
              <IconMessageReport className="size-3" />
              Marcar erro
            </ChatAction>
          )}
        </div>
      </div>

      {open && (
        <ol className="space-y-1 rounded-xl bg-white p-3 shadow-sm dark:bg-card">
          {turn.trace.map((s, i) => (
            <li key={i} className={cn("flex gap-2 text-xs", isProblem(s) && "text-rose-700 dark:text-rose-300")}>
              <span className="w-14 shrink-0 text-right tabular-nums text-muted-foreground">+{s.at}ms</span>
              <span>
                <span className="mr-1 font-semibold">{s.step}</span>
                {s.detail}
              </span>
            </li>
          ))}
        </ol>
      )}

      {sourcesOpen && (
        <div className="space-y-2 rounded-xl bg-white p-3 shadow-sm dark:bg-card">
          <p className="text-xs text-muted-foreground">
            Tudo o que a resposta disser e não estiver aqui (nem nos dados do cliente) foi o modelo que acrescentou.
          </p>
          {turn.sources!.map((src, i) => (
            <div key={i} className="rounded-lg border border-border/70 bg-slate-50 p-2.5 text-xs dark:bg-muted/40">
              <p className="mb-1 font-semibold">
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
        <div className="space-y-2 rounded-xl bg-white p-3 shadow-sm dark:bg-card">
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
    <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10">
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
