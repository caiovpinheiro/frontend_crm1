import { Suspense } from "react";

import MessageModelsV2ClientPage from "./client-page";

export const dynamic = "force-dynamic";

export default function MessageModelsPage() {
  return (
    <Suspense fallback={null}>
      <MessageModelsV2ClientPage />
    </Suspense>
  );
}
