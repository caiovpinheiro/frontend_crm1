/*
 * Layout do route group (app) — NOVO FRONTEND v2 servindo a raiz.
 *
 * Após a migração:
 *  - As rotas v2 (dashboard, inbox, pipeline, contacts, companies,
 *    activities, automations, settings) vivem aqui SEM o prefixo `/v2/`.
 *  - O frontend antigo (v1) foi movido para `src/app/old/*` e
 *    continua acessível em `/old/*`.
 *
 * Decisões:
 *  - NÃO usa DashboardShell legado (cada página v2 tem seu próprio NavRail).
 *  - Importa globals-v2.css com tokens/utilities adicionais.
 *  - Auth/Providers vêm do root layout (NextAuth + React Query).
 */

import "@/styles/globals-v2.css";
import { BiometricLockGate } from "@/components/layout/biometric-lock-gate";
import { MobileAppUpdateDialog } from "@/components/layout/mobile-app-update-dialog";
import { NativeApkUpdateDialog } from "@/components/layout/native-apk-update-dialog";
import { UpdateAvailableBanner } from "@/components/layout/update-banner";
import { SoftphoneWidget } from "@/features/softphone/components";
import { WhatsappIncomingCallWidget } from "@/components/inbox/whatsapp-incoming-call-widget";
import { ChatThemeApplier } from "@/components/providers/chat-theme-applier";
import { MobileBottomNav } from "@/components/crm/mobile-bottom-nav";
import { NavRailV2 } from "@/components/crm/nav-rail-v2";
import { MobileStartRoute } from "@/components/layout/mobile-start-route";
import { SystemPresenceHeartbeat } from "@/components/layout/system-presence-heartbeat";
import { NativeFcmBootstrap } from "@/components/layout/native-fcm-bootstrap";
import { TaskAlertCenter } from "@/components/layout/task-alert-center";
import { SettingsDrawerProvider } from "@/features/settings/settings-drawer-context";

// O TooltipProvider (Radix) é provido uma única vez na raiz (app/providers.tsx),
// cobrindo tanto os TooltipGlass quanto os TooltipContent/TooltipHost. Não é
// necessário aninhar outro provider aqui.
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SettingsDrawerProvider>
      <ChatThemeApplier />
      <SystemPresenceHeartbeat />
      <div className="v2-root v2-min-screen">
        {/* Trilho de navegação ÚNICO e PERSISTENTE. Vive no layout para
            NÃO remontar ao navegar. Posição fixa sobre a 1ª coluna do grid
            (que as páginas reservam via `--nav-rail-w` + <NavRailSpacer/>),
            colada à esquerda da viewport (`left: 0`, altura total). */}
        <div className="v2-nav-rail-fixed fixed z-40 max-md:hidden">
          <NavRailV2 />
        </div>
        {children}
        <UpdateAvailableBanner />
        <MobileAppUpdateDialog />
        <NativeApkUpdateDialog />
        <SoftphoneWidget />
        <WhatsappIncomingCallWidget />
        {/* Alerta global de tarefa (polling; sem overlay). */}
        <TaskAlertCenter />
        <NativeFcmBootstrap />
        {/* Cold start mobile/APK: respeita startRoute do Layout Builder. */}
        <MobileStartRoute />
        {/* Barra inferior mobile (mobile-layout + Mais). md+ não renderiza. */}
        <MobileBottomNav />
      </div>
      <BiometricLockGate />
    </SettingsDrawerProvider>
  );
}
