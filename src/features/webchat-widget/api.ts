/**
 * Cliente da API pública do Webchat (`/api/public/webchat/*`).
 * Contrato: `backend_crm1/docs/decisoes/webchat-widget.md §3.4.1`.
 *
 * Sem sessão de usuário: o visitante se identifica por `Authorization: Bearer`
 * (token guardado no localStorage do iframe — origem nossa, o site do cliente
 * não lê). O token renova em `POST /session` (a cada carga) e muda no
 * `POST /session/identify`.
 */
import {
  normalizeMessage,
  normalizePublicConfig,
  type WebchatMessage,
  type WebchatPublicConfig,
} from "./types";

const BASE = "/api/public/webchat";

export class WebchatApiError extends Error {
  status: number;
  code: string | null;
  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** 401/403: token rejeitado (vencido, trocado por outra aba, ou revogado). */
export function isWebchatAuthError(e: unknown): e is WebchatApiError {
  return e instanceof WebchatApiError && (e.status === 401 || e.status === 403);
}

/**
 * Falha que vale tentar de novo: rede (fetch rejeitado/timeout), 5xx, 408 e
 * 429. 4xx de regra (404 chave inexistente, 401/403) não melhora sozinho.
 */
export function isTransientWebchatError(e: unknown): boolean {
  if (!(e instanceof WebchatApiError)) return true;
  return e.status >= 500 || e.status === 408 || e.status === 429;
}

/**
 * Espera da N-ésima falha seguida: exponencial a partir de `baseMs`, teto
 * `maxMs`, com jitter (metade fixa + metade aleatória) para os widgets de
 * vários sites não voltarem todos no mesmo segundo quando o backend volta.
 */
export function backoffDelay(
  failures: number,
  baseMs: number,
  maxMs = 60_000,
  random: () => number = Math.random,
): number {
  const exp = Math.min(maxMs, baseMs * 2 ** Math.min(Math.max(failures, 0), 16));
  return Math.round(exp / 2 + random() * (exp / 2));
}

/** Repete `fn` em falha transitória (até `attempts` tentativas no total). */
export async function retryTransient<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseMs = 1000,
): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts || !isTransientWebchatError(e)) throw e;
      await new Promise((r) => setTimeout(r, backoffDelay(i - 1, baseMs, 10_000)));
    }
  }
}

type RequestOptions = {
  method?: "GET" | "POST";
  token?: string | null;
  body?: unknown;
};

async function request(path: string, opts: RequestOptions = {}): Promise<unknown> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    cache: "no-store",
    credentials: "omit",
  });
  if (res.status === 204) return null;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const rec = (data ?? {}) as { message?: unknown; code?: unknown };
    throw new WebchatApiError(
      typeof rec.message === "string" ? rec.message : `HTTP ${res.status}`,
      res.status,
      typeof rec.code === "string" ? rec.code : null,
    );
  }
  return data;
}

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

export async function fetchWebchatConfig(
  publicKey: string,
  host?: string | null,
): Promise<WebchatPublicConfig> {
  const qs = new URLSearchParams({ key: publicKey });
  if (host) qs.set("host", host);
  const data = await request(`/config?${qs.toString()}`);
  return normalizePublicConfig(data, publicKey);
}

export type WebchatIdentity = { name?: string; email?: string; phone?: string };

export type SessionResponse = {
  token: string;
  visitorId: string;
  /** `null` até a 1ª mensagem/identificação (abrir o chat não cria contato). */
  contactId: string | null;
  conversationId: string | null;
  identified: boolean;
  contact: WebchatIdentity | null;
};

/** Cria a sessão ou, com o Bearer anterior, renova o token (a cada carga). */
export async function createWebchatSession(
  body: {
    key: string;
    page?: string;
    referrer?: string;
    utm?: Record<string, string>;
    host?: string | null;
  } & WebchatIdentity,
  token?: string | null,
): Promise<SessionResponse> {
  const r = rec(await request("/session", { method: "POST", body, token }));
  if (typeof r.token !== "string" || typeof r.visitorId !== "string") {
    throw new WebchatApiError("Resposta de sessão inválida.", 500, null);
  }
  const conv = rec(r.conversation);
  const contact = rec(r.contact);
  const pick = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  return {
    token: r.token,
    visitorId: r.visitorId,
    contactId: typeof r.contactId === "string" ? r.contactId : null,
    conversationId: typeof conv.id === "string" ? conv.id : null,
    identified:
      contact.identified === true ||
      Boolean(body.name || body.email || body.phone),
    contact: r.contact
      ? { name: pick(contact.name), email: pick(contact.email), phone: pick(contact.phone) }
      : null,
  };
}

/** Identifica/funde o visitante. Devolve token NOVO (trocar o salvo). */
export async function identifyWebchatVisitor(
  token: string,
  identity: WebchatIdentity,
): Promise<{ contactId: string | null; merged: boolean; token: string | null }> {
  const r = rec(
    await request("/session/identify", { method: "POST", token, body: identity }),
  );
  return {
    contactId: typeof r.contactId === "string" ? r.contactId : null,
    merged: r.merged === true,
    token: typeof r.token === "string" && r.token ? r.token : null,
  };
}

export async function sendWebchatMessage(
  token: string,
  body: { clientMessageId: string; content: string },
): Promise<WebchatMessage | null> {
  const r = rec(await request("/messages", { method: "POST", token, body }));
  return normalizeMessage(r.message ?? r);
}

export type PollResponse = {
  messages: WebchatMessage[];
  cursor: string | null;
  /** Com `after`: ainda há mensagens seguintes para buscar já. */
  hasMore: boolean;
  agentTyping: boolean;
  agentReadAt: string | null;
};

export async function pollWebchatMessages(
  token: string,
  after: string | null,
): Promise<PollResponse> {
  const qs = after ? `?after=${encodeURIComponent(after)}` : "";
  const r = rec(await request(`/messages${qs}`, { token }));
  const list = Array.isArray(r.messages) ? r.messages : [];
  const messages = list
    .map(normalizeMessage)
    .filter((m): m is WebchatMessage => m !== null);
  const cursor =
    typeof r.cursor === "string"
      ? r.cursor
      : typeof r.nextCursor === "string"
        ? r.nextCursor
        : null;
  return {
    messages,
    cursor,
    hasMore: r.hasMore === true,
    agentTyping: r.agentTyping === true,
    agentReadAt: typeof r.agentReadAt === "string" ? r.agentReadAt : null,
  };
}

export async function sendWebchatTyping(token: string, typing: boolean): Promise<void> {
  await request("/typing", { method: "POST", token, body: { typing } });
}

export async function markWebchatRead(token: string): Promise<void> {
  await request("/read", { method: "POST", token, body: {} });
}
