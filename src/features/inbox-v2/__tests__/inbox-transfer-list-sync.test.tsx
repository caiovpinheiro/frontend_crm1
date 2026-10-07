/** @vitest-environment jsdom */
/**
 * F2 — transferência feita pelo próprio usuário.
 *
 * QA 07/10: depois de transferir, reabrir "Transferir conversa" marcava o
 * responsável ANTERIOR como "(atual)", e o card da lista ficava sem o nome do
 * novo responsável. Causas:
 *  - `useTransferConversation` gravava `assignedTo: { id, name: "" }` (sem nome)
 *    e ignorava o estado final que a resposta do POST já traz (responsável com
 *    nome e departamento — inclusive o que a distribuição escolheu);
 *  - o diálogo lê `activeRow` (snapshot "sticky"), que só acompanhava a LISTA:
 *    conversa aberta por busca/deep-link (fixada) ou que saiu da lista ficava
 *    com o responsável de quando foi aberta.
 */
import { QueryClient, QueryClientProvider, skipToken, useQuery } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock("@/lib/api", () => ({ apiUrl: (path: string) => `http://api.test${path}` }));
vi.mock("@/components/crm/tooltip-glass", () => ({
  TooltipGlass: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/crm/system-presence-indicator", () => ({
  SystemPresenceIndicator: () => null,
  sortByPresence: <T,>(list: readonly T[]) => [...list],
}));

import type { ConversationListRow } from "@/features/inbox-v2/api";
import { TransferPopover } from "@/features/inbox-v2/extras/transfer-popover";
import { useTransferConversation } from "@/features/inbox-v2/hooks/use-conversation-actions";
import { useInboxActiveConversation } from "@/features/inbox-v2/hooks/use-inbox-active-conversation";
import { setInboxViewerScope } from "@/features/inbox-v2/inbox-viewer-scope";
import { teamUsersKey } from "@/features/shared/queries/team-users";

const T0 = "2026-10-07T12:00:00.000Z";
const ME = "u_me";
const LIST_KEY = ["inbox-conversations", "todos", {}, ""] as const;

function row(id: string, over: Partial<ConversationListRow> = {}): ConversationListRow {
  return {
    id,
    number: 41,
    status: "OPEN",
    channel: "whatsapp",
    channelId: "ch_1",
    contact: { id: `ct-${id}`, name: `Contato ${id}`, phone: null },
    assignedToId: "u_ana",
    assignedTo: { id: "u_ana", name: "Ana", type: "HUMAN" },
    unreadCount: 0,
    hasHumanReply: true,
    lastMessageDirection: "in",
    lastMessageAt: T0,
    lastInboundAt: T0,
    departmentId: "d1",
    updatedAt: T0,
    createdAt: T0,
    closedAt: null,
    ...over,
  } as unknown as ConversationListRow;
}

type ListCache = { pages: { items: ConversationListRow[]; total?: number }[]; pageParams: unknown[] };

function listItems(qc: QueryClient): ConversationListRow[] {
  return qc.getQueryData<ListCache>(LIST_KEY)?.pages.flatMap((p) => p.items) ?? [];
}

const TEAM = [
  { id: "u_ana", name: "Ana", type: "HUMAN" },
  { id: "u_bia", name: "Bia", type: "HUMAN" },
];

/** Resposta do POST /actions como o backend monta (`select` do transfer). */
function transferResponse() {
  return {
    conversation: {
      id: "c1",
      status: "OPEN",
      assignedToId: "u_bia",
      assignedTo: { id: "u_bia", name: "Bia", email: "bia@x.com", avatarUrl: null },
      departmentId: "d2",
      department: { id: "d2", name: "Vendas", requireTabulationOnClose: false },
    },
    distribution: null,
  };
}

