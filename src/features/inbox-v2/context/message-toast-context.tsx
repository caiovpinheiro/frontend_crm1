"use client";

import * as React from "react";
import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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

type MessageToastContextValue = {
  registerActiveConversation: (id: string | null) => void;
  registerActiveTeamChatRoom: (id: string | null) => void;
  notifyInboxMessage: (payload: InboxMessageToastPayload) => void;
  notifyTeamChatMessage: (payload: TeamChatToastPayload) => void;
};

const MessageToastContext = createContext<MessageToastContextValue | null>(null);

export function useMessageToast() {
  const ctx = useContext(MessageToastContext);
  if (!ctx) throw new Error("useMessageToast must be used within MessageToastProvider");
  return ctx;
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
      router.push(`/bwipo-chat?room=${toast.teamChatPayload.roomId}`);
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
  const activeConversationsRef = useRef(new Set<string>());
  const activeTeamChatRoomsRef = useRef(new Set<string>());
  const recentRef = useRef(new Map<string, number>());

  const registerActiveConversation = useCallback((id: string | null) => {
    if (id) activeConversationsRef.current.add(id);
  }, []);

  const registerActiveTeamChatRoom = useCallback((id: string | null) => {
    if (id) activeTeamChatRoomsRef.current.add(id);
  }, []);

  const notifyInboxMessage = useCallback((payload: InboxMessageToastPayload) => {
    if (payload.direction !== "in") return;
    const conversationId = payload.conversationId;
    if (!conversationId) return;
    if (activeConversationsRef.current.has(conversationId)) return;

    const now = Date.now();
    const last = recentRef.current.get(conversationId);
    if (last && now - last < 4000) return;
    recentRef.current.set(conversationId, now);

    const id = `inbox:${conversationId}:${now}`;
    setToasts((prev) => {
      const filtered = prev.filter((t) => !(t.kind === "inbox" && t.inboxPayload?.conversationId === conversationId));
      return [...filtered, { id, kind: "inbox", inboxPayload: payload, createdAt: now }];
    });
  }, []);

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
    <MessageToastContext.Provider
      value={{
        registerActiveConversation,
        registerActiveTeamChatRoom,
        notifyInboxMessage,
        notifyTeamChatMessage,
      }}
    >
      {children}
      <div
        className="fixed right-4 top-4 z-[100] flex flex-col gap-2"
        aria-live="polite"
        aria-atomic="true"
      >
        <AnimatePresence mode="popLayout">
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onClose={close} />
          ))}
        </AnimatePresence>
      </div>
    </MessageToastContext.Provider>
  );
}

export function useRegisterActiveConversation(conversationId: string | null) {
  const { registerActiveConversation } = useMessageToast();
  useEffect(() => {
    registerActiveConversation(conversationId);
    return () => registerActiveConversation(null);
  }, [registerActiveConversation, conversationId]);
}

export function useRegisterActiveTeamChatRoom(roomId: string | null) {
  const { registerActiveTeamChatRoom } = useMessageToast();
  useEffect(() => {
    registerActiveTeamChatRoom(roomId);
    return () => registerActiveTeamChatRoom(null);
  }, [registerActiveTeamChatRoom, roomId]);
}
