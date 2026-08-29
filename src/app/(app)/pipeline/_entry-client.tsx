"use client";

import { useLayoutEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import {
  pathForPipelineView,
  readPipelineViewPreference,
  writePipelineViewPreference,
} from "@/lib/pipeline-view-preference";

import KanbanV2ClientPage from "./_v2-client";

/**
 * Resolve a view salva e redireciona lista/flow. Sempre monta o kanban
 * como fallback imediato — se `router.replace` ou o localStorage
 * pendurarem, o chrome do funil já está na tela (nunca um RouteLoading
 * full-page eterno em `/pipeline`).
 */
export function PipelineEntryClient({ navRail }: { navRail?: ReactNode }) {
  const router = useRouter();

  useLayoutEffect(() => {
    const qs = new URL(window.location.href).searchParams;
    if (qs.get("deal")) {
      writePipelineViewPreference("kanban");
      return;
    }

    const preferred = readPipelineViewPreference();
    if (preferred !== "kanban") {
      const q = qs.toString();
      const path = pathForPipelineView(preferred);
      router.replace(q ? `${path}?${q}` : path);
      return;
    }

    writePipelineViewPreference("kanban");
  }, [router]);

  return (
    <KanbanV2ClientPage navRail={navRail} listHref="/pipeline/list" />
  );
}
