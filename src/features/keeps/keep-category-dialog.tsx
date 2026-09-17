"use client";

import { useState } from "react";
import { FolderPlus } from "lucide-react";

import { ButtonGlass } from "@/components/crm/button-glass";
import {
  FormDialog,
  FormDialogIcon,
  formDialogCancelClass,
  formDialogPrimaryClass,
  formLabelClass,
} from "@/components/ui/form-dialog";
import { KEEP_CATEGORY_COLOR_LABELS, KEEP_CATEGORY_COLORS } from "./colors";
import { KeepColorSwatches } from "./keep-color-swatches";

export function KeepCategoryDialog({
  open,
  onOpenChange,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending?: boolean;
  onSubmit: (input: { name: string; color: string }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(KEEP_CATEGORY_COLORS[0]);

  async function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    await onSubmit({ name: trimmed, color });
    setName("");
    setColor(KEEP_CATEGORY_COLORS[0]);
    onOpenChange(false);
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nova categoria"
      description="Escolha um nome e uma cor. As notas desta categoria usam a mesma cor."
      icon={
        <FormDialogIcon>
          <FolderPlus className="size-4" />
        </FormDialogIcon>
      }
      size="sm"
      busy={pending}
      footer={
        <>
          <ButtonGlass
            type="button"
            variant="glass"
            className={formDialogCancelClass}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </ButtonGlass>
          <ButtonGlass
            type="button"
            variant="primary"
            className={formDialogPrimaryClass}
            disabled={pending || !name.trim()}
            onClick={() => void handleSubmit()}
          >
            Criar
          </ButtonGlass>
        </>
      }
    >
      <label className={formLabelClass} htmlFor="keep-category-name">
        Nome *
      </label>
      <input
        id="keep-category-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={80}
        className="mb-4 h-11 w-full rounded-xl border border-border bg-card px-3.5 text-sm"
        placeholder="Ex.: Estudos"
      />
      <span className={formLabelClass}>Cor *</span>
      <KeepColorSwatches
        value={color}
        showDefault={false}
        colors={[...KEEP_CATEGORY_COLORS]}
        labels={{ ...KEEP_CATEGORY_COLOR_LABELS }}
        onChange={(next) => {
          if (next) setColor(next);
        }}
      />
    </FormDialog>
  );
}
