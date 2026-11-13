"use client";

/**
 * Empresa vinculada ao grupo, no painel "Dados do grupo": vincular (busca
 * pelas empresas do CRM), ver/editar no mesmo popup da tela Empresas,
 * trocar e desvincular.
 */
import { useState } from "react";
import {
  IconBuildingSkyscraper as Building,
  IconLinkOff as Unlink,
  IconPlus as Plus,
  IconReplace as Replace,
  IconSearch as Search,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { EditCompanyDialog } from "@/components/companies/edit-company-dialog";
import { useCompanies, useCompany } from "@/features/directory-v2/hooks";
import { cn } from "@/lib/utils";

import { useWhatsAppGroupMutations } from "./hooks";
import type { WhatsAppGroupDetail } from "./types";

const ICON_BTN =
  "grid h-8 w-8 shrink-0 place-items-center rounded-[var(--orbita-radius-inner)] text-[var(--orbita-text-tertiary)] transition-colors hover:bg-[var(--orbita-field)] hover:text-[var(--orbita-text)] disabled:opacity-50";

function errorText(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function GroupCompany({ group }: { group: WhatsAppGroupDetail }) {
  const mut = useWhatsAppGroupMutations();
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState(false);
  const company = group.company;
  // Detalhe completo só quando o popup abre.
  const detail = useCompany(editing && company ? company.id : null);

  const link = (companyId: string | null) =>
    mut.setCompany.mutate(
      { id: group.id, companyId },
      {
        onSuccess: (data) => {
          setPicking(false);
          toast.success(data.company ? `Grupo vinculado a ${data.company.name}.` : "Empresa desvinculada do grupo.");
        },
        onError: (err) => toast.error(errorText(err, "Não foi possível vincular a empresa.")),
      },
    );

  if (picking || !company) {
    return picking ? (
      <CompanyPicker
        busy={mut.setCompany.isPending}
        onPick={(id) => link(id)}
        onCancel={() => setPicking(false)}
      />
    ) : (
      <button
        type="button"
        onClick={() => setPicking(true)}
        className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--orbita-selected)]/50 px-3.5 py-1.5 text-[13px] font-medium text-[var(--orbita-selected)] hover:bg-[var(--orbita-field)]"
      >
        <Plus className="h-4 w-4" />
        Vincular empresa
      </button>
    );
  }

  return (
    <>
      <div className="mt-3 flex w-full items-center gap-1 rounded-[12px] bg-[var(--orbita-field)] py-1 pl-3 pr-1">
        <Building className="h-4 w-4 shrink-0 text-[var(--orbita-selected)]" />
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="Ver e editar a empresa"
          className="min-w-0 flex-1 truncate py-1.5 text-left text-[14px] font-semibold text-[var(--orbita-text)] hover:text-[var(--orbita-selected)] hover:underline"
        >
          {company.name}
        </button>
        <button type="button" onClick={() => setPicking(true)} aria-label="Trocar empresa" title="Trocar empresa" className={ICON_BTN}>
          <Replace className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => link(null)}
          disabled={mut.setCompany.isPending}
          aria-label="Desvincular empresa"
          title="Desvincular empresa"
          className={ICON_BTN}
        >
          <Unlink className="h-4 w-4" />
        </button>
      </div>
      <EditCompanyDialog
        company={editing ? (detail.data ?? null) : null}
        onClose={() => setEditing(false)}
        onSaved={() => {
          // O nome pode ter mudado: o grupo mostra o novo na hora.
          void mut.refreshGroup(group.id);
        }}
      />
      {editing && detail.isError ? (
        <p className="mt-1 text-[12px] text-destructive">{errorText(detail.error, "Não foi possível abrir a empresa.")}</p>
      ) : null}
    </>
  );
}

function CompanyPicker({
  busy,
  onPick,
  onCancel,
}: {
  busy: boolean;
  onPick: (companyId: string) => void;
  onCancel: () => void;
}) {
  const [q, setQ] = useState("");
  const search = q.trim();
  const list = useCompanies({ search: search || undefined, perPage: 8, enabled: true });
  const items = list.data?.items ?? [];
  return (
    <div className="mt-3 w-full rounded-[12px] border border-border bg-[var(--orbita-block)] p-2 text-left">
      <label className="flex items-center gap-2 rounded-[10px] bg-[var(--orbita-field)] px-2.5">
        <Search className="h-4 w-4 shrink-0 text-[var(--orbita-text-tertiary)]" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onCancel()}
          placeholder="Buscar empresa pelo nome"
          aria-label="Buscar empresa"
          className="h-9 min-w-0 flex-1 bg-transparent text-[13.5px] text-[var(--orbita-text)] outline-none placeholder:text-[var(--orbita-text-tertiary)]"
        />
      </label>
      <ul className="mt-1 max-h-56 overflow-y-auto">
        {list.isLoading ? (
          <li className="px-2 py-3 text-[12.5px] text-[var(--orbita-text-tertiary)]">Carregando…</li>
        ) : items.length === 0 ? (
          <li className="px-2 py-3 text-[12.5px] text-[var(--orbita-text-tertiary)]">
            {search ? "Nenhuma empresa com esse nome." : "Nenhuma empresa cadastrada."}
          </li>
        ) : (
          items.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => onPick(c.id)}
                className={cn(
                  "flex w-full flex-col rounded-[8px] px-2 py-1.5 text-left hover:bg-[var(--orbita-field)] disabled:opacity-60",
                )}
              >
                <span className="truncate text-[13.5px] font-medium text-[var(--orbita-text)]">{c.name}</span>
                {c.city || c.domain ? (
                  <span className="truncate text-[11.5px] text-[var(--orbita-text-tertiary)]">
                    {[c.city && c.state ? `${c.city}/${c.state}` : c.city, c.domain].filter(Boolean).join(" · ")}
                  </span>
                ) : null}
              </button>
            </li>
          ))
        )}
      </ul>
      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-3 py-1 text-[12.5px] font-medium text-[var(--orbita-text-secondary)] hover:bg-[var(--orbita-field)]"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
