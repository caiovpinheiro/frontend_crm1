"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  IconSend,
  IconMoodSmile,
  IconLock,
  IconMessage,
  IconSignature,
  IconPencil,
  IconCheck,
  IconX,
  IconCornerUpLeft,
  IconPaperclip,
} from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import { ButtonGlass } from "@/components/crm/button-glass";
import { TooltipGlass } from "@/components/crm/tooltip-glass";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmojiPicker } from "@/components/inbox/emoji-picker";
import {
  useSlashMenu,
  SlashCommandMenu,
} from "@/components/inbox/slash-command-menu";
import { getContact } from "@/features/inbox-v2/api/misc";
import {
  sendAttachment,
  sendInternalTemplateSequence,
  mediaNeedsSequence,
} from "@/features/inbox-v2/api";
import { applyOutboundPreviewToInboxCaches, messagesKey } from "@/features/inbox-v2/hooks";
import type { InternalTemplateContext } from "@/lib/internal-template-variables";
import {
  clearPendingComposerInsert,
  COMPOSER_INSERT_EVENT,
  takePendingComposerInsert,
} from "@/lib/composer-insert";

import { ActiveBotsButton } from "./active-bots-button";
import { AudioRecorderButton, type AudioRecordState } from "./audio-recorder-button";
import { ChannelSelector } from "./channel-selector";
import {
  SESSION_CLOSED_TOAST,
  channelSwitchConfirmOptions,
  isChannelMismatch,
} from "./channel-switch-confirm";
import { ComposerMenu } from "./composer-menu";
import { ConversationResolveButton } from "./conversation-resolve-button";
import {
  TemplateComposePanel,
  whatsappTemplateToPending,
  type PendingTemplate,
} from "./template-compose-panel";
import type { OutboundChannelOption } from "@/features/inbox-v2/hooks/use-channels";

