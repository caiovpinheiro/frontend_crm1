"use client";

import { useSession } from "next-auth/react";

import { usePresenceHeartbeat } from "@/hooks/use-presence-heartbeat";
import { useSystemPresenceSync } from "@/hooks/use-system-presence-sync";
import { useSystemActivity } from "@/features/system-usage/use-system-activity";
import { useIdleEnabled } from "@/hooks/use-idle-enabled";

/**
 * Monta o heartbeat de PRESENÇA DE USO uma única vez no shell autenticado.
 *
 * "Sistema aberto" = existe uma aba do CRM autenticada com heartbeat
 * recente. Independe da disponibilidade da Distribuição (Online/Ausente
 * /Offline), que segue sendo controlada pelo AgentStatusPopup.
 *
 * Também escuta o SSE `system_presence_update` e `presence_update` para
 * manter em dia as caches de listagem de agentes (transferências, filtros,
 * Distribuição — CRM aberto e Online/Offline).
 */
export function SystemPresenceHeartbeat() {
  const { status } = useSession();
  const authenticated = status === "authenticated";
  const idle = useIdleEnabled();
  usePresenceHeartbeat({ enabled: authenticated && idle });
  useSystemPresenceSync(authenticated && idle);
  // Uso REAL (interações humanas visíveis). Independente do heartbeat de
  // presença acima — envia pulsos agregados para /api/agents/me/activity.
  useSystemActivity(authenticated && idle);
  return null;
}
