/** @vitest-environment jsdom */
/**
 * `reason: "primary_timeout"` (backend): o bloco rodou no banco principal, sem
 * réplica, e estourou o tempo. Diferente de `no_replica`, NÃO é "indisponível
 * neste ambiente": o card mostra "Demorou demais — tente de novo." com o botão
 * de tentar de novo, e a seção não entra na lista das indisponíveis.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PainelServiceWidget } from "@/components/crm/dashboard/painel-service";
import type { PainelServiceResult } from "@/features/dashboard-v2/painel-api";
import {
  PRIMARY_TIMEOUT_MESSAGE,
  isBlockUnavailable,
  normalizeRequestedBlocks,
  withTimeoutMessages,
} from "@/features/dashboard-v2/service-availability";

afterEach(cleanup);

const TIMEOUT = { ok: false, error: "canceling statement due to statement timeout", reason: "primary_timeout" };

describe("primary_timeout", () => {
  it("troca a mensagem do bloco e não mexe nos outros", () => {
    const input = {
      volume: TIMEOUT,
      tempo: { ok: true, data: 1 },
      heatmap: { ok: false, error: "omitido", reason: "no_replica" },
    };
    const out = withTimeoutMessages(input);
    expect(out.volume).toEqual({ ...TIMEOUT, error: PRIMARY_TIMEOUT_MESSAGE });
    expect(out.tempo).toBe(input.tempo);
    expect(out.heatmap).toBe(input.heatmap);
    // Sem timeout: mesma referência.
    const clean = { tempo: { ok: true, data: 1 } };
    expect(withTimeoutMessages(clean)).toBe(clean);
  });

  it("não vira 'indisponível' (some do grid) — continua erro com nova tentativa", () => {
    const { blocks, unavailable } = normalizeRequestedBlocks(["tempo", "heatmap"], {
      tempo: { ok: false, error: "omitido", reason: "primary_timeout" },
      heatmap: { ok: false, error: "omitido", reason: "no_replica" },
    });
    expect(unavailable).toEqual(["heatmap"]);
    expect(isBlockUnavailable(blocks.tempo)).toBe(false);
    expect(blocks.tempo).toMatchObject({ ok: false, reason: "primary_timeout" });
  });

  it("o card mostra 'Demorou demais — tente de novo.' e o botão chama a nova tentativa", () => {
    const onRetry = vi.fn();
    const data = withTimeoutMessages({ volume: TIMEOUT } as unknown as PainelServiceResult);
    render(
      <PainelServiceWidget
        id="volume"
        data={data}
        search=""
        clock="business"
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText(PRIMARY_TIMEOUT_MESSAGE)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Tentar de novo/ }));
    expect(onRetry).toHaveBeenCalledWith("volume");
  });
});
