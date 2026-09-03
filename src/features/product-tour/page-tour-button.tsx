"use client";

import { useState } from "react";
import { CircleHelp, Play } from "lucide-react";

import {
  pageActionsMenuItemClass,
  pageActionsMenuPanelClass,
} from "@/components/crm/page-toolbar";
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

/**
 * Gatilho discreto de ajuda no header. Não inicia o tour sozinho:
 * o Driver.js só roda depois de "Fazer tour desta página".
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
        aria-label="Ajuda desta página"
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full border transition-colors",
          compact ? "size-8" : "size-10",
          open
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-card text-muted-foreground hover:text-foreground",
        )}
      >
        <CircleHelp className="size-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={cn(pageActionsMenuPanelClass, "w-max min-w-[12.5rem] p-0 py-1.5")}
      >
        <DropdownMenuLabel className="px-3 pb-0.5 pt-1 font-display text-[11px] font-semibold text-muted-foreground">
          Ajuda
        </DropdownMenuLabel>
        <DropdownMenuItem
          className={pageActionsMenuItemClass()}
          onClick={() => {
            // Fecha o menu antes do overlay do Driver.js.
            setOpen(false);
            window.setTimeout(() => startPageTour(tourId), 60);
          }}
        >
          <Play className="size-3.5 fill-current" aria-hidden="true" />
          {tourId === "automations-create" ||
          tourId === "campaigns-create" ||
          tourId === "contacts-create"
            ? "Fazer tour da criação"
            : tourId === "automations-builder"
              ? "Fazer tour do builder"
              : tourId === "campaigns-detail"
                ? "Fazer tour desta campanha"
                : tourId === "contacts-columns"
                  ? "Fazer tour das colunas"
                  : tourId === "contacts-duplicates"
                    ? "Fazer tour das duplicadas"
                    : "Fazer tour desta página"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
