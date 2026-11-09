import { describe, expect, it } from "vitest"

import {
  distributionModeOptions,
  effectiveDistributionMode,
} from "../distribution-mode-options"

describe("distributionModeOptions", () => {
  it("vazio mostra o modo padrão real da organização", () => {
    expect(distributionModeOptions("leads")[0]).toEqual({
      value: "",
      label: "Padrão da organização (Por Leads)",
    })
    expect(distributionModeOptions("smart")[0]!.label).toBe("Padrão da organização (Inteligente)")
  })

  it("sem leitura das configurações (ex.: sem permissão) não inventa o modo", () => {
    expect(distributionModeOptions(undefined)[0]!.label).toBe("Padrão da organização")
  })
})

describe("effectiveDistributionMode", () => {
  it("modo salvo no passo vence o da organização", () => {
    expect(effectiveDistributionMode("smart", "leads")).toBe("smart")
    expect(effectiveDistributionMode("leads", "smart")).toBe("leads")
  })

  it("passo sem modo roda o padrão da organização", () => {
    expect(effectiveDistributionMode(undefined, "leads")).toBe("leads")
    expect(effectiveDistributionMode("", "smart")).toBe("smart")
    expect(effectiveDistributionMode("", undefined)).toBeNull()
  })
})