let qc: QueryClient;
let actionResponse: unknown;
const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes("/actions")) {
    return new Response(JSON.stringify(actionResponse), { status: 200 });
  }
  if (url.includes("/api/users")) return new Response(JSON.stringify(TEAM), { status: 200 });
  if (url.includes("/departments")) return new Response("[]", { status: 200 });
  return new Response("{}", { status: 200 });
});

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  actionResponse = transferResponse();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  qc.setQueryData(LIST_KEY, {
    pages: [{ items: [row("c1"), row("c2", { number: 42 })], total: 2 }],
    pageParams: [1],
  });
  qc.setQueryData(["inbox-conversation", "c1"], row("c1"));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("F2 — useTransferConversation grava o estado final com nome", () => {
  it("responsável (com nome) e departamento da resposta entram no item da lista e no cache da conversa", async () => {
    const { result } = renderHook(() => useTransferConversation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ conversationId: "c1", assignedToId: "u_bia", departmentId: "d2" });
    });

    const c1 = listItems(qc).find((r) => r.id === "c1")!;
    expect(c1.assignedToId).toBe("u_bia");
    expect(c1.assignedTo?.name).toBe("Bia");
    expect(c1.departmentId).toBe("d2");
    const single = qc.getQueryData<ConversationListRow>(["inbox-conversation", "c1"]);
    expect(single?.assignedTo?.name).toBe("Bia");
    expect(single?.departmentId).toBe("d2");
  });

  it("só departamento: a distribuição escolheu o responsável — a resposta manda, não o pedido", async () => {
    const { result } = renderHook(() => useTransferConversation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ conversationId: "c1", departmentId: "d2" });
    });

    const c1 = listItems(qc).find((r) => r.id === "c1")!;
    expect(c1.assignedToId).toBe("u_bia");
    expect(c1.assignedTo?.name).toBe("Bia");
    expect(c1.departmentId).toBe("d2");
  });

  it("resposta sem o objeto do responsável: o nome vem da equipe em cache, nunca vazio", async () => {
    actionResponse = { conversation: { id: "c1", assignedToId: "u_bia" } };
    qc.setQueryData(teamUsersKey(false), TEAM);
    const { result } = renderHook(() => useTransferConversation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ conversationId: "c1", assignedToId: "u_bia" });
    });

    expect(listItems(qc).find((r) => r.id === "c1")!.assignedTo?.name).toBe("Bia");
  });

  it("usuário que só vê as próprias: a conversa transferida sai da lista; a aberta segue no cache", async () => {
    setInboxViewerScope(qc, { userId: ME, ownOnly: true });
    const { result } = renderHook(() => useTransferConversation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ conversationId: "c1", assignedToId: "u_bia" });
    });

    expect(listItems(qc).map((r) => r.id)).toEqual(["c2"]);
    expect(qc.getQueryData<ConversationListRow>(["inbox-conversation", "c1"])?.assignedTo?.name).toBe("Bia");
  });
});

function useHarness(opts: { pinned: boolean }) {
  const [activeId, setActiveId] = useState<string | null>("41");
  // Lista reativa ao cache, como a do Inbox (observer da query infinita).
  const { data: listData } = useQuery<ListCache>({ queryKey: LIST_KEY, queryFn: skipToken });
  const rows = listData?.pages.flatMap((p) => p.items) ?? [];
  const active = useInboxActiveConversation({
    activeId,
    setActiveId,
    rows,
    listData: {},
    visibleTabs: [{ id: "todos" }],
    tab: ["todos"],
    replaceTab: () => {},
  });
  // Conversa aberta pela busca/deep-link: o snapshot fixado é o do momento da abertura.
  const { setPinnedFromSearch, setStickyRow } = active;
  return { active, activeId, pin: () => {
    if (!opts.pinned) return;
    setPinnedFromSearch(row("c1"));
    setStickyRow(row("c1"));
  } };
}

describe("F2 — activeRow (fonte do diálogo) acompanha o cache", () => {
  it("conversa fixada pela busca: depois da transferência o responsável é o novo", async () => {
    const view = renderHook(() => useHarness({ pinned: true }), { wrapper });
    act(() => view.result.current.pin());
    expect(view.result.current.active.activeRow?.assignedToId).toBe("u_ana");

    const { result } = renderHook(() => useTransferConversation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ conversationId: "c1", assignedToId: "u_bia" });
    });

    await waitFor(() => expect(view.result.current.active.activeRow?.assignedToId).toBe("u_bia"));
    expect(view.result.current.active.activeRow?.assignedTo?.name).toBe("Bia");
  });

  it("conversa que saiu da lista (só vê as próprias): o diálogo lê o cache da conversa, não o snapshot velho", async () => {
    setInboxViewerScope(qc, { userId: ME, ownOnly: true });
    const view = renderHook(() => useHarness({ pinned: false }), { wrapper });
    await waitFor(() => expect(view.result.current.active.activeRow?.id).toBe("c1"));

    const { result } = renderHook(() => useTransferConversation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ conversationId: "c1", assignedToId: "u_bia" });
    });

    await waitFor(() => expect(view.result.current.active.activeRow?.assignedToId).toBe("u_bia"));
  });
});

describe("F2 — reabrir o diálogo depois de transferir A→B", () => {
  function Screen() {
    const { active, pin } = useHarness({ pinned: true });
    const row = active.activeRow;
    return (
      <div>
        <button type="button" onClick={pin}>
          fixar
        </button>
        <TransferPopover
          variant="composer"
          conversationId="c1"
          currentAssigneeId={row?.assignedToId ?? row?.assignedTo?.id ?? null}
          currentDepartmentId={row?.departmentId ?? null}
        />
      </div>
    );
  }

  it("mostra B como (atual) e A não", async () => {
    render(<Screen />, { wrapper });
    fireEvent.click(screen.getByText("fixar"));

    fireEvent.click(screen.getByLabelText("Transferir conversa"));
    const ana = await screen.findByText("Ana");
    expect(ana.parentElement?.textContent).toContain("(atual)");
    fireEvent.click(await screen.findByText("Bia"));
    fireEvent.click(screen.getByText("Transferir"));
    await waitFor(() => expect(screen.queryByText("Buscar pessoa…")).toBeNull());

    // Reabre o diálogo.
    fireEvent.click(screen.getByLabelText("Transferir conversa"));
    const bia = await screen.findByText("Bia");
    await waitFor(() => expect(bia.parentElement?.textContent).toContain("(atual)"));
    expect((await screen.findByText("Ana")).parentElement?.textContent).not.toContain("(atual)");
  });
});
