"use client";

import { apiUrl } from "@/lib/api";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSSE } from "@/hooks/use-sse";
import { useIsMobile } from "@/hooks/use-media-query";
import { useUserRole } from "@/hooks/use-user-role";
import { IconAlertCircle as AlertCircle, IconAlertTriangle as AlertTriangle, IconArrowRight as ArrowRight, IconRobot as Bot, IconChecks as CheckCheck, IconCircleCheck as CheckCircle2, IconSquareCheck as CheckSquare, IconChevronDown as ChevronDown, IconChevronUp as ChevronUp, IconClock as Clock, IconDownload as Download, IconFileText as FileText, IconTemplate as LayoutTemplate, IconLoader2 as Loader2, IconLock as Lock, IconSpeakerphone as Megaphone, IconDots as MoreHorizontal, IconPaperclip as Paperclip, IconPlayerPause as Pause, IconPencil as Pencil, IconPhone as Phone, IconPhoneIncoming as PhoneIncoming, IconPhoneOff as PhoneOff, IconPhoneOutgoing as PhoneOutgoing, IconPin as Pin, IconPlayerPlay as Play, IconPlus as Plus, IconArrowBackUp as Reply, IconRotate2 as RotateCcw, IconDeviceFloppy as Save, IconSearch as Search, IconSend as Send, IconShare2 as Share2, IconShieldCheck as ShieldCheck, IconMoodSmile as Smile, IconDeviceMobile as Smartphone, IconUpload as Upload, IconVolume as Volume2, IconTool as Wrench, IconX as X } from "@tabler/icons-react";
import { AIDraftCard } from "@/components/inbox/ai-draft-card";
import { ChatAvatar } from "@/components/inbox/chat-avatar";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { AudioRecorder } from "@/components/inbox/audio-recorder";
import { AudioWaveform } from "@/components/inbox/audio-waveform";
import { EmojiPicker } from "@/components/inbox/emoji-picker";
import { TemplatePicker } from "@/components/inbox/template-picker";
import {
  SlashCommandMenu,
  useSlashMenu,
  type SlashItem,
} from "@/components/inbox/slash-command-menu";
import type { OperatorVariableMeta } from "@/lib/meta-whatsapp/operator-template-variables";
import { getContact } from "@/features/inbox-v2/api/misc";
import {
  mediaNeedsSequence,
  sendInternalTemplateSequence,
} from "@/features/inbox-v2/api";
import {
  emitConversationReopened,
  messagesKey as inboxMessagesKey,
} from "@/features/inbox-v2/hooks";
import {
  isImmediateMediaSrc,
  LazyChatDocument,
  LazyChatImage,
  LazyChatVideo,
} from "@/components/crm/lazy-chat-media";
import { ResolveConfirmDialog } from "@/features/inbox-v2/extras/skip-automations-option";
import type { InternalTemplateContext } from "@/lib/internal-template-variables";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipHost,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MotionDiv } from "@/components/ui/motion";
import { agentNameFromWhatsappCallSender } from "@/lib/whatsapp-call-chat";
import {
  parseTemplateMeta,
  prettifyChatMessageBody,
} from "@/lib/whatsapp-outbound-template-label";
import { dt } from "@/lib/design-tokens";
import { cn } from "@/lib/utils";
import { MetaSendErrorBalloon } from "@/components/crm/meta-send-error-balloon";
import { EventRow, classifyTimelineItem, isRedundantOpenStatusEvent } from "@/components/crm/chat-timeline";
import { DaySeparator, StickyDayPill, useStickyDayLabel } from "@/components/crm/message-bubble";

