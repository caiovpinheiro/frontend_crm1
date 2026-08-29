import { Suspense } from "react";

import { RouteLoading } from "@/components/crm/page-loading";

import InboxAnalyticsClientPage from "./client-page";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Analytics de Atendimento",
};

export default function InboxAnalyticsPage() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <InboxAnalyticsClientPage />
    </Suspense>
  );
}
