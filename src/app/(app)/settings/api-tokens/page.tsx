import { Suspense } from "react";

import { RouteLoading } from "@/components/crm/page-loading";

import ApiTokensV2ClientPage from "./client-page";

export const dynamic = "force-dynamic";

export default function ApiTokensPage() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <ApiTokensV2ClientPage />
    </Suspense>
  );
}
