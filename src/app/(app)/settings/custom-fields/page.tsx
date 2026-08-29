import { Suspense } from "react";

import CustomFieldsV2ClientPage from "./client-page";

export const dynamic = "force-dynamic";

export default function CustomFieldsPage() {
  // A page v1 embutida usa `useSearchParams()` internamente; embrulhar em
  // Suspense evita o CSR bailout sem precisar alterar o legado.
  return (
    <Suspense fallback={null}>
      <CustomFieldsV2ClientPage />
    </Suspense>
  );
}
