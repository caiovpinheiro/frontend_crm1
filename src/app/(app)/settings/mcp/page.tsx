import { Suspense } from "react";

import McpSettingsClientPage from "./client-page";

export const dynamic = "force-dynamic";

export default function McpSettingsPage() {
  return (
    <Suspense fallback={null}>
      <McpSettingsClientPage />
    </Suspense>
  );
}
