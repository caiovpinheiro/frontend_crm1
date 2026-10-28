"use client";

/**
 * Estado do chat do visitante: sessão (token no localStorage do iframe,
 * renovado com `POST /session` a cada carga antes do 1º poll),
 * envio otimista com `clientMessageId`, polling `GET /messages?after=`
 * (3 s com o painel aberto, 10 s fechado, pausado com a aba oculta; com o
 * backend fora do ar, backoff exponencial com jitter e `connectionError`),
 * typing com debounce, recibos (`POST /read`) e contagem de não lidas.
 *
 * Token rotativo: o backend só aceita o token mais novo, e a entrada do
 * localStorage é compartilhada entre abas. Um 401 NÃO zera a sessão de cara:
 * primeiro adota o token mais novo (memória ou disco) e tenta de novo; só
 * zera quando o token salvo é exatamente o que falhou (`recoverSession` /
 * `dropSession`). O evento `storage` mantém as abas em sincronia.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  backoffDelay,
  createWebchatSession,
  identifyWebchatVisitor,
  isWebchatAuthError,
  markWebchatRead,
  pollWebchatMessages,
  sendWebchatMessage,
  sendWebchatTyping,
  WebchatApiError,
  type PollResponse,
  type WebchatIdentity,
} from "./api";
import { utmFromUrl, type PageInfo } from "./protocol";
import {
  clearStoredSessionIf,
  parseStoredSession,
  readStoredSession,
  sameStoredSession,
  storageKey,
  writeStoredSession,
  type StoredSession,
} from "./session-store";
import { WEBCHAT_MAX_CONTENT, type WebchatMessage } from "./types";

export { readStoredSession, storageKey, type StoredSession } from "./session-store";

export const POLL_OPEN_MS = 3000;
export const POLL_CLOSED_MS = 10000;
/** Teto da espera entre polls com o backend fora do ar. */
export const POLL_MAX_BACKOFF_MS = 60_000;
const TYPING_THROTTLE_MS = 3000;
const TYPING_IDLE_MS = 4000;
/** Trocas de token seguidas aceitas num mesmo request antes de desistir. */
const MAX_TOKEN_RECOVERIES = 2;

export type UiMessage = WebchatMessage & { local?: "pending" | "failed" };

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

/**
 * Ordem temporal de dois timestamps ISO. Compara o instante (offsets e
 * frações diferentes ordenam certo); se algum não parseia, cai na string.
 */
export function compareTimestamps(a: string, b: string): number {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isNaN(ta) && !Number.isNaN(tb)) return ta - tb;
  return a < b ? -1 : a > b ? 1 : 0;
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
  // `sort` é estável: empate de instante mantém a ordem de chegada.
  return [...next].sort((a, b) => compareTimestamps(a.createdAt, b.createdAt));
}

