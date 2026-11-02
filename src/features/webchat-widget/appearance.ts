/**
 * Modelos do widget: contrato de `appearance` (raiz de `GET /api/public/webchat/config`,
 * gravado em `Channel.config.v2.appearance`), leitura tolerante e regras puras
 * do fluxo local. O backend valida de verdade; aqui só nada quebra o widget.
 *
 * Nenhum texto padrão de cliente: rótulo, pergunta e link vêm sempre da config.
 */

export type WebchatAction =
  | { type: "send_text"; text: string }
  | { type: "open_url"; url: string; label?: string }
  | { type: "write" };

export type WebchatOption = { id: string; label: string; action: WebchatAction };

export type WebchatTopicIcon =
  | "lock"
  | "card"
  | "file"
  | "chat"
  | "help"
  | "book"
  | "calendar"
  | "phone";

export type WebchatFollowUp = { question: string; hint?: string; options: WebchatOption[] };

export type WebchatTopic = {
  id: string;
  label: string;
  icon: WebchatTopicIcon;
  action: WebchatAction;
  /** Um nível só: opção não tem `followUp`. */
  followUp?: WebchatFollowUp;
};

export type WebchatAppearanceModel = "compact" | "assisted" | "guided";

export type WebchatAppearance = {
  model: WebchatAppearanceModel;
  allowExpand: boolean;
  start: { title?: string; subtitle?: string; writeLabel?: string; topics: WebchatTopic[] };
  /** Chaves do `setContext` do site. */
  contextBanner: { enabled: boolean; titleKey?: string; subtitleKey?: string };
  /** Só enviam o texto do rótulo: não encerram ticket. */
  closing: { enabled: boolean; resolvedLabel?: string; needHelpLabel?: string };
};

export const WEBCHAT_APPEARANCE_MODELS: WebchatAppearanceModel[] = ["compact", "assisted", "guided"];

export const WEBCHAT_TOPIC_ICONS: WebchatTopicIcon[] = [
  "lock",
  "card",
  "file",
  "chat",
  "help",
  "book",
  "calendar",
  "phone",
];

export const WEBCHAT_APPEARANCE_LIMITS = {
  label: 40,
  question: 200,
  hint: 160,
  title: 80,
  subtitle: 160,
  writeLabel: 40,
  text: 500,
  url: 2000,
  topics: 6,
  options: 6,
} as const;

/** Rótulo estrutural do botão de escrever quando o canal não definiu `writeLabel`. */
export const WEBCHAT_DEFAULT_WRITE_LABEL = "Escrever mensagem";
/** Texto do link quando `open_url` não traz `label`. */
export const WEBCHAT_DEFAULT_LINK_LABEL = "Abrir link";

const L = WEBCHAT_APPEARANCE_LIMITS;

function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function text(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
}

/** Só `https:` absoluta (o link abre em nova aba a partir do widget). */
export function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v || v.length > L.url) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
}

function readAction(v: unknown): WebchatAction | null {
  const r = rec(v);
  if (!r) return null;
  if (r.type === "write") return { type: "write" };
  if (r.type === "send_text") {
    const t = text(r.text, L.text);
    return t ? { type: "send_text", text: t } : null;
  }
  if (r.type === "open_url") {
    const url = safeHttpsUrl(r.url);
    if (!url) return null;
    const label = text(r.label, L.label);
    return label ? { type: "open_url", url, label } : { type: "open_url", url };
  }
  return null;
}

function readOption(v: unknown, index: number): WebchatOption | null {
  const r = rec(v);
  const label = text(r?.label, L.label);
  const action = readAction(r?.action);
  if (!r || !label || !action) return null;
  return { id: text(r.id, 64) ?? `option-${index}`, label, action };
}

function readFollowUp(v: unknown): WebchatFollowUp | undefined {
  const r = rec(v);
  const question = text(r?.question, L.question);
  if (!r || !question || !Array.isArray(r.options)) return undefined;
  const options = r.options
    .map(readOption)
    .filter((o): o is WebchatOption => o !== null)
    .slice(0, L.options);
  if (!options.length) return undefined;
  const hint = text(r.hint, L.hint);
  return hint ? { question, hint, options } : { question, options };
}

function readTopic(v: unknown, index: number): WebchatTopic | null {
  const r = rec(v);
  const label = text(r?.label, L.label);
  const action = readAction(r?.action);
  if (!r || !label || !action) return null;
  const followUp = readFollowUp(r.followUp);
  return {
    id: text(r.id, 64) ?? `topic-${index}`,
    label,
    icon: WEBCHAT_TOPIC_ICONS.includes(r.icon as WebchatTopicIcon)
      ? (r.icon as WebchatTopicIcon)
      : "chat",
    action,
    ...(followUp ? { followUp } : {}),
  };
}

