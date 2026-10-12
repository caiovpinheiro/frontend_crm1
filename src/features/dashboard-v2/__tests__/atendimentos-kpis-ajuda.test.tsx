/** @vitest-environment jsdom */
/**
 * Atendimentos → KPIs do período: "Atendimentos finalizados", "Em aberto —
 * Iniciados" e "Em aberto — Aguardando" ganham o ícone (?) com a explicação.
 * Textos provisórios, centralizados em help-texts.ts (o backend vai sugerir os
 * finais).
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PainelServiceWidget } from "@/components/crm/dashboard/painel-service";
import { DASHBOARD_HELP_TEXT } from "@/features/dashboard-v2/help-texts";
import type { PainelServiceResult } from "@/features/dashboard-v2/painel-api";

afterEach(cleanup);

function serviceData(): PainelServiceResult {
  const delta = { value: 0, hidden: true };
  return {
    volume: {
      ok: true,
      data: {
        started: { value: 14, delta },
        finished: { value: 16, delta },
        stillOpen: { value: 0, delta },
        openStarted: { value: 0, delta },
        openWaiting: { value: 10, delta },
        partition: {
          resolved: 6,
          open: 10,
          other: 0,
          finishedFromStarted: 6,
          finishedCarryover: 10,
        },
        messagesIn: 0,
        messagesOut: 0,
        empty: false,
        byDay: [{ date: "2026-10-12", started: 14, finished: 16, incomplete: false }],
      },
    },
  } as unknown as PainelServiceResult;
}

/** Texto de ajuda do card cujo rótulo é `label` (o ícone fica ao lado dele). */
function hintFor(label: string): string | null {
  const span = [...document.querySelectorAll<HTMLElement>("span[title]")].find(
    (el) => el.textContent === label,
  );
  const hint = span?.parentElement?.querySelector<HTMLElement>("[data-info-hint]");
  return hint?.title ?? null;
}

describe("KPIs do período de Atendimentos com (?)", () => {
  it("finalizados, iniciados e aguardando explicam o número", () => {
    render(
      <PainelServiceWidget
        id="volume"
        data={serviceData()}
        search=""
        clock="business"
        onRetry={() => {}}
      />,
    );
    expect(hintFor("Atendimentos finalizados")).toBe(DASHBOARD_HELP_TEXT.serviceFinished);
    expect(hintFor("Em aberto — Iniciados")).toBe(DASHBOARD_HELP_TEXT.serviceOpenStarted);
    expect(hintFor("Em aberto — Aguardando")).toBe(DASHBOARD_HELP_TEXT.serviceOpenWaiting);
    expect(DASHBOARD_HELP_TEXT.serviceFinished).toBe(
      "Finalizados: conversas encerradas no período (inclui abertas antes)",
    );
    expect(DASHBOARD_HELP_TEXT.serviceOpenStarted).toBe(
      "Iniciados: conversas do período já atendidas por alguém",
    );
    expect(DASHBOARD_HELP_TEXT.serviceOpenWaiting).toBe(
      "Aguardando: conversas do período ainda sem primeiro atendimento",
    );
    // "Total de atendimentos" não ganhou ícone.
    expect(hintFor("Total de atendimentos")).toBeNull();
  });
});
