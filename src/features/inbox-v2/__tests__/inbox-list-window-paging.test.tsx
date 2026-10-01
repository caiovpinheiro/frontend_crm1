/** @vitest-environment jsdom */
/**
 * Lista REAL da Inbox (coluna + janela de render + ordem da página) sob os
 * dois cenários do HAR do DEV (um gesto → 15 GET `?cursor=` em ~11 s):
 *
 *  1. Páginas que colapsam em 0 linhas novas (tickets RESOLVED do mesmo
 *     contato) e o usuário dá cliques de roda espaçados no fim da lista:
 *     cada clique virava um "gesto novo" e liberava outra página.
 *  2. Páginas de 50 linhas novas cuja ordem (última mensagem) cai ACIMA
 *     do fim da lista — o backend pagina por `updatedAt` e a tela ordena
 *     por `lastMessageAt`. O navegador ancora a rolagem (scroll anchoring),
 *     a sentinela continua visível e o `scroll` da âncora pedia a próxima
 *     página: 7 páginas encadeadas sem o usuário rolar.
 *
 * O modelo de layout simula o Chrome: linhas de altura fixa, janela de
 * render pelo IntersectionObserver, sentinela depois da última linha
 * (placeholders incluídos) e ancoragem: quando linhas entram acima da
 * linha do topo da tela, o `scrollTop` é corrigido e sai um `scroll`.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, renderHook, waitFor } from "@testing-library/react";
import { useCallback, useMemo, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sse = vi.hoisted(() => ({
  subscribeSSEEvents: vi.fn(() => () => {}),
}));
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
import type {
  ConversationListResponse,
  ConversationListRow,
  InboxTab,
} from "@/features/inbox-v2/api";
import { useConversations } from "@/features/inbox-v2/hooks/use-conversations";
import { useInboxRealtime } from "@/features/inbox-v2/hooks/use-realtime";
import {
  sortInboxListRows,
  toInboxListCards,
} from "@/features/inbox-v2/inbox-list-order";
import { installFakeIntersectionObserver, sleep } from "@/test-support/scroll-harness";

// ── Dados ────────────────────────────────────────────────────────────

/** Bem antes de "agora": nenhuma linha parece mensagem recém-chegada. */
const T0 = Date.parse("2026-01-01T00:00:00.000Z");
const iso = (sec: number) => new Date(T0 + sec * 1000).toISOString();
const PER_PAGE = 50;

function row(
  id: string,
  opts: { sec: number | null; contact?: string; status?: string },
): ConversationListRow {
  const contact = opts.contact ?? `ct-${id}`;
  return {
    id,
    number: null,
    status: opts.status ?? "OPEN",
    channel: "whatsapp",
    channelId: "ch_1",
    contactId: contact,
    contact: { id: contact, name: `Contato ${id}` },
    assignedToId: "u_me",
    unreadCount: 0,
    hasHumanReply: true,
    hasAgentReply: false,
    lastMessageDirection: "out",
    lastMessageAt: opts.sec == null ? null : iso(opts.sec),
    lastInboundAt: null,
    updatedAt: iso(9_000_000),
    createdAt: iso(0),
    closedAt: opts.status === "RESOLVED" ? iso(1) : null,
  } as unknown as ConversationListRow;
}

/** Servidor por cursor: `pages[n-1]` é a página n. Sempre `total: 51`, `page: 1` (o que o DEV devolve). */
function mockServer(pages: ConversationListRow[][], latencyMs: number) {
  api.listConversations.mockImplementation(async (args: { cursor?: string }) => {
    await sleep(latencyMs);
    const n = args.cursor ? Number(args.cursor.split("CUR-")[1]) : 1;
    const hasMore = n < pages.length;
    const res: ConversationListResponse = {
      items: pages[n - 1] ?? [],
      total: PER_PAGE + 1,
      page: 1,
      perPage: PER_PAGE,
      hasMore,
      nextCursor: hasMore ? `CUR-${n + 1}` : null,
    };
    return res;
  });
}

/**
 * Cenário 2: a 1ª página tem 40 conversas com mensagem e 10 sem mensagem
 * (vão para o fim da lista); as seguintes (lote importado) têm mensagens
 * mais novas que essas 10 — a ordem da tela as põe acima do fim.
 */
function interleavingPages(count: number): ConversationListRow[][] {
  const first = [
    ...Array.from({ length: 40 }, (_, i) => row(`p1-${i}`, { sec: 8_000_000 - i })),
    ...Array.from({ length: 10 }, (_, i) => row(`p1-sem-${i}`, { sec: null })),
  ];
  const rest = Array.from({ length: count - 1 }, (_, p) =>
    Array.from({ length: PER_PAGE }, (_, i) =>
      row(`imp-${p + 2}-${i}`, { sec: 5_000_000 - (p * 1000 + i) }),
    ),
  );
  return [first, ...rest];
}

