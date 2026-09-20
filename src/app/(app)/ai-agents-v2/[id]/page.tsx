import { Suspense } from "react";

import AIAgentV2EditClientPage from "./client-page";

export const dynamic = "force-dynamic";

export default function AIAgentV2EditPage() {
  return (
    <Suspense fallback={null}>
      <AIAgentV2EditClientPage />
    </Suspense>
  );
}
