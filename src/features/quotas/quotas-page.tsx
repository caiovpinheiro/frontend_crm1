"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconPencil,
  IconPlus,
  IconTicket,
  IconTrash,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { ButtonGlass } from "@/components/crm/button-glass";
import { PageActionsMenu } from "@/components/crm/page-toolbar";
import { SettingsListFilterBar } from "@/components/crm/settings-filter-bar";
import { useSettingsHeaderSlots } from "@/app/(app)/settings/_v2-shell";
import { apiUrl } from "@/lib/api";
import { cn, formatCurrency } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";

import { CategoriesPage } from "./categories-page";
import { CategoryDialog } from "./category-dialog";
import { QuotaDialog } from "./quota-dialog";

type QuotaRow = {
  id: string;
  name: string;
  discountType: "PERCENT" | "FIXED";
  discountValue: number;
  productId: string | null;
  product: { id: string; name: string } | null;
  orgUnitId: string | null;
  orgUnit: { id: string; name: string } | null;
  qtyTotal: number | null;
  qtyConsumed: number;
  balance: number | null;
  validFrom: string;
  validTo: string | null;
  exclusionGroup: string | null;
  maxStacks: number;
  calcMode: "CASCADE" | "SUM_SIMPLE";
  active: boolean;
};

async function fetchQuotas(search: string): Promise<QuotaRow[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const res = await fetch(apiUrl(`/api/quotas?${params}`));
  if (!res.ok) throw new Error("Erro ao carregar cotas");
  const data = (await res.json()) as { quotas: QuotaRow[] };
  return data.quotas;
}

async function deleteQuota(id: string) {
  const res = await fetch(apiUrl(`/api/quotas/${id}`), { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { message?: string }).message ?? "Erro ao remover cota");
  }
}

function fmtDiscount(type: "PERCENT" | "FIXED", value: number): string {
  return type === "PERCENT" ? `${value}%` : formatCurrency(value);
}

function fmtValidity(from: string, to: string | null): string {
  const fromStr = new Date(from).toLocaleDateString("pt-BR");
  if (!to) return `${fromStr} → sem prazo`;
  return `${fromStr} → ${new Date(to).toLocaleDateString("pt-BR")}`;
}

const LIST_GRID = "minmax(0,1fr) 110px 120px 130px 90px 90px";

type Tab = "categories" | "quotas";

