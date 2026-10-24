import type { Metadata } from "next";

import { MetaConnectScreen } from "./meta-connect-screen";

export const metadata: Metadata = {
  title: "Conectar com a Meta — Bwipo",
};

export default function MetaConnectPage() {
  return <MetaConnectScreen />;
}
