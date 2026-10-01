/** @vitest-environment jsdom */
/**
 * Rolagem da lista do Inbox × requisições.
 *
 * Regressão: a sentinela do fim da lista recriava o IntersectionObserver a
 * cada página carregada; com a sentinela ainda visível (página que não
 * acrescenta cards — colapso por contato, seções recolhidas, filtro no
 * cliente), a 1ª notificação do observer novo pedia outra página, e assim
 * por diante: uma rajada de GETs e o "Carregando mais..." piscando, sem o
 * usuário rolar de novo.
 *
 * O que fica travado aqui:
 *  - sentinela visível o tempo todo NÃO encadeia páginas;
 *  - rolar até o fim uma vez = uma página (uma requisição; com várias
 *    filas, uma por fila que ainda tem `hasMore`);
 *  - durante a busca os cards já carregados continuam na tela e o estado de
 *    carregamento da lista inteira não aparece;
 *  - evento SSE não refaz página nenhuma.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render } from "@testing-library/react";
import { useCallback } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sse = vi.hoisted(() => {
  const state = {
    handlers: null as Record<string, (data: unknown) => void> | null,
  };
  return {
    state,
    subscribeSSEEvents: vi.fn(
      (_url: string, handlers: Record<string, (data: unknown) => void>) => {
        state.handlers = handlers;
        return () => {
          state.handlers = null;
        };
      },
    ),
  };
});
vi.mock("@/hooks/use-sse", () => ({
  subscribeSSEEvents: sse.subscribeSSEEvents,
  useSSEConnected: () => true,
}));
vi.mock("@/features/inbox-v2/context/message-toast-context", () => ({
  useMessageToast: () => ({ registerActiveConversation: () => () => {} }),
}));

const api = vi.hoisted(() => ({
  listConversations: vi.fn(),
}));
vi.mock("@/features/inbox-v2/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/inbox-v2/api")>()),
  listConversations: api.listConversations,
  fetchTabCounts: vi.fn(async () => ({})),
}));

import { ConversationColumn } from "@/components/crm/conversation-column";
import { TooltipProvider } from "@/components/ui/tooltip";
import { toConversationCard } from "@/features/inbox-v2/adapters";
import type {
  ConversationListResponse,
  ConversationListRow,
  InboxTab,
} from "@/features/inbox-v2/api";
import { useConversations } from "@/features/inbox-v2/hooks/use-conversations";
import { useInboxRealtime } from "@/features/inbox-v2/hooks/use-realtime";
import {
  FAKE_LATENCY_MS,
  bindScroller,
  createFrames,
  installFakeIntersectionObserver,
  scrollToEnd,
  sentinelInView,
  sleep,
  type ListLayout,
} from "@/test-support/scroll-harness";

const T0 = Date.parse("2026-09-30T12:00:00.000Z");
const iso = (sec: number) => new Date(T0 + sec * 1000).toISOString();
const PER_PAGE = 50;

function row(id: string, sec: number, extra: Partial<ConversationListRow> = {}) {
  return {
    id,
    number: null,
    status: "OPEN",
    channel: "whatsapp",
    channelId: "ch_1",
    contactId: `contact-${id}`,
    contact: { id: `contact-${id}`, name: `Contato ${id}` },
    assignedToId: "u_me",
    unreadCount: 0,
    hasHumanReply: true,
    hasAgentReply: false,
    lastMessageDirection: "out",
    lastMessageAt: iso(sec),
    updatedAt: iso(sec),
    createdAt: iso(0),
    closedAt: null,
    ...extra,
  } as unknown as ConversationListRow;
}

/** Página `n` (1-based) de uma fila: 50 conversas, da mais nova para a mais antiga. */
function serverPage(
  prefix: string,
  n: number,
  totalPages: number,
): ConversationListResponse {
  const items = Array.from({ length: PER_PAGE }, (_, i) =>
    row(`${prefix}-${n}-${i}`, 100_000 - (n * 1000 + i)),
  );
  const hasMore = n < totalPages;
  return {
    items,
    total: totalPages * PER_PAGE,
    page: n,
    perPage: PER_PAGE,
    hasMore,
    nextCursor: hasMore ? `${prefix}:CUR-${n + 1}` : null,
  };
}

