"use client";

import { MultiSelectPopover } from "@/features/dashboard-v2/components/multi-select-popover";

export function FunnelPipelinePicker({
  pipelines,
  selectedIds,
  onChange,
}: {
  pipelines: { id: string; name: string }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <MultiSelectPopover
      label={selectedIds.length ? `${selectedIds.length} funis` : "Todos os funis"}
      options={pipelines.map((p) => ({ value: p.id, label: p.name }))}
      selected={selectedIds}
      onChange={onChange}
      emptyLabel="Nenhum funil"
      width={280}
    />
  );
}
