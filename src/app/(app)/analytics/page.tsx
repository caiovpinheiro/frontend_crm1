import { Suspense } from "react";

import { RouteLoading } from "@/components/crm/page-loading";

import AnalyticsClientPage from "./client-page";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Analytics",
};

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <AnalyticsClientPage />
    </Suspense>
  );
}