/** Texto da nota em uma linha (banner fixado estilo WhatsApp). */
function notePreviewOneLine(content: string, maxChars = 140): string {
  const t = prettifyChatMessageBody(content ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, Math.max(0, maxChars - 1))}…`;
}

type ConversationStatus = "OPEN" | "RESOLVED" | "PENDING" | "SNOOZED";
type ReactionDto = { emoji: string; senderName: string };
type InboxMessageDto = {
  id: number | string;
  content: string;
  createdAt: string | null;
  direction: "in" | "out" | "system";
  messageType: string | number | undefined;
  isPrivate?: boolean;
  senderName?: string | null;
  senderUserId?: string | null;
  authorType?: "human" | "bot" | "system" | string | null;
  senderImageUrl?: string | null;
  mediaUrl?: string | null;
  replyToId?: string | null;
  replyToPreview?: string | null;
  reactions?: ReactionDto[];
  sendStatus?: string;
  sendError?: string;
};
const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

type SessionInfo = {
  lastInboundAt: string | null;
  active: boolean;
  expiresAt: string | null;
};
type MessagesResponse = {
  messages: InboxMessageDto[];
  pinnedNoteId?: string | null;
  channelProvider?: string | null;
  session?: SessionInfo;
};

async function fetchMessages(
  conversationId: string,
): Promise<MessagesResponse> {
  // history=1: inclui as mensagens dos tickets ANTERIORES do mesmo contato/canal
  // (modelo "reabrir = novo ticket"). Sem isto, o chat do deal/contato/pipeline
  // mostrava só o ticket atual e o histórico "sumia" ao encerrar (o ticket
  // vira histórico) e "reaparecia" ao reabrir. Espelha o inbox
  // (features/inbox-v2/api/messages.ts), que já usava history=1. [jul/26]
  const res = await fetch(apiUrl(`/api/conversations/${conversationId}/messages?history=1`));
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(
      typeof data?.message === "string"
        ? data.message
        : "Erro ao carregar mensagens",
    );
  return {
    // Remove os separadores sintéticos de ticket que o backend injeta com
    // history=1 (`messageType: "ticket-separator"`, `direction: "system"`).
    // O ChatWindow não tem divisor de ticket — cairiam no SystemEventRow
    // exibindo o JSON cru. Aqui o histórico aparece de forma contínua.
    messages: Array.isArray(data.messages)
      ? data.messages.filter(
          (m: { messageType?: unknown }) => m?.messageType !== "ticket-separator",
        )
      : [],
    pinnedNoteId: data.pinnedNoteId ?? null,
    channelProvider: data.channelProvider ?? null,
    session: data.session ?? undefined,
  };
}
async function postMessage(
  conversationId: string,
  content: string,
  asNote: boolean,
  replyToId?: string | null,
) {
  const payload: Record<string, unknown> = asNote
    ? { content, messageType: "note", private: true }
    : { content };
  if (replyToId) payload.replyToId = replyToId;
  const res = await fetch(apiUrl(`/api/conversations/${conversationId}/messages`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(
      typeof data?.message === "string" ? data.message : "Erro ao enviar",
    );
  return data as { message: InboxMessageDto; metaError?: string };
}
async function postAttachment(
  conversationId: string,
  file: File | Blob,
  caption: string,
  fileName?: string,
) {
  const form = new FormData();
  form.append(
    "file",
    file,
    fileName ?? (file instanceof File ? file.name : "audio.ogg"),
  );
  if (caption) form.append("caption", caption);
  const res = await fetch(apiUrl(`/api/conversations/${conversationId}/attachments`), {
    method: "POST",
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(
      typeof data?.message === "string" ? data.message : "Erro ao enviar anexo",
    );
  if (data.metaError)
    throw new Error(
      `Salvo localmente, mas falhou via WhatsApp: ${data.metaError}`,
    );
  return data as { message: InboxMessageDto; audioDelivery?: "voice" | "audio" | "document" };
}
async function postReaction(messageId: string, emoji: string) {
  const res = await fetch(apiUrl(`/api/messages/${encodeURIComponent(messageId)}/reactions`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji }),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof (data as { message?: unknown })?.message === "string"
        ? (data as { message: string }).message
        : "Não foi possível reagir.",
    );
  }
  return data as { reactions?: ReactionDto[] };
}
async function postConversationAction(
  conversationId: string,
  action: "resolve" | "reopen",
  extra?: { skipAutomations?: boolean },
) {
  const res = await fetch(apiUrl(`/api/conversations/${conversationId}/actions`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      ...(action === "resolve" && extra?.skipAutomations
        ? { skipAutomations: true }
        : {}),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(
      typeof data?.message === "string"
        ? data.message
        : "Erro ao atualizar status",
    );
  // Modelo de ticket: `reopen` cria uma NOVA conversa (id diferente) e
  // devolve `previousConversationId`. Tipamos para o caller poder trocar
  // o chat ativo — sem isso o painel do pipeline ficava travado no ticket
  // antigo (RESOLVED) achando que "reabrir não funciona".
  return data as {
    conversation: { id: string; status: ConversationStatus };
    previousConversationId?: string;
  };
}

type ForwardPickRow = {
  id: string;
  channel: string;
  inboxName: string | null;
  contact: { id: string; name: string; phone: string | null };
};

async function postForward(
  targetConversationId: string,
  sourceConversationId: string,
  messageRef: string,
) {
  const res = await fetch(apiUrl(`/api/conversations/${targetConversationId}/forward`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceConversationId, messageRef }),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(
      typeof data?.message === "string" ? data.message : "Erro ao encaminhar",
    );
  return data as { metaError?: string };
}

type ActivePanel =
  | "none"
  | "emoji"
  | "templates"
  | "task"
  | "schedule";
const ACTIVITY_TYPES = [
  { value: "CALL", label: "Ligação" },
  { value: "MEETING", label: "Reunião" },
  { value: "TASK", label: "Tarefa" },
  { value: "OTHER", label: "Outro" },
];

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightedText({
  text,
  query,
  isCurrentMatch,
}: {
  text: string;
  query: string;
  isCurrentMatch: boolean;
}) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegex(q)})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark
            key={i}
            className={cn(
              "rounded-sm px-px",
              isCurrentMatch
                ? "bg-[var(--color-warning)] text-white"
                : "bg-[var(--color-warn-bg)] text-[var(--color-warning)]",
            )}
          >
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </>
  );
}

type AttachPopoverProps = {
  onFile: () => void;
  onTemplate: () => void;
  onTask: () => void;
  onSchedule: () => void;
  onNote: () => void;
  noteMode: boolean;
  isBaileysChannel: boolean;
  signatureEnabled: boolean;
  onToggleSignature: () => void;
  onEditSignature: () => void;
  isResolved: boolean;
  statusPending: boolean;
  onToggleResolve: () => void;
};

function AttachPopover({
  onFile,
  onTemplate,
  onTask,
  onSchedule,
  onNote,
  noteMode,
  isBaileysChannel,
  signatureEnabled,
  onToggleSignature,
  onEditSignature,
  isResolved,
  statusPending,
  onToggleResolve,
}: AttachPopoverProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-0 text-[var(--color-ink-soft)] shadow-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label="Anexos e mais opções"
      >
        <Plus className="size-5" strokeWidth={2} />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="z-(--z-popover) min-w-[208px] rounded-xl border border-black/5 bg-white p-1 shadow-[0_8px_32px_rgba(0,0,0,0.10)]">
        <DropdownMenuItem
          className="gap-2 px-2 py-1.5 text-[13px] hover:bg-muted focus:bg-muted"
          onClick={onFile}
        >
          <Paperclip className="size-3.5 shrink-0" />
          Anexar arquivo
        </DropdownMenuItem>
        {!isBaileysChannel ? (
          <DropdownMenuItem
            className="gap-2 px-2 py-1.5 text-[13px] hover:bg-muted focus:bg-muted"
            onClick={onTemplate}
          >
            <FileText className="size-3.5 shrink-0" />
            Templates
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 px-2 py-1.5 text-[13px] hover:bg-muted focus:bg-muted"
          onClick={onTask}
        >
          <CheckSquare className="size-3.5 shrink-0" />
          Nova tarefa
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2 px-2 py-1.5 text-[13px] hover:bg-muted focus:bg-muted"
          onClick={onSchedule}
        >
          <Clock className="size-3.5 shrink-0" />
          Agendar mensagem
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2 px-2 py-1.5 text-[13px] hover:bg-muted focus:bg-muted"
          onClick={onNote}
        >
          <Lock className="size-3.5 shrink-0" />
          {noteMode ? "Sair do modo nota" : "Nota interna"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 px-2 py-1.5 text-[13px] hover:bg-muted focus:bg-muted"
          onClick={onToggleSignature}
        >
          {signatureEnabled ? "Desligar assinatura" : "Ligar assinatura"}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2 px-2 py-1.5 text-[13px] hover:bg-muted focus:bg-muted"
          onClick={onEditSignature}
        >
          <Pencil className="size-3.5 shrink-0" />
          Editar assinatura…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 px-2 py-1.5 text-[13px] hover:bg-muted focus:bg-muted"
          disabled={statusPending}
          onClick={onToggleResolve}
        >
          {isResolved ? (
            <>
              <RotateCcw className="size-3.5 shrink-0" />
              Reabrir conversa
            </>
          ) : (
            <>
              <CheckCircle2 className="size-3.5 shrink-0" />
              Resolver conversa
            </>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ChatWindow({
  conversationId,
  conversationStatus,
  contactId,
  onResolve,
  onReopen,
  compactChrome,
  inConversationSearchRef,
}: {
  conversationId: string | null;
  conversationStatus?: ConversationStatus | string;
  contactId?: string;
  onResolve?: (s: ConversationStatus) => void;
  onReopen?: (s: ConversationStatus) => void;
  /** Layout mais denso + alertas de sistema discretos (ex.: workspace do negócio). */
  compactChrome?: boolean;
  /** Preenchido pelo pai com `{ open }` para abrir a busca na conversa (ex.: botão no header). */
  inConversationSearchRef?: React.MutableRefObject<{ open: () => void } | null>;
}) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { role, isSuperAdmin } = useUserRole();
  const canSkipAutomations = isSuperAdmin || role === "ADMIN";
  const [resolveConfirmOpen, setResolveConfirmOpen] = React.useState(false);
  const agentName = session?.user?.name ?? session?.user?.email ?? "Agente";
  // Mobile breakpoint < 768px — usado pra copy progressiva no
  // placeholder do composer ("Mensagem ou /" curto vs versao
  // completa em desktop). SSR-safe (false no server, atualiza no
  // mount sem hydration mismatch).
  const isMobile = useIsMobile();
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const messagesScrollRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  /** Handlers expostos por cada `AudioMessage` — menu ⋯ chama transcrever sem duplicar lógica. */
  const audioTranscribeRefs = React.useRef<Map<string, () => void>>(new Map());
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchMatchIndex, setSearchMatchIndex] = React.useState(0);
  const [draft, setDraft] = React.useState("");
  // Modo de envio do composer — `false` = mensagem normal pro cliente,
  // `true` = nota interna (privada, só agentes veem). Antes existia um
  // segmented picker no header da composer com 3 abas (Mensagem / Nota /
  // Timeline) que poluía o espaço; foi removido por feedback do operador
  // (otimiza espaço e confunde menos). A "Nota" virou um TOGGLE inline
  // na barra de ações da caixa de chat (junto com Paperclip/Emoji/etc),
  // mantendo a função sem ocupar uma faixa horizontal inteira. Timeline
  // saiu — continua acessível pelo painel de detalhes do deal/sidebar.
  const [noteMode, setNoteMode] = React.useState(false);
  const [activePanel, setActivePanel] = React.useState<ActivePanel>("none");
  const [pendingFile, setPendingFile] = React.useState<File | null>(null);
  const [pendingTemplateMedia, setPendingTemplateMedia] = React.useState<
    Array<{ url: string; name: string | null; messageBefore?: string | null }>
  >([]);
  const pendingTemplateMediaRef = React.useRef(pendingTemplateMedia);
  pendingTemplateMediaRef.current = pendingTemplateMedia;
  const draftRef = React.useRef(draft);
  draftRef.current = draft;
  const [sequenceSending, setSequenceSending] = React.useState(false);
  // Drag-and-drop: contador de profundidade pra lidar com dragenter/leave
  // disparando em filhos quando o cursor passa por dentro do composer/anexos
  // (sem isso, o overlay pisca enquanto se arrasta). Só consideramos
  // "arrastando" se o dataTransfer tem `Files` — texto/link não conta.
  const dragDepthRef = React.useRef(0);
  const [isDraggingFile, setIsDraggingFile] = React.useState(false);
  const [replyTo, setReplyTo] = React.useState<InboxMessageDto | null>(null);
  const [_hoveredMsgId, setHoveredMsgId] = React.useState<
    string | number | null
  >(null);
  const [reactionPickerMsgId, setReactionPickerMsgId] = React.useState<
    string | number | null
  >(null);
  const [fullEmojiPickerMsgId, setFullEmojiPickerMsgId] = React.useState<
    string | number | null
  >(null);
  const [forwardingMessage, setForwardingMessage] =
    React.useState<InboxMessageDto | null>(null);
  const [forwardSearch, setForwardSearch] = React.useState("");
  const [pendingTemplate, setPendingTemplate] = React.useState<{
    name: string;
    label?: string;
    content: string;
    language?: string;
    /** ID Graph Meta — usado para montar componente de botão FLOW no envio. */
    metaTemplateId?: string;
    /** Metadados das variáveis do corpo (Config → operator_variables). */
    operatorVariables?: OperatorVariableMeta[] | null;
  } | null>(null);
  // Valores das variaveis {{1}}, {{2}}... do template selecionado.
  // Inicializado como {} sempre que pendingTemplate muda; o preview
  // renderiza um input por placeholder e o usuario preenche antes do
  // envio. Sem isso o Meta rejeita com code=132000 ("number of
  // localizable_params (0) does not match the expected number of
  // params (N)").
  const [templateVars, setTemplateVars] = React.useState<
    Record<string, string>
  >({});
  /** Opcional: templates com botão Flow — token de correlação; vazio = o servidor gera UUID por envio. */
  const [flowTokenDraft, setFlowTokenDraft] = React.useState("");
  /** JSON opcional: `flow_action_data` inicial (telas/dados do formulário Flow). */
  const [flowActionJson, setFlowActionJson] = React.useState("");
  const [flowJsonError, setFlowJsonError] = React.useState<string | null>(null);
  const templatePlaceholders = React.useMemo(() => {
    if (!pendingTemplate?.content) return [] as string[];
    const fromMeta = pendingTemplate.operatorVariables?.map((v) => v.key).filter(Boolean);
    if (fromMeta?.length) return fromMeta;
    const set = new Set<string>();
    const re = /\{\{([^}]+)\}\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(pendingTemplate.content))) set.add(m[1].trim());
    const keys = Array.from(set);
    const numKeys = keys.filter((k) => /^\d+$/.test(k));
    if (numKeys.length === keys.length) {
      return keys.sort((a, b) => Number(a) - Number(b));
    }
    return keys;
  }, [pendingTemplate]);
  // Sempre que troca o template, reseta as vars (preserva valores ja
  // digitados pra mesma chave caso seja so um re-render).
  /* eslint-disable react-hooks/set-state-in-effect -- merge de chaves ao trocar template */
  React.useEffect(() => {
    if (!pendingTemplate) {
      setTemplateVars({});
      return;
    }
    setTemplateVars((prev) => {
      const next: Record<string, string> = {};
      for (const k of templatePlaceholders) next[k] = prev[k] ?? "";
      return next;
    });
  }, [pendingTemplate, templatePlaceholders]);
  /* eslint-enable react-hooks/set-state-in-effect */
  React.useEffect(() => {
    setFlowTokenDraft("");
    setFlowActionJson("");
    setFlowJsonError(null);
  }, [pendingTemplate?.name]);
  const renderedTemplatePreview = React.useMemo(() => {
    if (!pendingTemplate?.content) return "";
    return pendingTemplate.content.replace(/\{\{([^}]+)\}\}/g, (_, raw: string) => {
      const k = raw.trim();
      const v = templateVars[k]?.trim();
      return v ? v : `{{${k}}}`;
    });
  }, [pendingTemplate, templateVars]);
  const allTemplateVarsFilled = templatePlaceholders.every(
    (k) => templateVars[k]?.trim().length,
  );

  // Assinatura do agente (toggle + texto personalizado) — persistido em localStorage.
  const [signatureEnabled, setSignatureEnabled] = React.useState<boolean>(true);
  const [signature, setSignature] = React.useState<string>("");
  const [signatureModalOpen, setSignatureModalOpen] = React.useState(false);
  const [signatureDraft, setSignatureDraft] = React.useState("");
  /* eslint-disable react-hooks/set-state-in-effect -- hidrata assinatura do localStorage só no cliente */
  React.useEffect(() => {
    try {
      const savedEnabled = window.localStorage.getItem(
        "eduit:signature:enabled",
      );
      const savedValue = window.localStorage.getItem("eduit:signature:value");
      if (savedEnabled !== null) setSignatureEnabled(savedEnabled === "1");
      if (savedValue !== null) setSignature(savedValue);
    } catch {
      /* ignore */
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  const persistSignatureEnabled = React.useCallback((v: boolean) => {
    setSignatureEnabled(v);
    try {
      window.localStorage.setItem("eduit:signature:enabled", v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);
  const persistSignatureValue = React.useCallback((v: string) => {
    setSignature(v);
    try {
      window.localStorage.setItem("eduit:signature:value", v);
    } catch {
      /* ignore */
    }
  }, []);
  const effectiveSignature = (signature.trim() || agentName).trim();

  const typingTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  // Mesma key do inbox v2: as duas telas buscam a MESMA URL
  // (`/messages?history=1`), então compartilhar a entrada de cache evita
  // refetch ao alternar entre inbox e painel do negócio, e faz as
  // invalidações de um lado valerem no outro.
  const messagesKey = inboxMessagesKey(conversationId);

  const rowMax = compactChrome
    ? "mx-auto w-full max-w-full"
    : "mx-auto max-w-[1100px]";

  const {
    data: messagesData,
    isLoading,
    isFetching,
    isError,
    error,
  } = useQuery({
    queryKey: messagesKey,
    queryFn: () => fetchMessages(conversationId!),
    enabled: !!conversationId,
    staleTime: 20_000,
    gcTime: 5 * 60_000,
    refetchInterval: conversationId ? 45_000 : false,
  });
  const messages = messagesData?.messages ?? [];
  const stickyDayLabel = useStickyDayLabel(
    messagesScrollRef,
    `${conversationId ?? ""}:${messages.length}:${messages[0]?.id ?? ""}`,
  );
  const pinnedNoteId = messagesData?.pinnedNoteId ?? null;
  const pinnedCacheRef = React.useRef<InboxMessageDto | null>(null);
  React.useEffect(() => {
    if (!pinnedNoteId) {
      pinnedCacheRef.current = null;
      return;
    }
    const hit = messages.find(
      (m) => String(m.id) === pinnedNoteId && m.isPrivate,
    );
    if (hit) pinnedCacheRef.current = hit;
  }, [pinnedNoteId, messages]);

  // (Antes existia uma query `contact-primary-deal` aqui que servia
  // exclusivamente pra renderizar a aba "Timeline" no composer. A aba
  // foi removida — a timeline do deal continua acessível via
  // `/pipeline/[id]` e na sidebar de detalhes — então a query saiu
  // junto pra evitar requests órfãos por conversa aberta.)
  const pinnedNote = pinnedNoteId
    ? (messages.find((m) => String(m.id) === pinnedNoteId && m.isPrivate) ??
      pinnedCacheRef.current)
    : null;
  const sessionInfo = messagesData?.session;
  const sessionActive = sessionInfo?.active ?? true;
  const isBaileysChannel = messagesData?.channelProvider === "BAILEYS_MD";

  const [taskTitle, setTaskTitle] = React.useState("");
  const [taskType, setTaskType] = React.useState("TASK");
  const [taskScheduled, setTaskScheduled] = React.useState("");
  const taskMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        type: taskType,
        title: taskTitle.trim(),
      };
      if (contactId) body.contactId = contactId;
      if (taskScheduled.trim())
        body.scheduledAt = new Date(taskScheduled).toISOString();
      const res = await fetch(apiUrl("/api/activities"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Erro ao criar tarefa");
    },
    onSuccess: () => {
      setTaskTitle("");
      setTaskScheduled("");
      setActivePanel("none");
      queryClient.invalidateQueries({ queryKey: ["contact"] });
    },
  });
  const templateSendMutation = useMutation({
    mutationFn: async (vars: {
      templateName: string;
      bodyPreview?: string;
      languageCode?: string | null;
      components?: unknown[];
      flowToken?: string | null;
      flowActionData?: Record<string, unknown> | null;
      templateGraphId?: string | null;
    }) => {
      const payload = JSON.stringify({
        templateName: vars.templateName,
        bodyPreview: vars.bodyPreview,
        ...(vars.languageCode?.trim()
          ? { languageCode: vars.languageCode.trim() }
          : {}),
        ...(vars.components ? { components: vars.components } : {}),
        ...(vars.flowToken ? { flowToken: vars.flowToken } : {}),
        ...(vars.flowActionData && Object.keys(vars.flowActionData).length > 0
          ? { flowActionData: vars.flowActionData }
          : {}),
        ...(vars.templateGraphId
          ? { templateGraphId: vars.templateGraphId }
          : {}),
      });
      const postOnce = () =>
        fetch(apiUrl(`/api/conversations/${conversationId}/template`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
        });
      let res = await postOnce();
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        await new Promise((r) => setTimeout(r, 800));
        res = await postOnce();
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(
          typeof data?.message === "string"
            ? data.message
            : "Erro ao enviar template",
        );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagesKey });
    },
  });

  // ── Agendar mensagem ───────────────────────────────
  // Estados locais do painel. Template fallback é OPCIONAL em todos os
  // canais (inclusive Meta): o operador decide conscientemente se quer
  // se proteger contra a expiração da sessão de 24h. Se desligar o
  // toggle e a sessão expirar no horário do envio, o worker marca o
  // agendamento como FAILED com mensagem clara.
  const [scheduleContent, setScheduleContent] = React.useState("");
  const [scheduleAt, setScheduleAt] = React.useState("");
  const [scheduleFile, setScheduleFile] = React.useState<File | null>(null);
  const [scheduleUseFallback, setScheduleUseFallback] = React.useState(false);
  const [scheduleTemplate, setScheduleTemplate] = React.useState<{
    name: string;
    label?: string;
    content?: string;
  } | null>(null);
  const [showScheduleTemplatePicker, setShowScheduleTemplatePicker] =
    React.useState(false);
  const scheduleFileInputRef = React.useRef<HTMLInputElement>(null);

  const scheduledMessagesKey = ["scheduled-messages", conversationId] as const;
  const { data: pendingScheduledData } = useQuery({
    queryKey: scheduledMessagesKey,
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/scheduled-messages?conversationId=${conversationId}`),
      );
      if (!res.ok)
        return {
          items: [] as Array<{
            id: string;
            content: string;
            scheduledAt: string;
            createdBy?: { name?: string | null } | null;
            fallbackTemplateName?: string | null;
          }>,
        };
      return res.json() as Promise<{
        items: Array<{
          id: string;
          content: string;
          scheduledAt: string;
          createdBy?: { name?: string | null } | null;
          fallbackTemplateName?: string | null;
        }>;
      }>;
    },
    enabled: !!conversationId,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
  const pendingScheduled = pendingScheduledData?.items ?? [];

  const scheduleMutation = useMutation({
    mutationFn: async () => {
      if (!conversationId) throw new Error("Conversa inválida");
      const content = scheduleContent.trim();
      if (!content && !scheduleFile) {
        throw new Error("Informe um conteúdo ou anexo");
      }
      const when = scheduleAt.trim() ? new Date(scheduleAt) : null;
      if (!when || Number.isNaN(when.getTime())) {
        throw new Error("Data/hora de envio inválida");
      }

      let media: { url: string; type?: string; name?: string } | null = null;
      if (scheduleFile) {
        const form = new FormData();
        form.append("file", scheduleFile);
        const up = await fetch(apiUrl("/api/uploads/automation-media"), {
          method: "POST",
          body: form,
        });
        const upData = (await up.json().catch(() => ({}))) as {
          url?: string;
          fileName?: string;
          mimeType?: string;
          message?: string;
        };
        if (!up.ok || !upData.url) {
          throw new Error(upData.message || "Falha ao enviar anexo");
        }
        media = {
          url: upData.url,
          type: upData.mimeType,
          name: upData.fileName,
        };
      }

      const body: Record<string, unknown> = {
        conversationId,
        content,
        scheduledAt: when.toISOString(),
      };
      if (media) body.media = media;
      // Só anexa o template se o operador optou por usar fallback E
      // escolheu um template. Caso contrário o backend cria o agendamento
      // sem fallback — worker marcará FAILED se sessão 24h expirar.
      if (scheduleUseFallback && scheduleTemplate) {
        body.fallbackTemplate = {
          name: scheduleTemplate.name,
          language: "pt_BR",
        };
      }

      const res = await fetch(apiUrl("/api/scheduled-messages"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data?.message === "string" ? data.message : "Erro ao agendar",
        );
      }
      return data;
    },
    onSuccess: () => {
      toast.success("Mensagem agendada");
      setScheduleContent("");
      setScheduleAt("");
      setScheduleFile(null);
      setScheduleTemplate(null);
      setScheduleUseFallback(false);
      setActivePanel("none");
      queryClient.invalidateQueries({ queryKey: scheduledMessagesKey });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Erro ao agendar");
    },
  });

  const cancelScheduledMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(apiUrl(`/api/scheduled-messages/${id}`), {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Erro ao cancelar");
    },
    onSuccess: () => {
      toast.success("Agendamento cancelado");
      queryClient.invalidateQueries({ queryKey: scheduledMessagesKey });
    },
    onError: () => toast.error("Falha ao cancelar agendamento"),
  });

  useSSE(
    "/api/sse/messages",
    React.useCallback(
      (event: string, data: unknown) => {
        // contact_updated tem semantica diferente: nao mexe em mensagens,
        // so refresha a lista pra pegar avatar/nome novos.
        if (event === "contact_updated") {
          queryClient.invalidateQueries({ queryKey: ["inbox-conversations"] });
          return;
        }
        if (
          event !== "new_message" &&
          event !== "whatsapp_call" &&
          event !== "message_status"
        )
          return;
        const p = data as { conversationId?: string };
        if (p.conversationId === conversationId)
          queryClient.invalidateQueries({ queryKey: messagesKey });
        if (event !== "message_status")
          queryClient.invalidateQueries({ queryKey: ["inbox-conversations"] });
      },
      [conversationId, messagesKey, queryClient],
    ),
    !!conversationId,
  );

  React.useEffect(() => {
    if (conversationId)
      fetch(apiUrl(`/api/conversations/${conversationId}/read`), { method: "POST" })
        .then(() =>
          queryClient.invalidateQueries({ queryKey: ["inbox-conversations"] }),
        )
        .catch(() => {});
  }, [conversationId, queryClient]);

  // Ao trocar de conversa: pular instantaneamente para a última mensagem (sem
  // animação e sem "rolagem visível pelo topo"). Enquanto as mensagens ainda
  // não chegaram, continuamos forçando o scroll final até elas aparecerem.
  const lastConvRef = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    if (!conversationId) return;
    const changed = lastConvRef.current !== conversationId;
    lastConvRef.current = conversationId;
    const behavior: ScrollBehavior = changed ? "auto" : "smooth";
    // rAF garante que o DOM já refletiu as novas mensagens.
    const raf = requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior, block: "end" });
    });
    return () => cancelAnimationFrame(raf);
  }, [messages, conversationId]);
  React.useEffect(() => {
    setNoteMode(false);
    setActivePanel("none");
    setPendingFile(null);
    setReplyTo(null);
    setReactionPickerMsgId(null);
    setForwardingMessage(null);
    setForwardSearch("");
    setPendingTemplate(null);
    setScheduleContent("");
    setScheduleAt("");
    setScheduleFile(null);
    setScheduleTemplate(null);
    setShowScheduleTemplatePicker(false);
    setSearchOpen(false);
    setSearchQuery("");
    setSearchMatchIndex(0);
  }, [conversationId]);

  const searchMatches = React.useMemo(() => {
    if (!searchQuery.trim() || !searchOpen) return [];
    const q = searchQuery.trim().toLowerCase();
    return messages
      .map((m, i) => ({
        i,
        c: typeof m.content === "string" ? m.content : String(m.content ?? ""),
      }))
      .filter(({ c }) => c.toLowerCase().includes(q))
      .map(({ i }) => i)
      .reverse();
  }, [messages, searchQuery, searchOpen]);

  const currentMatchMessageIndex = searchMatches[searchMatchIndex] ?? null;

  const openInConversationSearch = React.useCallback(() => {
    setSearchOpen(true);
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }, []);

  React.useEffect(() => {
    if (!inConversationSearchRef) return;
    inConversationSearchRef.current = { open: openInConversationSearch };
    return () => {
      inConversationSearchRef.current = null;
    };
  }, [inConversationSearchRef, openInConversationSearch]);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        openInConversationSearch();
      }
      if (e.key === "Escape" && searchOpen) {
        setSearchOpen(false);
        setSearchQuery("");
        setSearchMatchIndex(0);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [searchOpen, openInConversationSearch]);

  React.useEffect(() => {
    if (currentMatchMessageIndex === null) return;
    const el = document.querySelector(
      `[data-msg-idx="${currentMatchMessageIndex}"]`,
    );
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [currentMatchMessageIndex]);

  React.useEffect(() => {
    if (reactionPickerMsgId == null) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-reaction-picker]")) {
        setReactionPickerMsgId(null);
        setHoveredMsgId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [reactionPickerMsgId]);

  React.useEffect(() => {
    if (fullEmojiPickerMsgId == null) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-full-emoji-picker]")) {
        setFullEmojiPickerMsgId(null);
        setHoveredMsgId(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setFullEmojiPickerMsgId(null);
        setHoveredMsgId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKey);
    };
  }, [fullEmojiPickerMsgId]);

  const sendMutation = useMutation({
    mutationFn: ({
      content,
      asNote,
      replyId,
    }: {
      content: string;
      asNote: boolean;
      replyId?: string | null;
    }) => postMessage(conversationId!, content, asNote, replyId),
    onMutate: async ({ content, asNote, replyId }) => {
      await queryClient.cancelQueries({ queryKey: messagesKey });
      const previous = queryClient.getQueryData<MessagesResponse>(messagesKey);
      const replyPreview = replyId
        ? messages.find((m) => String(m.id) === replyId)?.content?.slice(0, 80)
        : null;
      const optimistic: InboxMessageDto = {
        id: `temp-${Date.now()}`,
        content,
        createdAt: new Date().toISOString(),
        direction: "out",
        messageType: asNote ? "note" : "text",
        isPrivate: asNote || undefined,
        senderName: agentName,
        replyToId: replyId,
        replyToPreview: replyPreview,
      };
      queryClient.setQueryData<MessagesResponse>(messagesKey, (old) => ({
        messages: [...(old?.messages ?? []), optimistic],
        session: old?.session,
      }));
      return { previous };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(messagesKey, ctx.previous);
      toast.error(
        e instanceof Error ? e.message : "Não foi possível enviar a mensagem",
      );
    },
    onSuccess: (data) => {
      if (data?.metaError) {
        toast.warning(
          `Salvo localmente, mas não enviado via WhatsApp: ${data.metaError}`,
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: messagesKey });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
  const attachMutation = useMutation({
    mutationFn: ({
      file,
      caption,
      fileName,
    }: {
      file: File | Blob;
      caption: string;
      fileName?: string;
    }) => postAttachment(conversationId!, file, caption, fileName),
    onMutate: async ({ file, fileName }) => {
      await queryClient.cancelQueries({ queryKey: messagesKey });
      const previous = queryClient.getQueryData<MessagesResponse>(messagesKey);
      const name = fileName ?? (file instanceof File ? file.name : "audio.ogg");
      const mime = (file as File).type ?? "";
      const isAudio =
        mime.startsWith("audio/") ||
        /\.(webm|ogg|mp3|wav|m4a|opus|aac|amr)$/i.test(name);
      const isImage =
        !isAudio &&
        (mime.startsWith("image/") ||
          /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name));
      const isVideo =
        !isAudio &&
        !isImage &&
        (mime.startsWith("video/") || /\.(mp4|mov|avi|3gp|mkv)$/i.test(name));
      const optimisticType = isAudio
        ? "audio"
        : isImage
          ? "image"
          : isVideo
            ? "video"
            : "document";
      const previewUrl =
        isAudio || isImage || isVideo ? URL.createObjectURL(file) : undefined;
      const optimistic: InboxMessageDto = {
        id: `temp-att-${Date.now()}`,
        content: isAudio ? "" : `📎 ${name}`,
        createdAt: new Date().toISOString(),
        direction: "out",
        messageType: optimisticType,
        senderName: agentName,
        mediaUrl: previewUrl,
      };
      queryClient.setQueryData<MessagesResponse>(messagesKey, (old) => ({
        messages: [...(old?.messages ?? []), optimistic],
        session: old?.session,
      }));
      return { previous };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(messagesKey, ctx.previous);
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar o anexo");
    },
    onSuccess: (data) => {
      if (data?.audioDelivery && data.audioDelivery !== "voice") {
        toast("Enviado como áudio (não como nota de voz)");
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: messagesKey });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setPendingFile(null);
    },
  });
  const reactionMutation = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      postReaction(messageId, emoji),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagesKey });
      setReactionPickerMsgId(null);
      setFullEmojiPickerMsgId(null);
      setHoveredMsgId(null);
    },
    onError: (e: Error) => {
      toast.error(e.message);
    },
  });
  const forwardMutation = useMutation({
    mutationFn: async ({
      targetId,
      messageRef,
    }: {
      targetId: string;
      messageRef: string;
    }) => {
      if (!conversationId) throw new Error("Sem conversa");
      return postForward(targetId, conversationId, messageRef);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["messages"] });
      queryClient.invalidateQueries({ queryKey: ["inbox-conversations"] });
      setForwardingMessage(null);
      setForwardSearch("");
      if (data.metaError)
        toast.warning(`Encaminhado salvo; WhatsApp: ${data.metaError}`);
      else toast.success("Mensagem encaminhada.");
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Erro ao encaminhar");
    },
  });

  const { data: forwardPickData, isLoading: forwardPickLoading } = useQuery({
    queryKey: ["forward-conversation-pick"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/conversations?perPage=80&sortBy=updatedAt&sortOrder=desc"),
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(
          typeof data?.message === "string"
            ? data.message
            : "Erro ao listar conversas",
        );
      return (data.items ?? []) as ForwardPickRow[];
    },
    enabled: !!forwardingMessage && !!conversationId,
    staleTime: 30_000,
  });

  const forwardPickFiltered = React.useMemo(() => {
    const items = forwardPickData ?? [];
    const q = forwardSearch.trim().toLowerCase();
    return items.filter((row) => {
      if (row.id === conversationId) return false;
      if (!q) return true;
      const name = row.contact?.name?.toLowerCase() ?? "";
      const phone = row.contact?.phone?.replace(/\D/g, "") ?? "";
      return name.includes(q) || phone.includes(q.replace(/\D/g, ""));
    });
  }, [forwardPickData, forwardSearch, conversationId]);
  const statusMutation = useMutation({
    mutationFn: (vars: {
      action: "resolve" | "reopen";
      skipAutomations?: boolean;
    }) =>
      postConversationAction(conversationId!, vars.action, {
        skipAutomations: vars.skipAutomations,
      }),
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["inbox-conversations"] });
      // Pipeline v2 (`_v2-client.tsx`) lê `contact.conversations[0]` do
      // cache `["deal-detail-v2", dealId]`. Sem invalidar aqui, o painel
      // do deal continua exibindo a conversa antiga (RESOLVED) mesmo após
      // reabrir — o backend criou o novo ticket, mas o frontend não
      // atualizou porque o botão "Reabrir" do ChatWindow tem sua própria
      // mutation local (não passa pelo useToggleConversationResolve que
      // já cuida disso). Também invalida chaves usadas pelo deal-workspace
      // antigo (`["deal", id]` / `["contact", id]`).
      queryClient.invalidateQueries({ queryKey: ["deal-detail-v2"] });
      queryClient.invalidateQueries({ queryKey: ["deal-timeline-v2"] });
      queryClient.invalidateQueries({ queryKey: ["deal"] });
      queryClient.invalidateQueries({ queryKey: ["contact"] });
      if (vars.action === "resolve") {
        setResolveConfirmOpen(false);
        onResolve?.(data.conversation.status);
      } else {
        // Reopen no modelo de ticket: backend cria NOVA conversa e devolve
        // o novo id. Emitimos o evento global — inbox e deal-workspace do
        // pipeline escutam e trocam a conversa ativa/seleção para o id
        // novo. Sem isso o botão "Reabrir" parecia não funcionar no
        // pipeline (a UI ficava travada na conversa antiga RESOLVED).
        onReopen?.(data.conversation.status);
        if (data.conversation?.id && data.previousConversationId) {
          emitConversationReopened(data.conversation.id);
        }
      }
    },
  });

  function handleToggleResolve() {
    if (!conversationId) return;
    if (conversationStatus === "RESOLVED") {
      statusMutation.mutate({ action: "reopen" });
      return;
    }
    if (canSkipAutomations) {
      setResolveConfirmOpen(true);
      return;
    }
    statusMutation.mutate({ action: "resolve" });
  }

  const pinNoteMutation = useMutation({
    mutationFn: async (noteId: string | null) => {
      const res = await fetch(apiUrl(`/api/conversations/${conversationId}/pin-note`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId }),
      });
      if (!res.ok) throw new Error("Erro ao fixar nota");
      return res.json();
    },
    onMutate: async (noteId) => {
      await queryClient.cancelQueries({ queryKey: messagesKey });
      const prev = queryClient.getQueryData<MessagesResponse>(messagesKey);
      queryClient.setQueryData<MessagesResponse>(messagesKey, (old) =>
        old ? { ...old, pinnedNoteId: noteId } : old,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(messagesKey, ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: messagesKey });
    },
  });

  const togglePanel = (panel: ActivePanel) =>
    setActivePanel((p) => (p === panel ? "none" : panel));
  const sendTypingIndicator = React.useCallback(() => {
    if (!conversationId || typingTimerRef.current) return;
    fetch(apiUrl(`/api/conversations/${conversationId}/typing`), {
      method: "POST",
    }).catch(() => {});
    typingTimerRef.current = setTimeout(() => {
      typingTimerRef.current = null;
    }, 20_000);
  }, [conversationId]);
  const insertEmoji = React.useCallback((emoji: string) => {
    setDraft((d) => d + emoji);
    textareaRef.current?.focus();
  }, []);
  const flushPendingTemplateMedia = React.useCallback(async () => {
    const list = pendingTemplateMediaRef.current;
    if (list.length === 0 || !conversationId) return;
    setPendingTemplateMedia([]);
    pendingTemplateMediaRef.current = [];
    setSequenceSending(true);
    try {
      await sendInternalTemplateSequence({
        conversationId,
        content: "",
        attachments: list,
      });
      queryClient.invalidateQueries({ queryKey: messagesKey });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    } finally {
      setSequenceSending(false);
    }
  }, [conversationId, queryClient, messagesKey]);

  const onSend = React.useCallback(() => {
    const text = draft.trim();
    const hasParkedMedia = pendingTemplateMediaRef.current.length > 0;
    // NÃO bloqueamos por `sendMutation.isPending` — o agente precisa
    // poder disparar várias mensagens em sequência sem esperar cada
    // request terminar. Cada `mutate()` cria sua própria execução
    // otimista (nova bolha aparece na hora) e o servidor processa em
    // paralelo. O `setDraft("")` síncrono garante que Enters duplos
    // acidentais caiam no `if (!text)` e não duplicam mensagens.
    if ((!text && !hasParkedMedia) || !conversationId) return;
    // Assinatura do agente: quando o toggle está ligado e NÃO é nota interna,
    // prefixamos a assinatura em negrito (sintaxe WhatsApp `*nome*`) seguida
    // de dois pontos e UM espaço antes da mensagem. Formato INLINE — padrão
    // de CRMs WhatsApp BR (Octadesk/RD/Take Blip): compacto, natural pra
    // mensagens curtas (a assinatura "vira parte da fala") e ainda funciona
    // pra longas (o cliente vê o nome em bold no início e o resto fluído).
    //
    // Idempotente — detecta e respeita os 4 formatos já usados em threads
    // anteriores (não duplica a assinatura quando o agente cola texto que
    // já vem assinado, ou quando edita uma mensagem):
    //
    //   1. `*Nome:* Mensagem`    (NOVO PADRÃO — inline com dois pontos)
    //   2. `*Nome*\n\nMensagem`  (legado, formato email — duas quebras)
    //   3. `*Nome*: Mensagem`    (variante compacta em negrito sem espaço)
    //   4. `Nome: Mensagem`      (legado plain, ainda gravado em threads antigas)
    const shouldSign = signatureEnabled && !noteMode && !!effectiveSignature;
    const sigLower = effectiveSignature.toLowerCase();
    const lower = text.toLowerCase();
    const alreadyPrefixed =
      shouldSign &&
      (lower.startsWith(`*${sigLower}:*`) ||
        lower.startsWith(`*${sigLower}*`) ||
        lower.startsWith(`${sigLower}:`));
    const payloadText =
      shouldSign && !alreadyPrefixed
        ? `*${effectiveSignature}:* ${text}`
        : text;
    if (text) {
      sendMutation.mutate({
        content: payloadText,
        asNote: noteMode,
        replyId: replyTo ? String(replyTo.id) : null,
      });
    }
    if (hasParkedMedia) {
      void flushPendingTemplateMedia();
    }
    setDraft("");
    draftRef.current = "";
    setActivePanel("none");
    setReplyTo(null);
    // Após enviar, o botão "Enviar" desaparece do DOM (condicional ao
    // draft não vazio) — o React remove o nó e o browser realoca o
    // foco no body. Devolvemos o foco ao textarea para que o agente
    // possa digitar e disparar Enter de novo IMEDIATAMENTE, sem
    // precisar clicar. Usamos dois `requestAnimationFrame` aninhados
    // pra garantir que o foco aconteça DEPOIS do React commit + paint,
    // sobrevivendo a outras re-renderizações que podem rolar no mesmo
    // tick (ex.: `cancelQueries` da mutation otimista).
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (ta && document.activeElement !== ta) ta.focus();
      });
    });
  }, [
    conversationId,
    draft,
    noteMode,
    sendMutation,
    replyTo,
    signatureEnabled,
    effectiveSignature,
    flushPendingTemplateMedia,
  ]);
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // CRÍTICO: dar prioridade ao slash menu — quando ele está aberto,
    // Up/Down/Enter/Esc/Tab DEVEM controlá-lo, e não disparar envio.
    // O hook retorna `true` quando consumiu o evento.
    if (slash.onKeyDown(e)) {
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (pendingFile) sendFile();
      else onSend();
    }
    if (e.key === "Escape" && searchOpen) {
      e.preventDefault();
      setSearchOpen(false);
      setSearchQuery("");
      setSearchMatchIndex(0);
      return;
    }
    if (e.key === "Escape") {
      setReplyTo(null);
      setActivePanel("none");
    }
  };
  /**
   * Aceita um arquivo vindo de QUALQUER origem (botão de anexo, paste,
   * drag-and-drop) e prepara como anexo pendente. Centraliza a validação
   * de tamanho (16 MB, limite do attachments endpoint) e o toast de erro
   * pra evitar três cópias da mesma lógica espalhadas.
   *
   * Retorna `true` quando o arquivo foi aceito — chamadores que queiram
   * dar feedback adicional (toast de "imagem colada", por ex.) podem
   * encadear a partir disso.
   */
  const acceptIncomingFile = React.useCallback(
    (file: File | null | undefined): boolean => {
      if (!file) return false;
      if (file.size > 16 * 1024 * 1024) {
        toast.warning("O arquivo excede o limite de 16 MB.");
        return false;
      }
      setPendingFile(file);
      setActivePanel("none");
      return true;
    },
    [],
  );
  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    acceptIncomingFile(f);
  };
  /**
   * Handler de Ctrl+V / Cmd+V no composer.
   *
   * Screenshots e imagens copiadas (Print Screen → Ctrl+V, ou "copiar imagem"
   * do navegador) chegam em `clipboardData.items` como blobs `image/*`. Sem
   * este handler, o navegador insere apenas o data-URL como texto (ou nada,
   * se a imagem não tiver representação textual).
   *
   * Aqui convertemos o primeiro item image/* em `File` (gerando nome baseado
   * em timestamp + extensão derivada do MIME), respeitando o mesmo limite de
   * 16 MB do `onFileSelected`. O arquivo é anexado em `pendingFile`, trocando
   * o placeholder do textarea para "Legenda (opcional)…" — o agente pode
   * digitar uma legenda e enviar com Enter (mesmo fluxo do botão clipe).
   *
   * `preventDefault` só é chamado quando encontramos imagem, para não
   * quebrar o paste de texto em cenários normais.
   */
  /**
   * Converte um Blob de imagem em File e anexa via acceptIncomingFile.
   * Retorna true se anexou com sucesso.
   */
  const attachImageBlob = React.useCallback(
    (blob: Blob): boolean => {
      if (blob.size > 16 * 1024 * 1024) {
        toast.warning("A imagem colada excede o limite de 16 MB.");
        return false;
      }
      const type = blob.type || "image/png";
      const ext = (type.split("/")[1] || "png").split("+")[0].toLowerCase();
      const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
      const originalName = (blob as File).name;
      const fileName =
        originalName && originalName !== "image.png"
          ? originalName
          : `screenshot-${stamp}.${ext}`;
      const file = new File([blob], fileName, { type });
      if (acceptIncomingFile(file)) {
        toast.success("Imagem colada — digite a legenda e envie");
        return true;
      }
      return false;
    },
    [acceptIncomingFile],
  );

  /**
   * Tenta ler imagem da Clipboard API moderna (navigator.clipboard.read).
   * Mais confiável que clipboardData para imagens colocadas por apps nativos
   * do Windows (Snipping Tool, Print Screen) que usam formatos como CF_BITMAP
   * que nem sempre chegam ao clipboardData do evento paste.
   *
   * Requer permissão de clipboard-read (concedida por padrão em Chromium
   * quando o usuário inicia a ação — Ctrl+V ou clique).
   */
  const tryModernClipboardRead = React.useCallback(async (): Promise<boolean> => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.read) {
      return false;
    }
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (!imageType) continue;
        const blob = await item.getType(imageType);
        return attachImageBlob(blob);
      }
    } catch (err) {
      // Permissão negada ou clipboard vazio — silencioso; o handler síncrono
      // já rodou antes e mostrou toast se tivesse encontrado algo.
      console.debug("[chat-paste] navigator.clipboard.read falhou:", err);
    }
    return false;
  }, [attachImageBlob]);

  const onPaste = React.useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const cd = e.clipboardData;
      if (!cd) {
        void tryModernClipboardRead();
        return;
      }

      // Debug: expõe o que veio no clipboard pra F12 diagnosticar
      // quando o paste não pega imagem.
      if (typeof window !== "undefined") {
        const typesList = cd.types ? Array.from(cd.types) : [];
        const itemsInfo = cd.items
          ? Array.from(cd.items).map((it) => ({ kind: it.kind, type: it.type }))
          : [];
        const filesInfo = cd.files
          ? Array.from(cd.files).map((f) => ({ name: f.name, type: f.type, size: f.size }))
          : [];
        console.debug("[chat-paste] onPaste", { types: typesList, items: itemsInfo, files: filesInfo });
      }

      // 1) clipboardData.files — Chromium/Edge para Print Screen, "copiar imagem".
      const filesList: File[] = [];
      if (cd.files && cd.files.length > 0) {
        for (let i = 0; i < cd.files.length; i += 1) {
          const f = cd.files.item(i);
          if (f && f.type.startsWith("image/")) filesList.push(f);
        }
      }

      // 2) clipboardData.items — Firefox + fallback Chromium.
      if (filesList.length === 0 && cd.items && cd.items.length > 0) {
        for (let i = 0; i < cd.items.length; i += 1) {
          const it = cd.items[i];
          if (!it) continue;
          if (!it.type.startsWith("image/")) continue;
          const f = it.getAsFile();
          if (f) filesList.push(f);
        }
      }

      // 3) Se nada foi encontrado nos dados síncronos, tenta a Clipboard API
      //    moderna (assíncrona). Não faz preventDefault aqui porque o texto
      //    (se houver) já foi tratado pelo browser; queremos APENAS pegar a
      //    imagem que não veio no clipboardData.
      if (filesList.length === 0) {
        void tryModernClipboardRead();
        return;
      }

      const blob = filesList[0];
      if (!blob) return;
      e.preventDefault();
      attachImageBlob(blob);
    },
    [attachImageBlob, tryModernClipboardRead],
  );

  /**
   * Safety net: escuta paste no nível de `document` enquanto a janela de
   * conversa está montada. Cobre casos em que o operador dá Ctrl+V sem
   * o textarea estar focado (ex.: clicou numa bolha, ficou na sidebar
   * de detalhes, ou o navegador desfocou o input após uma ação).
   *
   * Só age quando há imagem no clipboard e nenhum input editável está
   * focado (input, textarea ou contenteditable), pra não conflitar com
   * pastes de texto em outros campos da tela.
   */
  React.useEffect(() => {
    if (!conversationId) return;
    const handler = (e: ClipboardEvent) => {
      const cd = e.clipboardData;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isEditable =
        tag === "input" ||
        tag === "textarea" ||
        target?.getAttribute("contenteditable") === "true";
      // Se um input editável está focado, deixa o handler local do textarea agir
      // (React tratou via onPaste do JSX). Só ajuda quando NADA editável focado.
      if (isEditable) return;

      if (!cd) {
        void tryModernClipboardRead();
        return;
      }

      const files: File[] = [];
      if (cd.files && cd.files.length > 0) {
        for (let i = 0; i < cd.files.length; i += 1) {
          const f = cd.files.item(i);
          if (f && f.type.startsWith("image/")) files.push(f);
        }
      }
      if (files.length === 0 && cd.items && cd.items.length > 0) {
        for (let i = 0; i < cd.items.length; i += 1) {
          const it = cd.items[i];
          if (!it || !it.type.startsWith("image/")) continue;
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length === 0) {
        void tryModernClipboardRead();
        return;
      }
      e.preventDefault();
      attachImageBlob(files[0]!);
    };
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [conversationId, attachImageBlob, tryModernClipboardRead]);

  /**
   * Drag-and-drop de arquivos diretamente sobre a janela de conversa.
   *
   * Por que counter ao invés de boolean simples? `dragenter`/`dragleave`
   * disparam ao atravessar QUALQUER elemento filho (composer, bolha,
   * sidebar interna). Sem contador, o overlay fica piscando ON/OFF
   * conforme o cursor entra em sub-componentes.
   *
   * Por que checar `dataTransfer.types` por "Files"? Sem esse filtro,
   * selecionar texto na própria página e arrastar acionaria o overlay
   * sem motivo. Só queremos saber de drops vindos do SO/explorer.
   */
  const hasFiles = (e: React.DragEvent): boolean => {
    const types = e.dataTransfer?.types;
    if (!types) return false;
    for (let i = 0; i < types.length; i += 1) {
      if (types[i] === "Files") return true;
    }
    return false;
  };
  const onDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    if (dragDepthRef.current === 1) setIsDraggingFile(true);
  };
  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  };
  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDraggingFile(false);
  };
  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingFile(false);
    if (composeDisabled) {
      toast.warning("Não é possível anexar arquivos neste momento.");
      return;
    }
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    if (files.length > 1) {
      toast.message("Vários arquivos arrastados — usando o primeiro.");
    }
    acceptIncomingFile(files[0]);
  };
  const sendFile = () => {
    if (!pendingFile || !conversationId) return;
    attachMutation.mutate({ file: pendingFile, caption: draft.trim() });
    setDraft("");
    requestAnimationFrame(() => textareaRef.current?.focus());
  };
  const sendAudio = React.useCallback(
    (blob: Blob) => {
      if (!conversationId) return;
      const ext = blob.type.includes("ogg")
        ? "ogg"
        : blob.type.includes("mp4")
          ? "m4a"
          : "webm";
      attachMutation.mutate({
        file: blob,
        caption: "",
        fileName: `audio.${ext}`,
      });
    },
    [conversationId, attachMutation],
  );
  const isBusy = sendMutation.isPending || attachMutation.isPending || sequenceSending;
  const isResolved = conversationStatus === "RESOLVED";

  /** Composer Meta sem sessão ativa (textarea desabilitado) — mesmo critério do `disabled` do textarea. */
  const composeDisabled =
    !isBaileysChannel && !sessionActive && sessionInfo != null && !noteMode;

  // ─── Slash command (mensagens prontas via "/") ───────────────────
  // CRÍTICO: estes hooks PRECISAM ficar antes do `if (!conversationId)
  // return null` abaixo. Caso contrário, ao alternar entre "nenhuma
  // conversa selecionada" e "conversa aberta", a quantidade de hooks
  // muda entre renders → React quebra com "Rendered more hooks than
  // during the previous render".
  const contactDetailQuery = useQuery({
    queryKey: ["chat-contact-detail", contactId],
    queryFn: () => getContact(contactId!),
    enabled: !!contactId,
    staleTime: 5 * 60_000,
  });
  const slashTemplateContext = React.useMemo<InternalTemplateContext>(() => {
    const c = contactDetailQuery.data;
    const firstDeal = c?.deals?.[0];
    return {
      contact: c
        ? {
            name: c.name,
            phone: c.phone ?? null,
            email: c.email ?? null,
            cpf: c.cpf ?? null,
            tags: c.tags ?? null,
          }
        : null,
      deal: firstDeal
        ? {
            id: firstDeal.id,
            title: firstDeal.title,
            value: firstDeal.value,
            stageName: firstDeal.stageName ?? null,
            productName: firstDeal.productName ?? null,
          }
        : null,
      agent: {
        name: session?.user?.name ?? null,
        email: session?.user?.email ?? null,
      },
    };
  }, [contactDetailQuery.data, session]);

  const handlePickMetaTemplate = React.useCallback(
    (item: Extract<SlashItem, { kind: "meta-template" }>) => {
      // Reusa o pendingTemplate flow já existente — abre o painel de
      // preview/variáveis e o operador confirma o envio.
      if (!conversationId) return;
      setPendingTemplate({
        name: item.name,
        label: item.label || undefined,
        content: item.bodyPreview,
        metaTemplateId: item.id,
        operatorVariables: item.operatorVariables ?? null,
      });
    },
    [conversationId],
  );

  const slash = useSlashMenu({
    draft,
    setDraft: (next) => {
      draftRef.current = next;
      setDraft(next);
    },
    textareaRef,
    templateContext: slashTemplateContext,
    onPickMetaTemplate: handlePickMetaTemplate,
    conversationId,
    contactId,
    // Em modo nota ou com anexo pendente, atalho fica "à toa" — usuário
    // raramente quer template numa nota interna ou junto com mídia.
    disabled: noteMode || !!pendingFile || composeDisabled,
    onInsertMedia: (media) => {
      const list = Array.isArray(media) ? media : [media];
      if (mediaNeedsSequence(list) && conversationId) {
        const targetConversationId = conversationId;
        queueMicrotask(() => {
          const text = draftRef.current;
          setDraft("");
          draftRef.current = "";
          setSequenceSending(true);
          void (async () => {
            try {
              await sendInternalTemplateSequence({
                conversationId: targetConversationId,
                content: text,
                attachments: list,
              });
              queryClient.invalidateQueries({ queryKey: messagesKey });
              queryClient.invalidateQueries({ queryKey: ["conversations"] });
            } finally {
              setSequenceSending(false);
            }
          })();
        });
        return;
      }
      setPendingTemplateMedia((prev) => [...prev, ...list]);
    },
  });

  if (!conversationId) return null;
  if (isLoading)
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden bg-[var(--chat-bg)] p-6">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton
            key={i}
            className={cn("h-14 rounded-2xl", i % 2 ? "ml-16" : "mr-16")}
          />
        ))}
      </div>
    );
  if (isError)
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--chat-bg)] p-6">
        <div className="rounded-[var(--radius-xl)] border border-destructive/30 bg-destructive/5 px-5 py-3 text-[14px] text-destructive">
          {error instanceof Error
            ? error.message
            : "Erro ao carregar mensagens."}
        </div>
      </div>
    );

  const META_DOMAINS = [
    "lookaside.fbsbx.com",
    "scontent.whatsapp.net",
    "graph.facebook.com",
  ];
  const resolveMediaUrl = (url: string | null | undefined): string | null => {
    if (!url) return null;
    if (url.startsWith("blob:") || url.startsWith("data:")) return url;
    if (url.startsWith("/uploads/") || url.startsWith("/api/")) return url;
    try {
      const p = new URL(url, window.location.origin);
      // Normaliza URLs absolutas do próprio app para paths internos,
      // pois `/api/media/transcribe` só autoriza `"/..."`.
      if (p.pathname.startsWith("/uploads/")) return `${p.pathname}${p.search}`;
      if (p.pathname.startsWith("/api/")) return `${p.pathname}${p.search}`;
      if (META_DOMAINS.some((d) => p.hostname.endsWith(d))) {
        return `/api/media/proxy?url=${encodeURIComponent(url)}`;
      }
    } catch {}
    if (url.includes("/uploads/")) return url.slice(url.indexOf("/uploads/"));
    return url;
  };
  const detectMediaKind = (
    m: InboxMessageDto,
  ): "image" | "audio" | "video" | "document" | null => {
    const mt = String(m.messageType ?? "").toLowerCase();
    if ((mt === "whatsapp_call_recording" || mt === "sip_call") && m.mediaUrl) return "audio";
    if (mt === "image" || mt === "sticker") return "image";
    if (mt === "audio" || mt === "ptt") return "audio";
    if (mt === "video") return "video";
    if (mt === "document") return "document";
    const u = m.mediaUrl ?? "";
    if (/\.(jpg|jpeg|png|gif|webp)($|\?)/i.test(u)) return "image";
    if (/\.(webm|ogg|mp3|wav|m4a|aac|amr|opus)($|\?)/i.test(u)) return "audio";
    if (/\.(mp4|mov|avi|3gp)($|\?)/i.test(u)) return "video";
    const c = m.content ?? "";
    if (/\[imagem\]|\[image\]|\[sticker\]/i.test(c)) return "image";
    if (/\[áudio\]|\[audio\]/i.test(c)) return "audio";
    if (/\[vídeo\]|\[video\]/i.test(c)) return "video";
    if (/\[documento\]|\[document\]/i.test(c)) return "document";
    if ((mt === "attachment" || mt === "file") && u) {
      if (/image/i.test(u)) return "image";
      if (/audio/i.test(u)) return "audio";
      if (/video/i.test(u)) return "video";
      return "document";
    }
    return null;
  };

  const renderMedia = (
    m: InboxMessageDto,
    out: boolean,
    isNote: boolean,
    msgId: string,
  ) => {
    if (!m.mediaUrl) return null;
    const url = resolveMediaUrl(m.mediaUrl);
    if (!url) return null;
    const kind = detectMediaKind(m);
    // Mensagem otimista (ainda subindo p/ servidor) — `id` começa com "temp-".
    // Usado p/ exibir estado "Enviando…" em todos os tipos de mídia: o
    // operador vê feedback claro de que o anexo está em curso, mesmo
    // quando a URL local (blob:) já permite preview imediato.
    const isUploading = typeof m.id === "string" && m.id.startsWith("temp-");
    if (kind === "audio") {
      const time = m.createdAt ? chatTime(m.createdAt) : undefined;
      const showDelivery =
        out && !isNote && m.sendStatus !== "failed" && !isUploading;
      const status = (
        m.sendStatus === "read"
          ? "read"
          : m.sendStatus === "delivered"
            ? "delivered"
            : "sent"
      ) as "sent" | "delivered" | "read";
      // Gravação de chamada outbound: extrai nome limpo de `senderName`
      // ("WhatsApp · chamada · Marcelo Pinheiro" → "Marcelo Pinheiro") em
      // vez do `effectiveSignature` global, garantindo que o áudio mostre
      // QUEM realmente conduziu a ligação.
      const isCallRec =
        String(m.messageType ?? "").toLowerCase() === "whatsapp_call_recording";
      const callAgentName =
        isCallRec && m.senderName
          ? m.senderName
              .replace(/^WhatsApp\s+·\s+(?:chamada\s+·\s+)?/i, "")
              .trim()
          : "";
      const audioSenderLabel =
        isCallRec && out
          ? callAgentName || "Gravação de chamada"
          : out && !isNote && signatureEnabled
            ? effectiveSignature
            : !out
              ? (m.senderName ?? undefined)
              : undefined;
      return (
        <AudioMessage
          url={url}
          time={time}
          showDeliveryCheck={showDelivery}
          deliveryStatus={status}
          out={out && !isNote}
          senderLabel={audioSenderLabel}
          isCallRec={isCallRec}
          isUploading={isUploading}
          onRegisterTranscribe={
            isUploading || isCallRec
              ? undefined
              : (handler) => {
                  if (handler) audioTranscribeRefs.current.set(msgId, handler);
                  else audioTranscribeRefs.current.delete(msgId);
                }
          }
        />
      );
    }

    const fileName =
      (m.content ?? "")
        .replace(/^📎\s*/, "")
        .replace(/^\[.*\]$/, "")
        .trim() ||
      (kind === "image"
        ? "image.jpeg"
        : kind === "video"
          ? "video.mp4"
          : "Documento");

    if (kind === "video") {
      return (
        <div className="relative">
          <LazyChatVideo url={url} fileName={fileName} isUploading={isUploading} />
          {isUploading && (
            <UploadingOverlay label="Enviando vídeo…" rounded="rounded-xl" />
          )}
        </div>
      );
    }

    if (kind === "image") {
      return (
        <div className="relative">
          <LazyChatImage url={url} fileName={fileName} isUploading={isUploading} />
          {isUploading && (
            <UploadingOverlay label="Enviando imagem…" rounded="rounded-xl" />
          )}
        </div>
      );
    }

    return (
      <div className="relative">
        <LazyChatDocument url={url} fileName={fileName} />
        {isUploading && (
          <UploadingOverlay label="Enviando arquivo…" rounded="rounded-xl" />
        )}
      </div>
    );
  };

  const msgText = (m: InboxMessageDto) => {
    const raw = m.content ?? "";
    const c = prettifyChatMessageBody(raw).trim();
    if (!c) return null;
    if (/^📎\s*audio\.(webm|ogg|mp3|wav|m4a|aac|amr)$/i.test(c)) return null;
    if (
      m.mediaUrl &&
      /^\[(?:imagem|image|áudio|audio|ptt|vídeo|video|sticker|documento|document)\]$/i.test(
        c,
      )
    )
      return null;
    if (m.mediaUrl && /^📎\s/.test(c) && detectMediaKind(m) !== "document")
      return null;
    return c;
  };

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/*
        Drop overlay — aparece quando o usuário está arrastando arquivo do
        sistema operacional sobre a janela. `pointer-events-none` é crucial:
        sem ele, o overlay engoliria os eventos de drag dos filhos e o
        contador `dragDepth` ficaria preso, deixando o overlay travado.
      */}
      {isDraggingFile && (
        <div
          className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-[var(--glass-bg-panel)] p-6 backdrop-blur-sm"
          aria-hidden
        >
          <div className="flex max-w-md flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-primary/60 bg-[var(--glass-bg-overlay)] px-8 py-7 text-center shadow-2xl backdrop-blur-md">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <Upload className="size-6" />
            </span>
            <p className="font-sans text-[15px] font-semibold text-foreground">
              Solte o arquivo para anexar
            </p>
            <p className="font-sans text-[12px] text-ink-soft">
              Imagens, vídeos, áudios ou documentos · até 16 MB
            </p>
          </div>
        </div>
      )}
      {/* Nota fixada — faixa única estilo WhatsApp (baixa, truncada). */}
      {pinnedNote && (
        <div className="sticky top-0 z-20 flex min-h-0 shrink-0 items-center gap-2 border-b border-border bg-[var(--color-bg-subtle)] px-3 py-1.5 md:px-4">
          <Pin
            className="size-3.5 shrink-0 rotate-45 text-[var(--color-ink-muted)]"
            fill="currentColor"
            strokeWidth={2}
            aria-hidden
          />
          <div className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
              NOTA FIXADA
            </span>
            <p className="min-w-0 flex-1 truncate font-sans text-[12px] font-normal leading-snug text-[var(--color-ink-soft)]">
              {pinnedNote.senderName ? (
                <>
                  <span className="font-semibold text-foreground">
                    {pinnedNote.senderName}
                  </span>
                  <span className="text-[var(--color-ink-muted)]">: </span>
                </>
              ) : null}
              <span>{notePreviewOneLine(pinnedNote.content ?? "")}</span>
            </p>
          </div>
          <TooltipHost label="Desfixar nota" side="left">
            <button
              type="button"
              onClick={() => pinNoteMutation.mutate(null)}
              aria-label="Desfixar nota"
              className="shrink-0 rounded-md p-1 text-[var(--color-ink-muted)] lumen-transition hover:bg-background hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </TooltipHost>
        </div>
      )}

      {searchOpen ? (
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-white dark:bg-foreground/70 px-3">
          <Search
            className="size-3.5 shrink-0 text-[var(--color-ink-soft)]"
            strokeWidth={2}
          />
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchMatchIndex(0);
            }}
            placeholder="Buscar na conversa…"
            className="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-[var(--color-ink-muted)] focus:outline-none"
            autoFocus
          />
          {searchMatches.length > 0 ? (
            <span className="shrink-0 text-[11px] tabular-nums text-[var(--color-ink-soft)]">
              {searchMatchIndex + 1}/{searchMatches.length}
            </span>
          ) : searchQuery.trim() ? (
            <span className="shrink-0 text-[11px] text-[var(--color-ink-muted)]">
              Nenhum resultado
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => {
              if (searchMatchIndex < searchMatches.length - 1)
                setSearchMatchIndex((i) => i + 1);
            }}
            disabled={searchMatchIndex >= searchMatches.length - 1}
            className="inline-flex size-6 items-center justify-center rounded text-[var(--color-ink-soft)] hover:bg-[var(--color-bg-subtle)] disabled:opacity-30"
            aria-label="Anterior"
          >
            <ChevronUp className="size-3.5" strokeWidth={2.2} />
          </button>
          <button
            type="button"
            onClick={() => {
              if (searchMatchIndex > 0) setSearchMatchIndex((i) => i - 1);
            }}
            disabled={searchMatchIndex <= 0}
            className="inline-flex size-6 items-center justify-center rounded text-[var(--color-ink-soft)] hover:bg-[var(--color-bg-subtle)] disabled:opacity-30"
            aria-label="Próximo"
          >
            <ChevronDown className="size-3.5" strokeWidth={2.2} />
          </button>
          <button
            type="button"
            onClick={() => {
              setSearchOpen(false);
              setSearchQuery("");
              setSearchMatchIndex(0);
            }}
            className="inline-flex size-6 items-center justify-center rounded text-[var(--color-ink-soft)] hover:bg-[var(--color-bg-subtle)]"
            aria-label="Fechar busca"
          >
            <X className="size-3.5" strokeWidth={2.2} />
          </button>
        </div>
      ) : null}

      {/* Messages — única zona de scroll vertical do chat
          Protocolo "High-End Luxury UI": px-12 + py-12 para respiro editorial,
          fundo #f4f7fa + shadow-inner para profundidade no topo.
          Mobile: px-4 + py-3 + gap-2 — alinhado com a regra
          `ui-fidelity §7.bis` ("Body do chat mantem px-4 sm:px-12").
          Versao anterior `px-2.5` era violacao da regra (bolhas grudadas
          nas bordas em telas <375px) sob o pretexto de 'Kommo-like'.
          16px (px-4) e o minimo aceitavel sem perder identidade. */}
      <div
        ref={messagesScrollRef}
        className={cn(
          "relative min-h-0 flex-1 overflow-y-auto bg-[var(--chat-bg)] px-4 py-3 shadow-inner",
          compactChrome
            ? "scrollbar-workspace sm:px-4 sm:py-3"
            : "scrollbar-thin sm:px-12 sm:py-12",
        )}
      >
        <StickyDayPill date={stickyDayLabel} />
        {/* Mobile: px-4 py-3 (respeita regra). Desktop: px-12 py-12
            (respiro editorial premium). */}
        {isFetching && !isLoading && (
          <div className="pointer-events-none absolute right-4 top-3 z-10 rounded-full bg-card px-3 py-1.5 text-[11px] font-medium text-muted-foreground shadow-[var(--shadow-sm)]">
            Atualizando…
          </div>
        )}
        {/* Empty state — conversa selecionada porem sem mensagens.
            Acontece quando operador cria conversa nova manualmente
            (sem mensagem inicial) ou apos limpeza historica. Padrao
            do `visual-agent.mdc §7`: card minimalista centrado com
            icone em pill, titulo font-extrabold tracking-tighter e
            descricao font-medium slate-400. */}
        {!isLoading && conversationId && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-muted">
              <Send
                className="size-5 text-[var(--color-ink-muted)]"
                strokeWidth={2.2}
              />
            </div>
            <p className="mb-1 text-[16px] font-extrabold tracking-tighter text-foreground">
              Conversa nova
            </p>
            <p className="max-w-[280px] text-[13px] font-medium leading-relaxed text-[var(--color-ink-muted)]">
              Envie a primeira mensagem ou um template para iniciar a conversa.
            </p>
          </div>
        )}
        <div className="mx-auto flex w-full flex-col gap-0.5">
          {messages.map((m, idx) => {
            const prev = idx > 0 ? messages[idx - 1] : null;
            const showDate = shouldShowDateSeparator(prev, m);
            const dayLabel = chatDateLabel(m.createdAt) || undefined;

            {
              const mt = String(m.messageType ?? "").toLowerCase();
              const raw = String(m.content ?? "").trim();

              // Rascunho gerado pelo agente de IA em modo DRAFT: não
              // é uma bolha normal, mas um card inline com ações
              // (aprovar/editar/descartar) pro operador humano.
              if (mt === "ai_draft" && m.isPrivate && conversationId) {
                return (
                  <React.Fragment key={m.id}>
                    {showDate && <DateSep date={m.createdAt} stickyLabel={stickyDayLabel} />}
                    <div data-msg-idx={idx} data-day-label={dayLabel}>
                      <AIDraftCard
                        messageId={String(m.id)}
                        content={raw}
                        createdAt={m.createdAt}
                        senderName={m.senderName ?? null}
                        conversationId={conversationId}
                      />
                    </div>
                  </React.Fragment>
                );
              }

              /* Chamadas:
                 - `whatsapp_call` / `sip_call` (sem player) → Activity Item.
                 - `whatsapp_call_recording` ou `sip_call` COM `mediaUrl` cai no áudio. */
              if (
                mt === "whatsapp_call" ||
                (mt === "sip_call" && !m.mediaUrl) ||
                (mt === "whatsapp_call_recording" && !m.mediaUrl)
              ) {
                return (
                  <React.Fragment key={m.id}>
                    {showDate && <DateSep date={m.createdAt} stickyLabel={stickyDayLabel} />}
                    <div data-msg-idx={idx} data-day-label={dayLabel}>
                      <CallActivityItem message={m} />
                    </div>
                  </React.Fragment>
                );
              }
              /* Respostas de opt-in da Meta Calling (permissão concedida/recusada): Activity Item. */
              const consentVerdict = detectConsentVerdict(raw);
              if (consentVerdict) {
                return (
                  <React.Fragment key={m.id}>
                    {showDate && <DateSep date={m.createdAt} stickyLabel={stickyDayLabel} />}
                    <div data-msg-idx={idx} data-day-label={dayLabel}>
                      <ConsentActivityItem
                        message={m}
                        verdict={consentVerdict}
                      />
                    </div>
                  </React.Fragment>
                );
              }
              /* API Meta: type "system" (ex. user_changed_number). Versões antigas gravavam só "[system]". */
              const isSystemRow =
                m.direction === "system" ||
                raw === "[system]" ||
                (mt === "system" && raw.startsWith("[Sistema"));
              if (isSystemRow) {
                const systemBody =
                  raw === "[system]" || raw === "[Sistema]"
                    ? "Evento do sistema WhatsApp. Mensagens antigas não tinham o texto; as novas mostram o aviso da Meta (ex.: cliente alterou o número)."
                    : m.content || "Evento do sistema WhatsApp.";
                return (
                  <React.Fragment key={m.id}>
                    {showDate && <DateSep date={m.createdAt} stickyLabel={stickyDayLabel} />}
                    <div data-msg-idx={idx} data-day-label={dayLabel}>
                      <SystemEventRow
                        body={systemBody}
                        createdAt={m.createdAt}
                      />
                    </div>
                  </React.Fragment>
                );
              }

              const classified = classifyTimelineItem({
                messageType: String(m.messageType ?? ""),
                isPrivate: m.isPrivate,
                authorType: m.authorType,
                senderName: m.senderName,
                content: m.content,
                direction: m.direction,
              });
              if (classified.kind === "event") {
                if (isRedundantOpenStatusEvent(m.content)) return null;
                return (
                  <React.Fragment key={m.id}>
                    {showDate && <DateSep date={m.createdAt} stickyLabel={stickyDayLabel} />}
                    <div data-msg-idx={idx} data-day-label={dayLabel}>
                      <EventRow
                        action={classified.action ?? "ia"}
                        text={m.content}
                        actor={m.senderName ?? ""}
                        actorId={m.senderUserId}
                        time={m.createdAt ? chatTime(m.createdAt) : ""}
                      />
                    </div>
                  </React.Fragment>
                );
              }
            }

            const out = m.direction === "out";
            const isNote = out && m.isPrivate === true;
            // Campanha: `senderName: "Campanha: {nome}"` — trata como bot
            // e aplica estilo teal (alinhar com MessageBubble do inbox-v2).
            const campaignMatch = out
              ? /^Campanha:\s*(.+)$/i.exec((m.senderName ?? "").trim())
              : null;
            const isCampaign = !!campaignMatch;
            const campaignName = campaignMatch?.[1]?.trim() || null;
            const isBot =
              out &&
              (m.senderName === "Automação" ||
                m.senderName === "Sistema" ||
                isCampaign);
            const msgId = String(m.id);
            const grouped = groupReactions(m.reactions ?? []);
            const showSenderName =
              m.senderName && (!prev || prev.direction !== m.direction);
            const next = idx < messages.length - 1 ? messages[idx + 1] : null;
            const isLastInGroup = !next || next.direction !== m.direction;

            const isPinned = pinnedNoteId === String(m.id);
            const isAudioOnly =
              !isNote && detectMediaKind(m) === "audio" && !msgText(m);
            const isTemplate =
              String(m.messageType ?? "").toLowerCase() === "template";

            return (
              <React.Fragment key={m.id}>
                {showDate && <DateSep date={m.createdAt} stickyLabel={stickyDayLabel} />}
                <MotionDiv
                  data-msg-idx={idx} data-day-label={dayLabel}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className={cn(
                    "group flex w-full",
                    // Nota interna: mesma largura máxima dos balões + alinhada
                    // à direita (agente). Mobile: gap menor entre avatar e bolha.
                    isNote
                      ? "justify-end"
                      : cn(
                          "items-end gap-1.5 md:gap-2",
                          out ? "justify-end" : "justify-start",
                        ),
                  )}
                  onMouseEnter={() => setHoveredMsgId(m.id)}
                  onMouseLeave={() => {
                    if (
                      reactionPickerMsgId !== m.id &&
                      fullEmojiPickerMsgId !== m.id
                    )
                      setHoveredMsgId(null);
                  }}
                >
                  <div
                    className={cn(
                      "relative",
                      isNote
                        ? "w-full ml-0 mr-0"
                        : compactChrome
                          ? "min-w-0 max-w-[75%]"
                          : "min-w-0 max-w-[92%] md:max-w-[85%]",
                    )}
                  >
                    {/*
                  NB: botão de pin pra notas mora INLINE no header da nota
                  (ver bloco `isNote ? (...)` abaixo). Em layout borda-a-
                  borda, um botão flutuante absoluto briga com a leitura
                  da faixa — então ele fica sempre visível na linha do
                  cabecalho, no canto direito.
                */}
                    {fullEmojiPickerMsgId === m.id && (
                      <div
                        data-full-emoji-picker
                        className={cn(
                          "absolute bottom-full z-30 mb-1 w-72",
                          out ? "right-0" : "left-0",
                        )}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <EmojiPicker
                          open
                          onPick={(emoji) => {
                            if (
                              typeof m.id === "string" &&
                              m.id.startsWith("temp-")
                            )
                              return;
                            reactionMutation.mutate({
                              messageId: msgId,
                              emoji,
                            });
                            setFullEmojiPickerMsgId(null);
                          }}
                        />
                      </div>
                    )}
                    {reactionPickerMsgId === m.id && (
                      <div
                        data-reaction-picker
                        className={cn(
                          "absolute bottom-full z-20 mb-1 flex items-center gap-0.5 rounded-2xl border border-border bg-card px-1.5 py-1 shadow-[0_8px_32px_rgba(0,0,0,0.10)]",
                          out ? "right-0" : "left-0",
                        )}
                      >
                        {QUICK_REACTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            disabled={
                              msgId.startsWith("temp-") ||
                              reactionMutation.isPending
                            }
                            onClick={() =>
                              reactionMutation.mutate({
                                messageId: msgId,
                                emoji,
                              })
                            }
                            className="flex size-8 items-center justify-center rounded-xl text-base lumen-transition hover:scale-125 hover:bg-[var(--chat-bg)] disabled:opacity-40"
                            aria-label={
                              msgId.startsWith("temp-")
                                ? "Aguarde a mensagem terminar de enviar"
                                : `Reagir com ${emoji}`
                            }
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}

                    <div
                      className={cn(
                        "relative",
                        isNote &&
                          cn(
                            "w-full border-l-2",
                            isPinned
                              ? "border-l-primary bg-[var(--color-primary-soft)]/35"
                              : "border-l-[var(--chat-bubble-note-border)]",
                          ),
                        !isNote &&
                          (out ? dt.chat.bubble.sent : dt.chat.bubble.received),
                      )}
                      style={
                        isNote && !isPinned
                          ? { background: "var(--chat-bubble-note-bg)" }
                          : !isNote && out && isCampaign
                            ? {
                                background: "var(--chat-bubble-campaign-bg)",
                                color: "var(--chat-bubble-campaign-text)",
                                borderColor: "var(--chat-bubble-campaign-border)",
                              }
                          : !isNote && out
                            ? {
                                background: "var(--chat-bubble-sent-bg)",
                                color: "var(--chat-bubble-sent-text)",
                              }
                            : !isNote && !out
                              ? {
                                  background: "var(--chat-bubble-received-bg)",
                                  borderColor: "var(--chat-bubble-received-border)",
                                }
                              : undefined
                      }
                    >
                      {!isNote && (
                        /* Chip flutuante: posicionado FORA da bolha (acima do canto
                       superior direito). Antes acompanhava o lado da mensagem
                       (out→direita, in→esquerda) criando um efeito espelhado.
                       Por preferência do operador o chip agora fica SEMPRE no
                       final do balão — canto direito — independente da direção
                       da mensagem. O `align="end"` do popover é mantido pra
                       evitar que o menu seja cortado pelo overflow do scroller. */
                        <div
                          // Em mobile o chip de ações (responder/encaminhar/
                          // reagir) fica oculto: não existe hover, e long-press
                          // é um padrão de outro ciclo. Em md+ continua o
                          // comportamento original (aparece no hover/focus).
                          className="absolute -top-3 right-2 z-20 hidden opacity-0 transition-opacity duration-150 md:block focus-within:opacity-100 group-hover:opacity-100"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              className={cn(
                                "flex size-7 items-center justify-center rounded-full border border-border bg-white text-ink-muted shadow-[var(--shadow-sm)] outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-offset-1",
                                out
                                  ? "focus-visible:ring-info/50"
                                  : "focus-visible:ring-border",
                              )}
                              aria-label="Ações da mensagem"
                            >
                              <MoreHorizontal className="size-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="z-50 min-w-44 rounded-xl border border-black/5 bg-white p-1 shadow-[0_8px_32px_rgba(0,0,0,0.10)]"
                            >
                              <DropdownMenuItem
                                className="gap-2 px-2 py-1.5 text-[13px] hover:bg-muted focus:bg-muted"
                                onClick={() => {
                                  setReplyTo(m);
                                  textareaRef.current?.focus();
                                }}
                              >
                                <Reply className="size-3.5 shrink-0 opacity-70" />
                                Responder
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="gap-2 px-2 py-1.5 text-[13px] hover:bg-muted focus:bg-muted"
                                onClick={() => setForwardingMessage(m)}
                              >
                                <Share2 className="size-3.5 shrink-0 opacity-70" />
                                Encaminhar…
                              </DropdownMenuItem>
                              {detectMediaKind(m) === "audio" &&
                              m.mediaUrl &&
                              String(m.messageType ?? "").toLowerCase() !==
                                "whatsapp_call_recording" ? (
                                <DropdownMenuItem
                                  className="gap-2 px-2 py-1.5 text-[13px] hover:bg-muted focus:bg-muted"
                                  onClick={() =>
                                    audioTranscribeRefs.current.get(msgId)?.()
                                  }
                                  disabled={
                                    typeof m.id === "string" &&
                                    m.id.startsWith("temp-")
                                  }
                                >
                                  <FileText className="size-3.5 shrink-0 opacity-70" />
                                  Transcrever áudio
                                </DropdownMenuItem>
                              ) : null}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="gap-2 px-2 py-1.5 text-[13px] hover:bg-muted focus:bg-muted"
                                disabled={
                                  typeof m.id === "string" &&
                                  m.id.startsWith("temp-")
                                }
                                onSelect={(e) => {
                                  e.preventDefault();
                                  setReactionPickerMsgId(null);
                                  setHoveredMsgId(m.id);
                                  setFullEmojiPickerMsgId(m.id);
                                }}
                              >
                                <Smile className="size-3.5 shrink-0 opacity-70" />
                                Reagir…
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}

                      {m.replyToPreview && (
                        <div
                          className={cn(
                            // Quote/reply: padding mais tight em mobile pra
                            // não ocupar 1/3 da bolha. Desktop intocado.
                            "mx-2 mt-1.5 flex flex-col gap-0.5 overflow-hidden rounded-xl border-l-4 p-1.5 md:mx-3 md:mt-2 md:p-2",
                            out && !isNote
                              ? "border-[color:var(--chat-bubble-sent-text)]/20 bg-[color:var(--chat-bubble-sent-text)]/10"
                              : "border-accent bg-[var(--color-bg-subtle)]",
                          )}
                        >
                          <span className="text-[9px] font-semibold uppercase text-accent tracking-tight">
                            Respondendo
                          </span>
                          <span
                            className={cn(
                              "line-clamp-2 text-[11px] md:text-[12px]",
                              out && !isNote
                                ? "text-[color:var(--chat-bubble-sent-text)]/70"
                                : "text-ink-muted",
                            )}
                          >
                            {m.replyToPreview}
                          </span>
                        </div>
                      )}

                      <div
                        className={cn(
                          isAudioOnly
                            ? "px-2 py-1"
                            : isNote
                              ? "px-3 py-1.5"
                              : "px-2 py-1",
                        )}
                      >
                        {isNote ? (
                          <div className="mb-1 flex min-h-0 items-center gap-1.5">
                            <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-muted text-[var(--color-ink-muted)] ring-1 ring-border">
                              <Lock className="size-3" strokeWidth={2.5} />
                            </span>
                            <span
                              className={cn(dt.chat.noteLabel, "text-[9px]")}
                            >
                              Nota interna
                            </span>
                            {m.senderName ? (
                              <>
                                <span
                                  className="text-[9px] text-[var(--color-ink-muted)]"
                                  aria-hidden
                                >
                                  ·
                                </span>
                                <span className="truncate text-[10px] font-medium text-[var(--color-ink-soft)]">
                                  {m.senderName}
                                </span>
                              </>
                            ) : null}
                            <TooltipHost
                              label={
                                isPinned ? "Desfixar nota" : "Fixar no topo"
                              }
                              side="top"
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  pinNoteMutation.mutate(
                                    isPinned ? null : String(m.id),
                                  )
                                }
                                aria-label={
                                  isPinned ? "Desfixar nota" : "Fixar no topo"
                                }
                                aria-pressed={isPinned}
                                className={cn(
                                  "ml-auto flex size-6 shrink-0 items-center justify-center rounded-md lumen-transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25",
                                  isPinned
                                    ? "text-primary"
                                    : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink-soft)]",
                                )}
                              >
                                {isPinned ? (
                                  <Pin
                                    className="size-3 rotate-45"
                                    fill="currentColor"
                                    strokeWidth={2}
                                  />
                                ) : (
                                  <Pin
                                    className="size-3 rotate-45"
                                    strokeWidth={2}
                                  />
                                )}
                              </button>
                            </TooltipHost>
                          </div>
                        ) : out ? (
                          // Mensagens enviadas: quando geradas por automação,
                          // carimbamos um chip compacto "Automação" com ícone
                          // de robô. Antes era `bg-subtle/70` (cinza claro
                          // semitransparente) — porem na bolha out (bg-chat-sent
                          // `#f0f9fa` cyan ultra-claro) o chip se dissolvia no
                          // fundo. Migrado pra `bg-white ring-1 ring-black/10`
                          // que cria contraste real (branco vs cyan claro)
                          // sem virar alerta competindo com cores semanticas.
                          isBot && !isAudioOnly ? (
                            isCampaign ? (
                              <div className="mb-1.5 flex flex-col gap-0.5">
                                <div
                                  className="inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5"
                                  style={{
                                    background:
                                      "var(--chat-bubble-campaign-badge-bg)",
                                    color:
                                      "var(--chat-bubble-campaign-badge-text)",
                                  }}
                                >
                                  <Megaphone
                                    className="size-3"
                                    strokeWidth={2.4}
                                  />
                                  <span className="font-display text-[10px] font-semibold uppercase tracking-[0.08em]">
                                    Campanha
                                  </span>
                                </div>
                                {campaignName ? (
                                  <span className="font-display text-[11.5px] font-semibold leading-snug">
                                    {campaignName}
                                  </span>
                                ) : null}
                              </div>
                            ) : (
                              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                                <div className="inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-0.5 ring-1 ring-black/10">
                                  <Bot
                                    className="size-3 text-[var(--color-ink-soft)]"
                                    strokeWidth={2.4}
                                  />
                                  <span className="font-display text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground">
                                    {m.senderName ?? "Automação"}
                                  </span>
                                </div>
                                {isTemplate ? (
                                  <TemplateBadge
                                    content={m.content ?? ""}
                                    className="mb-0"
                                  />
                                ) : null}
                              </div>
                            )
                          ) : null
                        ) : showSenderName && !isAudioOnly && !compactChrome ? (
                          // Label do remetente (contato): preserva o case cadastrado
                          // no CRM (sem `uppercase` forçado) e usa tipografia mais
                          // leve — `font-semibold` + `tracking-tight` — evitando o
                          // ar "MARCILIO"-like que `font-bold tracking-widest`
                          // produzia, e que o operador pediu pra suavizar. Bot
                          // mantém destaque de cor (âmbar) só no ícone.
                          // compactChrome: omitido — densidade workspace / inbox compacto.
                          <p
                            className={cn(
                              "font-display mb-1 text-[12px] font-semibold tracking-tight",
                              isBot
                                ? "text-chat-bot-foreground"
                                : "text-primary/90",
                            )}
                          >
                            {isBot && (
                              <Bot className="inline size-3.5 shrink-0 mr-1" />
                            )}
                            {m.senderName}:
                          </p>
                        ) : null}
                        {/*
                      Mensagens do agente (out=true) NÃO renderizam mais um
                      label visual de assinatura: o prefixo "Nome: " é agora
                      embutido no próprio `content` ao enviar (ver `onSend`),
                      garantindo paridade com o que o cliente recebe no
                      WhatsApp. Evita duplicação e respeita o pedido do
                      operador de que a assinatura faça parte da mensagem.
                    */}

                        {isTemplate &&
                          !(out && isBot && !isAudioOnly && !isCampaign) && (
                          <TemplateBadge content={m.content ?? ""} />
                        )}

                        {renderMedia(m, out, isNote, msgId)}

                        {(() => {
                          const text = msgText(m);
                          const time = m.createdAt ? chatTime(m.createdAt) : "";
                          const showCheck =
                            out && !isNote && m.sendStatus !== "failed";
                          const isFailed = m.sendStatus === "failed";
                          const status = m.sendStatus || "sent";
                          const isRead = status === "read";
                          const isDelivered = status === "delivered" || isRead;
                          // "Entrega não confirmada": mensagem ficou em `sent` sem
                          // virar `delivered` por tempo demais. Pode indicar número
                          // Meta pausado, quality rating rebaixado, ou mensagem
                          // engolida silenciosamente pela Cloud API. Não é uma
                          // falha definitiva (sweeper marca como `failed` após
                          // 15 min), só um aviso visual proativo no chat para o
                          // operador perceber antes que a automação continue.
                          const stalePending = (() => {
                            if (!out || isNote || isFailed || isDelivered)
                              return false;
                            if (status !== "sent") return false;
                            if (!m.createdAt) return false;
                            const ts = new Date(m.createdAt).getTime();
                            if (!Number.isFinite(ts)) return false;
                            return Date.now() - ts > 5 * 60 * 1_000;
                          })();
                          const checkClassName = cn(
                            stalePending && out && !isNote && "text-warning",
                            stalePending && !out && "text-warning",
                            !stalePending && isRead && dt.chat.check.read,
                            !stalePending &&
                              !isRead &&
                              out &&
                              !isNote &&
                              dt.chat.check.sent,
                            !stalePending &&
                              !isRead &&
                              !out &&
                              dt.chat.check.default,
                          );

                          const fullTs = m.createdAt
                            ? chatFullTimestamp(m.createdAt)
                            : "";
                          const tzOffset = m.createdAt
                            ? chatTimezoneOffset(m.createdAt)
                            : "";
                          const tzName = chatTimezoneName();
                          const relTime = m.createdAt
                            ? chatRelativeTime(m.createdAt)
                            : "";

                          const timeRowClass = cn(
                            "relative inline-flex items-center gap-1 whitespace-nowrap",
                            dt.text.time,
                            isNote && dt.chat.time.note,
                            !isNote && out && dt.chat.time.sent,
                            !isNote && !out && dt.chat.time.received,
                          );
                          const timeRowStyle = {
                            fontVariantNumeric: "tabular-nums" as const,
                            ...(!isNote && out
                              ? { color: "var(--chat-bubble-sent-time)" }
                              : {}),
                          };

                          const timeInner = (
                            <span
                              className={cn(timeRowClass)}
                              style={timeRowStyle}
                            >
                              <span className="cursor-default">{time}</span>
                              {isFailed ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex cursor-help items-center">
                                      <span
                                        className="inline-flex shrink-0 !text-[#ef4444]"
                                        style={{ color: "#ef4444" }}
                                      >
                                        <AlertTriangle
                                          color="#ef4444"
                                          className="size-3 !text-[#ef4444]"
                                          style={{ color: "#ef4444" }}
                                        />
                                      </span>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="top"
                                    align="end"
                                    className="border-0 bg-transparent p-0 shadow-none"
                                  >
                                    <MetaSendErrorBalloon
                                      sendError={m.sendError}
                                      onCopied={() => toast.success("Erro copiado")}
                                    />
                                  </TooltipContent>
                                </Tooltip>
                              ) : showCheck ? (
                                isDelivered ? (
                                  <svg
                                    viewBox="0 0 16 11"
                                    height="11"
                                    width="16"
                                    fill="currentColor"
                                    className={cn("size-3.5", checkClassName)}
                                  >
                                    <path d="M11.07.66 5.84 5.89 3.15 3.2a.54.54 0 0 0-.76 0l-.7.7c-.21.21-.21.54 0 .76l3.72 3.72c.21.21.54.21.76 0l6.25-6.25c.21-.21.21-.55 0-.76l-.7-.7a.54.54 0 0 0-.76 0l-.09.09Z" />
                                    <path
                                      d="M15.07.66 9.84 5.89 8.88 4.93a.54.54 0 0 0-.76 0l-.7.7c-.21.21-.21.54 0 .76l2.15 2.15c.21.21.54.21.76 0l6.25-6.25c.21-.21.21-.55 0-.76l-.7-.7a.54.54 0 0 0-.76 0Z"
                                      opacity=".75"
                                    />
                                  </svg>
                                ) : stalePending ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="inline-flex items-center">
                                        <Clock
                                          className="size-3 text-warning"
                                          strokeWidth={2.5}
                                        />
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent
                                      side="top"
                                      align="end"
                                      className="max-w-[240px] border border-[color:var(--color-warning)]/25 bg-[var(--color-warning-soft)] text-left text-[11px] font-medium leading-tight text-[var(--color-ink-soft)] shadow-[var(--shadow-lg)]"
                                    >
                                      Entrega não confirmada após 5 min — número
                                      pode estar pausado, flagged ou com
                                      qualidade rebaixada.
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <svg
                                    viewBox="0 0 12 11"
                                    height="11"
                                    width="12"
                                    fill="currentColor"
                                    className={cn("size-3.5", checkClassName)}
                                  >
                                    <path d="M11.07.66 5.84 5.89 3.15 3.2a.54.54 0 0 0-.76 0l-.7.7c-.21.21-.21.54 0 .76l3.72 3.72c.21.21.54.21.76 0l6.25-6.25c.21-.21.21-.55 0-.76l-.7-.7a.54.54 0 0 0-.76 0l-.09.09Z" />
                                  </svg>
                                )
                              ) : null}
                            </span>
                          );

                          const timeEl = m.createdAt && !isFailed ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                {timeInner}
                              </TooltipTrigger>
                              <TooltipContent
                                side="top"
                                align="end"
                                className="max-w-[260px] px-3 py-2 text-left text-[11px] font-medium leading-tight"
                              >
                                <span className="block font-bold">
                                  {fullTs}
                                </span>
                                <span className="block text-[var(--color-ink-muted)]">
                                  ({tzOffset}){tzName ? ` ${tzName}` : ""}
                                </span>
                                <span className="mt-1 block font-semibold text-[var(--color-ink-soft)]">
                                  {relTime}
                                </span>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            timeInner
                          );

                          if (text) {
                            // Nota interna: texto em aspas tipográficas curvas,
                            // `font-medium` (sem itálico — feedback do operador:
                            // itálico estava lendo como "citação literária",
                            // a nota é só lembrete operacional).
                            // `text-[var(--color-ink-soft)]` (médio legível): meio termo
                            // entre slate-700 (escuro, competia com mensagens)
                            // e slate-500 (claro demais, parecia desabilitado).
                            // O peso visual da identidade "isso é uma nota"
                            // vem da BORDA LATERAL grossa + fundo amarelado
                            // sutil (#fdfaf0), não do peso do texto. Aspas
                            // curvas em `slate-400` enquadram o conteúdo.
                            // Timestamp inline abaixo (não absolute) pra
                            // respeitar o respiro vertical do `py-5`.
                            if (isNote) {
                              return (
                                <div className="space-y-0.5">
                                  <p
                                    className={cn(
                                      "font-sans font-normal leading-[1.4]",
                                      dt.chat.text.note,
                                    )}
                                  >
                                    {searchOpen && searchQuery.trim() ? (
                                      <HighlightedText
                                        text={text}
                                        query={searchQuery}
                                        isCurrentMatch={
                                          idx === currentMatchMessageIndex
                                        }
                                      />
                                    ) : (
                                      <span className="whitespace-pre-wrap wrap-break-word">
                                        {text}
                                      </span>
                                    )}
                                  </p>
                                  <div className="flex justify-end">
                                    {timeEl}
                                  </div>
                                </div>
                              );
                            }
                            const textBody = (
                              <span className="whitespace-pre-wrap wrap-break-word">
                                {searchOpen && searchQuery.trim() ? (
                                  <HighlightedText
                                    text={text}
                                    query={searchQuery}
                                    isCurrentMatch={
                                      idx === currentMatchMessageIndex
                                    }
                                  />
                                ) : (
                                  text
                                )}
                              </span>
                            );
                            return (
                              <div className="flex items-end gap-1.5">
                                <p
                                  className={cn(
                                    "font-sans font-normal leading-[1.4] min-w-0 flex-1",
                                    out && !isNote
                                      ? dt.chat.text.sent
                                      : dt.chat.text.received,
                                  )}
                                  style={
                                    out && !isNote
                                      ? { color: "var(--chat-bubble-sent-text)" }
                                      : !out && !isNote
                                        ? { color: "var(--chat-bubble-received-text)" }
                                        : undefined
                                  }
                                >
                                  {textBody}
                                </p>
                                <span className="flex-shrink-0 -mb-1">
                                  {timeEl}
                                </span>
                              </div>
                            );
                          }
                          // Áudio tem seu próprio rodapé de delivery; evita duplicação.
                          if (detectMediaKind(m) === "audio") return null;
                          return (
                            <div className="mt-1 flex justify-end items-center">
                              {timeEl}
                            </div>
                          );
                        })()}
                      </div>

                      {m.sendStatus === "failed" && (
                        <div
                          className={cn(
                            "mt-1 flex",
                            out ? "justify-end" : "justify-start",
                          )}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (conversationId && m.content)
                                sendMutation.mutate({
                                  content: m.content,
                                  asNote: false,
                                });
                            }}
                            className="shrink-0 rounded-lg px-2 py-0.5 text-[11px] font-medium text-[#7D3333] lumen-transition hover:bg-[#FFF2F0]"
                          >
                            Reenviar
                          </button>
                        </div>
                      )}
                    </div>

                    {grouped.length > 0 && (
                      <div
                        className={cn(
                          "mt-1 flex flex-wrap gap-1",
                          out ? "justify-end" : "justify-start",
                        )}
                      >
                        {grouped.map((g) => (
                          <TooltipHost
                            key={g.emoji}
                            label={g.senders.join(", ")}
                            side="top"
                          >
                            <button
                              type="button"
                              disabled={
                                msgId.startsWith("temp-") ||
                                reactionMutation.isPending
                              }
                              onClick={() =>
                                reactionMutation.mutate({
                                  messageId: msgId,
                                  emoji: g.emoji,
                                })
                              }
                              aria-label={`Reagiram com ${g.emoji}: ${g.senders.join(", ")}`}
                              className="inline-flex items-center gap-0.5 rounded-full border border-border bg-card px-2 py-0.5 text-xs shadow-[var(--shadow-sm)] lumen-transition hover:scale-105 hover:shadow-md disabled:opacity-50"
                            >
                              <span>{g.emoji}</span>
                              {g.count > 1 && (
                                <span
                                  className="text-[10px] text-muted-foreground"
                                  style={{ fontVariantNumeric: "tabular-nums" }}
                                >
                                  {g.count}
                                </span>
                              )}
                            </button>
                          </TooltipHost>
                        ))}
                      </div>
                    )}
                  </div>

                  {out && !isNote && isLastInGroup && (
                    <div className="mb-0.5 hidden shrink-0 sm:block">
                      {/* Avatar do agente em mensagens out: oculto em mobile
                      (< sm) pra ganhar largura — em chat estreito o
                      avatar pequeno pixela e disputa espaço com o
                      texto. Ainda visível em sm+ (tablet vertical em
                      diante) e em todo desktop. */}
                      <TooltipHost
                        label={
                          agentNameFromWhatsappCallSender(m.senderName) ||
                          m.senderName ||
                          "Admin Bwipo"
                        }
                        side="top"
                      >
                        <ChatAvatar
                          user={{
                            id: m.senderUserId ?? m.senderName ?? "out",
                            name:
                              agentNameFromWhatsappCallSender(m.senderName) ||
                              m.senderName ||
                              "Agente",
                            imageUrl: isBot ? null : (m.senderImageUrl ?? null),
                          }}
                          size={28}
                          channel={null}
                          hideCartoon
                          isBot={isBot}
                        />
                      </TooltipHost>
                    </div>
                  )}
                  {out && !isNote && !isLastInGroup && (
                    <div className="hidden w-7 shrink-0 sm:block" />
                  )}
                </MotionDiv>
              </React.Fragment>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {!sessionActive &&
        sessionInfo &&
        !isBaileysChannel &&
        (compactChrome ? (
          <div className={cn("shrink-0", dt.chat.sessionExpiredCard)}>
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive-soft">
              <AlertTriangle
                className="size-4 text-destructive"
                strokeWidth={2.25}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold text-foreground">
                Sessão de 24h encerrada
              </p>
              <p className="text-[11px] text-ink-subtle">
                Só templates aprovados pelo WhatsApp
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActivePanel("templates")}
              className="shrink-0 rounded-lg bg-primary px-3 py-2 text-[12px] font-semibold text-white shadow-sm transition-all hover:bg-primary-dark active:scale-95"
            >
              Usar Template
            </button>
          </div>
        ) : (
          <div className="shrink-0 border-t border-destructive/15 bg-destructive/5 px-3 py-2.5 sm:px-6 sm:py-3">
            <div className="mx-auto flex max-w-[1100px] flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="flex min-w-0 items-start gap-2.5 sm:items-center">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                  <AlertCircle
                    className="size-4 text-destructive"
                    strokeWidth={2}
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    Janela de 24h expirada
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">
                    Use um template oficial da Meta para reabrir a conversa
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActivePanel("templates")}
                className="h-9 shrink-0 rounded-lg bg-primary px-3 text-xs font-semibold text-white shadow-[var(--shadow-sm)] lumen-transition hover:bg-[var(--color-primary-dark)] active:scale-[0.98] sm:px-4"
              >
                Enviar template
              </button>
            </div>
          </div>
        ))}

      {/* Banner de mensagens agendadas pendentes.
          Fica acima do composer como "barra de estado" discreta,
          tecla a mesma max-width que o composer pra alinhamento visual.
          Exibe no máximo 2 agendamentos em detalhe e condensa o resto
          num "+N mais" pra não ocupar muito espaço vertical. */}
      {pendingScheduled.length > 0 && (
        <div className="shrink-0 border-t border-primary/20 bg-primary-soft/70 px-3 py-2 sm:px-6">
          <div className={cn(rowMax, "flex flex-col gap-1.5")}>
            {pendingScheduled.slice(0, 2).map((sm) => {
              const when = new Date(sm.scheduledAt);
              const whenLabel = when.toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              });
              return (
                <div
                  key={sm.id}
                  className="flex items-center gap-2 rounded-xl bg-[var(--glass-bg-overlay)] px-3 py-1.5 text-[12px] text-info"
                >
                  <Clock
                    className="size-3.5 shrink-0 text-info"
                    strokeWidth={2.25}
                  />
                  <span className="font-semibold">
                    Agendada para {whenLabel}
                  </span>
                  <span className="hidden truncate text-info/80 sm:inline">
                    —{" "}
                    {sm.content.slice(0, 80) ||
                      (sm.fallbackTemplateName
                        ? `Template: ${sm.fallbackTemplateName}`
                        : "[anexo]")}
                  </span>
                  <button
                    type="button"
                    onClick={() => cancelScheduledMutation.mutate(sm.id)}
                    disabled={cancelScheduledMutation.isPending}
                    className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-primary-soft px-2.5 py-0.5 text-[11px] font-semibold text-info transition-colors hover:bg-[var(--color-info)]/20 disabled:opacity-50"
                  >
                    <X className="size-3" /> Cancelar
                  </button>
                </div>
              );
            })}
            {pendingScheduled.length > 2 && (
              <p className="text-[11px] font-medium text-info">
                +{pendingScheduled.length - 2} outro(s) agendamento(s)
                pendente(s)
              </p>
            )}
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="shrink-0 border-t border-border bg-card">
        {/* Mobile: px-3 (composer encosta nas bordas pra ganhar largura
            de digitação). Desktop: px-6 preserva o respiro premium. */}
        <div className={cn(rowMax, "px-3 sm:px-6")}>
          <EmojiPicker open={activePanel === "emoji"} onPick={insertEmoji} />
          <TemplatePicker
            open={activePanel === "templates"}
            onClose={() => setActivePanel("none")}
            onPick={(t) => {
              const hasFlowHint =
                Boolean(t.flowId?.trim()) ||
                Boolean(t.flowAction?.trim()) ||
                (t.buttonTypes?.includes("FLOW") ?? false);
              const requiresTemplateFlow = t.hasButtons || t.hasVariables || hasFlowHint;
              const shouldUseTemplateRoute =
                requiresTemplateFlow || (!sessionActive && !!conversationId);

              if (shouldUseTemplateRoute && conversationId) {
                setPendingTemplate({
                  name: t.name,
                  label: t.label,
                  content: t.content,
                  metaTemplateId: t.id,
                  operatorVariables: t.operatorVariables,
                });
              } else {
                setDraft(t.content);
              }
              setActivePanel("none");
              textareaRef.current?.focus();
            }}
          />

          {activePanel === "task" && (
            <div className="rounded-t-[var(--radius-xl)] border border-b-0 border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <CheckSquare className="size-4 text-success" />
                <span className="text-[14px] font-semibold text-info">
                  Nova tarefa
                </span>
                <button
                  type="button"
                  onClick={() => setActivePanel("none")}
                  className="ml-auto rounded-xl p-1 text-muted-foreground hover:text-info"
                  aria-label="Fechar"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(130px,180px)_minmax(0,1fr)]">
                <DropdownGlass
                  options={ACTIVITY_TYPES}
                  value={taskType}
                  onValueChange={(v) => setTaskType(v)}
                  triggerClassName="h-9 min-w-0 rounded-xl text-[13px]"
                />
                <Input
                  type="datetime-local"
                  value={taskScheduled}
                  onChange={(e) => setTaskScheduled(e.target.value)}
                  className="h-9 min-w-0 rounded-xl text-[13px]"
                />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="Título da tarefa..."
                  className="h-9 min-w-0 flex-1 rounded-xl text-[14px]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && taskTitle.trim())
                      taskMutation.mutate();
                  }}
                />
                <Button
                  size="sm"
                  className="lumen-ai-gradient h-9 shrink-0 rounded-xl border-0 px-5 text-white sm:w-auto"
                  disabled={!taskTitle.trim() || taskMutation.isPending}
                  onClick={() => taskMutation.mutate()}
                >
                  {taskMutation.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    "Criar"
                  )}
                </Button>
              </div>
            </div>
          )}

          {activePanel === "schedule" && (
            <div className="rounded-t-[var(--radius-xl)] border border-b-0 border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <Clock className="size-4 text-info" />
                <span className="text-[14px] font-semibold text-info">
                  Agendar mensagem
                </span>
                <button
                  type="button"
                  onClick={() => setActivePanel("none")}
                  className="ml-auto rounded-xl p-1 text-muted-foreground hover:text-info"
                  aria-label="Fechar"
                >
                  <X className="size-4" />
                </button>
              </div>

              <Textarea
                value={scheduleContent}
                onChange={(e) => setScheduleContent(e.target.value)}
                placeholder="Digite a mensagem que será enviada no horário escolhido..."
                rows={3}
                className="mb-2 w-full resize-none"
              />

              <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <Input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                  min={new Date(Date.now() - 60_000).toISOString().slice(0, 16)}
                  className="h-9 min-w-0 rounded-xl text-[13px]"
                />
                <div className="flex items-center gap-2">
                  <input
                    ref={scheduleFileInputRef}
                    type="file"
                    className="hidden"
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (!f) return;
                      if (f.size > 16 * 1024 * 1024) {
                        toast.warning("O arquivo excede o limite de 16 MB.");
                        return;
                      }
                      setScheduleFile(f);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => scheduleFileInputRef.current?.click()}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-input bg-background px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Paperclip className="size-3.5" />
                    {scheduleFile ? "Trocar anexo" : "Anexo"}
                  </button>
                </div>
              </div>

              {scheduleFile && (
                <div className="mb-2 flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2 text-[12px]">
                  <Paperclip className="size-3.5 text-muted-foreground" />
                  <span className="truncate font-medium text-foreground">
                    {scheduleFile.name}
                  </span>
                  <span className="text-muted-foreground">
                    ({Math.round(scheduleFile.size / 1024)} KB)
                  </span>
                  <button
                    type="button"
                    onClick={() => setScheduleFile(null)}
                    className="ml-auto rounded-xl p-1 text-muted-foreground hover:text-foreground"
                    aria-label="Remover anexo"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              )}

              {!isBaileysChannel && (
                <div className="mb-3 rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-[12px]">
                  <label className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={scheduleUseFallback}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setScheduleUseFallback(on);
                        if (!on) setScheduleTemplate(null);
                      }}
                      className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-input accent-accent"
                    />
                    <div className="flex-1">
                      <p className="font-semibold text-foreground">
                        Usar template fallback se a sessão de 24h expirar
                      </p>
                      <p className="mt-0.5 text-muted-foreground">
                        {scheduleUseFallback
                          ? "Se a sessão de 24h estiver expirada no horário do envio, o template será usado em vez do texto livre."
                          : "Se a sessão expirar antes do envio, a mensagem será cancelada e você será notificado."}
                      </p>
                    </div>
                  </label>

                  {scheduleUseFallback && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-6">
                      {scheduleTemplate ? (
                        <>
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-background px-2.5 py-1 text-[11px] font-semibold text-foreground ring-1 ring-border">
                            <LayoutTemplate className="size-3" />
                            {scheduleTemplate.label || scheduleTemplate.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowScheduleTemplatePicker(true)}
                            className="text-[11px] font-medium text-accent underline underline-offset-2 hover:text-accent/80"
                          >
                            Trocar
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowScheduleTemplatePicker(true)}
                          className="inline-flex items-center gap-1.5 rounded-full bg-background px-3 py-1 text-[11px] font-semibold text-foreground ring-1 ring-border transition-colors hover:bg-muted"
                        >
                          <LayoutTemplate className="size-3" />
                          Escolher template fallback
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              <p className="mb-3 text-[11px] text-muted-foreground">
                O agendamento será cancelado automaticamente se o cliente
                responder ou se algum agente enviar mensagem antes do horário.
              </p>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActivePanel("none")}
                  className="h-9 rounded-xl px-4 text-[13px] font-medium text-muted-foreground hover:text-foreground"
                >
                  Cancelar
                </button>
                <Button
                  size="sm"
                  className="lumen-ai-gradient h-9 shrink-0 rounded-xl border-0 px-5 text-white"
                  disabled={
                    scheduleMutation.isPending ||
                    (!scheduleContent.trim() && !scheduleFile) ||
                    !scheduleAt.trim() ||
                    // Se o operador marcou "usar fallback" em canal Meta,
                    // exige um template selecionado antes de permitir agendar.
                    (!isBaileysChannel &&
                      scheduleUseFallback &&
                      !scheduleTemplate)
                  }
                  onClick={() => scheduleMutation.mutate()}
                >
                  {scheduleMutation.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    "Agendar"
                  )}
                </Button>
              </div>
            </div>
          )}

          {showScheduleTemplatePicker && (
            <TemplatePicker
              open
              onClose={() => setShowScheduleTemplatePicker(false)}
              onPick={(t) => {
                setScheduleTemplate({
                  name: t.name,
                  label: t.label,
                  content: t.content,
                });
                setShowScheduleTemplatePicker(false);
              }}
            />
          )}
        </div>

        {replyTo && (
          <div
            className={cn(rowMax, compactChrome ? "px-2 pt-1.5" : "px-6 pt-2")}
          >
            <div className="flex items-start gap-2 rounded-t-[var(--radius-xl)] bg-[var(--chat-bg)] px-4 py-2.5">
              <div className="min-w-0 flex-1 border-l-[3px] border-accent pl-3">
                {replyTo.senderName && (
                  <p className="text-[11px] font-semibold text-accent">
                    {replyTo.senderName}
                  </p>
                )}
                <p className="line-clamp-2 text-[13px] text-muted-foreground">
                  {replyTo.content}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="shrink-0 rounded-xl p-1 text-muted-foreground lumen-transition hover:bg-muted hover:text-info"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        )}
        {pendingFile && (
          <div
            className={cn(rowMax, compactChrome ? "px-2 pt-1.5" : "px-6 pt-2")}
          >
            <div className="flex items-center gap-2 rounded-[var(--radius-xl)] bg-[var(--chat-bg)] px-4 py-2.5">
              <Paperclip className="size-4 text-muted-foreground" />
              <span className="max-w-[200px] truncate text-[14px] font-medium text-foreground">
                {pendingFile.name}
              </span>
              <span className="text-[12px] text-muted-foreground">
                ({(pendingFile.size / 1024).toFixed(0)} KB)
              </span>
              <button
                type="button"
                onClick={() => setPendingFile(null)}
                className="ml-auto rounded-xl p-1 text-muted-foreground lumen-transition hover:bg-muted hover:text-info"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        )}
        {pendingTemplateMedia.length > 0 && (
          <div
            className={cn(rowMax, compactChrome ? "px-2 pt-1.5" : "px-6 pt-2")}
          >
            <div className="flex items-center gap-2 rounded-[var(--radius-xl)] border border-border bg-card px-4 py-2.5">
              <Paperclip className="size-4 text-muted-foreground" />
              <span className="max-w-[240px] truncate text-[14px] font-medium text-foreground">
                {pendingTemplateMedia.length === 1
                  ? pendingTemplateMedia[0].name || "Mídia do modelo"
                  : `${pendingTemplateMedia.length} arquivos do modelo`}
              </span>
              <button
                type="button"
                onClick={() => setPendingTemplateMedia([])}
                className="ml-auto rounded-xl p-1 text-muted-foreground lumen-transition hover:bg-muted hover:text-info"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        )}
        {pendingTemplate && (
          <div
            className={cn(rowMax, compactChrome ? "px-2 pt-2" : "px-6 pt-3")}
          >
            <div className="rounded-[var(--radius-xl)] border border-success/30 bg-success/5 p-4">
              <div className="flex items-start gap-3">
                <LayoutTemplate className="mt-0.5 size-5 shrink-0 text-success" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-foreground">
                    {pendingTemplate.label || pendingTemplate.name}
                  </p>
                  {pendingTemplate.label && (
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {pendingTemplate.name}
                    </p>
                  )}
                  {/* max-h evita que o preview cresca indefinidamente e
                      empurre as mensagens pra fora da viewport (em
                      zoom 100% com template longo a area de chat
                      sumia). 180px ~= 9-10 linhas; o resto rola.
                      O texto exibido eh o conteudo COM as variaveis
                      ja substituidas pelos valores digitados abaixo. */}
                  <p className="mt-1.5 max-h-[180px] overflow-y-auto whitespace-pre-wrap text-[13px] text-surface-foreground leading-relaxed">
                    {renderedTemplatePreview || pendingTemplate.content}
                  </p>
                  {templatePlaceholders.length > 0 && (
                    <div className="mt-3 space-y-2 rounded-[var(--radius-lg)] border border-success/20 bg-white p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Preencha as variaveis do template
                      </p>
                      {templatePlaceholders.map((k) => {
                        const meta = pendingTemplate.operatorVariables?.find((v) => v.key === k);
                        const label = meta?.label?.trim() || `Variável {{${k}}}`;
                        return (
                        <label key={k} className="flex flex-col gap-1">
                          <span className="text-[11px] font-medium text-muted-foreground">
                            {label}{" "}
                            <code className="font-mono text-[11px] text-foreground">{`{{${k}}}`}</code>
                          </span>
                          <input
                            type="text"
                            value={templateVars[k] ?? ""}
                            onChange={(e) =>
                              setTemplateVars((prev) => ({
                                ...prev,
                                [k]: e.target.value,
                              }))
                            }
                            placeholder={meta?.example ? `Ex.: ${meta.example}` : `Valor para {{${k}}}`}
                            className="h-8 rounded-lg border border-border/60 bg-background px-2.5 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-success/40"
                          />
                        </label>
                        );
                      })}
                    </div>
                  )}
                  <div className="mt-3 space-y-2 rounded-[var(--radius-lg)] border border-border/40 bg-[var(--glass-bg-base)] p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Flow (opcional)
                    </p>
                    <p className="text-[10px] leading-snug text-muted-foreground">
                      Para templates com botão Flow: deixe em branco para o CRM
                      gerar um{" "}
                      <code className="font-mono text-[10px]">flow_token</code>{" "}
                      (UUID) por envio, ou informe JSON de dados iniciais
                      conforme a{" "}
                      <a
                        className="text-primary underline-offset-2 hover:underline"
                        href="https://developers.facebook.com/docs/whatsapp/flows"
                        target="_blank"
                        rel="noreferrer"
                      >
                        documentação Meta (Flows)
                      </a>
                      .
                    </p>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-medium text-muted-foreground">
                        Token do Flow (opcional)
                      </span>
                      <input
                        type="text"
                        value={flowTokenDraft}
                        onChange={(e) => {
                          setFlowTokenDraft(e.target.value);
                          setFlowJsonError(null);
                        }}
                        placeholder="Vazio = UUID gerado automaticamente no envio"
                        className="h-8 rounded-lg border border-border/60 bg-background px-2.5 font-mono text-[12px] outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-success/40"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-medium text-muted-foreground">
                        JSON inicial do Flow
                      </span>
                      <Textarea
                        value={flowActionJson}
                        onChange={(e) => {
                          setFlowActionJson(e.target.value);
                          setFlowJsonError(null);
                        }}
                        placeholder='Ex.: {"screen":"NOME_DA_TELA","data":{"campo":"valor"}}'
                        rows={3}
                        className="resize-y font-mono text-[11px]"
                      />
                    </label>
                    {flowJsonError ? (
                      <p className="text-[11px] text-destructive">
                        {flowJsonError}
                      </p>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingTemplate(null)}
                  className="shrink-0 rounded-xl p-1 text-muted-foreground lumen-transition hover:bg-muted hover:text-info"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="mt-3 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl px-4 text-[13px]"
                  onClick={() => setPendingTemplate(null)}
                >
                  Cancelar
                </Button>
                {/* Wrapper condicional:
                    - faltam variaveis -> envelopa em TooltipHost com hint
                    - tudo OK -> renderiza o button "puro" (sem balao
                      vazio). Antes era `title=` nativo (violava
                      `ui-fidelity §6.1`, gerava balao branco-com-laranja
                      do SO competindo com identidade). */}
                {(() => {
                  const SendBtn = (
                    <button
                      type="button"
                      disabled={
                        templateSendMutation.isPending || !allTemplateVarsFilled
                      }
                      aria-label={
                        !allTemplateVarsFilled
                          ? "Enviar template (preencha todas as variáveis primeiro)"
                          : "Enviar template"
                      }
                      onClick={() => {
                        if (!conversationId) return;
                        let flowActionData: Record<string, unknown> | null =
                          null;
                        const trimmedJson = flowActionJson.trim();
                        if (trimmedJson) {
                          try {
                            const parsed: unknown = JSON.parse(trimmedJson);
                            if (
                              parsed === null ||
                              typeof parsed !== "object" ||
                              Array.isArray(parsed)
                            ) {
                              setFlowJsonError(
                                "O JSON deve ser um objeto {...}, não lista ou primitivo.",
                              );
                              return;
                            }
                            flowActionData = parsed as Record<string, unknown>;
                          } catch {
                            setFlowJsonError(
                              "JSON inválido. Corrija ou deixe em branco.",
                            );
                            return;
                          }
                        }
                        setFlowJsonError(null);
                        // Monta payload `components` no formato esperado
                        // pelo Meta Cloud API quando o template tem
                        // placeholders `{{N}}`. Sem isso o Graph rejeita
                        // com code=132000 ("number of localizable_params
                        // (0) does not match the expected number of params
                        // (N)"). Para templates sem variaveis, omite o
                        // campo `components` (envio simples).
                        const components = templatePlaceholders.length
                          ? [
                              {
                                type: "body",
                                parameters: templatePlaceholders.map((k) => ({
                                  type: "text",
                                  text: templateVars[k] ?? "",
                                })),
                              },
                            ]
                          : undefined;
                        const flowToken = flowTokenDraft.trim() || null;
                        templateSendMutation.mutate(
                          {
                            templateName: pendingTemplate.name,
                            bodyPreview:
                              renderedTemplatePreview ||
                              pendingTemplate.content,
                            languageCode: pendingTemplate.language ?? "pt_BR",
                            components,
                            flowToken,
                            flowActionData,
                            templateGraphId:
                              pendingTemplate.metaTemplateId ?? null,
                          },
                          { onSuccess: () => setPendingTemplate(null) },
                        );
                      }}
                      className="flex items-center gap-2 rounded-xl lumen-ai-gradient px-5 py-2 text-[13px] font-medium text-white shadow-[0_4px_12px_rgba(123,97,255,0.25)] lumen-transition hover:scale-105 disabled:opacity-50"
                    >
                      {templateSendMutation.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Send className="size-4" />
                      )}
                      Enviar Template
                    </button>
                  );
                  return !allTemplateVarsFilled ? (
                    <TooltipHost
                      label="Preencha todas as variáveis do template"
                      side="top"
                    >
                      {SendBtn}
                    </TooltipHost>
                  ) : (
                    SendBtn
                  );
                })()}
              </div>
            </div>
          </div>
        )}
        {noteMode && !compactChrome ? (
          <div className={cn(rowMax, "flex items-center gap-2 px-6 pt-2")}>
            <Lock className="size-3 text-muted-foreground" />
            <p
              className="text-[11px] font-semibold uppercase text-muted-foreground"
              style={{ letterSpacing: "0.5px" }}
            >
              Nota interna — visível apenas para a equipe
            </p>
          </div>
        ) : null}

        {/* Composer — padrão completo (inbox) vs uma linha (DealWorkspace / compactChrome). */}
        {compactChrome ? (
          <footer className="relative shrink-0 overflow-visible border-t border-[var(--glass-border)] bg-[var(--glass-bg-strong)] pb-[calc(env(safe-area-inset-bottom,0px)+2px)] backdrop-blur-xl dark:border-[var(--glass-border-subtle)] dark:bg-[var(--glass-bg-subtle)]">
            <SlashCommandMenu
              state={slash.state}
              onSelectItem={slash.onSelectItem}
              onHover={slash.setActiveIndex}
              className="absolute bottom-full left-2 mb-2"
            />
            {noteMode ? (
              <div
                className={cn(
                  rowMax,
                  "flex h-6 items-center gap-2 border-b border-[var(--glass-border)] bg-warning-soft/40 px-2 backdrop-blur",
                )}
              >
                <Lock className="size-3 shrink-0 text-[var(--color-ink-soft)]" />
                <span className="font-display text-[10px] font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
                  Nota interna
                </span>
              </div>
            ) : null}
            <div
              className={cn(
                rowMax,
                "flex items-end gap-1 px-2 py-1.5",
                compactChrome && composeDisabled
                  ? "min-h-[32px]"
                  : composeDisabled
                    ? "min-h-[40px]"
                    : "min-h-[48px]",
              )}
            >
              <AttachPopover
                onFile={() => fileInputRef.current?.click()}
                onTemplate={() => togglePanel("templates")}
                onTask={() => togglePanel("task")}
                onSchedule={() => togglePanel("schedule")}
                onNote={() => setNoteMode((v) => !v)}
                noteMode={noteMode}
                isBaileysChannel={isBaileysChannel}
                signatureEnabled={signatureEnabled}
                onToggleSignature={() =>
                  persistSignatureEnabled(!signatureEnabled)
                }
                onEditSignature={() => {
                  setSignatureDraft(signature);
                  setSignatureModalOpen(true);
                }}
                isResolved={isResolved}
                statusPending={statusMutation.isPending}
                onToggleResolve={handleToggleResolve}
              />
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                onChange={onFileSelected}
              />
              <button
                type="button"
                onClick={() => togglePanel("emoji")}
                className={cn(
                  "inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-transparent text-[var(--color-ink-soft)] transition-all hover:border-[var(--glass-border)] hover:bg-[var(--glass-bg-overlay)] hover:text-foreground",
                  activePanel === "emoji" &&
                    "border-primary/30 bg-[var(--color-primary-soft)] text-primary",
                )}
                aria-label="Emojis"
              >
                <Smile className="size-5" strokeWidth={2} />
              </button>
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (e.target.value.trim()) sendTypingIndicator();
                }}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                placeholder={
                  pendingFile
                    ? "Legenda (opcional)…"
                    : noteMode
                      ? "Nota interna…"
                      : composeDisabled
                        ? "Sessão expirada. Envie um template…"
                        : isMobile
                          ? "Mensagem ou /"
                          : "Mensagem ou / para respostas rápidas"
                }
                rows={1}
                disabled={composeDisabled}
                className={cn(
                  "flex-1 resize-none bg-transparent leading-snug text-foreground",
                  dt.chat.fontSize.compact,
                  "placeholder:text-[var(--color-ink-muted)]",
                  "focus:outline-none",
                  "max-h-[120px] min-h-[24px] self-center",
                  noteMode &&
                    "italic text-foreground placeholder:text-ink-muted",
                  composeDisabled &&
                    "cursor-not-allowed text-[var(--color-ink-muted)]",
                )}
                style={{
                  overflowY: draft.split("\n").length > 4 ? "auto" : "hidden",
                }}
              />
              <div className="relative flex min-h-9 shrink-0 items-center justify-end">
                <div
                  className={cn(
                    "lumen-transition flex items-center justify-center",
                    draft.trim() || pendingFile || pendingTemplateMedia.length > 0
                      ? "relative opacity-100"
                      : "pointer-events-none absolute inset-0 opacity-0",
                  )}
                >
                  <button
                    type="button"
                    onClick={pendingFile ? sendFile : onSend}
                    disabled={
                      isBusy ||
                      (!pendingFile &&
                        pendingTemplateMedia.length === 0 &&
                        !draft.trim())
                    }
                    className="inline-flex size-9 items-center justify-center rounded-full text-white shadow-[0_4px_14px_rgba(91,111,245,0.35)] transition-all hover:-translate-y-px hover:shadow-[var(--shadow-indigo-glow)] active:scale-95 disabled:opacity-50"
                    style={{
                      background:
                        "linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%)",
                    }}
                    aria-label="Enviar"
                  >
                    {isBusy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" strokeWidth={2.25} />
                    )}
                  </button>
                </div>
                <div
                  className={cn(
                    "lumen-transition flex min-w-0 items-center justify-end",
                    draft.trim() || pendingFile || pendingTemplateMedia.length > 0
                      ? "pointer-events-none absolute inset-0 opacity-0"
                      : "relative opacity-100",
                  )}
                >
                  <AudioRecorder
                    onSend={sendAudio}
                    disabled={isBusy}
                    className="!flex h-9 min-h-9 w-auto min-w-9 shrink-0 items-center justify-center !rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] !p-0 text-[var(--color-ink-soft)] backdrop-blur shadow-[var(--glass-shadow-sm)] transition-all hover:bg-[var(--glass-bg-overlay)] hover:text-foreground [&_svg]:!size-4"
                  />
                </div>
              </div>
            </div>
          </footer>
        ) : (
          <footer className="relative border-t border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-3 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] backdrop-blur-xl sm:p-6 dark:border-[var(--glass-border-subtle)] dark:bg-[var(--glass-bg-subtle)]">
            <SlashCommandMenu
              state={slash.state}
              onSelectItem={slash.onSelectItem}
              onHover={slash.setActiveIndex}
              className="absolute bottom-full left-3 mb-2 sm:left-6"
            />
            <div className="rounded-[var(--radius-card)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] shadow-[var(--glass-shadow-sm)] backdrop-blur dark:border-[var(--glass-border-subtle)] dark:bg-[var(--glass-bg-subtle)]">
              <div className="flex items-center border-b border-[var(--glass-border)] px-5 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <TooltipHost
                    label={
                      signatureEnabled
                        ? "Desligar assinatura"
                        : "Ligar assinatura"
                    }
                    side="top"
                  >
                    <button
                      type="button"
                      role="switch"
                      aria-checked={signatureEnabled}
                      aria-label={
                        signatureEnabled
                          ? "Desligar assinatura"
                          : "Ligar assinatura"
                      }
                      onClick={() => persistSignatureEnabled(!signatureEnabled)}
                      className={cn(
                        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
                        signatureEnabled ? "bg-primary" : "bg-ink-subtle/40",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block size-4 transform rounded-full bg-white shadow transition-transform",
                          signatureEnabled
                            ? "translate-x-[18px]"
                            : "translate-x-[2px]",
                        )}
                      />
                    </button>
                  </TooltipHost>
                  <span
                    className={cn(
                      "min-w-0 max-w-[160px] truncate text-[14px] font-bold transition-colors sm:max-w-none",
                      signatureEnabled
                        ? "text-foreground"
                        : "text-[var(--color-ink-muted)] line-through",
                    )}
                  >
                    {effectiveSignature}
                  </span>
                  <TooltipHost label="Customizar assinatura" side="top">
                    <button
                      type="button"
                      onClick={() => {
                        setSignatureDraft(signature);
                        setSignatureModalOpen(true);
                      }}
                      className="rounded-md p-1 text-[var(--color-ink-muted)] transition-colors hover:bg-muted hover:text-[var(--color-ink-soft)]"
                      aria-label="Customizar assinatura"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  </TooltipHost>
                </div>
              </div>

              <div
                className={cn(
                  rowMax,
                  "flex min-h-[56px] items-end gap-2 p-3 sm:gap-3 sm:p-4",
                )}
              >
                <AttachPopover
                  onFile={() => fileInputRef.current?.click()}
                  onTemplate={() => togglePanel("templates")}
                  onTask={() => togglePanel("task")}
                  onSchedule={() => togglePanel("schedule")}
                  onNote={() => setNoteMode((v) => !v)}
                  noteMode={noteMode}
                  isBaileysChannel={isBaileysChannel}
                  signatureEnabled={signatureEnabled}
                  onToggleSignature={() =>
                    persistSignatureEnabled(!signatureEnabled)
                  }
                  onEditSignature={() => {
                    setSignatureDraft(signature);
                    setSignatureModalOpen(true);
                  }}
                  isResolved={isResolved}
                  statusPending={statusMutation.isPending}
                  onToggleResolve={handleToggleResolve}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                  onChange={onFileSelected}
                />
                <button
                  type="button"
                  onClick={() => togglePanel("emoji")}
                  className={cn(
                    "inline-flex size-10 shrink-0 items-center justify-center rounded-full text-[var(--color-ink-soft)] hover:bg-[var(--color-bg-subtle)]",
                    activePanel === "emoji" && "bg-muted text-foreground",
                  )}
                  aria-label="Emojis"
                >
                  <Smile className="size-5" strokeWidth={2} />
                </button>
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    if (e.target.value.trim()) sendTypingIndicator();
                  }}
                  onKeyDown={onKeyDown}
                  onPaste={onPaste}
                  placeholder={
                    pendingFile
                      ? "Legenda (opcional)…"
                      : noteMode
                        ? "Nota interna…"
                        : composeDisabled
                          ? "Sessão expirada. Envie um template…"
                          : isMobile
                            ? "Mensagem ou /"
                            : "Mensagem ou / para respostas rápidas"
                  }
                  rows={1}
                  disabled={composeDisabled}
                  className={cn(
                    "min-h-[28px] max-h-[200px] min-w-0 flex-1 resize-none bg-transparent text-[15px] leading-relaxed text-foreground dark:text-white outline-none placeholder:text-[var(--color-ink-muted)] focus:outline-none",
                    noteMode &&
                      "italic text-foreground placeholder:text-ink-muted",
                    composeDisabled &&
                      "cursor-not-allowed text-[var(--color-ink-muted)]",
                  )}
                  style={{
                    overflowY: draft.split("\n").length > 4 ? "auto" : "hidden",
                  }}
                />
                <div className="relative flex min-h-10 shrink-0 items-center justify-end">
                  <div
                    className={cn(
                      "lumen-transition flex items-center justify-center",
                      draft.trim() || pendingFile || pendingTemplateMedia.length > 0
                        ? "relative opacity-100"
                        : "pointer-events-none absolute inset-0 opacity-0",
                    )}
                  >
                    <button
                      type="button"
                      onClick={pendingFile ? sendFile : onSend}
                      disabled={
                      isBusy ||
                      (!pendingFile &&
                        pendingTemplateMedia.length === 0 &&
                        !draft.trim())
                    }
                      className="inline-flex size-10 items-center justify-center rounded-full text-white shadow-[0_4px_14px_rgba(91,111,245,0.35)] transition-all hover:-translate-y-px hover:shadow-[var(--shadow-indigo-glow)] active:scale-95 disabled:opacity-50"
                      style={{
                        background:
                          "linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%)",
                      }}
                      aria-label="Enviar"
                    >
                      {isBusy ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Send className="size-4" strokeWidth={2.25} />
                      )}
                    </button>
                  </div>
                  <div
                    className={cn(
                      "lumen-transition flex min-w-0 items-center justify-end",
                      draft.trim() || pendingFile || pendingTemplateMedia.length > 0
                        ? "pointer-events-none absolute inset-0 opacity-0"
                        : "relative opacity-100",
                    )}
                  >
                    <AudioRecorder
                      onSend={sendAudio}
                      disabled={isBusy}
                      className="!flex h-10 min-h-10 w-auto min-w-10 shrink-0 items-center justify-center !rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] !p-0 text-[var(--color-ink-soft)] backdrop-blur shadow-[var(--glass-shadow-sm)] transition-all hover:bg-[var(--glass-bg-overlay)] hover:text-foreground [&_svg]:!size-5"
                    />
                  </div>
                </div>
              </div>
            </div>
          </footer>
        )}
      </div>

      <Dialog
        open={!!forwardingMessage}
        onOpenChange={(o) => {
          if (!o) {
            setForwardingMessage(null);
            setForwardSearch("");
          }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Encaminhar mensagem</DialogTitle>
            <DialogDescription>
              O texto será enviado por WhatsApp para o contato da conversa
              escolhida. Mídias aparecem apenas como aviso no texto.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={forwardSearch}
            onChange={(e) => setForwardSearch(e.target.value)}
            placeholder="Buscar por nome ou telefone…"
            className="rounded-xl"
            autoFocus
          />
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-border p-1">
            {forwardPickLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : forwardPickFiltered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma conversa encontrada.
              </p>
            ) : (
              forwardPickFiltered.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  disabled={forwardMutation.isPending}
                  onClick={() => {
                    if (!forwardingMessage) return;
                    forwardMutation.mutate({
                      targetId: row.id,
                      messageRef: String(forwardingMessage.id),
                    });
                  }}
                  className="flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2.5 text-left text-sm lumen-transition hover:bg-[var(--chat-bg)] disabled:opacity-50"
                >
                  <span className="font-medium text-foreground">
                    {row.contact.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {row.contact.phone ?? "—"} · {row.inboxName || row.channel}
                  </span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Edição de assinatura */}
      <ResolveConfirmDialog
        open={resolveConfirmOpen}
        onOpenChange={setResolveConfirmOpen}
        submitting={statusMutation.isPending}
        onConfirm={(skipAutomations) =>
          statusMutation.mutate({ action: "resolve", skipAutomations })
        }
      />
      <Dialog open={signatureModalOpen} onOpenChange={setSignatureModalOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="text-[18px] font-bold text-foreground">
              Edição de assinatura
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              autoFocus
              value={signatureDraft}
              onChange={(e) => setSignatureDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  persistSignatureValue(signatureDraft.trim());
                  setSignatureModalOpen(false);
                }
              }}
              placeholder={agentName}
              className="h-11 rounded-full border-border px-4 text-[14px]"
            />
            <DialogDescription className="text-[12px] text-ink-muted">
              Mantenha vazio se quiser utilizar o nome salvo no seu perfil como
              assinatura.
            </DialogDescription>
          </div>
          <div className="mt-2 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSignatureModalOpen(false)}
              className="gap-1.5 rounded-full px-4"
            >
              <X className="size-4" />
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => {
                persistSignatureValue(signatureDraft.trim());
                setSignatureModalOpen(false);
              }}
              className="gap-1.5 rounded-full bg-primary px-4 text-white shadow-lg shadow-[var(--shadow-indigo-glow)] hover:bg-primary/90"
            >
              <Save className="size-4" />
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TemplateBadge({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const meta = parseTemplateMeta(content);
  const cat = meta?.category?.toLowerCase() ?? null;
  const isMkt = cat === "marketing";
  const isUtility = cat === "utility";
  const isAuth = cat?.includes("autenticação") || cat === "authentication";
  const Icon = isMkt ? Megaphone : isUtility ? Wrench : LayoutTemplate;
  const label = isMkt
    ? "Marketing"
    : isUtility
      ? "Utility"
      : isAuth
        ? "Autenticação"
        : "Template";
  // Variantes claras + dark explícito. Antes o caso "Template" (default)
  // usava `--color-primary-soft` + `text-primary` — ambos azul-violeta,
  // sem override em dark mode. Sobre bolha de chat azul-escura ficava
  // praticamente ilegível. Marketing/Utility também só tinham variante
  // clara, então em dark mode amber-50/sky-50 sumiam.
  const colors = isMkt
    ? "border-warning/40/60 bg-warning-soft text-warning dark:border-warning/40/50 dark:bg-warning/20 dark:text-[var(--color-warning)]"
    : isUtility
      ? "border-primary/40/60 bg-primary-soft text-info dark:border-primary/40/50 dark:bg-[var(--color-info)]/20 dark:text-[var(--color-info)]"
      : "border-primary/40/60 bg-primary-soft text-primary-dark dark:border-primary/40/50 dark:bg-[var(--brand-secondary)]/25 dark:text-[var(--brand-secondary)]";

  return (
    <div className={cn("group/tpl relative mb-1.5", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide shadow-[var(--glass-shadow-sm)] backdrop-blur",
          colors,
        )}
      >
        <Icon className="size-3" />
        {label}
      </span>
      <div className="pointer-events-none absolute bottom-full left-0 z-30 mb-1 hidden w-max max-w-[260px] rounded-lg border border-border bg-card px-3 py-2 text-[11px] leading-snug text-surface-foreground shadow-lg group-hover/tpl:block">
        <p className="font-semibold text-foreground">{label}</p>
        {meta?.name && (
          <p className="mt-0.5 text-muted-foreground">
            Nome: <span className="font-mono">{meta.name}</span>
          </p>
        )}
        <p className="mt-1 text-[10px] text-muted-foreground">
          {isMkt
            ? "Custo mais alto — mensagem promocional"
            : isUtility
              ? "Custo moderado — mensagem transacional"
              : isAuth
                ? "Custo baixo — autenticação"
                : "Modelo de mensagem WABA"}
        </p>
      </div>
    </div>
  );
}

function chatTime(date: Date | string): string {
  return new Date(date).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Formato detalhado para tooltip: "sex. 17/04/2026 13:00:09". */
function chatFullTimestamp(date: Date | string): string {
  const d = new Date(date);
  const weekday = d
    .toLocaleDateString("pt-BR", { weekday: "short" })
    .replace(/\.$/, ".");
  const dateStr = d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timeStr = d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return `${weekday} ${dateStr} ${timeStr}`;
}

/** Offset UTC do browser no formato "UTC-03:00". */
function chatTimezoneOffset(date: Date | string): string {
  const d = new Date(date);
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `UTC${sign}${hh}:${mm}`;
}

/** Nome IANA do fuso (America/Sao_Paulo). */
function chatTimezoneName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

/** Tempo relativo em pt-BR: "32 minutos, 12 segundos atrás" / "agora mesmo". */
function chatRelativeTime(date: Date | string): string {
  const d = new Date(date);
  const diffSec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (diffSec < 5) return "agora mesmo";
  if (diffSec < 60)
    return `${diffSec} segundo${diffSec === 1 ? "" : "s"} atrás`;
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  if (mins < 60) {
    const mStr = `${mins} minuto${mins === 1 ? "" : "s"}`;
    const sStr = secs > 0 ? `, ${secs} segundo${secs === 1 ? "" : "s"}` : "";
    return `${mStr}${sStr} atrás`;
  }
  const hrs = Math.floor(mins / 60);
  const rMins = mins % 60;
  if (hrs < 24) {
    const hStr = `${hrs} hora${hrs === 1 ? "" : "s"}`;
    const mStr = rMins > 0 ? `, ${rMins} minuto${rMins === 1 ? "" : "s"}` : "";
    return `${hStr}${mStr} atrás`;
  }
  const days = Math.floor(hrs / 24);
  return `${days} dia${days === 1 ? "" : "s"} atrás`;
}
function chatDateLabel(date: Date | string | null): string {
  if (!date) return "";
  const d = new Date(date);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Hoje";
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Ontem";
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((start(now) - start(d)) / 86_400_000);
  if (diffDays > 1 && diffDays < 7) {
    return d.toLocaleDateString("pt-BR", { weekday: "long" });
  }
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
function shouldShowDateSeparator(
  prev: InboxMessageDto | null,
  curr: InboxMessageDto,
): boolean {
  if (!prev) return true;
  if (!prev.createdAt || !curr.createdAt) return false;
  return (
    new Date(prev.createdAt).toDateString() !==
    new Date(curr.createdAt).toDateString()
  );
}

function DateSep({
  date,
  stickyLabel,
}: {
  date: string | null;
  stickyLabel: string | null;
}) {
  const label = chatDateLabel(date);
  if (!label) return null;
  return (
    <DaySeparator
      date={label}
      occluded={Boolean(stickyLabel) && label === stickyLabel}
    />
  );
}

/**
 * Linha de evento de sistema da Meta WhatsApp (ex.: cliente trocou de
 * número via `user_changed_number`). Substitui o chip amarelo cru por
 * um banner premium centralizado, com hierarquia clara (label
 * estrutural + numbers em destaque) e CTA implícito (visualmente
 * sinaliza que a ação JÁ foi tomada — telefone do contato atualizado
 * pelo webhook).
 *
 * Detecta o padrão "USER A CHANGED FROM <old> TO <new>" pra renderizar
 * a versão "rich" com os dois números formatados; outros eventos de
 * sistema (raros) caem no fallback compacto.
 */
function SystemEventRow({
  body,
  createdAt,
}: {
  body: string;
  createdAt: string | null;
}) {
  const time = createdAt ? chatTime(createdAt) : "";
  const match = body.match(
    /from\s+(\+?\d[\d\s-]{6,})\s+to\s+(\+?\d[\d\s-]{6,})/i,
  );

  if (match) {
    const oldPhone = formatPhoneBR(match[1]);
    const newPhone = formatPhoneBR(match[2]);
    return (
      <MotionDiv
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex w-full justify-center py-2"
      >
        <div className="flex max-w-[520px] flex-col items-stretch gap-2 rounded-2xl border border-warning/30/60 bg-warning-soft/55 px-4 py-3 shadow-[var(--glass-shadow-sm)] backdrop-blur-md">
          <div className="flex items-center gap-2">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-warning-soft">
              <Smartphone
                className="size-3.5 text-warning"
                strokeWidth={2.4}
              />
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-warning">
              Cliente trocou de número
            </p>
            {time && (
              <span className="ml-auto text-[10px] font-semibold tabular-nums text-warning/80">
                {time}
              </span>
            )}
          </div>
          <div className="flex items-center justify-center gap-2 px-1">
            <span className="rounded-md bg-[var(--glass-bg-base)] px-2 py-1 text-[12px] font-bold tabular-nums text-ink-muted line-through decoration-[var(--text-muted)]/60">
              {oldPhone}
            </span>
            <ArrowRight
              className="size-3.5 shrink-0 text-warning"
              strokeWidth={2.5}
            />
            <span className="rounded-md bg-white px-2 py-1 text-[12px] font-bold tabular-nums text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
              {newPhone}
            </span>
          </div>
          <p className="text-center text-[10px] font-semibold text-warning/80">
            Histórico preservado · Cadastro atualizado automaticamente
          </p>
        </div>
      </MotionDiv>
    );
  }

  // Fallback: chip discreto centralizado para outros eventos de sistema.
  return (
    <MotionDiv
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex w-full justify-center py-2"
    >
      <div className="flex max-w-[420px] items-center gap-2 rounded-full border border-warning/30/60 bg-warning-soft/55 px-3 py-1.5 shadow-[var(--glass-shadow-sm)] backdrop-blur-md">
        <AlertCircle
          className="size-3.5 shrink-0 text-warning"
          strokeWidth={2.4}
        />
        <p className="text-[11px] font-semibold text-warning">{body}</p>
        {time && (
          <span className="text-[10px] tabular-nums text-warning/80">
            {time}
          </span>
        )}
      </div>
    </MotionDiv>
  );
}

/**
 * Formata um WAID (ex.: "5511982063029") em "+55 11 98206-3029" pra
 * leitura humana. Aceita números com ou sem `+`, com máscara/sem.
 * Fallback: retorna o input com `+` na frente se o tamanho for fora
 * do padrão BR (10 ou 11 dígitos pós-DDI).
 */
function formatPhoneBR(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) {
    const ddd = digits.slice(2, 4);
    const a = digits.slice(4, 9);
    const b = digits.slice(9, 13);
    return `+55 ${ddd} ${a}-${b}`;
  }
  if (digits.length === 12 && digits.startsWith("55")) {
    const ddd = digits.slice(2, 4);
    const a = digits.slice(4, 8);
    const b = digits.slice(8, 12);
    return `+55 ${ddd} ${a}-${b}`;
  }
  return digits ? `+${digits}` : raw;
}

/**
 * Activity Item minimalista para eventos de chamada (WhatsApp Calling).
 * Substitui a bolha âmbar verbosa por uma linha compacta estilo Linear/Stripe:
 * ícone + direção + duração + horário. Se houver gravação, mostra player embutido.
 */
function CallActivityItem({ message }: { message: InboxMessageDto }) {
  const [expanded, setExpanded] = React.useState(false);
  const content = String(message.content ?? "").trim();
  const mt = String(message.messageType ?? "").toLowerCase();
  const isRecording = mt === "whatsapp_call_recording";
  const isSip = mt === "sip_call";
  const hasRecording = isRecording && !!message.mediaUrl;

  const lower = content.toLowerCase();
  const senderName = String(message.senderName ?? "").trim();
  // `senderName` é a fonte de verdade pra direção quando `message.direction`
  // vem `"system"` (mensagens antigas pré-fix do webhook). O serviço grava:
  //   • outbound (agente)  → "WhatsApp · <nome do agente>"
  //   • inbound (cliente)  → "WhatsApp"
  // Esse padrão é determinístico (criado em `meta-whatsapp-calls-webhook.ts`)
  // e sobrevive mesmo quando a string `content` foi simplificada.
  const senderSuggestsOutgoing = /^WhatsApp\s+·\s+\S/i.test(senderName);
  const senderSuggestsIncoming = senderName === "WhatsApp";
  // Heurística adicional pelo conteúdo (fallback p/ histórico legado:
  // strings antigas tinham `· agente: X` antes de 2026-04-18).
  const contentSuggestsIncoming =
    lower.includes("entrada") || lower.includes("recebida pelo whatsapp");
  const contentSuggestsOutgoing =
    lower.includes("saída") ||
    lower.includes("saida") ||
    lower.includes("realizada pelo whatsapp") ||
    lower.includes("agente:");
  const isOutgoing =
    message.direction === "out" ||
    (message.direction !== "in" &&
      (senderSuggestsOutgoing || contentSuggestsOutgoing));
  const isIncoming =
    message.direction === "in" ||
    (message.direction !== "out" &&
      !isOutgoing &&
      (senderSuggestsIncoming || contentSuggestsIncoming));
  const isTerminate = lower.includes("fim") || lower.includes("encerrada");
  const isFailed =
    lower.includes("falhou") ||
    /n[ãa]o atendida/i.test(content) ||
    /n[ãa]o completada/i.test(content);

  // Nome do agente exibido como linha discreta abaixo do título quando
  // outbound. Extrai do `senderName` ("WhatsApp · Marcelo Pinheiro" →
  // "Marcelo Pinheiro"). Cobre tanto `whatsapp_call` quanto a versão
  // longa do `whatsapp_call_recording` (sender = "WhatsApp · chamada · Nome").
  const agentLabel = isOutgoing
    ? senderName.replace(/^WhatsApp\s+·\s+(?:chamada\s+·\s+)?/i, "").trim()
    : "";

  const Icon = hasRecording
    ? Volume2
    : isFailed
      ? PhoneOff
      : isIncoming
        ? PhoneIncoming
        : isOutgoing
          ? PhoneOutgoing
          : Phone;

  const durationMatch = content.match(
    /(\d+min(?:\s+\d+s)?|\d+m\d{2}s|\d+:\d{2}|\d+s)\b/,
  );
  const timeMatch = content.match(/(\d{1,2}:\d{2}(?:[–-]\d{1,2}:\d{2})?)/);
  const duration = durationMatch?.[1] ?? null;
  const timeLabel =
    timeMatch?.[1] ?? (message.createdAt ? chatTime(message.createdAt) : null);

  const sipLabel = isSip
    ? isFailed
      ? "Ligação não atendida"
      : isIncoming
        ? "Ligação recebida"
        : "Ligação realizada"
    : null;
  const label = hasRecording && !isSip
    ? "Gravação da ligação WhatsApp"
    : sipLabel
      ? sipLabel
      : isTerminate
        ? isFailed
          ? "Chamada WhatsApp não completada"
          : "Chamada WhatsApp encerrada"
        : isIncoming
          ? "Chamada recebida pelo WhatsApp"
          : isOutgoing
            ? "Chamada realizada pelo WhatsApp"
            : "Evento de chamada";

  const accent = isFailed
    ? "text-destructive"
    : isTerminate
      ? "text-[var(--color-ink-soft)]"
      : isIncoming
        ? "text-success"
        : isOutgoing
          ? "text-primary"
          : "text-[var(--color-ink-soft)]";

  // Lateralização: outbound (agente) → direita; inbound (cliente) →
  // esquerda; sem direção detectável (eventos de sistema antigos) →
  // centro como fallback. Mantém a aparência de "activity item"
  // compacto (não vira bolha cyan/branca de mensagem comum) — só muda
  // o alinhamento + cor sutil da borda pra reforçar o lado.
  const sideJustify = isOutgoing
    ? "justify-end"
    : isIncoming
      ? "justify-start"
      : "justify-center";
  const sideTint = isOutgoing
    ? "border-[var(--color-chat-sent-border)] bg-[var(--color-chat-sent)]/80"
    : isIncoming
      ? "border-black/5 bg-white"
      : "border-black/5 bg-[var(--color-bg-subtle)]/70";

  return (
    <div className={cn("flex w-full", sideJustify)}>
      <div className="w-full max-w-[360px]">
        <div
          className={cn(
            "flex items-center gap-3 rounded-2xl border px-4 py-2.5",
            sideTint,
          )}
        >
          <div
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full bg-white shadow-sm",
              accent,
            )}
          >
            <Icon className="size-4" strokeWidth={2.25} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-bold text-foreground">
              {label}
            </p>
            <div className="mt-0.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
              {duration && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-2.5" />
                  {duration}
                </span>
              )}
              {timeLabel && <span>{timeLabel}</span>}
              {agentLabel && (
                <span className="truncate normal-case tracking-normal text-ink-muted">
                  por{" "}
                  <span className="font-bold text-foreground">
                    {agentLabel}
                  </span>
                </span>
              )}
            </div>
          </div>
          {hasRecording && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="shrink-0 rounded-full bg-foreground px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-white transition-all hover:bg-ink-soft hover:shadow-sm"
            >
              {expanded ? "Fechar" : "Ouvir"}
            </button>
          )}
        </div>
        {hasRecording && expanded && message.mediaUrl && (
          <div className="mt-2">
            <AudioMessage
              url={message.mediaUrl}
              time={timeLabel ?? undefined}
              out={false}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Activity Item minimalista para resposta de consentimento de voz
 * (Meta Calling API — call_permission_reply). Clean, sem emoji cru.
 */
type ConsentVerdict = "granted_temp" | "granted_perm" | "denied" | "unknown";

/** Reconhece mensagens de consentimento geradas pelo webhook da Meta. */
function detectConsentVerdict(content: string): ConsentVerdict | null {
  if (!content) return null;
  const t = content.toLowerCase().trim();
  // Limite de tamanho — consentimento é sempre curto; evita falso-positivo em
  // mensagem longa do cliente que por acaso contenha "recusou"/"aceitou".
  if (t.length > 120) return null;

  const isAccept =
    t.includes("cliente aceitou") ||
    t.includes("permissão para ligações concedida") ||
    t.includes("permissao para ligacoes concedida");
  const isDeny =
    t.includes("cliente recusou") ||
    /\breject(ed)?\b/.test(t) ||
    /\bdecline(d)?\b/.test(t);
  const isPermanent = t.includes("permanente") || t.includes("permanent");

  if (isDeny && !isAccept) return "denied";
  if (isAccept) return isPermanent ? "granted_perm" : "granted_temp";

  // Headers genéricos que o webhook gera quando não consegue classificar.
  if (t.startsWith("📞 resposta ao pedido de ligações")) return "unknown";
  if (t.startsWith("📞 resposta ao pedido de permissão")) return "unknown";
  if (t.startsWith("📞 permissão de ligação")) return "unknown";
  return null;
}

function ConsentActivityItem({
  message,
  verdict,
}: {
  message: InboxMessageDto;
  verdict: ConsentVerdict;
}) {
  const timeLabel = message.createdAt ? chatTime(message.createdAt) : null;

  const { Icon, label, sub, accent, pillBg } = (() => {
    switch (verdict) {
      case "granted_perm":
        return {
          Icon: ShieldCheck,
          label: "Permissão concedida",
          sub: "Sem expiração · ligações permanentes",
          accent: "text-success",
          pillBg: "bg-success-soft/80 border-success/20",
        };
      case "granted_temp":
        return {
          Icon: ShieldCheck,
          label: "Permissão concedida",
          sub: "Válida por 7 dias",
          accent: "text-success",
          pillBg: "bg-success-soft/80 border-success/20",
        };
      case "denied":
        return {
          Icon: PhoneOff,
          label: "Permissão recusada",
          sub: "Meta bloqueia novo pedido por 24h",
          accent: "text-destructive",
          pillBg: "bg-destructive-soft/70 border-destructive/20",
        };
      default:
        return {
          Icon: Phone,
          label: "Resposta de permissão",
          sub: "Cliente respondeu ao pedido",
          accent: "text-ink-muted",
          pillBg: "bg-[var(--color-bg-subtle)] border-black/5",
        };
    }
  })();

  return (
    <div className="flex w-full justify-center">
      <div className="w-full max-w-[520px]">
        <div
          className={cn(
            "flex items-center gap-3 rounded-2xl border px-4 py-2.5",
            pillBg,
          )}
        >
          <div
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full bg-white shadow-sm",
              accent,
            )}
          >
            <Icon className="size-4" strokeWidth={2.25} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-bold text-foreground">
              {label}
            </p>
            <p className="mt-0.5 truncate text-[11px] font-medium text-ink-muted">
              {sub}
            </p>
          </div>
          {timeLabel && (
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
              {timeLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function groupReactions(
  reactions: ReactionDto[],
): { emoji: string; count: number; senders: string[] }[] {
  const map = new Map<string, string[]>();
  for (const r of reactions) {
    const a = map.get(r.emoji) ?? [];
    a.push(r.senderName);
    map.set(r.emoji, a);
  }
  return Array.from(map.entries()).map(([emoji, senders]) => ({
    emoji,
    count: senders.length,
    senders,
  }));
}

function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface AudioMessageProps {
  url: string;
  fileSizeBytes?: number | null;
  time?: string;
  /** Mostra double-check ciano ao lado do horário (mensagens enviadas já entregues/lidas). */
  showDeliveryCheck?: boolean;
  /** "sent" | "delivered" | "read" — controla intensidade do check. */
  deliveryStatus?: "sent" | "delivered" | "read";
  /** Quando true, aplica a paleta unificada do agente (#f0f9fa / #cffafe). */
  out?: boolean;
  /** Label opcional exibido no topo do balão (ex.: "Admin Bwipo"). */
  senderLabel?: string;
  /** Gravação de ligação WhatsApp — chrome distinto do áudio de voz. */
  isCallRec?: boolean;
  /** Mensagem otimista — anexo ainda subindo. Substitui meta por
   *  "Enviando…" e desabilita ações que dependem do servidor (download
   *  MP3 + transcrição), evitando 404 enquanto o blob local não foi
   *  persistido. O player local (`<audio>` apontando p/ blob:) continua
   *  funcionando — operador pode revisar o áudio antes do servidor
   *  confirmar. */
  isUploading?: boolean;
  /** Registra handler para o item "Transcrever áudio" do menu ⋯ da mensagem. */
  onRegisterTranscribe?: (handler: (() => void) | null) => void;
}

/** Overlay translúcido com spinner — usado em previews de imagem/vídeo
 *  enquanto o anexo sobe. Centralizado, com fundo navy desfocado pra
 *  não disputar atenção com o conteúdo abaixo. */
function UploadingOverlay({
  label,
  rounded = "rounded-lg",
}: {
  label: string;
  rounded?: string;
}) {
  // Sem `backdrop-blur` (caro em listas longas com muitas medias
  // simultaneas, especialmente em mobile baixo-end). O cinza-navy
  // /45 solido transmite a mesma intencao visual de "midia em
  // upload" sem o custo de filtro de blur compositado por frame.
  return (
    <div
      className={cn(
        "absolute inset-0 flex items-center justify-center bg-foreground/45",
        rounded,
      )}
    >
      <div className="flex items-center gap-2 rounded-full bg-[var(--glass-bg-modal)] px-3 py-1.5 shadow-[var(--shadow-lg)]">
        <Loader2 className="size-3.5 animate-spin text-primary" />
        <span className="text-[11px] font-semibold uppercase tracking-widest text-foreground">
          {label}
        </span>
      </div>
    </div>
  );
}

// Ciclo de velocidades de reprodução. 1x → 1.25x → 1.5x → 2x → 0.75x → 1x.
// Inclui 0.75x para o operador conseguir "desacelerar" áudios que vieram
// rápido demais (cliente acelerado, áudio cortado, etc) — útil pra
// transcrever no ouvido.
const PLAYBACK_RATES = [1, 1.25, 1.5, 2, 0.75] as const;

/** Formata a velocidade pro botão: 1x, 1.25x, 1.5x, 2x, 0.75x. */
function formatRate(rate: number): string {
  return `${rate}x`;
}

function AudioMessage({
  url,
  time,
  showDeliveryCheck = false,
  deliveryStatus = "delivered",
  out = false,
  senderLabel,
  isCallRec = false,
  isUploading = false,
  onRegisterTranscribe,
}: AudioMessageProps) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [duration, setDuration] = React.useState(0);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [ready, setReady] = React.useState(false);
  const [armed, setArmed] = React.useState(
    () => isImmediateMediaSrc(url) || isUploading,
  );
  const pendingPlayRef = React.useRef(false);

  // Velocidade — ciclo via botão. Aplicado no `audio.playbackRate`
  // sempre que muda. `preservesPitch = true` mantém o tom da voz
  // mesmo em 2x (sem efeito "Mickey Mouse").
  const [rateIndex, setRateIndex] = React.useState(0);
  const rate = PLAYBACK_RATES[rateIndex];

  // Download MP3 — fetch da rota `/api/media/audio-mp3` que converte
  // qualquer áudio (ogg/webm/opus) pro formato universal. `pending`
  // mostra spinner no botão enquanto o servidor processa.
  const [downloading, setDownloading] = React.useState(false);

  // Transcrição (Whisper free). `null` = ainda não pediu, `"loading"`
  // = chamando API, `string` = transcrição pronta, `Error` = falhou.
  type TranscriptionState =
    | null
    | "loading"
    | { text: string }
    | { error: string };
  const [transcription, setTranscription] =
    React.useState<TranscriptionState>(null);
  const [transcriptionOpen, setTranscriptionOpen] = React.useState(false);

  React.useEffect(() => {
    const a = audioRef.current;
    if (!a || !armed) return;

    // Áudio gravado em streaming (WhatsApp Voice / MediaRecorder)
    // SEMPRE vem em OGG/WebM com header sem o campo `Duration`
    // preenchido — o browser então retorna `a.duration === Infinity`
    // no `loadedmetadata`, o que zera o cálculo de progresso
    // (`currentTime / Infinity = 0`) e a barra nunca anda.
    //
    // Truque conhecido (registrado em bug trackers do Chromium e
    // Firefox há ~10 anos): setar `currentTime = MAX_SAFE_INTEGER`
    // força o browser a fazer o seek pro fim do arquivo, baixando
    // todo o conteúdo e calculando a duração real. O evento
    // `durationchange` então dispara com o valor correto e
    // resetamos o `currentTime` pra 0. O usuário não vê o jitter
    // porque tudo acontece antes do play começar.
    let durationFixed = false;
    const tryFixDuration = () => {
      if (durationFixed) return;
      if (!Number.isFinite(a.duration) || a.duration === 0) {
        durationFixed = true;
        const onTimeUpdate = () => {
          a.removeEventListener("timeupdate", onTimeUpdate);
          a.currentTime = 0;
          setCurrentTime(0);
        };
        a.addEventListener("timeupdate", onTimeUpdate);
        a.currentTime = Number.MAX_SAFE_INTEGER;
      }
    };

    const onLoaded = () => {
      if (Number.isFinite(a.duration) && a.duration > 0) {
        setDuration(a.duration);
      } else {
        tryFixDuration();
      }
      setReady(true);
    };
    const onDurationChange = () => {
      if (Number.isFinite(a.duration) && a.duration > 0) {
        setDuration(a.duration);
      }
    };
    const onTime = () => setCurrentTime(a.currentTime);
    const onEnd = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    a.addEventListener("loadedmetadata", onLoaded);
    a.addEventListener("durationchange", onDurationChange);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnd);

    // Se o áudio já estava com metadata carregada antes do effect
    // (componente remountou em URL idêntica), dispara o handler
    // manualmente — `loadedmetadata` não vai disparar de novo.
    if (a.readyState >= 1) onLoaded();

    return () => {
      a.removeEventListener("loadedmetadata", onLoaded);
      a.removeEventListener("durationchange", onDurationChange);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnd);
    };
  }, [url, armed]);

  React.useEffect(() => {
    if (!armed || !pendingPlayRef.current) return;
    const a = audioRef.current;
    if (!a) return;
    pendingPlayRef.current = false;
    a.load();
    a.play()
      .then(() => setIsPlaying(true))
      .catch(() => setIsPlaying(false));
  }, [armed, url]);

  // Aplica a velocidade selecionada ao elemento <audio>.
  // `preservesPitch` é o property name moderno (Chrome/Edge/Firefox);
  // browsers antigos podem ignorar e tocar com pitch alterado.
  React.useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.playbackRate = rate;
    type PitchPreserving = HTMLAudioElement & {
      preservesPitch?: boolean;
      mozPreservesPitch?: boolean;
      webkitPreservesPitch?: boolean;
    };
    const p = a as PitchPreserving;
    p.preservesPitch = true;
    p.mozPreservesPitch = true;
    p.webkitPreservesPitch = true;
  }, [rate]);

  const togglePlay = React.useCallback(() => {
    if (!armed) {
      pendingPlayRef.current = true;
      setArmed(true);
      return;
    }
    const a = audioRef.current;
    if (!a) return;
    if (isPlaying) {
      a.pause();
      setIsPlaying(false);
    } else {
      a.play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  }, [isPlaying, armed]);

  const cycleRate = React.useCallback(() => {
    setRateIndex((i) => (i + 1) % PLAYBACK_RATES.length);
  }, []);

  const currentLabel = formatAudioTime(currentTime);
  // `--:--` enquanto a duração está sendo medida (truque do
  // MAX_SAFE_INTEGER pode demorar 1-2s em arquivos OGG sem header).
  // Mostrar `0:00` aqui dava a impressão errada de "áudio vazio".
  const durationLabel = duration > 0 ? formatAudioTime(duration) : "--:--";

  // Nome amigável para download MP3 (timestamp da mensagem quando disponível).
  const downloadName = (() => {
    const safeTime = (time ?? "").replace(/[^\d]/g, "");
    return safeTime ? `audio-${safeTime}` : `audio-${Date.now()}`;
  })();

  const isRead = deliveryStatus === "read";

  const downloadMp3 = React.useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const apiUrl = `/api/media/audio-mp3?url=${encodeURIComponent(url)}&name=${encodeURIComponent(downloadName)}`;
      const res = await fetch(apiUrl);
      if (!res.ok) {
        const ctype = res.headers.get("content-type") || "";
        if (!ctype.includes("application/json")) {
          throw new Error(
            res.status === 502 || res.status === 504
              ? "Servidor demorou demais (gateway timeout). Tente novamente em alguns segundos."
              : res.status === 401 || res.status === 403
                ? "Sessão expirada — recarregue a página (F5)."
                : `Erro HTTP ${res.status}.`,
          );
        }
        const body = (await res.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(body?.message ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `${downloadName}.mp3`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Libera a URL depois de um tick — alguns browsers cancelam o
      // download se a URL for revogada antes do click ser processado.
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao baixar.";
      toast.error(`Não foi possível baixar como MP3. ${msg}`);
    } finally {
      setDownloading(false);
    }
  }, [downloading, url, downloadName]);

  const transcribe = React.useCallback(async () => {
    setTranscriptionOpen(true);
    if (
      transcription &&
      typeof transcription === "object" &&
      "text" in transcription
    )
      return;
    setTranscription("loading");
    try {
      const res = await fetch(apiUrl("/api/media/transcribe"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      // O endpoint sempre responde JSON em sucesso. Se vier HTML, é
      // sintoma de problema fora do nosso handler: gateway estourando
      // timeout (502/504 do nginx do Easypanel), sessão expirada
      // redirecionando pra /login, build antigo sem a rota, etc.
      // Detectamos pelo Content-Type pra mostrar mensagem útil em vez
      // do erro genérico "Unexpected token '<'".
      const ctype = res.headers.get("content-type") || "";
      if (!ctype.includes("application/json")) {
        const hint =
          res.status === 401 || res.status === 403
            ? "Sessão expirada — recarregue a página (F5)."
            : res.status === 502 || res.status === 504
              ? "Servidor demorou demais para responder. Configure GROQ_API_KEY no painel para acelerar (chave grátis em console.groq.com)."
              : `Resposta inesperada do servidor (HTTP ${res.status}).`;
        setTranscription({ error: hint });
        return;
      }
      const json = (await res.json()) as { text?: string; message?: string };
      if (!res.ok || !json.text) {
        const msg = json.message ?? `Erro HTTP ${res.status}`;
        setTranscription({ error: msg });
        return;
      }
      setTranscription({ text: json.text });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro de rede.";
      setTranscription({ error: msg });
    }
  }, [transcription, url]);

  React.useEffect(() => {
    if (!onRegisterTranscribe) return;
    const run = () => {
      void transcribe();
    };
    onRegisterTranscribe(run);
    return () => onRegisterTranscribe(null);
  }, [onRegisterTranscribe, transcribe]);

  const playerSurface = isCallRec
    ? "bg-[#1b4332] text-[#e8f5e9]"
    : out
      ? "bg-current/8"
      : "bg-[var(--color-bg-subtle)]";

  return (
    <>
      {senderLabel && !isCallRec ? (
        <span className="mb-1 block text-[11px] text-ink-subtle">
          {senderLabel}
        </span>
      ) : null}

      <div className="min-w-[230px] max-w-[320px]">
        <div
          className={cn(
            "font-display flex flex-col gap-1 rounded-[var(--radius-sm)] px-2 py-1.5",
            playerSurface,
          )}
        >
        {isCallRec ? (
          <p className="flex items-center gap-1 font-display text-[10px] font-semibold text-[#d8f3dc]">
            <Phone className="size-2.5" />
            Ligação WhatsApp
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={togglePlay}
            disabled={!ready}
            aria-label={isPlaying ? "Pausar" : "Reproduzir"}
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full shadow-sm transition-all active:scale-95 disabled:opacity-60",
              out
                ? "bg-current/15 hover:bg-current/20"
                : "bg-primary text-primary-foreground hover:bg-primary-dark",
            )}
          >
            {isPlaying ? (
              <Pause className="size-3.5" fill="currentColor" />
            ) : (
              <Play className="size-3.5 translate-x-px" fill="currentColor" />
            )}
          </button>

          <div className="flex min-w-0 flex-1 flex-col">
            {isUploading ? (
              <span
                className={cn(
                  "text-[10px] font-medium",
                  out
                    ? "text-[color:var(--chat-bubble-sent-text)]/90"
                    : "text-primary",
                )}
              >
                Enviando…
              </span>
            ) : null}
            <AudioWaveform
              currentTime={currentTime}
              duration={duration}
              outgoing={out}
              disabled={!ready || duration <= 0}
              onSeek={(nextTime) => {
                const audio = audioRef.current;
                if (!audio) return;
                audio.currentTime = nextTime;
                setCurrentTime(nextTime);
              }}
            />
            <div
              className={cn(
                "-mt-px flex items-center justify-between text-[9px] leading-none tabular-nums",
                out
                  ? "text-[color:var(--chat-bubble-sent-time)]"
                  : "text-ink-muted",
              )}
            >
              <span>{currentLabel}</span>
              <span>{durationLabel}</span>
              {time || showDeliveryCheck ? (
                <span className="flex items-center gap-0.5 font-bold">
                  {time ? <span>{time}</span> : null}
                  {showDeliveryCheck ? (
                    <CheckCheck
                      className={cn(
                        "size-2.5",
                        out
                          ? isRead
                            ? "text-[color:var(--chat-bubble-sent-check-read)]"
                            : "text-[color:var(--chat-bubble-sent-time)]"
                          : isRead
                            ? "text-[var(--color-info)]"
                            : "text-[var(--color-ink-muted)]",
                      )}
                      strokeWidth={2.5}
                    />
                  ) : null}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={cycleRate}
              disabled={isUploading}
              className={cn(
                "flex h-6 items-center rounded-full px-1.5 text-[9px] font-bold tabular-nums transition-colors disabled:opacity-50",
                out
                  ? "bg-current/10 hover:bg-current/15"
                  : "bg-primary/10 text-primary hover:bg-primary/15",
              )}
              aria-label={`Velocidade ${formatRate(rate)}`}
            >
              {formatRate(rate)}
            </button>

            {!isUploading ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  downloadMp3();
                }}
                disabled={downloading}
                className={cn(
                  "inline-flex size-6 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                  out
                    ? "text-[color:var(--chat-bubble-sent-time)] hover:bg-current/10"
                    : "text-[var(--color-ink-muted)] hover:bg-primary/10 hover:text-primary",
                )}
                aria-label="Baixar MP3"
              >
                {downloading ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Download className="size-3" />
                )}
              </button>
            ) : null}
          </div>
        </div>
        </div>
      </div>

      {transcriptionOpen ? (
        <div
          className={cn(
            "mt-2 rounded-xl border border-dashed p-3",
            out
              ? "border-[var(--color-chat-sent-border)] bg-[color:var(--chat-bubble-sent-text)]/8"
              : "border-border bg-[var(--color-bg-subtle)]/70",
          )}
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <FileText className="size-3.5 text-primary" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-primary">
                Transcrição
              </span>
            </div>
            <button
              type="button"
              onClick={() => setTranscriptionOpen(false)}
              aria-label="Fechar transcrição"
              className="rounded p-0.5 text-[var(--color-ink-muted)] transition-colors hover:bg-white hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>

          {transcription === "loading" ? (
            <div className="flex items-center gap-2 text-[12px] text-ink-muted">
              <Loader2 className="size-3.5 animate-spin" />
              Transcrevendo… pode levar alguns segundos.
            </div>
          ) : null}

          {transcription &&
          typeof transcription === "object" &&
          "text" in transcription ? (
            <div className="space-y-2">
              <p className="whitespace-pre-wrap text-[13px] font-medium leading-relaxed text-foreground">
                {transcription.text}
              </p>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(transcription.text);
                  toast.success("Transcrição copiada.");
                }}
                className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-ink-muted transition-colors hover:bg-white hover:text-foreground"
              >
                Copiar
              </button>
            </div>
          ) : null}

          {transcription &&
          typeof transcription === "object" &&
          "error" in transcription ? (
            <div className="space-y-2">
              <p className="text-[12px] font-medium text-destructive">
                {transcription.error}
              </p>
              <button
                type="button"
                onClick={() => {
                  setTranscription(null);
                  void transcribe();
                }}
                className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-foreground shadow-sm hover:bg-[var(--color-bg-subtle)]"
              >
                Tentar de novo
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <audio ref={audioRef} preload="none" className="hidden">
        {armed ? (
          <>
            <source src={url} />
            <source src={url} type="audio/ogg" />
            <source src={url} type="audio/webm" />
            <source src={url} type="audio/mp4" />
          </>
        ) : null}
      </audio>
    </>
  );
}
