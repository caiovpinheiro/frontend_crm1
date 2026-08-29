import { Suspense } from "react";

import { RouteLoading } from "@/components/crm/page-loading";

import CustomFieldsV2ClientPage from "./client-page";

export const dynamic = "force-dynamic";

export default function CustomFieldsPage() {
  // A page v1 embutida usa `useSearchParams()` internamente; embrulhar em
  // Suspense evita o CSR bailout sem precisar alterar o legado.
  return (
    <Suspense fallback={<RouteLoading />}>
      <CustomFieldsV2ClientPage />
    </Suspense>
  );
}
