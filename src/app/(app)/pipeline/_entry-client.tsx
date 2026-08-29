"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { RouteLoading } from "@/components/crm/page-loading";
import {
  pathForPipelineView,
  readPipelineViewPreference,
  writePipelineViewPreference,
} from "@/lib/pipeline-view-preference";

import KanbanV2ClientPage from "./_v2-client";

/**
 * Resolve a view salva antes de montar o kanban — evita flash quando a
 * preferência é lista/flow.
 */
export function PipelineEntryClient({ navRail }: { navRail?: ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showKanban, setShowKanban] = useState(false);

  useLayoutEffect(() => {
    // Deep-link de negócio: permanece no kanban (painel do deal).
    if (searchParams.get("deal")) {
      writePipelineViewPreference("kanban");
      setShowKanban(true);
      return;
    }

    const preferred = readPipelineViewPreference();
    if (preferred !== "kanban") {
      const qs = searchParams.toString();
      const path = pathForPipelineView(preferred);
      router.replace(qs ? `${path}?${qs}` : path);
      return;
    }

    writePipelineViewPreference("kanban");
    setShowKanban(true);
  }, [router, searchParams]);

  if (!showKanban) return <RouteLoading />;

  return (
    <KanbanV2ClientPage navRail={navRail} listHref="/pipeline/list" />
  );
}
