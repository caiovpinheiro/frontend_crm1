/** @vitest-environment jsdom */
/**
 * `blocks` do `/api/me/bootstrap` (contrato novo):
 *  - o mapa `url → queryKey` bate com as chaves e o formato dos hooks;
 *  - com blocos, as rotas semeadas NÃO vão à rede ao montar (nem quem
 *    dispara com o bootstrap em voo, nem quem monta depois);
 *  - sem `blocks` (backend antigo), tudo como antes.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sessionState = vi.hoisted(() => ({
  current: {
    data: { user: { id: "u1", organizationId: "org-1", isSuperAdmin: false } },
    status: "authenticated" as const,
  },
}));
vi.mock("next-auth/react", () => ({ useSession: () => sessionState.current }));

import { ShellBootstrap } from "@/components/layout/shell-bootstrap";
import { createAppFetch } from "@/lib/api";
import {
  BOOTSTRAP_BLOCKS,
  findBootstrapBlock,
  resolveBlockUrl,
  type BootstrapBlockContext,
} from "@/lib/bootstrap-blocks";
import {
  BOOTSTRAP_BLOCKS_HINT_KEY,
  resetShellBootstrapForTests,
  seedBootstrapBlocks,
  SHELL_BOOTSTRAP_PATH,
  type MeBootstrapPayload,
} from "@/lib/shell-bootstrap";
import { BLOCK_FIXTURES, type BlockFixture } from "./bootstrap-blocks.fixtures";

const CTX: BootstrapBlockContext = { userId: "u1", organizationId: "org-1" };

function payload(blocks?: Record<string, unknown>): MeBootstrapPayload {
  return {
    version: 1,
    user: { id: "u1", organizationId: "org-1", isSuperAdmin: false },
    profile: null,
    preferences: null,
    effectivePermissions: null,
    organization: null,
    alertConfig: null,
    agentStatus: null,
    emailUnread: null,
    teamChatRooms: null,
    widgets: null,
    failedBlocks: [],
    ...(blocks ? { blocks } : {}),
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const pathOf = (input: RequestInfo | URL) => {
  const u = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return u.replace(/^https?:\/\/[^/]+/, "");
};

/** Corpo "da rede" das rotas individuais: igual ao do bloco, marcado. */
const networkBody = (path: string) => {
  const fx = BLOCK_FIXTURES[path];
  return fx ? fx.body : { message: `rota não mockada: ${path}` };
};

let bootstrapAnswer: () => Response | Promise<Response>;
const network = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
  const path = pathOf(input);
  if (path === SHELL_BOOTSTRAP_PATH) return bootstrapAnswer();
  return BLOCK_FIXTURES[path] ? json(networkBody(path)) : json(networkBody(path), 500);
});
const netPaths = () => network.mock.calls.map(([input]) => pathOf(input));

function allBlocks(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [url, fx] of Object.entries(BLOCK_FIXTURES)) out[url] = fx.body;
  return out;
}

const fixtures = Object.values(BLOCK_FIXTURES);

function Mount() {
  for (const fx of fixtures) fx.useHook();
  return null;
}

function MountOne({ fx }: { fx: BlockFixture }) {
  fx.useHook();
  return null;
}

function renderApp(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <ShellBootstrap />
      <Mount />
    </QueryClientProvider>,
  );
}

const newClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 2 * 60_000 } } });

beforeEach(() => {
  resetShellBootstrapForTests();
  network.mockClear();
  window.localStorage.clear();
  window.fetch = createAppFetch(network as unknown as typeof fetch);
});
afterEach(() => cleanup());

