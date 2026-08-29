"use client";

import { apiUrl } from "@/lib/api";
import { postWhatsappCall } from "@/lib/wa-whatsapp-call";
/**
 * WhatsappCallChip
 * ─────────────────
 * Chip compacto do estado de **sessão de voz** (Call Permission da Meta
 * WhatsApp Business Calling API) para ficar no header do chat, ao lado do
 * nome do contato.
 *
 * IMPORTANTE — **sessão de voz ≠ sessão de conversa**:
 *
 * - **Sessão de conversa (Customer Service Window)**: janela de 24h aberta
 *   quando o cliente envia uma mensagem inbound. Liberada para service
 *   messages sem custo. Renderizada no `<SessionBar>`.
 *
 * - **Sessão de voz (Call Permission)**: autorização específica para o
 *   business ligar para o cliente via WhatsApp. Requer opt-in explícito via
 *   template (`call_permission_request`). Meta concede em duas variantes:
 *     · **Temporária** → 7 dias corridos (ligações atendidas **não estendem**).
 *     · **Permanente** → até o cliente revogar manualmente no WhatsApp.
 *   Status na nossa base: `NONE`, `REQUESTED`, `GRANTED`, `EXPIRED`, `DENIED`.
 *   `DENIED` = cliente recusou (Meta bloqueia novo pedido por 24h).
 *   Totalmente independente da Customer Service Window.
 *
 * Este chip é a fonte única da verdade do estado de voz no Inbox: faz a
 * query, monta o elemento `<audio>` remoto, expõe o picker de template e as
 * ações contextuais num dropdown. O painel grande na sidebar foi aposentado.
 */

import * as React from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { IconChevronDown as ChevronDown, IconChevronRight as ChevronRight, IconHistory as History, IconInfoCircle as Info, IconLoader2 as Loader2, IconMicrophone as Mic, IconPhone as Phone, IconPhoneIncoming as PhoneIncoming, IconPhoneOff as PhoneOff, IconPhoneOutgoing as PhoneOutgoing, IconPlayerPlay as Play, IconRefresh as RefreshCw } from "@tabler/icons-react";
import {
  CallPermissionTemplateDialog,
  type CallPermissionTemplate,
} from "@/components/inbox/call-permission-template-dialog";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSSE } from "@/hooks/use-sse";
import { emitConversationReopened, messagesKey } from "@/features/inbox-v2/hooks/use-messages";
import type { MessagesResponse } from "@/features/inbox-v2/api";
import { useWhatsappOutboundWebRtc } from "@/hooks/use-whatsapp-outbound-webrtc";
import { TooltipHost } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type ConsentType = "TEMPORARY" | "PERMANENT" | null;

type ConsentStatus =
  | "NONE"
  | "REQUESTED"
  | "GRANTED"
  | "EXPIRED"
  | "DENIED";

type CallingContext = {
  channel: string | null;
  consentStatus: ConsentStatus | null;
  consentUpdatedAt: string | null;
  consentType: ConsentType;
  consentExpiresAt: string | null;
  permissionTemplateConfigured: boolean;
  envCallPermissionTemplate: string | null;
  activeCallMetaId: string | null;
  suggestCallPermission: boolean;
};

/** 404 = org/conversa sem feature de voz. Não refetch/poll nessa conversa. */
type CallingContextMiss = { noCalling: true };
type CallingContextResult = CallingContext | CallingContextMiss;

const callingContextMisses = new Set<string>();

function isCallingMiss(d: CallingContextResult | undefined): d is CallingContextMiss {
  return !!d && "noCalling" in d;
}

/** Meta bloqueia novo request por 24h depois de um REJECT. */
const DENY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const TPL_STORAGE = "wa_call_permission_tpl";

/** Fallback para opt-ins antigos sem `consentExpiresAt`: Meta usa 7 dias. */
const TEMPORARY_FALLBACK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type RecentCallItem = {
  callId: string;
  direction: "BUSINESS_INITIATED" | "USER_INITIATED" | string;
  startedAt: string | null;
  endedAt: string | null;
  durationSec: number | null;
  status: "ringing" | "completed" | "failed" | "rejected";
  recordingUrl: string | null;
};

/** Duração curta: 0s | 45s | 2m03s | 1h12m */
function formatCallDuration(sec: number | null): string {
  if (!sec || sec <= 0) return "—";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}m${String(s).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h${String(m % 60).padStart(2, "0")}m`;
}

/** Tempo desde uma data: agora | 5min | 2h | 3d | 12/04 */
function formatTimeAgo(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  const ms = Date.now() - d.getTime();
  if (ms < 60_000) return "agora";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const day = Math.floor(h / 24);
  if (day < 7) return `${day}d`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "expirada";
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (days >= 1) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
  if (hours >= 1) {
    return minutes > 0 && hours < 6 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${Math.max(1, minutes)}m`;
}