type ListArgs = { tab: string; cursor?: string; page?: number };

const pageOf = (args: ListArgs) =>
  args.cursor ? Number(args.cursor.split("CUR-")[1]) : 1;

/** Servidor falso: `pagesByTab[tab]` páginas por fila, seguindo o cursor. */
function mockServer(pagesByTab: Record<string, number>) {
  api.listConversations.mockImplementation(async (args: ListArgs) => {
    await sleep(FAKE_LATENCY_MS);
    return serverPage(args.tab, pageOf(args), pagesByTab[args.tab] ?? 1);
  });
}

/**
 * Mesma ligação do host da Inbox (`app/(app)/inbox/_v2-client.tsx`):
 * `handleLoadMore`, `hasMore`, `isLoadingMore` e `isLoading`.
 */
function InboxList({ tab }: { tab: InboxTab[] }) {
  useInboxRealtime({ activeConversationId: null, currentUserId: "u_me" });
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isPlaceholderData } =
    useConversations({ tab, filters: {}, search: "" });
  const handleLoadMore = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage || isPlaceholderData) return;
    void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isPlaceholderData, fetchNextPage]);
  return (
    <ConversationColumn
      conversations={(data?.items ?? []).map((r) => ({
        ...toConversationCard(r),
        queueTab: r.queueTab ?? tab[0],
      }))}
      tabsOverride={tab.map((id) => ({ id, label: id }))}
      selectedTabIds={tab}
      hideSearch
      onLoadMore={handleLoadMore}
      hasMore={hasNextPage && !isPlaceholderData}
      isLoadingMore={isFetchingNextPage}
      isLoading={!data}
    />
  );
}

const LIST = '[data-tour="inbox-list"]';
const SENTINEL = `${LIST} [data-load-more-sentinel]`;
/** Linhas da lista (wrappers da janela de render), renderizadas ou não. */
const ROWS = `${LIST} .min-h-full > .flex.flex-col.gap-2 > .shrink-0, ${LIST} .flex-col.gap-2.pt-1 > .shrink-0`;
/** Indicador do fim: fica no DOM (espaço reservado) e só aparece durante a busca. */
const loadingShown = (c: HTMLElement) =>
  c.querySelector("[data-load-more-indicator]")?.getAttribute("aria-hidden") === "false";

function mount(tab: InboxTab[], layoutInit: Partial<ListLayout> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let container: HTMLElement | null = null;
  const layout: ListLayout = {
    viewport: 600,
    rowHeight: 92,
    scrollTop: 0,
    rows: () => container?.querySelectorAll(ROWS).length ?? 0,
    ...layoutInit,
  };
  const io = installFakeIntersectionObserver((target, _root, margin) => {
    // Sentinela do "carregar mais"; as linhas (janela de render) ficam visíveis.
    if (target.matches(SENTINEL)) return sentinelInView(layout, margin);
    return true;
  });
  const view = render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <InboxList tab={tab} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  container = view.container;
  const scroller = () => view.container.querySelector<HTMLElement>(LIST)!;
  const { frame, settle } = createFrames(io, act);
  return { qc, view, layout, io, scroller, frame, settle };
}

const requests = () => api.listConversations.mock.calls.length;

