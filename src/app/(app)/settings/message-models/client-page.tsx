"use client";

import { IconTemplate } from "@tabler/icons-react";

import OldMessageModelsPage from "@/features/legacy-v1/settings/message-models";
import { SETTINGS_HUB_BACK, SettingsV2Shell } from "../_v2-shell";

/**
 * Fase 1d (migração v1→v2): rota canônica `/settings/message-models` no shell
 * v2. Engloba modelos internos, WhatsApp WABA e Flows (Kommo). A
 * reimplementação visual entra na Fase 5/6.
 */
export default function MessageModelsV2ClientPage() {
  return (
    <SettingsV2Shell
      back={SETTINGS_HUB_BACK}
      title="Modelos"
      description="Internos, WhatsApp WABA e Flows (Kommo)"
      icon={<IconTemplate size={22} />}
      shrinkActions
    >
      <OldMessageModelsPage />
    </SettingsV2Shell>
  );
}

