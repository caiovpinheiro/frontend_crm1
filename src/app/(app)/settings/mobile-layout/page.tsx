import { Suspense } from "react";

import MobileLayoutV2ClientPage from "./client-page";

export const dynamic = "force-dynamic";

export default function MobileLayoutPage() {
  return (
    <Suspense fallback={null}>
      <MobileLayoutV2ClientPage />
    </Suspense>
  );
}
