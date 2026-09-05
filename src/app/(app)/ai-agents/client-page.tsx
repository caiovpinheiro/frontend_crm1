"use client";

import { useState } from "react";
import { IconRobot } from "@tabler/icons-react";

import { TabsGlass } from "@/components/crm/tabs-glass";
import OldAIAgentsPage from "@/features/legacy-v1/ai-agents";
import {
  ACADEMIC_TABS,
  AcademicCockpitTab,
} from "@/features/ai-agents/academic-cockpit";
import { AppV2PageShell } from "../_v2-page-shell";

/**
 * Fase 3 (migração v1→v2): rota canônica `/ai-agents` no shell v2.
 *
 * Mesma observação de `/reports`: não há item correspondente no
 * `SIDEBAR_CATALOG` backend — registrado em DECISOES-PENDENTES. A rota fica
 * acessível por URL direta. A v1 já cobre lista, editor e fila de rascunhos;
 * a reskin V0 entra na Fase 5/6.
 *
 * Cockpit do agente acadêmico: nativo (React + `/api/public/agent-cockpit`
 * same-origin), sem iframe e sem env. A aba "Agentes" continua sendo a tela
 * de sempre; as 4 abas seguintes são o cockpit.
 */
export default function AIAgentsV2ClientPage() {
  // 0 = "Agentes"; 1..4 = abas do cockpit acadêmico.
  const [activeTab, setActiveTab] = useState(0);
  const academicTab = activeTab > 0 ? ACADEMIC_TABS[activeTab - 1] : null;

  const tabs = [{ label: "Agentes" }, ...ACADEMIC_TABS.map((t) => ({ label: t.label }))];

  return (
    <AppV2PageShell title="Agentes de IA" icon={<IconRobot size={22} />}>
      <div className="flex min-w-0 flex-col gap-3.5">
        <TabsGlass tabs={tabs} activeTab={activeTab} onChange={setActiveTab} scrollable />

        {/* A tela de agentes fica montada: voltar para ela não perde estado. */}
        <div className={academicTab ? "hidden" : "contents"}>
          <AgentsPanel />
        </div>

        {academicTab && <AcademicCockpitTab tab={academicTab.id} active />}
      </div>
    </AppV2PageShell>
  );
}

function AgentsPanel() {
  return (
    <div className="min-w-0 overflow-x-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] p-3 backdrop-blur-md sm:p-4 [&:has([data-agent-settings])]:p-0">
      <OldAIAgentsPage embedded />
    </div>
  );
}
