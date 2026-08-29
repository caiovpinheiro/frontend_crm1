import { Suspense } from "react";

import SalesHubClientPage from "./_client";

export const dynamic = "force-dynamic";

export default function SalesHubPage() {
  return (
    <Suspense fallback={null}>
      <SalesHubClientPage />
    </Suspense>
  );
}
