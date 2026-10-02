import { describe, expect, it } from "vitest";

import { mergePresence } from "@/hooks/use-system-presence-sync";

describe("mergePresence", () => {
  const agents = [
    { userId: "u1", name: "Ana", status: "ONLINE" },
    { userId: "u2", name: "Bia", status: "OFFLINE" },
  ];

  it("atualiza o status do agente no formato do widget Equipe online", () => {
    const next = mergePresence(agents, { kind: "agent", userId: "u2", status: "AWAY" }) as typeof agents;
    expect(next[1].status).toBe("AWAY");
    expect(next[0]).toBe(agents[0]);
  });

  it("devolve a mesma referência quando o usuário não está na lista", () => {
    expect(mergePresence(agents, { kind: "agent", userId: "u9", status: "ONLINE" })).toBe(agents);
  });

  it("aceita o formato { responsibles } da Distribuição", () => {
    const prev = { responsibles: [{ id: "u1", status: "OFFLINE" }] };
    const next = mergePresence(prev, { kind: "agent", userId: "u1", status: "ONLINE" }) as typeof prev;
    expect(next.responsibles[0].status).toBe("ONLINE");
  });
});
