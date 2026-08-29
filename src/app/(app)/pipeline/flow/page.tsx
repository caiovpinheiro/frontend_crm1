/**
 * /pipeline/flow — visão Flow (Sales Hub) dentro do Pipeline.
 * Alterna com Kanban (`/pipeline`) e Lista (`/pipeline/list`).
 */

import { Suspense } from "react";

import { RouteLoading } from "@/components/crm/page-loading";

import { SalesHubHost } from "@/components/pipeline/sales-hub-host";

export const dynamic = "force-dynamic";

export default function PipelineFlowPage() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <SalesHubHost />
    </Suspense>
  );
}
