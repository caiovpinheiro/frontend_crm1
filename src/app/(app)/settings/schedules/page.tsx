import { Suspense } from "react";

import SchedulesV2ClientPage from "./client-page";

export const dynamic = "force-dynamic";

export default function SchedulesPage() {
  return (
    <Suspense fallback={null}>
      <SchedulesV2ClientPage />
    </Suspense>
  );
}
