"use client";

/*
 * Pergunta "Transferir também o dono do negócio?" — mostrada em toda
 * transferência manual do inbox (botão Transferir, chip do responsável,
 * menu ⋮ e reatribuição em massa).
 *
 * `keepDealOwner = true` → só a conversa muda de responsável; o dono humano
 * do negócio fica. O padrão vem do departamento (`Department.keepDealOwner`).
 * Negócio sem dono, ou com agente de IA como dono, recebe quem atende de
 * qualquer jeito (regra do backend).
 */

import { useQueryClient } from "@tanstack/react-query";

import { useDepartments } from "@/features/conversations-settings/hooks/use-departments";
import { findCachedConversationRow } from "@/features/inbox-v2/hooks/apply-outbound-inbox-card";

/** O departamento pede para manter o dono do negócio? Sem depto = não. */
export function useDepartmentKeepsDealOwner(
  departmentId: string | null | undefined,
  enabled = true,
): boolean {
  const { data: departments = [] } = useDepartments(enabled);
  if (!departmentId) return false;
  return departments.find((d) => d.id === departmentId)?.keepDealOwner === true;
}

/** Departamento da conversa a partir do cache do inbox (sem GET extra). */
export function useCachedConversationDepartmentId(
  conversationId: string | null | undefined,
): string | null {
  const qc = useQueryClient();
  if (!conversationId) return null;
  const row = findCachedConversationRow(qc, conversationId) as
    | { departmentId?: string | null; department?: { id?: string } | null }
    | null;
  return row?.departmentId ?? row?.department?.id ?? null;
}

interface DealOwnerScopeChoiceProps {
  /** true = só a conversa (mantém o dono do negócio). */
  keepDealOwner: boolean;
  onChange: (keepDealOwner: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function DealOwnerScopeChoice({
  keepDealOwner,
  onChange,
  disabled,
  className,
}: DealOwnerScopeChoiceProps) {
  const option = (value: boolean, label: string) => {
    const active = keepDealOwner === value;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={active}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onChange(value);
        }}
        className={`flex-1 rounded-[var(--radius-sm)] px-2 py-1 text-[11.5px] font-medium transition-colors disabled:opacity-50 ${
          active
            ? "bg-[var(--brand-primary)] text-white shadow-sm"
            : "text-[var(--text-secondary)] hover:bg-[var(--glass-bg-overlay)]"
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className={className}>
      <p className="mb-1 text-[11px] font-semibold text-[var(--text-muted)]">
        Transferir também o dono do negócio?
      </p>
      <div
        role="radiogroup"
        aria-label="Transferir também o dono do negócio?"
        className="flex gap-1 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] p-0.5"
      >
        {option(false, "Conversa e negócio")}
        {option(true, "Só a conversa")}
      </div>
    </div>
  );
}