describe("mapa url → queryKey", () => {
  it("toda entrada tem fixture e URL exata única", () => {
    const urls = BOOTSTRAP_BLOCKS.map((e) => resolveBlockUrl(e, CTX));
    expect(new Set(urls).size).toBe(urls.length);
    for (const url of urls) expect(BLOCK_FIXTURES[url], url).toBeDefined();
    for (const url of urls) expect(findBootstrapBlock(url, CTX)?.name).toBeDefined();
    expect(findBootstrapBlock("/api/rota-que-nao-existe", CTX)).toBeUndefined();
  });

  it("chave e formato semeados = os que o hook real produz pela rede", async () => {
    for (const entry of BOOTSTRAP_BLOCKS) {
      if (!entry.queryKey) continue;
      const url = resolveBlockUrl(entry, CTX);
      const fx = BLOCK_FIXTURES[url];
      expect(entry.queryKey(CTX), entry.name).toEqual(fx.queryKey);

      // Hook real, sem bootstrap: busca a rota individual (rede mockada).
      const real = newClient();
      const view = render(
        <QueryClientProvider client={real}>
          <MountOne fx={fx} />
        </QueryClientProvider>,
      );
      await waitFor(() => expect(real.getQueryData(fx.queryKey), entry.name).toBeDefined());
      view.unmount();

      const seeded = newClient();
      seedBootstrapBlocks(seeded, payload({ [url]: fx.body }));
      expect(seeded.getQueryData(fx.queryKey), entry.name).toEqual(real.getQueryData(fx.queryKey));
    }
  });

  it("semeia com `updatedAt` agora e ignora bloco nulo", () => {
    const client = newClient();
    const [first, second] = Object.keys(BLOCK_FIXTURES);
    const seeded = seedBootstrapBlocks(client, payload({ [first]: BLOCK_FIXTURES[first].body, [second]: null }), 1234);
    expect(seeded).toEqual([first]);
    expect(client.getQueryState(BLOCK_FIXTURES[first].queryKey)?.dataUpdatedAt).toBe(1234);
    expect(client.getQueryState(BLOCK_FIXTURES[second].queryKey)).toBeUndefined();
  });
});

describe("abertura com blocos", () => {
  it("nenhuma rota semeada vai à rede ao montar (só o bootstrap)", async () => {
    bootstrapAnswer = () => json(payload(allBlocks()));
    const client = newClient();
    renderApp(client);
    await waitFor(() => {
      for (const fx of Object.values(BLOCK_FIXTURES)) {
        expect(client.getQueryData(fx.queryKey)).toBeDefined();
      }
    });
    expect(netPaths()).toEqual([SHELL_BOOTSTRAP_PATH]);

    // Quem monta depois (outra tela) acha o dado fresco e não busca.
    renderApp(client);
    await new Promise((r) => setTimeout(r, 20));
    expect(netPaths()).toEqual([SHELL_BOOTSTRAP_PATH]);
  });

  it("GET fora do React Query com o bootstrap em voo também é servido pelo bloco", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    bootstrapAnswer = async () => {
      await gate;
      return json(payload(allBlocks()));
    };
    const client = newClient();
    renderApp(client);
    const [url] = Object.keys(BLOCK_FIXTURES);
    const pending = window.fetch(url);
    release();
    const res = await pending;
    expect(await res.json()).toEqual(BLOCK_FIXTURES[url].body);
    expect(netPaths()).not.toContain(url);
  });
});

describe("compat: backend sem `blocks`", () => {
  it("cada rota faz o GET de sempre e a dica evita esperar da próxima vez", async () => {
    bootstrapAnswer = () => json(payload());
    const client = newClient();
    renderApp(client);
    await waitFor(() => {
      for (const fx of Object.values(BLOCK_FIXTURES)) {
        expect(client.getQueryData(fx.queryKey)).toBeDefined();
      }
    });
    for (const url of Object.keys(BLOCK_FIXTURES)) expect(netPaths()).toContain(url);
    expect(window.localStorage.getItem(BOOTSTRAP_BLOCKS_HINT_KEY)).toBe("0");
  });

  it("bootstrap 404: tudo pelo caminho antigo", async () => {
    bootstrapAnswer = () => json({ message: "not found" }, 404);
    const client = newClient();
    renderApp(client);
    await waitFor(() => {
      for (const url of Object.keys(BLOCK_FIXTURES)) expect(netPaths()).toContain(url);
    });
  });
});

