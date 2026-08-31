"use client";

import * as React from "react";
import { IconAlertCircle as AlertCircle, IconCircleCheck as CheckCircle2, IconChevronRight as ChevronRight, IconInbox as Inbox, IconLoader2 as Loader2, IconSparkles as Sparkles, IconCircleX as XCircle } from "@tabler/icons-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  isBulkOperationFinished,
  useBulkOperation,
  type BulkOperationStatus,
  type BulkOperationStatusResponse,
  type BulkOperationType,
} from "@/hooks/use-bulk-operation";
import { cn } from "@/lib/utils";

const TYPE_LABELS: Partial<Record<BulkOperationType, string>> = {
  DEAL_BULK_MOVE_STAGE: "Mover negócios entre etapas",
  DEAL_BULK_UPDATE_FIELDS: "Atualizar campos personalizados",
};

const STATUS_LABELS: Record<BulkOperationStatus, string> = {
  PENDING: "Aguardando worker",
  PROCESSING: "Processando",
  COMPLETED: "Concluída",
  PARTIAL: "Concluída com falhas",
  FAILED: "Falhou",
  CANCELLED: "Cancelada",
};

const STATUS_BADGE_VARIANT: Record<
  BulkOperationStatus,
  React.ComponentProps<typeof Badge>["variant"]
> = {
  PENDING: "muted",
  PROCESSING: "default",
  COMPLETED: "success",
  PARTIAL: "warning",
  FAILED: "destructive",
  CANCELLED: "muted",
};

/**
 * Hero — círculo glass grande exibindo o ícone do status atual com aura
 * animada (pulse durante processamento, scale-in ao concluir). Substitui
 * o ícone pequeno antigo no DialogTitle, dando a sensação de "operação
 * importante em andamento" parecido com toasts de OS modernos (macOS Send
 * Anywhere, GitHub Codespaces creating, etc).
 */
function HeroIcon({ status }: { status: BulkOperationStatus | undefined }) {
  const tone = (() => {
    if (!status || status === "PENDING") return "pending";
    if (status === "PROCESSING") return "processing";
    if (status === "COMPLETED") return "success";
    if (status === "PARTIAL") return "warning";
    if (status === "CANCELLED") return "muted";
    return "danger";
  })();

  const ringClass = cn(
    "relative flex size-16 shrink-0 items-center justify-center rounded-full border backdrop-blur-md transition-colors",
    tone === "pending" &&
      "border-[var(--glass-border-subtle)] bg-[var(--glass-bg-subtle)] text-[var(--text-muted)]",
    tone === "processing" &&
      "border-[var(--brand-primary)]/40 bg-[var(--brand-primary)]/15 text-[var(--brand-primary)]",
    tone === "success" &&
      "border-[var(--color-success)]/40 bg-[var(--color-success-bg)] text-[var(--color-success-text)]",
    tone === "warning" &&
      "border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 text-[var(--color-warning)]",
    tone === "danger" &&
      "border-[var(--color-danger)]/40 bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]",
    tone === "muted" &&
      "border-[var(--glass-border-subtle)] bg-[var(--glass-bg-subtle)] text-[var(--text-muted)]",
  );

  return (
    <div className="relative flex size-16 shrink-0 items-center justify-center">
      {/* Aura externa: pulsa enquanto processa, fica em loop sutil
          enquanto pendente, reset zoom-in ao concluir */}
      {(tone === "pending" || tone === "processing") && (
        <span
          className={cn(
            "absolute inset-0 rounded-full",
            tone === "pending"
              ? "bg-[var(--glass-bg-subtle)]"
              : "bg-[var(--brand-primary)]/20",
          )}
          style={{
            animation: "pulse-custom 2.4s ease-in-out infinite",
          }}
          aria-hidden
        />
      )}
      <div
        className={ringClass}
        style={
          tone === "success" || tone === "warning" || tone === "danger"
            ? { animation: "scale-in 0.4s ease-out" }
            : undefined
        }
      >
        {tone === "pending" && <Inbox className="size-7" strokeWidth={2} />}
        {tone === "processing" && (
          <Loader2 className="size-7 animate-spin" strokeWidth={2} />
        )}
        {tone === "success" && <Sparkles className="size-7" strokeWidth={2} />}
        {tone === "warning" && (
          <AlertCircle className="size-7" strokeWidth={2} />
        )}
        {tone === "danger" && <XCircle className="size-7" strokeWidth={2} />}
        {tone === "muted" && <XCircle className="size-7" strokeWidth={2} />}
      </div>
    </div>
  );
}