/** Cenário 1: depois da 1ª página, só tickets RESOLVED de contatos que já estão na lista. */
function collapsingPages(count: number): ConversationListRow[][] {
  const first = Array.from({ length: PER_PAGE }, (_, i) =>
    row(`p1-${i}`, { sec: 8_000_000 - i }),
  );
  const rest = Array.from({ length: count - 1 }, (_, p) =>
    Array.from({ length: PER_PAGE }, (_, i) =>
      row(`res-${p + 2}-${i}`, {
        sec: 1_000 - i,
        contact: `ct-p1-${i % 3}`,
        status: "RESOLVED",
      }),
    ),
  );
  return [first, ...rest];
}

// ── Host: mesma ligação de `app/(app)/inbox/_v2-client.tsx` ─────────

function InboxList({ tab }: { tab: InboxTab[] }) {
  useInboxRealtime({ activeConversationId: null, currentUserId: "u_me" });
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isPlaceholderData } =
    useConversations({ tab, filters: {}, search: "" });
  const handleLoadMore = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage || isPlaceholderData) return;
    void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isPlaceholderData, fetchNextPage]);
  const rows = useMemo(() => sortInboxListRows(data?.items ?? []), [data]);
  const cards = useMemo(() => toInboxListCards(rows, { tab }), [rows, tab]);
  return (
    <ConversationColumn
      conversations={cards}
      tabsOverride={tab.map((id) => ({ id, label: id }))}
      selectedTabIds={tab}
      hideSearch
      onLoadMore={handleLoadMore}
      hasMore={hasNextPage && !isPlaceholderData}
      isLoadingMore={isFetchingNextPage}
      isLoading={!data}
      totalCount={data?.total}
    />
  );
}

// ── Layout simulado (Chrome) ─────────────────────────────────────────

const LIST = '[data-tour="inbox-list"]';
const ROW_H = 92;
const VIEWPORT = 600;

function mount(pages: ConversationListRow[][], latencyMs: number) {
  mockServer(pages, latencyMs);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <InboxList tab={["todos"]} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  const scroller = () => view.container.querySelector<HTMLElement>(LIST)!;
  /** Wrappers das linhas (`WindowedRow`), renderizadas ou placeholder, na ordem da tela. */
  const rowEls = () => [
    ...scroller().querySelectorAll<HTMLElement>(".min-h-full > .flex.flex-col.gap-2 > .shrink-0"),
  ];
  let scrollTop = 0;
  const listHeight = () => rowEls().length * ROW_H;
  const maxTop = () => Math.max(0, listHeight() - VIEWPORT);

  const io = installFakeIntersectionObserver((target, _root, margin) => {
    const rows = rowEls();
    const idx = rows.indexOf(target as HTMLElement);
    // Linha: dentro do viewport ± margem da janela de render.
    const top = idx >= 0 ? idx * ROW_H : rows.length * ROW_H; // senão: sentinela, no fim
    const bottom = top + (idx >= 0 ? ROW_H : 1);
    return bottom >= scrollTop - margin && top <= scrollTop + VIEWPORT + margin;
  });

  let anchor: { el: HTMLElement; idx: number } | null = null;
  const bind = () => {
    const el = scroller();
    Object.defineProperty(el, "clientHeight", { configurable: true, get: () => VIEWPORT });
    Object.defineProperty(el, "scrollHeight", {
      configurable: true,
      get: () => Math.max(listHeight(), VIEWPORT),
    });
    Object.defineProperty(el, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: (v: number) => {
        scrollTop = Math.min(maxTop(), Math.max(0, v));
      },
    });
  };
  const recordAnchor = () => {
    const rows = rowEls();
    const idx = Math.floor(scrollTop / ROW_H);
    anchor = rows[idx] ? { el: rows[idx]!, idx } : null;
  };
  /** Scroll anchoring + clamp do navegador depois de um render. */
  const applyAnchoring = () => {
    const before = scrollTop;
    if (anchor) {
      const now = rowEls().indexOf(anchor.el);
      if (now >= 0 && now !== anchor.idx) scrollTop += (now - anchor.idx) * ROW_H;
    }
    scrollTop = Math.min(maxTop(), Math.max(0, scrollTop));
    if (scrollTop !== before) scroller().dispatchEvent(new Event("scroll"));
  };
  /** Um frame: ancoragem, observers, e o que isso desencadear. */
  const frame = async (ms = 20) => {
    await act(async () => {
      applyAnchoring();
      io.flush();
      recordAnchor();
      await sleep(ms);
    });
  };
  const settle = async (ms: number) => {
    const end = Date.now() + ms;
    while (Date.now() < end) await frame();
  };
  /** Usuário rola até o fim da lista (um gesto de scroll contínuo). */
  const scrollToEnd = async () => {
    while (scrollTop < maxTop()) {
      scrollTop = Math.min(maxTop(), scrollTop + 200);
      await act(async () => {
        scroller().dispatchEvent(new Event("scroll"));
      });
      await frame(16);
    }
  };
  /** Um clique da roda (100px para baixo). */
  const wheelClick = async () => {
    await act(async () => {
      const ev = new Event("wheel") as Event & { deltaY: number; deltaMode: number };
      Object.assign(ev, { deltaY: 100, deltaMode: 0 });
      scroller().dispatchEvent(ev);
      const before = scrollTop;
      scrollTop = Math.min(maxTop(), scrollTop + 100);
      if (scrollTop !== before) scroller().dispatchEvent(new Event("scroll"));
    });
  };
  return { qc, view, scroller, rowEls, bind, frame, settle, scrollToEnd, wheelClick, top: () => scrollTop };
}

