/** @vitest-environment jsdom */
/**
 * Toda transferência pergunta "Transferir também o dono do negócio?".
 * O padrão vem do departamento (`keepDealOwner`) e a resposta vai sempre
 * explícita para a API.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
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

import { DEPARTMENTS_QUERY_KEY } from "@/features/conversations-settings/hooks/use-departments";
import { TransferPopover } from "@/features/inbox-v2/extras/transfer-popover";
import { teamUsersKey } from "@/features/shared/queries/team-users";

const TEAM = [
  { id: "u_ana", name: "Ana", email: "ana@x.test" },
  { id: "u_bia", name: "Bia", email: "bia@x.test" },
];
const DEPARTMENTS = [
  { id: "d_vendas", name: "Vendas", color: "#111111", icon: "IconBuilding", createdAt: "", keepDealOwner: false },
  { id: "d_fin", name: "Financeiro", color: "#222222", icon: "IconBuilding", createdAt: "", keepDealOwner: true },
];

let qc: QueryClient;
const bodies: Array<Record<string, unknown>> = [];
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.includes("/actions")) {
    bodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    return new Response(JSON.stringify({ conversation: { id: "c1" }, distribution: null }), { status: 200 });
  }
  if (url.includes("/departments")) return new Response(JSON.stringify(DEPARTMENTS), { status: 200 });
  if (url.includes("/api/users")) return new Response(JSON.stringify(TEAM), { status: 200 });
  return new Response("{}", { status: 200 });
});

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  bodies.length = 0;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  qc.setQueryData(teamUsersKey(false), TEAM);
  qc.setQueryData(DEPARTMENTS_QUERY_KEY, DEPARTMENTS);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function radio(name: string) {
  return screen.getByRole("radio", { name });
}

describe("Transferir conversa — pergunta do dono do negócio", () => {
  it("mostra a pergunta; padrão do departamento atual (Vendas = conversa e negócio)", async () => {
    render(<TransferPopover conversationId="c1" currentDepartmentId="d_vendas" variant="composer" />, { wrapper });
    fireEvent.click(screen.getByLabelText("Transferir conversa"));

    expect(await screen.findByText("Transferir também o dono do negócio?")).toBeTruthy();
    expect(radio("Conversa e negócio").getAttribute("aria-checked")).toBe("true");

    fireEvent.click(await screen.findByText("Bia"));
    fireEvent.click(screen.getByText("Transferir"));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ action: "transfer", assignedToId: "u_bia", keepDealOwner: false });
  });

  it("escolher um departamento que mantém o dono muda o padrão para 'Só a conversa'", async () => {
    render(<TransferPopover conversationId="c1" currentDepartmentId="d_vendas" variant="composer" />, { wrapper });
    fireEvent.click(screen.getByLabelText("Transferir conversa"));
    fireEvent.click(await screen.findByText("Financeiro"));

    expect(radio("Só a conversa").getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByText("Transferir"));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ departmentId: "d_fin", keepDealOwner: true });
  });

  it("a resposta do usuário vence o padrão", async () => {
    render(<TransferPopover conversationId="c1" currentDepartmentId="d_fin" variant="composer" />, { wrapper });
    fireEvent.click(screen.getByLabelText("Transferir conversa"));
    fireEvent.click(await screen.findByText("Bia"));
    expect(radio("Só a conversa").getAttribute("aria-checked")).toBe("true");

    fireEvent.click(radio("Conversa e negócio"));
    fireEvent.click(screen.getByText("Transferir"));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ assignedToId: "u_bia", keepDealOwner: false });
  });
});
