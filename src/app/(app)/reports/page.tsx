import { Suspense } from "react";

import ReportsV2ClientPage from "./client-page";

export const dynamic = "force-dynamic";

export default function ReportsPage() {
  return (
    <Suspense fallback={null}>
      <ReportsV2ClientPage />
    </Suspense>
  );
}
