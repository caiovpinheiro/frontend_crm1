"use client";

import { InboxPolicyPanel } from "@/components/ai-agents/inbox-policy-panel";
import { KnowledgePanel } from "@/components/ai-agents/knowledge-panel";
import { StudentDataPanel } from "@/components/ai-agents/student-data-panel";
import type { InboxPolicy } from "@/lib/ai-agents/steering";

import { SectionHeader } from "../section-header";

export function PlaceholderSection({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-5">
      <SectionHeader title={title} description={description} />
      <div className="rounded-xl border border-dashed border-border bg-card px-4 py-10 text-center">
        <p className="text-sm font-medium text-foreground">Em breve</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Esta seção ainda não tem configuração nesta tela.
        </p>
      </div>
    </div>
  );
}

/** InboxPolicyPanel já existia e está wired — não usamos o placeholder “Em breve”. */
export function InboxSection({
  value,
  onChange,
}: {
  value: InboxPolicy;
  onChange: (next: InboxPolicy) => void;
}) {
  return (
    <div className="space-y-5">
      <SectionHeader
        title="Inbox"
        description="Interceptos que o backend aplica antes e depois do modelo — confiança, retenção e handoff."
      />
      <InboxPolicyPanel value={value} onChange={onChange} />
    </div>
  );
}

/**
 * KnowledgePanel já funciona no editor; 0 docs ainda é feature real.
 *
 * O relatório de matriculados vive aqui junto dos documentos porque para
 * o operador as duas coisas são "o que o agente sabe". A diferença de
 * escopo (documentos por agente, relatório por organização) está dita no
 * texto de cada bloco — o `StudentDataPanel` não recebe `agentId` de
 * propósito, a API dele é org-wide.
 */
export function KnowledgeSection({
  agentId,
  preview = false,
}: {
  agentId: string;
  preview?: boolean;
}) {
  return (
    <div className="space-y-5">
      <SectionHeader
        title="Conhecimento"
        description="O que o agente consulta para responder: documentos de texto e a base de alunos matriculados."
      />
      {preview ? (
        <div className="rounded-xl border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
          Nenhum documento ainda. O agente vai responder só com o prompt.
        </div>
      ) : (
        <div className="space-y-6">
          <KnowledgePanel agentId={agentId} />
          <div className="border-t border-border pt-6">
            <StudentDataPanel />
          </div>
        </div>
      )}
    </div>
  );
}
