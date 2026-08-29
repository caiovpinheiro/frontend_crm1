"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import {
  CircleCheck,
  Coffee,
  Wifi,
  WifiOff,
  type LucideIcon,
} from "lucide-react";

import { apiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

export type AgentOnlineStatus = "ONLINE" | "OFFLINE" | "AWAY";

interface StatusMeta {
  value: AgentOnlineStatus;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Cor sólida do ponto/indicador. */
  color: string;
  /** Classe Tailwind do ponto colorido. */
  dot: string;
  /** Hover sutil no botão da opção. */
  hover: string;
}

export const AGENT_STATUS_META: Record<AgentOnlineStatus, StatusMeta> = {
  ONLINE: {
    value: "ONLINE",
    label: "Online",
    description: "Disponível para receber leads",
    icon: Wifi,
    color: "var(--color-online)",
    dot: "bg-[var(--color-online)]",
    hover: "hover:bg-[var(--color-success-bg)]",
  },
  AWAY: {
    value: "AWAY",
    label: "Ausente",
    description: "Pausado — não recebe novos leads",
    icon: Coffee,
    color: "var(--color-warning)",
    dot: "bg-[var(--color-warning)]",
    hover: "hover:bg-[var(--color-warn-bg)]",
  },
  OFFLINE: {
    value: "OFFLINE",
    label: "Offline",
    description: "Indisponível — fora do expediente",
    icon: WifiOff,
    color: "var(--text-muted)",
    dot: "bg-[var(--text-muted)]",
    hover: "hover:bg-[var(--glass-bg-subtle)]",
  },
};

const STATUS_ORDER: AgentOnlineStatus[] = ["ONLINE", "AWAY", "OFFLINE"];

/**
 * Flag compartilhada entre abas (localStorage) — `sessionStorage` reabriá o
 * modal em toda nova aba (ex.: negócio aberto em nova guia).
 * Valor = userId que já viu o prompt neste ciclo de login.
 * Limpa no logout (ver `clearAgentStatusAutoPrompt`).
 */
const AGENT_STATUS_AUTO_PROMPT_KEY = "crm:agent-status-auto-prompt";

export function clearAgentStatusAutoPrompt() {
  try {
    localStorage.removeItem(AGENT_STATUS_AUTO_PROMPT_KEY);
  } catch {
    /* noop */
  }
}

function hasAgentStatusAutoPrompt(userId: string): boolean {
  try {
    return localStorage.getItem(AGENT_STATUS_AUTO_PROMPT_KEY) === userId;
  } catch {
    return false;
  }
}

function markAgentStatusAutoPrompt(userId: string) {
  try {
    localStorage.setItem(AGENT_STATUS_AUTO_PROMPT_KEY, userId);
  } catch {
    /* noop */
  }
}

export interface AgentStatusController {
  status: AgentOnlineStatus;
  /** True só depois que a API confirmou o status (evita falso OFFLINE). */
  isLoaded: boolean;
  isPending: boolean;
  setStatus: (next: AgentOnlineStatus) => void;
}

/**
 * Gerencia a presença do agente no client: mantém o heartbeat, lê o status
 * atual e expõe um setter. Reaproveita os endpoints já existentes
 * (`GET/PUT /api/agents/:id/status` + `POST /api/agents/me/ping`).
 */
export function useAgentStatus(): AgentStatusController {
  const { data: session, status: sessionStatus } = useSession();
  const myUserId = (session?.user as { id?: string } | undefined)?.id;
  const queryClient = useQueryClient();

  const { data, isSuccess } = useQuery<{ status: AgentOnlineStatus }>({
    queryKey: ["my-agent-status", myUserId],
    queryFn: async () => {
      const r = await fetch(apiUrl(`/api/agents/${myUserId}/status`));
      if (!r.ok) throw new Error("Falha ao carregar status");
      return r.json();
    },
    enabled: !!myUserId,
    refetchInterval: 60_000,
  });

  const mutation = useMutation({
    mutationFn: async (next: AgentOnlineStatus) => {
      const r = await fetch(apiUrl(`/api/agents/${myUserId}/status`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!r.ok) throw new Error("Erro ao atualizar status");
      const body = (await r.json()) as {
        status?: AgentOnlineStatus;
        _migrationPending?: boolean;
      };
      if (body._migrationPending) {
        throw new Error(
          "Não foi possível gravar o status. Tente novamente ou recarregue a página.",
        );
      }
      return body;
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: ["my-agent-status", myUserId] });
      const prev = queryClient.getQueryData<{ status: AgentOnlineStatus }>([
        "my-agent-status",
        myUserId,
      ]);
      queryClient.setQueryData(["my-agent-status", myUserId], { status: next });
      // Atualiza a lista da Distribuição na hora (sem esperar F5).
      queryClient.setQueryData(
        ["distribution-responsibles"],
        (old: { responsibles?: Array<Record<string, unknown>> } | undefined) => {
          if (!old?.responsibles || !myUserId) return old;
          return {
            ...old,
            responsibles: old.responsibles.map((r) =>
              r.userId === myUserId ? { ...r, status: next } : r,
            ),
          };
        },
      );
      return { prev };
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(["my-agent-status", myUserId], ctx.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["my-agent-status", myUserId] });
      // Elegibilidade / fila dependem do status — refetch sem F5.
      queryClient.invalidateQueries({ queryKey: ["distribution-responsibles"] });
      queryClient.invalidateQueries({ queryKey: ["distribution-pending"] });
    },
  });

  return {
    // Só confiamos em OFFLINE depois da API responder.
    status: data?.status ?? "OFFLINE",
    isLoaded: isSuccess,
    isPending: mutation.isPending,
    setStatus: (next) => mutation.mutate(next),
  };
}

