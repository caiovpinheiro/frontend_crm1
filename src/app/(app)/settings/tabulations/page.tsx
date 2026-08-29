import { Suspense } from "react";

import { RouteLoading } from "@/components/crm/page-loading";

import TabulationsClientPage from "./client-page";

export const dynamic = "force-dynamic";

export default function TabulationsPage() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <TabulationsClientPage />
    </Suspense>
  );
}
