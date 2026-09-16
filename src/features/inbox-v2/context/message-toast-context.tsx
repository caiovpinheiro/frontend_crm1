"use client";

import * as React from "react";
import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X, Image, Mic, FileText, MessageSquare } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

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

type Toast = {
  id: string;
  conversationId: string;
  payload: InboxMessageToastPayload;
  createdAt: number;
};

type InboxMessageToastContextValue = {
  registerActiveConversation: (id: string | null) => void;
  notifyMessage: (payload: InboxMessageToastPayload) => void;
};

const InboxMessageToastContext = createContext<InboxMessageToastContextValue | null>(null);

function useInboxMessageToastContext() {
  const ctx = useContext(InboxMessageToastContext);
  if (!ctx) throw new Error("useInboxMessageToast must be used within InboxMessageToastProvider");
  return ctx;
}

function formatPreview(payload: InboxMessageToastPayload): string {
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

function contactInitials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function ToastItem({
  toast,
  onClose,
}: {
  toast: Toast;
  onClose: (id: string) => void;
}) {
  const router = useRouter();
  const { payload } = toast;
  const contact = payload.card?.contact;
  const name = contact?.name || `Contato ${payload.card?.number ?? ""}`.trim();
  const preview = formatPreview(payload);
  const time = payload.timestamp
    ? new Date(payload.timestamp).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  const channel = channelName(payload.card);

  const handleClick = () => {
    onClose(toast.id);
    if (payload.conversationId) {
      router.push(`/inbox?c=${payload.conversationId}`);
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
        "hover:bg-accent"
      )}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handleClick();
      }}
    >
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
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground/80">
            via {channel}
          </p>
        ) : null}
      </div>
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

export function InboxMessageToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const activeConversationsRef = useRef(new Set<string>());
  const recentRef = useRef(new Map<string, number>());

  const registerActiveConversation = useCallback((id: string | null) => {
    const set = activeConversationsRef.current;
    if (id) set.add(id);
    else {
      // Sem id não removemos outros; cada instância gerencia seu próprio id.
      // A registry acumula ids de todas as instâncias ativas (normalmente 1 página).
    }
  }, []);

  const unregisterActiveConversation = useCallback((id: string | null) => {
    if (id) activeConversationsRef.current.delete(id);
  }, []);

  const notifyMessage = useCallback((payload: InboxMessageToastPayload) => {
    if (payload.direction !== "in") return;
    const conversationId = payload.conversationId;
    if (!conversationId) return;
    if (activeConversationsRef.current.has(conversationId)) return;

    // Evita spam: um toast por conversa a cada 4s.
    const now = Date.now();
    const last = recentRef.current.get(conversationId);
    if (last && now - last < 4000) return;
    recentRef.current.set(conversationId, now);

    const id = `${conversationId}:${now}`;
    setToasts((prev) => {
      // Substitui toast existente da mesma conversa para não empilhar.
      const filtered = prev.filter((t) => t.conversationId !== conversationId);
      return [...filtered, { id, conversationId, payload, createdAt: now }];
    });
  }, []);

  const close = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Limpa registry antiga periodicamente para não vazar memória.
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
    <InboxMessageToastContext.Provider value={{ registerActiveConversation, notifyMessage }}>
      {children}
      <div className="fixed right-4 top-4 z-[100] flex flex-col gap-2" aria-live="polite" aria-atomic="true">
        <AnimatePresence mode="popLayout">
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onClose={close} />
          ))}
        </AnimatePresence>
      </div>
    </InboxMessageToastContext.Provider>
  );
}

// Hook usado pelo useInboxRealtime para notificar e registrar conversa aberta.
export function useInboxMessageToast() {
  return useInboxMessageToastContext();
}

// Hook para registrar/desregistrar uma conversa ativa em um componente.
export function useRegisterActiveConversation(conversationId: string | null) {
  const { registerActiveConversation } = useInboxMessageToastContext();
  useEffect(() => {
    registerActiveConversation(conversationId);
    return () => registerActiveConversation(null);
  }, [registerActiveConversation, conversationId]);
}
