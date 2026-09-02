"use client";

import { useEffect, useRef, useState } from "react";
import {
  IconPlus,
  IconPaperclip,
  IconCamera,
  IconFileText,
  IconClock,
  IconCheckbox,
  IconCircleCheck,
  IconRotateClockwise,
  IconMessageCode,
  IconBolt,
  IconPhone,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CallPermissionTemplateDialog } from "@/components/inbox/call-permission-template-dialog";
import { applyOutboundPreviewToInboxCaches } from "@/features/inbox-v2/hooks/apply-outbound-inbox-card";
import { emitConversationReopened, messagesKey } from "@/features/inbox-v2/hooks/use-messages";
import {
  CALL_PERMISSION_TPL_STORAGE,
  fetchCallPermissionTemplates,
  sendCallPermissionTemplate,
} from "@/lib/wa-call-permission-send";

import { ButtonGlass } from "@/components/crm/button-glass";
import { useResolveConversationFlow } from "./use-resolve-conversation-flow";
import type { InternalTemplateContext } from "@/lib/internal-template-variables";
import type { WhatsappTemplate } from "@/features/inbox-v2/api";

import { FilePickerButton } from "./file-picker-button";
import { WhatsappTemplatePickerModal } from "./template-picker-popover";
import { ScheduleDialog } from "./schedule-dialog";
import { TaskDialog } from "./task-dialog";
import { AgentAutomationPickerModal } from "./agent-automation-picker-modal";
import { InternalTemplatePickerModal } from "./internal-template-picker-modal";

/**
 * Menu unificado "+" do composer (estilo WhatsApp). Reúne as ações
 * do composer do /inbox v1:
 *  - Anexar arquivo
 *  - Templates WhatsApp
 *  - Nota interna (toggle — só quando onToggleNote é passado)
 *  - Agendar mensagem
 *  - Nova tarefa
 *  - Finalizar / Reabrir conversa (só quando isResolved é definido)
 */