/**
 * Dispara o modal de "Definir Status" ~1,5s após o login quando o agente
 * está OFFLINE — uma vez por ciclo de login (todas as abas). Novas guias
 * de negócio não reabrem o modal.
 */
export function useAgentStatusAutoPrompt(
  controller: AgentStatusController,
  open: () => void,
) {
  const { data: session, status: sessionStatus } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const wasAuthenticated = useRef(false);

  // Logout → libera o prompt para o próximo login.
  useEffect(() => {
    if (sessionStatus === "authenticated") {
      wasAuthenticated.current = true;
      return;
    }
    if (sessionStatus === "unauthenticated" && wasAuthenticated.current) {
      wasAuthenticated.current = false;
      clearAgentStatusAutoPrompt();
    }
  }, [sessionStatus]);

  useEffect(() => {
    if (sessionStatus !== "authenticated" || !userId || !controller.isLoaded)
      return;
    if (controller.status !== "OFFLINE") return;
    if (hasAgentStatusAutoPrompt(userId)) return;
    // Reserva o slot antes do delay — evita corrida entre abas/NavRail+bottom nav.
    markAgentStatusAutoPrompt(userId);
    const timer = setTimeout(() => open(), 1500);
    return () => clearTimeout(timer);
    // `open` é estável o suficiente; evitamos re-disparos por identidade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, userId, controller.isLoaded, controller.status]);
}

/** Modal "Definir Status" (Online / Ausente / Offline). */
export function AgentStatusPopup({
  open,
  current,
  onClose,
  onSelect,
}: {
  open: boolean;
  current: AgentOnlineStatus;
  onClose: () => void;
  onSelect: (s: AgentOnlineStatus) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // O modal precisa escapar do `NavRailV2` (DockProvider tem backdrop-blur,
  // que cria containing block pro `position: fixed` — sem o portal, o modal
  // ancora na rail de 72px e fica cortado na lateral). Renderizamos no body.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-(--z-above) flex items-center justify-center bg-black/30 backdrop-blur-md"
      style={{ animation: "fade-in 0.2s ease" }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Definir status"
        className="w-90 rounded-3xl border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] p-7 shadow-[var(--glass-shadow-lg)] backdrop-blur-xl"
        style={{ animation: "scale-in 0.3s cubic-bezier(0.4, 0, 0.2, 1)" }}
      >
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--brand-primary)] to-[var(--brand-secondary)] shadow-[0_10px_30px_rgba(91,111,245,0.45)]">
            <Wifi className="size-8 text-white" />
          </div>
          <h3 className="font-display text-xl font-bold text-foreground">
            Definir Status
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Selecione sua disponibilidade para atendimento
          </p>
        </div>

        <div className="space-y-2.5">
          {STATUS_ORDER.map((value) => {
            const meta = AGENT_STATUS_META[value];
            const Icon = meta.icon;
            const isActive = current === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => {
                  onSelect(value);
                  onClose();
                }}
                className={cn(
                  "flex w-full items-center gap-3.5 rounded-xl px-4 py-4 text-left transition",
                  isActive
                    ? "border-2 border-[var(--brand-primary)] bg-[var(--brand-primary)]/5 shadow-md ring-2 ring-[var(--brand-primary)]/20"
                    : "border-2 border-transparent " + meta.hover,
                )}
              >
                <span
                  className={cn(
                    "flex size-3.5 shrink-0 rounded-full shadow-sm",
                    meta.dot,
                  )}
                  style={
                    isActive
                      ? { boxShadow: `0 0 0 4px ${meta.color}22` }
                      : undefined
                  }
                />
                <Icon
                  className={cn(
                    "size-5",
                    isActive
                      ? "text-[var(--brand-primary)]"
                      : "text-muted-foreground",
                  )}
                />
                <div className="flex-1">
                  <p
                    className={cn(
                      "text-sm font-semibold",
                      isActive
                        ? "text-[var(--brand-primary)]"
                        : "text-foreground",
                    )}
                  >
                    {meta.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {meta.description}
                  </p>
                </div>
                {isActive && (
                  <CircleCheck className="size-5 text-[var(--brand-primary)]" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
