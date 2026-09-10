"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { IconRobot } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";

import { AgentSettingsDialog } from "@/components/agent-settings/agent-settings-dialog";
import { AppV2PageShell } from "../../_v2-page-shell";

/**
 * Deep-link `/ai-agents/:id`. O lápis da lista edita na própria tela;
 * esta rota fica para URL direta / refresh.
 */
export default function EditAIAgentClientPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const agentId = typeof id === "string" ? id : Array.isArray(id) ? id[0] : null;

  const settled = React.useRef(false);
  React.useEffect(() => {
    settled.current = true;
  }, []);

  const goBack = () => {
    queryClient.invalidateQueries({ queryKey: ["ai-agents"] });
    router.push("/ai-agents");
  };

  if (!agentId) return null;

  return (
    <AppV2PageShell
      title="Editar agente"
      icon={<IconRobot size={22} />}
      backHref="/ai-agents"
      backLabel="Agentes"
    >
      <div className="min-w-0 pb-6">
        <AgentSettingsDialog
          id={agentId}
          onOpenChange={(open) => {
            if (!open && settled.current) goBack();
          }}
          onSaved={goBack}
        />
      </div>
    </AppV2PageShell>
  );
}
