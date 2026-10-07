/**
 * Larguras dos painéis do Inbox no desktop (lista | chat | contato).
 *
 * Antes eram px fixos (lista 300, contato 300): a 1.280 px sobravam ~500 px
 * para o chat e a lista cortava nomes. Agora o padrão é PROPORCIONAL à área
 * útil — lista ~30%, contato ~28%, chat o resto — com mínimos/máximos. Quem
 * arrastou o resizer mantém a largura que escolheu (só é encolhida se o chat
 * ficar espremido).
 */

/** Largura da NavRail (`--nav-rail-w`). */
const NAV_RAIL_PX = 72;
/** `gap-2` entre as 3 colunas do grid. */
const GAPS_PX = 16;

export const INBOX_LIST_WIDTH = { pct: 0.3, min: 280, max: 440 } as const;
export const INBOX_ASIDE_WIDTH = { pct: 0.28, min: 260, max: 420 } as const;
/** Menor largura aceitável para o chat antes de encolher os outros painéis. */
export const INBOX_CHAT_MIN_WIDTH = 400;
/** Limites do arrasto manual. */
export const INBOX_LIST_DRAG = { min: 220, max: 520 } as const;
export const INBOX_ASIDE_DRAG = { min: 240, max: 480 } as const;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function resolveInboxPanelWidths(input: {
  /** `window.innerWidth`. */
  viewport: number;
  /** Largura escolhida pela pessoa no resizer (`null` = padrão proporcional). */
  storedList: number | null;
  storedAside: number | null;
  /** Painel do contato recolhido ocupa 0. */
  asideCollapsed: boolean;
}): { list: number; aside: number; chat: number } {
  const available = Math.max(0, input.viewport - NAV_RAIL_PX - GAPS_PX);

  let list =
    input.storedList != null
      ? clamp(input.storedList, INBOX_LIST_DRAG.min, INBOX_LIST_DRAG.max)
      : clamp(
          Math.round(available * INBOX_LIST_WIDTH.pct),
          INBOX_LIST_WIDTH.min,
          INBOX_LIST_WIDTH.max,
        );
  let aside = input.asideCollapsed
    ? 0
    : input.storedAside != null
      ? clamp(input.storedAside, INBOX_ASIDE_DRAG.min, INBOX_ASIDE_DRAG.max)
      : clamp(
          Math.round(available * INBOX_ASIDE_WIDTH.pct),
          INBOX_ASIDE_WIDTH.min,
          INBOX_ASIDE_WIDTH.max,
        );

  // Chat espremido: contato cede primeiro, depois a lista — nunca abaixo do mínimo.
  let overflow = list + aside + INBOX_CHAT_MIN_WIDTH - available;
  if (overflow > 0 && aside > 0) {
    const floor = input.storedAside != null ? INBOX_ASIDE_DRAG.min : INBOX_ASIDE_WIDTH.min;
    const cut = Math.min(overflow, Math.max(0, aside - floor));
    aside -= cut;
    overflow -= cut;
  }
  if (overflow > 0) {
    const floor = input.storedList != null ? INBOX_LIST_DRAG.min : INBOX_LIST_WIDTH.min;
    list -= Math.min(overflow, Math.max(0, list - floor));
  }

  return { list, aside, chat: Math.max(0, available - list - aside) };
}

/** Tablet (768–1023): lista + conversa; o contato vira gaveta. */
export const INBOX_TABLET_LIST_WIDTH = { pct: 0.42, min: 280, max: 340 } as const;

export function resolveInboxTabletListWidth(viewport: number): number {
  const available = Math.max(0, viewport - NAV_RAIL_PX);
  return clamp(
    Math.round(available * INBOX_TABLET_LIST_WIDTH.pct),
    INBOX_TABLET_LIST_WIDTH.min,
    INBOX_TABLET_LIST_WIDTH.max,
  );
}