function useConsentExpiry(
  consentStatus: CallingContext["consentStatus"],
  consentType: ConsentType,
  consentUpdatedAt: string | null,
  consentExpiresAt: string | null,
) {
  const [now, setNow] = React.useState<number>(Date.now);
  React.useEffect(() => {
    if (consentStatus !== "GRANTED") return;
    if (consentType === "PERMANENT") return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [consentStatus, consentType]);

  if (consentStatus !== "GRANTED") {
    return { expired: consentStatus === "EXPIRED", remaining: 0, isPermanent: false };
  }
  if (consentType === "PERMANENT") {
    return { expired: false, remaining: Number.POSITIVE_INFINITY, isPermanent: true };
  }
  // Temporária: prefere expiresAt do backend; senão fallback 7d.
  // Sem nenhuma data (coluna zerada após reenvio de template) NÃO
  // tratamos como expirado — o aceite na timeline ainda vale.
  const expiresAt = consentExpiresAt
    ? new Date(consentExpiresAt).getTime()
    : consentUpdatedAt
      ? new Date(consentUpdatedAt).getTime() + TEMPORARY_FALLBACK_TTL_MS
      : now + TEMPORARY_FALLBACK_TTL_MS;
  const remaining = Math.max(0, expiresAt - now);
  return { expired: remaining <= 0, remaining, isPermanent: false };
}

function inferGrantFromMessages(
  messages: { content?: string; createdAt?: string }[] | undefined,
): { permanent: boolean; at: string; expiresAt: string | null } | null {
  if (!messages?.length) return null;
  let best: { at: number; accept: boolean; permanent: boolean } | null = null;
  for (const m of messages) {
    const t = (m.content ?? "").toLowerCase();
    const at = new Date(m.createdAt ?? "").getTime();
    if (!Number.isFinite(at) || at <= 0) continue;
    const accept =
      (t.includes("✅") && t.includes("aceitou")) || t.includes("cliente aceitou");
    const deny =
      (t.includes("❌") && t.includes("recusou")) || t.includes("cliente recusou");
    if (!accept && !deny) continue;
    if (!best || at >= best.at) {
      best = { at, accept, permanent: t.includes("permanen") };
    }
  }
  if (!best?.accept) return null;
  if (best.permanent) {
    return { permanent: true, at: new Date(best.at).toISOString(), expiresAt: null };
  }
  const exp = best.at + TEMPORARY_FALLBACK_TTL_MS;
  if (exp <= Date.now()) return null;
  return {
    permanent: false,
    at: new Date(best.at).toISOString(),
    expiresAt: new Date(exp).toISOString(),
  };
}

async function fetchCallPermissionTemplates(): Promise<CallPermissionTemplate[]> {
  const r = await fetch(apiUrl(`/api/meta/whatsapp/call-permission-templates`));
  if (!r.ok) return [];
  const j = (await r.json().catch(() => ({}))) as { items?: CallPermissionTemplate[] };
  return Array.isArray(j.items) ? j.items : [];
}

export function WhatsappCallChip({
  conversationId,
  channel,
  contactName,
  variant = "chip",
}: {
  conversationId: string;
  channel: string | null | undefined;
  contactName?: string | null;
  /** `cta` = green pill in the inbox header. Compact `chip` for deal/sales-hub. */
  variant?: "chip" | "cta";
}) {
  const isCta = variant === "cta";
  const isWaVoiceChannel = channel === "whatsapp" || channel === "meta";
  const queryClient = useQueryClient();
  const key = React.useMemo(
    () => ["calling-context", conversationId] as const,
    [conversationId],
  );

  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: async (): Promise<CallingContextResult> => {
      if (callingContextMisses.has(conversationId)) {
        return { noCalling: true };
      }
      const r = await fetch(apiUrl(`/api/conversations/${conversationId}/calling-context`));
      if (r.status === 404) {
        callingContextMisses.add(conversationId);
        return { noCalling: true };
      }
      if (!r.ok) throw new Error("Erro ao carregar estado de voz");
      return r.json() as Promise<CallingContext>;
    },
    enabled: !!conversationId && isWaVoiceChannel && !callingContextMisses.has(conversationId),
    retry: false,
    staleTime: 15_000,
    // Sanity polling quando há chamada ativa: se um webhook `terminate` se
    // perder, o chip se auto-corrige em até 10s ao invés de ficar preso em
    // "Em chamada" indefinidamente. 404 = sem feature: não polla.
    refetchInterval: (q) => {
      const d = q.state.data as CallingContextResult | undefined;
      if (!d || isCallingMiss(d) || callingContextMisses.has(conversationId)) return false;
      return d.activeCallMetaId ? 10_000 : false;
    },
    refetchIntervalInBackground: false,
  });
  const callingUnavailable =
    isCallingMiss(data) || callingContextMisses.has(conversationId);
  const ctx = callingUnavailable ? undefined : data;

  const [msgTick, bumpMsgs] = React.useState(0);
  React.useEffect(() => {
    const cache = queryClient.getQueryCache();
    return cache.subscribe((ev) => {
      const k = ev.query.queryKey;
      if (k[0] === "messages" && k[1] === conversationId) bumpMsgs((n) => n + 1);
    });
  }, [queryClient, conversationId]);
  const cachedMessages = React.useMemo(
    () => queryClient.getQueryData<MessagesResponse>(messagesKey(conversationId)),
    [queryClient, conversationId, msgTick],
  );

  // Só busca templates quando a modal de envio abre (evita N+1 em inbox cheia).
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = React.useState(false);
  const templatesQuery = useQuery({
    queryKey: ["call-permission-templates"],
    queryFn: fetchCallPermissionTemplates,
    enabled: templateDialogOpen && isWaVoiceChannel,
    staleTime: 5 * 60_000,
  });

  // Histórico de chamadas (últimas 5) — fetched lazy quando o dropdown
  // abre e quando a sessão de voz precisa ser exibida. Auto-invalida via
  // SSE (mesmo handler do calling-context invalida calls-recent).
  const recentCallsKey = React.useMemo(
    () => ["whatsapp-calls-recent", conversationId] as const,
    [conversationId],
  );
  const recentCallsQuery = useQuery({
    queryKey: recentCallsKey,
    queryFn: async () => {
      const r = await fetch(apiUrl(`/api/conversations/${conversationId}/whatsapp-calls/recent?limit=5`),
      );
      if (!r.ok) return { items: [] as RecentCallItem[] };
      const j = (await r.json().catch(() => ({}))) as { items?: RecentCallItem[] };
      return { items: Array.isArray(j.items) ? j.items : [] };
    },
    enabled: menuOpen && isWaVoiceChannel,
    staleTime: 30_000,
  });

  const outbound = useWhatsappOutboundWebRtc(conversationId);
  const applyAnswerRef = React.useRef(outbound.applyAnswer);
  applyAnswerRef.current = outbound.applyAnswer;

  const remoteAudioRef = React.useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const remoteSourceRef = React.useRef<MediaStreamAudioSourceNode | null>(null);
  const [audioBlocked, setAudioBlocked] = React.useState(false);

  const unlockAudio = React.useCallback(() => {
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        audioCtxRef.current = new AC();
      }
      if (audioCtxRef.current.state === "suspended") {
        void audioCtxRef.current.resume();
      }
    } catch {
      /* ignore */
    }
    const el = remoteAudioRef.current;
    if (!el) return;
    el.muted = false;
    el.volume = 1;
    // Não chamar play() sem stream: em alguns browsers a Promise
    // fica pendente para sempre e o clique em Ligar nunca segue.
  }, []);

  React.useEffect(() => {
    const el = remoteAudioRef.current;
    const stream = outbound.remoteStream;
    if (!el) return;
    el.srcObject = stream;
    el.muted = false;
    el.volume = 1;
    if (!stream) {
      try {
        remoteSourceRef.current?.disconnect();
      } catch {
        /* ignore */
      }
      remoteSourceRef.current = null;
      setAudioBlocked(false);
      return;
    }
    setAudioBlocked(false);
    const ctx = audioCtxRef.current;
    let viaCtx = false;
    if (ctx && ctx.state !== "closed") {
      try {
        remoteSourceRef.current?.disconnect();
        const src = ctx.createMediaStreamSource(stream);
        src.connect(ctx.destination);
        remoteSourceRef.current = src;
        if (ctx.state === "suspended") void ctx.resume();
        viaCtx = true;
      } catch {
        /* elemento <audio> continua como fallback */
      }
    }
    if (viaCtx) {
      el.muted = true;
      setAudioBlocked(false);
    } else {
      void el.play().catch(() => setAudioBlocked(true));
    }
  }, [outbound.remoteStream]);

  React.useEffect(() => {
    if (outbound.phase !== "live") return;
    const el = remoteAudioRef.current;
    if (!el || !outbound.remoteStream) return;
    el.muted = false;
    el.volume = 1;
    void el.play().then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true));
    if (audioCtxRef.current?.state === "suspended") {
      void audioCtxRef.current.resume();
    }
  }, [outbound.phase, outbound.remoteStream]);

  const resetOutbound = outbound.reset;
  const resetOutboundRef = React.useRef(resetOutbound);
  resetOutboundRef.current = resetOutbound;
  React.useEffect(() => {
    resetOutboundRef.current();
  }, [conversationId]);

  // Quando a fase WebRTC local sai de "live"/"need_answer" (chamada encerrada
  // por qualquer lado), revalida o calling-context imediatamente para tirar o
  // chip do estado "Em chamada" sem esperar polling/SSE.
  const prevPhaseRef = React.useRef<string>(outbound.phase);
  React.useEffect(() => {
    const prev = prevPhaseRef.current;
    const cur = outbound.phase;
    const wasActive = prev === "live" || prev === "need_answer";
    const isActive = cur === "live" || cur === "need_answer";
    if (wasActive && !isActive && !callingContextMisses.has(conversationId)) {
      queryClient.invalidateQueries({ queryKey: key });
    }
    prevPhaseRef.current = cur;
  }, [outbound.phase, queryClient, key]);

  useSSE(
    "/api/sse/messages",
    React.useCallback(
      (event: string, evtData: unknown) => {
        if (event === "whatsapp_call") {
          const p = evtData as {
            conversationId?: string;
            callId?: string;
            session?: { sdp_type?: string; sdp?: string };
          };
          if (
            p.callId &&
            p.session?.sdp_type?.toLowerCase() === "answer" &&
            p.session.sdp &&
            (p.conversationId === conversationId || p.callId === outbound.activeCallId)
          ) {
            void applyAnswerRef.current(p.callId, p.session.sdp);
          }
        }
        if (
          event === "new_message" ||
          event === "whatsapp_call" ||
          event === "conversation_updated"
        ) {
          const p = evtData as { conversationId?: string };
          if (p.conversationId === conversationId) {
            if (!callingContextMisses.has(conversationId)) {
              queryClient.invalidateQueries({ queryKey: key });
            }
            // Histórico de chamadas também precisa atualizar quando
            // chega evento de chamada (terminate, recording etc).
            queryClient.invalidateQueries({ queryKey: recentCallsKey });
          }
        }
      },
      [conversationId, queryClient, key, recentCallsKey, outbound.activeCallId],
    ),
    !!conversationId && isWaVoiceChannel,
  );

  const requestPermission = useMutation({
    mutationFn: async (chosenTemplate?: string) => {
      let stored = "";
      try {
        stored = sessionStorage.getItem(TPL_STORAGE)?.trim() ?? "";
      } catch {
        /* ignore */
      }
      const envTpl = (ctx?.envCallPermissionTemplate ?? "").trim();
      const templateName = (chosenTemplate ?? "").trim() || envTpl || stored;
      if (!templateName) {
        throw new Error(
          "Configure um template aprovado da Meta em Configurações → WhatsApp Templates.",
        );
      }
      const tpl = (templatesQuery.data ?? []).find((t) => t.name === templateName);
      const r = await fetch(apiUrl("/wa-call-permission"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId,
            templateName,
            languageCode: tpl?.language || "pt_BR",
            bodyText: tpl?.bodyText,
            headerText: tpl?.headerText,
            footerText: tpl?.footerText,
            buttons: tpl?.buttons,
          }),
        },
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const fromApi = typeof j?.message === "string" ? j.message.trim() : "";
        throw new Error(
          fromApi ||
            (r.status === 502 || r.status === 504
              ? "O servidor não respondeu a tempo ao enviar o template. Tente novamente."
              : "Erro ao enviar solicitação"),
        );
      }
      // Guarda último template usado para virar default rápido na próxima vez.
      try {
        sessionStorage.setItem(TPL_STORAGE, templateName);
      } catch {
        /* ignore */
      }
      return j as { pending?: boolean; reopenedConversationId?: string };
    },
    onSuccess: (j) => {
      toast.success(
        j?.pending
          ? "Enviando template de ligação…"
          : "Solicitação de voz enviada ao cliente",
      );
      setTemplateDialogOpen(false);
      setMenuOpen(false);
      if (typeof j?.reopenedConversationId === "string" && j.reopenedConversationId) {
        emitConversationReopened(j.reopenedConversationId);
        queryClient.invalidateQueries({
          queryKey: messagesKey(j.reopenedConversationId),
        });
      }
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: messagesKey(conversationId) });
      queryClient.invalidateQueries({ queryKey: ["inbox-conversations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const terminateCall = useMutation({
    mutationFn: async (callId: string) => {
      return postWhatsappCall(conversationId, { action: "terminate", call_id: callId });
    },
    onSuccess: () => {
      toast.success("Chamada encerrada");
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const apiCs = ctx?.consentStatus ?? "NONE";
  const inferred = inferGrantFromMessages(cachedMessages?.messages);
  const expiryApi = useConsentExpiry(
    apiCs,
    ctx?.consentType ?? null,
    ctx?.consentUpdatedAt ?? null,
    ctx?.consentExpiresAt ?? null,
  );
  const expiryInf = useConsentExpiry(
    inferred ? "GRANTED" : "NONE",
    inferred?.permanent ? "PERMANENT" : "TEMPORARY",
    inferred?.at ?? null,
    inferred?.expiresAt ?? null,
  );
  const apiGrantedLive = apiCs === "GRANTED" && !expiryApi.expired;
  const cs: ConsentStatus =
    apiCs === "DENIED"
      ? "DENIED"
      : apiGrantedLive
        ? "GRANTED"
        : inferred
          ? "GRANTED"
          : apiCs;
  const expiry = cs === "GRANTED" && !apiGrantedLive && inferred ? expiryInf : expiryApi;

  // ── State local de UI ──────────────────────────────────────
  // IMPORTANTE: estes hooks precisam ficar ANTES de qualquer early
  // return condicional (`if (channel !== "whatsapp") return null` logo
  // abaixo) para nao violar Rules of Hooks. Qualquer logica que dependa
  // de `channel === "whatsapp"` deve filtrar via `enabled`/no efeito,
  // nunca via short-circuit antes do hook.
  const [howItWorksOpen, setHowItWorksOpen] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  /** URL atualmente em playback no mini-player — null = nada tocando. */
  const [playingRecordingUrl, setPlayingRecordingUrl] = React.useState<string | null>(null);
  const recordingPlayerRef = React.useRef<HTMLAudioElement | null>(null);
  React.useEffect(() => {
    const el = recordingPlayerRef.current;
    if (!el) return;
    if (playingRecordingUrl) {
      el.src = playingRecordingUrl;
      void el.play().catch(() => setPlayingRecordingUrl(null));
    } else {
      el.pause();
      el.removeAttribute("src");
      el.load();
    }
  }, [playingRecordingUrl]);
  // Para playback ao fechar o menu — evita áudio órfão.
  React.useEffect(() => {
    if (!menuOpen) setPlayingRecordingUrl(null);
  }, [menuOpen]);

  if (!isWaVoiceChannel || callingUnavailable) return null;
  const effectivelyExpired =
    cs === "EXPIRED" || (cs === "GRANTED" && !expiry.isPermanent && expiry.expired);
  const activeCallId = ctx?.activeCallMetaId ?? null;
  const hasActiveCall =
    !!activeCallId || outbound.phase === "live" || outbound.phase === "need_answer";

  // Janela de cooldown de 24h imposta pela Meta após um DENIED — enquanto
  // estiver dentro dela, re-solicitar voz é garantido falhar, então a UI
  // travamos o botão e mostramos o tempo restante.
  const denyCooldown = (() => {
    if (cs !== "DENIED" || !ctx?.consentUpdatedAt) {
      return { active: false, remainingMs: 0 };
    }
    const since = new Date(ctx.consentUpdatedAt).getTime();
    const remainingMs = DENY_COOLDOWN_MS - (Date.now() - since);
    return { active: remainingMs > 0, remainingMs: Math.max(0, remainingMs) };
  })();

  // ── Label do trigger (ícone Phone é fixo no JSX) ───────────────
  type Tone = { label: string };

  const tone: Tone = (() => {
    if (outbound.isInitiating) {
      return { label: "Conectando…" };
    }
    if (outbound.phase === "live") {
      return { label: "Em chamada" };
    }
    if (outbound.phase === "need_answer") {
      return { label: "Chamando…" };
    }
    if (hasActiveCall) {
      return { label: "Em chamada" };
    }
    if (cs === "DENIED") {
      return {
        label: denyCooldown.active
          ? `Bloqueado · ${formatRemaining(denyCooldown.remainingMs)}`
          : "Recusado",
      };
    }
    if (effectivelyExpired) {
      return { label: "Expirado" };
    }
    if (cs === "GRANTED") {
      if (isCta) return { label: "Fazer Chamada" };
      return {
        label: expiry.isPermanent
          ? "Voz ativa"
          : `Voz · ${formatRemaining(expiry.remaining)}`,
      };
    }
    if (cs === "REQUESTED") {
      return { label: "Aguardando" };
    }
    return { label: isCta ? "Fazer Chamada" : "Ligar" };
  })();

  const canInitiate =
    cs === "GRANTED" &&
    !effectivelyExpired &&
    !hasActiveCall &&
    (outbound.phase === "idle" || outbound.phase === "error");

  const canRequest =
    !hasActiveCall &&
    !outbound.isInitiating &&
    (cs === "NONE" ||
      effectivelyExpired ||
      (cs === "DENIED" && !denyCooldown.active));

  const canTerminate =
    hasActiveCall &&
    (outbound.activeCallId || activeCallId) &&
    !terminateCall.isPending;

  const initiate = async () => {
    unlockAudio();
    const r = await outbound.initiate();
    if (r.ok) {
      toast.success("Pedido aceito pela Meta. Aguarde…");
      queryClient.invalidateQueries({ queryKey: messagesKey(conversationId) });
      queryClient.invalidateQueries({ queryKey: recentCallsKey });
    } else if (r.error) toast.error(r.error);
  };

  const handleTerminate = () => {
    const id = outbound.activeCallId || activeCallId;
    if (!id) return;
    if (outbound.activeCallId) void outbound.terminate();
    else terminateCall.mutate(id);
  };

  const activateAudio = () => {
    void unlockAudio();
    const el = remoteAudioRef.current;
    if (el) {
      el.muted = audioCtxRef.current?.state === "running";
      void el.play().then(() => setAudioBlocked(false)).catch(() => {});
    }
    if (audioCtxRef.current?.state === "suspended") {
      void audioCtxRef.current.resume().then(() => setAudioBlocked(false));
    }
  };

  if (isLoading) {
    return isCta ? (
      <span className="inline-flex size-11 shrink-0 items-center justify-center" aria-label="Enviar template de ligação">
        <Loader2 className="size-5 animate-spin text-emerald-500" />
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-2.5 py-1 text-[12px] font-semibold text-ink-subtle">
        <Loader2 className="size-3.5 animate-spin" />
        Voz…
      </span>
    );
  }

  const pickerBody = (
    <>
          {!isCta ? (
            <>
              <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-ink-subtle">
                Sessão de voz
              </div>
              <div className="my-1 h-px bg-border" />
            </>
          ) : null}

          {canInitiate && (
            <button type="button"
              onClick={initiate}
              className="flex w-full items-center gap-2 px-2 py-1.5 text-[13px] text-success hover:bg-muted focus:bg-muted"
            >
              <Phone className="size-3.5" />
              Ligar agora
            </button>
          )}

          {canTerminate && (
            <button type="button"
              onClick={handleTerminate}
              className="flex w-full items-center gap-2 px-2 py-1.5 text-[13px] text-destructive hover:bg-muted focus:bg-muted"
            >
              <PhoneOff className="size-3.5" />
              Encerrar chamada
            </button>
          )}

          {/* Info contextual quando GRANTED mas permanente/temporária */}
          {cs === "GRANTED" && !effectivelyExpired && (
            <div className="px-2 pb-1 pt-0.5 text-[11px] leading-snug text-[var(--color-ink-soft)]">
              {expiry.isPermanent ? (
                <>
                  <span className="font-semibold text-success">Permissão permanente.</span>{" "}
                  Cliente pode revogar a qualquer momento nas configurações do WhatsApp.
                </>
              ) : (
                <>
                  <span className="font-semibold text-success">
                    Permissão temporária (7 dias).
                  </span>{" "}
                  Atender ligação <em>não</em> estende o prazo.
                </>
              )}
            </div>
          )}

          {(canRequest || (isCta && cs === "REQUESTED")) && (
            <>
              {canRequest && !isCta && (
                <button type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setTemplateDialogOpen(true);
                  }}
                  disabled={requestPermission.isPending}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-[13px] hover:bg-muted focus:bg-muted"
                >
                  {requestPermission.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Phone className="size-3.5" />
                  )}
                  {effectivelyExpired ? "Solicitar voz novamente" : "Solicitar voz"}
                </button>
              )}

              {!isCta && (
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-[13px] outline-none hover:bg-muted focus:bg-muted"
                  onClick={() => {
                    setMenuOpen(false);
                    setTemplateDialogOpen(true);
                  }}
                >
                  <span className="flex items-center gap-2">
                    <ChevronRight className="size-3.5" />
                    Escolher template
                  </span>
                </button>
              )}
            </>
          )}

          {cs === "DENIED" && denyCooldown.active && (
            <button type="button"
              disabled
              className="flex w-full items-center gap-2 px-2 py-1.5 text-[13px] text-destructive opacity-100 hover:bg-muted focus:bg-muted"
            >
              <PhoneOff className="size-3.5" />
              <span className="flex flex-col gap-0.5">
                <span>Cliente recusou · bloqueio de 24h</span>
                <span className="text-[10px] font-normal text-ink-muted">
                  Novo pedido liberado em {formatRemaining(denyCooldown.remainingMs)}
                </span>
              </span>
            </button>
          )}

          {cs === "REQUESTED" && (
            <>
              <button type="button"
                disabled
                className="flex w-full items-center gap-2 px-2 py-1.5 text-[13px] text-ink-muted opacity-100 hover:bg-muted focus:bg-muted"
              >
                <Loader2 className="size-3.5 animate-spin text-info" />
                Aguardando cliente autorizar
              </button>
                  {!isCta && (
                <button type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setTemplateDialogOpen(true);
                  }}
                  disabled={requestPermission.isPending}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-[13px] hover:bg-muted focus:bg-muted"
                >
                  <RefreshCw
                    className={cn(
                      "size-3.5",
                      requestPermission.isPending && "animate-spin",
                    )}
                  />
                  Reenviar solicitação
                </button>
              )}
            </>
          )}

          {outbound.phase === "live" && audioBlocked && (
            <>
              <div className="my-1 h-px bg-border" />
              <button type="button"
                onClick={activateAudio}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-[13px] text-warning hover:bg-muted focus:bg-muted"
              >
                <Mic className="size-3.5" />
                Ativar som da chamada
              </button>
            </>
          )}

          {outbound.errorMsg && (
            <>
              <div className="my-1 h-px bg-border" />
              <div className="px-2 py-1.5 text-[11px] leading-snug text-destructive">
                {outbound.errorMsg}
              </div>
            </>
          )}

          {/* ── Histórico das últimas 5 chamadas ──────────────── */}
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setHistoryOpen((v) => !v);
            }}
            className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-[13px] outline-none hover:bg-muted focus:bg-muted"
          >
            <History className="size-3.5" />
            <span>Últimas chamadas</span>
            {recentCallsQuery.isFetching ? (
              <Loader2 className="ml-auto size-3 animate-spin text-[var(--color-ink-muted)]" />
            ) : (
              <span className="ml-auto flex items-center gap-1.5">
                {recentCallsQuery.data?.items?.length ? (
                  <span className="rounded-full bg-muted px-1.5 text-[10px] font-bold text-ink-muted">
                    {recentCallsQuery.data.items.length}
                  </span>
                ) : null}
                <ChevronRight
                  className={cn(
                    "size-3.5 transition-transform",
                    historyOpen && "rotate-90",
                  )}
                />
              </span>
            )}
          </button>
          {historyOpen && (
            <div className="max-h-[280px] overflow-y-auto px-1 pb-1">
              {recentCallsQuery.isLoading ? (
                <div className="px-2 py-3 text-center text-[11px] text-[var(--color-ink-muted)]">
                  <Loader2 className="mx-auto size-3.5 animate-spin" />
                  <p className="mt-1">Carregando…</p>
                </div>
              ) : (recentCallsQuery.data?.items ?? []).length === 0 ? (
                <div className="px-2 py-2 text-[11px] text-ink-muted">
                  Nenhuma chamada registrada nesta conversa.
                </div>
              ) : (
                (recentCallsQuery.data?.items ?? []).map((call) => {
                  const isOut = call.direction === "BUSINESS_INITIATED";
                  const Icon = isOut ? PhoneOutgoing : PhoneIncoming;
                  const sideLabel = isOut ? "Saída" : "Entrada";
                  const sideClass = isOut ? "text-primary" : "text-success";
                  const statusLabel = (() => {
                    if (call.status === "completed") return "completada";
                    if (call.status === "failed") return "falhou";
                    if (call.status === "rejected") return "não atendida";
                    return "tocando";
                  })();
                  const statusTint = (() => {
                    if (call.status === "completed") return "text-success";
                    if (call.status === "failed") return "text-destructive";
                    if (call.status === "rejected") return "text-warning";
                    return "text-info";
                  })();
                  const isPlaying = playingRecordingUrl === call.recordingUrl;
                  return (
                    <div
                      key={call.callId}
                      className="rounded-md px-2 py-1.5 hover:bg-muted focus:bg-muted"
                    >
                      <div className="flex items-center gap-2">
                        <Icon className={cn("size-3.5 shrink-0", sideClass)} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-[11px] font-bold text-foreground">
                              {sideLabel}
                            </span>
                            <span className="text-[10px] text-[var(--color-ink-muted)]">·</span>
                            <span className={cn("text-[10px] font-semibold uppercase tracking-wide", statusTint)}>
                              {statusLabel}
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-ink-muted">
                            <span className="tabular-nums">
                              {formatTimeAgo(call.endedAt ?? call.startedAt)}
                            </span>
                            <span className="text-ink-subtle">·</span>
                            <span className="tabular-nums">
                              {formatCallDuration(call.durationSec)}
                            </span>
                          </div>
                        </div>
                        {call.recordingUrl ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setPlayingRecordingUrl((cur) =>
                                cur === call.recordingUrl ? null : call.recordingUrl,
                              );
                            }}
                            className={cn(
                              "shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide transition-all",
                              isPlaying
                                ? "bg-success text-white shadow-sm"
                                : "bg-foreground text-white hover:bg-ink-soft",
                            )}
                            aria-label={isPlaying ? "Parar gravação" : "Ouvir gravação"}
                          >
                            <span className="inline-flex items-center gap-1">
                              <Play className="size-2.5" />
                              {isPlaying ? "Tocando" : "Ouvir"}
                            </span>
                          </button>
                        ) : (
                          <TooltipHost label="Sem gravação disponível" side="left">
                            <span className="shrink-0 text-[10px] font-medium text-ink-subtle">
                              sem áudio
                            </span>
                          </TooltipHost>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <audio
                ref={recordingPlayerRef}
                onEnded={() => setPlayingRecordingUrl(null)}
                className="hidden"
                aria-hidden
              />
            </div>
          )}

          {/* ── Como funciona ──────────────────────────────── */}
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setHowItWorksOpen((v) => !v);
            }}
            className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-[13px] outline-none hover:bg-muted focus:bg-muted"
          >
            <Info className="size-3.5" />
            <span>Como funciona a permissão</span>
            <ChevronRight
              className={cn(
                "ml-auto size-3.5 transition-transform",
                howItWorksOpen && "rotate-90",
              )}
            />
          </button>
          {howItWorksOpen && (
            <div className="space-y-1.5 px-3 pb-2 text-[11px] leading-snug text-[var(--color-ink-soft)]">
              <p>
                <span className="font-semibold text-success">Sempre permitir:</span>{" "}
                permanente, vale até o cliente revogar manualmente no WhatsApp.
              </p>
              <p>
                <span className="font-semibold text-success">Temporária:</span>{" "}
                <strong>7 dias</strong> corridos. Ligações atendidas <em>não estendem</em>{" "}
                o prazo.
              </p>
              <p>
                <span className="font-semibold text-destructive">Recusa:</span> Meta bloqueia
                novo pedido por <strong>24h</strong>.
              </p>
              <a
                href="https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/marketing-templates/call-permission-request-message-template"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-[10px] text-primary underline-offset-2 hover:underline"
              >
                Documentação oficial da Meta →
              </a>
            </div>
          )}
    </>
  );

  return (
    <>
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        className="pointer-events-none fixed bottom-0 left-0 h-px w-px opacity-[0.01]"
        aria-hidden
      />
      {isCta ? (
        <>
          {canTerminate ? (
            <>
              {outbound.phase === "live" && audioBlocked ? (
                <TooltipHost label="Ativar som da chamada" side="bottom">
                  <button
                    type="button"
                    className="relative inline-flex size-11 shrink-0 items-center justify-center overflow-visible outline-none transition-transform hover:scale-105"
                    aria-label="Ativar som da chamada"
                    onClick={() => void activateAudio()}
                  >
                    <span className="flex size-10 items-center justify-center rounded-full bg-amber-500 shadow-[0_4px_14px_rgba(245,158,11,0.4)]">
                      <Mic className="size-5 text-white" strokeWidth={2.4} />
                    </span>
                  </button>
                </TooltipHost>
              ) : null}
              <TooltipHost label="Encerrar chamada" side="bottom">
              <button
                type="button"
                className="relative inline-flex size-11 shrink-0 items-center justify-center overflow-visible outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-red-500/50"
                aria-label="Encerrar chamada"
                onClick={handleTerminate}
              >
                <span className="flex size-10 items-center justify-center rounded-full bg-red-500 shadow-[0_4px_14px_rgba(239,68,68,0.4)]">
                  <PhoneOff className="size-5 text-white" strokeWidth={2.4} />
                </span>
              </button>
            </TooltipHost>
            </>
          ) : (
            <TooltipHost
              label={
                outbound.isInitiating || outbound.phase === "need_answer"
                  ? "Chamando…"
                  : canInitiate
                    ? "Ligar pelo WhatsApp"
                    : cs === "REQUESTED"
                      ? "Aguardando o cliente permitir no WhatsApp"
                      : cs === "DENIED" && denyCooldown.active
                        ? `Recusado · novo pedido em ${formatRemaining(denyCooldown.remainingMs)}`
                        : "Peça permissão no + → Pedir permissão de ligação"
              }
              side="bottom"
            >
              <button
                type="button"
                className="relative inline-flex size-11 shrink-0 items-center justify-center overflow-visible outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-emerald-500/50 disabled:hover:scale-100 disabled:opacity-100"
                aria-label={canInitiate ? "Ligar pelo WhatsApp" : "Ligação indisponível"}
                disabled={!canInitiate || outbound.isInitiating}
                onClick={() => {
                  if (canInitiate) void initiate();
                }}
              >
                <span
                  className="flex size-10 items-center justify-center rounded-full"
                  style={
                    canInitiate || outbound.isInitiating || outbound.phase === "need_answer"
                      ? {
                          background: "#25D366",
                          boxShadow: "0 4px 14px rgba(37, 211, 102, 0.4)",
                        }
                      : {
                          background: "color-mix(in srgb, var(--color-ink-subtle) 18%, transparent)",
                          boxShadow: "none",
                        }
                  }
                >
                  {outbound.isInitiating || outbound.phase === "need_answer" ? (
                    <Loader2 className="size-5 animate-spin text-white" />
                  ) : (
                    <Phone
                      className={
                        canInitiate ? "size-5 text-white" : "size-5 text-[var(--color-ink-subtle)]"
                      }
                      strokeWidth={2.4}
                    />
                  )}
                </span>
              </button>
            </TooltipHost>
          )}
        </>
      ) : (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
              (cs === "GRANTED" && !effectivelyExpired) ||
                hasActiveCall ||
                outbound.phase === "live" ||
                outbound.phase === "need_answer"
                ? "border-success/20 bg-success-soft text-success hover:bg-success-soft"
                : cs === "DENIED" || effectivelyExpired
                  ? "border-destructive/20 bg-destructive-soft text-destructive hover:bg-destructive-soft"
                  : cs === "REQUESTED"
                    ? "border-primary/20 bg-primary-soft text-info hover:bg-primary-soft"
                    : "border-black/10 bg-white text-ink-subtle hover:bg-muted",
            )}
            aria-label="Estado da sessão de voz"
          >
            <Phone
              className={cn(
                "size-3.5",
                (cs === "GRANTED" && !effectivelyExpired) ||
                  hasActiveCall ||
                  outbound.phase === "live"
                  ? "text-success"
                  : cs === "DENIED" || effectivelyExpired
                    ? "text-destructive"
                    : cs === "REQUESTED"
                      ? "text-[var(--color-sky)]"
                      : "text-ink-subtle",
              )}
              strokeWidth={2.2}
            />
            <span className="whitespace-nowrap tabular-nums">{tone.label}</span>
            <ChevronDown className="size-3 opacity-50" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="z-50 min-w-[280px] rounded-xl border border-black/5 bg-white p-1 shadow-[0_8px_32px_rgba(0,0,0,0.10)]"
          >
            {pickerBody}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <CallPermissionTemplateDialog
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        contactName={contactName}
        templates={templatesQuery.data ?? []}
        loading={templatesQuery.isLoading}
        sending={requestPermission.isPending}
        onSubmit={(name) => requestPermission.mutate(name)}
      />
    </>
  );
}
