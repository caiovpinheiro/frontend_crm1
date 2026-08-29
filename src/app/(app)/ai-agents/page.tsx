import { Suspense } from "react";

import AIAgentsV2ClientPage from "./client-page";

export const dynamic = "force-dynamic";

export default function AIAgentsPage() {
  return (
    <Suspense fallback={null}>
      <AIAgentsV2ClientPage />
    </Suspense>
  );
}
