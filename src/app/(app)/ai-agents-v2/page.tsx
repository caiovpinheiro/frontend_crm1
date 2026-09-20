import { Suspense } from "react";

import AIAgentsV2ListClientPage from "./client-page";

export const dynamic = "force-dynamic";

export default function AIAgentsV2ListPage() {
  return (
    <Suspense fallback={null}>
      <AIAgentsV2ListClientPage />
    </Suspense>
  );
}
