/** @vitest-environment jsdom */
/**
 * Bootstrap v2 + `GET /api/me/live` (contrato novo, opcional):
 *  - o `GET /api/me/bootstrap` leva `x-bootstrap-version: 2`;
 *  - resposta só com o estável → UM `GET /api/me/live` (`no-store`) e os
 *    voláteis semeados nas mesmas chaves de antes (status do agente,
 *    contas de e-mail, salas do chat por `blocks`);
 *  - backend antigo (payload v1 com os voláteis) → nenhum live;
 *  - live 404 → GETs individuais nesta carga e, por 6 h, sem o cabeçalho;
 *  - nenhuma das rotas globais vai à rede depois de semeada.
 */
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sessionState = vi.hoisted(() => ({
  current: {
    data: { user: { id: "u1", organizationId: "org-1", isSuperAdmin: false } },
    status: "authenticated" as const,
  },
}));
vi.mock("next-auth/react", () => ({ useSession: () => sessionState.current }));
vi.mock("@/hooks/use-sse", () => ({
  subscribeSSE: () => () => undefined,
  subscribeSSEEvents: () => () => undefined,
}));

import { useAgentStatus } from "@/components/crm/agent-status";
import { ShellBootstrap } from "@/components/layout/shell-bootstrap";
import { createAppFetch } from "@/lib/api";
import {
  BOOTSTRAP_V2_RETRY_MS,
  BOOTSTRAP_V2_UNSUPPORTED_KEY,
  BOOTSTRAP_VERSION_HEADER,
  fromShellBootstrap,
  ME_LIVE_PATH,
  resetShellBootstrapForTests,
  SHELL_BOOTSTRAP_PATH,
  shellBootstrapKeys,
  type MeBootstrapPayload,
} from "@/lib/shell-bootstrap";
import { BLOCK_FIXTURES } from "./bootstrap-blocks.fixtures";

const STATUS_PATH = "/api/agents/u1/status";
const EMAIL_PATH = "/api/email-accounts";
const ROOMS_PATH = "/api/team-chat/rooms";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const pathOf = (input: RequestInfo | URL) => {
  const u = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return u.replace(/^https?:\/\/[^/]+/, "");
};

function stableBlocks(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [url, fx] of Object.entries(BLOCK_FIXTURES)) {
    if (url !== ROOMS_PATH) out[url] = fx.body;
  }
  return out;
}

/** v2: só o estável (sem as chaves voláteis). */
function v2Payload(): MeBootstrapPayload {
  return {
    version: 2,
    user: { id: "u1", organizationId: "org-1", isSuperAdmin: false },
    profile: null,
    preferences: null,
    effectivePermissions: null,
    organization: null,
    alertConfig: null,
    widgets: null,
    failedBlocks: [],
    blocks: stableBlocks(),
  };
}

/** v1 (backend antigo): ignora o cabeçalho e manda os voláteis. */
function v1Payload(): MeBootstrapPayload {
  return {
    ...v2Payload(),
    version: 1,
    agentStatus: { userId: "u1", status: "AWAY", availableForVoiceCalls: false },
    emailUnread: { totalUnread: 1, accounts: [{ id: "e1", email: "a@x", unreadCount: 1 }] },
    teamChatRooms: null,
    blocks: { ...stableBlocks(), [ROOMS_PATH]: BLOCK_FIXTURES[ROOMS_PATH].body },
  };
}

const LIVE = {
  agentStatus: { userId: "u1", status: "ONLINE", availableForVoiceCalls: true },
  emailUnread: { totalUnread: 3, accounts: [{ id: "e1", email: "a@x", unreadCount: 3 }] },
  teamChatRooms: { totalUnread: 2, rooms: [] },
  blocks: { [ROOMS_PATH]: BLOCK_FIXTURES[ROOMS_PATH].body },
};

let bootstrapAnswer: () => Response;
let liveAnswer: () => Response;
const network = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
  const path = pathOf(input);
  if (path === SHELL_BOOTSTRAP_PATH) return bootstrapAnswer();
  if (path === ME_LIVE_PATH) return liveAnswer();
  if (path === STATUS_PATH) return json({ status: "OFFLINE" });
  if (path === EMAIL_PATH) return json([{ id: "e1", email: "a@x", unreadCount: 9 }]);
  const fx = BLOCK_FIXTURES[path];
  return fx ? json(fx.body) : json({ message: path }, 500);
});
const netPaths = () => network.mock.calls.map(([input]) => pathOf(input));
const initOf = (path: string) =>
  network.mock.calls.find(([input]) => pathOf(input) === path)?.[1];

/** Consumidor do resumo de e-mail como o do trilho (`nav-message-alerts.tsx`). */
function useNavEmail() {
  return useQuery({
    queryKey: shellBootstrapKeys.navEmailAccounts(),
    queryFn: (ctx) =>
      fromShellBootstrap(
        ctx.client,
        (p) => p.emailUnread?.accounts,
        async () => (await fetch(EMAIL_PATH)).json(),
      ),
  });
}

function Mount() {
  for (const fx of Object.values(BLOCK_FIXTURES)) fx.useHook();
  useAgentStatus();
  useNavEmail();
  return null;
}

const newClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 2 * 60_000 } } });

function renderApp(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <ShellBootstrap />
      <Mount />
    </QueryClientProvider>,
  );
}

