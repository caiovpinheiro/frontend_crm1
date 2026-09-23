"use client";

/**
 * Alerta global de mensagem recebida no inbox (bip, toast e notificação
 * nativa com a aba oculta), montado no
 * layout `(app)` — vale em qualquer tela do CRM, não só com o chat aberto.
 * Antes o bip vivia em `useInboxRealtime` e só existia onde havia um
 * thread montado (inbox, sales-hub, chat do deal).
 *
 * Tipo da conversa em `inboxAlertKind` (lê o `card` do SSE) e canais pela
 * config do admin (`GET /api/agents/me/alert-config`). Sem card:
 * `cardOmitted: "hidden"` = o usuário não lista a conversa → nada;
 * `"budget"` = o bus não montou o snapshot. Aí só a aba do responsável
 * (`assignedToId` do evento) busca o card — sem isto TODAS as abas da org
 * fariam GET :id juntas, justo quando o banco já está lento.
 *
 * Som com dono único entre abas (`useInboxSoundOwner`).
 */

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { IconBell as Bell, IconVolume as Volume2, IconX as X } from "@tabler/icons-react";

import { isEventMessageType } from "@/components/crm/chat-timeline";
import { getConversation, type ConversationListRow } from "@/features/inbox-v2/api";
import {
  useMessageToast,
  type InboxMessageToastPayload,
} from "@/features/inbox-v2/context/message-toast-context";
import {
  DEFAULT_INBOX_ALERT_CONFIG,
  inboxAlertKind,
  type InboxAlertConfig,
} from "@/features/inbox-v2/inbox-alert-audience";
import {
  INBOX_AUDIO_LOCKED_EVENT,
  INBOX_AUDIO_UNLOCKED_EVENT,
  isInboxAudioRunning,
  playInboxPing,
  resumeAudio,
  useInboxSoundMuted,
} from "@/features/inbox-v2/hooks/use-inbox-sound";
import { useInboxSoundOwner } from "@/features/inbox-v2/hooks/use-inbox-sound-owner";
import { usePushSubscription } from "@/hooks/use-push-subscription";
import { subscribeSSEEvents } from "@/hooks/use-sse";
import { apiUrl } from "@/lib/api";
import { markJustArrived } from "@/lib/just-arrived";
import { isNativePlatform } from "@/lib/native/capacitor";
import { cn } from "@/lib/utils";

type NewMessageEnvelope = {
  conversationId?: string;
  contactId?: string;
  direction?: string;
  /** Responsável no momento do evento (publicadores do webhook mandam). */
  assignedToId?: string | null;
  content?: string;
  timestamp?: string;
  messageType?: string;
  card?: ConversationListRow;
  cardOmitted?: "hidden" | "budget";
};

type MyAlertConfig = { config: InboxAlertConfig; departmentIds: string[] };

