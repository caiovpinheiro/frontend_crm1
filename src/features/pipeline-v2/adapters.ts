/*
 * Adapters Pipeline v2 — convertem BoardStageDto/BoardDealDto do
 * backend para os tipos visuais que o pacote v0
 * (components/crm/kanban-column.tsx + deal-card.tsx) espera.
 */

import type { ColumnColor } from "@/components/crm/kanban-column";
import type { AvatarColor, Deal, TagType } from "@/components/crm/deal-card";
import type {
  DealListRow,
  DealListStatus,
} from "@/components/crm/deal-list-table";

import type { BoardDealDto, BoardStageDto, DealListItemDto } from "./api";
import {
  avatarInitials,
  formatRelative,
} from "@/features/inbox-v2/adapters";
import { normalizeDeliveryStatus } from "@/components/crm/status-ticks";
import { ownerLabel } from "@/lib/utils";
import { personNameFromDealTitle, sanitizeContactName } from "@/lib/display-name";

// ─────────────────────────────────────────────────────────────────
// Cores de avatar (9 do v0). Hash determinístico do nome.
// ─────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "green",
  "blue",
  "orange",
  "purple",
  "pink",
  "coral",
  "teal",
  "mint",
  "gray",
] as const satisfies readonly AvatarColor[];

function colorFromName(name: string | null | undefined): AvatarColor {
  const safe = (name ?? "").trim();
  if (!safe) return "gray";
  let sum = 0;
  for (let i = 0; i < safe.length; i += 1) sum += safe.charCodeAt(i);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

// ─────────────────────────────────────────────────────────────────
// Colunas: mapeia o NOME do stage → uma das 5 paletas do v0.
// Estágios fora do mapa caem em "novo" (neutro).
// ─────────────────────────────────────────────────────────────────

const STAGE_NAME_TO_COLOR: Record<string, ColumnColor> = {
  novo: "novo",
  lead: "novo",
  entrada: "novo",
  qualificado: "quali",
  qualificacao: "quali",
  proposta: "proposta",
  apresentacao: "proposta",
  negociacao: "nego",
  negociação: "nego",
  fechamento: "fecha",
  ganho: "fecha",
  ganhos: "fecha",
};

export function stageColorFromName(name: string): ColumnColor {
  const key = name.trim().toLowerCase();
  return STAGE_NAME_TO_COLOR[key] ?? "novo";
}

// ─────────────────────────────────────────────────────────────────
// Tags: mapeia nome → TagType do v0.
// ─────────────────────────────────────────────────────────────────

function tagTypeFromName(name: string): TagType {
  const k = name.trim().toLowerCase();
  if (k.includes("quente") || k === "hot") return "hot";
  if (k.includes("morn") || k === "warm") return "warm";
  if (k.includes("frio") || k === "cold") return "cold";
  if (k === "vip") return "vip";
  if (k.includes("parceir") || k === "partner") return "partner";
  if (k.includes("indica") || k === "ref" || k === "referral") return "ref";
  return "warm"; // fallback (visual ambar — neutro positivo)
}

// ─────────────────────────────────────────────────────────────────
// Helpers locais
// ─────────────────────────────────────────────────────────────────

function formatDateBr(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function dealValueNumber(value: number | string): number {
  const n =
    typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

function formatCurrencyBR(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

// ─────────────────────────────────────────────────────────────────
// Adapters
// ─────────────────────────────────────────────────────────────────

/** Notas/sistema que não devem aparecer como preview do card (defesa FE). */
function isInternalOrSystemPreview(content: string | null | undefined): boolean {
  const t = (content ?? "").trim().toLowerCase();
  if (!t) return true;
  return (
    t.startsWith("lead distribuído") ||
    t.startsWith("conversa distribuída") ||
    t.startsWith("conversa enfileirada") ||
    t.startsWith("enfileirada em") ||
    t.startsWith("enfileirada —") ||
    t.startsWith("aguardando consultor") ||
    t.startsWith("nota:") ||
    t.startsWith("nota interna")
  );
}

/** BoardDealDto → Deal (DealCard). */
export function toDealCard(deal: BoardDealDto): Deal {
  // Contato = pessoa; título do deal ("Negócio …") fica no subtitle.
  const contactName =
    sanitizeContactName(deal.contact?.name) ||
    personNameFromDealTitle(deal.title) ||
    "Sem nome";
  const ownerName = ownerLabel(deal.owner?.name, deal.owner?.type) || "Sem responsavel";
  // Prefere lastMessage do board (já filtrado no BE). Defesa: se ainda vier
  // nota/distribuição, omite o preview em vez de poluir o card.
  const lastMessage =
    deal.lastMessage && !isInternalOrSystemPreview(deal.lastMessage.content)
      ? deal.lastMessage
      : null;
  const dir = String(lastMessage?.direction ?? "").toLowerCase();
  const messageDirection: "in" | "out" | undefined =
    dir === "out" || dir === "outbound"
      ? "out"
      : dir === "in" || dir === "inbound"
        ? "in"
        : undefined;
  const messageStatus =
    messageDirection === "out"
      ? normalizeDeliveryStatus(lastMessage?.sendStatus)
      : undefined;
  return {
    id: deal.id,
    name: contactName,
    subtitle: deal.title || deal.productName || "",
    initials: avatarInitials(contactName),
    avatarColor: colorFromName(contactName),
    online: undefined,
    dealNumber: deal.number != null ? `#${deal.number}` : `#${deal.id.slice(0, 4)}`,
    date: formatDateBr(deal.updatedAt ?? deal.createdAt),
    timeAgo: deal.expectedClose ? formatRelative(deal.expectedClose) : undefined,
    message: lastMessage
      ? {
          text: lastMessage.content,
          time: formatRelative(lastMessage.createdAt),
          direction: messageDirection,
          status: messageStatus,
          sendError:
            messageDirection === "out" ? lastMessage.sendError ?? null : null,
          awaitingTexts: (deal.awaitingMessages ?? [])
            .map((m) => (m.content ?? "").trim())
            .filter(Boolean),
        }
      : undefined,
    tags: (deal.tags ?? []).map((t) => ({
      label: t.name,
      type: tagTypeFromName(t.name),
    })),
    owner: {
      initials: avatarInitials(ownerName),
      name: ownerName,
      avatarColor: colorFromName(ownerName),
    },
    // Motivo da perda visível no card (e filtrável) — só pra deals LOST.
    lostReason:
      deal.status === "LOST" && deal.lostReason?.trim()
        ? deal.lostReason.trim()
        : undefined,
    channel: deal.channel ?? (deal.contact?.phone ? "whatsapp" : null),
    contactId: deal.contact?.id ?? null,
    avatarUrl: deal.contact?.avatarUrl ?? null,
    phone: deal.contact?.phone ?? null,
    unreadCount: deal.unreadCount ?? 0,
  };
}

/** Estrutura pronta para passar pra `<KanbanColumn>` na renderizacao. */
export interface KanbanColumnView {
  stageId: string;
  title: string;
  color: ColumnColor;
  /**
   * Cor hex vinda do backend (`BoardStageDto.color`). Quando presente,
   * sobrepõe o preset de `color` na strip do topo + badge de contagem
   * da coluna. Preserva a identidade visual configurada por estágio,
   * em vez de cair no fallback slate para todo estágio "custom".
   */
  stageColor?: string;
  count: number;
  total: string;
  deals: Deal[];
}

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** BoardStageDto → props do `<KanbanColumn>`. */
export function toKanbanColumn(stage: BoardStageDto): KanbanColumnView {
  const totalValue = stage.deals.reduce(
    (acc, d) => acc + dealValueNumber(d.value),
    0,
  );
  // Terminais fixos têm cor determinística pelas flags (verde/vermelho);
  // os demais seguem a heurística por nome.
  const color: ColumnColor = stage.isWon
    ? "quali"
    : stage.isLost
      ? "fecha"
      : stageColorFromName(stage.name);
  // stageColor: hex do backend em estágios NÃO terminais. Terminais
  // (won/lost) mantêm o preset — o significado semântico ali é fixo.
  const rawColor = stage.color?.trim() ?? "";
  const stageColor =
    !stage.isWon && !stage.isLost && HEX_COLOR.test(rawColor)
      ? rawColor
      : undefined;
  return {
    stageId: stage.id,
    title: stage.name,
    color,
    stageColor,
    count: stage.totalCount ?? stage.deals.length,
    total: formatCurrencyBR(totalValue),
    deals: stage.deals.map(toDealCard),
  };
}

/** Helper: array do board completo → array de KanbanColumnView. */
export function toKanbanColumns(stages: BoardStageDto[]): KanbanColumnView[] {
  return [...stages]
    .sort((a, b) => a.position - b.position)
    .map(toKanbanColumn);
}

// ─────────────────────────────────────────────────────────────────
// Visão "Lista" — DealListItemDto → DealListRow
// ─────────────────────────────────────────────────────────────────

const DEAL_STATUS_TO_LIST: Record<string, DealListStatus> = {
  OPEN: "OPEN",
  WON: "WON",
  LOST: "LOST",
};

/** DealListItemDto (payload de `/api/deals`) → DealListRow (tabela DS). */
export function toDealListRow(deal: DealListItemDto): DealListRow {
  const contactName =
    sanitizeContactName(deal.contact?.name) ||
    personNameFromDealTitle(deal.title) ||
    "Sem nome";
  const ownerName = ownerLabel(deal.owner?.name, deal.owner?.type) || null;
  return {
    id: deal.id,
    dealTitle: deal.title || `Negócio #${deal.number ?? deal.id.slice(0, 4)}`,
    contactName,
    contactInitials: avatarInitials(contactName),
    avatarColor: `av-${colorFromName(contactName)}`,
    channel: deal.contact?.phone ? "whatsapp" : null,
    value: formatCurrencyBR(dealValueNumber(deal.value)),
    stageName: deal.stage.name,
    stageColor: deal.stage.color,
    ownerName,
    createdAt: formatDateBr(deal.createdAt),
    status: DEAL_STATUS_TO_LIST[deal.status] ?? "OPEN",
  };
}
