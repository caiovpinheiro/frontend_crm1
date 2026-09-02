"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

import {
  IconDotsVertical,
  IconSearch,
  IconCircleCheck,
  IconLink,
  IconRotateClockwise,
  IconStarFilled,
  IconUsersGroup,
  IconChevronRight,
  IconLoader2,
  IconRobot,
  IconUser,
  IconEye,
  IconEyeOff,
} from "@tabler/icons-react";

import { ButtonGlass } from "@/components/crm/button-glass";
import {
  useAssignConversation,
} from "@/features/inbox-v2/hooks";
import { RequirePermission } from "@/components/auth/require-permission";
import { useExecuteDistribution } from "@/features/distribution/hooks";
import { apiUrl } from "@/lib/api";
import { useHideChatEvents } from "@/components/crm/chat-timeline";
import { useResolveConversationFlow } from "./use-resolve-conversation-flow";

interface ConversationActionsMenuProps {
  conversationId: string | null;
  /** Ticket sequencial — o link copiado usa `?c=<number>`, nunca o CUID. */
  conversationNumber?: number | null;
  contactId?: string | null;
  isResolved: boolean;
  disabled?: boolean;
  /** Handler opcional pra "Buscar na conversa". Quando ausente, mostra toast "em breve". */
  onSearchInConversation?: () => void;
  /** Abre o painel "Mensagens favoritas" (estrelas do agente logado). */
  onOpenFavorites?: () => void;
  /**
   * Callback disparado quando "Reabrir" cria um novo ticket (modelo de ticket).
   * O caller (ex.: inbox) usa isso para selecionar/navegar para a nova conversa.
   * Recebe o id da nova conversa gerada; o id previo continua acessivel via
   * `conversationId` (que era o anterior).
   */
  onReopenNewConversation?: (newConversationId: string) => void;
  onResolved?: (conversationId: string) => void;
  onFollowedUp?: (conversationId: string) => void;
  contactName?: string | null;
  /** Departamento vinculado a conversa — usado para o modal de tabulacao. */
  departmentId?: string | null;
  /** Se true, o botao "Encerrar" abre um modal exigindo folha da arvore. */
  requireTabulationOnClose?: boolean;
  /**
   * Após "Distribuir p/ departamento", atualiza sticky/cache local com o
   * novo depto (e se exige tabulação) — senão Encerrar usa flag antigo.
   */
  onDepartmentChanged?: (dept: {
    id: string;
    name: string;
    requireTabulationOnClose: boolean;
  }) => void;
  assigneeId?: string | null;
  assigneeType?: string | null;
  /**
   * Quando true, esconde/bloqueia "Devolver à IA" (ex.: lead no
   * Acolhimento — campanha com botão / fluxo humano).
   */
  blockReturnToAi?: boolean;
}

