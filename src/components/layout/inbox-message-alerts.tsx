"use client";

/**
 * Alerta global de mensagem recebida no inbox (bip + toast), montado no
 * layout `(app)` — vale em qualquer tela do CRM, não só com o chat aberto.
 * Antes o bip vivia em `useInboxRealtime` e só existia onde havia um
 * thread montado (inbox, sales-hub, chat do deal).
 *
 * Público em `inboxAlertAudience` (lê o `card` do SSE). Sem card:
 * `cardOmitted: "hidden"` = o usuário não lista a conversa → nada;
 * `"budget"` = o bus não montou o snapshot → busca o card antes de decidir.
 *
 * Som com dono único entre abas (`useInboxSoundOwner`).
 */

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { IconVolume as Volume2 } from "@tabler/icons-react";

import { isEventMessageType } from "@/components/crm/chat-timeline";
import { getConversation, type ConversationListRow } from "@/features/inbox-v2/api";
import {
  useMessageToast,
  type InboxMessageToastPayload,
} from "@/features/inbox-v2/context/message-toast-context";
import { inboxAlertAudience } from "@/features/inbox-v2/inbox-alert-audience";
import {
  INBOX_AUDIO_LOCKED_EVENT,
  INBOX_AUDIO_UNLOCKED_EVENT,
  isInboxAudioRunning,
  playInboxPing,
  resumeAudio,
  useInboxSoundMuted,
} from "@/features/inbox-v2/hooks/use-inbox-sound";
import { useInboxSoundOwner } from "@/features/inbox-v2/hooks/use-inbox-sound-owner";
import { subscribeSSEEvents } from "@/hooks/use-sse";
import { apiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

type NewMessageEnvelope = {
  conversationId?: string;
  contactId?: string;
  direction?: string;
  content?: string;
  timestamp?: string;
  messageType?: string;
  card?: ConversationListRow;
  cardOmitted?: "hidden" | "budget";
};

async function fetchMyDepartmentIds(): Promise<string[]> {
  const res = await fetch(apiUrl("/api/agents/me/departments"));
  if (!res.ok) throw new Error(`departments ${res.status}`);
  const data = (await res.json()) as { departmentIds?: unknown };
  return Array.isArray(data.departmentIds)
    ? data.departmentIds.filter((id): id is string => typeof id === "string")
    : [];
}

function toToastCard(card: ConversationListRow): InboxMessageToastPayload["card"] {
  return {
    id: card.id,
    number: card.number ?? null,
    contact: card.contact
      ? {
          id: card.contact.id,
          name: card.contact.name,
          picture: card.contact.avatarUrl ?? null,
          phone: card.contact.phone,
        }
      : null,
    channel: card.channel,
  };
}

export function InboxMessageAlerts() {
  const { status, data: session } = useSession();
  const user = session?.user as { id?: string; organizationId?: string | null } | undefined;
  const meId = user?.id ?? null;
  const orgId = user?.organizationId ?? null;
  const ready = status === "authenticated" && Boolean(meId);
  const { notifyInboxMessage } = useMessageToast();

  const { data: myDepartmentIds } = useQuery({
    queryKey: ["agents-me-departments", meId],
    queryFn: fetchMyDepartmentIds,
    enabled: ready,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const sound = useInboxSoundOwner(
    ready && orgId && meId ? `inbox-sound:${orgId}:${meId}` : null,
  );

  // O handler do SSE lê o valor atual sem reassinar o stream.
  const meRef = useRef(meId);
  const deptsRef = useRef(myDepartmentIds);
  const soundRef = useRef(sound);
  const notifyRef = useRef(notifyInboxMessage);
  useEffect(() => {
    meRef.current = meId;
    deptsRef.current = myDepartmentIds;
    soundRef.current = sound;
    notifyRef.current = notifyInboxMessage;
  });

  useEffect(() => {
    if (!ready) return;
    let alive = true;

    async function onNewMessage(data: NewMessageEnvelope) {
      if (data.direction !== "in") return;
      const conversationId = data.conversationId;
      if (!conversationId) return;
      if (isEventMessageType(data.messageType)) return;

      let card = data.card ?? null;
      if (!card) {
        if (data.cardOmitted !== "budget") return;
        try {
          card = await getConversation(conversationId);
        } catch {
          return; // 404/sem permissão: fail-closed, igual à lista
        }
        if (!alive) return;
      }

      const audience = inboxAlertAudience(card, meRef.current, deptsRef.current);
      if (!audience) return;

      if (audience === "mine") {
        const owner = soundRef.current;
        if (owner.isOwner()) {
          playInboxPing();
        } else if (!isInboxAudioRunning() && !(await owner.heldElsewhere())) {
          // Nenhuma aba pode tocar: o ping travado acende o
          // "Clique para ativar o som" nesta aba.
          playInboxPing();
        }
      }

      notifyRef.current({ ...data, card: toToastCard(card) });
    }

    const unsubscribe = subscribeSSEEvents("/api/sse/messages", {
      new_message: (raw) => {
        void onNewMessage(raw as NewMessageEnvelope).catch((e) => {
          console.error("[inbox-alerts] new_message", e);
        });
      },
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [ready]);

  if (!ready) return null;
  return <InboxAudioUnlockButton />;
}

/**
 * Botão discreto enquanto o AudioContext está travado e o som ligado. O
 * clique é o gesto que destrava (o listener global em
 * `NavMessageAlertsProvider` também pega qualquer outro clique).
 */
function InboxAudioUnlockButton() {
  const [muted] = useInboxSoundMuted();
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const onLocked = () => setLocked(!isInboxAudioRunning());
    const onUnlocked = () => setLocked(false);
    window.addEventListener(INBOX_AUDIO_LOCKED_EVENT, onLocked);
    window.addEventListener(INBOX_AUDIO_UNLOCKED_EVENT, onUnlocked);
    return () => {
      window.removeEventListener(INBOX_AUDIO_LOCKED_EVENT, onLocked);
      window.removeEventListener(INBOX_AUDIO_UNLOCKED_EVENT, onUnlocked);
    };
  }, []);

  if (!locked || muted) return null;

  return (
    <button
      type="button"
      onClick={() => {
        void resumeAudio().then(() => {
          if (isInboxAudioRunning()) setLocked(false);
        });
      }}
      className={cn(
        "fixed bottom-4 left-1/2 z-[100] -translate-x-1/2 md:left-[calc(var(--nav-rail-w,0px)+1rem)] md:translate-x-0",
        "max-md:bottom-[calc(env(safe-area-inset-bottom,0px)+4.5rem)]",
        "inline-flex items-center gap-1.5 rounded-full border bg-popover/95 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-md backdrop-blur-sm",
        "transition-colors hover:bg-accent hover:text-foreground",
      )}
    >
      <Volume2 className="size-3.5" />
      Clique para ativar o som
    </button>
  );
}
