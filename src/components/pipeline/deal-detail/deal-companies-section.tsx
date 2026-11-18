"use client";

/**
 * Bloco "Empresas" do negócio (pipeline e inbox), ao lado de Produtos e
 * Cotas: vincula empresas do CRM ao candidato, marca a principal (a que
 * entra em `{{empresa.*}}`), mostra os dados e manda para o chat.
 * Filtros/ativações "por empresa" contam todas as vinculadas.
 */
import * as React from "react";
import {
  IconBuildingSkyscraper as Building,
  IconPencil as Pencil,
  IconPlus as Plus,
  IconSearch as Search,
  IconSend as Send,
  IconStar as Star,
  IconStarFilled as StarFilled,
  IconX as X,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { EditCompanyDialog } from "@/components/companies/edit-company-dialog";
import { useCompanies, useCompany } from "@/features/directory-v2/hooks";
import { apiUrl } from "@/lib/api";
import { insertComposerText } from "@/lib/composer-insert";
import { cn } from "@/lib/utils";

export type DealCompanyItem = {
  companyId: string;
  isPrimary: boolean;
  linkedAt: string;
  company: {
    id: string;
    number: number;
    name: string;
    cnpj: string | null;
    phone: string | null;
    email: string | null;
    cep: string | null;
    city: string | null;
    state: string | null;
    address: string | null;
  };
};

/** Cidade/UF juntos ("São Paulo/SP"). */
export function cityState(c: Pick<DealCompanyItem["company"], "city" | "state">): string {
  return [c.city?.trim(), c.state?.trim()].filter(Boolean).join("/");
}

/** Mensagem com os dados da empresa para o candidato (vai para o chat revisar). */
export function companyMessage(c: DealCompanyItem["company"]): string {
  const lines = [`🏢 *${c.name}*`];
  const place = [c.address?.trim(), cityState(c)].filter(Boolean).join(" — ");
  if (place) lines.push(`📍 ${place}${c.cep?.trim() ? `, CEP ${c.cep.trim()}` : ""}`);
  if (c.phone?.trim()) lines.push(`📞 ${c.phone.trim()}`);
  if (c.email?.trim()) lines.push(`✉️ ${c.email.trim()}`);
  if (c.cnpj?.trim()) lines.push(`CNPJ: ${c.cnpj.trim()}`);
  return lines.join("\n");
}

async function readError(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  return data.message || fallback;
}

export function DealCompaniesSection({ dealId, compact = false }: { dealId: string; compact?: boolean }) {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const key = ["deal-companies", dealId] as const;

  const { data: items = [] } = useQuery({
    queryKey: key,
    queryFn: async (): Promise<DealCompanyItem[]> => {
      const res = await fetch(apiUrl(`/api/deals/${dealId}/companies`));
      if (!res.ok) return [];
      return ((await res.json()) as { items: DealCompanyItem[] }).items;
    },
  });

  const setItems = (next: DealCompanyItem[]) => {
    queryClient.setQueryData(key, next);
    queryClient.invalidateQueries({ queryKey: ["deal", dealId] });
  };

  const link = useMutation({
    mutationFn: async (companyId: string) => {
      const res = await fetch(apiUrl(`/api/deals/${dealId}/companies`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      if (!res.ok) throw new Error(await readError(res, "Falha ao vincular a empresa."));
      return ((await res.json()) as { items: DealCompanyItem[] }).items;
    },
    onSuccess: (next) => {
      setItems(next);
      setShowAdd(false);
      toast.success("Empresa vinculada.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const makePrimary = useMutation({
    mutationFn: async (companyId: string) => {
      const res = await fetch(apiUrl(`/api/deals/${dealId}/companies/${companyId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrimary: true }),
      });
      if (!res.ok) throw new Error(await readError(res, "Falha ao escolher a principal."));
      return ((await res.json()) as { items: DealCompanyItem[] }).items;
    },
    onSuccess: (next) => {
      setItems(next);
      toast.success("Empresa principal atualizada.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const unlink = useMutation({
    mutationFn: async (companyId: string) => {
      const res = await fetch(apiUrl(`/api/deals/${dealId}/companies/${companyId}`), { method: "DELETE" });
      if (!res.ok) throw new Error(await readError(res, "Falha ao remover a empresa."));
      return ((await res.json()) as { items: DealCompanyItem[] }).items;
    },
    onSuccess: (next) => {
      setItems(next);
      toast.success("Empresa removida do negócio.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const editing = useCompany(editingId);
  const linkedIds = new Set(items.map((i) => i.companyId));

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
      <div className="flex items-center gap-2 px-4 py-3">
        <span className="text-sm font-bold text-foreground">Empresas</span>
        {items.length > 0 && (
          <span className="rounded-full bg-[var(--color-enterprise-bg)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--brand-primary)]">
            {items.length}
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          aria-label={showAdd ? "Fechar busca de empresa" : "Adicionar empresa"}
          className="flex items-center gap-1.5 rounded-full bg-[var(--brand-primary)] px-3 py-1 text-[12px] font-semibold text-white transition-all hover:brightness-110 active:scale-95"
        >
          {showAdd ? <X className="size-3" strokeWidth={2.5} /> : <Plus className="size-3" strokeWidth={2.5} />}
          {showAdd ? "Fechar" : "Adicionar"}
        </button>
      </div>

      {showAdd ? (
        <CompanySearch linkedIds={linkedIds} busy={link.isPending} onPick={(id) => link.mutate(id)} />
      ) : null}

      {items.length === 0 ? (
        !showAdd ? (
          <p className="px-4 pb-4 text-xs text-muted-foreground">Nenhuma empresa vinculada.</p>
        ) : null
      ) : (
        <ul className={cn("border-t border-border", compact && "text-[13px]")}>
          {items.map((item) => {
            const c = item.company;
            const place = [c.address?.trim(), cityState(c)].filter(Boolean).join(" — ");
            return (
              <li key={item.companyId} className="border-b border-border px-4 py-3 last:border-b-0">
                <div className="flex items-start gap-2">
                  <Building className="mt-0.5 size-4 shrink-0 text-[var(--brand-primary)]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-foreground">{c.name}</span>
                      {item.isPrimary ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-semibold text-amber-800">
                          <StarFilled className="size-3" /> Principal
                        </span>
                      ) : null}
                    </div>
                    <dl className="mt-1 space-y-0.5 text-[12px] text-muted-foreground">
                      {c.cnpj ? <div>CNPJ: {c.cnpj}</div> : null}
                      {c.phone ? <div>Telefone: {c.phone}</div> : null}
                      {c.email ? <div className="truncate">E-mail: {c.email}</div> : null}
                      {place ? <div>{place}{c.cep ? ` · CEP ${c.cep}` : ""}</div> : null}
                    </dl>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 pl-6">
                  <ActionChip
                    icon={<Send className="size-3.5" />}
                    label="Enviar dados"
                    title="Coloca os dados da empresa no chat para revisar e enviar"
                    onClick={() => {
                      insertComposerText(companyMessage(c));
                      toast.success("Dados da empresa no chat — confira e envie.");
                    }}
                  />
                  {!item.isPrimary ? (
                    <ActionChip
                      icon={<Star className="size-3.5" />}
                      label="Tornar principal"
                      disabled={makePrimary.isPending}
                      onClick={() => makePrimary.mutate(item.companyId)}
                    />
                  ) : null}
                  <ActionChip
                    icon={<Pencil className="size-3.5" />}
                    label="Editar"
                    onClick={() => setEditingId(item.companyId)}
                  />
                  <ActionChip
                    icon={<X className="size-3.5" />}
                    label="Remover"
                    disabled={unlink.isPending}
                    onClick={() => unlink.mutate(item.companyId)}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <EditCompanyDialog
        company={editingId ? (editing.data ?? null) : null}
        onClose={() => setEditingId(null)}
        onSaved={() => void queryClient.invalidateQueries({ queryKey: key })}
      />
    </div>
  );
}

function ActionChip({
  icon,
  label,
  title,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  title?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11.5px] font-medium text-foreground transition-colors hover:bg-[var(--color-bg-subtle)] disabled:opacity-60"
    >
      {icon}
      {label}
    </button>
  );
}

function CompanySearch({
  linkedIds,
  busy,
  onPick,
}: {
  linkedIds: Set<string>;
  busy: boolean;
  onPick: (companyId: string) => void;
}) {
  const [q, setQ] = React.useState("");
  const search = q.trim();
  const list = useCompanies({ search: search || undefined, perPage: 8 });
  const results = list.data?.items ?? [];
  return (
    <div className="space-y-2 border-t border-border px-4 pb-3 pt-2">
      <label className="flex items-center gap-2 rounded-xl border border-border bg-white px-3">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar empresa pelo nome"
          aria-label="Buscar empresa"
          className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </label>
      <div className="max-h-52 overflow-y-auto rounded-xl border border-border bg-white shadow-sm">
        {list.isLoading ? (
          <p className="px-3 py-3 text-center text-xs text-muted-foreground">Carregando…</p>
        ) : results.length === 0 ? (
          <p className="px-3 py-3 text-center text-xs text-muted-foreground">
            {search ? "Nenhuma empresa com esse nome." : "Nenhuma empresa cadastrada."}
          </p>
        ) : (
          results.map((c) => {
            const linked = linkedIds.has(c.id);
            const where = cityState(c);
            return (
              <button
                key={c.id}
                type="button"
                disabled={linked || busy}
                onClick={() => onPick(c.id)}
                className={cn(
                  "flex w-full flex-col px-3.5 py-2.5 text-left text-sm transition-colors",
                  linked ? "cursor-not-allowed bg-[var(--color-bg-subtle)] opacity-60" : "hover:bg-[var(--color-bg-subtle)]",
                )}
              >
                <span className="truncate font-semibold text-foreground">{c.name}</span>
                <span className="truncate text-[11.5px] text-muted-foreground">
                  {linked ? "Já vinculada" : [where, c.size ? `CNPJ ${c.size}` : null].filter(Boolean).join(" · ") || "—"}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
