/**
 * /pipeline/flow — visão Flow (Sales Hub) dentro do Pipeline.
 * Alterna com Kanban (`/pipeline`) e Lista (`/pipeline/list`).
 */

import { Suspense } from "react";

import { SalesHubHost } from "@/components/pipeline/sales-hub-host";

export const dynamic = "force-dynamic";

export default function PipelineFlowPage() {
  return (
    <Suspense fallback={null}>
      <SalesHubHost />
    </Suspense>
  );
}
