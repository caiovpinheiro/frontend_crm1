"use client";

/**
 * CategoriesPage — lista Categorias de Desconto (fonte da verdade de % +
 * regras) com um resumo agregado das alocações por unidade e o saldo total.
 */
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconPencil, IconPlus, IconTicket, IconTrash } from "@tabler/icons-react";
import { toast } from "sonner";

import { ButtonGlass } from "@/components/crm/button-glass";
import { apiUrl } from "@/lib/api";
import { cn, formatCurrency } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";

import { CategoryDialog } from "./category-dialog";

type CategoryRow = {
  id: string;
  name: string;
  discountType: "PERCENT" | "FIXED";
  discountValue: number;
  productId: string | null;
  product: { id: string; name: string } | null;
  exclusionGroup: string | null;
  maxStacks: number;
  calcMode: "CASCADE" | "SUM_SIMPLE";
  validFrom: string;
  validTo: string | null;
  active: boolean;
  quotas: Array<{
    id: string;
    orgUnitId: string | null;
    orgUnit: { id: string; name: string } | null;
    qtyTotal: number | null;
    qtyConsumed: number;
    balance: number | null;
    active: boolean;
  }>;
};

async function fetchCategories(search: string): Promise<CategoryRow[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  params.set("includeQuotas", "true");
  const res = await fetch(apiUrl(`/api/discount-categories?${params}`));
  if (!res.ok) throw new Error("Erro ao carregar categorias");
  const data = (await res.json()) as { categories: CategoryRow[] };
  return data.categories;
}

async function deactivateCategory(id: string) {
  const res = await fetch(apiUrl(`/api/discount-categories/${id}`), {
    method: "DELETE",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { message?: string }).message ?? "Erro ao desativar categoria",
    );
  }
}

function fmtDiscount(type: "PERCENT" | "FIXED", value: number): string {
  return type === "PERCENT" ? `${value}%` : formatCurrency(value);
}

const LIST_GRID = "minmax(0,1fr) 110px minmax(0,1.4fr) 130px 90px 90px";

export function CategoriesPage({ search }: { search: string }) {
  const { confirm, dialog } = useConfirm();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["discount-categories", search],
    queryFn: () => fetchCategories(search),
  });

  const deactivateMut = useMutation({
    mutationFn: deactivateCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["discount-categories"] });
      toast.success("Categoria desativada.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const openCreate = () => {
    setEditingId(null);
    setDialogOpen(true);
  };
  const openEdit = (id: string) => {
    setEditingId(id);
    setDialogOpen(true);
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-3.5">
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-[68px] animate-pulse rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)]"
            />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg-base)] py-16">
          <IconTicket size={40} className="text-[var(--text-muted)] opacity-40" />
          <p className="text-sm text-[var(--text-muted)]">
            Nenhuma categoria cadastrada.
          </p>
          <ButtonGlass variant="glass" size="sm" onClick={openCreate}>
            <IconPlus size={14} /> Criar primeira categoria
          </ButtonGlass>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-2">
          <div
            className="grid gap-3 px-4 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]"
            style={{ gridTemplateColumns: LIST_GRID }}
          >
            <span>Categoria</span>
            <span>Desconto</span>
            <span>Alocações (unidade · saldo)</span>
            <span>Saldo total</span>
            <span>Status</span>
            <span className="text-right">Ações</span>
          </div>
          {categories.map((c) => {
            const activeQuotas = c.quotas.filter((q) => q.active);
            const totals = activeQuotas.reduce(
              (acc, q) => {
                if (q.qtyTotal === null) return { ...acc, unlimited: true };
                return {
                  ...acc,
                  total: acc.total + q.qtyTotal,
                  consumed: acc.consumed + q.qtyConsumed,
                };
              },
              { total: 0, consumed: 0, unlimited: false },
            );
            return (
              <div
                key={c.id}
                style={{ gridTemplateColumns: LIST_GRID }}
                className={cn(
                  "group grid items-center gap-3 rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-4 py-3 shadow-[var(--glass-shadow-sm)] transition-all hover:border-[var(--input-border-focus)]",
                  !c.active && "opacity-60",
                )}
              >
                <div className="min-w-0">
                  <div className="truncate font-display text-[14px] font-bold text-[var(--text-primary)]">
                    {c.name}
                  </div>
                  <div className="truncate text-[11px] text-[var(--text-muted)]">
                    {c.product?.name ?? "Qualquer curso/produto"}
                    {c.exclusionGroup ? ` • grupo ${c.exclusionGroup}` : ""}
                    {c.maxStacks > 1 ? ` • combina até ${c.maxStacks}` : ""}
                  </div>
                </div>

                <span className="font-display text-[13px] font-semibold text-[var(--color-success)]">
                  {fmtDiscount(c.discountType, c.discountValue)}
                </span>

                <div className="flex min-w-0 flex-wrap gap-1">
                  {activeQuotas.length === 0 ? (
                    <span className="text-[11px] italic text-[var(--text-muted)]">
                      sem alocações
                    </span>
                  ) : (
                    activeQuotas.map((q) => (
                      <span
                        key={q.id}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full bg-[var(--glass-bg-strong)] px-2 py-0.5 text-[11px] tabular-nums text-[var(--text-primary)]",
                          q.balance !== null &&
                            q.balance <= 0 &&
                            "text-[var(--color-danger)]",
                        )}
                      >
                        {q.orgUnit?.name ?? "Global"} ·{" "}
                        {q.qtyTotal === null
                          ? "∞"
                          : `${q.qtyTotal - q.qtyConsumed}/${q.qtyTotal}`}
                      </span>
                    ))
                  )}
                </div>

                <span className="font-display text-[13px] tabular-nums text-[var(--text-primary)]">
                  {totals.unlimited
                    ? "∞"
                    : totals.total === 0
                      ? "—"
                      : `${totals.total - totals.consumed}/${totals.total}`}
                </span>

                <span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 font-display text-[11px] font-bold",
                      c.active
                        ? "bg-[var(--color-success-bg)] text-[var(--color-success)]"
                        : "bg-[var(--glass-bg-overlay)] text-[var(--text-muted)]",
                    )}
                  >
                    {c.active ? "Ativa" : "Inativa"}
                  </span>
                </span>

                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(c.id)}
                    aria-label={`Editar ${c.name}`}
                    className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] text-[var(--brand-primary)] transition-colors hover:bg-[var(--color-primary-soft)]"
                  >
                    <IconPencil size={15} />
                  </button>
                  {c.active && (
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await confirm({
                          title: "Desativar categoria",
                          description: `Desativar categoria "${c.name}"?`,
                          destructive: true,
                        });
                        if (ok) deactivateMut.mutate(c.id);
                      }}
                      aria-label={`Desativar ${c.name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] hover:text-[var(--color-danger)]"
                    >
                      <IconTrash size={15} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CategoryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        categoryId={editingId}
      />

      {/* Botão flutuante quando há categorias */}
      {categories.length > 0 && (
        <div className="flex justify-end">
          <ButtonGlass variant="glass" size="sm" onClick={openCreate}>
            <IconPlus size={14} /> Nova categoria
          </ButtonGlass>
        </div>
      )}
      {dialog}
    </div>
  );
}
