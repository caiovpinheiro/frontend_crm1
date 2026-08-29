import { Suspense } from "react";

import { RouteLoading } from "@/components/crm/page-loading";

import DevelopersClientPage from "./client-page";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Developers",
};

export default function DevelopersPage() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <DevelopersClientPage />
    </Suspense>
  );
}
