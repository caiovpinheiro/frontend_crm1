/**
 * /v2/dashboard — reaproveita DashboardV2ClientPage do route group
 * `(v2)/dashboard-v2`, injetando o `<NavRailSpacer />`.
 *
 * Toda a feature `features/dashboard-v2` (negócios, atendimento, fila do
 * operador) é reaproveitada sem alterações.
 */

import { Suspense } from "react";
import DashboardV2ClientPage from "./_v2-client";
import { AppLoading } from "@/components/crm/app-loading";
import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";

export const dynamic = "force-dynamic";

function DashboardSuspenseFallback() {
  return (
    <div className="v2-screen grid grid-cols-[var(--nav-rail-w,72px)_1fr] gap-4 overflow-hidden p-4">
      <NavRailSpacer />
      <AppLoading variant="inline" className="min-h-0 flex-1" />
    </div>
  );
}

export default function V2DashboardPage() {
  return (
    <Suspense fallback={<DashboardSuspenseFallback />}>
      <DashboardV2ClientPage navRail={<NavRailSpacer />} />
    </Suspense>
  );
}
