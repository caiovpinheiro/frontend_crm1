import { describe, expect, it, vi } from "vitest";

import { memoByRef } from "../ref-cache";

type Dto = { id: string; n: number };

function setup(startMs = 10_000) {
  let t = startMs;
  const build = vi.fn((dto: Dto) => ({ id: dto.id, label: `${dto.n}` }));
  const memo = memoByRef(build, { bucketMs: 1_000, now: () => t });
  return { memo, build, tick: (ms: number) => (t += ms) };
}

describe("memoByRef — cache por identidade com balde de tempo", () => {
  it("mesma chave → mesmo objeto, construído uma vez (memo do card pula o render)", () => {
    const { memo, build } = setup();
    const dto: Dto = { id: "d1", n: 1 };
    const a = memo(dto);
    const b = memo(dto);
    expect(b).toBe(a);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("chave nova (mesmos dados) → objeto novo, com os mesmos campos", () => {
    const { memo, build } = setup();
    const a = memo({ id: "d1", n: 1 });
    const b = memo({ id: "d1", n: 1 });
    expect(b).not.toBe(a);
    expect(b).toEqual(a);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it("chave patchada (SSE) → valor novo; as demais mantêm identidade", () => {
    const { memo } = setup();
    const untouched: Dto = { id: "d2", n: 2 };
    const before = memo(untouched);
    const patched: Dto = { id: "d1", n: 5 };
    expect(memo(patched).label).toBe("5");
    expect(memo(untouched)).toBe(before);
  });

  it("vira o balde → recalcula; dentro do balde novo volta a reaproveitar", () => {
    const { memo, build, tick } = setup(10_000);
    const dto: Dto = { id: "d1", n: 1 };
    const a = memo(dto);
    tick(999); // ainda no mesmo balde de 1 s
    expect(memo(dto)).toBe(a);
    tick(1); // 11 000 → balde seguinte
    const b = memo(dto);
    expect(b).not.toBe(a);
    expect(b).toEqual(a);
    expect(memo(dto)).toBe(b);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it("balde padrão é o minuto e o relógio padrão é Date.now", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-09-30T12:00:10.000Z"));
      const build = vi.fn((dto: Dto) => ({ id: dto.id }));
      const memo = memoByRef(build);
      const dto: Dto = { id: "d1", n: 1 };
      const a = memo(dto);
      vi.setSystemTime(new Date("2026-09-30T12:00:59.000Z"));
      expect(memo(dto)).toBe(a);
      vi.setSystemTime(new Date("2026-09-30T12:01:00.000Z"));
      expect(memo(dto)).not.toBe(a);
      expect(build).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
