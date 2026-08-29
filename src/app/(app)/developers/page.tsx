import { Suspense } from "react";

import DevelopersClientPage from "./client-page";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Developers",
};

export default function DevelopersPage() {
  return (
    <Suspense fallback={null}>
      <DevelopersClientPage />
    </Suspense>
  );
}
