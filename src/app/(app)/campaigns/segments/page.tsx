import { Suspense } from "react";

import SegmentsClientPage from "./client-page";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Segmentos",
};

export default function CampaignSegmentsPage() {
  return (
    <Suspense fallback={null}>
      <SegmentsClientPage />
    </Suspense>
  );
}
