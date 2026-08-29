import { Suspense } from "react";

import { RouteLoading } from "@/components/crm/page-loading";

import AIAgentsV2ClientPage from "./client-page";

export const dynamic = "force-dynamic";

export default function AIAgentsPage() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <AIAgentsV2ClientPage />
    </Suspense>
  );
}
