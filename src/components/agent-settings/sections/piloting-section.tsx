"use client";

import {
  PilotingPanel,
  type PilotingValue,
} from "@/components/ai-agents/piloting-panel";

import { SectionHeader } from "../section-header";

export function PilotingSection({
  value,
  onChange,
}: {
  value: PilotingValue;
  onChange: (next: PilotingValue) => void;
}) {
  return (
    <div className="space-y-5">
      <SectionHeader
        title="Pilotagem"
        description="Saudação, fila humana, horário do consultor e encerramento — valem mesmo se o modelo improvisar. Textos da fila ficam aqui, não no código."
      />
      <PilotingPanel
        value={value}
        onChange={onChange}
        presentation="accordion"
      />
    </div>
  );
}
