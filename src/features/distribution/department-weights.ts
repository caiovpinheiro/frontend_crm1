import type { ResponsibleDepartmentRef } from "./types";

/** "Acolhimento (peso 3), Atendimento" — o peso só aparece quando definido. */
export function formatResponsibleDepartments(
  departments: ResponsibleDepartmentRef[] | undefined,
): string {
  if (!departments || departments.length === 0) return "Sem departamento";
  return departments
    .map((d) => (d.weight != null ? `${d.name} (peso ${d.weight})` : d.name))
    .join(", ");
}

/**
 * Peso por departamento para o PATCH: só os departamentos marcados;
 * campo vazio ou inválido = null (usa o peso geral); limita a 1..100.
 */
export function buildDepartmentWeights(
  deptIds: string[],
  inputs: Record<string, string>,
): Record<string, number | null> {
  return Object.fromEntries(
    deptIds.map((id) => {
      const raw = (inputs[id] ?? "").trim();
      const n = Math.floor(Number(raw));
      return [
        id,
        raw === "" || !Number.isFinite(n) ? null : Math.min(100, Math.max(1, n)),
      ];
    }),
  );
}
