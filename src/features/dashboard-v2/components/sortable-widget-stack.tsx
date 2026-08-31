"use client";

import type { ReactNode } from "react";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import { GripVertical } from "lucide-react";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { armSuppressClickAfterDrag } from "@/features/dashboard-v2/click-vs-drag";
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
  droppableId = "dashboard-widgets",
}: {
  ids: string[];
  labels: Record<string, string>;
  onReorder: (ids: string[]) => void;
  render: (id: string) => ReactNode;
  disabled?: boolean;
  organizing?: boolean;
  onRemove?: (id: string) => void;
  canRemove?: (id: string) => boolean;
  droppableId?: string;
}) {
  const { confirm, dialog: confirmDialog } = useConfirm();

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
      description: `Remover “${label}” do dashboard. Os demais cards permanecem.`,
      confirmLabel: "Remover",
      destructive: true,
    });
    if (ok) onRemove(id);
  }

  function chrome(id: string, grip?: ReactNode) {
    if (!organizing && !onRemove) return null;
    return (
      <WidgetOrganizeRail
        grip={organizing ? grip : undefined}
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
        <div className="flex min-w-0 flex-col gap-2.5">
          {ids.map((id) => (
            <div key={id} className="flex min-w-0 items-stretch gap-1">
              {chrome(id)}
              <div className="min-w-0 flex-1">{render(id)}</div>
            </div>
          ))}
        </div>
        {confirmDialog}
      </>
    );
  }

  return (
    <>
    <DragDropContext>
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
            className="flex min-w-0 flex-col gap-2.5"
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
                    <div className="min-w-0 flex-1">{render(id)}</div>
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
