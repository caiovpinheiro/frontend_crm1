import type { Metadata } from "next";

import BwipoChatClientPage from "./client-page";
import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bwipo Chat",
};

export default function BwipoChatPage() {
  return <BwipoChatClientPage navRail={<NavRailSpacer />} />;
}
