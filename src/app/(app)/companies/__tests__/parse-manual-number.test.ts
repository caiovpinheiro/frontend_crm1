import { describe, expect, it, vi } from "vitest";

// A página puxa muitos módulos de UI; o teste só precisa do helper puro.
vi.mock("next-auth/react", () => ({ useSession: () => ({ status: "authenticated" }) }));

import { parseManualCompanyNumber } from "../client-page";

describe("parseManualCompanyNumber", () => {
  it("aceita inteiro positivo, com ou sem #", () => {
    expect(parseManualCompanyNumber("1001")).toBe(1001);
    expect(parseManualCompanyNumber(" #7 ")).toBe(7);
    expect(parseManualCompanyNumber("2147483647")).toBe(2147483647);
  });

  it("recusa vazio, zero, negativo, decimal, texto e acima do Int", () => {
    for (const v of ["", "0", "-1", "1.5", "1,5", "12a", "2147483648"]) {
      expect(parseManualCompanyNumber(v), v).toBeNull();
    }
  });
});
