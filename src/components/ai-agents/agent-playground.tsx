"use client";

import { apiUrl } from "@/lib/api";
import { useMutation } from "@tanstack/react-query";
import { IconLoader2 as Loader2, IconSend as Send, IconSparkles as Sparkles, IconTool as Wrench } from "@tabler/icons-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Turn =
  | { role: "user" | "assistant"; content: string }
  | {
      role: "tool";
      name: string;
      args: unknown;
      result: unknown;
    };

type RunResponse = {
  runId: string;
  text: string;
  status: "COMPLETED" | "FAILED" | "HANDOFF";
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  autonomyMode: "AUTONOMOUS" | "DRAFT";
  toolCalls: Array<{ name: string; args: unknown; result: unknown }>;
  error?: string;
  message?: string;
};

/**
 * Playground de teste por agente.
 *
 * Não toca em conversas reais: dispara `POST /api/ai-agents/:id/test`
 * com um histórico em memória. Mostra tool-calls feitas pelo agente
 * pra facilitar debug de prompt + tools.
 */
export function AgentPlayground({
  agentId,
  agentName,
  open,
  onOpenChange,
}: {
  agentId: string | null;
  agentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [input, setInput] = React.useState("");
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [totalCost, setTotalCost] = React.useState(0);
  const [totalTokens, setTotalTokens] = React.useState(0);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) {
      setTurns([]);
      setInput("");
      setTotalCost(0);
      setTotalTokens(0);
    }
  }, [open]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [turns]);

  const mutation = useMutation({
    mutationFn: async (message: string): Promise<RunResponse> => {
      if (!agentId) throw new Error("Agente inválido.");
      const history = turns
        .filter((t): t is Turn & { role: "user" | "assistant" } =>
          t.role === "user" || t.role === "assistant",
        )
        .map((t) => ({ role: t.role, content: t.content }));
      const res = await fetch(apiUrl(`/api/ai-agents/${agentId}/test`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      const data = (await res.json()) as RunResponse;
      if (!res.ok) throw new Error(data.message ?? "Erro ao executar agente.");
      return data;
    },
    onSuccess: (data) => {
      setTurns((prev) => {
        const next: Turn[] = [...prev];
        for (const call of data.toolCalls) {
          next.push({
            role: "tool",
            name: call.name,
            args: call.args,
            result: call.result,
          });
        }
        if (data.text) {
          next.push({ role: "assistant", content: data.text });
        }
        return next;
      });
      setTotalCost((c) => c + data.costUsd);
      setTotalTokens((t) => t + data.inputTokens + data.outputTokens);
    },
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const message = input.trim();
    if (!message || mutation.isPending) return;
    setInput("");
    setTurns((prev) => [...prev, { role: "user", content: message }]);
    mutation.mutate(message);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="max-h-[85vh]">
        <DialogClose />
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-[var(--brand-primary)]" />
            Playground — {agentName}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div
            ref={scrollRef}
            className="max-h-[50vh] min-h-[260px] overflow-y-auto rounded-xl border bg-muted/30 p-3"
          >
            {turns.length === 0 && !mutation.isPending ? (
              <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground">
                <Sparkles className="size-5 opacity-50" />
                <p>Envie uma mensagem pra testar o agente.</p>
                <p className="text-[11px]">
                  Nada aqui é salvo em conversas reais.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {turns.map((t, i) => (
                  <TurnRow key={i} turn={t} />
                ))}
                {mutation.isPending && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" />
                    Agente pensando...
                  </div>
                )}
              </div>
            )}
          </div>

          {mutation.isError && (
            <div className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
              {mutation.error instanceof Error
                ? mutation.error.message
                : "Erro"}
            </div>
          )}

          <form onSubmit={handleSend} className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Digite a mensagem do cliente..."
              disabled={mutation.isPending}
              className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]/40"
            />
            <Button
              type="submit"
              disabled={mutation.isPending || !input.trim()}
              className="gap-1.5"
            >
              <Send className="size-3.5" />
              Enviar
            </Button>
          </form>

          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {totalTokens.toLocaleString("pt-BR")} tokens •{" "}
              US$ {totalCost.toFixed(4)}
            </span>
            <span>Histórico em memória — não é salvo em nenhuma conversa.</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TurnRow({ turn }: { turn: Turn }) {
  if (turn.role === "tool") {
    return (
      <div className="rounded-lg border border-[var(--color-warning)]/50 bg-[var(--color-warn-bg)]/50 p-2 text-[11px] dark:border-amber-700/50 dark:bg-amber-950/20">
        <div className="flex items-center gap-1 font-medium text-[var(--color-warn-text)] dark:text-[var(--color-warning)]/70">
          <Wrench className="size-3" /> tool: {turn.name}
        </div>
        <details className="mt-1">
          <summary className="cursor-pointer text-[10px] text-[var(--color-amber-text)]/80 dark:text-[var(--color-amber-muted)]/70">
            args / result
          </summary>
          <pre className="mt-1 max-h-40 overflow-auto rounded bg-background/70 p-2 text-[10px] leading-tight">
            {JSON.stringify({ args: turn.args, result: turn.result }, null, 2)}
          </pre>
        </details>
      </div>
    );
  }
  const isUser = turn.role === "user";
  return (
    <div
      className={
        isUser
          ? "max-w-[80%] self-end rounded-2xl rounded-br-sm bg-[var(--color-brand-primary)] px-3 py-2 text-sm text-white"
          : "max-w-[80%] self-start rounded-2xl rounded-bl-sm bg-background px-3 py-2 text-sm shadow-sm"
      }
    >
      {turn.content}
    </div>
  );
}