export function ConversationActionsMenu({
  conversationId,
  conversationNumber,
  contactId,
  isResolved,
  disabled,
  onSearchInConversation,
  onOpenFavorites,
  onReopenNewConversation,
  onResolved,
  onFollowedUp,
  contactName,
  departmentId,
  requireTabulationOnClose,
  onDepartmentChanged,
  assigneeId: _assigneeId,
  assigneeType,
  blockReturnToAi = false,
}: ConversationActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [deptMenuOpen, setDeptMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { data: session } = useSession();
  const currentUserId =
    (session?.user as { id?: string } | undefined)?.id ?? null;
  const assign = useAssignConversation();
  const isAiAssignee = (assigneeType ?? "").toUpperCase() === "AI";
  const { handleToggleResolve: resolveFlow, toggleResolve, dialogs } =
    useResolveConversationFlow({
      conversationId,
      isResolved,
      departmentId,
      assignedToId: _assigneeId,
      requireTabulationOnClose,
      contactId,
      contactName,
      onReopenNewConversation,
      onResolved,
      onFollowedUp,
    });
  const executeDist = useExecuteDistribution();
  const { hideEvents, toggleHideEvents } = useHideChatEvents();

  const departmentsQuery = useQuery({
    queryKey: ["inbox-distribute-departments"],
    queryFn: async (): Promise<
      Array<{ id: string; name: string; requireTabulationOnClose: boolean }>
    > => {
      const res = await fetch(apiUrl("/api/settings/departments"), {
        credentials: "include",
      });
      if (!res.ok) return [];
      const raw = (await res.json()) as unknown;
      const list = Array.isArray(raw)
        ? raw
        : Array.isArray((raw as { items?: unknown })?.items)
          ? (raw as { items: unknown[] }).items
          : [];
      return (
        list as Array<{
          id: string;
          name: string;
          requireTabulationOnClose?: boolean;
        }>
      ).map((d) => ({
        id: d.id,
        name: d.name,
        requireTabulationOnClose: !!d.requireTabulationOnClose,
      }));
    },
    enabled: open,
    staleTime: 120_000,
  });

  const aiAgentsQuery = useQuery({
    queryKey: ["inbox-ai-agents-active"],
    queryFn: async (): Promise<
      Array<{ userId: string; name: string; active: boolean }>
    > => {
      const res = await fetch(apiUrl("/api/ai-agents"), {
        credentials: "include",
      });
      if (!res.ok) return [];
      const raw = (await res.json()) as unknown;
      const list = Array.isArray(raw) ? raw : [];
      return (
        list as Array<{ userId?: string; name?: string; active?: boolean }>
      )
        .filter((a) => a.active !== false && typeof a.userId === "string")
        .map((a) => ({
          userId: a.userId as string,
          name: a.name ?? "Agente IA",
          active: a.active !== false,
        }));
    },
    enabled: open && !isAiAssignee,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!open) {
      setDeptMenuOpen(false);
      return;
    }
    function onClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setDeptMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function handleToggleResolve() {
    setOpen(false);
    resolveFlow();
  }

  function handleSearch() {
    setOpen(false);
    if (onSearchInConversation) {
      onSearchInConversation();
    } else {
      toast.info("Busca dentro da conversa: em breve.");
    }
  }

  // Copia o link absoluto da conversa (?c=<number>) para compartilhar.
  async function handleCopyLink() {
    setOpen(false);
    if (conversationNumber == null) {
      toast.error("Número da conversa indisponível.");
      return;
    }
    const url = `${window.location.origin}/inbox?c=${conversationNumber}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link da conversa copiado.");
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  }

  function handleDistributeToDepartment(dept: {
    id: string;
    name: string;
    requireTabulationOnClose: boolean;
  }) {
    if (!conversationId) return;
    executeDist.mutate(
      {
        conversationId,
        contactId: contactId ?? undefined,
        departmentIds: [dept.id],
        reassign: true,
      },
      {
        onSuccess: (result) => {
          setOpen(false);
          setDeptMenuOpen(false);
          onDepartmentChanged?.({
            id: dept.id,
            name: dept.name,
            requireTabulationOnClose: dept.requireTabulationOnClose,
          });
          if (result.success) {
            toast.success(
              result.selectedUserName
                ? `Distribuído para ${result.selectedUserName} (${dept.name}).`
                : `Distribuído no departamento ${dept.name}.`,
            );
          } else if (result.reason === "NO_ELIGIBLE_RESPONSIBLE") {
            toast.warning(
              `Nenhum agente elegível em ${dept.name}. Lead enviado à fila de espera.`,
            );
          } else if (result.reason === "SMART_DISTRIBUTION_NOT_ENABLED") {
            toast.error("Módulo de Distribuição não habilitado.");
          } else {
            toast.error("Não foi possível distribuir.");
          }
        },
        onError: (err) => toast.error(err.message || "Erro ao distribuir."),
      },
    );
  }

  function handleAssume() {
    if (!conversationId || !currentUserId) {
      toast.error("Sessão inválida para assumir.");
      return;
    }
    assign.mutate(
      { conversationId, assignedToId: currentUserId },
      {
        onSuccess: () => {
          setOpen(false);
          toast.success("Você assumiu a conversa.");
        },
      },
    );
  }

  function handleReturnToAi() {
    if (!conversationId) return;
    if (blockReturnToAi) {
      toast.error(
        "IA não atende leads no Acolhimento. Use um consultor humano.",
      );
      return;
    }
    const agent = aiAgentsQuery.data?.[0];
    if (!agent?.userId) {
      toast.error("Nenhum agente IA ativo encontrado.");
      return;
    }
    assign.mutate(
      { conversationId, assignedToId: agent.userId },
      {
        onSuccess: () => {
          setOpen(false);
          toast.success(`Devolvida à IA (${agent.name}).`);
        },
      },
    );
  }

  return (
    <div ref={containerRef} className="relative inline-flex items-center gap-1.5">
      {isAiAssignee && (
        <span
          className="inline-flex items-center gap-1 rounded-full border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]"
          title="Conversa atribuída a um agente de IA"
        >
          <IconRobot size={12} stroke={2} />
          IA
        </span>
      )}
      <ButtonGlass
        variant="glass"
        size="icon"
        title="Mais"
        disabled={disabled || !conversationId}
        onClick={() => setOpen((v) => !v)}
      >
        <IconDotsVertical size={18} />
      </ButtonGlass>

      {open && (
        // Dropdown limpo (fundo branco solido, sombra suave) para casar
        // com o padrao dos menus contextuais do CRM. Icones a esquerda,
        // labels a direita — legibilidade + affordance clara.
        <div className="absolute right-0 top-full z-30 mt-2 w-56 overflow-visible rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-white p-1 shadow-[0_12px_32px_rgba(15,23,42,0.12)] v2-dark:bg-[#1a1f2e]">
          {isAiAssignee ? (
            <button
              type="button"
              onClick={handleAssume}
              disabled={assign.isPending || !currentUserId}
              className="flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--glass-bg-overlay)] disabled:opacity-50"
            >
              {assign.isPending ? (
                <IconLoader2
                  size={16}
                  className="shrink-0 animate-spin text-[var(--brand-primary)]"
                />
              ) : (
                <IconUser
                  size={16}
                  className="shrink-0 text-[var(--text-muted)]"
                  stroke={2}
                />
              )}
              <span>Assumir conversa</span>
            </button>
          ) : blockReturnToAi ? (
            <button
              type="button"
              disabled
              title="IA não atende leads no Acolhimento"
              className="flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left text-[13px] font-medium text-[var(--text-muted)] opacity-60"
            >
              <IconRobot
                size={16}
                className="shrink-0 text-[var(--text-muted)]"
                stroke={2}
              />
              <span>IA indisponível (Acolhimento)</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleReturnToAi}
              disabled={
                assign.isPending ||
                aiAgentsQuery.isLoading ||
                !(aiAgentsQuery.data && aiAgentsQuery.data.length > 0)
              }
              className="flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--glass-bg-overlay)] disabled:opacity-50"
            >
              {assign.isPending || aiAgentsQuery.isLoading ? (
                <IconLoader2
                  size={16}
                  className="shrink-0 animate-spin text-[var(--brand-primary)]"
                />
              ) : (
                <IconRobot
                  size={16}
                  className="shrink-0 text-[var(--text-muted)]"
                  stroke={2}
                />
              )}
              <span>Devolver à IA</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleSearch}
            className="flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--glass-bg-overlay)]"
          >
            <IconSearch size={16} className="shrink-0 text-[var(--text-muted)]" stroke={2} />
            <span>Buscar na conversa</span>
          </button>

          <button
            type="button"
            onClick={() => {
              toggleHideEvents();
              setOpen(false);
            }}
            className="flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--glass-bg-overlay)]"
          >
            {hideEvents ? (
              <IconEyeOff size={16} className="shrink-0 text-[var(--text-muted)]" stroke={2} />
            ) : (
              <IconEye size={16} className="shrink-0 text-[var(--text-muted)]" stroke={2} />
            )}
            <span>{hideEvents ? "Mostrar eventos" : "Ocultar eventos"}</span>
          </button>

          <button
            type="button"
            onClick={handleCopyLink}
            disabled={!conversationId}
            className="flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--glass-bg-overlay)] disabled:opacity-50"
          >
            <IconLink size={16} className="shrink-0 text-[var(--text-muted)]" stroke={2} />
            <span>Copiar link da conversa</span>
          </button>

          {onOpenFavorites && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenFavorites();
              }}
              className="flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--glass-bg-overlay)]"
            >
              <IconStarFilled size={16} className="shrink-0 text-amber-500" />
              <span>Mensagens favoritas</span>
            </button>
          )}

          {!isResolved && (
            <div className="relative">
              <button
                type="button"
                disabled={executeDist.isPending}
                onClick={() => setDeptMenuOpen((v) => !v)}
                className="flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--glass-bg-overlay)] disabled:opacity-50"
              >
                {executeDist.isPending ? (
                  <IconLoader2
                    size={16}
                    className="shrink-0 animate-spin text-[var(--brand-primary)]"
                  />
                ) : (
                  <IconUsersGroup
                    size={16}
                    className="shrink-0 text-[var(--text-muted)]"
                    stroke={2}
                  />
                )}
                <span className="flex-1">Distribuir p/ departamento</span>
                <IconChevronRight size={14} className="shrink-0 text-[var(--text-muted)]" />
              </button>

              {deptMenuOpen && (
                <div className="absolute right-full top-0 z-40 mr-1 w-56 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-white p-1 shadow-[0_12px_32px_rgba(15,23,42,0.12)] v2-dark:bg-[#1a1f2e]">
                  <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                    Escolha o departamento
                  </p>
                  {departmentsQuery.isLoading ? (
                    <p className="px-3 py-2 text-[12px] text-[var(--text-muted)]">
                      Carregando…
                    </p>
                  ) : (departmentsQuery.data ?? []).length === 0 ? (
                    <p className="px-3 py-2 text-[12px] text-[var(--text-muted)]">
                      Nenhum departamento cadastrado.
                    </p>
                  ) : (
                    <div className="max-h-56 overflow-y-auto">
                      {(departmentsQuery.data ?? []).map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          disabled={executeDist.isPending}
                          onClick={() => handleDistributeToDepartment(d)}
                          className="flex w-full items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-left text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--glass-bg-overlay)] disabled:opacity-50"
                        >
                          <span className="truncate">{d.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <RequirePermission permission="conversation:resolve">
            <button
              type="button"
              disabled={toggleResolve.isPending}
              onClick={handleToggleResolve}
              className="flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--glass-bg-overlay)] disabled:opacity-50"
            >
              {isResolved ? (
                <IconRotateClockwise size={16} className="shrink-0 text-[var(--text-muted)]" stroke={2} />
              ) : (
                <IconCircleCheck size={16} className="shrink-0 text-[var(--text-muted)]" stroke={2} />
              )}
              <span>{isResolved ? "Reabrir conversa" : "Encerrar conversa"}</span>
            </button>
          </RequirePermission>
        </div>
      )}
      {dialogs}
    </div>
  );
}
