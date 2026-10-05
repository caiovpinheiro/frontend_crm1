"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  IconSend,
} from "@tabler/icons-react";

import { composerDraftKey } from "../composer-draft";
import { useComposerDraftPersistence } from "../hooks/use-composer-draft";
import { useTypingNotifier } from "../hooks/use-typing-notifier";
import { ButtonGlass } from "@/components/crm/button-glass";
import { TooltipGlass } from "@/components/crm/tooltip-glass";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  SlashCommandMenu,
} from "@/components/inbox/slash-command-menu";
import { getContact } from "@/features/inbox-v2/api/misc";
import {
  sendInternalTemplateSequence,
  mediaNeedsSequence,
} from "@/features/inbox-v2/api";
import { applyOutboundPreviewToInboxCaches, messagesKey } from "@/features/inbox-v2/hooks";
import type { InternalTemplateContext } from "@/lib/internal-template-variables";

import { ActiveBotsButton } from "./active-bots-button";
import { AudioRecorderButton, type AudioRecordState } from "./audio-recorder-button";
import {
  SESSION_CLOSED_TOAST,
  channelSwitchConfirmOptions,
  isChannelMismatch,
} from "./channel-switch-confirm";
import { ComposerMenu } from "./composer-menu";
import { QuickReplyPopover } from "./quick-reply-popover";
import type { QuickReplyCatalogItem } from "./quick-reply-catalog";
import { ScheduledMessagesBanner } from "./scheduled-messages-banner";
import {
  TemplateComposePanel,
  whatsappTemplateToPending,
  type PendingTemplate,
} from "./template-compose-panel";
import { ComposerTopRow } from "./composer/composer-top-row";
import { EmojiButton, useEmojiPanel } from "./composer/emoji-button";
import { fileIsImage, imageExtFromMime } from "./composer/attachment-helpers";
import {
  FileDropOverlay,
  PendingFileChips,
  PendingMediaChips,
} from "./composer/pending-attachments";
import { useOutboundFlush } from "./composer/outbound-flush";
import { ReplyPreviewBar } from "./composer/reply-preview-bar";
import { sendProductSteps } from "./composer/send-product-steps";
import { useComposerInsertBridge } from "./composer/use-composer-insert-bridge";
import { useComposerSignature } from "./composer/use-composer-signature";
import { useComposerSlash } from "./composer/use-composer-slash";
import { useFileDropListeners } from "./composer/use-file-drop-listeners";
import { usePendingFiles } from "./composer/use-pending-files";
import type { ComposerProps } from "./composer/types";

/**
 * Composer completo para o ChatArea. Substitui o footer estático
 * do v0 via prop `composerSlot`. Reúne:
 *  - ComposerMenu ("+" — anexo, template, nota, agendar, tarefa, resolver)
 *  - QuickReplyPopover (raio — preenche a frase; o envio é o botão Enviar)
 *  - input controlado (com modo "nota interna")
 *  - Slash command menu — digitar "/" abre lista de modelos internos e
 *    templates WhatsApp.
 *
 * Comportamento de modelos/templates (jun/2026):
 *  - Modelo interno do CRM → INSERE o texto (interpolado) no campo de
 *    mensagem para o agente editar/validar; o envio é pelo botão de envio.
 *  - Template do WhatsApp → abre o `TemplateComposePanel` (corpo travado +
 *    inputs de variáveis para validação); o envio é pelo botão do painel.
 *  - AudioRecorderButton
 *  - botão de envio
 */
