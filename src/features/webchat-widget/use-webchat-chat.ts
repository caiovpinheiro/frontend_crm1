"use client";

/**
 * Estado do chat do visitante: sessão (token no localStorage do iframe,
 * renovado com `POST /session` a cada carga antes do 1º poll),
 * envio otimista com `clientMessageId`, polling `GET /messages?after=`
 * (3 s com o painel aberto, 10 s fechado, pausado com a aba oculta),
 * typing com debounce, recibos (`POST /read`) e contagem de não lidas.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createWebchatSession,
  identifyWebchatVisitor,
  markWebchatRead,
  pollWebchatMessages,
  sendWebchatMessage,
  sendWebchatTyping,
  WebchatApiError,
  type WebchatIdentity,
} from "./api";
import { utmFromUrl, type PageInfo } from "./protocol";
import { WEBCHAT_MAX_CONTENT, type WebchatMessage } from "./types";

export const POLL_OPEN_MS = 3000;
export const POLL_CLOSED_MS = 10000;
const TYPING_THROTTLE_MS = 3000;
const TYPING_IDLE_MS = 4000;

export type StoredSession = {
  token: string;
  visitorId: string;
  identified: boolean;
  name?: string;
  email?: string;
  phone?: string;
  lastSeenOutAt?: string;
};

export type UiMessage = WebchatMessage & { local?: "pending" | "failed" };

export function storageKey(publicKey: string): string {
  return `bwipo-webchat:v1:${publicKey}`;
}

export function readStoredSession(publicKey: string): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(storageKey(publicKey));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<StoredSession>;
    if (typeof v.token !== "string" || typeof v.visitorId !== "string") return null;
    return { identified: false, ...v } as StoredSession;
  } catch {
    return null;
  }
}

function writeStoredSession(publicKey: string, value: StoredSession | null) {
  try {
    if (value) window.localStorage.setItem(storageKey(publicKey), JSON.stringify(value));
    else window.localStorage.removeItem(storageKey(publicKey));
  } catch {
    /* storage bloqueado (modo privado / 3rd-party) — segue só em memória */
  }
}

export function newClientMessageId(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  if (c) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Junta mensagens do servidor às locais (troca a otimista pela real). */
export function mergeMessages(prev: UiMessage[], incoming: WebchatMessage[]): UiMessage[] {
  if (!incoming.length) return prev;
  let next = prev;
  for (const msg of incoming) {
    next = next.filter(
      (m) =>
        m.id !== msg.id &&
        !(msg.clientMessageId && m.clientMessageId === msg.clientMessageId),
    );
    next = [...next, msg];
  }
  return [...next].sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
  );
}

type Options = {
  publicKey: string;
  /** Polling/sessão só rodam com `enabled` (gate de origem aprovado). */
  enabled: boolean;
  panelVisible: boolean;
  host: string | null;
  pageInfo: PageInfo | null;
};

