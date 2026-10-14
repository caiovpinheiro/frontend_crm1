/** @vitest-environment jsdom */
/**
 * Contagem de requisições de UMA aba nova em `/pipeline?deal=` com outra
 * aba do CRM aberta (cache HTTP quente), contando 304, SSE e presença.
 *
 * A parte do shell é medida de verdade: a aba "A" (aberta há 10 s) tem o
 * bootstrap v2; a aba "B" monta o `<ShellBootstrap/>`, todos os hooks das
 * rotas globais, o status do agente e o resumo de e-mail — e só o
 * `GET /api/me/live` vai à rede. O resto (por negócio/conversa, que não
 * cabe no bootstrap) é a lista medida na DEV em 14/10, que esta mudança
 * não toca.
 */
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

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
  BootstrapShare,
  sharedStableSource,
  shareIdentityKey,
  type BootstrapShareEnv,
  type ShareChannelLike,
} from "@/lib/bootstrap-share";
import {
  fromShellBootstrap,
  ME_LIVE_PATH,
  resetShellBootstrapForTests,
  setStableBootstrapSource,
  shellBootstrapKeys,
  type MeBootstrapPayload,
} from "@/lib/shell-bootstrap";
import { BLOCK_FIXTURES } from "./bootstrap-blocks.fixtures";

const ROOMS = "/api/team-chat/rooms";
const STATUS = "/api/agents/u1/status";

/**
 * Requisições da aba nova que esta mudança NÃO toca (DEV, 14/10, aba
 * típica): por negócio/conversa ou fora do backend do CRM.
 */
const FORA_DO_SHELL = [
  "GET /api/app-revision (handler do Next)",
  "GET /api/deals/:n",
  "GET /api/branding/logo (imagem)",
  "GET /api/pipelines/:id/board",
  "GET /api/conversations/:c/calling-context",
  "GET /api/scheduled-messages?conversationId=",
  "GET /api/contacts/:id",
  "GET /api/conversations/:c/messages",
  "POST /api/conversations/:c/read",
  "GET /api/conversations/:c/session",
  "GET /api/contacts/:id/active-automations",
  "GET /api/activities/alerts",
] as const;

/** Pior caso da presença: a líder antecipa UMA batida pela entidade nova. */
const PRESENCA_PIOR_CASO = 1;
/** SSE: a aba nova é seguidora (a conexão é da líder). */
const SSE_ABA_NOVA = 0;

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

function v2Payload(): MeBootstrapPayload {
  const blocks: Record<string, unknown> = {};
  for (const [url, fx] of Object.entries(BLOCK_FIXTURES)) {
    if (url !== ROOMS && url !== STATUS) blocks[url] = fx.body;
  }
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
    blocks,
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const pathOf = (input: RequestInfo | URL) => {
  const u = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return u.replace(/^https?:\/\/[^/]+/, "");
};

const network = vi.fn(async (input: RequestInfo | URL) => {
  const path = pathOf(input);
  if (path === ME_LIVE_PATH) {
    return json({
      version: 1,
      agentStatus: { userId: "u1", status: "ONLINE", availableForVoiceCalls: false },
      emailUnread: { totalUnread: 0, accounts: [] },
      teamChatRooms: { totalUnread: 0, rooms: [] },
      failedBlocks: [],
      blocks: {
        [ROOMS]: BLOCK_FIXTURES[ROOMS].body,
        [STATUS]: { userId: "u1", status: "ONLINE", availableForVoiceCalls: false },
      },
    });
  }
  return json({ message: `não deveria ir à rede: ${path}` }, 500);
});

function Mount() {
  for (const [url, fx] of Object.entries(BLOCK_FIXTURES)) {
    if (url !== STATUS) fx.useHook();
  }
  useAgentStatus();
  useQuery({
    queryKey: shellBootstrapKeys.navEmailAccounts(),
    queryFn: (ctx) =>
      fromShellBootstrap(ctx.client, (p) => p.emailUnread?.accounts, async () =>
        (await fetch("/api/email-accounts")).json(),
      ),
  });
  return null;
}

beforeEach(() => {
  resetShellBootstrapForTests();
  network.mockClear();
  window.localStorage.clear();
  window.fetch = createAppFetch(network as unknown as typeof fetch);
});
afterEach(() => {
  cleanup();
  setStableBootstrapSource(null);
});

it("aba nova em /pipeline?deal= com outra aba aberta: ≤ 20 requisições", async () => {
  const hub = makeHub();
  const storage = new Map<string, string>();
  const env = (): BootstrapShareEnv => ({
    createChannel: hub,
    readHint: () => storage.get("hint") ?? null,
    writeHint: (v) => void storage.set("hint", v),
  });
  const identity = { userId: "u1", organizationId: "org-1" };

  // Aba A: buscou o bootstrap há 10 s.
  const shareA = new BootstrapShare(env());
  const payloadA = v2Payload();
  shareA.hold(shareIdentityKey(identity), Date.now() - 10_000, () => payloadA, true);

  // Aba B: abre agora.
  setStableBootstrapSource(sharedStableSource(new BootstrapShare(env())));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ShellBootstrap />
      <Mount />
    </QueryClientProvider>,
  );
  await waitFor(() => {
    for (const [url, fx] of Object.entries(BLOCK_FIXTURES)) {
      expect(client.getQueryData(fx.queryKey), url).toBeDefined();
    }
    expect(client.getQueryData(shellBootstrapKeys.navEmailAccounts())).toBeDefined();
  });
  await new Promise((r) => setTimeout(r, 30));

  const shell = network.mock.calls.map(([i]) => pathOf(i));
  // Bootstrap (outra aba), 11 rotas globais, status e salas (live): só o live.
  expect(shell).toEqual([ME_LIVE_PATH]);

  const total = shell.length + FORA_DO_SHELL.length + PRESENCA_PIOR_CASO + SSE_ABA_NOVA;
  const linhas = [
    ...shell.map((p) => `GET ${p}`),
    ...FORA_DO_SHELL,
    "POST /api/presence/beat (da líder, pior caso)",
  ];
  process.stdout.write(`[abertura] ${total} requisições:\n  ${linhas.join("\n  ")}\n`);
  expect(total).toBeLessThanOrEqual(20);
});
