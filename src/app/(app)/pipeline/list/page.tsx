import { Suspense } from "react";

import V2PipelineListClientPage from "./client-page";
import { RouteLoading } from "@/components/crm/page-loading";

export const dynamic = "force-dynamic";

export default function V2PipelineListPage() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <V2PipelineListClientPage />
    </Suspense>
  );
}