export function ComposerMenu({
  conversationId,
  channelId,
  className,
  noteMode,
  onToggleNote,
  isResolved,
  contactId,
  contactName,
  dealId,
  dealTitle,
  deals,
  templateContext,
  onPickInternal,
  onPickTemplate,
  onReopenNewConversation,
  onResolved,
  onFollowedUp,
  departmentId,
  assignedToId,
  requireTabulationOnClose,
  outboundDisabled,
  beforeOutboundSend,
  onOutboundBlocked,
  enableCallPermission,
}: {
  conversationId: string | null;
  /** Canal de envio atual — filtra templates WhatsApp da WABA correta. */
  channelId?: string | null;
  className?: string;
  noteMode?: boolean;
  onToggleNote?: () => void;
  isResolved?: boolean;
  contactId?: string | null;
  contactName?: string | null;
  /** Negócio exibido (padrão ao criar tarefa). */
  dealId?: string | null;
  dealTitle?: string | null;
  /** Negócios do contato — permite trocar o vínculo da tarefa. */
  deals?: { id: string; title: string }[];
  templateContext?: InternalTemplateContext;
  /** Insere o texto do modelo interno (interpolado) no composer para edição.
   *  Se o modelo tiver anexo(s), `media` é repassado pro composer enviar junto
   *  (um ou mais arquivos, na ordem do modelo). */
  onPickInternal?: (
    text: string,
    media?: Array<{
      url: string;
      name: string | null;
      mimeType?: string | null;
      messageBefore: string | null;
    }> | null,
  ) => void;
  /** Abre o painel de validação do template do WhatsApp no composer. */
  onPickTemplate?: (tpl: WhatsappTemplate) => void;
  /** Callback quando "Reabrir" cria novo ticket (modelo de ticket). Ver
   *  ConversationActionsMenu e useToggleConversationResolve. */
  onReopenNewConversation?: (newConversationId: string) => void;
  onResolved?: (conversationId: string) => void;
  onFollowedUp?: (conversationId: string) => void;
  /** Departamento vinculado — abre modal de tabulacao quando encerrar. */
  departmentId?: string | null;
  assignedToId?: string | null;
  requireTabulationOnClose?: boolean;
  /** Bloqueia anexos/foto/agenda de texto livre (sessão 24h encerrada). Templates seguem ok. */
  outboundDisabled?: boolean;
  beforeOutboundSend?: () => boolean | Promise<boolean>;
  onOutboundBlocked?: () => void;
  /** WhatsApp Cloud API — item "Pedir permissão de ligação". */
  enableCallPermission?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [automationOpen, setAutomationOpen] = useState(false);
  const [internalOpen, setInternalOpen] = useState(false);
  const [callPermissionOpen, setCallPermissionOpen] = useState(false);
  const queryClient = useQueryClient();
  const callTemplatesQuery = useQuery({
    queryKey: ["call-permission-templates"],
    queryFn: fetchCallPermissionTemplates,
    enabled: callPermissionOpen && !!conversationId && !!enableCallPermission,
    staleTime: 5 * 60_000,
  });
  const sendCallPermission = useMutation({
    mutationFn: async (chosenTemplate?: string) => {
      if (!conversationId) throw new Error("Conversa inválida.");
      let stored = "";
      try {
        stored = sessionStorage.getItem(CALL_PERMISSION_TPL_STORAGE)?.trim() ?? "";
      } catch {
        /* ignore */
      }
      const templateName = (chosenTemplate ?? "").trim() || stored;
      if (!templateName) {
        throw new Error(
          "Configure um template aprovado da Meta em Configurações → WhatsApp Templates.",
        );
      }
      const tpl = (callTemplatesQuery.data ?? []).find((t) => t.name === templateName);
      return sendCallPermissionTemplate({ conversationId, templateName, tpl });
    },
    onSuccess: (j) => {
      toast.success(
        j?.pending
          ? "Enviando template de ligação…"
          : "Solicitação de voz enviada ao cliente",
      );
      setCallPermissionOpen(false);
      if (typeof j?.reopenedConversationId === "string" && j.reopenedConversationId) {
        emitConversationReopened(j.reopenedConversationId);
        queryClient.invalidateQueries({
          queryKey: messagesKey(j.reopenedConversationId),
        });
        queryClient.invalidateQueries({ queryKey: ["inbox-conversations"] });
        queryClient.invalidateQueries({ queryKey: ["conversations", "tab-counts"] });
      } else {
        applyOutboundPreviewToInboxCaches(queryClient, conversationId, {
          messageType: "template",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["calling-context", conversationId] });
      queryClient.invalidateQueries({ queryKey: messagesKey(conversationId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const popoverRef = useRef<HTMLDivElement>(null);
  const { handleToggleResolve: resolveFlow, toggleResolve, dialogs } =
    useResolveConversationFlow({
      conversationId,
      isResolved,
      departmentId,
      assignedToId,
      requireTabulationOnClose,
      contactId,
      contactName,
      dealId,
      onReopenNewConversation,
      onResolved,
      onFollowedUp,
    });

  function closeMenu() {
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        closeMenu();
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") closeMenu();
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  function handleToggleResolve() {
    closeMenu();
    resolveFlow();
  }

  const itemClass =
    "flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-left text-[12.5px] text-[var(--text-primary)] hover:bg-primary/8 hover:text-primary transition-colors [&>svg]:transition-colors hover:[&>svg]:text-primary";

  return (
    <div className="relative">
      <ButtonGlass
        type="button"
        variant="icon"
        size="icon"
        className={className}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        disabled={!conversationId}
        title="Anexos e mais opções"
      >
        <IconPlus size={22} />
      </ButtonGlass>

      {open && conversationId ? (
        <div
          ref={popoverRef}
          className="absolute bottom-12 left-0 z-50"
          role="menu"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div
            style={{ backgroundColor: "var(--dropdown-solid-bg)" }}
            className="flex w-56 flex-col gap-px rounded-[var(--radius-lg)] border border-border p-1.5 shadow-2xl ring-1 ring-black/10 dark:ring-white/10"
          >
              <FilePickerButton
                conversationId={conversationId}
                disabled={outboundDisabled}
                beforeSend={beforeOutboundSend}
                onBlocked={onOutboundBlocked}
                className="w-full justify-start rounded-[var(--radius-sm)] px-3 py-2 text-left text-[12.5px] text-[var(--text-primary)] transition-colors hover:bg-primary/8 hover:text-primary [&>svg]:transition-colors hover:[&>svg]:text-primary"
              >
                <span className="inline-flex items-center gap-2.5">
                  <IconPaperclip size={15} /> Anexar arquivo
                </span>
              </FilePickerButton>

              <FilePickerButton
                conversationId={conversationId}
                accept="image/*"
                capture="environment"
                onOpen={closeMenu}
                disabled={outboundDisabled}
                beforeSend={beforeOutboundSend}
                onBlocked={onOutboundBlocked}
                className="w-full justify-start rounded-[var(--radius-sm)] px-3 py-2 text-left text-[12.5px] text-[var(--text-primary)] transition-colors hover:bg-primary/8 hover:text-primary [&>svg]:transition-colors hover:[&>svg]:text-primary"
              >
                <span className="inline-flex items-center gap-2.5">
                  <IconCamera size={15} /> Tirar foto
                </span>
              </FilePickerButton>

              <button
                type="button"
                onClick={() => {
                  setInternalOpen(true);
                  closeMenu();
                }}
                className={itemClass}
              >
                <IconMessageCode size={15} /> Modelos internos
              </button>

              <button
                type="button"
                onClick={() => {
                  setTemplateModalOpen(true);
                  closeMenu();
                }}
                className={itemClass}
              >
                <IconFileText size={15} /> Templates WhatsApp
              </button>

              {enableCallPermission ? (
                <button
                  type="button"
                  onClick={() => {
                    setCallPermissionOpen(true);
                    closeMenu();
                  }}
                  className={itemClass}
                >
                  <IconPhone size={15} /> Pedir permissão de ligação
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => {
                  setAutomationOpen(true);
                  closeMenu();
                }}
                className={itemClass}
              >
                <IconBolt size={15} /> Executar automação
              </button>

              {/* Nota interna removida do menu: agora é tab no composer */}

              <button
                type="button"
                onClick={() => {
                  if (outboundDisabled) {
                    onOutboundBlocked?.();
                    return;
                  }
                  setScheduleOpen(true);
                  closeMenu();
                }}
                className={itemClass}
              >
                <IconClock size={15} /> Agendar mensagem
              </button>

              <button
                type="button"
                onClick={() => {
                  setTaskOpen(true);
                  closeMenu();
                }}
                className={itemClass}
              >
                <IconCheckbox size={15} /> Nova tarefa
              </button>

              {isResolved !== undefined ? (
                <>
                  <div className="my-1 h-px bg-border/60" />
                  <button
                    type="button"
                    disabled={toggleResolve.isPending}
                    onClick={handleToggleResolve}
                    className={`${itemClass} disabled:opacity-50`}
                  >
                    {isResolved ? (
                      <>
                        <IconRotateClockwise size={15} /> Reabrir conversa
                      </>
                    ) : (
                      <>
                        <IconCircleCheck size={15} /> Finalizar conversa
                      </>
                    )}
                  </button>
                </>
              ) : null}
            </div>
        </div>
      ) : null}

      <ScheduleDialog
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        conversationId={conversationId}
      />
      <TaskDialog
        open={taskOpen}
        onClose={() => setTaskOpen(false)}
        contactId={contactId}
        contactName={contactName}
        dealId={dealId}
        dealTitle={dealTitle}
        deals={deals}
      />
      {dialogs}
      <AgentAutomationPickerModal
        open={automationOpen}
        onClose={() => setAutomationOpen(false)}
        conversationId={conversationId}
        contactId={contactId}
      />
      {conversationId ? (
        <InternalTemplatePickerModal
          open={internalOpen}
          onClose={() => setInternalOpen(false)}
          conversationId={conversationId}
          templateContext={templateContext}
          onPick={onPickInternal}
        />
      ) : null}
      <WhatsappTemplatePickerModal
        open={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        conversationId={conversationId}
        channelId={channelId}
        contactName={contactName}
        onPick={onPickTemplate}
      />
      <CallPermissionTemplateDialog
        open={callPermissionOpen}
        onOpenChange={setCallPermissionOpen}
        contactName={contactName}
        templates={callTemplatesQuery.data ?? []}
        loading={callTemplatesQuery.isLoading}
        sending={sendCallPermission.isPending}
        onSubmit={(name) => sendCallPermission.mutate(name)}
      />
    </div>
  );
}
