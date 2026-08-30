"use client";

import * as React from "react";
import { IconMessageCircle } from "@tabler/icons-react";

import { useUserRole } from "@/hooks/use-user-role";
import { RestrictedScreen } from "@/components/crm/restricted-screen";
import { SettingsV2Shell, SETTINGS_HUB_BACK } from "../_v2-shell";
import { SettingsHeaderNav } from "../_components/settings-tabs";
import { ConversationsConfigTab } from "@/features/conversations-settings/components/ConversationsConfigTab";
import { AgentsTab } from "@/features/conversations-settings/components/AgentsTab";
// "Departamentos" migrou para pagina propria em Equipe & Operacao
// (/settings/departments) — faz mais sentido junto de "Equipe" do que
// dentro de "Conversas". A aba local foi removida em 16/jul/26.
const TABS = [
  { id: "configuracoes", label: "Configurações" },
  { id: "atendentes", label: "Atendentes" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function ConversationsSettingsClientPage() {
  const { role, isSuperAdmin, ready } = useUserRole();
  const isOrgAdmin = isSuperAdmin || role === "ADMIN";

  const [activeTab, setActiveTab] = React.useState<TabId>("configuracoes");

  if (ready && !isOrgAdmin) {
    return (
      <RestrictedScreen
        title="Acesso restrito"
        description="As configurações de conversas são gerenciadas apenas por administradores da organização."
      />
    );
  }

  return (
    <SettingsV2Shell
      back={SETTINGS_HUB_BACK}
      title="Conversas"
      description="Atendentes e permissões de conversa"
      icon={<IconMessageCircle size={22} />}
    >
      <SettingsHeaderNav
        tabs={TABS.map((tab) => ({ id: tab.id, label: tab.label }))}
        active={activeTab}
        onChange={(id) => setActiveTab(id as TabId)}
      />

      <div className="min-h-0 flex-1">
        {activeTab === "configuracoes" && <ConversationsConfigTab />}
        {activeTab === "atendentes" && <AgentsTab />}
      </div>
    </SettingsV2Shell>
  );
}
