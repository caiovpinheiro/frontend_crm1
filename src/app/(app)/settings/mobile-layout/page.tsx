import { Suspense } from "react";

import { RouteLoading } from "@/components/crm/page-loading";

import MobileLayoutV2ClientPage from "./client-page";

export const dynamic = "force-dynamic";

export default function MobileLayoutPage() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <MobileLayoutV2ClientPage />
    </Suspense>
  );
}
