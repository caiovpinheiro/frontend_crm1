import { Suspense } from "react";

import ApiTokensV2ClientPage from "./client-page";

export const dynamic = "force-dynamic";

export default function ApiTokensPage() {
  return (
    <Suspense fallback={null}>
      <ApiTokensV2ClientPage />
    </Suspense>
  );
}