beforeEach(() => {
  sse.state.handlers = null;
  api.listConversations.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Inbox — rolagem da lista × requisições", { timeout: 30_000 }, () => {
  it("sentinela visível o tempo todo não encadeia páginas", async () => {
    mockServer({ entrada: 8 });
    // Lista que nunca passa do viewport (o caso da página que não acrescenta
    // cards): a sentinela fica sempre dentro da margem.
    const t = mount(["entrada"], { rowHeight: 0 });
    await t.settle();
    // 1ª página + no máximo UM preenchimento automático; nada de rajada.
    expect(requests()).toBeLessThanOrEqual(2);
    const afterMount = requests();
    await t.settle();
    expect(requests()).toBe(afterMount);

    // Um gesto no fim da lista (roda do mouse, 8 cliques = mais que uma tela): mais UMA página.
    await act(async () => {
      for (let i = 0; i < 8; i += 1) {
        t.scroller().dispatchEvent(Object.assign(new Event("wheel"), { deltaY: 100, deltaMode: 0 }));
      }
    });
    await t.settle();
    expect(requests()).toBe(afterMount + 1);
  });

  it("rolar até o fim uma vez busca exatamente uma página", async () => {
    mockServer({ entrada: 8 });
    const t = mount(["entrada"]);
    await t.settle();
    bindScroller(t.scroller(), t.layout);
    expect(t.layout.rows()).toBe(PER_PAGE);
    expect(requests()).toBe(1);

    await act(async () => scrollToEnd(t.scroller(), t.layout));
    await t.settle();
    expect(requests()).toBe(2);
    expect(api.listConversations.mock.calls[1]![0]).toMatchObject({
      cursor: "entrada:CUR-2",
    });
    expect(t.layout.rows()).toBe(2 * PER_PAGE);
  });

  it("várias filas: um gesto = uma requisição por fila que ainda tem hasMore", async () => {
    // `ligar` cabe na 1ª página (esgotada); as outras duas continuam.
    mockServer({ ligar: 1, entrada: 3, esperando: 3 });
    const t = mount(["ligar", "entrada", "esperando"]);
    await t.settle();
    bindScroller(t.scroller(), t.layout);
    expect(t.layout.rows()).toBe(3 * PER_PAGE);
    expect(requests()).toBe(3);

    await act(async () => scrollToEnd(t.scroller(), t.layout));
    await t.settle();
    const second = api.listConversations.mock.calls.slice(3).map((c) => c[0].tab);
    expect(second.sort()).toEqual(["entrada", "esperando"]);
  });

  it("durante a busca da próxima página os cards ficam na tela, sem o carregando da lista inteira", async () => {
    let release: (() => void) | null = null;
    api.listConversations.mockImplementation(async (args: ListArgs) => {
      if (args.cursor) await new Promise<void>((r) => (release = r));
      return serverPage("entrada", pageOf(args), 8);
    });
    const t = mount(["entrada"]);
    await t.settle();
    bindScroller(t.scroller(), t.layout);
    const before = [...t.view.container.querySelectorAll(ROWS)];
    expect(before.length).toBe(PER_PAGE);
    const firstCardText = before[0]!.textContent;
    expect(firstCardText).toContain("Contato entrada-1-0");

    await act(async () => scrollToEnd(t.scroller(), t.layout));
    await t.settle(3);
    // Busca em voo: mesmos nós na tela, indicador discreto no fim.
    expect(release).not.toBeNull();
    const during = [...t.view.container.querySelectorAll(ROWS)];
    expect(during.length).toBe(before.length);
    expect(during.every((el, i) => el === before[i])).toBe(true);
    expect(during[0]!.textContent).toBe(firstCardText);
    expect(loadingShown(t.view.container)).toBe(true);
    expect(t.view.container.querySelector("[data-app-loading-state]")).toBeNull();

    await act(async () => release!());
    await t.settle();
    expect(requests()).toBe(2);
    expect(loadingShown(t.view.container)).toBe(false);
    expect(t.layout.rows()).toBe(2 * PER_PAGE);
  });

  it("evento SSE de mensagem nova não refaz página nenhuma", async () => {
    mockServer({ entrada: 8 });
    const t = mount(["entrada"]);
    await t.settle();
    bindScroller(t.scroller(), t.layout);
    await act(async () => scrollToEnd(t.scroller(), t.layout));
    await t.settle();
    expect(requests()).toBe(2);

    for (let i = 0; i < 5; i += 1) {
      await act(async () => {
        sse.state.handlers?.new_message?.({
          conversationId: "entrada-1-3",
          contactId: "contact-entrada-1-3",
          direction: "in",
          content: `oi ${i}`,
          timestamp: iso(200_000 + i),
        });
      });
    }
    await t.settle();
    expect(requests()).toBe(2);
  });
});
