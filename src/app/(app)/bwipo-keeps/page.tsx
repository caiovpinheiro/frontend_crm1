import type { Metadata } from "next";

import BwipoKeepsClientPage from "./client-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bwipo Keeps",
};

export default function BwipoKeepsPage() {
  return <BwipoKeepsClientPage />;
}
