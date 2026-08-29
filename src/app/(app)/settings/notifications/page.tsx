import { Suspense } from "react";

import NotificationsV2ClientPage from "./client-page";

export const dynamic = "force-dynamic";

export default function NotificationsPage() {
  return (
    <Suspense fallback={null}>
      <NotificationsV2ClientPage />
    </Suspense>
  );
}
