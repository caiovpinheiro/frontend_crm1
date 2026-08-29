/**
 * /v2/dashboard — reaproveita DashboardV2ClientPage do route group
 * `(v2)/dashboard-v2`, injetando o `<NavRailSpacer />`.
 *
 * Toda a feature `features/dashboard-v2` (negócios, atendimento, fila do
 * operador) é reaproveitada sem alterações.
 */

import { Suspense } from "react";
import DashboardV2ClientPage from "./_v2-client";
import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";

export const dynamic = "force-dynamic";

export default function V2DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardV2ClientPage navRail={<NavRailSpacer />} />
    </Suspense>
  );
}
