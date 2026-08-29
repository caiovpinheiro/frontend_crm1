/**
 * /widgets/distribution — Distribuição Inteligente (módulo do widget `smart_distribution`).
 * Injeta o NavRailV2 e delega a UI para o client component. O gating real é
 * feito no client (useWidgets) e reforçado pelo backend em todas as rotas.
 */

import { Suspense } from "react";

import DistributionClientPage from "./client-page";
import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";

export const dynamic = "force-dynamic";

export default function DistributionPage() {
  // Suspense: o client lê `?tab=` (deep-link da aba Cobertura) com
  // `useSearchParams`.
  return (
    <Suspense fallback={null}>
      <DistributionClientPage navRail={<NavRailSpacer />} />
    </Suspense>
  );
}
