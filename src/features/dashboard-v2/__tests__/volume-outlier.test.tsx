/** @vitest-environment jsdom */
/**
 * D6 — "Iniciadas vs finalizadas": um dia atípico (ex.: importação) recorta o
 * eixo; o valor real continua no balão e escrito na barra.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PainelServiceWidget } from "@/components/crm/dashboard/painel-service";
import {
  OUTLIER_FACTOR,
  analyzeOutliers,
  dayLabelBR,
  median,
  niceCeil,
  outlierNote,
} from "@/features/dashboard-v2/outlier-axis";
import type { PainelServiceResult } from "@/features/dashboard-v2/painel-api";

afterEach(cleanup);

/** 30 dias: entre 0 e 4 por dia, com 1.000 iniciadas em 15/09 (importação). */
function importSeries() {
  const started: number[] = [];
  const finished: number[] = [];
  const dates: string[] = [];
  for (let i = 0; i < 30; i++) {
    const day = String(i + 1).padStart(2, "0");
    dates.push(`2026-09-${day}`);
    started.push(i === 14 ? 1000 : i % 5);
    finished.push(i === 14 ? 3 : i % 3);
  }
  return { started, finished, dates };
}

describe("analyzeOutliers", () => {
  it("detecta o dia > 10× a mediana e cria um teto que cabe os outros dias", () => {
    const { started, finished } = importSeries();
    const a = analyzeOutliers([started, finished]);
    expect(a.hasOutlier).toBe(true);
    expect(a.outlierIndexes).toEqual([14]);
    expect(a.threshold).toBe(a.median * OUTLIER_FACTOR);
    // maior dia típico = 4 (+15% de folga) → teto redondo 5
    expect(a.cap).toBe(5);
    const typicalMax = Math.max(...started.filter((_, i) => i !== 14), ...finished);
    expect(a.cap).toBeGreaterThanOrEqual(typicalMax);
  });

  it("sem dia atípico não recorta", () => {
    const a = analyzeOutliers([[1, 2, 3, 4, 5, 6], [2, 2, 3, 3, 4, 5]]);
    expect(a.hasOutlier).toBe(false);
    expect(a.outlierIndexes).toEqual([]);
  });

  it("poucos dias com valor não são classificados (mediana sem sentido)", () => {
    expect(analyzeOutliers([[1, 500, 0], [0, 0, 0]]).hasOutlier).toBe(false);
  });

  it("dias sem movimento não puxam a mediana a zero", () => {
    const a = analyzeOutliers([[0, 0, 0, 0, 0, 0, 0, 0, 3, 3, 3, 3, 400], []]);
    expect(a.median).toBe(3);
    expect(a.hasOutlier).toBe(true);
  });

  it("auxiliares", () => {
    expect(median([1, 3, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(niceCeil(4.6)).toBe(5);
    expect(niceCeil(7)).toBe(10);
    expect(niceCeil(0)).toBe(1);
    expect(dayLabelBR("2026-09-15")).toBe("15/09");
  });

  it("a nota cita o dia, o valor real e o teto", () => {
    const { started, finished, dates } = importSeries();
    const a = analyzeOutliers([started, finished]);
    const note = outlierNote(
      a,
      dates.map((date, i) => ({ date, values: [started[i]!, finished[i]!] })),
    );
    expect(note).toContain("Dia atípico (ex.: importação)");
    expect(note).toContain("15/09 (1.000)");
    expect(note).toContain("Eixo recortado em 5");
  });
});

function volumeData(started: number[], finished: number[], dates: string[]): PainelServiceResult {
  const delta = { value: 0, hidden: true };
  return {
    volume: {
      ok: true,
      data: {
        started: { value: 1318, delta },
        finished: { value: 275, delta },
        stillOpen: { value: 0, delta },
        openStarted: { value: 3, delta },
        openWaiting: { value: 1040, delta },
        messagesIn: 0,
        messagesOut: 0,
        empty: false,
        byDay: dates.map((date, i) => ({
          date,
          started: started[i]!,
          finished: finished[i]!,
          incomplete: false,
        })),
      },
    },
  } as unknown as PainelServiceResult;
}

function mount(data: PainelServiceResult) {
  return render(
    <PainelServiceWidget
      id="volume"
      data={data}
      search=""
      clock="business"
      onRetry={() => {}}
    />,
  );
}

describe("card Iniciadas vs finalizadas", () => {
  it("marca o dia atípico e alterna a escala completa", () => {
    const { started, finished, dates } = importSeries();
    const { container } = mount(volumeData(started, finished, dates));
    const note = container.querySelector("[data-outlier-note]");
    expect(note?.textContent).toContain("Dia atípico (ex.: importação): 15/09 (1.000)");

    const toggle = screen.getByRole("button", { name: "Ver escala completa" });
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Recortar o dia atípico" })).toBeTruthy();
  });

  it("série normal não ganha nota nem botão", () => {
    const dates = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"];
    const { container } = mount(volumeData([3, 4, 5, 4, 3], [2, 3, 4, 3, 2], dates));
    expect(container.querySelector("[data-outlier-note]")).toBeNull();
    expect(screen.queryByRole("button", { name: "Ver escala completa" })).toBeNull();
  });
});
