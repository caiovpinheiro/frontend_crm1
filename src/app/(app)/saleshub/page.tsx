import { Suspense } from "react";

import SalesHubClientPage from "./_client";
import { RouteLoading } from "@/components/crm/page-loading";

export const dynamic = "force-dynamic";

export default function SalesHubPage() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <SalesHubClientPage />
    </Suspense>
  );
}