function hasIdentity(identity?: WebchatIdentity): boolean {
  return Boolean(identity && (identity.name || identity.email || identity.phone));
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
  /** Último poll falhou por rede/5xx/429 — o loop segue, com backoff. */
  const [connectionError, setConnectionError] = useState(false);

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

  /** Passa a usar a sessão gravada por outra aba (sem regravar o disco). */
  const adopt = useCallback((next: StoredSession) => {
    const cur = storedRef.current;
    if (sameStoredSession(cur, next)) return;
    if (cur && cur.visitorId !== next.visitorId) {
      cursorRef.current = null;
      setMessages([]);
      setAgentReadAt(null);
      setAgentTyping(false);
    }
    storedRef.current = next;
    setStored(next);
  }, []);

  /**
   * Grava só alguns campos sobre a versão mais nova da sessão — a do disco
   * quando é o mesmo visitante — para uma aba com token velho em memória
   * não sobrescrever o token novo que outra aba acabou de gravar.
   */
  const patchStored = useCallback(
    (patch: Partial<StoredSession>) => {
      const cur = storedRef.current;
      if (!cur) return;
      const disk = readStoredSession(publicKey);
      const base = disk && disk.visitorId === cur.visitorId ? disk : cur;
      persist({ ...base, ...patch });
    },
    [persist, publicKey],
  );

  // Sessão salva (só no client — localStorage).
  useEffect(() => {
    const s = readStoredSession(publicKey);
    storedRef.current = s;
    setStored(s);
    if (!s) setHistoryLoaded(true);
  }, [publicKey]);

  // Outra aba renovou/identificou → adota o token novo (o velho já não vale).
  // Volta do back-forward cache → relê o disco pelo mesmo motivo.
  useEffect(() => {
    const key = storageKey(publicKey);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      // Removida em outra aba: quem decide é o próximo 401 desta aba.
      const next = parseStoredSession(e.newValue);
      if (next) adopt(next);
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      const disk = readStoredSession(publicKey);
      if (disk) adopt(disk);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [publicKey, adopt]);

  useEffect(() => {
    const onVis = () => setDocVisible(!document.hidden);
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  /**
   * Token `failedToken` rejeitado (401/403). Se a memória (identify nesta
   * aba) ou o disco (outra aba, bfcache) já têm OUTRO token, adota e devolve
   * para nova tentativa; `null` = o token salvo é o que falhou.
   */
  const recoverSession = useCallback(
    (failedToken: string): StoredSession | null => {
      const cur = storedRef.current;
      if (cur && cur.token !== failedToken) return cur;
      const disk = readStoredSession(publicKey);
      if (disk && disk.token !== failedToken) {
        adopt(disk);
        return disk;
      }
      return null;
    },
    [adopt, publicKey],
  );

  /** Sessão morta: apaga o disco só se ainda for a do token que falhou. */
  const dropSession = useCallback(
    (failedToken: string) => {
      const newer = recoverSession(failedToken);
      if (newer) return;
      clearStoredSessionIf(publicKey, failedToken);
      storedRef.current = null;
      setStored(null);
      cursorRef.current = null;
      setMessages([]);
      setAgentReadAt(null);
      setAgentTyping(false);
      setConnectionError(false);
      setHistoryLoaded(true);
    },
    [publicKey, recoverSession],
  );

  /** `fn(token)`; em 401/403 tenta de novo com o token adotado (se houver). */
  const withToken = useCallback(
    async <T>(st: StoredSession, fn: (token: string) => Promise<T>): Promise<T> => {
      let token = st.token;
      for (let attempt = 0; ; attempt++) {
        try {
          return await fn(token);
        } catch (e) {
          if (!isWebchatAuthError(e) || attempt >= MAX_TOKEN_RECOVERIES) throw e;
          const next = recoverSession(token);
          if (!next) throw e;
          token = next.token;
        }
      }
    },
    [recoverSession],
  );

  const ensureSession = useCallback(
    async (identity?: WebchatIdentity): Promise<StoredSession> => {
      if (storedRef.current && !identity) return storedRef.current;
      if (sessionPromiseRef.current && !identity) return sessionPromiseRef.current;
      const run = async (): Promise<StoredSession> => {
        let prev = storedRef.current;
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
          const newer = recoverSession(prev.token);
          // Outra aba já renovou: o token dela é o válido — não gira de novo.
          if (newer && !hasIdentity(identity)) return newer;
          if (newer) {
            prev = newer;
            res = await createWebchatSession(body, newer.token);
          } else {
            // Token não renovável: começa uma sessão nova (visitorId sozinho
            // não retoma a antiga — regra do backend).
            cursorRef.current = null;
            setMessages([]);
            res = await createWebchatSession(body, null);
          }
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
    [host, pageInfo, persist, publicKey, recoverSession],
  );

  /** `false` = falha transitória (rede/5xx/429): o loop entra em backoff. */
  const poll = useCallback(async (): Promise<boolean> => {
    const first = storedRef.current;
    if (!first) return true;
    let st: StoredSession = first;
    let recoveries = 0;
    // `hasMore` (com `after`) = ainda há mensagens seguintes: busca já.
    for (let page = 0; page < 5; ) {
      let res: PollResponse;
      try {
        res = await pollWebchatMessages(st.token, cursorRef.current);
      } catch (e) {
        if (!isWebchatAuthError(e)) return false;
        const next: StoredSession | null =
          recoveries < MAX_TOKEN_RECOVERIES ? recoverSession(st.token) : null;
        if (!next) {
          dropSession(st.token);
          return true;
        }
        recoveries++;
        st = next;
        continue;
      }
      if (storedRef.current?.visitorId !== st.visitorId) return true;
      if (res.messages.length) setMessages((prev) => mergeMessages(prev, res.messages));
      const hadCursor = cursorRef.current !== null;
      cursorRef.current =
        res.cursor ?? res.messages[res.messages.length - 1]?.id ?? cursorRef.current;
      setAgentTyping(res.agentTyping);
      if (res.agentReadAt) setAgentReadAt(res.agentReadAt);
      setHistoryLoaded(true);
      page++;
      if (!hadCursor || !res.hasMore || !res.messages.length) break;
    }
    return true;
  }, [dropSession, recoverSession]);

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
        // Com o token que FALHOU: se outra aba já gravou um mais novo
        // (evento `storage`), `dropSession` adota esse em vez de zerar.
        if (isWebchatAuthError(e)) dropSession(st.token);
      })
      .finally(() => setSessionReady(true));
  }, [enabled, visitorId, ensureSession, dropSession]);

  // Loop de polling (um por visitante; o token é lido do ref a cada poll).
  useEffect(() => {
    if (!enabled || !sessionReady || !visitorId) return;
    let cancelled = false;
    let inFlight = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = async () => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (cancelled || inFlight) return;
      inFlight = true;
      let ok = true;
      try {
        if (!document.hidden) ok = await poll();
      } finally {
        inFlight = false;
      }
      if (cancelled) return;
      failures = ok ? 0 : failures + 1;
      setConnectionError(!ok);
      // Sessão descartada (401 sem token mais novo): o loop morre aqui.
      if (!storedRef.current || document.hidden) return;
      const base = panelVisibleRef.current ? POLL_OPEN_MS : POLL_CLOSED_MS;
      timer = setTimeout(
        run,
        failures ? backoffDelay(failures, base, POLL_MAX_BACKOFF_MS) : base,
      );
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
        const body = {
          clientMessageId: msg.clientMessageId ?? newClientMessageId(),
          content: msg.content,
        };
        const saved = await withToken(st, (token) => sendWebchatMessage(token, body));
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
    [ensureSession, withToken],
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
      const res = await withToken(st, (token) => identifyWebchatVisitor(token, clean));
      const cur = storedRef.current ?? st;
      persist({ ...cur, ...(res.token ? { token: res.token } : {}), identified: true, ...clean });
    },
    [ensureSession, persist, withToken],
  );

  const lastSeenOutAt = stored?.lastSeenOutAt ?? "";
  const unreadOut = useMemo(
    () =>
      messages.filter(
        (m) =>
          m.direction === "out" &&
          (!lastSeenOutAt || compareTimestamps(m.createdAt, lastSeenOutAt) > 0),
      ),
    [messages, lastSeenOutAt],
  );

  // Painel visível + aba visível → marca as respostas do agente como lidas.
  useEffect(() => {
    if (!enabled || !panelVisible || !docVisible || !unreadOut.length) return;
    if (!storedRef.current) return;
    const newest = unreadOut[unreadOut.length - 1]?.createdAt ?? new Date().toISOString();
    patchStored({ lastSeenOutAt: newest });
    const token = storedRef.current?.token;
    if (token) void markWebchatRead(token).catch(() => {});
  }, [enabled, panelVisible, docVisible, unreadOut, patchStored]);

  return {
    session: stored,
    messages,
    agentTyping,
    agentReadAt,
    historyLoaded,
    connectionError,
    unreadCount: unreadOut.length,
    send,
    retry,
    identify,
    notifyTyping,
  };
}
