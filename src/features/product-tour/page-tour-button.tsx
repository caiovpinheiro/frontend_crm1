"use client";

import { CircleHelp } from "lucide-react";

import {
  pageActionsMenuItemClass,
  pageActionsMenuPanelClass,
} from "@/components/crm/page-toolbar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { hasTour } from "./tour-registry";
import { startPageTour } from "./start-tour";

/**
 * Gatilho discreto de ajuda no header. Não inicia o tour sozinho:
 * o Driver.js só roda depois de "Fazer tour desta página".
 */
export function PageTourButton({ tourId }: { tourId: string }) {
  if (!hasTour(tourId)) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Ajuda desta página"
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors",
          "hover:text-foreground data-[state=open]:border-primary data-[state=open]:text-primary",
        )}
      >
        <CircleHelp className="size-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={cn(pageActionsMenuPanelClass, "w-max min-w-[12.5rem] p-0 py-1.5")}
      >
        <DropdownMenuItem
          className={pageActionsMenuItemClass()}
          onClick={() => startPageTour(tourId)}
        >
          Fazer tour desta página
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