/**
 * Composer completo para o ChatArea. Substitui o footer estático
 * do v0 via prop `composerSlot`. Reúne:
 *  - ComposerMenu ("+" — anexo, template, nota, agendar, tarefa, resolver)
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
  transferSlot,
  onRequestTemplate,
  sessionExpired,
  enableCallPermission,
}: {
  conversationId: string | null;
  value: string;
  onChange: (value: string) => void;
  /** Pode retornar Promise — o composer aguarda antes de enviar anexos do modelo. */
  onSend: (value: string) => void | Promise<void>;
  /** Envio como nota interna (isPrivate). Quando ausente, o item "Nota interna" não aparece no menu. */
  onSendNote?: (value: string) => void;
  sending?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Quando definido, habilita o item Finalizar/Reabrir no menu "+". */
  isResolved?: boolean;
  contactId?: string | null;
  contactName?: string | null;
  /** Negócio exibido — padrão ao criar tarefa pelo menu "+". */
  dealId?: string | null;
  dealTitle?: string | null;
  /** Negócios do contato para o seletor da tarefa. */
  deals?: { id: string; title: string }[];
  /**
   * Template empurrado por um picker externo (ex.: modal de sessão expirada).
   * Quando muda para não-nulo, abre o painel de validação aqui dentro.
   */
  externalTemplate?: PendingTemplate | null;
  /** Avisado quando o `externalTemplate` foi absorvido (para o pai limpar). */
  onExternalTemplateConsumed?: () => void;
  /** Permissão org-level: agentes podem usar assinatura. Default true. */
  signatureAllowed?: boolean;
  /** Permissão org-level: agentes podem editar o texto da assinatura. Default true. */
  signatureEditable?: boolean;
  /**
   * Canais WhatsApp CONNECTED da org (para seletor de canal de envio).
   * O seletor só é renderizado quando `availableChannels.length > 1` —
   * orgs com 1 canal não precisam do widget.
   */
  availableChannels?: OutboundChannelOption[];
  /** Canal selecionado para o envio. Controlado pelo pai. */
  selectedChannelId?: string | null;
  /** Canal "atual" da conversa (último inbound) — destacado como referência. */
  conversationChannelId?: string | null;
  /** Canal da última mensagem pública — usado pra pré-selecionar no modal. */
  lastMessageChannelId?: string | null;
  /** Callback quando o agente troca o canal de envio. */
  onSelectChannel?: (channelId: string) => void;
  /**
   * Mensagem selecionada para "responder" (estilo WhatsApp). Quando não
   * nula, o composer renderiza uma barra de preview acima do input com o
   * remetente citado + preview do texto. O caller é responsável por incluir
   * `replyToId: replyTo.id` no payload de `sendMessage` e limpar após o envio.
   */
  replyTo?: {
    id: string;
    preview: string;
    senderName?: string | null;
  } | null;
  /** Handler do X para cancelar a resposta. */
  onCancelReply?: () => void;
  /** Departamento da conversa — propagado ao ComposerMenu para abrir
   *  modal de tabulacao ao encerrar quando o dept exige. */
  departmentId?: string | null;
  assignedToId?: string | null;
  requireTabulationOnClose?: boolean;
  /** Reabrir pelo menu "+" cria um NOVO ticket (modelo de ticket); troca o
   *  chat ativo pro id novo. Sem isto o reopen acontece no backend mas a UI
   *  fica presa no ticket resolvido (que some do colapso) — parece "não reabriu". */
  onReopenNewConversation?: (newConversationId: string) => void;
  /** Após Encerrar — atualiza sticky/status local (evita toast de deep-link). */
  onResolved?: (conversationId: string) => void;
  onFollowedUp?: (conversationId: string) => void;
  /** Nº do ticket — exibido ao lado de Encerrar/Reabrir. */
  conversationNumber?: number | null;
  /** Slot à esquerda das tabs (ex.: TransferPopover). */
  transferSlot?: ReactNode;
  /** Abre o fluxo de template (sessão 24h encerrada). */
  onRequestTemplate?: () => void;
  /** Janela de 24h da Meta encerrada — aviso dedicado + CTA de template. */
  sessionExpired?: boolean;
  /** Exibe "Pedir permissão de ligação" no menu +. */
  enableCallPermission?: boolean;
}) {
  const { confirm: confirmDialog, dialog: confirmDialogNode } = useConfirm();
  const [noteMode, setNoteMode] = useState(false);
  const [audioRecState, setAudioRecState] = useState<AudioRecordState>("idle");
  const isAudioActive = audioRecState !== "idle";

  // Painel de emoji — abre acima do botão smiley. Insere no cursor do textarea.
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!emojiOpen) return;
    function onDoc(e: MouseEvent) {
      if (emojiWrapRef.current && !emojiWrapRef.current.contains(e.target as Node)) {
        setEmojiOpen(false);
      }
    }
    function onEsc(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") setEmojiOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [emojiOpen]);

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

  // Imagens coladas (Ctrl+V) → ficam "encostadas" como anexos pendentes e só
  // são enviadas quando o operador clica em enviar / pressiona Enter (mesma
  // ideia do pendingMedia, mas guardando o File binário + URL de preview).
  const [pendingFiles, setPendingFiles] = useState<
    { id: string; file: File; previewUrl: string; name: string }[]
  >([]);
  const pendingFilesRef = useRef(pendingFiles);
  useEffect(() => {
    pendingFilesRef.current = pendingFiles;
  }, [pendingFiles]);
  // Revoga as URLs de preview ainda pendentes ao desmontar (evita vazamento).
  useEffect(
    () => () => {
      pendingFilesRef.current.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    },
    [],
  );

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
  const [sigEnabled, setSigEnabled] = useState(true);
  const [sigValue, setSigValue] = useState("");
  const [sigEditing, setSigEditing] = useState(false);
  const [sigDraft, setSigDraft] = useState("");

  useEffect(() => {
    try {
      const e = window.localStorage.getItem("eduit:signature:enabled");
      const v = window.localStorage.getItem("eduit:signature:value");
      if (e !== null) setSigEnabled(e === "1");
      if (v !== null) setSigValue(v);
    } catch {
      /* ignore */
    }
  }, []);

  const effectiveSignature = (sigValue.trim() || agentName).trim();

  function persistSigEnabled(v: boolean) {
    setSigEnabled(v);
    try {
      window.localStorage.setItem("eduit:signature:enabled", v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }
  function persistSigValue(v: string) {
    setSigValue(v);
    try {
      window.localStorage.setItem("eduit:signature:value", v);
    } catch {
      /* ignore */
    }
  }

  // Prefixa a assinatura de forma idempotente (não duplica se o texto já
  // vier assinado em qualquer um dos formatos usados historicamente).
  function applySignature(text: string): string {
    const sig = effectiveSignature;
    // Respeita a permissão org-level "Permitir assinatura": quando desligada,
    // a assinatura nunca é aplicada, mesmo que o agente a tenha habilitado
    // localmente antes (estado persistido em localStorage).
    if (!signatureAllowed || !sigEnabled || !sig) return text;
    const s = sig.toLowerCase();
    const lower = text.toLowerCase();
    const already =
      lower.startsWith(`*${s}:*`) ||
      lower.startsWith(`*${s}*:`) ||
      lower.startsWith(`*${s}*`) ||
      lower.startsWith(`${s}:`);
    return already ? text : `*${sig}*: ${text}`;
  }

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

  // Ponte: botões da lateral (ex. "Enviar produto" de curso) empurram texto
  // pra cá sem prop-drilling pelo ContactAside.
  // No mobile o Chat pode estar desmontado (aba Negócio) — nesse caso o
  // texto fica em `takePendingComposerInsert` e é aplicado ao montar.
  const insertTemplateTextRef = useRef(insertTemplateText);
  insertTemplateTextRef.current = insertTemplateText;
  useEffect(() => {
    function applyInsert(text: string) {
      if (!text.trim()) return;
      clearPendingComposerInsert();
      insertTemplateTextRef.current(text);
    }
    function onInsert(e: Event) {
      const detail = (e as CustomEvent<{ text?: string }>).detail;
      const text = typeof detail?.text === "string" ? detail.text : "";
      applyInsert(text);
    }
    window.addEventListener(COMPOSER_INSERT_EVENT, onInsert as EventListener);
    const pending = takePendingComposerInsert();
    if (pending) applyInsert(pending);
    return () => {
      window.removeEventListener(COMPOSER_INSERT_EVENT, onInsert as EventListener);
    };
  }, []);

  // ── Slash command (/modelos) ────────────────────────────────────
  // Modelo interno → o hook insere o texto interpolado no campo (editável).
  // Template Meta → abre o painel de validação.
  // Wrapper de `setDraft` para o slash menu: atualiza `draftRef`
  // SINCRONAMENTE antes de propagar pro estado do pai. O slash chama
  // `setDraft(next)` e, logo em seguida (ainda síncrono), `onInsertMedia` —
  // por isso `draftRef.current` já reflete o texto novo quando
  // `onInsertMedia` roda, mesmo a prop `value` só atualizando no próximo render.
  function handleSlashDraftChange(next: string) {
    draftRef.current = next;
    onChange(next);
  }

  const slash = useSlashMenu({
    draft: value,
    setDraft: handleSlashDraftChange,
    textareaRef,
    templateContext,
    // Conversa/contato atuais — habilitam a seção "Automações" no menu "/".
    conversationId,
    contactId,
    channelId: selectedChannelId ?? conversationChannelId ?? null,
    // Desabilita o atalho em modo nota (não faz sentido inserir templates ali)
    disabled: disabled || noteMode,
    // Modelo/mensagem rápida com anexo — 1 anexo sem messageBefore encosta
    // pra ir junto no Enter (editável); multi-anexo ou messageBefore>=1
    // exige a SEQUÊNCIA imediata (texto já está em `draftRef` — ver acima).
    onInsertMedia: (media) => {
      const list = Array.isArray(media) ? media : [media];
      if (mediaNeedsSequence(list) && conversationId) {
        const targetConversationId = conversationId;
        // `queueMicrotask` garante que rodamos após o restante do handler
        // síncrono do slash (setDraft já rodou, `draftRef` já está fresco).
        queueMicrotask(() => {
          const text = draftRef.current;
          onChange("");
          draftRef.current = "";
          setSequenceSending(true);
          void (async () => {
            try {
              await sendInternalTemplateSequence({
                conversationId: targetConversationId,
                content: text,
                attachments: list,
              });
              qc.invalidateQueries({ queryKey: messagesKey(targetConversationId) });
              applyOutboundPreviewToInboxCaches(qc, targetConversationId, {
                content: text,
              });
            } finally {
              setSequenceSending(false);
            }
          })();
        });
        return;
      }
      setPendingMediaList((prev) => [...prev, ...list]);
    },
    onPickMetaTemplate: (item) =>
      setPendingTemplate({
        name: item.name,
        label: item.label || undefined,
        content: item.bodyPreview,
        metaTemplateId: item.id,
        operatorVariables: item.operatorVariables ?? null,
      }),
  });

  // Fechar o slash menu via ESC (mesmo sem foco no textarea) e ao clicar
  // fora do composer — o hook só fecha por teclado com o textarea focado.
  useEffect(() => {
    if (!slash.state.open) return;
    function onEsc(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") slash.close();
    }
    function onPointer(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        slash.close();
      }
    }
    document.addEventListener("keydown", onEsc);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onEsc);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [slash.state.open, slash.close]);

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
      !isChannelMismatch(selectedChannelId, conversationChannelId) ||
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

  // Envia os anexos encostados (mídia de modelo/mensagem rápida) logo após o
  // texto do Enter — via o helper compartilhado (SEQUENCIAL, com toast em
  // falha intermediária). Lê de `pendingMediaListRef` (não do state direto)
  // pra evitar stale closure entre o render que agendou e o flush em si.
  async function flushPendingMedia() {
    const list = pendingMediaListRef.current;
    if (list.length === 0 || !conversationId) return;
    setPendingMediaList([]);
    pendingMediaListRef.current = [];
    await sendInternalTemplateSequence({ conversationId, content: "", attachments: list });
  }

  // Remove uma imagem colada da fila de pendentes (revoga a URL de preview).
  function removePendingFile(id: string) {
    setPendingFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  }

  // Envia as imagens coladas encostadas (uma a uma) após o texto. Limpa o
  // estado e revoga as URLs de preview ao final. Silencioso em erro.
  async function flushPendingFiles() {
    if (pendingFiles.length === 0 || !conversationId) return;
    const files = pendingFiles;
    setPendingFiles([]);
    await Promise.allSettled(
      files.map((f) => sendAttachment(conversationId, f.file, { fileName: f.name })),
    );
    files.forEach((f) => URL.revokeObjectURL(f.previewUrl));
  }

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
    // Aguarda o texto sair antes dos anexos — evita race (arquivo aparecer
    // antes da 1ª mensagem) e garante ordem: texto → arq1 → msg2 → arq2…
    if (trimmed) {
      try {
        await Promise.resolve(onSend(applySignature(trimmed)));
      } catch {
        /* texto falhou; ainda tenta anexos se o caller não bloqueou */
      }
    }
    await flushPendingMedia();
    await flushPendingFiles();
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    performSend();
  }

  // Extensão de arquivo a partir do mime da imagem colada.
  function imageExtFromMime(mime: string): string {
    const map: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/gif": "gif",
      "image/webp": "webp",
      "image/bmp": "bmp",
      "image/svg+xml": "svg",
    };
    return map[mime] ?? "png";
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

    if (!conversationId) {
      toast.error("Selecione uma conversa antes de colar uma imagem");
      return;
    }

    // Encosta cada imagem como anexo pendente (com preview). O envio ocorre
    // no fluxo normal (botão / Enter) via flushPendingFiles().
    const now = Date.now();
    const staged = images.map((file, i) => {
      const ext = imageExtFromMime(file.type);
      return {
        id: `${now}-${i}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        name: file.name?.trim() || `imagem-colada-${now}-${i}.${ext}`,
      };
    });
    setPendingFiles((prev) => [...prev, ...staged]);
  }

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

  return (
    <div ref={rootRef} className="relative mx-3 mb-1 max-md:mx-2 max-md:mb-1 sm:mx-4">
      {confirmDialogNode}
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
        <div className="mb-2 flex items-stretch gap-2 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-3 py-2 shadow-[var(--glass-shadow-sm)] backdrop-blur-md">
          <div className="flex shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)]/12 p-1.5 text-[var(--brand-primary)]">
            <IconCornerUpLeft size={14} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 border-l-[3px] border-[var(--brand-primary)] pl-2">
            <span className="font-display text-[10.5px] font-bold uppercase tracking-wider text-[var(--brand-primary)]">
              Respondendo {replyTo.senderName?.trim() ? `a ${replyTo.senderName.trim()}` : "mensagem"}
            </span>
            <span className="line-clamp-2 break-words font-body text-[12px] leading-snug text-[var(--text-secondary)]">
              {replyTo.preview}
            </span>
          </div>
          {onCancelReply && (
            <button
              type="button"
              onClick={onCancelReply}
              aria-label="Cancelar resposta"
              className="shrink-0 self-start rounded-full p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--text-primary)]"
            >
              <IconX size={14} />
            </button>
          )}
        </div>
      )}

      {/* Anexo(s) encostado(s) por um modelo/mensagem rápida — vão junto no envio.
          (Só aparece pra 1 anexo sem messageBefore — os demais casos disparam
          a sequência na hora, sem passar por aqui.) */}
      {pendingMediaList.length > 0 && (
        <div className="mb-2 flex flex-col gap-1.5">
          {pendingMediaList.map((media, i) => {
            const before = i > 0 ? media.messageBefore?.trim() : "";
            return (
              <div
                key={`${media.url}-${i}`}
                className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-3 py-2 shadow-[var(--glass-shadow-sm)]"
              >
                <div className="flex shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)]/12 p-1.5 text-[var(--brand-primary)]">
                  <IconPaperclip size={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block truncate font-body text-[12px] text-[var(--text-secondary)]">
                    {media.name?.trim() || "Anexo do modelo"} · será enviado junto
                  </span>
                  {before ? (
                    <span className="block truncate font-body text-[11px] italic text-[var(--text-muted)]">
                      Antes: &ldquo;{before}&rdquo;
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setPendingMediaList((prev) => prev.filter((_, idx) => idx !== i))}
                  aria-label="Remover anexo"
                  className="shrink-0 rounded-full p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--text-primary)]"
                >
                  <IconX size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Imagens coladas (Ctrl+V) — encostadas; enviadas junto no próximo envio. */}
      {pendingFiles.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {pendingFiles.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-2 py-1.5 shadow-[var(--glass-shadow-sm)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={f.previewUrl}
                alt={f.name}
                className="h-9 w-9 shrink-0 rounded-[var(--radius-sm)] object-cover"
              />
              <span className="max-w-[140px] truncate font-body text-[12px] text-[var(--text-secondary)]">
                {f.name}
              </span>
              <button
                type="button"
                onClick={() => removePendingFile(f.id)}
                aria-label="Remover imagem"
                className="shrink-0 rounded-full p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--text-primary)]"
              >
                <IconX size={14} />
              </button>
            </div>
          ))}
        </div>
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
        <div data-tour="inbox-composer-bar" className="mb-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 px-0.5">
          {transferSlot}

          {/* Tabs Mensagem / Nota interna */}
          {onSendNote && (
            <>
              <button
                type="button"
                onClick={() => setNoteMode(false)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-display text-[11.5px] font-semibold transition-all",
                  !noteMode
                    ? "bg-[var(--brand-primary)] text-white shadow-[0_2px_8px_rgba(91,111,245,0.35)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
                )}
              >
                <IconMessage size={12} />
                Mensagem
              </button>
              <button
                type="button"
                onClick={() => setNoteMode(true)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-display text-[11.5px] font-semibold transition-all",
                  noteMode
                    ? "border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] text-[var(--text-primary)] shadow-[var(--glass-shadow-sm)] backdrop-blur-md"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
                )}
              >
                <IconLock size={12} />
                Nota interna
              </button>
            </>
          )}

          <div className="flex flex-1 flex-wrap items-center justify-end gap-1.5">
          {/* Seletor de canal — só quando há >1 WhatsApp CONNECTED e fora do modo nota.
              Notas internas não trafegam por canal. */}
          {!noteMode &&
            availableChannels &&
            availableChannels.length > 1 &&
            onSelectChannel ? (
            <ChannelSelector
              channels={availableChannels}
              selectedChannelId={selectedChannelId ?? null}
              conversationChannelId={conversationChannelId ?? null}
              onSelect={onSelectChannel}
              disabled={busy}
            />
          ) : null}

          {/* Slot direito: badge "Nota" no modo nota, assinatura no modo mensagem */}
          {noteMode ? (
            /* Badge de nota — ocupa o mesmo espaço da assinatura */
            <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2.5 py-1 font-display text-[11.5px] font-semibold text-warning ring-1 ring-inset ring-warning/25">
              <IconLock size={12} /> Nota
            </span>
          ) : signatureAllowed ? (
            /* Assinatura do agente */
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                role="switch"
                aria-checked={sigEnabled}
                aria-label={sigEnabled ? "Desligar assinatura" : "Ligar assinatura"}
                onClick={() => persistSigEnabled(!sigEnabled)}
                className={cn(
                  "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors",
                  sigEnabled ? "bg-[var(--brand-primary)]" : "bg-[var(--text-muted)]/40",
                )}
              >
                <span
                  className={cn(
                    "inline-block size-3 rounded-full bg-white shadow transition-transform",
                    sigEnabled ? "translate-x-[14px]" : "translate-x-[2px]",
                  )}
                />
              </button>
              <IconSignature size={13} className="shrink-0 text-[var(--text-muted)]" />
              {sigEditing ? (
                <span className="flex items-center gap-1">
                  <input
                    autoFocus
                    value={sigDraft}
                    onChange={(e) => setSigDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        persistSigValue(sigDraft.trim());
                        setSigEditing(false);
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setSigEditing(false);
                      }
                    }}
                    placeholder={agentName || "Seu nome"}
                    className="h-6 w-40 rounded-[var(--radius-sm)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-2 font-body text-[11.5px] text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]"
                  />
                  <button
                    type="button"
                    aria-label="Salvar assinatura"
                    onClick={() => { persistSigValue(sigDraft.trim()); setSigEditing(false); }}
                    className="rounded-[var(--radius-sm)] p-0.5 text-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/10"
                  >
                    <IconCheck size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label="Cancelar"
                    onClick={() => setSigEditing(false)}
                    className="rounded-[var(--radius-sm)] p-0.5 text-[var(--text-muted)] hover:bg-[var(--text-muted)]/10"
                  >
                    <IconX size={14} />
                  </button>
                </span>
              ) : (
                <>
                  <TooltipGlass
                    label={effectiveSignature ? `Assinando como ${effectiveSignature}` : "Defina um nome para assinar"}
                    side="top"
                  >
                    <span
                      className={cn(
                        "max-w-[140px] truncate font-body text-[11.5px] font-semibold transition-colors",
                        sigEnabled
                          ? "text-[var(--text-primary)]"
                          : "text-[var(--text-muted)] line-through",
                      )}
                    >
                      {effectiveSignature || "Sem assinatura"}
                    </span>
                  </TooltipGlass>
                  {signatureEditable && (
                    <button
                      type="button"
                      aria-label="Editar assinatura"
                      onClick={() => { setSigDraft(sigValue); setSigEditing(true); }}
                      className="rounded-[var(--radius-sm)] p-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--brand-primary)]/10 hover:text-[var(--brand-primary)]"
                    >
                      <IconPencil size={12} />
                    </button>
                  )}
                </>
              )}
            </div>
          ) : null}

          {/* Nº da conversa + Encerrar/Reabrir */}
          {(conversationNumber != null || conversationId) && (
            <div className="flex shrink-0 items-center gap-1.5">
              {conversationNumber != null && (
                <TooltipGlass
                  label={`Conversa Nº ${conversationNumber}`}
                  side="top"
                >
                  <span
                    className={cn(
                      "cursor-default font-display text-[11px] font-semibold tabular-nums",
                      isResolved
                        ? "text-[var(--text-muted)]"
                        : "text-emerald-600 v2-dark:text-emerald-400",
                    )}
                  >
                    Nº {conversationNumber}
                  </span>
                </TooltipGlass>
              )}
              {conversationId && (
                <ConversationResolveButton
                  conversationId={conversationId}
                  isResolved={isResolved}
                  departmentId={departmentId}
                  assignedToId={assignedToId}
                  requireTabulationOnClose={requireTabulationOnClose}
                  onReopenNewConversation={onReopenNewConversation}
                  onResolved={onResolved}
                  onFollowedUp={onFollowedUp}
                  contactId={contactId}
                  contactName={contactName}
                  dealId={dealId}
                  disabled={busy}
                />
              )}
            </div>
          )}
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="flex min-h-11 min-w-0 items-center gap-1.5 overflow-visible rounded-[var(--radius-2xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] py-1 pl-3 pr-1.5 backdrop-blur-md shadow-[var(--glass-shadow-sm)] sm:gap-2"
      >
        {/* Controles padrão — ocultos durante gravação de áudio */}
        {!isAudioActive && (
          <>
            <div data-tour="inbox-composer-plus" className="shrink-0">
            <ComposerMenu
              conversationId={conversationId}
              channelId={selectedChannelId ?? conversationChannelId ?? null}
              className="h-9 w-9 shrink-0"
              noteMode={noteMode}
              onToggleNote={onSendNote ? () => setNoteMode((v) => !v) : undefined}
              isResolved={isResolved}
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
              enableCallPermission={enableCallPermission}
            />
            </div>
            <div ref={emojiWrapRef} className="relative">
              <TooltipGlass label="Emoji" side="top">
                <span className="inline-flex">
                  <ButtonGlass
                    type="button"
                    variant="icon"
                    size="icon"
                    className={cn(
                      "h-9 w-9 shrink-0",
                      emojiOpen && "text-[var(--brand-primary)]",
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEmojiOpen((v) => !v);
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    disabled={inputDisabled || busy}
                  >
                    <IconMoodSmile size={20} />
                  </ButtonGlass>
                </span>
              </TooltipGlass>
              {emojiOpen && (
                <div
                  className="absolute bottom-12 left-0 z-50 w-[380px]"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <EmojiPicker
                    open={emojiOpen}
                    onPick={(emoji) => {
                      insertEmoji(emoji);
                      setEmojiOpen(false);
                    }}
                  />
                </div>
              )}
            </div>
          </>
        )}

        {/* Área de texto — oculta durante gravação de áudio */}
        {!isAudioActive && (
          <div data-tour="inbox-composer-input" className="flex min-h-9 min-w-0 flex-1 flex-col justify-center py-1.5">
            <textarea
              ref={textareaRef}
              rows={1}
              value={value}
              onChange={(e) => {
                const next = e.target.value;
                onChange(next);
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

        <div data-tour="inbox-composer-tools" className="flex shrink-0 items-center gap-1.5">
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
        </div>
      </form>
    </div>
  );
}
