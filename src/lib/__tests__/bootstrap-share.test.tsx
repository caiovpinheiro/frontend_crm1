/** @vitest-environment jsdom */
/**
 * Bootstrap compartilhado entre abas (`lib/bootstrap-share.ts`):
 *  - aba nova do MESMO usuário/org semeia do bootstrap de uma aba aberta
 *    (< 60 s) e não chama a rede;
 *  - outro usuário/org: ninguém responde → rede;
 *  - bootstrap com mais de 60 s → rede;
 *  - sem dica no storage (nenhuma aba buscou há pouco) → não espera;
 *  - payload v1: os voláteis vão como estão no cache de quem responde.
 */
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BOOTSTRAP_SHARE_MAX_AGE_MS,
  BootstrapShare,
  sharedStableSource,
  type BootstrapShareEnv,
  type ShareChannelLike,
} from "@/lib/bootstrap-share";
import {
  resetShellBootstrapForTests,
  setStableBootstrapSource,
  shellBootstrapKeys,
  startShellBootstrap,
  type MeBootstrapPayload,
  type ShellBootstrapIdentity,
} from "@/lib/shell-bootstrap";
import { BLOCK_FIXTURES } from "./bootstrap-blocks.fixtures";

/** `BroadcastChannel` em memória: entrega assíncrona às OUTRAS instâncias. */
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

let storage: Map<string, string>;
let clock: number;

function tabEnv(hub: () => ShareChannelLike): BootstrapShareEnv {
  return {
    createChannel: hub,
    readHint: () => storage.get("hint") ?? null,
    writeHint: (v) => void storage.set("hint", v),
    now: () => clock,
  };
}

const ANA: ShellBootstrapIdentity = { userId: "u1", organizationId: "org-1" };
const BIA: ShellBootstrapIdentity = { userId: "u2", organizationId: "org-1" };

function payloadFor(id: ShellBootstrapIdentity, over: Partial<MeBootstrapPayload> = {}): MeBootstrapPayload {
  return {
    version: 2,
    user: { id: id.userId, organizationId: id.organizationId ?? null, isSuperAdmin: false },
    profile: null,
    preferences: null,
    effectivePermissions: null,
    organization: null,
    alertConfig: null,
    widgets: null,
    failedBlocks: [],
    blocks: { "/api/pipelines": BLOCK_FIXTURES["/api/pipelines"].body },
    ...over,
  };
}

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

beforeEach(() => {
  storage = new Map();
  clock = 1_000_000;
  resetShellBootstrapForTests();
});
afterEach(() => {
  setStableBootstrapSource(null);
});

/** Aba A abre (rede) e fica com o bootstrap. */
async function openTabA(hub: () => ShareChannelLike, id: ShellBootstrapIdentity, payload: MeBootstrapPayload) {
  const shareA = new BootstrapShare(tabEnv(hub));
  const clientA = newClient();
  const netA = vi.fn(async () => payload);
  const got = await sharedStableSource(shareA, () => clock)(id, netA, () => clientA);
  expect(got).toBe(payload);
  expect(netA).toHaveBeenCalledTimes(1);
  return { shareA, clientA };
}

