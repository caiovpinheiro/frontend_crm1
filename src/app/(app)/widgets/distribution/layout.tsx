/**
 * Layout persistente da Distribuição: Consultores, Ranking e Histórico
 * (`/widgets/distribution`, `/ranking`, `/history`) compartilham o mesmo
 * client sem remount — a URL muda, o chrome fica.
 */

import { Suspense } from "react";

import DistributionClientPage from "./client-page";
import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";

export const dynamic = "force-dynamic";

export default function DistributionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  void children;
  return (
    <Suspense fallback={null}>
      <DistributionClientPage navRail={<NavRailSpacer />} />
    </Suspense>
  );
}
