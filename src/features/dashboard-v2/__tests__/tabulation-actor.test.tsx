/** @vitest-environment jsdom */
/**
 * D12 — coluna "Agente" do "Log de tabulações": automação/IA/sistema aparecem
 * com o rótulo certo; humano mostra o nome; sem `actor` (backend atual) fica
 * como sempre.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "unauthenticated", data: null }),
}));

import { TabulationLogWidget } from "@/app/(app)/settings/tabulations/tabulations-dashboard";
import { tabulationActorLabel } from "@/features/dashboard-v2/tabulation-view";
import type { TabulationAnalyticsResponse } from "@/features/dashboard-v2/use-tabulation-analytics";

afterEach(cleanup);

describe("tabulationActorLabel", () => {
  it("sem actor (backend atual) mantém o comportamento de hoje", () => {
    expect(tabulationActorLabel({ actorName: "Ana" })).toBe("Ana");
    expect(tabulationActorLabel({ actorName: null })).toBe("—");
    expect(tabulationActorLabel({ actorName: null, actor: null })).toBe("—");
  });

  it("humano mostra o nome", () => {
    expect(
      tabulationActorLabel({ actorName: null, actor: { kind: "user", id: "u1", name: "Breno" } }),
    ).toBe("Breno");
    // nome só no campo antigo
    expect(
      tabulationActorLabel({ actorName: "Breno", actor: { kind: "user", id: "u1", name: null } }),
    ).toBe("Breno");
    expect(
      tabulationActorLabel({ actorName: null, actor: { kind: "user", id: null, name: null } }),
    ).toBe("—");
  });

  it("automação, IA e sistema", () => {
    expect(
      tabulationActorLabel({
        actorName: null,
        actor: { kind: "automation", id: "a1", name: "Fluxo de encerramento" },
      }),
    ).toBe("Automação");
    expect(
      tabulationActorLabel({
        actorName: null,
        actor: { kind: "ai_agent", id: "ai1", name: "Sofia" },
      }),
    ).toBe("IA · Sofia");
    expect(
      tabulationActorLabel({ actorName: null, actor: { kind: "ai_agent", id: "ai1", name: null } }),
    ).toBe("IA");
    expect(
      tabulationActorLabel({ actorName: null, actor: { kind: "system", id: null, name: null } }),
    ).toBe("Sistema");
  });
});

type Item = TabulationAnalyticsResponse["items"][number];

const item = (id: string, actorName: string | null, actor?: Item["actor"]): Item => ({
  id,
  occurredAt: "2026-10-07T13:00:00.000Z",
  conversationId: null,
  contactName: `Contato ${id}`,
  actorName,
  actor,
  tabulationPath: "Suporte › Dúvida",
  departmentName: "Suporte",
});

describe("Log de tabulações", () => {
  it("a coluna Agente usa o rótulo do actor", () => {
    const items = [
      item("1", null, { kind: "user", id: "u1", name: "Breno" }),
      item("2", null, { kind: "automation", id: "a1", name: "Fluxo" }),
      item("3", null, { kind: "ai_agent", id: "ai1", name: "Sofia" }),
      item("4", null, { kind: "system", id: null, name: null }),
      item("5", "Carla"), // backend atual: sem actor
      item("6", null), // backend atual: sem nome
    ];
    render(
      <TabulationLogWidget
        data={
          {
            total: items.length,
            page: 1,
            perPage: 25,
            items,
            byTabulation: [],
            byUser: [],
            distinctTabulations: 0,
            distinctUsers: 0,
          } as TabulationAnalyticsResponse
        }
        items={items}
        page={1}
        totalPages={1}
        isLoading={false}
        onPage={() => {}}
      />,
    );
    const rows = screen.getAllByRole("row").slice(1); // sem o cabeçalho
    const agent = (i: number) => within(rows[i]!).getAllByRole("cell")[1]!.textContent;
    expect(rows.map((_, i) => agent(i))).toEqual([
      "Breno",
      "Automação",
      "IA · Sofia",
      "Sistema",
      "Carla",
      "—",
    ]);
  });
});
