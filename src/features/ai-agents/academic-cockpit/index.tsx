"use client";

import { CockpitCasesDialog, useCockpitCases } from "./cases-dialog";
import { useAcademicCockpit } from "./hooks";
import {
  FunilPanel,
  HandoffPanel,
  ResolucaoPanel,
  SaudePanel,
} from "./panels";
import type { AcademicTabId } from "./types";
import { CockpitError, CockpitSkeleton } from "./ui";

export type { AcademicTabId } from "./types";

/** Abas nativas do agente acadêmico, na ordem em que aparecem na barra. */
export const ACADEMIC_TABS: { id: AcademicTabId; label: string }[] = [
  { id: "saude", label: "Saúde" },
  { id: "resolucao", label: "Resolução" },
  { id: "handoff", label: "Handoff" },
  { id: "funil", label: "Funil" },
];

/**
 * Conteúdo de uma aba do cockpit acadêmico. Todas as abas compartilham a
 * mesma query (`useAcademicCockpit`), então trocar de aba não refaz a
 * chamada — e nada é buscado enquanto `active` é falso.
 */
export function AcademicCockpitTab({
  tab,
  active,
}: {
  tab: AcademicTabId;
  active: boolean;
}) {
  const query = useAcademicCockpit(active);
  const cases = useCockpitCases();

  if (query.isPending) {
    return <CockpitSkeleton bars />;
  }

  if (query.isError || !query.data) {
    return (
      <CockpitError
        message={
          query.error instanceof Error
            ? query.error.message
            : "Erro inesperado ao falar com a API do cockpit."
        }
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }

  const data = query.data;

  return (
    <>
      {tab === "saude" && <SaudePanel data={data.saude} onOpenCases={cases.show} />}
      {tab === "resolucao" && (
        <ResolucaoPanel data={data.resolucao} onOpenCases={cases.show} />
      )}
      {tab === "handoff" && (
        <HandoffPanel data={data.handoff} onOpenCases={cases.show} />
      )}
      {tab === "funil" && <FunilPanel data={data.funil} onOpenCases={cases.show} />}
      <CockpitCasesDialog open={cases.open} onClose={cases.close} />
    </>
  );
}
