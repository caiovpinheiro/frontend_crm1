import { Suspense } from "react";

import AnalyticsClientPage from "./client-page";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Analytics",
};

export default function AnalyticsPage() {
  return (
    <Suspense fallback={null}>
      <AnalyticsClientPage />
    </Suspense>
  );
}
