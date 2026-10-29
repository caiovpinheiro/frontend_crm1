/**
 * Tipos do Webchat compartilhados entre o widget público (`/webchat/[publicKey]`)
 * e o painel de configuração do canal no CRM.
 *
 * Contrato: `backend_crm1/docs/decisoes/webchat-widget.md` §3.1 (config do
 * canal) e §3.4 (API pública). Campos opcionais ausentes não quebram o cliente.
 */
import { normalizeOriginList } from "@/lib/webchat-origin";

export type WebchatIdentification = "none" | "name" | "name_email" | "name_phone";
export type WebchatPosition = "right" | "left";
export type WebchatWeekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type WebchatTheme = {
  primary: string;
  position: WebchatPosition;
  title: string;
  avatarUrl?: string | null;
};

export type WebchatBusinessHours = {
  tz: string;
  week: Partial<Record<WebchatWeekday, [string, string][]>>;
};

/** `Channel.config` de um canal WEBCHAT (o que o painel do CRM grava). */
export type WebchatChannelConfig = {
  publicKey?: string;
  allowedOrigins: string[];
  identification: WebchatIdentification;
  greeting: string;
  offlineMessage: string;
  theme: WebchatTheme;
  businessHours?: WebchatBusinessHours | null;
  collectTranscriptEmail: boolean;
};

/** `GET /api/public/webchat/config?key=` */
export type WebchatPublicConfig = {
  publicKey: string;
  allowedOrigins: string[];
  identification: WebchatIdentification;
  greeting: string;
  offlineMessage: string;
  online: boolean;
  theme: WebchatTheme;
};

/** Mensagem como o widget recebe. `direction` na perspectiva do CRM. */
export type WebchatMessage = {
  id: string;
  clientMessageId?: string | null;
  direction: "in" | "out";
  content: string;
  createdAt: string;
  status?: "sent" | "delivered" | "read" | null;
  senderName?: string | null;
};

export const WEBCHAT_IDENTIFICATIONS: WebchatIdentification[] = [
  "none",
  "name",
  "name_email",
  "name_phone",
];

export const WEBCHAT_WEEKDAYS: WebchatWeekday[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
];

/** Cor default do widget (marca Bwipo) — o cliente troca no painel. */
export const WEBCHAT_DEFAULT_PRIMARY = "#2563eb";
export const WEBCHAT_MAX_CONTENT = 4000;

const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function safeHexColor(value: unknown, fallback = WEBCHAT_DEFAULT_PRIMARY): string {
  return typeof value === "string" && HEX_COLOR_RE.test(value.trim())
    ? value.trim().toLowerCase()
    : fallback;
}

/**
 * Só https absoluta ou caminho same-origin (`/uploads/...`). `http:` fica de
 * fora: conteúdo misto no iframe (bloqueado/aviso) e imagem trafegando em
 * claro a partir do site do cliente.
 */
export function safeAvatarUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  if (v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\")) return v;
  try {
    const u = new URL(v);
    return u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

function str(v: unknown, fallback: string, max = 500): string {
  return typeof v === "string" && v.trim() ? v.slice(0, max) : fallback;
}

function record(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

export function normalizeIdentification(v: unknown): WebchatIdentification {
  return WEBCHAT_IDENTIFICATIONS.includes(v as WebchatIdentification)
    ? (v as WebchatIdentification)
    : "none";
}

export function normalizeTheme(v: unknown): WebchatTheme {
  const t = record(v);
  return {
    primary: safeHexColor(t.primary),
    position: t.position === "left" ? "left" : "right",
    title: str(t.title, "Atendimento", 80),
    avatarUrl: safeAvatarUrl(t.avatarUrl),
  };
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function normalizeBusinessHours(v: unknown): WebchatBusinessHours | null {
  const r = record(v);
  if (!Object.keys(r).length) return null;
  const weekIn = record(r.week);
  const week: WebchatBusinessHours["week"] = {};
  for (const day of WEBCHAT_WEEKDAYS) {
    const ranges = weekIn[day];
    if (!Array.isArray(ranges)) continue;
    const clean = ranges.filter(
      (x): x is [string, string] =>
        Array.isArray(x) &&
        x.length === 2 &&
        TIME_RE.test(String(x[0])) &&
        TIME_RE.test(String(x[1])),
    );
    if (clean.length) week[day] = clean;
  }
  return { tz: str(r.tz, "America/Sao_Paulo", 64), week };
}

export const DEFAULT_GREETING = "Olá! Como podemos ajudar?";
export const DEFAULT_OFFLINE_MESSAGE =
  "Estamos fora do horário de atendimento. Deixe seu contato e retornamos assim que possível.";

/** Config do canal (CRM) com defaults — tolera `config` vazio/legado. */
export function normalizeChannelConfig(raw: unknown): WebchatChannelConfig {
  const r = record(raw);
  return {
    publicKey: typeof r.publicKey === "string" ? r.publicKey : undefined,
    allowedOrigins: normalizeOriginList(r.allowedOrigins),
    identification: normalizeIdentification(r.identification),
    greeting: str(r.greeting, DEFAULT_GREETING, 500),
    offlineMessage: str(r.offlineMessage, DEFAULT_OFFLINE_MESSAGE, 500),
    theme: normalizeTheme(r.theme),
    businessHours: normalizeBusinessHours(r.businessHours),
    collectTranscriptEmail: r.collectTranscriptEmail === true,
  };
}

/** Resposta de `GET /config` → shape interno. */
export function normalizePublicConfig(raw: unknown, publicKey: string): WebchatPublicConfig {
  const r = record(raw);
  return {
    publicKey: typeof r.publicKey === "string" ? r.publicKey : publicKey,
    allowedOrigins: normalizeOriginList(r.allowedOrigins),
    identification: normalizeIdentification(r.identification),
    greeting: str(r.greeting, DEFAULT_GREETING, 500),
    offlineMessage: str(r.offlineMessage, DEFAULT_OFFLINE_MESSAGE, 500),
    online: r.online !== false,
    theme: normalizeTheme(r.theme),
  };
}

export function normalizeMessage(raw: unknown): WebchatMessage | null {
  const r = record(raw);
  if (typeof r.id !== "string" || !r.id) return null;
  const direction = r.direction === "out" ? "out" : r.direction === "in" ? "in" : null;
  if (!direction) return null;
  const status =
    r.status === "sent" || r.status === "delivered" || r.status === "read" ? r.status : null;
  return {
    id: r.id,
    clientMessageId: typeof r.clientMessageId === "string" ? r.clientMessageId : null,
    direction,
    content: typeof r.content === "string" ? r.content : "",
    createdAt: typeof r.createdAt === "string" ? r.createdAt : new Date().toISOString(),
    status,
    senderName: typeof r.senderName === "string" ? r.senderName : null,
  };
}