describe("aba nova com outra aba aberta", () => {
  it("mesmo usuário/org e < 60 s: semeia do bootstrap da outra aba, sem rede", async () => {
    const hub = makeHub();
    const pA = payloadFor(ANA);
    await openTabA(hub, ANA, pA);

    clock += 30_000;
    const shareB = new BootstrapShare(tabEnv(hub));
    setStableBootstrapSource(sharedStableSource(shareB, () => clock));
    const netB = vi.spyOn(window, "fetch");
    const clientB = newClient();
    const payloadB = await startShellBootstrap(clientB, ANA);
    expect(payloadB?.user.id).toBe("u1");
    // Bootstrap v2 recebido de outra aba ainda chama o live (uma vez), mas
    // NÃO o bootstrap; os blocos já estão semeados.
    const paths = netB.mock.calls.map(([i]) => String(i));
    expect(paths.some((p) => p.includes("/api/me/bootstrap"))).toBe(false);
    expect(clientB.getQueryData(BLOCK_FIXTURES["/api/pipelines"].queryKey)).toBeDefined();
    netB.mockRestore();
  });

  it("outro usuário no mesmo navegador: ninguém responde → rede", async () => {
    const hub = makeHub();
    await openTabA(hub, ANA, payloadFor(ANA));
    // A dica é por identidade: a Bia nem pergunta…
    const shareB = new BootstrapShare(tabEnv(hub));
    expect(await shareB.ask(BIA)).toBeNull();
    // …e, mesmo com a dica dela fresca, a aba da Ana não responde à Bia.
    storage.set("hint", `${clock}|u2|org-1`);
    expect(await shareB.ask(BIA)).toBeNull();
    const netB = vi.fn(async () => payloadFor(BIA));
    await sharedStableSource(shareB, () => clock)(BIA, netB, newClient);
    expect(netB).toHaveBeenCalledTimes(1);
  });

  it("oferta com payload de outro usuário (mesma chave forjada) é recusada", async () => {
    const hub = makeHub();
    const shareA = new BootstrapShare(tabEnv(hub));
    // Aba "A" segura um payload da Bia sob a chave da Ana.
    shareA.hold("u1|org-1", clock, () => payloadFor(BIA), true);
    const shareB = new BootstrapShare(tabEnv(hub));
    expect(await shareB.ask(ANA)).toBeNull();
  });

  it("bootstrap da outra aba com 60 s ou mais → rede (o navegador revalida → 304)", async () => {
    const hub = makeHub();
    await openTabA(hub, ANA, payloadFor(ANA));
    clock += BOOTSTRAP_SHARE_MAX_AGE_MS;
    const shareB = new BootstrapShare(tabEnv(hub));
    const netB = vi.fn(async () => payloadFor(ANA));
    await sharedStableSource(shareB, () => clock)(ANA, netB, newClient);
    expect(netB).toHaveBeenCalledTimes(1);
  });

  it("repassar não renova a idade: a aba B responde com o `at` original", async () => {
    const hub = makeHub();
    const born = clock;
    await openTabA(hub, ANA, payloadFor(ANA));
    clock += 10_000;
    const shareB = new BootstrapShare(tabEnv(hub));
    await sharedStableSource(shareB, () => clock)(ANA, vi.fn(), newClient);
    clock += 10_000;
    const shareC = new BootstrapShare(tabEnv(hub));
    const got = await shareC.ask(ANA);
    expect(got?.at).toBe(born);
  });

  it("sem dica (nenhuma aba buscou há pouco): não pergunta nem espera", async () => {
    const hub = makeHub();
    const shareB = new BootstrapShare(tabEnv(hub));
    const t0 = performance.now();
    expect(await shareB.ask(ANA)).toBeNull();
    expect(performance.now() - t0).toBeLessThan(50);
  });

  it("payload v1: os voláteis saem do cache atual de quem responde", async () => {
    const hub = makeHub();
    const v1 = payloadFor(ANA, {
      version: 1,
      agentStatus: { userId: "u1", status: "ONLINE", availableForVoiceCalls: false },
      emailUnread: { totalUnread: 0, accounts: [] },
      teamChatRooms: null,
      blocks: { "/api/team-chat/rooms": { rooms: [] } },
    });
    const { clientA } = await openTabA(hub, ANA, v1);
    clientA.setQueryData(shellBootstrapKeys.agentStatus("u1"), { status: "AWAY" });
    clientA.setQueryData(shellBootstrapKeys.navEmailAccounts(), [{ id: "e1", email: "a@x", unreadCount: 4 }]);
    clientA.setQueryData(["team-chat-rooms"], { rooms: [{ id: "r1", unread: 2 }] });

    const shareB = new BootstrapShare(tabEnv(hub));
    const got = await shareB.ask(ANA);
    expect(got?.payload.agentStatus).toMatchObject({ status: "AWAY" });
    expect(got?.payload.emailUnread).toEqual({
      totalUnread: 4,
      accounts: [{ id: "e1", email: "a@x", unreadCount: 4 }],
    });
    expect(got?.payload.blocks?.["/api/team-chat/rooms"]).toEqual({ rooms: [{ id: "r1", unread: 2 }] });
  });
});
