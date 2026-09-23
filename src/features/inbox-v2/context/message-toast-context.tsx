"use client";

import * as React from "react";
import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getTabBadge, setTabBadge } from "@/lib/tab-badge";
import { cn } from "@/lib/utils";
import type { TeamChatMessage } from "@/features/team-chat/types";

export type InboxMessageToastPayload = {
  conversationId?: string;
  contactId?: string;
  direction?: string;
  content?: string;
  timestamp?: string;
  messageType?: string;
  card?: {
    id: string;
    number?: number | null;
    contact?: {
      id?: string;
      name?: string | null;
      picture?: string | null;
      phone?: string | null;
    } | null;
    channel?: string | { type?: string; name?: string } | null;
  };
};

export type TeamChatToastPayload = {
  roomId: string;
  roomName?: string | null;
  roomAvatarUrl?: string | null;
  message: TeamChatMessage;
};

type ToastKind = "inbox" | "team-chat";

type Toast = {
  id: string;
  kind: ToastKind;
  inboxPayload?: InboxMessageToastPayload;
  teamChatPayload?: TeamChatToastPayload;
  createdAt: number;
};

export type InboxNotifyOptions = { toast?: boolean; native?: boolean; tab?: boolean };

type MessageToastContextValue = {
  /** Marca a conversa como aberta (sem toast). Devolve o unregister. */
  registerActiveConversation: (id: string) => () => void;
  registerActiveTeamChatRoom: (id: string) => () => void;
  /**
   * Canais do alerta (config do admin, `InboxAlertConfig`):
   * - `toast` (padrão `true`): toast in-page, fora da conversa aberta;
   * - `native`: notificação do sistema com a aba oculta — mesmo na
   *   conversa aberta, com a mesma tag do Web Push para o SO substituir;
   * - `tab`: contador no título/favicon DESTA aba se a conversa está
   *   aberta nela e a janela está fora de foco. Zera ao focar.
   */
  notifyInboxMessage: (payload: InboxMessageToastPayload, options?: InboxNotifyOptions) => void;
  notifyTeamChatMessage: (payload: TeamChatToastPayload) => void;
};

const MessageToastContext = createContext<MessageToastContextValue | null>(null);

export function useMessageToast() {
  const ctx = useContext(MessageToastContext);
  if (!ctx) throw new Error("useMessageToast must be used within MessageToastProvider");
  return ctx;
}

const SW_READY_TIMEOUT_MS = 3_000;

async function readyServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  // `ready` nunca resolve sem SW registrado (dev, navegador sem suporte).
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), SW_READY_TIMEOUT_MS)),
  ]).catch(() => null);
}

/**
 * Notificação do sistema com a aba oculta. Nunca pede permissão aqui: o
 * prompt fora de gesto é ignorado ou bloqueado (o pedido é o botão
 * "Ativar notificações"). Sai pelo service worker para dividir a fila e a
 * `tag` com o Web Push (o SO substitui em vez de empilhar) e para o
 * clique cair no `notificationclick` com `data.url`. `new Notification`
 * só como fallback sem SW (e lança no Chrome Android).
 */
async function showNativeNotificationIfNeeded(
  title: string,
  options: NotificationOptions & { data?: Record<string, unknown> },
) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (document.visibilityState === "visible") return;
  if (Notification.permission !== "granted") return;

  const full: NotificationOptions & { renotify?: boolean } = {
    icon: "/icon.svg",
    badge: "/icon.svg",
    requireInteraction: false,
    ...options,
  };
  try {
    const reg = await readyServiceWorker();
    if (reg) {
      await reg.showNotification(title, full);
      return;
    }
    new Notification(title, full);
  } catch {
    // Fallback silencioso: o toast ainda está visível dentro do app.
  }
}

/** Mesmo sufixo de canal do título do Web Push (`notifyInboundMessage`). */
function pushChannelLabel(card: InboxMessageToastPayload["card"]): string {
  const raw = card?.channel;
  const type = String(typeof raw === "string" ? raw : raw?.type ?? "").toLowerCase();
  if (type === "instagram") return " · Instagram";
  if (type === "meta" || type === "facebook" || type === "messenger") return " · Meta";
  if (type === "email") return " · Email";
  return "";
}

function showInboxNativeNotification(
  conversationId: string,
  payload: InboxMessageToastPayload,
) {
  const card = payload.card;
  const name = card?.contact?.name?.trim() || "Nova mensagem";
  const number = card?.number;
  void showNativeNotificationIfNeeded(`${name}${pushChannelLabel(card)}`, {
    body: formatInboxPreview(payload),
    // Mesma tag do Web Push (web-push.ts): uma notificação por conversa.
    tag: `conv:${conversationId}`,
    renotify: false,
    icon: card?.contact?.picture || "/icon.svg",
    data: {
      url: number != null ? `/inbox?c=${number}` : `/inbox?c=${conversationId}`,
      conversationId,
      contactId: payload.contactId,
    },
  } as NotificationOptions);
}

