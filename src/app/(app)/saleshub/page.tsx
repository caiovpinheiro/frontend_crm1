import { Suspense } from "react";

import { RouteLoading } from "@/components/crm/page-loading";

import SalesHubClientPage from "./_client";

export const dynamic = "force-dynamic";

export default function SalesHubPage() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <SalesHubClientPage />
    </Suspense>
  );
}
