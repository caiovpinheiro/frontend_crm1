/**
 * MA-2 — presença "quem está vendo" entre abas: só a líder manda o
 * heartbeat, agregando as entidades de todas as abas. Abas simuladas com
 * `__tests__/fake-tabs.ts`; `fetch`/beacon falsos; timers falsos.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeTabHub, type FakeTab } from "./__tests__/fake-tabs";
import {
  ENTITY_VIEWERS_HEARTBEAT_MS,
  PRESENCE_HIDDEN_GRACE_MS,
  PresenceSync,
  type EntityViewer,
} from "./presence-sync";
import type { TabCoordinator } from "./tab-coordinator";

const ANA: EntityViewer = { userId: "u_ana", name: "Ana", avatarUrl: null };
const BIA: EntityViewer = { userId: "u_bia", name: "Bia", avatarUrl: null };

type Servidor = {
  /** `tab:entityType|entityId` de cada heartbeat, na ordem. */
  beats: string[];
  leaves: string[];
  viewers: EntityViewer[];
};

type Aba = { tab: FakeTab; tabs: TabCoordinator; presence: PresenceSync };

function abrirAba(
  hub: FakeTabHub,
  server: Servidor,
  id: string,
  opts: { locks?: boolean } = {},
): Aba {
  const tab = hub.tab(id, opts);
  const tabs = tab.coordinator();
  const presence = new PresenceSync(
    tab.presenceEnv(tabs, {
      heartbeat: async (entityType, entityId) => {
        server.beats.push(`${id}:${entityType}|${entityId}`);
        return server.viewers;
      },
      leave: (entityType, entityId) => {
        server.leaves.push(`${id}:${entityType}|${entityId}`);
      },
    }),
  );
  return { tab, tabs, presence };
}

const tick = (ms = 10) => vi.advanceTimersByTimeAsync(ms);

