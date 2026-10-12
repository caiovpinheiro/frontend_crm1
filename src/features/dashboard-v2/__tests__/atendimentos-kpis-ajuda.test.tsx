/** @vitest-environment jsdom */
/**
 * Atendimentos: "Atendimentos finalizados", "Em aberto — Iniciados" e "Em
 * aberto — Aguardando" ganham o ícone (?) com a explicação, e o bloco "Agora"
 * diz que conta todas as conversas abertas. Textos do backend (be #187),
 * centralizados em help-texts.ts.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PainelAgoraWidget, PainelServiceWidget } from "@/components/crm/dashboard/painel-service";
import { DASHBOARD_HELP_TEXT } from "@/features/dashboard-v2/help-texts";
import type { PainelAgora, PainelServiceResult } from "@/features/dashboard-v2/painel-api";

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
    expect(hintFor("Em aberto — Iniciados")).toBe(DASHBOARD_HELP_TEXT.serviceOpen);
    expect(hintFor("Em aberto — Aguardando")).toBe(DASHBOARD_HELP_TEXT.serviceOpen);
    expect(DASHBOARD_HELP_TEXT.serviceFinished).toBe(
      "Finalizados: encerrados no período, de qualquer data de criação. Conversa encerrada só em outro app não aparece aqui.",
    );
    expect(DASHBOARD_HELP_TEXT.serviceOpen).toContain(
      "Aguardando: abertas sem nenhuma resposta humana ainda, mesmo que a IA tenha respondido.",
    );
    // "Total de atendimentos" não ganhou ícone.
    expect(hintFor("Total de atendimentos")).toBeNull();
  });
});

const AGORA: PainelAgora = {
  asOf: "2026-10-12T13:00:00.000Z",
  awaitingReply: 3,
  inService: 5,
  longestWait: {
    ms: 60_000,
    contactName: "Ana",
    agentName: null,
    conversationId: null,
    overSla: false,
    slaMinutes: 10,
  },
  agents: { online: 2, total: 4 },
};

describe("bloco Agora com (?)", () => {
  it("explica que conta todas as conversas abertas, não só as do período", () => {
    render(
      <PainelAgoraWidget
        data={AGORA}
        error={null}
        clock="business"
        onRetry={() => {}}
      />,
    );
    const help = document.querySelector<HTMLElement>(
      `[title="${DASHBOARD_HELP_TEXT.serviceAgora}"]`,
    );
    expect(help).not.toBeNull();
    expect(DASHBOARD_HELP_TEXT.serviceAgora).toBe(
      "Todas as conversas abertas agora, de qualquer data — não só as do período.",
    );
  });
});