/**
 * Stepper horizontal com 3 fases: Enfileirado → Processando → Concluído.
 * Visualmente parecido com o stepper de checkout/onboarding — dá uma
 * sensação de progresso mesmo antes da barra acumular %, especialmente
 * útil quando o worker ainda não pegou o job (status PENDING).
 */
function PhaseStepper({ status }: { status: BulkOperationStatus | undefined }) {
  const phase = (() => {
    if (!status || status === "PENDING") return 0;
    if (status === "PROCESSING") return 1;
    return 2;
  })();

  const phases = [
    { label: "Enfileirado", idx: 0 },
    { label: "Processando", idx: 1 },
    { label: "Concluído", idx: 2 },
  ];

  return (
    <ol className="flex items-center justify-center gap-1.5 text-[10px] font-medium uppercase tracking-wide">
      {phases.map((p, i) => {
        const isDone = phase > p.idx;
        const isCurrent = phase === p.idx;
        return (
          <React.Fragment key={p.label}>
            <li
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2 py-0.5 transition-colors",
                isDone &&
                  "border-[var(--color-success)]/40 bg-[var(--color-success-bg)] text-[var(--color-success-text)]",
                isCurrent &&
                  "border-[var(--brand-primary)]/40 bg-[var(--brand-primary)]/15 text-[var(--brand-primary)]",
                !isDone &&
                  !isCurrent &&
                  "border-[var(--glass-border-subtle)] bg-[var(--glass-bg-subtle)] text-[var(--text-muted)]",
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  isDone && "bg-[var(--color-success)]",
                  isCurrent && "bg-[var(--brand-primary)]",
                  !isDone &&
                    !isCurrent &&
                    "bg-[var(--glass-border)]",
                )}
                style={
                  isCurrent
                    ? { animation: "pulse-dot 1.4s ease-in-out infinite" }
                    : undefined
                }
              />
              {p.label}
            </li>
            {i < phases.length - 1 && (
              <ChevronRight
                className="size-3 shrink-0 text-[var(--text-muted)]"
                strokeWidth={2}
              />
            )}
          </React.Fragment>
        );
      })}
    </ol>
  );
}

/**
 * Hook utilitário: estima o tempo restante baseado na taxa de processamento
 * desde o primeiro `processed > 0`. Retorna null nas fases sem dados ou
 * quando a estimativa é instável (poucos itens processados).
 *
 * Heurística simples (rate constante a partir do primeiro tick com >0):
 *   - Memoriza o instante T0 quando viu `processed > 0` pela primeira vez.
 *   - rate = processed / elapsedSinceT0
 *   - etaSeconds = (total - processed) / rate
 *
 * Não tenta suavizar com média móvel — UI exibe valor "vivo" porque o
 * polling é a 1.5s e o user prefere ver atualização imediata.
 */
