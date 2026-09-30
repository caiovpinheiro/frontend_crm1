"use client";

/**
 * Popup de "app desatualizado" para o WebView mobile (APK/Capacitor).
 *
 * Diferente do `UpdateAvailableBanner` (desktop: novidades + hard reload
 * quando o JS da aba está atrás do servidor),
 * este popup só existe em viewport mobile/Capacitor e é focado em pedir
 * reload — o WebView do APK não recebe o novo bundle sozinho como uma aba
 * de navegador normal faria em alguns casos, então avisamos o usuário a
 * fechar/reabrir (ou recarregar) quando detectamos um deploy novo.
 *
 * Detecção: `NEXT_PUBLIC_BUILD_ID` é embutido no JS do cliente em build
 * time (via `next.config.ts`, lendo `public/app-revision.json` gerado por
 * `scripts/generate-app-revision.mjs`). Comparamos esse valor fixo do
 * cliente contra `GET /api/app-revision` — rota dinâmica (`no-store`,
 * excluída do precache do Serwist) que sempre reflete o build rodando no
 * servidor. Se divergirem, o deploy mudou e o cliente está desatualizado.
 *
 * Isso evita dois problemas do fingerprint anterior (`changelog.json`):
 *   1. Era comparado só dentro da mesma sessão (primeira leitura virava
 *      baseline) — nunca detectava updates ocorridos antes do open.
 *   2. Era um arquivo estático `/changelog.json`, sujeito a cache do SW.
 */

import * as React from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CLIENT_REVISION, useAppRevision } from "@/hooks/use-app-revision";
import { useIsMobile } from "@/hooks/use-media-query";
import { clearWebCachesAndReload } from "@/lib/hard-reload";

const DISMISSED_REVISION_KEY = "crm_mobile_update_dismissed_revision";

function isNativePlatform(): boolean {
  if (typeof window === "undefined") return false;
  const capacitor = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  try {
    return capacitor?.isNativePlatform?.() ?? false;
  } catch {
    return false;
  }
}

export function MobileAppUpdateDialog() {
  const isMobile = useIsMobile();
  const [isNative, setIsNative] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [pendingRevision, setPendingRevision] = React.useState<string | null>(null);

  React.useEffect(() => {
    setIsNative(isNativePlatform());
  }, []);

  const active = isMobile || isNative;

  // Mesma query `["app-revision"]` do banner desktop, 3 min (antes: poll
  // próprio de 30 s + refetch em todo foco — FE-18).
  const { data: remote } = useAppRevision(active);

  React.useEffect(() => {
    if (!active || !remote) return;
    if (remote === CLIENT_REVISION) return;

    const dismissed =
      typeof window !== "undefined" ? window.localStorage.getItem(DISMISSED_REVISION_KEY) : null;
    if (dismissed === remote) return;

    setPendingRevision(remote);
    setOpen(true);
  }, [active, remote]);

  if (!active) return null;

  function handleDismiss() {
    if (pendingRevision && typeof window !== "undefined") {
      window.localStorage.setItem(DISMISSED_REVISION_KEY, pendingRevision);
    }
    setOpen(false);
  }

  function handleReload() {
    void clearWebCachesAndReload();
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && handleDismiss()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Atualização disponível</AlertDialogTitle>
          <AlertDialogDescription>
            O CRM foi atualizado. Feche o aplicativo e abra novamente para aplicar as
            alterações.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleDismiss}>Agora não</AlertDialogCancel>
          <AlertDialogAction onClick={handleReload}>Atualizar agora</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
