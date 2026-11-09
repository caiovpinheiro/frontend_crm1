/**
 * Opções do "Modo de distribuição" no passo Executar distribuição.
 *
 * Passo sem `mode` salvo roda o modo padrão da organização
 * (`distribution.mode`). Antes o card mostrava "Inteligente" nesse caso
 * (primeira opção da lista) enquanto o backend rodava Por Leads.
 * A opção vazia agora diz qual modo vai rodar de verdade.
 */

export type OrgDistributionMode = "smart" | "leads"

export const DISTRIBUTION_MODE_LABEL: Record<OrgDistributionMode, string> = {
  smart: "Inteligente (elegibilidade + fila)",
  leads: "Por Leads (rodízio por peso)",
}

export function distributionModeOptions(orgMode: OrgDistributionMode | null | undefined) {
  const orgLabel = orgMode === "leads" ? "Por Leads" : orgMode === "smart" ? "Inteligente" : null
  return [
    {
      value: "",
      label: orgLabel ? `Padrão da organização (${orgLabel})` : "Padrão da organização",
    },
    { value: "smart", label: DISTRIBUTION_MODE_LABEL.smart },
    { value: "leads", label: DISTRIBUTION_MODE_LABEL.leads },
  ]
}

/** Modo que o passo vai rodar: o salvo, ou o padrão da organização. */
export function effectiveDistributionMode(
  stepMode: unknown,
  orgMode: OrgDistributionMode | null | undefined,
): OrgDistributionMode | null {
  if (stepMode === "smart" || stepMode === "leads") return stepMode
  return orgMode ?? null
}
