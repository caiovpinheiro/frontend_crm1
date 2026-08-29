import { Suspense } from "react";

import TeamV2ClientPage from "./client-page";

export const dynamic = "force-dynamic";

export default function TeamPage() {
  return (
    <Suspense fallback={null}>
      <TeamV2ClientPage />
    </Suspense>
  );
}
