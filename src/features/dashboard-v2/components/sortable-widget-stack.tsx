"use client";

import type { ReactNode } from "react";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import { GripVertical } from "lucide-react";

import { armSuppressClickAfterDrag } from "@/features/dashboard-v2/click-vs-drag";
import { cn } from "@/lib/utils";

export function SortableWidgetStack({
  ids,
  labels,
  onReorder,
  render,
  disabled = false,
  droppableId = "dashboard-widgets",
}: {
  ids: string[];
  labels: Record<string, string>;
  onReorder: (ids: string[]) => void;
  render: (id: string) => ReactNode;
  disabled?: boolean;
  droppableId?: string;
}) {
  function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    if (result.destination.index === result.source.index) return;
    const next = [...ids];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    onReorder(next);
  }

  if (disabled) {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        {ids.map((id) => (
          <div key={id} className="min-w-0">
            {render(id)}
          </div>
        ))}
      </div>
    );
  }

  return (
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
            className="flex min-w-0 flex-col gap-4"
          >
            {ids.map((id, index) => (
              <Draggable key={id} draggableId={id} index={index}>
                {(dragProvided, snapshot) => (
                  <section
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    className={cn(
                      "group/widget flex min-w-0 flex-col",
                      snapshot.isDragging && "z-20",
                    )}
                  >
                    <div className="flex h-9 shrink-0 items-center px-1">
                      <button
                        type="button"
                        {...dragProvided.dragHandleProps}
                        aria-label={`Reordenar ${labels[id] ?? id}`}
                        className={cn(
                          "flex size-8 shrink-0 cursor-grab items-center justify-center rounded-lg",
                          "bg-card/90 text-muted-foreground",
                          "opacity-0 transition-opacity",
                          "pointer-events-none",
                          "hover:bg-secondary hover:text-foreground active:cursor-grabbing",
                          "group-hover/widget:pointer-events-auto group-hover/widget:opacity-100",
                          "group-has-[:focus-visible]/widget:pointer-events-auto group-has-[:focus-visible]/widget:opacity-100",
                          "focus-visible:pointer-events-auto focus-visible:opacity-100",
                          snapshot.isDragging && "pointer-events-auto opacity-100",
                        )}
                      >
                        <GripVertical className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                    {render(id)}
                  </section>
                )}
              </Draggable>
            ))}
            {dropProvided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}
