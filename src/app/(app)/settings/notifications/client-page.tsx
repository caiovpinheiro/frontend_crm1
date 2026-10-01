"use client";

import { IconBell } from "@tabler/icons-react";

import OldNotificationsPage from "@/features/legacy-v1/settings/notifications";
import { InboxAlertsSettings } from "@/features/settings/inbox-alerts-settings";
import { useUserRole } from "@/hooks/use-user-role";
import { SETTINGS_HUB_BACK, SettingsV2Shell } from "../_v2-shell";

export default function NotificationsV2ClientPage() {
  const { role, isSuperAdmin } = useUserRole();
  // Alertas do inbox: só o ADMIN configura (a API também recusa os demais).
  const canConfigureAlerts = isSuperAdmin || role === "ADMIN";
  return (
    <SettingsV2Shell
      back={SETTINGS_HUB_BACK}
      title="Notificações"
      description="Push, e-mail e alertas por canal"
      icon={<IconBell size={22} />}
    >
      <div className="flex min-w-0 flex-col gap-4">
        <OldNotificationsPage />
        {canConfigureAlerts ? <InboxAlertsSettings /> : null}
      </div>
    </SettingsV2Shell>
  );
}
