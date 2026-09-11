"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";
import { FlowEditor } from "@/components/flow/flow-editor";
import { isUsableAutomationRouteId } from "@/features/automations-v2/automation-adapter";

/** Builder de automação v2 — editor canvas novo (ex-/fluxo). */
export default function V2AutomationDetailClientPage() {
  const params = useParams<{ id: string | string[] }>();
  const raw = params?.id;
  const automationId = Array.isArray(raw) ? raw[0] : raw;

  if (!isUsableAutomationRouteId(automationId)) {
    return (
      <div className="v2-screen grid grid-cols-[var(--nav-rail-w,72px)_1fr] gap-4 overflow-hidden p-4">
        <NavRailSpacer />
        <main className="flex min-h-0 min-w-0 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-sm font-semibold text-foreground">Automação não encontrada</p>
          <p className="text-sm text-muted-foreground">
            O identificador do fluxo está ausente. Volte à lista e abra novamente.
          </p>
          <Link
            href="/automations"
            className="mt-2 inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
          >
            Voltar às automações
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="v2-screen grid grid-cols-[var(--nav-rail-w,72px)_1fr] gap-4 overflow-hidden p-4">
      <NavRailSpacer />
      <main className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <FlowEditor automationId={automationId} />
      </main>
    </div>
  );
}