function useEtaSeconds(
  processed: number,
  total: number,
  isFinished: boolean,
): number | null {
  const t0Ref = React.useRef<{ at: number; processed: number } | null>(null);
  const [tick, setTick] = React.useState(0);

  // Tick a 1Hz pra fazer o ETA "decair" mesmo sem novo polling
  React.useEffect(() => {
    if (isFinished) return;
    if (processed <= 0) return;
    const i = window.setInterval(() => setTick((v) => v + 1), 1000);
    return () => window.clearInterval(i);
  }, [isFinished, processed]);

  React.useEffect(() => {
    if (isFinished) return;
    if (processed > 0 && !t0Ref.current) {
      t0Ref.current = { at: Date.now(), processed };
    }
    if (isFinished) {
      t0Ref.current = null;
    }
  }, [processed, isFinished]);

  if (isFinished) return null;
  if (processed <= 0 || total <= 0) return null;
  if (!t0Ref.current) return null;

  const elapsedMs = Date.now() - t0Ref.current.at;
  const processedSinceT0 = Math.max(0, processed - t0Ref.current.processed);
  if (elapsedMs < 1500 || processedSinceT0 < 1) return null;

  const rate = processedSinceT0 / (elapsedMs / 1000);
  if (rate <= 0) return null;

  const remaining = Math.max(0, total - processed);
  const eta = remaining / rate;
  if (!Number.isFinite(eta)) return null;
  // Suprimir warning de unused (precisamos do tick pra forçar re-render):
  void tick;
  return Math.round(eta);
}

function formatEta(seconds: number): string {
  if (seconds <= 0) return "concluindo…";
  if (seconds < 60) return `~${seconds}s restantes`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 10) return `~${m}m ${String(s).padStart(2, "0")}s restantes`;
  return `~${m} min restantes`;
}

export type BulkOperationProgressDialogProps = {
  /** ID da BulkOperation a acompanhar. Null/undefined = modal fechado. */
  operationId: string | null;
  /** Controlado: o pai decide quando fechar (geralmente seta operationId=null). */
  onOpenChange: (open: boolean) => void;
  /**
   * Callback disparado UMA VEZ quando a operação atinge status terminal
   * (COMPLETED, PARTIAL, FAILED, CANCELLED), independente do modal estar
   * aberto. Tipicamente o consumidor faz `queryClient.invalidateQueries`
   * + limpa estado de seleção. Recebe a resposta completa pra que UIs
   * possam ler `failed`, `succeeded`, etc.
   */
  onFinished?: (data: BulkOperationStatusResponse) => void;
  /** Override do título; default = label do tipo. */
  title?: string;
  /** Override da descrição abaixo do título. */
  description?: string;
  /** Total de itens esperado (vindo do POST 202). Mostrado enquanto o
   *  backend ainda não preencheu `total` ao iniciar. */
  optimisticTotal?: number;
  /**
   * Quando true, o acompanhamento continua ativo (polling segue rodando e
   * `onFinished` ainda dispara), mas o modal fica oculto — o pai exibe um
   * pill flutuante para reabrir. Diferente de `operationId=null`, que encerra
   * o acompanhamento por completo.
   */
  minimized?: boolean;
  /**
   * Disparado quando o usuário fecha o painel ANTES de terminar. O pai deve
   * apenas minimizar (manter `operationId`), não zerar o acompanhamento.
   */
  onMinimize?: () => void;
};

/**
 * Modal de acompanhamento de uma operação em massa (BulkOperation).
 *
 * UI: hero icon circular grande + stepper de fases + barra de progresso
 * com gradiente animado (shimmer durante PROCESSING, listras
 * indeterminate quando PENDING) + ETA estimado client-side + cards de
 * contadores em glass + lista colapsável de erros. Tudo respeitando o
 * tema do projeto (glass tokens light/dark).
 *
 * Comportamento:
 *  - Polling via `useBulkOperation` enquanto o status não for terminal.
 *  - Se o usuário fechar antes da operação terminar, mostra um toast
 *    informativo — o job continua rodando no worker e o callback
 *    `onFinished` ainda dispara quando o status terminal chegar.
 *  - `onFinished` dispara UMA vez por operação (resistente a re-renders).
 */
