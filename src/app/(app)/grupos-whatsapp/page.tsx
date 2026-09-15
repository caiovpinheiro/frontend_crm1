import type { Metadata } from "next";

import GruposWhatsAppClientPage from "./client-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Grupos WhatsApp",
};

export default function GruposWhatsAppPage() {
  return <GruposWhatsAppClientPage />;
}
