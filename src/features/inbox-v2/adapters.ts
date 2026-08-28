/*
 * Adapters Inbox v2 — convertem os DTOs vindos do backend
 * (ConversationListRow, InboxMessageDto, ContactDetail, etc.) para
 * os tipos VISUAIS que os componentes do v0 (components/crm/*)
 * esperam (Conversation, Message, ContactAside.contact).
 *
 * Princípio: nunca mudar o DTO; a tradução acontece SEMPRE aqui.
 * Se o componente v0 mudar uma prop, é só atualizar a função
 * correspondente, sem espalhar mapping pelo código.
 */

import type { Conversation, LastMessageType } from "@/components/crm/conversation-card";
import type { Message, FormField } from "@/components/crm/message-bubble";
import { classifyTimelineItem } from "@/components/crm/chat-timeline";
import { normalizeDeliveryStatus } from "@/components/crm/status-ticks";
import { avatarInitials as avatarInitialsFromLib } from "@/lib/avatar";
import type { ConnectionRef } from "@/lib/connection-label";
import { sanitizeContactName } from "@/lib/display-name";

import { agentNameFromWhatsappCallSender } from "@/lib/whatsapp-call-chat";
import { prettifyChatMessageBody } from "@/lib/whatsapp-outbound-template-label";

import type {
  ContactDetail,
  ConversationListRow,
  InboxMessageDto,
} from "./api";

/** Conexão exibida no painel do contato (qual WhatsApp/conta). */
export type ContactConnection = ConnectionRef;

// ─────────────────────────────────────────────────────────────────
// Helpers compartilhados
// ─────────────────────────────────────────────────────────────────

/** 6 cores que o `ConversationCard` e `MessageBubble` aceitam. */
const CONV_COLORS = [
  "blue",
  "teal",
  "orange",
  "purple",
  "pink",
  "coral",
] as const satisfies readonly Conversation["avatarColor"][];

/** Hash determinístico de nome → cor. Mesmo nome sempre tem a mesma cor. */
export function colorFromName(name: string | null | undefined): Conversation["avatarColor"] {
  const safe = (name ?? "").trim();
  if (!safe) return "coral";
  let sum = 0;
  for (let i = 0; i < safe.length; i += 1) {
    sum += safe.charCodeAt(i);
  }
  return CONV_COLORS[sum % CONV_COLORS.length];
}

/** Iniciais (até 2 chars maiúsculas) — "Ana Silva" → "AS"; ignora emojis. */
export function avatarInitials(name: string | null | undefined): string {
  return avatarInitialsFromLib(name);
}

/** "Agora", "5min", "2h", "14:20", "ontem", "3d", "2sem", "10/03". */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `${diffMin}min`;
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const sameDay = isSameDay(date, new Date());
  if (sameDay) return `${hh}:${mm}`;
  const diffDay = Math.floor(diffMs / 86400000);
  if (diffDay === 1) return "ontem";
  if (diffDay < 7) return `${diffDay}d`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}sem`;
  const dd = String(date.getDate()).padStart(2, "0");
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mo}`;
}

/** "HH:mm" — usado nos bubbles do chat. */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Rótulo de separador de dia no chat: "Hoje", "Ontem" ou "dd/mm/yyyy".
 * Retorna "" se a data for inválida.
 */