export function useWebchatChat({ publicKey, enabled, panelVisible, host, pageInfo }: Options) {
  const [stored, setStored] = useState<StoredSession | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [agentTyping, setAgentTyping] = useState(false);
  const [agentReadAt, setAgentReadAt] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [docVisible, setDocVisible] = useState(true);
  /** Sessão salva já renovada nesta carga (ou não havia sessão). */
  const [sessionReady, setSessionReady] = useState(false);

  const storedRef = useRef<StoredSession | null>(null);
  const cursorRef = useRef<string | null>(null);
  const sessionPromiseRef = useRef<Promise<StoredSession> | null>(null);
  const panelVisibleRef = useRef(panelVisible);
  const pollNowRef = useRef<() => void>(() => {});
  const typingSentAtRef = useRef(0);
  const typingStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const messagesRef = useRef<UiMessage[]>([]);

  useEffect(() => {
    panelVisibleRef.current = panelVisible;
    messagesRef.current = messages;
  }, [panelVisible, messages]);

  const persist = useCallback(
    (next: StoredSession | null) => {
      storedRef.current = next;
      setStored(next);
      writeStoredSession(publicKey, next);
    },
    [publicKey],
  );

  // Sessão salva (só no client — localStorage).
  useEffect(() => {
    const s = readStoredSession(publicKey);
    storedRef.current = s;
    setStored(s);
    if (!s) setHistoryLoaded(true);
  }, [publicKey]);

  useEffect(() => {
    const onVis = () => setDocVisible(!document.hidden);
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const resetSession = useCallback(() => {
    persist(null);
    cursorRef.current = null;
    setMessages([]);
    setAgentReadAt(null);
    setAgentTyping(false);
  }, [persist]);

  const ensureSession = useCallback(
    async (identity?: WebchatIdentity): Promise<StoredSession> => {
      if (storedRef.current && !identity) return storedRef.current;
      if (sessionPromiseRef.current && !identity) return sessionPromiseRef.current;
      const run = async () => {
        const prev = storedRef.current;
        const page = pageInfo?.page ?? (host ? undefined : window.location.href);
        const body = {
          key: publicKey,
          page,
          referrer: pageInfo?.referrer ?? (host ? undefined : document.referrer || undefined),
          utm: utmFromUrl(page),
          host,
          ...identity,
        };
        let res;
        try {
          res = await createWebchatSession(body, prev?.token);
        } catch (e) {
          if (!(e instanceof WebchatApiError) || e.status !== 401 || !prev) throw e;
          // Token não renovável: começa uma sessão nova (visitorId sozinho
          // não retoma a antiga — regra do backend).
          cursorRef.current = null;
          setMessages([]);
          res = await createWebchatSession(body, null);
        }
        const sameVisitor = prev?.visitorId === res.visitorId;
        const next: StoredSession = {
          token: res.token,
          visitorId: res.visitorId,
          identified: res.identified || (sameVisitor && Boolean(prev?.identified)),
          name: identity?.name ?? res.contact?.name ?? (sameVisitor ? prev?.name : undefined),
          email: identity?.email ?? res.contact?.email ?? (sameVisitor ? prev?.email : undefined),
          phone: identity?.phone ?? res.contact?.phone ?? (sameVisitor ? prev?.phone : undefined),
          lastSeenOutAt: sameVisitor ? prev?.lastSeenOutAt : undefined,
        };
        persist(next);
        return next;
      };
      const p = run();
      sessionPromiseRef.current = p;
      try {
        return await p;
      } finally {
        if (sessionPromiseRef.current === p) sessionPromiseRef.current = null;
      }
    },
    [host, pageInfo, persist, publicKey],
  );

  const poll = useCallback(async () => {
    const st = storedRef.current;
    if (!st) return;
    try {
      // `hasMore` (com `after`) = ainda há mensagens seguintes: busca já.
      for (let page = 0; page < 5; page++) {
        const res = await pollWebchatMessages(st.token, cursorRef.current);
        if (storedRef.current?.visitorId !== st.visitorId) return;
        if (res.messages.length) setMessages((prev) => mergeMessages(prev, res.messages));
        const hadCursor = cursorRef.current !== null;
        cursorRef.current =
          res.cursor ?? res.messages[res.messages.length - 1]?.id ?? cursorRef.current;
        setAgentTyping(res.agentTyping);
        if (res.agentReadAt) setAgentReadAt(res.agentReadAt);
        setHistoryLoaded(true);
        if (!hadCursor || !res.hasMore || !res.messages.length) break;
      }
    } catch (e) {
      if (e instanceof WebchatApiError && (e.status === 401 || e.status === 403)) {
        resetSession();
        setHistoryLoaded(true);
      }
    }
  }, [resetSession]);

  // Renova o token salvo uma vez por carga (antes do 1º poll: um token
  // vencido-mas-autêntico renova aqui em vez de virar 401 no polling).
  const visitorId = stored?.visitorId ?? null;
  const renewedRef = useRef(false);
  useEffect(() => {
    if (!enabled || renewedRef.current) return;
    const st = storedRef.current;
    renewedRef.current = true;
    if (!st) {
      // Sem sessão salva: nada a renovar (a 1ª é criada no envio/pré-chat).
      setSessionReady(true);
      return;
    }
    ensureSession({})
      .catch((e) => {
        if (e instanceof WebchatApiError && (e.status === 401 || e.status === 403)) {
          resetSession();
          setHistoryLoaded(true);
        }
      })
      .finally(() => setSessionReady(true));
  }, [enabled, visitorId, ensureSession, resetSession]);

  // Loop de polling (um por visitante; o token é lido do ref a cada poll).
  useEffect(() => {
    if (!enabled || !sessionReady || !visitorId) return;
    let cancelled = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = async () => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        if (!document.hidden) await poll();
      } finally {
        inFlight = false;
      }
      if (!cancelled && !document.hidden) {
        timer = setTimeout(run, panelVisibleRef.current ? POLL_OPEN_MS : POLL_CLOSED_MS);
      }
    };
    pollNowRef.current = () => void run();
    const onVis = () => {
      if (!document.hidden) void run();
      else if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
    document.addEventListener("visibilitychange", onVis);
    void run();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
      pollNowRef.current = () => {};
    };
  }, [enabled, sessionReady, visitorId, poll]);

  // Abriu o painel → busca já (sem esperar os 10 s do modo fechado).
  useEffect(() => {
    if (panelVisible) pollNowRef.current();
  }, [panelVisible]);

  const stopTyping = useCallback(() => {
    if (typingStopRef.current) clearTimeout(typingStopRef.current);
    typingStopRef.current = null;
    if (!typingSentAtRef.current) return;
    typingSentAtRef.current = 0;
    const st = storedRef.current;
    if (st) void sendWebchatTyping(st.token, false).catch(() => {});
  }, []);

  const notifyTyping = useCallback(() => {
    const st = storedRef.current;
    if (!st) return; // não cria sessão só por digitar
    const now = Date.now();
    if (now - typingSentAtRef.current > TYPING_THROTTLE_MS) {
      typingSentAtRef.current = now;
      void sendWebchatTyping(st.token, true).catch(() => {});
    }
    if (typingStopRef.current) clearTimeout(typingStopRef.current);
    typingStopRef.current = setTimeout(stopTyping, TYPING_IDLE_MS);
  }, [stopTyping]);

  useEffect(() => () => {
    if (typingStopRef.current) clearTimeout(typingStopRef.current);
  }, []);

  const deliver = useCallback(
    async (msg: UiMessage) => {
      try {
        const st = await ensureSession();
        const saved = await sendWebchatMessage(st.token, {
          clientMessageId: msg.clientMessageId ?? newClientMessageId(),
          content: msg.content,
        });
        setMessages((prev) =>
          saved
            ? mergeMessages(prev, [saved])
            : prev.map((m) =>
                m.id === msg.id ? { ...m, local: undefined, status: "sent" } : m,
              ),
        );
        pollNowRef.current();
        return true;
      } catch {
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.id ? { ...m, local: "failed" } : m)),
        );
        return false;
      }
    },
    [ensureSession],
  );

  const send = useCallback(
    async (content: string) => {
      const text = content.trim().slice(0, WEBCHAT_MAX_CONTENT);
      if (!text) return false;
      stopTyping();
      const clientMessageId = newClientMessageId();
      const optimistic: UiMessage = {
        id: `local:${clientMessageId}`,
        clientMessageId,
        direction: "in",
        content: text,
        createdAt: new Date().toISOString(),
        status: null,
        local: "pending",
      };
      setMessages((prev) => [...prev, optimistic]);
      return deliver(optimistic);
    },
    [deliver, stopTyping],
  );

  const retry = useCallback(
    (id: string) => {
      const found = messagesRef.current.find((m) => m.id === id);
      if (!found) return;
      const target: UiMessage = { ...found, local: "pending" };
      setMessages((prev) => prev.map((m) => (m.id === id ? target : m)));
      void deliver(target);
    },
    [deliver],
  );

  const identify = useCallback(
    async (identity: WebchatIdentity) => {
      const clean: WebchatIdentity = {};
      if (identity.name?.trim()) clean.name = identity.name.trim().slice(0, 120);
      if (identity.email?.trim()) clean.email = identity.email.trim().slice(0, 200);
      if (identity.phone?.trim()) clean.phone = identity.phone.trim().slice(0, 40);
      const st = storedRef.current;
      if (!st) {
        await ensureSession(clean);
        return;
      }
      const res = await identifyWebchatVisitor(st.token, clean);
      const cur = storedRef.current ?? st;
      persist({ ...cur, ...(res.token ? { token: res.token } : {}), identified: true, ...clean });
    },
    [ensureSession, persist],
  );

  const lastSeenOutAt = stored?.lastSeenOutAt ?? "";
  const unreadOut = useMemo(
    () => messages.filter((m) => m.direction === "out" && m.createdAt > lastSeenOutAt),
    [messages, lastSeenOutAt],
  );

  // Painel visível + aba visível → marca as respostas do agente como lidas.
  useEffect(() => {
    if (!enabled || !panelVisible || !docVisible || !unreadOut.length) return;
    const st = storedRef.current;
    if (!st) return;
    const newest = unreadOut[unreadOut.length - 1]?.createdAt ?? new Date().toISOString();
    persist({ ...st, lastSeenOutAt: newest });
    void markWebchatRead(st.token).catch(() => {});
  }, [enabled, panelVisible, docVisible, unreadOut, persist]);

  return {
    session: stored,
    messages,
    agentTyping,
    agentReadAt,
    historyLoaded,
    unreadCount: unreadOut.length,
    send,
    retry,
    identify,
    notifyTyping,
  };
}
