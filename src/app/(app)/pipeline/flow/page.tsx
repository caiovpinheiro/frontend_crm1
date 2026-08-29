/**
 * /pipeline/flow — visão Flow (Sales Hub) dentro do Pipeline.
 * Alterna com Kanban (`/pipeline`) e Lista (`/pipeline/list`).
 */

import { Suspense } from "react";

import { AppLoading } from "@/components/crm/app-loading";
import { SalesHubHost } from "@/components/pipeline/sales-hub-host";

export const dynamic = "force-dynamic";

export default function PipelineFlowPage() {
  return (
    <Suspense fallback={<AppLoading variant="inline" className="min-h-[100dvh]" />}>
      <SalesHubHost />
    </Suspense>
  );
}
