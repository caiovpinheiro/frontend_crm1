import { Suspense } from "react";

import { RouteLoading } from "@/components/crm/page-loading";

import NotificationsV2ClientPage from "./client-page";

export const dynamic = "force-dynamic";

export default function NotificationsPage() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <NotificationsV2ClientPage />
    </Suspense>
  );
}