const requests = () => api.listConversations.mock.calls.length;

beforeEach(() => {
  api.listConversations.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Inbox (lista real, janela de render) — cenários do HAR", { timeout: 60_000 }, () => {
  it("cenário 2: páginas que entram acima do fim não encadeiam sozinhas (antes: 7 GET seguidos)", async () => {
    const t = mount(interleavingPages(9), 180);
    await t.settle(400);
    t.bind();
    expect(requests()).toBe(1);
    expect(t.rowEls().length).toBe(PER_PAGE);

    await t.scrollToEnd();
    const before = t.rowEls();
    // O usuário para no fim. Nada mais acontece por 3 s.
    await t.settle(3000);
    // Um gesto = 1 página (+ no máximo 1 automática quando a página rende pouco).
    expect(requests()).toBeLessThanOrEqual(3);
    expect(requests()).toBeGreaterThanOrEqual(2);
    // Anexar não remonta nem reordena o que já estava na tela.
    const after = t.rowEls();
    expect(after.slice(0, before.length)).toEqual(before);
  });

  it("cenário 1: páginas que colapsam em 0 linhas + cliques de roda espaçados no fim (antes: 1 GET por clique)", async () => {
    const t = mount(collapsingPages(12), 60);
    await t.settle(200);
    t.bind();
    expect(requests()).toBe(1);

    await t.scrollToEnd();
    await t.settle(400);
    // Cinco cliques de roda, 300 ms entre eles, parado no fim da lista.
    for (let i = 0; i < 5; i += 1) {
      await t.wheelClick();
      await t.settle(300);
    }
    await t.settle(600);
    // Gesto até o fim: 1 página (0 linhas novas) + no máximo 1 automática.
    // Os cliques (500 px, menos que uma tela) não pedem mais nada.
    expect(requests()).toBeLessThanOrEqual(3);
    expect(t.rowEls().length).toBe(PER_PAGE);
  });

  it("indicador do fim tem espaço reservado: buscar a próxima página não muda a altura da lista", async () => {
    const t = mount(interleavingPages(4), 250);
    await t.settle(400);
    t.bind();
    const footer = () => t.scroller().querySelector<HTMLElement>("[data-load-more-footer]");
    expect(footer()).not.toBeNull();
    const idle = footer()!;
    await t.scrollToEnd();
    await t.frame(60);
    // Busca em voo: mesmo elemento, mesmo tamanho; só o conteúdo aparece.
    expect(t.scroller().textContent).toContain("Carregando mais...");
    expect(footer()).toBe(idle);
    expect(idle.className).toContain("h-10");
    await t.settle(600);
    expect(footer()).toBe(idle);
    expect(idle.querySelector("[data-load-more-indicator]")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("ticket aberto do mesmo contato numa página posterior não remonta o card já na tela", async () => {
    const first = Array.from({ length: PER_PAGE }, (_, i) =>
      row(`p1-${i}`, { sec: 8_000_000 - i, status: i === 2 ? "RESOLVED" : "OPEN" }),
    );
    // Página 2: o ticket novo (OPEN) do contato da 3ª linha, mais 49 contatos novos.
    const second = [
      row("p2-reaberto", { sec: 8_000_000 - 2, contact: "ct-p1-2" }),
      ...Array.from({ length: 49 }, (_, i) => row(`p2-${i}`, { sec: 7_000_000 - i })),
    ];
    const t = mount([first, second, interleavingPages(2)[1]!], 60);
    await t.settle(300);
    t.bind();
    const card = t.rowEls()[2]!;
    expect(card.textContent).toContain("Contato p1-2");
    await t.scrollToEnd();
    await t.settle(400);
    expect(requests()).toBeGreaterThanOrEqual(2);
    expect(t.rowEls()[2]).toBe(card);
  });
});

describe("useConversations em modo cursor", () => {
  it("não repassa o `total`/`page` do cursor (o DEV devolve perPage+1 e 1)", async () => {
    mockServer(interleavingPages(3), 0);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const view = renderHook(
      () => useConversations({ tab: "todos", filters: {}, search: "" }),
      { wrapper },
    );
    await waitFor(() => expect(view.result.current.data).toBeDefined());
    expect(view.result.current.data!.total).toBeUndefined();
    expect(view.result.current.hasNextPage).toBe(true);
  });
});
