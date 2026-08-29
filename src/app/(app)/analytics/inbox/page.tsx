import { Suspense } from "react";

import InboxAnalyticsClientPage from "./client-page";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Analytics de Atendimento",
};

export default function InboxAnalyticsPage() {
  return (
    <Suspense fallback={null}>
      <InboxAnalyticsClientPage />
    </Suspense>
  );
}
