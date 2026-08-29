import { Suspense } from "react";

import { RouteLoading } from "@/components/crm/page-loading";

import SchedulesV2ClientPage from "./client-page";

export const dynamic = "force-dynamic";

export default function SchedulesPage() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <SchedulesV2ClientPage />
    </Suspense>
  );
}