export function BulkOperationProgressDialog({
  operationId,
  onOpenChange,
  onFinished,
  title,
  description,
  optimisticTotal,
  minimized,
  onMinimize,
}: BulkOperationProgressDialogProps) {
  const open = !!operationId && !minimized;
  const { data, error, isLoading, refetch } = useBulkOperation(operationId);
  const [cancelling, setCancelling] = React.useState(false);

  const status = data?.status;
  const isFinished = isBulkOperationFinished(status);
  const total = data?.total ?? optimisticTotal ?? 0;
  const processed = data?.processed ?? 0;
  const progressPercent =
    data?.progressPercent ??
    (total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0);

  const etaSeconds = useEtaSeconds(processed, total, isFinished);

  // Garante que `onFinished` e o toast terminal disparem UMA vez por
  // operação. Usamos ref de operationId concluído pra resistir a
  // re-renders e a múltiplas refetches retornando o mesmo terminal.
  const finishedForRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!data) return;
    if (!isBulkOperationFinished(data.status)) return;
    if (finishedForRef.current === data.id) return;
    finishedForRef.current = data.id;

    if (data.status === "COMPLETED") {
      toast.success(
        `Operação concluída — ${data.succeeded} de ${data.total} processados.`,
      );
    } else if (data.status === "PARTIAL") {
      toast.warning(
        `Operação concluída com falhas — ${data.succeeded} ok, ${data.failed} falhas.`,
      );
    } else if (data.status === "FAILED") {
      toast.error(
        `Operação falhou — ${data.failed} erros em ${data.total} itens.`,
      );
    } else if (data.status === "CANCELLED") {
      toast.message("Operação cancelada.");
    }
    onFinished?.(data);
  }, [data, onFinished]);

  // Reset do ref quando troca de operação (modal reabriu com outro id).
  React.useEffect(() => {
    if (
      operationId &&
      finishedForRef.current &&
      finishedForRef.current !== operationId
    ) {
      finishedForRef.current = null;
    }
  }, [operationId]);

  const handleOpenChange = (next: boolean) => {
    if (!next && !isFinished && operationId) {
      // Fechou no meio do processamento — minimiza em vez de encerrar: o
      // worker segue e o pai mostra um pill flutuante para reabrir.
      if (onMinimize) {
        toast.message("A operação continua em segundo plano.", {
          description: `${processed} de ${total} processados até agora.`,
        });
        onMinimize();
        return;
      }
      toast.message("A operação continua em segundo plano.", {
        description: `${processed} de ${total} processados até agora.`,
      });
    }
    onOpenChange(next);
  };

  const resolvedTitle =
    title ??
    (data?.type
      ? TYPE_LABELS[data.type] ?? "Operação em massa"
      : "Operação em massa");

  const resolvedDescription =
    description ??
    (isFinished
      ? "Resultado da execução do worker."
      : "Acompanhe o progresso. Você pode fechar este painel a qualquer momento — a operação continua em segundo plano.");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="md" onClick={(e) => e.stopPropagation()}>
        {/* Header com hero icon centralizado — visual diferenciado dos
            dialogs comuns do app porque é um "estado de execução em
            andamento", não um form. */}
        <DialogHeader className="items-center text-center sm:items-center sm:text-center">
          <div className="mb-2 flex w-full justify-center">
            <HeroIcon status={status} />
          </div>
          <DialogTitle className="text-center">{resolvedTitle}</DialogTitle>
          <DialogDescription className="text-center">
            {resolvedDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Stepper de fases */}
          <PhaseStepper status={status} />

          {/* Bar + porcentagem + ETA */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-[12px] font-medium">
              <span className="flex items-center gap-2">
                {status && (
                  <Badge variant={STATUS_BADGE_VARIANT[status]}>
                    {STATUS_LABELS[status]}
                  </Badge>
                )}
                <span className="text-[var(--text-secondary)] tabular-nums">
                  {processed} / {total || "?"}
                </span>
              </span>
              <span className="font-display text-[14px] font-bold tabular-nums text-[var(--text-primary)]">
                {progressPercent}%
              </span>
            </div>

            {/* Track + fill com gradiente + shimmer overlay quando ativo */}
            <div
              className="relative h-2.5 w-full overflow-hidden rounded-full border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-subtle)]"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPercent}
            >
              {/* Modo PENDING (worker ainda não pegou o job): listras
                  animadas que se deslocam — feedback de "alguma coisa
                  está acontecendo" mesmo com 0% real. */}
              {(!status || status === "PENDING") ? (
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(45deg, rgba(91,111,245,0.18) 0, rgba(91,111,245,0.18) 8px, transparent 8px, transparent 16px)",
                    animation: "shimmer 1.6s linear infinite",
                    backgroundSize: "32px 32px",
                  }}
                  aria-hidden
                />
              ) : (
                <>
                  {/* Fill principal com gradiente. Cor depende do status
                      final pra dar feedback imediato (ex.: já pintou de
                      vermelho se falhou no meio). */}
                  <div
                    className={cn(
                      "absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out",
                      status === "FAILED" &&
                        "bg-[var(--color-danger)]",
                      status === "PARTIAL" &&
                        "bg-[var(--color-warning)]",
                      status === "COMPLETED" &&
                        "bg-[var(--color-success)]",
                      status === "PROCESSING" &&
                        "bg-gradient-to-r from-[var(--brand-primary)] via-violet-500 to-fuchsia-500",
                      status === "CANCELLED" && "bg-[var(--glass-border)]",
                    )}
                    style={{ width: `${Math.max(2, progressPercent)}%` }}
                  />
                  {/* Shimmer overlay enquanto está processando. Gradient
                      que se move sobre o fill, criando efeito "liquid
                      progress" parecido com Figma/Linear. */}
                  {status === "PROCESSING" && progressPercent > 0 && (
                    <div
                      className="pointer-events-none absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: `${Math.max(2, progressPercent)}%`,
                        backgroundImage:
                          "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.45) 50%, transparent 100%)",
                        backgroundSize: "200% 100%",
                        animation: "shimmer 1.8s linear infinite",
                        mixBlendMode: "overlay",
                      }}
                      aria-hidden
                    />
                  )}
                </>
              )}
            </div>

            {/* ETA — só aparece com dados pra estimar */}
            <div className="flex h-4 items-center justify-end text-[11px] tabular-nums text-[var(--text-muted)]">
              {!isFinished && etaSeconds !== null
                ? formatEta(etaSeconds)
                : !isFinished && status === "PROCESSING"
                  ? "calculando…"
                  : ""}
            </div>
          </div>

          {/* Counters glass — light/dark via tokens */}
          {data && (
            <div className="grid grid-cols-3 gap-2">
              <Counter label="Total" value={data.total} tone="default" />
              <Counter
                label="Sucesso"
                value={data.succeeded}
                tone="success"
                animateUp
              />
              <Counter
                label="Falhas"
                value={data.failed}
                tone={data.failed > 0 ? "danger" : "muted"}
              />
            </div>
          )}

          {/* Loading inicial com 3 dots */}
          {isLoading && !data && (
            <div className="flex items-center justify-center gap-1.5 py-2 text-xs text-[var(--text-muted)]">
              <span>Conectando ao worker</span>
              <span className="flex items-center gap-0.5">
                <span
                  className="size-1 rounded-full bg-current"
                  style={{
                    animation: "typing-dot 1.4s ease-in-out infinite",
                  }}
                />
                <span
                  className="size-1 rounded-full bg-current"
                  style={{
                    animation: "typing-dot 1.4s ease-in-out infinite 0.2s",
                  }}
                />
                <span
                  className="size-1 rounded-full bg-current"
                  style={{
                    animation: "typing-dot 1.4s ease-in-out infinite 0.4s",
                  }}
                />
              </span>
            </div>
          )}

          {/* Erro no fetch do status (não erro da operação em si) */}
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-bg)] px-3 py-2 text-xs text-[var(--color-danger-text)]">
              <AlertCircle className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
              <span>
                Não foi possível consultar o progresso:{" "}
                {(error as Error).message}
              </span>
            </div>
          )}

          {/* Lista de falhas por item — colapsável */}
          {data && data.errors.length > 0 && (
            <details className="group rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-3 py-2 text-xs text-[var(--color-warning)]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-semibold">
                <span className="flex items-center gap-1.5">
                  <AlertCircle className="size-3.5" strokeWidth={2} />
                  Ver {data.errors.length}{" "}
                  {data.errors.length === 1 ? "erro" : "erros"}
                  {data.errorsTruncated && (
                    <span className="text-[10px] font-normal opacity-70">
                      (lista truncada)
                    </span>
                  )}
                </span>
                <ChevronRight
                  className="size-3.5 transition-transform group-open:rotate-90"
                  strokeWidth={2}
                />
              </summary>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto pr-1">
                {data.errors.map((err, i) => (
                  <li
                    key={`${err.itemId}-${i}`}
                    className="rounded-md border border-[var(--color-warning)]/20 bg-[var(--glass-bg-strong)] px-2 py-1.5 text-[var(--text-secondary)] backdrop-blur-sm"
                  >
                    <span className="font-mono text-[10px] text-[var(--color-warning)]">
                      {err.itemId}
                    </span>
                    <span className="mx-1 opacity-50">·</span>
                    <span className="break-words">{err.message}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {/* Estado COMPLETED sem erros — celebração discreta */}
          {data &&
            data.status === "COMPLETED" &&
            data.errors.length === 0 &&
            data.failed === 0 && (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-[var(--color-success)]/20 bg-[var(--color-success-bg)] px-3 py-2 text-xs font-medium text-[var(--color-success-text)]">
                <CheckCircle2 className="size-4" strokeWidth={2} />
                <span>
                  Tudo certo — {data.succeeded}{" "}
                  {data.succeeded === 1
                    ? "item processado"
                    : "itens processados"}{" "}
                  sem falhas.
                </span>
              </div>
            )}
        </div>

        <DialogFooter>
          {!isFinished && operationId ? (
            <Button
              type="button"
              variant="destructive"
              disabled={cancelling}
              onClick={() => {
                void (async () => {
                  setCancelling(true);
                  try {
                    const res = await fetch(apiUrl(`/api/bulk-operations/${operationId}`), {
                      method: "POST",
                    });
                    if (!res.ok) {
                      const body = await res.json().catch(() => ({}));
                      throw new Error(
                        (body as { message?: string }).message ?? "Falha ao cancelar.",
                      );
                    }
                    toast.message("Cancelando a operação…");
                    await refetch();
                  } catch (err) {
                    toast.error(
                      err instanceof Error ? err.message : "Não foi possível cancelar.",
                    );
                  } finally {
                    setCancelling(false);
                  }
                })();
              }}
            >
              {cancelling ? "Cancelando…" : "Cancelar operação"}
            </Button>
          ) : null}
          <Button
            type="button"
            variant={isFinished ? "default" : "outline"}
            onClick={() => handleOpenChange(false)}
          >
            {isFinished ? "Fechar" : "Continuar em segundo plano"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Card individual de contador. Glass tokens, suporta light/dark via
 * variáveis CSS. Tone aplica borda + cor do número; o label fica em
 * uppercase muted.
 */
function Counter({
  label,
  value,
  tone = "default",
  animateUp,
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "danger" | "muted";
  /**
   * Quando true, anima o número subindo com transition leve. Hoje é
   * apenas um destaque visual via key — o número renumera com efeito
   * suave de scale-in. Útil pro contador de Sucesso ir "subindo" de
   * forma orgânica.
   */
  animateUp?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-0.5 rounded-xl border bg-[var(--glass-bg-strong)] px-2 py-2.5 backdrop-blur-md transition-colors",
        tone === "success" &&
          "border-[var(--color-success)]/20",
        tone === "danger" && "border-[var(--color-danger)]/20",
        tone === "muted" && "border-[var(--glass-border-subtle)]",
        tone === "default" && "border-[var(--glass-border-subtle)]",
      )}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </div>
      <div
        key={animateUp ? value : undefined}
        className={cn(
          "font-display text-2xl font-bold tabular-nums",
          tone === "success" && "text-[var(--color-success-text)]",
          tone === "danger" && "text-[var(--color-danger-text)]",
          tone === "muted" && "text-[var(--text-muted)]",
          tone === "default" && "text-[var(--text-primary)]",
        )}
        style={
          animateUp ? { animation: "scale-in 0.3s ease-out" } : undefined
        }
      >
        {value}
      </div>
    </div>
  );
}
