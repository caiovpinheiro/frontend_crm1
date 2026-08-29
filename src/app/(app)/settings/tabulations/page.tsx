import { Suspense } from "react";

import TabulationsClientPage from "./client-page";

export const dynamic = "force-dynamic";

export default function TabulationsPage() {
  return (
    <Suspense fallback={null}>
      <TabulationsClientPage />
    </Suspense>
  );
}
