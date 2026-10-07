import { describe, expect, it } from "vitest";

import type { PainelTeamRankRow } from "./painel-api";
import {
  attendedParts,
  axisDurationLabel,
  axisMaxMs,
  deltaFromTeam,
  durationAxis,
  heatBin,
  heatBinRanges,
  heatIntensity,
  hourRangeLabel,
  peakHour,
  peakOfTotals,
  rangeClampedNotice,
  rankByAttended,
  rankByServiceTime,
  serviceRankingState,
  shareLabel,
  teamMeanMs,
  teamSubtitle,
} from "./team-rankings";

const row = (
  p: Partial<PainelTeamRankRow> & { id: string },
): PainelTeamRankRow => ({
  name: p.id,
  attended: 0,
  finished: 0,
  serviceMeanMs: null,
  serviceMedianMs: null,
  serviceSample: 0,
  ...p,
});

describe("team rankings", () => {
  const rows = [
    row({ id: "a", attended: 10, serviceMeanMs: 600_000, serviceSample: 8 }),
    row({ id: "b", attended: 30, serviceMeanMs: 300_000, serviceSample: 2 }),
    row({ id: "c", attended: 20, serviceMeanMs: 120_000, serviceSample: 5 }),
    row({ id: "d", attended: 0, serviceMeanMs: 900_000, serviceSample: 4 }),
  ];

  it("ordena por atendimentos e descarta quem não atendeu", () => {
    expect(rankByAttended(rows).map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("ordena por tempo médio exigindo amostra mínima", () => {
    expect(rankByServiceTime(rows).map((r) => r.id)).toEqual(["c", "a", "d"]);
    expect(rankByServiceTime(rows, true).map((r) => r.id)).toEqual([
      "d",
      "a",
      "c",
    ]);
  });

  it("calcula média ponderada da equipe", () => {
    // (600k*8 + 300k*2 + 120k*5 + 900k*4) / 19
    expect(teamMeanMs(rows)).toBeCloseTo(9_600_000 / 19, 3);
    expect(teamMeanMs([])).toBeNull();
  });
});

describe("heatmap helpers", () => {
  const dept = {
    key: "d",
    label: "SAC",
    total: 6,
    hours: [0, 2, 4, ...Array(21).fill(0)],
  };

  it("normaliza no geral ou por linha", () => {
    expect(heatIntensity(2, dept, 8, false)).toBe(0.25);
    expect(heatIntensity(2, dept, 8, true)).toBe(0.5);
    expect(heatIntensity(0, dept, 8, true)).toBe(0);
  });

  it("acha o pico e rotula a faixa", () => {
    expect(peakHour(dept.hours)).toBe(2);
    expect(peakHour(Array(24).fill(0))).toBeNull();
    expect(hourRangeLabel(23)).toBe("23h–00h");
  });
});

describe("heat bins", () => {
  it("quantiza em 5 faixas", () => {
    expect(heatBin(0)).toBe(0);
    expect(heatBin(0.01)).toBe(1);
    expect(heatBin(0.2)).toBe(1);
    expect(heatBin(0.21)).toBe(2);
    expect(heatBin(1)).toBe(5);
  });

  it("gera faixas numéricas contíguas para a legenda", () => {
    expect(heatBinRanges(100)).toEqual([
      { bin: 1, from: 1, to: 20 },
      { bin: 2, from: 21, to: 40 },
      { bin: 3, from: 41, to: 60 },
      { bin: 4, from: 61, to: 80 },
      { bin: 5, from: 81, to: 100 },
    ]);
    // Coerente com heatBin para todo valor inteiro.
    for (const max of [3, 7, 42, 133]) {
      for (let v = 1; v <= max; v++) {
        const r = heatBinRanges(max).find((x) => v >= x.from && v <= x.to);
        expect(r?.bin).toBe(heatBin(v / max));
      }
    }
    expect(heatBinRanges(0)).toEqual([]);
  });
});

describe("ranking de atendimento", () => {
  it("separa encerradas e em aberto sem estourar o total", () => {
    expect(attendedParts(142, 118)).toEqual({ total: 142, closed: 118, open: 24, closedPct: 83.1 });
    // encerradas vêm de outra base (encerrou no período): nunca passa do total
    expect(attendedParts(10, 14)).toEqual({ total: 10, closed: 10, open: 0, closedPct: 100 });
    expect(attendedParts(0, 0)).toEqual({ total: 0, closed: 0, open: 0, closedPct: 0 });
  });
});

describe("ranking de TMA", () => {
  it("compara com a média da equipe, com tolerância", () => {
    expect(deltaFromTeam(null, 60_000)).toEqual({ kind: "none" });
    expect(deltaFromTeam(60_000, null)).toEqual({ kind: "none" });
    expect(deltaFromTeam(70_000, 60_000)).toEqual({ kind: "on" });
    expect(deltaFromTeam(30 * 60_000, 40 * 60_000)).toEqual({ kind: "faster", ms: 10 * 60_000 });
    expect(deltaFromTeam(50 * 60_000, 40 * 60_000)).toEqual({ kind: "slower", ms: 10 * 60_000 });
  });

  it("eixo com topo redondo e no máximo 4 intervalos", () => {
    expect(durationAxis(71 * 60_000)).toEqual({
      maxMs: 80 * 60_000,
      ticks: [0, 20, 40, 60, 80].map((m) => m * 60_000),
    });
    expect(durationAxis(0).ticks).toEqual([0, 60_000]);
    const long = durationAxis(26 * 3_600_000);
    expect(long.ticks.length).toBeLessThanOrEqual(5);
    expect(long.maxMs).toBeGreaterThanOrEqual(26 * 3_600_000);
  });

  it("eixo cobre média, mediana e média da equipe", () => {
    const rows = [
      row({ id: "a", serviceMeanMs: 10 * 60_000, serviceMedianMs: 12 * 60_000, serviceSample: 5 }),
      row({ id: "b", serviceMeanMs: 20 * 60_000, serviceMedianMs: 90 * 60_000, serviceSample: 5 }),
    ];
    expect(axisMaxMs(rows, 15 * 60_000)).toBe(90 * 60_000);
    expect(axisMaxMs([], null)).toBe(0);
  });

  it("estados: vazio, com gente fora pela amostra mínima, ok", () => {
    const few = row({ id: "x", serviceMeanMs: 1000, serviceSample: 2 });
    const good = row({ id: "y", serviceMeanMs: 1000, serviceSample: 4 });
    expect(serviceRankingState([])).toEqual({ state: "empty", left: 0 });
    expect(serviceRankingState([few])).toEqual({ state: "empty", left: 1 });
    expect(serviceRankingState([few, good])).toEqual({ state: "few", left: 1 });
    expect(serviceRankingState([good])).toEqual({ state: "ok", left: 0 });
  });
});

describe("aviso de período limitado", () => {
  it("só aparece quando o backend cortou", () => {
    expect(rangeClampedNotice(false, "2026-07-10T03:00:00.000Z")).toBeNull();
    expect(rangeClampedNotice(undefined, undefined)).toBeNull();
    expect(rangeClampedNotice(true, "2026-07-10T12:00:00.000Z")).toBe(
      "período limitado a 90 dias (desde 10/07)",
    );
    expect(rangeClampedNotice(true, undefined)).toBe("período limitado a 90 dias");
  });
});

describe("pico do total por hora", () => {
  it("devolve hora e valor, ou null sem dados", () => {
    expect(peakOfTotals([0, 3, 9, 4, ...Array(20).fill(0)])).toEqual({ hour: 2, value: 9 });
    expect(peakOfTotals(Array(24).fill(0))).toBeNull();
  });
});

describe("textos dos cards de equipe", () => {
  it("monta o subtítulo com escopo e aviso", () => {
    expect(teamSubtitle("Base", {})).toBe("Base");
    expect(teamSubtitle("Base", { filtered: true })).toBe("Base · com os filtros da aba");
    expect(teamSubtitle("Base", { filtered: true, notice: "período limitado a 90 dias" })).toBe(
      "Base · com os filtros da aba · período limitado a 90 dias",
    );
  });

  it("percentual com 1 casa e zero sem base", () => {
    expect(shareLabel(1, 3)).toBe("33,3%");
    expect(shareLabel(5, 0)).toBe("0%");
  });
});

describe("rótulo do eixo de duração", () => {
  it("compacto para caber na coluna da barra", () => {
    expect(axisDurationLabel(0)).toBe("0");
    expect(axisDurationLabel(20 * 60_000)).toBe("20min");
    expect(axisDurationLabel(60 * 60_000)).toBe("1h");
    expect(axisDurationLabel(90 * 60_000)).toBe("1h30");
    expect(axisDurationLabel(72 * 3_600_000)).toBe("3d");
  });
});