/**
 * Contagem por id: vários `useInboxRealtime` podem estar montados (inbox,
 * sales-hub, chat do deal) e o cleanup de um não pode liberar o id que
 * outro ainda tem aberto.
 */
function retainId(map: Map<string, number>, id: string): () => void {
  map.set(id, (map.get(id) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = (map.get(id) ?? 0) - 1;
    if (next > 0) map.set(id, next);
    else map.delete(id);
  };
}

function contactInitials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function formatInboxPreview(payload: InboxMessageToastPayload): string {
  const type = payload.messageType?.toLowerCase();
  const text = payload.content?.trim();
  if (!text && type === "image") return "📷 Foto";
  if (!text && type === "audio") return "🎤 Áudio";
  if (!text && type === "video") return "🎥 Vídeo";
  if (!text && (type === "document" || type === "file")) return "📎 Documento";
  if (!text) return "Nova mensagem";
  if (type === "image") return `📷 Foto: ${text}`;
  if (type === "audio") return `🎤 Áudio: ${text}`;
  if (type === "video") return `🎥 Vídeo: ${text}`;
  if (type === "document" || type === "file") return `📎 Documento: ${text}`;
  return text;
}

function channelName(card: InboxMessageToastPayload["card"]): string | null {
  if (!card) return null;
  const channel = card.channel;
  if (!channel) return null;
  if (typeof channel === "string") return channel;
  return channel.name || channel.type || null;
}

function formatTeamChatPreview(message: TeamChatMessage): string {
  if (message.kind === "SYSTEM") return message.content || "Aviso do sistema";
  const text = message.content?.trim();
  if (!text) {
    if (message.attachments && message.attachments.length > 0) return "📎 Anexo";
    return "Nova mensagem";
  }
  return text;
}

function InboxToastContent({ payload }: { payload: InboxMessageToastPayload }) {
  const contact = payload.card?.contact;
  const name = contact?.name || `Contato ${payload.card?.number ?? ""}`.trim();
  const preview = formatInboxPreview(payload);
  const time = payload.timestamp
    ? new Date(payload.timestamp).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  const channel = channelName(payload.card);

  return (
    <>
      <Avatar className="size-11">
        {contact?.picture ? <AvatarImage src={contact.picture} alt={name} /> : null}
        <AvatarFallback className="text-sm">{contactInitials(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-semibold text-foreground">{name}</span>
          {time ? <span className="shrink-0 text-[11px] text-muted-foreground">{time}</span> : null}
        </div>
        <p className="truncate text-[13px] text-muted-foreground">{preview}</p>
        {channel ? (
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground/80">via {channel}</p>
        ) : null}
      </div>
    </>
  );
}

function TeamChatToastContent({ payload }: { payload: TeamChatToastPayload }) {
  const { roomName, roomAvatarUrl, message } = payload;
  const author = message.author;
  const authorName = author?.name || "Bwipo Chat";
  const preview = formatTeamChatPreview(message);
  const time = message.createdAt
    ? new Date(message.createdAt).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <>
      <Avatar className="size-11">
        {roomAvatarUrl ? <AvatarImage src={roomAvatarUrl} alt={roomName || ""} /> : null}
        <AvatarFallback className="text-sm">{contactInitials(roomName)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-semibold text-foreground">
            {roomName || "Bwipo Chat"}
          </span>
          {time ? <span className="shrink-0 text-[11px] text-muted-foreground">{time}</span> : null}
        </div>
        <p className="truncate text-[13px] text-muted-foreground">
          <span className="font-medium text-foreground/80">{authorName}:</span> {preview}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground/80">Bwipo Chat</p>
      </div>
    </>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: (id: string) => void }) {
  const router = useRouter();

  const handleClick = () => {
    onClose(toast.id);
    if (toast.kind === "inbox" && toast.inboxPayload?.conversationId) {
      router.push(`/inbox?c=${toast.inboxPayload.conversationId}`);
    } else if (toast.kind === "team-chat" && toast.teamChatPayload?.roomId) {
      const { roomId, message } = toast.teamChatPayload;
      router.push(`/bwipo-chat?room=${roomId}&message=${message.id}`);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => onClose(toast.id), 6000);
    return () => clearTimeout(timer);
  }, [onClose, toast.id]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 120, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 120, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
      onClick={handleClick}
      className={cn(
        "pointer-events-auto flex w-[min(22rem,92vw)] cursor-pointer items-center gap-3 rounded-xl border bg-popover/95 p-3 shadow-lg backdrop-blur-sm",
        "hover:bg-accent",
      )}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handleClick();
      }}
    >
      {toast.kind === "inbox" && toast.inboxPayload ? (
        <InboxToastContent payload={toast.inboxPayload} />
      ) : null}
      {toast.kind === "team-chat" && toast.teamChatPayload ? (
        <TeamChatToastContent payload={toast.teamChatPayload} />
      ) : null}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose(toast.id);
        }}
        className="ml-1 shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Fechar notificação"
      >
        <X className="size-4" />
      </button>
    </motion.div>
  );
}

