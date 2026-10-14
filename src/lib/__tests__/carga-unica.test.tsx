/** @vitest-environment jsdom */
/**
 * Uma carga do shell por abertura, em QUALQUER página:
 *  - 1 `GET /api/me/bootstrap` + 1 `GET /api/me/live` mesmo quando o React
 *    refaz a árvore do zero (erro de hidratação → `app/providers.tsx` cria
 *    outro QueryClient) — caso medido em /contacts (3× + 3×) e em
 *    /pipeline?deal= (live 2×);
 *  - a semeadura espera o 1º commit (o cache não muda no meio da
 *    hidratação, que era o gatilho do erro);
 *  - o live é compartilhado entre abas por 30 s, como o bootstrap.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sessionState = vi.hoisted(() => ({
  current: {
    data: { user: { id: "u1", organizationId: "org-1", isSuperAdmin: false, role: "ADMIN" } },
    status: "authenticated" as const,
  },
}));
vi.mock("next-auth/react", () => ({ useSession: () => sessionState.current }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/contacts",
  useSearchParams: () => new URLSearchParams(),
}));

import V2ContactsClientPage from "@/app/(app)/contacts/client-page";
import { ShellBootstrap } from "@/components/layout/shell-bootstrap";
import { createAppFetch } from "@/lib/api";
import {
  LIVE_SHARE_MAX_AGE_MS,
  newLiveShare,
  sharedLiveSource,
  shareIdentityKey,
  type BootstrapShareEnv,
  type ShareChannelLike,
} from "@/lib/bootstrap-share";
import {
  holdSeedingUntilCommit,
  ME_LIVE_PATH,
  releaseSeedingAfterCommit,
  resetShellBootstrapForTests,
  setLiveSource,
  SHELL_BOOTSTRAP_PATH,
  shellBootstrapKeys,
  startShellBootstrap,
  type MeBootstrapPayload,
  type MeLivePayload,
} from "@/lib/shell-bootstrap";

const PAYLOAD: MeBootstrapPayload = {
  version: 2,
  user: { id: "u1", organizationId: "org-1", isSuperAdmin: false },
  profile: null,
  preferences: null,
  effectivePermissions: {
    permissions: ["*"],
    channelGrants: [],
    stageGrants: [],
    roles: [],
    groups: [],
  },
  organization: null,
  alertConfig: null,
  widgets: null,
  failedBlocks: [],
  blocks: {},
};
const LIVE: MeLivePayload = {
  agentStatus: { userId: "u1", status: "ONLINE", availableForVoiceCalls: false },
  emailUnread: { totalUnread: 0, accounts: [] },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const pathOf = (input: RequestInfo | URL) => {
  const u = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return u.replace(/^https?:\/\/[^/]+/, "");
};

const network = vi.fn(async (input: RequestInfo | URL) => {
  const path = pathOf(input);
  if (path === SHELL_BOOTSTRAP_PATH) return json(PAYLOAD);
  if (path === ME_LIVE_PATH) return json(LIVE);
  // Resto da página de Contatos: listas vazias.
  if (path.startsWith("/api/contacts?") || path === "/api/contacts") {
    return json({ items: [], total: 0, page: 1, perPage: 50 });
  }
  return json([]);
});
const calls = (path: string) => network.mock.calls.filter(([i]) => pathOf(i) === path).length;

// jsdom sem ResizeObserver (a página de Contatos mede a tabela).
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

beforeEach(() => {
  resetShellBootstrapForTests();
  network.mockClear();
  window.localStorage.clear();
  window.fetch = createAppFetch(network as unknown as typeof fetch);
});
afterEach(() => {
  cleanup();
  setLiveSource(null);
});

describe("uma carga do shell por abertura", () => {
  it("Contatos com a árvore refeita 3× (3 QueryClients): 1 bootstrap e 1 live", async () => {
    const clients = [newClient(), newClient(), newClient()];
    for (const client of clients) {
      // Cada passada = o React recriando a raiz (Providers → QueryClient novo).
      cleanup();
      render(
        <QueryClientProvider client={client}>
          <ShellBootstrap />
          <V2ContactsClientPage />
        </QueryClientProvider>,
      );
    }
    const last = clients[2];
    await waitFor(() => {
      expect(last.getQueryData(shellBootstrapKeys.myPermissions("u1"))).toBeDefined();
      expect(last.getQueryData(shellBootstrapKeys.agentStatus("u1"))).toBeDefined();
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(calls(SHELL_BOOTSTRAP_PATH)).toBe(1);
    expect(calls(ME_LIVE_PATH)).toBe(1);
  });

  it("identidade que vai e volta na mesma página: sem nova carga", async () => {
    const client = newClient();
    await startShellBootstrap(client, { userId: "u1", organizationId: "org-1" });
    await startShellBootstrap(client, { userId: "u1", organizationId: null });
    await startShellBootstrap(client, { userId: "u1", organizationId: "org-1" });
    expect(calls(SHELL_BOOTSTRAP_PATH)).toBe(2); // org-1 e "sem org"
    expect(calls(ME_LIVE_PATH)).toBe(2);
  });

  it("a semeadura espera o 1º commit (o cache não muda durante a hidratação)", async () => {
    const client = newClient();
    holdSeedingUntilCommit();
    const done = startShellBootstrap(client, { userId: "u1", organizationId: "org-1" });
    await new Promise((r) => setTimeout(r, 20));
    expect(calls(SHELL_BOOTSTRAP_PATH)).toBe(1); // a rede já saiu
    expect(client.getQueryData(shellBootstrapKeys.myPermissions("u1"))).toBeUndefined();
    releaseSeedingAfterCommit();
    await done;
    expect(client.getQueryData(shellBootstrapKeys.myPermissions("u1"))).toBeDefined();
  });
});

describe("live compartilhado entre abas (30 s)", () => {
  function makeHub() {
    const members = new Set<ShareChannelLike>();
    return () => {
      const ch: ShareChannelLike = {
        onmessage: null,
        postMessage(message) {
          for (const other of members) {
            if (other === ch) continue;
            const data = structuredClone(message);
            setTimeout(() => other.onmessage?.({ data }), 1);
          }
        },
        close() {
          members.delete(ch);
        },
      };
      members.add(ch);
      return ch;
    };
  }

  function setup(ageMs: number, holderUserId = "u1") {
    const hub = makeHub();
    const storage = new Map<string, string>();
    const env = (): BootstrapShareEnv => ({
      createChannel: hub,
      readHint: () => storage.get("hint") ?? null,
      writeHint: (v) => void storage.set("hint", v),
    });
    const tabA = newLiveShare(env());
    const clientA = newClient();
    clientA.setQueryData(shellBootstrapKeys.agentStatus(holderUserId), { status: "AWAY" });
    tabA.hold(
      shareIdentityKey({ userId: holderUserId, organizationId: "org-1" }),
      Date.now() - ageMs,
      () => ({ ...LIVE, user: { id: holderUserId } }),
      true,
    );
    setLiveSource(sharedLiveSource(newLiveShare(env())));
  }

  it("outra aba buscou há 10 s: aba nova sem `/api/me/live`", async () => {
    setup(10_000);
    const client = newClient();
    await startShellBootstrap(client, { userId: "u1", organizationId: "org-1" });
    expect(calls(SHELL_BOOTSTRAP_PATH)).toBe(1);
    expect(calls(ME_LIVE_PATH)).toBe(0);
    expect(client.getQueryData(shellBootstrapKeys.agentStatus("u1"))).toBeDefined();
  });

  it("30 s ou mais: busca o seu", async () => {
    setup(LIVE_SHARE_MAX_AGE_MS);
    await startShellBootstrap(newClient(), { userId: "u1", organizationId: "org-1" });
    expect(calls(ME_LIVE_PATH)).toBe(1);
  });

  it("live de outro usuário não serve", async () => {
    setup(1_000, "u2");
    await startShellBootstrap(newClient(), { userId: "u1", organizationId: "org-1" });
    expect(calls(ME_LIVE_PATH)).toBe(1);
  });
});
