"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { IconBolt, IconLoader2 } from "@tabler/icons-react";

import { apiUrl } from "@/lib/api";

/**
 * AutomationPickerList — lista as automações com gatilho `manual` ativas e
 * dispara a escolhida para o contato/conversa atual (botão "+" do composer).
 *
 * Reaproveita o mesmo contrato de backend do RunAutomationButton:
 *   GET  /api/automations?triggerType=manual&active=true
 *   POST /api/automations/{id}/run  { contactId, conversationId, dealId? }
 *
 * Disponível para todos (sem permissão), igual aos templates. Erros viram
 * toast e não quebram a UI. UX espelha o InternalTemplatePickerList.
 */

type ManualAutomation = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  triggerType: string;
  stepCount: number;
  createdAt?: string;
};

type ListResponse = {
  items: ManualAutomation[];
  total: number;
};

async function fetchManualAutomations(): Promise<ManualAutomation[]> {
  const res = await fetch(
    apiUrl("/api/automations?triggerType=manual&active=true&perPage=100"),
  );
  const json = (await res.json().catch(() => ({}))) as Partial<ListResponse>;
  if (!res.ok) throw new Error("Falha ao carregar automações manuais");
  const items = Array.isArray(json.items) ? json.items : [];
  return [...items].sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return tb - ta;
  });
}

async function runAutomation(
  automationId: string,
  payload: { contactId: string; conversationId?: string | null },
): Promise<{ automationName?: string }> {
  const res = await fetch(apiUrl(`/api/automations/${automationId}/run`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contactId: payload.contactId,
      conversationId: payload.conversationId ?? undefined,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    automationName?: string;
    message?: string;
  };
  if (!res.ok) {
    throw new Error(
      typeof json?.message === "string" ? json.message : "Falha ao executar",
    );
  }
  return { automationName: json.automationName };
}

export function AutomationPickerList({
  conversationId,
  contactId,
  onClose,
}: {
  conversationId: string | null;
  contactId?: string | null;
  onClose?: () => void;
}) {
  const [runningId, setRunningId] = useState<string | null>(null);

  // Carrega sempre fresco ao abrir — o operador pode ter acabado de criar
  // uma automação manual e espera vê-la na lista (mesma decisão do
  // RunAutomationButton; endpoint leve, dispara só on-demand).
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["manual-automations"],
    queryFn: fetchManualAutomations,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const items = data ?? [];

  async function handleRun(automation: ManualAutomation) {
    if (runningId) return;
    if (!contactId) {
      toast.error("Sem contato associado a esta conversa.");
      return;
    }
    setRunningId(automation.id);
    try {
      const result = await runAutomation(automation.id, {
        contactId,
        conversationId,
      });
      toast.success(`Automação disparada: ${result.automationName ?? automation.name}`);
      onClose?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao executar automação");
    } finally {
      setRunningId(null);
    }
  }

  return (
    <div
      style={{ backgroundColor: "var(--dropdown-solid-bg)" }}
      className="w-80 max-h-96 overflow-y-auto rounded-[var(--radius-lg)] border border-border p-2 shadow-2xl ring-1 ring-black/10 dark:ring-white/10"
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          Executar automação
        </span>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            Fechar
          </button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="px-2 py-3 text-center text-xs text-[var(--text-muted)]">
          Carregando...
        </div>
      ) : isError ? (
        <div className="px-2 py-3 text-center text-xs text-[var(--color-danger)]">
          Falha ao carregar automações.
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-1 block w-full text-[11px] font-medium text-[var(--brand-primary)] hover:underline"
          >
            Tentar de novo
          </button>
        </div>
      ) : !items.length ? (
        <div className="px-2 py-3 text-center text-xs text-[var(--text-muted)]">
          Nenhuma automação manual ativa.
          <div className="mt-1 text-[11px] text-[var(--text-muted)]/70">
            Crie uma em <span className="font-medium">Automações</span> com gatilho{" "}
            <span className="font-medium">&quot;Manual&quot;</span>.
          </div>
        </div>
      ) : (
        <div className="space-y-0.5">
          {items.map((a) => {
            const isRunning = runningId === a.id;
            return (
              <button
                key={a.id}
                type="button"
                disabled={!!runningId}
                onClick={() => void handleRun(a)}
                className="block w-full rounded-[var(--radius-sm)] px-2 py-2 text-left hover:bg-[var(--glass-bg-strong)] disabled:opacity-60"
              >
                <div className="flex items-center gap-1.5">
                  {isRunning ? (
                    <IconLoader2 size={13} className="shrink-0 animate-spin text-[var(--brand-primary)]" />
                  ) : (
                    <IconBolt size={13} className="shrink-0 text-[var(--brand-primary)]" />
                  )}
                  <span className="flex-1 truncate font-display text-[12px] font-bold text-[var(--text-primary)]">
                    {a.name}
                  </span>
                  <span className="shrink-0 text-[10px] tabular-nums text-[var(--text-muted)]">
                    {a.stepCount} passo{a.stepCount === 1 ? "" : "s"}
                  </span>
                </div>
                {a.description ? (
                  <div className="mt-0.5 line-clamp-2 pl-4.5 text-[11.5px] text-[var(--text-muted)]">
                    {a.description}
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
