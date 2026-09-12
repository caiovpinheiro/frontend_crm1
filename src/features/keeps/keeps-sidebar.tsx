"use client";

import { useState, type ReactNode } from "react";
import { Archive, Lightbulb, Plus, Settings2, Tag, Trash2 } from "lucide-react";

import { ButtonGlass } from "@/components/crm/button-glass";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  FormDialog,
  FormDialogIcon,
  formControlClass,
  formDialogCancelClass,
  formDialogPrimaryClass,
  formLabelClass,
} from "@/components/ui/form-dialog";
import { cn } from "@/lib/utils";
import type { KeepFolder, KeepLabel } from "./types";

export type KeepsView = { folder: KeepFolder; labelId: string | null };

function SidebarItem({
  active,
  icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-full px-2.5 text-left text-[12px] font-medium transition-colors",
        active
          ? "bg-sidebar-primary text-sidebar-primary-foreground"
          : "text-sidebar-foreground hover:bg-primary/15 hover:text-sidebar-accent-foreground",
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count != null ? (
        <span className="tabular-nums text-[10px] font-semibold opacity-80">{count}</span>
      ) : null}
    </button>
  );
}

export function KeepsSidebar({
  view,
  onViewChange,
  labels,
  labelCounts,
  notesCount,
  archiveCount,
  trashCount,
  onCreateLabel,
  onRenameLabel,
  onDeleteLabel,
  className,
}: {
  view: KeepsView;
  onViewChange: (view: KeepsView) => void;
  labels: KeepLabel[];
  labelCounts: Record<string, number>;
  notesCount: number;
  archiveCount: number;
  trashCount: number;
  onCreateLabel: (name: string) => string;
  onRenameLabel: (id: string, name: string) => void;
  onDeleteLabel: (id: string) => void;
  className?: string;
}) {
  const [manageOpen, setManageOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [renames, setRenames] = useState<Record<string, string>>({});
  const { confirm, dialog } = useConfirm();

  return (
    <aside
      className={cn(
        "flex h-full w-52 shrink-0 flex-col bg-sidebar px-2 py-3 text-sidebar-foreground",
        className,
      )}
    >
      <nav className="flex flex-col gap-0.5">
        <SidebarItem
          active={view.folder === "notes" && !view.labelId}
          icon={<Lightbulb className="size-3.5" />}
          label="Notas"
          count={notesCount}
          onClick={() => onViewChange({ folder: "notes", labelId: null })}
        />
        <SidebarItem
          active={view.folder === "archive" && !view.labelId}
          icon={<Archive className="size-3.5" />}
          label="Arquivo"
          count={archiveCount}
          onClick={() => onViewChange({ folder: "archive", labelId: null })}
        />
        <SidebarItem
          active={view.folder === "trash" && !view.labelId}
          icon={<Trash2 className="size-3.5" />}
          label="Lixeira"
          count={trashCount}
          onClick={() => onViewChange({ folder: "trash", labelId: null })}
        />
      </nav>

      <div className="mt-4 flex items-center justify-between px-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
          Etiquetas
        </p>
        <button
          type="button"
          onClick={() => {
            setRenames(Object.fromEntries(labels.map((l) => [l.id, l.name])));
            setManageOpen(true);
          }}
          className="inline-flex items-center gap-1 text-[10px] font-semibold text-sidebar-foreground/60 hover:text-sidebar-foreground"
          aria-label="Gerenciar etiquetas"
        >
          <Settings2 className="size-3" />
          Gerenciar
        </button>
      </div>
      <div className="mt-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {labels.length === 0 ? (
          <p className="px-2.5 py-1.5 text-[11px] text-sidebar-foreground/45">Nenhuma etiqueta</p>
        ) : (
          labels.map((label) => (
            <SidebarItem
              key={label.id}
              active={view.labelId === label.id}
              icon={<Tag className="size-3.5" />}
              label={label.name}
              count={labelCounts[label.id] ?? 0}
              onClick={() => onViewChange({ folder: "notes", labelId: label.id })}
            />
          ))
        )}
      </div>

      <FormDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        title="Etiquetas"
        description="Crie, renomeie ou exclua etiquetas das notas."
        icon={
          <FormDialogIcon>
            <Tag className="size-4" />
          </FormDialogIcon>
        }
        size="md"
        footer={
          <ButtonGlass
            type="button"
            variant="primary"
            className={formDialogPrimaryClass}
            onClick={() => setManageOpen(false)}
          >
            Fechar
          </ButtonGlass>
        }
      >
        <span className={formLabelClass}>Nova etiqueta</span>
        <div className="mb-4 flex gap-2">
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (draftName.trim()) {
                  onCreateLabel(draftName);
                  setDraftName("");
                }
              }
            }}
            placeholder="Nome"
            className={cn(formControlClass, "h-9 text-sm")}
          />
          <ButtonGlass
            type="button"
            variant="glass"
            className={cn(formDialogCancelClass, "h-9 shrink-0")}
            onClick={() => {
              if (!draftName.trim()) return;
              onCreateLabel(draftName);
              setDraftName("");
            }}
          >
            <Plus className="size-3.5" />
            Criar
          </ButtonGlass>
        </div>
        <span className={formLabelClass}>Existentes</span>
        <div className="space-y-2">
          {labels.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Nenhuma etiqueta ainda.</p>
          ) : (
            labels.map((label) => (
              <div key={label.id} className="flex items-center gap-2">
                <input
                  value={renames[label.id] ?? label.name}
                  onChange={(e) => setRenames((m) => ({ ...m, [label.id]: e.target.value }))}
                  onBlur={() => {
                    const next = (renames[label.id] ?? label.name).trim();
                    if (next && next !== label.name) onRenameLabel(label.id, next);
                  }}
                  className={cn(formControlClass, "h-9 text-sm")}
                />
                <button
                  type="button"
                  className="inline-flex size-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`Excluir ${label.name}`}
                  onClick={() => {
                    void confirm({
                      title: `Excluir “${label.name}”?`,
                      description: "A etiqueta sai de todas as notas. As notas permanecem.",
                      confirmLabel: "Excluir",
                      destructive: true,
                      action: () => onDeleteLabel(label.id),
                    });
                  }}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </FormDialog>
      {dialog}
    </aside>
  );
}
