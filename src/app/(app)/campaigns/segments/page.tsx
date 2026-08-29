import { Suspense } from "react";

import { RouteLoading } from "@/components/crm/page-loading";

import SegmentsClientPage from "./client-page";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Segmentos",
};

export default function CampaignSegmentsPage() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <SegmentsClientPage />
    </Suspense>
  );
}
