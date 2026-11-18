"use client";

import { IconPlugConnected } from "@tabler/icons-react";

import { SETTINGS_HUB_BACK, SettingsV2Shell } from "../_v2-shell";
import McpSettings from "./mcp-settings";

export default function McpSettingsClientPage() {
  return (
    <SettingsV2Shell
      back={SETTINGS_HUB_BACK}
      title="Assistentes de IA (MCP)"
      description="Conecte ChatGPT, Claude e outros ao CRM"
      icon={<IconPlugConnected size={22} />}
    >
      <McpSettings />
    </SettingsV2Shell>
  );
}
