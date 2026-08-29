import { Suspense } from "react";

import { RouteLoading } from "@/components/crm/page-loading";

import V2PipelineListClientPage from "./client-page";

export const dynamic = "force-dynamic";

export default function V2PipelineListPage() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <V2PipelineListClientPage />
    </Suspense>
  );
}
