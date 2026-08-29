import { Suspense } from "react";

import { RouteLoading } from "@/components/crm/page-loading";

import ReportsV2ClientPage from "./client-page";

export const dynamic = "force-dynamic";

export default function ReportsPage() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <ReportsV2ClientPage />
    </Suspense>
  );
}