async function fetchMyAlertConfig(): Promise<MyAlertConfig> {
  const res = await fetch(apiUrl("/api/agents/me/alert-config"));
  if (!res.ok) throw new Error(`alert-config ${res.status}`);
  const data = (await res.json()) as { config?: InboxAlertConfig; departmentIds?: unknown };
  return {
    config: data.config ?? DEFAULT_INBOX_ALERT_CONFIG,
    departmentIds: Array.isArray(data.departmentIds)
      ? data.departmentIds.filter((id): id is string => typeof id === "string")
      : [],
  };
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

  // Até carregar vale o padrão com fila vazia: só "minhas" alertam.
  const { data: myAlerts } = useQuery({
    queryKey: ["agents-me-alert-config", meId],
    queryFn: fetchMyAlertConfig,
    enabled: ready,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const sound = useInboxSoundOwner(
    ready && orgId && meId ? `inbox-sound:${orgId}:${meId}` : null,
  );

  // O handler do SSE lê o valor atual sem reassinar o stream.
  const meRef = useRef(meId);
  const alertsRef = useRef(myAlerts);
  const soundRef = useRef(sound);
  const notifyRef = useRef(notifyInboxMessage);
  useEffect(() => {
    meRef.current = meId;
    alertsRef.current = myAlerts;
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
      // Brilho de chegada nos cards (inbox por conversa, kanban/Flow por
      // contato) — independe do público do alerta.
      if (data.cardOmitted !== "hidden") {
        markJustArrived([conversationId, data.card?.id, data.contactId]);
      }

      let card = data.card ?? null;
      if (!card) {
        if (data.cardOmitted !== "budget") return;
        if (!data.assignedToId || data.assignedToId !== meRef.current) return;
        try {
          card = await getConversation(conversationId);
        } catch {
          return; // 404/sem permissão: fail-closed, igual à lista
        }
        if (!alive) return;
      }

      const alerts = alertsRef.current;
      const kind = inboxAlertKind(card, meRef.current, alerts?.departmentIds);
      if (!kind) return;
      const channels = (alerts?.config ?? DEFAULT_INBOX_ALERT_CONFIG)[kind];
      if (!channels.sound && !channels.toast && !channels.native && !channels.tab) return;

      if (channels.sound) {
        const owner = soundRef.current;
        if (owner.isOwner()) {
          playInboxPing();
        } else if (!isInboxAudioRunning() && !(await owner.heldElsewhere())) {
          // Nenhuma aba pode tocar: o ping travado acende o
          // "Clique para ativar o som" nesta aba.
          playInboxPing();
        }
      }

      notifyRef.current(
        { ...data, card: toToastCard(card) },
        { toast: channels.toast, native: channels.native, tab: channels.tab },
      );
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
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2 max-md:bottom-[calc(env(safe-area-inset-bottom,0px)+4.5rem)] md:left-[calc(var(--nav-rail-w,0px)+1rem)] md:translate-x-0 md:items-start">
      <NotificationPermissionButton />
      <InboxAudioUnlockButton />
    </div>
  );
}

const PILL_CLASS = cn(
  "pointer-events-auto inline-flex items-center gap-1.5 rounded-full border bg-popover/95 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-md backdrop-blur-sm",
  "transition-colors hover:bg-accent hover:text-foreground",
);

const PERMISSION_DISMISS_KEY = "inbox:notification-prompt-dismissed";

/**
 * Pedido de permissão de notificação, só com `permission === "default"`.
 * O pedido sai do clique (gesto, aba visível) — nunca da chegada de uma
 * mensagem com a aba oculta. Com Web Push disponível também inscreve o
 * aparelho (mesmo fluxo de Configurações > Notificações). "×" esconde até
 * fechar a aba.
 */
function NotificationPermissionButton() {
  const push = usePushSubscription();
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!("Notification" in window) || isNativePlatform()) return;
    setPermission(Notification.permission);
    try {
      setDismissed(window.sessionStorage.getItem(PERMISSION_DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
    // Permissão mudada nas configurações do navegador com o app aberto.
    let status: PermissionStatus | null = null;
    const sync = () => setPermission(Notification.permission);
    navigator.permissions
      ?.query({ name: "notifications" as PermissionName })
      .then((s) => {
        status = s;
        s.addEventListener("change", sync);
      })
      .catch(() => {});
    return () => status?.removeEventListener("change", sync);
  }, []);

  if (permission !== "default" || dismissed) return null;

  const enable = async () => {
    setBusy(true);
    try {
      if (push.isSupported) await push.subscribe();
      else await Notification.requestPermission();
    } catch {
      /* o estado abaixo reflete o resultado */
    } finally {
      setBusy(false);
      setPermission(Notification.permission);
    }
  };

  const dismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(PERMISSION_DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <div className={cn(PILL_CLASS, "gap-0 p-0 hover:bg-popover/95")}>
      <button
        type="button"
        onClick={() => void enable()}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-l-full py-1.5 pl-3 pr-2 hover:text-foreground disabled:opacity-60"
      >
        <Bell className="size-3.5" />
        {busy ? "Ativando…" : "Ativar notificações"}
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dispensar"
        className="rounded-r-full py-1.5 pl-1 pr-2.5 hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
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
      className={PILL_CLASS}
    >
      <Volume2 className="size-3.5" />
      Clique para ativar o som
    </button>
  );
}
