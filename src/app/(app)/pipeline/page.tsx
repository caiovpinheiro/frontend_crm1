/**
 * /pipeline — entrada do funil.
 * Redireciona para a última view (lista/flow) salvo em localStorage,
 * exceto deep-link `?deal=` (sempre abre no kanban/workspace).
 * O kanban monta na hora (chrome visível); o replace é best-effort.
 */

import { Suspense } from "react";

import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";

import { PipelineEntryClient } from "./_entry-client";

export const dynamic = "force-dynamic";

export default function V2PipelinePage() {
  return (
    <Suspense fallback={null}>
      <PipelineEntryClient navRail={<NavRailSpacer />} />
    </Suspense>
  );
}
