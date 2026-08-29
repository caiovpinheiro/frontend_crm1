import { Suspense } from "react";

import V2PipelineListClientPage from "./client-page";

export const dynamic = "force-dynamic";

export default function V2PipelineListPage() {
  return (
    <Suspense fallback={null}>
      <V2PipelineListClientPage />
    </Suspense>
  );
}
