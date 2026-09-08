"use client";

import { useState } from "react";
import { HelpCircle, Play } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { hasTour } from "./tour-registry";
import { startPageTour } from "./start-tour";

const TOUR_GRADIENT_BR = "bg-linear-to-br from-brand to-accent-violet";

function tourActionLabel(tourId: string): string {
  if (
    tourId === "automations-create" ||
    tourId === "campaigns-create" ||
    tourId === "contacts-create" ||
    tourId === "custom-fields-create" ||
    tourId === "team-user-create" ||
    tourId === "team-schedule-create" ||
    tourId === "team-department-create" ||
    tourId === "message-models-create" ||
    tourId === "message-models-internal-create" ||
    tourId === "message-models-whatsapp-create" ||
    tourId === "tabulations-create" ||
    tourId === "tasks-create"
  ) {
    return "Fazer tour da criação";
  }
  if (tourId === "distribution-edit") return "Fazer tour da edição";
  if (tourId === "automations-builder") return "Fazer tour do builder";
  if (tourId === "campaigns-detail") return "Fazer tour desta campanha";
  if (tourId === "contacts-columns") return "Fazer tour das colunas";
  if (tourId === "contacts-duplicates") return "Fazer tour das duplicadas";
  return "Fazer tour desta página";
}

/**
 * Gatilho de ajuda no header. Não inicia o tour sozinho:
 * o Driver.js só roda depois do item de iniciar o tour.
 */
export function PageTourButton({
  tourId,
  size = "md",
}: {
  tourId: string;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);

  if (!hasTour(tourId)) return null;

  const compact = size === "sm";

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        aria-label="Abrir ajuda"
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full text-white shadow-lg shadow-brand/30 transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          TOUR_GRADIENT_BR,
          compact ? "size-8" : "size-10",
          open && "ring-2 ring-brand/30",
        )}
      >
        <HelpCircle className={compact ? "size-3.5" : "size-4"} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[18rem] overflow-hidden rounded-2xl border border-border bg-card p-0 shadow-xl animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-200"
      >
        <DropdownMenuLabel className="px-4 pb-2 pt-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Ajuda
        </DropdownMenuLabel>
        <div className="px-2 pb-2">
          <DropdownMenuItem
            className="w-full gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:bg-muted hover:text-foreground focus:bg-muted focus:text-foreground"
            onClick={() => {
              // Fecha o menu antes do overlay do Driver.js.
              setOpen(false);
              window.setTimeout(() => startPageTour(tourId), 60);
            }}
          >
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-lg text-white",
                TOUR_GRADIENT_BR,
              )}
            >
              <Play className="size-4 fill-current" aria-hidden="true" />
            </span>
            <span className="text-sm font-medium text-foreground">
              {tourActionLabel(tourId)}
            </span>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