export function formatDayLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (isSameDay(date, now)) return "Hoje";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return "Ontem";
  const dd = String(date.getDate()).padStart(2, "0");
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mo}/${date.getFullYear()}`;
}

/** Heurística: contato "online" se houve atividade nos últimos 5min. */
function deriveOnline(lastInboundAt: string | null | undefined): "online" | "offline" {
  if (!lastInboundAt) return "offline";
  const d = new Date(lastInboundAt);
  if (Number.isNaN(d.getTime())) return "offline";
  return Date.now() - d.getTime() < 5 * 60_000 ? "online" : "offline";
}

/**
 * Deriva o "badge" semantico a partir das tags do contato / estado da
 * conversa. A versao nova do `ConversationCard` (v0 ajustes-v3) NAO
 * exibe mais o badge no card — mas o tipo continua sendo retornado
 * porque o `ChatContactView` e o `toContactStatus` o usam para
 * o header do chat (Enterprise / Lead / Cliente).
 */
export type ConversationBadge = "enterprise" | "lead" | "success";

/**
 * Tempo restante ate a janela de 24h da Meta/WhatsApp expirar.
 * Espelha a logica do chat: 24h a partir do ultimo inbound do contato.
 * Sem inbound (null) = sessao fechada → pill "Expirada" no card (paridade
 * com o banner do composer).
 */
export function sessionRemainingFromInbound(
  lastInboundAt: string | null | undefined,
  windowHours = 24,
): { label: string | null; expired: boolean } {
  // Sem inbound (ex.: ticket aberto só com template): sessão Meta fechada.
  // Precisa de label "Expirada" — senão o card não renderiza o pill
  // (`sessionExpiresIn && …`) enquanto o composer já bloqueia envio.
  if (!lastInboundAt) return { label: "Expirada", expired: true };
  const d = new Date(lastInboundAt);
  if (Number.isNaN(d.getTime())) return { label: "Expirada", expired: true };
  const deadline = d.getTime() + windowHours * 3600_000;
  const ms = deadline - Date.now();
  if (ms <= 0) return { label: "Expirada", expired: true };
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h >= 1) return { label: `${h}h ${m}min`, expired: false };
  return { label: `${m}min`, expired: false };
}

/**
 * Infere o tipo da ultima mensagem a partir do preview ou de pistas
 * comuns que o backend coloca em listagens (ex.: "[Áudio]", "📎 Doc.pdf").
 * Quando o backend evoluir e enviar `lastMessage.messageType`, usamos
 * direto. Por enquanto, regex resiliente — fallback "text".
 */
export function inferLastMessageType(
  preview: string | null | undefined,
  explicitType?: string | null,
): LastMessageType {
  if (explicitType) {
    const t = explicitType.toLowerCase();
    if (t === "image") return "image";
    if (t === "audio" || t === "voice") return "audio";
    if (t === "video") return "video";
    if (t === "document") return "document";
    if (t === "file") return "file";
    if (t === "template") return "template";
    if (t === "note") return "note";
    if (t === "location") return "location";
    if (t === "contact" || t === "contacts") return "contact";
  }
  const p = (preview ?? "").trim().toLowerCase();
  if (!p) return "text";
  if (/^\[?(áudio|audio|voz|voice)\]?/.test(p) || p.startsWith("🎵") || p.startsWith("🎤")) {
    return "audio";
  }
  if (/^\[?(imagem|foto|image|photo)\]?/.test(p) || p.startsWith("📷") || p.startsWith("🖼")) {
    return "image";
  }
  if (/^\[?(vídeo|video)\]?/.test(p) || p.startsWith("🎥") || p.startsWith("🎬")) {
    return "video";
  }
  if (
    /^\[?(documento|document|arquivo|pdf)\]?/.test(p) ||
    p.startsWith("📎") ||
    p.startsWith("📄")
  ) {
    return "document";
  }
  if (/^\[?(template|modelo)\]?/.test(p)) return "template";
  if (/^\[?(localiza|location|mapa)\]?/.test(p) || p.startsWith("📍")) {
    return "location";
  }
  if (/^\[?(contato|contact|vcard)\]?/.test(p)) return "contact";
  return "text";
}

/**
 * Preview do card da lista: uma linha, sem markdown/HTML/âncoras.
 * O card renderiza texto puro; se vier `[texto](url)` ou `<a>`, o
 * operador via um snippet clicável como link (e não como abrir a conversa).
 */
export function toPlainCardPreview(content: string): string {
  return content
    .replace(/\[([^\]]+)\]\(\s*(?:https?:\/\/|mailto:|tel:)[^)\s]+\s*\)/gi, "$1")
    .replace(/<\/?a\b[^>]*>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/(^|\s)[*_~`]{1,3}(?=\S)/g, "$1")
    .replace(/(\S)[*_~`]{1,3}(?=\s|$)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function deriveBadge(row: ConversationListRow): ConversationBadge | undefined {
  const tagNames = (row.tags ?? []).map((t) => (t.name ?? "").toLowerCase());
  if (tagNames.some((n) => n === "vip" || n.includes("enterprise"))) {
    return "enterprise";
  }
  if (row.status === "RESOLVED") return "success";
  if (tagNames.some((n) => n === "lead" || n.includes("lead"))) return "lead";
  return undefined;
}

// ─────────────────────────────────────────────────────────────────
// Adapters
// ─────────────────────────────────────────────────────────────────

/** ConversationListRow → Conversation (card da coluna esquerda). */
export function toConversationCard(
  row: ConversationListRow,
  options?: { active?: boolean },
): Conversation {
  const name =
    sanitizeContactName(row.contact?.name) ||
    row.contact?.name?.trim() ||
    "Sem nome";
  const lastActivity = row.lastMessageAt ?? row.lastInboundAt ?? null;
  // Sessao da Meta (24h da ultima mensagem inbound do cliente).
  const sess = sessionRemainingFromInbound(row.lastInboundAt);
  // Primeira tag do contato — mostrada como pill ao lado do nome.
  // Filtra strings vazias/whitespace por defesa.
  const firstTagName = (row.tags ?? [])
    .map((t) => (t.name ?? "").trim())
    .find((n) => n.length > 0);
  // O backend pode enviar tanto `lastMessage` (forma futura, com
  // `preview`) quanto `lastMessagePreview` (forma atual, com `content`
  // + `messageType`). Preferimos o que tiver dado real; se nenhum
  // tiver, cai pra string vazia (mostra apenas o tipo, se conhecido).
  // Texto plano: markdown/HTML no preview virava “link” no card e o
  // clique parecia disparar ação além de abrir a conversa.
  const previewText = toPlainCardPreview(
    prettifyChatMessageBody(
      row.lastMessage?.preview ??
        row.lastMessagePreview?.content ??
        "",
    ),
  );
  const lastMessageType = inferLastMessageType(
    previewText,
    row.lastMessagePreview?.messageType ?? null,
  );
  const dir = String(
    row.lastMessage?.direction ?? row.lastMessagePreview?.direction ?? "",
  ).toLowerCase();
  const lastMessageDirection: "in" | "out" | undefined =
    dir === "out" || dir === "outbound"
      ? "out"
      : dir === "in" || dir === "inbound"
        ? "in"
        : undefined;
  // Prefer sendStatus do preview (batch atual); fallback lastMessage.status.
  const lastMessageStatus =
    lastMessageDirection === "out"
      ? normalizeDeliveryStatus(
          row.lastMessagePreview?.sendStatus ?? row.lastMessage?.status,
        )
      : undefined;
  const lastMessageSendError =
    lastMessageDirection === "out"
      ? row.lastMessagePreview?.sendError ?? null
      : null;

  return {
    id: row.id,
    number: row.number ?? null,
    name,
    initials: avatarInitials(name),
    avatarColor: colorFromName(name),
    status: deriveOnline(row.lastInboundAt),
    time: formatRelative(lastActivity),
    preview: previewText,
    assignee: row.assignedTo?.name,
    // unreadCount alimenta o UnreadCountPill (pílula lilás) + rodapé "aguardando resposta".
    // `urgent` permanece para filtros/tabs (ex.: coluna "urgentes").
    unreadCount: row.unreadCount ?? 0,
    urgent: !!(row.unreadCount && row.unreadCount > 0),
    active: options?.active,
    inactive: row.status !== "OPEN",
    // ── Novos campos visuais ──────────────────────────────────────
    tag: firstTagName ?? null,
    // Lista completa de tags com id/cor — usada pelo cluster de chips
    // do card (até 2 + indicador "+N") e pelo TagsPopover injetado
    // via slot. Filtra entradas sem nome (defesa).
    tags: (row.tags ?? [])
      .filter((t) => (t.name ?? "").trim().length > 0)
      .map((t) => ({ id: t.id, name: t.name, color: t.color ?? null })),
    assigneeId: row.assignedTo?.id ?? null,
    assigneeAvatarUrl: row.assignedTo?.avatarUrl ?? null,
    assigneeType: row.assignedTo?.type ?? null,
    sessionExpiresIn: sess.label,
    sessionExpired: sess.expired,
    lastMessageType,
    lastMessageDirection,
    lastMessageStatus,
    lastMessageSendError,
    // Conversas encerradas/finalizadas — badge visual "Encerrada" no card.
    resolved: row.status === "RESOLVED" || Boolean(row.closedAt),
    // Canal de origem — substitui o status dot pelo logo da plataforma
    // no canto inferior direito do avatar.
    channel: row.channel ?? null,
  };
}

/**
 * Detecta e parseia respostas de formulário Meta Flow.
 *
 * Formato REAL que o backend grava em dto.content:
 *
 *   📋 *Resposta do formulário* — _Nome do Flow_
 *
 *   *Rótulo do campo 1*
 *   ↳ Valor 1
 *
 *   *Rótulo do campo 2*
 *   ↳ Valor 2
 *
 * Cada campo ocupa DUAS linhas: a primeira com o rótulo em negrito,
 * a segunda começando com ↳ (ou ↓ / L) e o valor.
 * Retorna null se o conteúdo não corresponder ao padrão.
 */
function parseFormResponse(content: string): { title: string; fields: FormField[] } | null {
  // Mantém linhas em branco para navegação par-a-par; remove trailing spaces.
  const raw = content.split(/\r?\n/).map((l) => l.trim());
  if (!raw.length) return null;

  // Cabeçalho: aceita emoji 📋 opcional + marcadores *_ opcionais + " — _Flow_" opcional.
  const headerMatch = raw[0].match(
    /^[\u{1F4CB}\u{1F4CB}]?\s*[*_]*resposta\s+do\s+formul[aá]rio[*_]*(?:\s*[—–-]\s*[_*]*(.+?)[_*]*)?$/iu,
  );
  if (!headerMatch) return null;

  const title = (headerMatch[1] ?? "").replace(/[_*]/g, "").trim() || "Resposta do formulário";
  const fields: FormField[] = [];

  // Varre as linhas restantes procurando par: linha de rótulo + linha de valor.
  for (let i = 1; i < raw.length; i++) {
    const line = raw[i];
    if (!line) continue; // linha em branco entre campos — pula

    // Linha de rótulo: *Rótulo* ou _Rótulo_
    const labelMatch = line.match(/^[*_]+(.+?)[*_]+$/);
    if (labelMatch) {
      // Próxima linha não-vazia deve ser o valor (↳ / ↓ / L)
      let j = i + 1;
      while (j < raw.length && !raw[j]) j++; // pula blanks
      if (j < raw.length) {
        const valueMatch = raw[j].match(/^[↳↓L]\s*(.+)/);
        if (valueMatch) {
          fields.push({ label: labelMatch[1].trim(), value: valueMatch[1].trim() });
          i = j; // avança o cursor para após o valor
          continue;
        }
      }
    }

    // Fallback: tenta o formato antigo (rótulo e valor na mesma linha).
    const inlineMatch = line.match(/^[*_](.+?)[*_]\s*[↳↓L]\s*(.+)/);
    if (inlineMatch) {
      fields.push({ label: inlineMatch[1].trim(), value: inlineMatch[2].trim() });
    }
  }

  if (!fields.length) return null;
  return { title, fields };
}

/**
 * Extrai os botões de uma mensagem interativa/template.
 *
 * O backend (automation-executor `send_whatsapp_interactive`) grava o
 * conteúdo como `${corpo}\n[Botões: A, B, C]`. Aqui separamos o corpo
 * real dos rótulos dos botões para o bubble renderizá-los como cards
 * (estilo WhatsApp), em vez de exibir o marcador cru `[Botões: ...]`.
 */
function parseInteractiveButtons(content: string): { text: string; buttons?: string[] } {
  const m = content.match(/\n?\[Bot[õo]es:\s*([^\]]+)\]\s*$/i);
  if (!m) return { text: content };
  const buttons = m[1]
    .split(",")
    .map((b) => b.trim())
    .filter(Boolean);
  const text = content.slice(0, m.index).trimEnd();
  return { text, buttons: buttons.length ? buttons : undefined };
}

/** InboxMessageDto → Message (bolha do chat). */
export function toMessageBubble(
  dto: InboxMessageDto,
  contactName: string,
): Message {
  // Separador de ticket (item sintético de ?history=1): extrai metadados do
  // `content` JSON e devolve uma Message com `ticketInfo` populado. O
  // `type` é irrelevante — o ChatArea verifica `messageType` antes de tentar
  // renderizar como bolha.
  if (dto.messageType === "ticket-separator") {
    let info: {
      number: number
      closedAt: string | null
      isCurrent?: boolean
      openedAt?: string | null
      openedByName?: string | null
      openedByUserId?: string | null
      closedByName?: string | null
      closedByUserId?: string | null
    } = {
      number: 0,
      closedAt: null,
    };
    try {
      info = JSON.parse(dto.content ?? "{}");
    } catch { /* fallback com valores padrão */ }
    return {
      id: dto.id,
      content: "",
      time: "",
      type: "incoming",
      messageType: "ticket-separator",
      ticketInfo: {
        number: info.number ?? 0,
        closedAt: info.closedAt ?? null,
        isCurrent: info.isCurrent,
        openedAt: info.openedAt ?? null,
        openedByName: info.openedByName ?? null,
        openedByUserId: info.openedByUserId ?? null,
        closedByName: info.closedByName ?? null,
        closedByUserId: info.closedByUserId ?? null,
      },
    };
  }

  // Backend serializa direction em minúsculas ("in" / "out" / "system").
  // Aceitamos também as variantes UPPER por defesa (caso outro endpoint
  // ou SSE futuro mude o casing — nunca regredir o lado dos balões).
  const dir = String(dto.direction ?? "").toLowerCase();
  const isInbound = dir === "in" || dir === "inbound";
  // Preferência: campo explícito `authorType` (novo — permite o backend
  // gravar o nome real da automação em `senderName` sem quebrar a detecção
  // do bot). Fallbacks: `sender.kind === "BOT"` (forward-compat) e o antigo
  // `senderName === "Automação"` (mensagens legadas gravadas antes do
  // `authorType` explícito no automation-executor).
  const isBot =
    dto.authorType === "bot" ||
    dto.sender?.kind === "BOT" ||
    (!isInbound && dto.senderName === "Automação");

  // Campanha (TEMPLATE/TEXT): backend grava `authorType: "bot"` +
  // `senderName: "Campanha: {nome}"`. Extraímos o nome pra a bolha
  // destacar com estilo próprio (não reutilizar AUTOMATION_BG).
  const campaignMatch = !isInbound
    ? /^Campanha:\s*(.+)$/i.exec((dto.senderName ?? "").trim())
    : null;
  const isCampaign = !!campaignMatch;
  const campaignName = campaignMatch?.[1]?.trim() || undefined;

  // Disparo manual de automação (colab): a mensagem REAL enviada pelos steps
  // vem tagueada com `triggeredByName` (nome do agente que acionou). O inbox
  // exibe o selo "Manual" + o avatar (iniciais) do agente ao lado do robô,
  // reproduzindo a mensagem enviada. Mantém compat com o card legado
  // `messageType: "automation_run"` (agente ficava em `senderName`).
  const manualTriggerName =
    !isInbound && typeof dto.triggeredByName === "string" && dto.triggeredByName.trim()
      ? dto.triggeredByName.trim()
      : null;
  const legacyRunAgent =
    !isInbound && dto.messageType === "automation_run" && dto.senderName
      ? dto.senderName
      : null;
  const manualAutomationAgent = manualTriggerName ?? legacyRunAgent;
  const isAutomationRun =
    !!manualAutomationAgent || (!isInbound && dto.messageType === "automation_run");

  // Tenta parsear resposta de formulário Meta Flow (sempre inbound)
  const formParsed = isInbound ? parseFormResponse(dto.content ?? "") : null;

  // Abre `[Template: nome]` / cabeçalho 📋 e depois separa `[Botões: ...]`.
  const prettyContent = prettifyChatMessageBody(dto.content ?? "");
  const btnParsed = !formParsed ? parseInteractiveButtons(prettyContent) : null;

  const isCallRec =
    String(dto.messageType ?? "").toLowerCase() === "whatsapp_call_recording";
  const callAgentName = isCallRec
    ? agentNameFromWhatsappCallSender(dto.senderName)
    : "";
  const outboundSenderName = callAgentName || dto.senderName || undefined;

  return {
    id: dto.id,
    content: formParsed ? "" : (btnParsed?.text ?? dto.content ?? ""),
    buttons: btnParsed?.buttons,
    time: formatTime(dto.createdAt),
    createdAt: dto.createdAt ?? undefined,
    type: isInbound ? "incoming" : "outgoing",
    // Inbound: iniciais do contato. Outbound humano: iniciais do agente que
    // enviou (`senderName`) — sem isso o avatar caía em "?" em telas que não
    // injetam `agentInitials` (ex.: aba Conversa do deal detail).
    senderInitials: isInbound
      ? avatarInitials(contactName)
      : !isBot && outboundSenderName
        ? avatarInitials(outboundSenderName)
        : undefined,
    // Nome completo do remetente — exibido como tooltip no avatar e rótulo
    // abaixo da bolha outgoing para identificar agente ou automação.
    // Campanha: mantém o valor original ("Campanha: {nome}"); a UI usa
    // `campaignName` no destaque.
    senderName: !isInbound && outboundSenderName ? outboundSenderName : undefined,
    senderUserId: dto.senderUserId ?? undefined,
    // Foto do agente remetente (resolvida no backend). Só outbound humano.
    senderImageUrl: !isInbound && !isBot ? (dto.senderImageUrl ?? undefined) : undefined,
    isBot: isBot || isAutomationRun || isCampaign || undefined,
    isCampaign: isCampaign || undefined,
    campaignName,
    isAutomationRun: isAutomationRun || undefined,
    automationAgentName: manualAutomationAgent ?? undefined,
    automationAgentInitials: manualAutomationAgent
      ? avatarInitials(manualAutomationAgent)
      : undefined,
    formFields: formParsed?.fields,
    formTitle: formParsed?.title,
    messageType: dto.messageType ?? undefined,
    // Timeline: event (log automático) vs note (anotação humana).
    // Legado: notas do sistema/Agente IA viram event. ai_draft fica fora.
    ...(() => {
      const classified = classifyTimelineItem({
        messageType: dto.messageType,
        isPrivate: dto.isPrivate,
        private: dto.private,
        authorType: dto.authorType,
        senderName: dto.senderName,
        content: dto.content,
        direction: dto.direction,
      });
      if (classified.kind === "event") {
        return {
          kind: "event" as const,
          eventAction: classified.action,
          isNote: undefined,
        };
      }
      if (classified.kind === "note" && !isAutomationRun) {
        return { kind: "note" as const, isNote: true as const };
      }
      return { kind: "message" as const, isNote: undefined };
    })(),
    mediaUrl: dto.mediaUrl ?? dto.media?.url ?? undefined,
    // Ticks de entrega (estilo WhatsApp) — apenas para mensagens out.
    status: isInbound ? undefined : toBubbleStatus(dto),
    // Erro de envio (tooltip no balão). GET serializa `sendError`; POST
    // imediato usa `metaError` — consumimos os dois.
    sendError: isInbound
      ? undefined
      : (dto.sendError ?? dto.metaError ?? undefined) || undefined,
    // Conexão por onde a mensagem trafegou — alimenta o marcador de troca
    // de conexão na timeline (ChatArea / deal-chat-binding).
    channelId: dto.channelId ?? null,
    // Citação (reply do cliente numa mensagem específica). Backend popula
    // `replyToPreview` no webhook Meta via `resolveReplyContext`. Se
    // veio vazio/null, não renderiza cabeçalho de citação.
    replyTo: dto.replyToPreview
      ? {
          snippet: dto.replyToPreview,
          // Sem `dto.replyToDirection` explícito no DTO por ora; heurística:
          // se a mensagem atual é inbound (cliente respondeu), o alvo é
          // provavelmente uma out nossa. Facilita a cor do bar lateral.
          direction: isInbound ? "out" : "in",
        }
      : null,
    // Reações do cliente. Backend grava {emoji, from, at}[]. Filtra
    // entradas inválidas defensivamente (JSON pode conter lixo antigo).
    reactions:
      Array.isArray(dto.reactions) && dto.reactions.length > 0
        ? dto.reactions
            .filter(
              (r): r is { emoji: string; from: string; at?: string } =>
                !!r && typeof r === "object" && typeof (r as { emoji?: unknown }).emoji === "string",
            )
            .map((r) => ({ emoji: r.emoji, from: r.from, at: r.at }))
        : undefined,
    isFavorited: dto.favoritedByMe || undefined,
  };
}

/** Mapeia o status do DTO (PENDING/SENT/DELIVERED/READ/FAILED) para a
 *  forma usada pela bolha. `readAt` serve de fallback quando o backend
 *  ainda não preencheu `status`. */
function toBubbleStatus(dto: InboxMessageDto): Message["status"] {
  switch (dto.status) {
    case "PENDING":
      return "pending";
    case "SENT":
      return "sent";
    case "DELIVERED":
      return "delivered";
    case "READ":
      return "read";
    case "FAILED":
      return "failed";
    default:
      return dto.readAt ? "read" : undefined;
  }
}

/** Header do ChatArea (contact pill). */
export interface ChatContactView {
  name: string;
  initials: string;
  avatarColor: Conversation["avatarColor"];
  status: Conversation["status"];
  badge?: ConversationBadge;
  phone: string;
  contactId: string;
  /** Canal da conversa — usado pra renderizar o badge do canal
      (whatsapp/instagram/...) no avatar do header do chat, idêntico
      ao card da lista de conversas. */
  channel?: string | null;
}

export function toChatContact(row: ConversationListRow): ChatContactView {
  const name =
    sanitizeContactName(row.contact?.name) ||
    row.contact?.name?.trim() ||
    "Sem nome";
  return {
    name,
    initials: avatarInitials(name),
    avatarColor: colorFromName(name),
    status: deriveOnline(row.lastInboundAt),
    badge: deriveBadge(row),
    phone: row.contact?.phone ?? "",
    contactId: row.contact?.id ?? row.id,
    channel: row.channel ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────
// Stage pills (header do chat) — usa o pipeline real quando houver
// ─────────────────────────────────────────────────────────────────

export interface StagePillView {
  label: string;
  status: "done" | "active" | "pending";
}

/**
 * Deriva os pills de estágio a partir do board do pipeline padrão.
 * Marca como `done` todos os estágios anteriores ao current, `active`
 * o atual e `pending` os posteriores. Se o backend ainda não tiver
 * estágio na conversa, devolve array vazio.
 */
export function deriveStagePills(
  stages: { id: string; name: string }[],
  currentStageId: string | null,
): StagePillView[] {
  if (!stages.length) return [];
  if (!currentStageId) {
    return stages.map((s) => ({ label: s.name, status: "pending" }));
  }
  let foundCurrent = false;
  return stages.map((s) => {
    if (s.id === currentStageId) {
      foundCurrent = true;
      return { label: s.name, status: "active" };
    }
    return {
      label: s.name,
      status: (foundCurrent ? "pending" : "done") as "done" | "pending",
    };
  });
}

// ───────────────────────────────────────��─────────────────────────
// Sidebar direito — ContactAside.contact
// ─────────────────────────────────────────────────────────────────

/** Shape normalizado de um campo do painel — usado em ContactAsideView. */
export interface PanelField {
  fieldId: string;
  label: string;
  value: string;
  type: string;
  options: string[];
  /** "contact" para campos de contato, "deal" para campos de negócio. */
  entityType: "contact" | "deal";
  /** ID da entidade dona do valor (contactId ou dealId). */
  entityId: string;
  /** Regras de formatação condicional (JSON cru do backend). */
  highlightRules?: unknown[] | null;
  /** Highlight já resolvido pelo backend (preferir sobre re-resolver). */
  highlight?: { severity: string; label: string } | null;
}

export interface ContactAsideView {
  name: string;
  initials: string;
  avatarColor: Conversation["avatarColor"];
  status: Conversation["status"];
  contactId: string;
  /** Conexão (Channel) por onde o contato está conversando (qual WhatsApp). */
  connection?: ContactConnection | null;
  /** Número sequencial do contato por organização (1, 2, 3…). */
  contactNumber?: number | null;
  assignee?: string;
  financialStatus: "success" | "lead" | "enterprise";
  financialLabel: string;
  product: string;
  origin: string;
  formation: string;
  entry: string;
  phone: string;
  email: string;
  /** @ do WhatsApp (Contact.whatsappUsername), quando disponível. */
  whatsappUsername?: string;
  cpf: string;
  rg: string;
  cep: string;
  addressNumber: string;
  birthDate: string;
  createdAt: string;
  tag: string;
  note?: string;
  activities: { text: string; time: string; color?: string }[];
  /**
   * Campos personalizados mesclados: inboxLeadPanelFields (contato) +
   * dealInboxPanelFields do primeiro deal ativo, deduplicados por fieldId,
   * com valores nulos/vazios filtrados.
   */
  panelFields: PanelField[];
  deals: {
    id: string;
    /** N\u00famero sequencial do neg\u00f3cio por organiza\u00e7\u00e3o (1, 2, 3...). */
    number: number | null;
    title: string;
    value: number | null;
    stageName: string | null;
    stageId: string | null;
    pipelineId: string | null;
    pipelineName: string | null;
    productName: string | null;
    /** Status do negocio: OPEN | WON | LOST. */
    status: string | null;
    /** Motivo da perda — preenchido quando status = LOST. */
    lostReason: string | null;
    customFields: { fieldId: string; label: string; value: string | null }[];
  }[];
}

const FALLBACK_FIELD = "—";

function toFinancialStatus(
  row: ConversationListRow,
): { status: ContactAsideView["financialStatus"]; label: string } {
  const badge = deriveBadge(row);
  if (badge === "enterprise") return { status: "enterprise", label: "Enterprise" };
  if (badge === "success") return { status: "success", label: "Adimplente" };
  return { status: "lead", label: "Lead" };
}

function formatDateBr(iso: string | null | undefined): string {
  if (!iso) return FALLBACK_FIELD;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return FALLBACK_FIELD;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/**
 * Mapeia o ContactDetail + ConversationListRow ativo para o shape
 * que o `<ContactAside>` espera.
 *
 * Muitos campos exibidos no v0 (CPF, RG, formação, etc.) podem
 * não estar presentes no payload atual do backend — mapeamos pra
 * "—" como fallback, sem quebrar o layout.
 */
export function toContactAside(
  contact: ContactDetail | undefined | null,
  row: ConversationListRow,
  connection?: ContactConnection | null,
): ContactAsideView {
  const rawName = contact?.name ?? row.contact?.name ?? "Sem nome";
  const name = sanitizeContactName(rawName) || rawName;
  const financial = toFinancialStatus(row);
  const tags = contact?.tags ?? row.tags ?? [];
  const firstDeal = contact?.deals?.[0];
  const activities = (contact?.activities ?? []).slice(0, 5).map((a) => ({
    text: a.title,
    time: formatRelative(a.completedAt ?? a.scheduledAt ?? null) || FALLBACK_FIELD,
    color:
      a.type === "CALL"
        ? "var(--color-success)"
        : a.type === "MEETING"
          ? "var(--brand-primary)"
          : undefined,
  }));

  // Deriva origem do negócio a partir do canal da conversa (campo de sistema,
  // não editável). Só exibe quando o canal é reconhecido.
  function deriveOriginLabel(channel: ConversationListRow["channel"] | null | undefined): string | null {
    switch (channel) {
      case "whatsapp": return "WhatsApp";
      case "instagram":
      case "meta": return "Facebook / Instagram";
      case "email": return "E-mail";
      case "webchat": return "Chat Web";
      default: return null;
    }
  }
  const dealOrigin = deriveOriginLabel(row.channel);

  // Mapeia todos os deals vinculados ao contato com campos customizados.
  // stageCount/stageIndex NÃO são derivados aqui — são falsos.
  // O client do inbox usa useDealDetail + useBoard para obter segmentos reais.
  const deals = (contact?.deals ?? []).map((d) => ({
    id: d.id,
    number: (d as { number?: number | null }).number ?? null,
    title: d.title,
    value: d.value,
    stageName: d.stageName ?? null,
    stageId: d.stageId ?? null,
    pipelineId: (d as { pipelineId?: string }).pipelineId ?? null,
    pipelineName: (d as { pipelineName?: string | null }).pipelineName ?? null,
    productName: d.productName ?? null,
    status: (d as { status?: string | null }).status ?? null,
    lostReason: (d as { lostReason?: string | null }).lostReason ?? null,
    origin: dealOrigin,
    customFields: (d as { customFields?: { fieldId: string; label: string; value: string | null }[] }).customFields ?? [],
  }));

  // ── panelFields: mescla inboxLeadPanelFields (contato) + dealInboxPanelFields
  // do deal ativo, deduplicando por fieldId e filtrando valores nulos/vazios.
  const activeDealId = firstDeal?.id;
  const contactId = contact?.id ?? row.contact?.id ?? row.id;
  const contactPanelFields = contact?.inboxLeadPanelFields ?? [];
  const dealPanelFields = activeDealId
    ? (contact?.dealInboxPanelFields?.[activeDealId] ?? [])
    : [];

  /** Remove prefixo "n_" e troca "_" por espaço de uma opção do Meta Flow. */
  function cleanFlowOption(s: string): string {
    return s.replace(/^\d+_/, "").replace(/_+/g, " ").trim();
  }
  /** Limpa valor de opção individual ou lista "n_Texto, n_Texto" do Meta Flow. */
  function cleanFlowValue(v: string): string {
    if (!v) return v;
    if (v.includes(", ") && v.split(", ").every((p) => /^\d+_/.test(p.trim()))) {
      return v.split(", ").map((p) => cleanFlowOption(p.trim())).join(", ");
    }
    return cleanFlowOption(v);
  }

  const seenFieldIds = new Set<string>();
  type TaggedField = (typeof contactPanelFields[0]) & { _entityType: "contact" | "deal"; _entityId: string };
  const tagged: TaggedField[] = [
    ...contactPanelFields.map((f) => ({ ...f, _entityType: "contact" as const, _entityId: contactId })),
    ...dealPanelFields.map((f) => ({ ...f, _entityType: "deal" as const, _entityId: activeDealId ?? "" })),
  ];
  const panelFields: PanelField[] = tagged
    .filter((f) => {
      if (seenFieldIds.has(f.fieldId)) return false;
      seenFieldIds.add(f.fieldId);
      return true;
    })
    .map((f) => ({
      fieldId: f.fieldId,
      label: f.label || f.name,
      value: cleanFlowValue((f.value ?? "") as string),
      type: f.type,
      options: f.options ?? [],
      entityType: f._entityType,
      entityId: f._entityId,
      highlightRules: f.highlightRules ?? null,
      highlight: f.highlight ?? null,
    }));

  return {
    name,
    initials: avatarInitials(name),
    avatarColor: colorFromName(name),
    status: deriveOnline(row.lastInboundAt),
    connection: connection ?? null,
    contactId: contact?.id ?? row.contact?.id ?? row.id,
    contactNumber: (contact as { number?: number | null } | undefined)?.number ?? null,
    assignee: row.assignedTo?.name,
    financialStatus: financial.status,
    financialLabel: financial.label,
    product: firstDeal?.productName ?? FALLBACK_FIELD,
    origin: contact?.source?.trim() || FALLBACK_FIELD,
    formation: FALLBACK_FIELD,
    entry: FALLBACK_FIELD,
    phone: contact?.phone ?? row.contact?.phone ?? FALLBACK_FIELD,
    email: contact?.email ?? row.contact?.email ?? FALLBACK_FIELD,
    whatsappUsername: contact?.whatsappUsername ?? undefined,
    cpf: contact?.cpf ?? FALLBACK_FIELD,
    rg: contact?.rg ?? FALLBACK_FIELD,
    cep: contact?.cep ?? FALLBACK_FIELD,
    addressNumber: contact?.addressNumber ?? FALLBACK_FIELD,
    birthDate: formatDateBr(contact?.birthDate),
    createdAt: formatDateBr(contact?.createdAt),
    tag: tags[0]?.name ?? FALLBACK_FIELD,
    note: contact?.notes ?? undefined,
    activities,
    deals,
    panelFields,
  };
}

// ─────────────────────────────────────────────────────────────────
// Session expirada? (alerta de 24h da WhatsApp Business)
// ─────────────────────────────────────────────────────────────────

const SESSION_WINDOW_HOURS = 24;

export function isSessionExpired(
  lastInboundAt: string | null | undefined,
  windowHours = SESSION_WINDOW_HOURS,
): boolean {
  if (!lastInboundAt) return true;
  const d = new Date(lastInboundAt);
  if (Number.isNaN(d.getTime())) return true;
  return Date.now() - d.getTime() > windowHours * 60 * 60 * 1000;
}

export type ThreadInboundMessage = {
  direction?: string | null;
  createdAt?: string | null;
  channelId?: string | null;
  isPrivate?: boolean;
  private?: boolean;
  messageType?: string | null;
};

/**
 * Último inbound do cliente no canal do composer, a partir do thread já
 * carregado. Template outbound não reabre a janela; uma bolha `in` de
 * agora sim — mesmo se `GET /session` / `channel-session` ainda estiver
 * cacheado como fechado.
 *
 * Com `strictChannel`, inbound sem `channelId` não conta (override CSV vs
 * Acadêmico: a janela da Meta é por número).
 */
export function lastInboundAtFromThread(
  messages: ThreadInboundMessage[] | undefined,
  selectedChannelId?: string | null,
  opts?: { strictChannel?: boolean },
): string | null {
  if (!messages?.length) return null;
  let latest: string | null = null;
  for (const m of messages) {
    if (m.direction !== "in") continue;
    if (m.isPrivate || m.private) continue;
    const t = (m.messageType ?? "").toLowerCase();
    if (t === "note" || t === "event" || t.startsWith("event:")) continue;
    if (selectedChannelId && m.channelId && m.channelId !== selectedChannelId) {
      continue;
    }
    if (opts?.strictChannel && selectedChannelId && !m.channelId) continue;
    const at = m.createdAt;
    if (!at) continue;
    if (!latest || at > latest) latest = at;
  }
  return latest;
}

/**
 * Composer WhatsApp: a bolha inbound visível reabre a janela. Sem isso o
 * `useChannelSession` (staleTime + sem invalidate no SSE) mantinha o
 * banner "Sessão de 24h encerrada" depois da resposta do cliente.
 */
export function isWhatsappComposerSessionExpired(args: {
  applyWhatsappSession: boolean;
  messagesLoaded: boolean;
  channelOverrideActive: boolean;
  selectedSessionFetched: boolean;
  selectedSessionActive?: boolean;
  messagesSessionActive?: boolean;
  messagesLastInboundAt?: string | null;
  threadLastInboundAt?: string | null;
}): boolean {
  if (!args.applyWhatsappSession) return false;
  if (!args.messagesLoaded) return false;
  if (!isSessionExpired(args.threadLastInboundAt)) return false;
  if (args.channelOverrideActive) {
    if (!args.selectedSessionFetched) return false;
    return args.selectedSessionActive !== true;
  }
  if (args.messagesSessionActive !== undefined) {
    return !args.messagesSessionActive;
  }
  return isSessionExpired(args.messagesLastInboundAt);
}