describe("presença entre abas — heartbeat só da líder, agregado", () => {
  let hub: FakeTabHub;
  let server: Servidor;

  beforeEach(() => {
    vi.useFakeTimers();
    hub = new FakeTabHub();
    server = { beats: [], leaves: [], viewers: [ANA, BIA] };
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("o mesmo deal em duas abas vira UM heartbeat a cada 25s, e as duas recebem os viewers", async () => {
    const a = abrirAba(hub, server, "a");
    const b = abrirAba(hub, server, "b");
    await tick();
    const viewersA = vi.fn();
    const viewersB = vi.fn();
    a.presence.register("deal", "d1", viewersA);
    b.presence.register("deal", "d1", viewersB);
    await tick();

    expect(server.beats).toEqual(["a:deal|d1"]); // join, só da líder
    expect(viewersA).toHaveBeenLastCalledWith([ANA, BIA]);

    await vi.advanceTimersByTimeAsync(ENTITY_VIEWERS_HEARTBEAT_MS);
    expect(server.beats).toEqual(["a:deal|d1", "a:deal|d1"]);
    // A seguidora recebe a lista retransmitida pela líder.
    expect(viewersB).toHaveBeenLastCalledWith([ANA, BIA]);

    await vi.advanceTimersByTimeAsync(ENTITY_VIEWERS_HEARTBEAT_MS * 3);
    expect(server.beats).toHaveLength(5);
    expect(server.beats.every((b) => b === "a:deal|d1")).toBe(true);
    expect(server.leaves).toEqual([]);
  });

  it("deals diferentes em abas diferentes: a líder bate pelos dois", async () => {
    const a = abrirAba(hub, server, "a");
    const b = abrirAba(hub, server, "b");
    await tick();
    a.presence.register("deal", "d1", vi.fn());
    b.presence.register("deal", "d2", vi.fn());
    await tick();
    expect([...server.beats].sort()).toEqual(["a:deal|d1", "a:deal|d2"]);

    server.beats.length = 0;
    await vi.advanceTimersByTimeAsync(ENTITY_VIEWERS_HEARTBEAT_MS);
    expect([...server.beats].sort()).toEqual(["a:deal|d1", "a:deal|d2"]);
  });

  it("seguidora sai do deal: a líder manda leave só se mais ninguém vê", async () => {
    const a = abrirAba(hub, server, "a");
    const b = abrirAba(hub, server, "b");
    await tick();
    a.presence.register("deal", "d1", vi.fn());
    const sairB1 = b.presence.register("deal", "d1", vi.fn());
    const sairB2 = b.presence.register("deal", "d2", vi.fn());
    await tick();

    sairB1(); // a líder ainda vê d1
    sairB2(); // ninguém mais vê d2
    await tick();
    expect(server.leaves).toEqual(["a:deal|d2"]);
  });

  it("seguidora fecha a aba (bye): leave do que só ela via", async () => {
    const a = abrirAba(hub, server, "a");
    const b = abrirAba(hub, server, "b");
    await tick();
    a.presence.register("deal", "d1", vi.fn());
    b.presence.register("deal", "d2", vi.fn());
    await tick();

    b.tab.close();
    await tick();
    expect(server.leaves).toEqual(["a:deal|d2"]);
  });

  it("líder fecha: a seguidora assume em < 2s e renova na hora; a antiga só sai do que era só dela", async () => {
    const a = abrirAba(hub, server, "a");
    const b = abrirAba(hub, server, "b");
    await tick();
    a.presence.register("deal", "d1", vi.fn()); // só a líder
    a.presence.register("deal", "d2", vi.fn()); // as duas
    b.presence.register("deal", "d2", vi.fn());
    await tick();
    server.beats.length = 0;

    a.tab.close();
    await vi.advanceTimersByTimeAsync(1_999);
    expect(server.leaves).toEqual(["a:deal|d1"]);
    expect(b.tabs.role).toBe("leader");
    expect(server.beats).toEqual(["b:deal|d2"]);

    await vi.advanceTimersByTimeAsync(ENTITY_VIEWERS_HEARTBEAT_MS);
    expect(server.beats).toEqual(["b:deal|d2", "b:deal|d2"]);
  });

  it("aba oculta: até 30s nada muda; depois sai e, ao voltar, entra de novo na hora", async () => {
    const a = abrirAba(hub, server, "a");
    const b = abrirAba(hub, server, "b");
    await tick();
    b.presence.register("deal", "d2", vi.fn());
    await tick();
    server.beats.length = 0;

    b.tab.setHidden(true);
    await vi.advanceTimersByTimeAsync(PRESENCE_HIDDEN_GRACE_MS - 1_000);
    expect(server.leaves).toEqual([]);
    await vi.advanceTimersByTimeAsync(1_100);
    expect(server.leaves).toEqual(["a:deal|d2"]);

    const antes = server.beats.length;
    await vi.advanceTimersByTimeAsync(ENTITY_VIEWERS_HEARTBEAT_MS * 2);
    expect(server.beats).toHaveLength(antes); // sem heartbeat enquanto oculta

    b.tab.setHidden(false);
    await tick();
    expect(server.beats.slice(antes)).toEqual(["a:deal|d2"]);
  });

  it("líder que cede a liderança (termo maior no canal) não manda leave de nada", async () => {
    const a = abrirAba(hub, server, "a", { locks: false });
    a.presence.register("deal", "d1", vi.fn());
    await vi.advanceTimersByTimeAsync(400);
    const b = abrirAba(hub, server, "b", { locks: false });
    b.presence.register("deal", "d2", vi.fn());
    await vi.advanceTimersByTimeAsync(1_000);
    expect(a.tabs.role).toBe("leader");
    expect(b.tabs.role).toBe("follower");
    expect([...server.beats].sort()).toEqual(["a:deal|d1", "a:deal|d2"]);

    // Outra aba assumiu com termo maior (esta estava estrangulada).
    server.beats.length = 0;
    hub.inject("crm:tabs:crm", { v: 1, t: "lead", from: "z", term: a.tabs.term + 5 });
    await tick();
    expect(a.tabs.role).toBe("follower");
    expect(server.leaves).toEqual([]);

    // Enquanto segue a nova líder, não bate por conta própria.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(server.beats).toEqual([]);
    expect(server.leaves).toEqual([]);
  });

  it("aba isolada (sem coordenação) bate sozinha, como antes", async () => {
    const tab = hub.tab("solo");
    const presence = new PresenceSync(
      tab.presenceEnv(null, {
        heartbeat: async (t, id) => {
          server.beats.push(`solo:${t}|${id}`);
          return server.viewers;
        },
        leave: (t, id) => {
          server.leaves.push(`solo:${t}|${id}`);
        },
      }),
    );
    const viewers = vi.fn();
    const sair = presence.register("deal", "d1", viewers);
    await tick();
    expect(server.beats).toEqual(["solo:deal|d1"]);
    expect(viewers).toHaveBeenCalledWith([ANA, BIA]);

    sair();
    expect(server.leaves).toEqual(["solo:deal|d1"]);
    await vi.advanceTimersByTimeAsync(ENTITY_VIEWERS_HEARTBEAT_MS * 2);
    expect(server.beats).toHaveLength(1);
  });
});
