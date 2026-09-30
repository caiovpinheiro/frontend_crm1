// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * `/pipeline/[id]` (client-page) monta o host canônico com a conversa
 * ativa do contato do negócio, mantém as abas de conversa e troca de
 * ticket quando o host avisa a reabertura. APIs mockadas (sem rede).
 */

const h = vi.hoisted(() => ({
  hostProps: [] as any[],
  useDealDetail: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/features/pipeline-v2/hooks", () => ({
  useDealDetail: h.useDealDetail,
  useEntityViewers: () => [],
  usePipelines: () => ({ data: [] }),
  dealDetailKey: (dealId: string | null) => ["deal-detail-v2", dealId ?? "__none__"],
}));

vi.mock("@/components/crm/deal-details-panel", () => ({
  DealDetailsPanel: (props: any) => (
    <aside data-testid="details-panel">{props.record?.tag}</aside>
  ),
}));

vi.mock("@/components/crm/deal-viewers-stack", () => ({
  DealViewersStack: () => <div data-testid="viewers" />,
}));

vi.mock("@/components/crm/app-loading", () => ({
  AppLoading: () => <div data-testid="loading" />,
}));

vi.mock("@/components/crm/nav-rail-spacer", () => ({
  NavRailSpacer: () => <div />,
}));

vi.mock("@/features/inbox-v2/extras/conversation-chat-host", () => ({
  ConversationChatHost: (props: any) => {
    h.hostProps.push(props);
    return <div data-testid="chat-host" data-conversation={props.conversationId} />;
  },
}));

import V2DealDetailClientPage from "../client-page";

const last = () => h.hostProps[h.hostProps.length - 1];

const dealFixture = {
  id: "deal-1",
  title: "Matrícula Maria",
  status: "OPEN",
  stageId: "stage-1",
  stage: { id: "stage-1", name: "Contato", color: "#123456", pipelineId: "pipe-1" },
  owner: { id: "user-1", name: "Vendedor" },
  contact: {
    id: "contact-1",
    name: "Maria",
    phone: "+5511999990000",
    email: null,
    conversations: [
      {
        id: "conv-old",
        channel: "whatsapp",
        status: "RESOLVED",
        number: 10,
        closedAt: "2026-09-20T10:00:00.000Z",
        inboxName: "Comercial",
      },
      {
        id: "conv-open",
        channel: "whatsapp",
        status: "OPEN",
        number: 11,
        lastInboundAt: "2026-09-29T10:00:00.000Z",
        assignedTo: { id: "user-2", name: "Atendente" },
        department: { id: "dept-1", requireTabulationOnClose: true },
        inboxName: "Comercial",
      },
    ],
  },
};

function renderPage() {
  const qc = new QueryClient();
  const invalidate = vi.spyOn(qc, "invalidateQueries");
  const utils = render(
    <QueryClientProvider client={qc}>
      <V2DealDetailClientPage dealId="deal-1" />
    </QueryClientProvider>,
  );
  return { ...utils, qc, invalidate };
}

beforeEach(() => {
  h.hostProps.length = 0;
  vi.clearAllMocks();
  h.useDealDetail.mockReturnValue({ data: dealFixture, isLoading: false, error: null });
});

afterEach(() => {
  cleanup();
});

describe("/pipeline/[id] — chat canônico", () => {
  it("monta o host com o ticket aberto do contato e as abas de conversa", () => {
    renderPage();

    expect(screen.getByTestId("details-panel").textContent).toBe("Matrícula Maria");
    expect(screen.getByTestId("chat-host").getAttribute("data-conversation")).toBe("conv-open");

    const props = last();
    expect(props.conversation).toEqual({
      status: "OPEN",
      number: 11,
      closedAt: null,
      lastInboundAt: "2026-09-29T10:00:00.000Z",
      assignedToId: "user-2",
    });
    expect(props.contact).toEqual({
      id: "contact-1",
      name: "Maria",
      phone: "+5511999990000",
      channel: "whatsapp",
    });
    expect(props.dealId).toBe("deal-1");
    expect(props.pipelineId).toBe("pipe-1");
    expect(props.departmentId).toBe("dept-1");
    expect(props.requireTabulationOnClose).toBe(true);
    expect(typeof props.onConversationReopened).toBe("function");
    expect(typeof props.onResolved).toBe("function");

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["whatsapp #10", "whatsapp #11"]);
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
  });

  it("clicar numa aba troca a conversa do host (ticket encerrado)", () => {
    renderPage();
    fireEvent.click(screen.getAllByRole("tab")[0]);

    expect(screen.getByTestId("chat-host").getAttribute("data-conversation")).toBe("conv-old");
    expect(last().conversation).toEqual({
      status: "RESOLVED",
      number: 10,
      closedAt: "2026-09-20T10:00:00.000Z",
      lastInboundAt: null,
      assignedToId: null,
    });
    expect(last().departmentId).toBeNull();
    expect(last().requireTabulationOnClose).toBe(false);
  });

  it("reabertura pelo host troca para o ticket novo e recarrega o negócio", () => {
    const { invalidate } = renderPage();
    fireEvent.click(screen.getAllByRole("tab")[0]);
    expect(screen.getByTestId("chat-host").getAttribute("data-conversation")).toBe("conv-old");

    act(() => {
      last().onConversationReopened("conv-new");
    });

    // O id novo ainda não veio no GET do negócio: stub OPEN até o refetch.
    expect(screen.getByTestId("chat-host").getAttribute("data-conversation")).toBe("conv-new");
    expect(last().conversation.status).toBe("OPEN");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["deal-detail-v2", "deal-1"] });

    // Encerrar também recarrega o negócio (status das abas).
    invalidate.mockClear();
    act(() => {
      last().onResolved("conv-new");
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["deal-detail-v2", "deal-1"] });
  });

  it("sem conversas mostra o estado vazio e não monta o host", () => {
    h.useDealDetail.mockReturnValue({
      data: { ...dealFixture, contact: { ...dealFixture.contact, conversations: [] } },
      isLoading: false,
      error: null,
    });
    renderPage();
    expect(screen.queryByTestId("chat-host")).toBeNull();
    expect(screen.getByText("Sem conversas vinculadas a este negócio.")).toBeTruthy();
  });

  it("enquanto o negócio carrega não monta o host nem o estado vazio", () => {
    h.useDealDetail.mockReturnValue({ data: undefined, isLoading: true, error: null });
    renderPage();
    expect(screen.queryByTestId("chat-host")).toBeNull();
    expect(screen.queryByText("Sem conversas vinculadas a este negócio.")).toBeNull();
    expect(screen.getAllByTestId("loading").length).toBeGreaterThan(0);
  });
});
