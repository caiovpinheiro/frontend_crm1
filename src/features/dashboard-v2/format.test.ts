import { describe, expect, it } from "vitest";

import { formatUsageHours } from "./format";

describe("formatUsageHours", () => {
  it("minutos abaixo de 1h", () => {
    expect(formatUsageHours(0)).toBe("0min");
    expect(formatUsageHours(18 * 60)).toBe("18min");
  });

  it("horas com minutos em dois dígitos", () => {
    expect(formatUsageHours(4 * 3600 + 17 * 60)).toBe("4h17");
    expect(formatUsageHours(2 * 3600 + 4 * 60)).toBe("2h04");
    expect(formatUsageHours(48 * 3600 + 41 * 60)).toBe("48h41");
  });

  it("arredonda sem gerar 60 minutos", () => {
    expect(formatUsageHours(3599.6)).toBe("1h00");
    expect(formatUsageHours(2 * 3600 - 10)).toBe("2h00");
  });
});
