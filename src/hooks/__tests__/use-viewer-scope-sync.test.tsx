/** @vitest-environment jsdom */
/**
 * `useViewerScopeSync`: descobre se o usuário só vê o que é dele ("own") e
 * registra no QueryClient para os handlers de tempo real. Qualquer dúvida
 * deixa `ownOnly: null` (nada é removido por escopo).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  session: { user: { id: "u_me", role: "MEMBER" } } as { user: { id: string; role: string } } | null,
  perms: { permissions: ["conversation:view"] } as { permissions: string[] } | undefined,
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: auth.session, status: "authenticated" }),
}));
vi.mock("@/hooks/use-my-permissions", () => ({
  useMyPermissions: () => ({ data: auth.perms }),
}));
vi.mock("@/lib/api", () => ({ apiUrl: (path: string) => `http://api.test${path}` }));

import { useViewerScopeSync } from "@/hooks/use-viewer-scope-sync";
import { getInboxViewerScope } from "@/features/inbox-v2/inbox-viewer-scope";

let qc: QueryClient;
let visibility: unknown;
let visibilityStatus = 200;
const fetchMock = vi.fn(
  async () => new Response(JSON.stringify(visibility), { status: visibilityStatus }),
);

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  auth.session = { user: { id: "u_me", role: "MEMBER" } };
  auth.perms = { permissions: ["conversation:view"] };
  visibility = { ADMIN: "all", MANAGER: "all", MEMBER: "own" };
  visibilityStatus = 200;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useViewerScopeSync", () => {
  it("MEMBER com visibilidade 'own': só os próprios; lê a configuração uma vez", async () => {
    const { rerender } = renderHook(() => useViewerScopeSync(), { wrapper });
    await waitFor(() => expect(getInboxViewerScope(qc)).toEqual({ userId: "u_me", ownOnly: true }));
    rerender();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("MEMBER com visibilidade 'all': vê tudo", async () => {
    visibility = { ADMIN: "all", MANAGER: "all", MEMBER: "all" };
    renderHook(() => useViewerScopeSync(), { wrapper });
    await waitFor(() => expect(getInboxViewerScope(qc)?.ownOnly).toBe(false));
  });

  it("ADMIN (ou permissão *): vê tudo, sem pedir a configuração", async () => {
    auth.session = { user: { id: "u_me", role: "ADMIN" } };
    renderHook(() => useViewerScopeSync(), { wrapper });
    await waitFor(() => expect(getInboxViewerScope(qc)?.ownOnly).toBe(false));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("permissões ainda sem resposta ou configuração com erro: desconhecido (null)", async () => {
    auth.perms = undefined;
    const first = renderHook(() => useViewerScopeSync(), { wrapper });
    await waitFor(() => expect(getInboxViewerScope(qc)).toEqual({ userId: "u_me", ownOnly: null }));
    expect(fetchMock).not.toHaveBeenCalled();
    first.unmount();

    auth.perms = { permissions: [] };
    visibilityStatus = 500;
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useViewerScopeSync(), { wrapper });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(getInboxViewerScope(qc)?.ownOnly).toBeNull();
  });
});
