"use client";

import { useRef, type ReactNode } from "react";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import { GripVertical } from "lucide-react";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { armSuppressClickAfterDrag } from "@/features/dashboard-v2/click-vs-drag";
import { useReportSeen } from "@/features/dashboard-v2/use-seen-widgets";
import { cn } from "@/lib/utils";

import { WidgetOrganizeRail, WidgetOverflowMenu } from "./sortable-widget-grid";

export function SortableWidgetStack({
  ids,
  labels,
  onReorder,
  render,
  disabled = false,
  organizing = false,
  onRemove,
  canRemove,
  hiddenIds,
  droppableId = "dashboard-widgets",
  onSeen,
  placeholderPx,
}: {
  ids: string[];
  labels: Record<string, string>;
  onReorder: (ids: string[]) => void;
  render: (id: string) => ReactNode;
  disabled?: boolean;
  organizing?: boolean;
  onRemove?: (id: string) => void;
  canRemove?: (id: string) => boolean;
  /**
   * Cards sem nada a mostrar (ex.: gráfico indisponível neste ambiente): somem
   * do empilhamento. Seguem em `ids` — a ordem salva não perde a posição — e,
   * ao organizar, aparecem como linha apagada para poder mover/remover.
   */
  hiddenIds?: ReadonlySet<string>;
  droppableId?: string;
  /**
   * Avisa os widgets que entraram na tela (ou perto dela): a página só busca os
   * dados deles. Ao organizar, todos contam como vistos.
   */
  onSeen?: (ids: string[]) => void;
  /**
   * Altura reservada enquanto o widget não tem dados (`null` = já tem). Mantém a
   * primeira dobra parecida com a final, para a intersecção não puxar tudo.
   */
  placeholderPx?: (id: string) => number | null;
}) {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const stackRef = useRef<HTMLDivElement>(null);
  const shownIds = ids.filter((id) => !hiddenIds?.has(id));
  useReportSeen(stackRef, shownIds.join("\0"), onSeen, organizing && !disabled);

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    if (result.destination.index === result.source.index) return;
    const next = [...ids];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    onReorder(next);
  }

  async function requestRemove(id: string) {
    if (!onRemove) return;
    const label = labels[id] ?? "este card";
    const ok = await confirm({
      title: "Remover card?",
      description: `Remover "${label}" do dashboard. Os demais cards permanecem.`,
      confirmLabel: "Remover",
      destructive: true,
    });
    if (ok) onRemove(id);
  }

  function chrome(id: string, grip?: ReactNode) {
    if (!organizing) return null;
    return (
      <WidgetOrganizeRail
        grip={grip}
        menu={
          onRemove && (!canRemove || canRemove(id)) ? (
            <WidgetOverflowMenu
              label={labels[id] ?? id}
              onRemove={() => void requestRemove(id)}
            />
          ) : undefined
        }
      />
    );
  }

  if (disabled || !organizing) {
    return (
      <>
        <div ref={stackRef} className="flex min-w-0 flex-col gap-1.5">
          {shownIds.map((id) => {
            const reserve = placeholderPx?.(id) ?? null;
            return (
              <div
                key={id}
                data-seen-id={id}
                // Reserva: grade de 1 trilho estica o esqueleto até a altura.
                className={cn("min-w-0", reserve != null && "grid grid-cols-[minmax(0,1fr)]")}
                style={reserve != null ? { minHeight: reserve } : undefined}
              >
                {render(id)}
              </div>
            );
          })}
        </div>
        {confirmDialog}
      </>
    );
  }

  return (
    <>
    <DragDropContext
      onDragStart={() => {
        armSuppressClickAfterDrag();
      }}
      onDragEnd={handleDragEnd}
    >
      <Droppable droppableId={droppableId}>
        {(dropProvided) => (
          <div
            ref={dropProvided.innerRef}
            {...dropProvided.droppableProps}
            className="flex min-w-0 flex-col gap-1.5"
          >
            {ids.map((id, index) => (
              <Draggable key={id} draggableId={id} index={index}>
                {(dragProvided, snapshot) => (
                  <section
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    className={cn(
                      "flex min-w-0 items-stretch gap-1",
                      snapshot.isDragging && "z-20",
                    )}
                  >
                    {chrome(
                      id,
                      <button
                        type="button"
                        {...dragProvided.dragHandleProps}
                        aria-label={`Mover ${labels[id] ?? id}`}
                        className={cn(
                          "flex size-7 shrink-0 cursor-grab items-center justify-center rounded-lg",
                          "bg-card text-muted-foreground",
                          "hover:bg-secondary hover:text-foreground active:cursor-grabbing",
                        )}
                      >
                        <GripVertical className="size-3.5" aria-hidden="true" />
                      </button>,
                    )}
                    <div className="min-w-0 flex-1">
                      {hiddenIds?.has(id) ? (
                        <p className="rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                          {labels[id] ?? id}: indisponível neste ambiente
                        </p>
                      ) : (
                        render(id)
                      )}
                    </div>
                  </section>
                )}
              </Draggable>
            ))}
            {dropProvided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
    {confirmDialog}
    </>
  );
}
