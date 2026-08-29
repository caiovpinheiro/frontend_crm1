"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { RouteLoading } from "@/components/crm/page-loading";
import { useIsMobile } from "@/hooks/use-media-query";

/**
 * `/settings` — no desktop redireciona para Perfil (página padrão).
 * No mobile permanece como hub: o layout master-detail mostra só a
 * lista da sidebar (`isHub`), para o operador escolher uma seção.
 */
export default function SettingsPageV2() {
  const isMobile = useIsMobile();
  const router = useRouter();

  useEffect(() => {
    if (isMobile) return;
    router.replace("/settings/profile");
  }, [isMobile, router]);

  if (isMobile) return null;
  return <RouteLoading />;
}
