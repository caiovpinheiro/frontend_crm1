import { Suspense } from "react";

import { RouteLoading } from "@/components/crm/page-loading";

import TeamV2ClientPage from "./client-page";

export const dynamic = "force-dynamic";

export default function TeamPage() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <TeamV2ClientPage />
    </Suspense>
  );
}