export function QuotasPage() {
  const { confirm, dialog } = useConfirm();
  const slots = useSettingsHeaderSlots();
  const [search, setSearch] = React.useState("");
  const [tab, setTab] = React.useState<Tab>("categories");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [catDialogOpen, setCatDialogOpen] = React.useState(false);
  const queryClient = useQueryClient();

  const { data: quotas = [], isLoading } = useQuery({
    queryKey: ["quotas", search],
    queryFn: () => fetchQuotas(search),
  });

  const deleteMut = useMutation({
    mutationFn: deleteQuota,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotas"] });
      toast.success("Cota desativada.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const openCreate = React.useCallback(() => {
    setEditingId(null);
    setDialogOpen(true);
  }, []);

  const openEdit = React.useCallback((id: string) => {
    setEditingId(id);
    setDialogOpen(true);
  }, []);

  const searchNode = React.useMemo(
    () => (
      <SettingsListFilterBar
        search={search}
        onSearch={setSearch}
        placeholder="Buscar cotas…"
        ariaLabel="Buscar cotas"
        onClearAll={() => setSearch("")}
      />
    ),
    [search],
  );

  const actionsNode = React.useMemo(
    () => (
      <PageActionsMenu
        items={
          tab === "categories"
            ? [
                {
                  icon: <IconPlus size={16} />,
                  label: "Nova categoria",
                  onClick: () => setCatDialogOpen(true),
                  primary: true,
                },
              ]
            : [
                {
                  icon: <IconPlus size={16} />,
                  label: "Nova cota avulsa",
                  onClick: openCreate,
                  primary: true,
                },
              ]
        }
      />
    ),
    [openCreate, tab],
  );

  React.useEffect(() => {
    if (!slots) return;
    slots.setCenter(searchNode);
    slots.setActions(actionsNode);
    return () => {
      slots.setCenter(null);
      slots.setActions(null);
    };
  }, [slots, searchNode, actionsNode]);

  return (
    <div className="flex w-full min-w-0 flex-col gap-3.5">
      <div className="flex items-center gap-1 rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] p-1 text-[13px]">
        {(
          [
            { key: "categories", label: "Categorias" },
            { key: "quotas", label: "Cotas avulsas (legado)" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "flex-1 rounded-[var(--radius-md)] px-3 py-1.5 font-medium transition-colors",
              tab === t.key
                ? "bg-[var(--glass-bg-strong)] text-[var(--text-primary)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "categories" ? (
        <CategoriesPage search={search} />
      ) : isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-[64px] animate-pulse rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)]"
            />
          ))}
        </div>
      ) : quotas.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg-base)] py-16">
          <IconTicket size={40} className="text-[var(--text-muted)] opacity-40" />
          <p className="text-sm text-[var(--text-muted)]">Nenhuma cota cadastrada.</p>
          <ButtonGlass variant="glass" size="sm" onClick={openCreate}>
            <IconPlus size={14} /> Criar primeira
          </ButtonGlass>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-2">
          <div
            className="grid gap-3 px-4 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]"
            style={{ gridTemplateColumns: LIST_GRID }}
          >
            <span>Cota</span>
            <span>Desconto</span>
            <span>Saldo</span>
            <span>Vigência</span>
            <span>Status</span>
            <span className="text-right">Ações</span>
          </div>
          {quotas.map((q) => (
            <div
              key={q.id}
              style={{ gridTemplateColumns: LIST_GRID }}
              className={cn(
                "group grid items-center gap-3 rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-4 py-3 shadow-[var(--glass-shadow-sm)] transition-all hover:border-[var(--input-border-focus)]",
                !q.active && "opacity-60",
              )}
            >
              <div className="min-w-0">
                <div className="truncate font-display text-[14px] font-bold text-[var(--text-primary)]">
                  {q.name}
                </div>
                <div className="truncate text-[11px] text-[var(--text-muted)]">
                  {q.product?.name ?? "Qualquer produto"} • {q.orgUnit?.name ?? "Qualquer unidade"}
                  {q.exclusionGroup ? ` • grupo ${q.exclusionGroup}` : ""}
                  {q.maxStacks > 1 ? ` • combina até ${q.maxStacks}` : ""}
                  {q.calcMode === "SUM_SIMPLE" ? " • soma simples" : ""}
                </div>
              </div>

              <span className="font-display text-[13px] font-semibold text-[var(--color-success)]">
                {fmtDiscount(q.discountType, q.discountValue)}
              </span>

              <span className="font-display text-[13px] tabular-nums text-[var(--text-primary)]">
                {q.qtyTotal === null
                  ? "Ilimitada"
                  : `${q.qtyConsumed}/${q.qtyTotal}`}
              </span>

              <span className="truncate font-body text-[12px] text-[var(--text-secondary)]">
                {fmtValidity(q.validFrom, q.validTo)}
              </span>

              <span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 font-display text-[11px] font-bold",
                    q.active
                      ? "bg-[var(--color-success-bg)] text-[var(--color-success)]"
                      : "bg-[var(--glass-bg-overlay)] text-[var(--text-muted)]",
                  )}
                >
                  {q.active ? "Ativa" : "Inativa"}
                </span>
              </span>

              <div className="flex items-center justify-end gap-1">
                <button
                  type="button"
                  onClick={() => openEdit(q.id)}
                  aria-label={`Editar ${q.name}`}
                  className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] text-[var(--brand-primary)] transition-colors hover:bg-[var(--color-primary-soft)]"
                >
                  <IconPencil size={15} />
                </button>
                {q.active && (
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await confirm({
                        title: "Desativar cota",
                        description: `Desativar cota "${q.name}"?`,
                        destructive: true,
                      });
                      if (ok) deleteMut.mutate(q.id);
                    }}
                    aria-label={`Desativar ${q.name}`}
                    className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] hover:text-[var(--color-danger)]"
                  >
                    <IconTrash size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <QuotaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        quotaId={editingId}
      />

      <CategoryDialog
        open={catDialogOpen}
        onOpenChange={setCatDialogOpen}
        categoryId={null}
      />
      {dialog}
    </div>
  );
}
