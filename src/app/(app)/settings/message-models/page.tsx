import { Suspense } from "react";

import { RouteLoading } from "@/components/crm/page-loading";

import MessageModelsV2ClientPage from "./client-page";

export const dynamic = "force-dynamic";

export default function MessageModelsPage() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <MessageModelsV2ClientPage />
    </Suspense>
  );
}
