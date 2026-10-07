"use client";

import { useState } from "react";
import { Copy } from "lucide-react";

import { ButtonGlass } from "@/components/crm/button-glass";
import {
  FormDialog,
  FormDialogIcon,
  formControlClass,
  formDialogCancelClass,
  formDialogPrimaryClass,
  formLabelClass,
} from "@/components/ui/form-dialog";
import { useDuplicateDeal, usePipelines } from "@/features/pipeline-v2/hooks";

export function DuplicateDealDialog({
  open,
  onOpenChange,
  dealId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string | null;
}) {
  const { data: pipelines = [] } = usePipelines(open);
  const duplicate = useDuplicateDeal();
  const [pipelineId, setPipelineId] = useState("");
  const [stageId, setStageId] = useState("");

  const stages = (pipelines.find((p) => p.id === pipelineId)?.stages ?? []).filter(
    (stage) => !stage.isWon && !stage.isLost,
  );

  function close() {
    setPipelineId("");
    setStageId("");
    onOpenChange(false);
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
        else onOpenChange(true);
      }}
      title="Duplicar negócio"
      description="O novo negócio nasce em aberto, com o mesmo contato e sem os dados comerciais do original."
      size="md"
      icon={
        <FormDialogIcon>
          <Copy className="size-4" />
        </FormDialogIcon>
      }
      footer={
        <>
          <ButtonGlass variant="glass" className={formDialogCancelClass} onClick={close}>
            Cancelar
          </ButtonGlass>
          <ButtonGlass
            variant="primary"
            className={formDialogPrimaryClass}
            disabled={!dealId || !pipelineId || !stageId || duplicate.isPending}
            onClick={() => {
              if (!dealId || !pipelineId || !stageId) return;
              duplicate.mutate(
                { dealId, pipelineId, stageId },
                { onSuccess: () => close() },
              );
            }}
          >
            Duplicar
          </ButtonGlass>
        </>
      }
    >
      <span className={formLabelClass}>Funil</span>
      <select
        className={formControlClass}
        value={pipelineId}
        onChange={(e) => {
          setPipelineId(e.target.value);
          setStageId("");
        }}
      >
        <option value="">Selecione</option>
        {pipelines.map((pipeline) => (
          <option key={pipeline.id} value={pipeline.id}>
            {pipeline.name}
          </option>
        ))}
      </select>
      <span className={`${formLabelClass} mt-4`}>Etapa</span>
      <select
        className={formControlClass}
        value={stageId}
        disabled={!pipelineId}
        onChange={(e) => setStageId(e.target.value)}
      >
        <option value="">Selecione</option>
        {stages.map((stage) => (
          <option key={stage.id} value={stage.id}>
            {stage.name}
          </option>
        ))}
      </select>
    </FormDialog>
  );
}