export function MessageToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);
  const activeConversationsRef = useRef(new Map<string, number>());
  const activeTeamChatRoomsRef = useRef(new Map<string, number>());
  const recentRef = useRef(new Map<string, number>());

  useEffect(() => {
    setMounted(true);
  }, []);

  // Contador da aba (canal `tab`) zera quando o operador volta para ela.
  useEffect(() => {
    const clear = () => {
      if (getTabBadge() > 0) setTabBadge(0);
    };
    window.addEventListener("focus", clear);
    return () => window.removeEventListener("focus", clear);
  }, []);

  const registerActiveConversation = useCallback(
    (id: string) => retainId(activeConversationsRef.current, id),
    [],
  );

  const registerActiveTeamChatRoom = useCallback(
    (id: string) => retainId(activeTeamChatRoomsRef.current, id),
    [],
  );

  const notifyInboxMessage = useCallback(
    (payload: InboxMessageToastPayload, options?: InboxNotifyOptions) => {
      if (payload.direction !== "in") return;
      const conversationId = payload.conversationId;
      if (!conversationId) return;
      // Antes do corte da conversa aberta e do dedupe: com a aba oculta o
      // operador não vê a conversa, e a tag por conversa já substitui.
      if (options?.native) showInboxNativeNotification(conversationId, payload);
      const isOpenHere = activeConversationsRef.current.has(conversationId);
      if (options?.tab && isOpenHere && !document.hasFocus()) {
        setTabBadge(getTabBadge() + 1);
      }
      if (isOpenHere) return;
      if (options?.toast === false) return;

      const now = Date.now();
      const last = recentRef.current.get(conversationId);
      if (last && now - last < 4000) return;
      recentRef.current.set(conversationId, now);

      const id = `inbox:${conversationId}:${now}`;
      setToasts((prev) => {
        const filtered = prev.filter((t) => !(t.kind === "inbox" && t.inboxPayload?.conversationId === conversationId));
        return [...filtered, { id, kind: "inbox", inboxPayload: payload, createdAt: now }];
      });
    },
    [],
  );

  const notifyTeamChatMessage = useCallback((payload: TeamChatToastPayload) => {
    const roomId = payload.roomId;
    if (!roomId) return;
    if (activeTeamChatRoomsRef.current.has(roomId)) return;
    // Não notifica mensagens do próprio usuário.
    if (payload.message.authorId === "me" || payload.message.kind === "SYSTEM") {
      // SYSTEM messages ainda podem ser interessantes; mantemos aqui.
    }

    const now = Date.now();
    const dedupKey = `teamchat:${roomId}`;
    const last = recentRef.current.get(dedupKey);
    if (last && now - last < 4000) return;
    recentRef.current.set(dedupKey, now);

    // Notificação nativa do sistema quando a aba não está visível.
    const authorName = payload.message.author?.name || "Bwipo Chat";
    const roomName = payload.roomName || "Bwipo Chat";
    const messageId = payload.message.id;
    void showNativeNotificationIfNeeded(`${authorName} · ${roomName}`, {
      body: formatTeamChatPreview(payload.message),
      tag: `${dedupKey}:${messageId}`,
      data: { url: `/bwipo-chat?room=${roomId}&message=${messageId}` },
      icon: payload.roomAvatarUrl || "/icon.svg",
    });

    const id = `${dedupKey}:${now}`;
    setToasts((prev) => {
      const filtered = prev.filter((t) => !(t.kind === "team-chat" && t.teamChatPayload?.roomId === roomId));
      return [...filtered, { id, kind: "team-chat", teamChatPayload: payload, createdAt: now }];
    });
  }, []);

  const close = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const cutoff = Date.now() - 1000 * 60 * 5;
      recentRef.current.forEach((ts, key) => {
        if (ts < cutoff) recentRef.current.delete(key);
      });
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      <MessageToastContext.Provider
        value={{
          registerActiveConversation,
          registerActiveTeamChatRoom,
          notifyInboxMessage,
          notifyTeamChatMessage,
        }}
      >
        {children}
      </MessageToastContext.Provider>
      {mounted &&
        createPortal(
          <div
            className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2"
            aria-live="polite"
            aria-atomic="true"
          >
            <AnimatePresence mode="popLayout">
              {toasts.map((toast) => (
                <ToastItem key={toast.id} toast={toast} onClose={close} />
              ))}
            </AnimatePresence>
          </div>,
          document.body,
        )}
    </>
  );
}

export function useRegisterActiveConversation(conversationId: string | null) {
  const { registerActiveConversation } = useMessageToast();
  useEffect(() => {
    if (!conversationId) return;
    return registerActiveConversation(conversationId);
  }, [registerActiveConversation, conversationId]);
}

export function useRegisterActiveTeamChatRoom(roomId: string | null) {
  const { registerActiveTeamChatRoom } = useMessageToast();
  useEffect(() => {
    if (!roomId) return;
    return registerActiveTeamChatRoom(roomId);
  }, [registerActiveTeamChatRoom, roomId]);
}