async function settle(client: QueryClient) {
  await waitFor(() => {
    for (const fx of Object.values(BLOCK_FIXTURES)) expect(client.getQueryData(fx.queryKey)).toBeDefined();
    expect(client.getQueryData(shellBootstrapKeys.agentStatus("u1"))).toBeDefined();
    expect(client.getQueryData(shellBootstrapKeys.navEmailAccounts())).toBeDefined();
  });
}

beforeEach(() => {
  resetShellBootstrapForTests();
  network.mockClear();
  window.localStorage.clear();
  window.fetch = createAppFetch(network as unknown as typeof fetch);
});
afterEach(() => cleanup());

describe("backend novo (v2 + live)", () => {
  it("bootstrap com o cabeçalho v2, um live no-store, voláteis semeados e nada mais na rede", async () => {
    bootstrapAnswer = () => json(v2Payload());
    liveAnswer = () => json(LIVE);
    const client = newClient();
    renderApp(client);
    await settle(client);

    expect(netPaths().sort()).toEqual([ME_LIVE_PATH, SHELL_BOOTSTRAP_PATH].sort());
    const headers = new Headers(initOf(SHELL_BOOTSTRAP_PATH)?.headers);
    expect(headers.get(BOOTSTRAP_VERSION_HEADER)).toBe("2");
    expect(initOf(SHELL_BOOTSTRAP_PATH)?.cache).toBe("no-cache");
    expect(initOf(ME_LIVE_PATH)?.cache).toBe("no-store");

    // Mesmas chaves e formatos de antes (agora vindos do live).
    expect(client.getQueryData(shellBootstrapKeys.agentStatus("u1"))).toMatchObject({ status: "ONLINE" });
    expect(client.getQueryData(shellBootstrapKeys.navEmailAccounts())).toEqual(LIVE.emailUnread.accounts);
    expect(client.getQueryData(["team-chat-rooms"])).toEqual(BLOCK_FIXTURES[ROOMS_PATH].body);

    // Telas que montam depois: nenhuma rota global sai à rede.
    renderApp(client);
    await new Promise((r) => setTimeout(r, 20));
    expect(netPaths()).toHaveLength(2);
  });

  it("GET de rota que o backend moveu para o live, feito com tudo em voo, é servido pelo live", async () => {
    bootstrapAnswer = () => json(v2Payload());
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    liveAnswer = () => json(LIVE);
    network.mockImplementationOnce(async () => {
      await gate;
      return json(v2Payload());
    });
    const client = newClient();
    render(
      <QueryClientProvider client={client}>
        <ShellBootstrap />
      </QueryClientProvider>,
    );
    const pending = window.fetch(ROOMS_PATH);
    release();
    expect(await (await pending).json()).toEqual(BLOCK_FIXTURES[ROOMS_PATH].body);
    expect(netPaths()).not.toContain(ROOMS_PATH);
  });
});

describe("backend antigo", () => {
  it("payload v1 (ignora o cabeçalho): nenhum live; voláteis do próprio bootstrap", async () => {
    bootstrapAnswer = () => json(v1Payload());
    liveAnswer = () => json({ message: "não deveria" }, 500);
    const client = newClient();
    renderApp(client);
    await settle(client);
    expect(netPaths()).toEqual([SHELL_BOOTSTRAP_PATH]);
    expect(client.getQueryData(shellBootstrapKeys.agentStatus("u1"))).toMatchObject({ status: "AWAY" });
  });

  it("live 404: GETs individuais dos voláteis e, por 6 h, sem o cabeçalho v2", async () => {
    bootstrapAnswer = () => json(v2Payload());
    liveAnswer = () => json({ message: "not found" }, 404);
    const client = newClient();
    renderApp(client);
    await settle(client);
    expect(netPaths()).toEqual(
      expect.arrayContaining([SHELL_BOOTSTRAP_PATH, ME_LIVE_PATH, STATUS_PATH, EMAIL_PATH, ROOMS_PATH]),
    );
    expect(window.localStorage.getItem(BOOTSTRAP_V2_UNSUPPORTED_KEY)).not.toBeNull();

    // Próxima carga: sem o cabeçalho.
    cleanup();
    resetShellBootstrapForTests();
    network.mockClear();
    bootstrapAnswer = () => json(v1Payload());
    renderApp(newClient());
    await waitFor(() => expect(netPaths()).toContain(SHELL_BOOTSTRAP_PATH));
    expect(new Headers(initOf(SHELL_BOOTSTRAP_PATH)?.headers).has(BOOTSTRAP_VERSION_HEADER)).toBe(false);
  });

  it("memória do 404 vence depois de 6 h: o cabeçalho volta", async () => {
    window.localStorage.setItem(
      BOOTSTRAP_V2_UNSUPPORTED_KEY,
      String(Date.now() - BOOTSTRAP_V2_RETRY_MS - 1),
    );
    bootstrapAnswer = () => json(v1Payload());
    renderApp(newClient());
    await waitFor(() => expect(netPaths()).toContain(SHELL_BOOTSTRAP_PATH));
    expect(new Headers(initOf(SHELL_BOOTSTRAP_PATH)?.headers).get(BOOTSTRAP_VERSION_HEADER)).toBe("2");
  });

  it("live de outro usuário não semeia nada (GET individual)", async () => {
    bootstrapAnswer = () => json(v2Payload());
    liveAnswer = () => json({ ...LIVE, user: { id: "outro" } });
    const client = newClient();
    renderApp(client);
    await settle(client);
    expect(netPaths()).toContain(STATUS_PATH);
    expect(client.getQueryData(shellBootstrapKeys.agentStatus("u1"))).toMatchObject({ status: "OFFLINE" });
  });
});