function withOptional<T extends object>(base: T, optional: Record<string, string | undefined>): T {
  const present = Object.entries(optional).filter(([, v]) => v);
  return { ...base, ...Object.fromEntries(present) };
}

/** `appearance` como veio da API ou de `config.v2` (`null` se nem é objeto). */
export function normalizeAppearance(raw: unknown): WebchatAppearance | null {
  const r = rec(raw);
  if (!r) return null;
  const start = rec(r.start) ?? {};
  const banner = rec(r.contextBanner) ?? {};
  const closing = rec(r.closing) ?? {};
  const topics = Array.isArray(start.topics)
    ? start.topics
        .map(readTopic)
        .filter((t): t is WebchatTopic => t !== null)
        .slice(0, L.topics)
    : [];
  return {
    model: WEBCHAT_APPEARANCE_MODELS.includes(r.model as WebchatAppearanceModel)
      ? (r.model as WebchatAppearanceModel)
      : "compact",
    allowExpand: r.allowExpand === true,
    start: withOptional(
      { topics },
      {
        title: text(start.title, L.title),
        subtitle: text(start.subtitle, L.subtitle),
        writeLabel: text(start.writeLabel, L.writeLabel),
      },
    ),
    contextBanner: withOptional(
      { enabled: banner.enabled === true },
      { titleKey: text(banner.titleKey, 64), subtitleKey: text(banner.subtitleKey, 64) },
    ),
    closing: withOptional(
      { enabled: closing.enabled === true },
      {
        resolvedLabel: text(closing.resolvedLabel, L.label),
        needHelpLabel: text(closing.needHelpLabel, L.label),
      },
    ),
  };
}

/**
 * Igual ao padrão que o backend devolve para canal sem configuração: compacto,
 * sem tópico, sem faixa e sem encerramento. Esse canal continua com o visual
 * de hoje (`config.appearance === null` no widget).
 */
export function isPlainAppearance(a: WebchatAppearance): boolean {
  return (
    a.model === "compact" &&
    !a.allowExpand &&
    a.start.topics.length === 0 &&
    !a.contextBanner.enabled &&
    !a.closing.enabled
  );
}

/** O que o widget usa: `null` = comportamento de hoje. */
export function effectiveAppearance(raw: unknown): WebchatAppearance | null {
  const a = normalizeAppearance(raw);
  return a && !isPlainAppearance(a) ? a : null;
}

/** Contexto que o site mandou (`setContext`). `null` no patch remove a chave. */
export type SiteContext = Record<string, string | number | boolean>;

export function mergeSiteContext(
  current: SiteContext,
  patch: Record<string, string | number | boolean | null>,
): SiteContext {
  const next = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete next[k];
    else next[k] = v;
  }
  return next;
}

function contextValue(context: SiteContext | undefined, key: string | undefined): string | null {
  if (!context || !key) return null;
  const v = Object.prototype.hasOwnProperty.call(context, key) ? context[key] : undefined;
  if (typeof v === "number") return String(v);
  if (typeof v !== "string") return null;
  return v.trim() || null;
}

/** Valores da faixa de contexto; `null` quando não há o que mostrar. */
export function resolveContextBanner(
  appearance: WebchatAppearance | null,
  context: SiteContext | undefined,
): { title: string | null; subtitle: string | null } | null {
  if (!appearance?.contextBanner.enabled) return null;
  const title = contextValue(context, appearance.contextBanner.titleKey);
  const subtitle = contextValue(context, appearance.contextBanner.subtitleKey);
  return title || subtitle ? { title, subtitle } : null;
}

/** Botões de encerramento que têm rótulo, ou nada se já foram usados. */
export function closingLabels(
  appearance: WebchatAppearance | null,
  visitorTexts: string[],
): { resolved: string | null; needHelp: string | null } | null {
  if (!appearance?.closing.enabled || !visitorTexts.length) return null;
  const resolved = appearance.closing.resolvedLabel ?? null;
  const needHelp = appearance.closing.needHelpLabel ?? null;
  if (!resolved && !needHelp) return null;
  const last = visitorTexts[visitorTexts.length - 1];
  if (last === resolved || last === needHelp) return null;
  return { resolved, needHelp };
}

/** Separador de dia da conversa (`Hoje`, `Ontem` ou a data). */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(now) - start(d)) / 86_400_000);
  if (days === 0) return "Hoje";
  if (days === 1) return "Ontem";
  return d.toLocaleDateString("pt-BR");
}

/** Tamanho que o loader dá ao iframe (fora do celular). */
export type WebchatFrameSize = "default" | "tall" | "expanded";

export function frameSizeFor(
  appearance: WebchatAppearance | null,
  expanded: boolean,
): WebchatFrameSize {
  if (expanded) return "expanded";
  return appearance?.model === "assisted" ? "tall" : "default";
}