export function Composer({
  conversationId,
  value,
  onChange,
  onSend,
  onSendNote,
  sending,
  disabled,
  placeholder,
  isResolved,
  hideResolveInMenu,
  hideResolveButton,
  contactId,
  contactName,
  dealId,
  dealTitle,
  deals,
  externalTemplate,
  onExternalTemplateConsumed,
  signatureAllowed = true,
  signatureEditable = true,
  availableChannels,
  selectedChannelId,
  conversationChannelId,
  lastMessageChannelId,
  onSelectChannel,
  replyTo,
  onCancelReply,
  departmentId,
  assignedToId,
  requireTabulationOnClose,
  onReopenNewConversation,
  onResolved,
  onFollowedUp,
  conversationNumber,
  viewersSlot,
  transferSlot,
  onRequestTemplate,
  sessionExpired,
  enableCallPermission,
}: ComposerProps) {
  const { confirm: confirmDialog, dialog: confirmDialogNode } = useConfirm();
  const [noteMode, setNoteMode] = useState(false);
  const [audioRecState, setAudioRecState] = useState<AudioRecordState>("idle");
  const isAudioActive = audioRecState !== "idle";
  // "digitando…" pro cliente: 1 POST /typing a cada 3 s enquanto há texto
  // (nunca em nota interna — o cliente não vê nota).
  const notifyTyping = useTypingNotifier(conversationId, !noteMode);

  // Painel de emoji — abre acima do botão smiley. Insere no cursor do textarea.
  const { emojiOpen, setEmojiOpen, emojiWrapRef } = useEmojiPanel();

  function insertEmoji(emoji: string) {
    const el = textareaRef.current;
    if (!el) {
      onChange(value + emoji);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + emoji + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) return;
      node.focus();
      const pos = start + emoji.length;
      node.setSelectionRange(pos, pos);
      node.style.height = "auto";
      node.style.height = `${Math.min(node.scrollHeight, 120)}px`;
    });
  }

  // Anexo(s) "encostado(s)" por um modelo interno / mensagem rápida escolhido
  // no "/" ou no menu "+". Vão junto com o texto quando o operador enviar
  // (um modelo pode ter vários arquivos — enviados em sequência, na ordem).
  // Esse caminho de "encostar e enviar no Enter" só se aplica a 1 anexo SEM
  // messageBefore (o agente ainda pode editar o texto antes de enviar) —
  // multi-anexo ou messageBefore>=1 disparam a sequência na hora (ver
  // `insertTemplateText` / `onInsertMedia` abaixo).
  const [pendingMediaList, setPendingMediaList] = useState<
    Array<{
      url: string;
      name: string | null;
      mimeType?: string | null;
      messageBefore?: string | null;
      /** Capa de produto: sai antes do texto (ou como caption se couber). */
      sendBeforeText?: boolean;
    }>
  >([]);
  // Ref espelhando `pendingMediaList` — evita stale closure no flush do
  // Enter (performSend/flushPendingMedia podem rodar após re-renders).
  const pendingMediaListRef = useRef(pendingMediaList);
  useEffect(() => {
    pendingMediaListRef.current = pendingMediaList;
  }, [pendingMediaList]);

  // Espelha `value` — permite ler o texto MAIS RECENTE do draft dentro de
  // callbacks síncronos disparados pelo slash menu (`onInsertMedia`), que
  // roda logo após `setDraft(next)` mas antes do próximo render (a prop
  // `value` ainda não teria o texto novo).
  const draftRef = useRef(value);
  useEffect(() => {
    draftRef.current = value;
  }, [value]);

  // 29/jul/26 — trava local da sequência multi-anexo: `sending` do pai só
  // cobre a mutation, não o upload longo — sem isso o Enter reenvia o texto.
  const [sequenceSending, setSequenceSending] = useState(false);
  const busy = !!sending || sequenceSending;

  const qc = useQueryClient();

  const {
    pendingFiles,
    setPendingFiles,
    pendingFilesRef,
    removePendingFile,
    dropActive,
    setDropActive,
  } = usePendingFiles();

  // ── Contexto para interpolação de templates internos ─────────────
  // Reusa a mesma queryKey do ContactAside — evita GET /contacts ×2
  // ao abrir a conversa (sidebar + composer).
  const { data: contactData } = useQuery({
    queryKey: ["contact-sidebar", contactId ?? "__none__"],
    queryFn: () => getContact(contactId!),
    enabled: !!contactId,
    staleTime: 60_000,
  });

  // Ref para o textarea — exigido pelo useSlashMenu para movimentar o cursor
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Container do composer — usado para detectar clique-fora do slash menu.
  const rootRef = useRef<HTMLDivElement>(null);

  // ── Assinatura do agente (estilo WhatsApp) ───────────────────────
  // Toggle + nome personalizado, persistidos em localStorage (mesmas
  // chaves do /inbox v1 → o operador mantém a preferência ao migrar).
  // Quando ligada e fora do modo nota, prefixa `*Nome*: ` na mensagem.
  const { data: session } = useSession();
  const agentName = (session?.user?.name ?? "").trim();

  // Rascunho persistido por conversa (localStorage, sincronizado entre
  // abas). Serve inbox, painel do negócio e sales-hub — todos passam
  // `value`/`onChange`; a persistência é transparente para o pai.
  const draftStorageKey = composerDraftKey({
    orgId: session?.user?.organizationId,
    userId: session?.user?.id,
    conversationId,
  });
  const isTextareaFocused = useCallback(
    () =>
      typeof document !== "undefined" &&
      document.activeElement != null &&
      document.activeElement === textareaRef.current,
    [],
  );
  useComposerDraftPersistence({
    storageKey: draftStorageKey,
    value,
    onChange,
    isEditing: isTextareaFocused,
  });

  // Contexto de interpolação: contact + deal + atendente atual
  const templateContext = useMemo<InternalTemplateContext>(() => {
    const firstDeal = contactData?.deals?.[0];
    return {
      contact: contactData
        ? {
            name: contactData.name,
            phone: contactData.phone,
            email: contactData.email,
            cpf: contactData.cpf,
            tags: contactData.tags ?? [],
          }
        : undefined,
      deal: firstDeal
        ? {
            id: firstDeal.id,
            title: firstDeal.title,
            value: firstDeal.value,
            stageName: firstDeal.stageName ?? undefined,
            productName: firstDeal.productName ?? undefined,
          }
        : undefined,
      agent: session?.user
        ? { name: session.user.name ?? undefined, email: session.user.email ?? undefined }
        : undefined,
    };
  }, [contactData, session]);
  const signature = useComposerSignature({ agentName, signatureAllowed });
  const { applySignature } = signature;

  // ── Template do WhatsApp pendente de validação/envio ─────────────
  // Aberto pelo slash menu (meta-template) ou pelo menu "+". O envio é
  // feito pelo botão do próprio painel após o agente validar as variáveis.
  const [pendingTemplate, setPendingTemplate] = useState<PendingTemplate | null>(null);

  // Template empurrado de fora (modal de sessão expirada) → abre o painel.
  useEffect(() => {
    if (externalTemplate) {
      setPendingTemplate(externalTemplate);
      onExternalTemplateConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalTemplate]);

  // Foca o textarea quando o agente clica "Responder" numa mensagem — evita
  // um clique extra pra começar a digitar a resposta.
  useEffect(() => {
    if (replyTo?.id) {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [replyTo?.id]);

  // Auto-resize centralizado: recalcula a altura sempre que `value` muda.
  // Vazio → altura fixa de 1 linha (senão o placeholder longo, ex. sessão
  // encerrada, faz o scrollHeight “inchar” a caixa pra ~120px).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    if (!value.trim()) {
      el.style.height = "24px";
      return;
    }
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [value, disabled, noteMode]);

  // Insere o texto de um modelo interno no campo (editável) e foca o cursor.
  // Se `media` vier junto:
  //  - 1 anexo sem messageBefore → encosta pra ser enviado com a mensagem
  //    (editável, envio pelo Enter/botão — comportamento antigo).
  //  - multi-anexo OU messageBefore>=1 → envia a SEQUÊNCIA imediatamente
  //    (texto + anexos), sem depender do Enter.
  function insertTemplateText(
    text: string,
    media?: Array<{
      url: string;
      name: string | null;
      mimeType?: string | null;
      messageBefore?: string | null;
    }> | null,
  ) {
    const list = media && media.length > 0 ? media : [];
    const base = value;
    const next = base.trim()
      ? `${base}${base.endsWith("\n") ? "" : "\n"}${text}`
      : text;

    if (list.length > 0 && mediaNeedsSequence(list) && conversationId) {
      const targetConversationId = conversationId;
      const content = next;
      // 29/jul/26 — limpa antes do await: durante o upload o texto no campo
      // convidava Enter e gerava POST duplicado da 1ª mensagem.
      onChange("");
      draftRef.current = "";
      setSequenceSending(true);
      void (async () => {
        try {
          await sendInternalTemplateSequence({
            conversationId: targetConversationId,
            content,
            attachments: list,
          });
          qc.invalidateQueries({ queryKey: messagesKey(targetConversationId) });
          applyOutboundPreviewToInboxCaches(qc, targetConversationId, {
            content,
          });
        } finally {
          setSequenceSending(false);
        }
      })();
      return;
    }

    if (list.length > 0) setPendingMediaList((prev) => [...prev, ...list]);
    onChange(next);
    draftRef.current = next;
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.length, next.length);
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    });
  }

  // Ponte: botões da lateral (ex. "Enviar produto") empurram texto (+ mídia)
  // pra cá sem prop-drilling pelo ContactAside.
  // No mobile o Chat pode estar desmontado (aba Negócio) — nesse caso o
  // payload fica em `takePendingComposerInsert` e é aplicado ao montar.
  const insertTemplateTextRef = useRef(insertTemplateText);
  insertTemplateTextRef.current = insertTemplateText;
  const sendProductStepsRef = useRef<
    (steps: Parameters<typeof sendProductSteps>[0]["steps"]) => Promise<void>
  >(async () => {});
  useComposerInsertBridge({
    insertTemplateTextRef,
    draftRef,
    setPendingMediaList,
    sendProductStepsRef,
  });

  const slash = useComposerSlash({
    value,
    onChange,
    draftRef,
    textareaRef,
    rootRef,
    templateContext,
    conversationId,
    contactId,
    selectedChannelId,
    conversationChannelId,
    disabled,
    noteMode,
    qc,
    setSequenceSending,
    setPendingMediaList,
    setPendingTemplate,
  });

  // `disabled` vindo do caller representa restrição do canal de saída
  // (ex.: sessão WhatsApp de 24h expirada — só pode enviar template).
  // Nota interna NÃO é enviada ao cliente, é anotação interna do CRM,
  // então essa restrição não se aplica e o composer deve continuar
  // funcional no modo nota. Caller pode bloquear nota interna passando
  // `onSendNote=undefined`.
  const inputDisabled = noteMode ? false : !!disabled;

  // Desabilitar o textarea enquanto `busy` blurra o campo no browser.
  // Durante o envio o campo fica só readOnly; ao terminar, devolvemos
  // o foco para a próxima mensagem sem um clique extra.
  const wasBusyRef = useRef(false);
  useEffect(() => {
    if (busy) {
      wasBusyRef.current = true;
      return;
    }
    if (!wasBusyRef.current || inputDisabled) return;
    wasBusyRef.current = false;
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [busy, inputDisabled]);

  sendProductStepsRef.current = async (steps) => {
    if (!conversationId) {
      toast.error("Abra a conversa para enviar os produtos.");
      return;
    }
    if (inputDisabled) {
      warnOutboundBlocked();
      return;
    }
    setSequenceSending(true);
    try {
      await sendProductSteps({
        conversationId,
        channelId: selectedChannelId,
        steps,
        qc,
        applySignature,
      });
    } finally {
      setSequenceSending(false);
    }
  };

  function warnOutboundBlocked() {
    if (sessionExpired) {
      toast.error(SESSION_CLOSED_TOAST, {
        action: onRequestTemplate
          ? { label: "Usar Template", onClick: () => onRequestTemplate() }
          : undefined,
      });
      onRequestTemplate?.();
      return;
    }
    toast.error(
      placeholder || "Você não tem permissão para enviar mensagens neste canal.",
    );
  }

  async function confirmChannelSwitchIfNeeded(): Promise<boolean> {
    if (
      !isChannelMismatch(
        selectedChannelId,
        conversationChannelId,
        availableChannels,
      ) ||
      !selectedChannelId ||
      !conversationChannelId
    ) {
      return true;
    }
    return confirmDialog(
      channelSwitchConfirmOptions(
        availableChannels,
        selectedChannelId,
        conversationChannelId,
      ),
    );
  }

  const { flushOutbound } = useOutboundFlush({
    conversationId,
    selectedChannelId,
    qc,
    onChange,
    onSend,
    draftRef,
    pendingMediaListRef,
    setPendingMediaList,
    pendingFilesRef,
    setPendingFiles,
    setSequenceSending,
  });

  async function performSend() {
    const trimmed = value.trim();
    // Permite enviar quando há texto OU algum anexo encostado (modelo ou imagem colada).
    if (
      (!trimmed && pendingMediaList.length === 0 && pendingFiles.length === 0) ||
      busy
    ) {
      return;
    }
    if (inputDisabled) {
      warnOutboundBlocked();
      return;
    }
    if (noteMode && onSendNote) {
      // Nota interna não carrega anexo de modelo/imagem.
      if (trimmed) onSendNote(trimmed);
      return;
    }
    if (!(await confirmChannelSwitchIfNeeded())) return;
    // Capa de produto (sendBeforeText): 1 mensagem imagem+caption se o texto
    // couber em 1024 chars; senão imagem e texto separados.
    if (trimmed) {
      await flushOutbound(applySignature(trimmed));
      return;
    }
    await flushOutbound(null);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    performSend();
  }

  function insertQuickReply(item: QuickReplyCatalogItem) {
    const trimmed = item.content.trim();
    if (!trimmed || busy) return;
    if (inputDisabled) {
      warnOutboundBlocked();
      return;
    }
    insertTemplateText(
      trimmed,
      item.attachmentUrl
        ? [{ url: item.attachmentUrl, name: null, mimeType: null, messageBefore: null }]
        : null,
    );
  }

  // Ctrl+V de imagem (print / copiar imagem) → encosta como anexo PENDENTE
  // no composer (com preview). NÃO envia: só vai no próximo clique em enviar
  // / Enter, junto com o texto. Paste de texto normal segue intacto.
  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    if (busy) return;
    if (inputDisabled) {
      const items = e.clipboardData?.items;
      const hasImage = items
        ? Array.from(items).some((item) => item.kind === "file" && item.type.startsWith("image/"))
        : false;
      if (hasImage) {
        e.preventDefault();
        warnOutboundBlocked();
      }
      return;
    }
    const items = e.clipboardData?.items;
    if (!items) return;

    const images: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const f = item.getAsFile();
        if (f) images.push(f);
      }
    }
    // Sem imagem no clipboard → deixa o paste de texto acontecer normalmente.
    if (images.length === 0) return;

    // Impede que o binário caia como texto no campo.
    e.preventDefault();
    stageFiles(images, "imagem-colada");
  }

  // Encosta arquivos como anexos pendentes (preview só para imagem). O
  // envio ocorre no fluxo normal (botão / Enter) via flushPendingFiles(),
  // com o texto do composer como legenda do primeiro arquivo.
  function stageFiles(files: File[], fallbackBaseName = "arquivo") {
    if (files.length === 0) return;
    if (!conversationId) {
      toast.error("Selecione uma conversa antes de anexar");
      return;
    }
    if (inputDisabled) {
      warnOutboundBlocked();
      return;
    }
    if (noteMode) {
      toast.error("Nota interna não aceita anexo. Volte para Mensagem para enviar o arquivo.");
      return;
    }
    const now = Date.now();
    const staged = files.map((file, i) => {
      const isImage = fileIsImage(file);
      const ext = isImage ? imageExtFromMime(file.type) : "bin";
      return {
        id: `${now}-${i}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl: isImage ? URL.createObjectURL(file) : null,
        name: file.name?.trim() || `${fallbackBaseName}-${now}-${i}.${ext}`,
      };
    });
    setPendingFiles((prev) => [...prev, ...staged]);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  // Arrastar arquivo do computador: escuta em capture no document para o
  // drop não ser engolido por outro listener da página (board, overlay).
  // Zonas marcadas com data-file-drop-zone (importar CSV) continuam donas.
  const stageFilesRef = useRef(stageFiles);
  stageFilesRef.current = stageFiles;
  useFileDropListeners({ stageFilesRef, setDropActive });

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Deixa o slash menu consumir Up/Down/Enter/Esc/Tab primeiro
    const consumed = slash.onKeyDown(e);
    if (consumed) return;

    // Enter sem Shift = envio
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      performSend();
    }
  }

  // Canal Baileys não tem janela de 24h → o diálogo de agendamento não
  // oferece template fallback. Canal desconhecido: mantém a opção (Meta).
  const scheduleSendChannel = availableChannels?.find(
    (c) => c.id === (selectedChannelId ?? conversationChannelId),
  );
  const scheduleTemplateFallback = scheduleSendChannel
    ? scheduleSendChannel.provider !== "BAILEYS_MD"
    : true;

  return (
    <div ref={rootRef} className="relative mx-3 mb-1 max-md:mx-2 max-md:mb-1 sm:mx-4">
      {confirmDialogNode}
      {/* Agendamentos pendentes da conversa — acima do input, em todo host */}
      <ScheduledMessagesBanner conversationId={conversationId} />
      {/* Painel de validação do template do WhatsApp — flutua acima do composer */}
      {pendingTemplate && conversationId ? (
        <TemplateComposePanel
          conversationId={conversationId}
          template={pendingTemplate}
          onCancel={() => setPendingTemplate(null)}
          onSent={() => setPendingTemplate(null)}
          availableChannels={availableChannels}
          selectedChannelId={selectedChannelId ?? null}
          conversationChannelId={conversationChannelId ?? null}
          lastMessageChannelId={lastMessageChannelId ?? null}
          onSelectChannel={onSelectChannel}
        />
      ) : null}

      {/* Barra de preview do reply (estilo WhatsApp) — logo acima do input.
          Aparece quando o agente clicou "Responder" numa mensagem. O X limpa
          o estado no caller; o envio já inclui replyToId no payload. */}
      {replyTo && (
        <ReplyPreviewBar replyTo={replyTo} onCancelReply={onCancelReply} />
      )}

      {/* Anexo(s) encostado(s) por um modelo/mensagem rápida — vão junto no envio.
          (Só aparece pra 1 anexo sem messageBefore — os demais casos disparam
          a sequência na hora, sem passar por aqui.) */}
      {pendingMediaList.length > 0 && (
        <PendingMediaChips
          pendingMediaList={pendingMediaList}
          setPendingMediaList={setPendingMediaList}
        />
      )}

      {/* Overlay de drop — arquivo do SO sendo arrastado sobre a página. */}
      {dropActive && (
        <FileDropOverlay />
      )}

      {/* Arquivos encostados (colados, arrastados ou anexados) — enviados no próximo envio. */}
      {pendingFiles.length > 0 && (
        <PendingFileChips pendingFiles={pendingFiles} removePendingFile={removePendingFile} />
      )}

      {/* Slash command menu — modal central (renderizada via portal) */}
      <SlashCommandMenu
        open={!pendingTemplate && slash.state.open}
        state={slash.state}
        onSelectItem={slash.onSelectItem}
        onHover={slash.setActiveIndex}
        onClose={slash.close}
        onSearchChange={slash.setSearch}
        onSearchKeyDown={slash.onKeyDown}
        onToggleFavorite={slash.toggleFavorite}
      />

      {/* ── Row: Transferir + tabs (esq.) … Nº + Encerrar/Reabrir (dir.) ── */}
      {(transferSlot ||
        onSendNote ||
        (signatureAllowed && !noteMode) ||
        (!noteMode && (availableChannels?.length ?? 0) > 1) ||
        conversationId ||
        conversationNumber != null) && (
        <ComposerTopRow
          transferSlot={transferSlot}
          onSendNote={onSendNote}
          noteMode={noteMode}
          setNoteMode={setNoteMode}
          availableChannels={availableChannels}
          selectedChannelId={selectedChannelId}
          conversationChannelId={conversationChannelId}
          onSelectChannel={onSelectChannel}
          busy={busy}
          signatureAllowed={signatureAllowed}
          signature={signature}
          agentName={agentName}
          signatureEditable={signatureEditable}
          viewersSlot={viewersSlot}
          conversationNumber={conversationNumber}
          conversationId={conversationId}
          isResolved={isResolved}
          hideResolveButton={hideResolveButton}
          departmentId={departmentId}
          assignedToId={assignedToId}
          requireTabulationOnClose={requireTabulationOnClose}
          onReopenNewConversation={onReopenNewConversation}
          onResolved={onResolved}
          onFollowedUp={onFollowedUp}
          contactId={contactId}
          contactName={contactName}
          dealId={dealId}
        />
      )}

      <form
        onSubmit={handleSubmit}
        className="flex min-h-11 min-w-0 items-center gap-1.5 overflow-visible rounded-[var(--radius-2xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] py-1 pl-3 pr-1.5 backdrop-blur-md shadow-[var(--glass-shadow-sm)] sm:gap-2"
      >
        {/* Controles padrão — ocultos durante gravação de áudio */}
        {!isAudioActive && (
          <>
            <ComposerMenu
              conversationId={conversationId}
              channelId={selectedChannelId ?? conversationChannelId ?? null}
              scheduleTemplateFallback={scheduleTemplateFallback}
              className="h-9 w-9 shrink-0"
              noteMode={noteMode}
              onToggleNote={onSendNote ? () => setNoteMode((v) => !v) : undefined}
              isResolved={hideResolveInMenu ? undefined : isResolved}
              contactId={contactId}
              contactName={contactName}
              dealId={dealId}
              dealTitle={dealTitle}
              deals={deals}
              templateContext={templateContext}
              onPickInternal={insertTemplateText}
              onPickTemplate={(tpl) => setPendingTemplate(whatsappTemplateToPending(tpl))}
              departmentId={departmentId ?? null}
              assignedToId={assignedToId}
              requireTabulationOnClose={requireTabulationOnClose}
              onReopenNewConversation={onReopenNewConversation}
              onResolved={onResolved}
              onFollowedUp={onFollowedUp}
              outboundDisabled={inputDisabled}
              beforeOutboundSend={confirmChannelSwitchIfNeeded}
              onOutboundBlocked={warnOutboundBlocked}
              onStageFiles={(files) => stageFiles(files)}
              enableCallPermission={enableCallPermission}
            />
            <EmojiButton
              emojiWrapRef={emojiWrapRef}
              emojiOpen={emojiOpen}
              setEmojiOpen={setEmojiOpen}
              inputDisabled={inputDisabled}
              busy={busy}
              insertEmoji={insertEmoji}
            />
            <QuickReplyPopover
              disabled={busy}
              sending={busy}
              onSend={insertQuickReply}
              onOpenChange={(next) => {
                if (next) {
                  setEmojiOpen(false);
                  setNoteMode(false);
                }
              }}
            />
          </>
        )}

        {/* Área de texto — oculta durante gravação de áudio */}
        {!isAudioActive && (
          <div className="flex min-h-9 min-w-0 flex-1 flex-col justify-center py-1.5">
            <textarea
              ref={textareaRef}
              rows={1}
              value={value}
              onChange={(e) => {
                const next = e.target.value;
                onChange(next);
                notifyTyping(next);
                if (!next.trim()) {
                  e.target.style.height = "24px";
                  return;
                }
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
              }}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={
                noteMode
                  ? "Nota interna (não enviada ao cliente)..."
                  : inputDisabled
                    ? "Sessão encerrada — use um template"
                    : placeholder ?? "Escreva uma mensagem ou / para modelos..."
              }
              disabled={inputDisabled}
              readOnly={busy}
              className="w-full resize-none overflow-y-auto border-none bg-transparent font-body text-sm leading-snug text-[var(--text-primary)] outline-none placeholder:truncate placeholder:text-[var(--text-muted)] disabled:cursor-not-allowed disabled:opacity-50"
              style={{ height: "24px", minHeight: "24px", maxHeight: "120px" }}
            />
          </div>
        )}

        {/* AudioRecorderButton: microfone (idle) ou barra inline (recording/preview) */}
        {!noteMode && (
          <AudioRecorderButton
            conversationId={conversationId}
            className="h-9 w-9 shrink-0"
            onStateChange={setAudioRecState}
            disabled={inputDisabled}
            beforeSend={confirmChannelSwitchIfNeeded}
            onBlocked={warnOutboundBlocked}
          />
        )}

        {/* Automações em execução — botão ao lado do enviar (inbox e deal). */}
        {!isAudioActive && contactId && (
          <ActiveBotsButton
            inline
            contactId={contactId}
            conversationId={conversationId}
          />
        )}

        {/* Botão enviar — oculto durante gravação (AudioRecorderButton tem o seu próprio) */}
        {!isAudioActive && (
          <TooltipGlass label={noteMode ? "Salvar nota" : "Enviar mensagem"} side="top">
            <span className="inline-flex">
              <ButtonGlass
                type="submit"
                variant="primary"
                size="icon"
                className="h-9 w-9 shrink-0"
                disabled={
                  (!value.trim() && pendingFiles.length === 0 && pendingMediaList.length === 0) ||
                  busy ||
                  inputDisabled
                }
              >
                <IconSend size={18} />
              </ButtonGlass>
            </span>
          </TooltipGlass>
        )}
      </form>
    </div>
  );
}
