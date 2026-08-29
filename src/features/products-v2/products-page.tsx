"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconAlertTriangle,
  IconBriefcase,
  IconLayoutGrid,
  IconPackage,
  IconPencil,
  IconPlus,
  IconSchool,
  IconTool,
  IconTrash,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { ButtonGlass } from "@/components/crm/button-glass";
import { CheckboxGlass } from "@/components/crm/checkbox-glass";
import { KpiCard, type KpiTone } from "@/components/crm/kpi-card";
import { KpiStrip } from "@/components/crm/kpi-strip";
import { MobileTableScroll } from "@/components/crm/mobile-table-scroll";
import { PageActionsMenu } from "@/components/crm/page-toolbar";
import { SettingsListFilterBar } from "@/components/crm/settings-filter-bar";
import {
  LIST_ACTIONS_CELL_CLASS,
  ListColumnLabel,
  SortableHeader,
  listTableHeadRowClass,
  type SortDir,
} from "@/components/crm/sortable-header";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSettingsHeaderSlots } from "@/app/(app)/settings/_v2-shell";
import { apiUrl } from "@/lib/api";
import { cn, formatCurrency } from "@/lib/utils";

import { ProductDialog } from "./product-dialog";
import { KIND_LABEL, type ProductKind } from "./types";

type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  price: number | string;
  unit: string;
  kind: ProductKind;
  isActive: boolean;
};

/** Mini-dash: cada segmento vira um KPI clicável (padrão Empresas). */
const KIND_SEGMENTS: {
  id: ProductKind;
  label: string;
  tone: KpiTone;
  icon: React.ReactNode;
}[] = [
  { id: "PHYSICAL", label: "Físicos", tone: "violet", icon: <IconPackage size={20} stroke={2.2} /> },
  { id: "SERVICE", label: "Serviços", tone: "success", icon: <IconTool size={20} stroke={2.2} /> },
  { id: "COURSE", label: "Cursos", tone: "warning", icon: <IconSchool size={20} stroke={2.2} /> },
  { id: "JOB_OPENING", label: "Vagas", tone: "neutral", icon: <IconBriefcase size={20} stroke={2.2} /> },
];

/** Ícone por tipo — reutilizado no avatar da linha. */
const KIND_ICON: Record<ProductKind, React.ReactNode> = {
  PHYSICAL: <IconPackage size={17} stroke={2.2} />,
  SERVICE: <IconTool size={17} stroke={2.2} />,
  COURSE: <IconSchool size={17} stroke={2.2} />,
  JOB_OPENING: <IconBriefcase size={17} stroke={2.2} />,
};

/** Grid da linha: [check] Produto | Preço | Tipo | Status | Ações. */
const LIST_GRID = "32px minmax(0,1fr) 130px 120px 110px max-content";

type SortField = "name" | "price" | "kind" | "status";

async function fetchProducts(search: string): Promise<ProductRow[]> {
  const perPage = 1000;
  const all: ProductRow[] = [];
  let page = 1;
  let total = Infinity;

  while (all.length < total) {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    params.set("perPage", String(perPage));
    params.set("page", String(page));
    const res = await fetch(apiUrl(`/api/products?${params}`));
    if (!res.ok) throw new Error("Erro ao carregar produtos");
    const data = (await res.json()) as {
      products?: ProductRow[];
      total?: number;
    };
    const batch = Array.isArray(data.products) ? data.products : [];
    total = typeof data.total === "number" ? data.total : batch.length;
    all.push(...batch);
    if (batch.length === 0) break;
    page += 1;
  }

  return all;
}

async function deleteProductRequest(id: string) {
  const res = await fetch(apiUrl(`/api/products/${id}`), { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { message?: string })?.message ?? "Erro ao excluir produto");
  }
}

export function ProductsV2Page() {
  const slots = useSettingsHeaderSlots();
  const [search, setSearch] = React.useState("");
  const [kindFilter, setKindFilter] = React.useState<ProductKind | "">("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<ProductRow | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = React.useState(false);
  const [sortBy, setSortBy] = React.useState<SortField>("name");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");
  const queryClient = useQueryClient();

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products", search],
    queryFn: () => fetchProducts(search),
  });

  const deleteMut = useMutation({
    mutationFn: deleteProductRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Produto removido.");
      setDeleting(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao excluir produto."),
  });

  const bulkDeleteMut = useMutation({
    mutationFn: async (ids: string[]) => {
      let fail = 0;
      for (const id of ids) {
        try {
          await deleteProductRequest(id);
        } catch {
          fail += 1;
        }
      }
      return { ok: ids.length - fail, fail };
    },
    onSuccess: ({ ok, fail }) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setSelected(new Set());
      setConfirmBulk(false);
      if (fail === 0) toast.success(ok === 1 ? "Produto removido." : `${ok} produtos removidos.`);
      else if (ok === 0) toast.error("Não foi possível remover os produtos selecionados.");
      else toast.error(`${ok} removido(s), ${fail} falharam.`);
    },
  });

  const filtered = kindFilter
    ? products.filter((p) => p.kind === kindFilter)
    : products;

  const sorted = React.useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "name":
          cmp = a.name.localeCompare(b.name, "pt-BR");
          break;
        case "price":
          cmp = Number(a.price) - Number(b.price);
          break;
        case "kind":
          cmp = KIND_LABEL[a.kind].localeCompare(KIND_LABEL[b.kind], "pt-BR");
          break;
        case "status":
          cmp = Number(a.isActive) - Number(b.isActive);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortBy, sortDir]);

  React.useEffect(() => {
    setSelected(new Set());
  }, [search, kindFilter]);

  const allChecked = sorted.length > 0 && sorted.every((p) => selected.has(p.id));
  const someChecked = sorted.some((p) => selected.has(p.id));

  const toggleAll = React.useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (sorted.every((p) => next.has(p.id))) sorted.forEach((p) => next.delete(p.id));
      else sorted.forEach((p) => next.add(p.id));
      return next;
    });
  }, [sorted]);

  const toggleOne = React.useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSort = React.useCallback((field: SortField) => {
    setSortBy((prevField) => {
      if (prevField === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prevField;
      }
      setSortDir(field === "name" || field === "kind" ? "asc" : "desc");
      return field;
    });
  }, []);

  const dirFor = (f: SortField): SortDir => (sortBy === f ? sortDir : null);

  const openCreate = React.useCallback(() => {
    setEditingId(null);
    setDialogOpen(true);
  }, []);
  const openEdit = React.useCallback((id: string) => {
    setEditingId(id);
    setDialogOpen(true);
  }, []);

  /* Contagem por tipo — alimenta os KPIs do mini-dash. */
  const kindCounts = React.useMemo(() => {
    const acc: Record<string, number> = {};
    for (const p of products) acc[p.kind] = (acc[p.kind] ?? 0) + 1;
    return acc;
  }, [products]);

  const searchNode = React.useMemo(
    () => (
      <SettingsListFilterBar
        search={search}
        onSearch={setSearch}
        placeholder="Buscar por nome ou SKU…"
        ariaLabel="Buscar produtos"
        onClearAll={() => setSearch("")}
      />
    ),
    [search],
  );

  const actionsNode = React.useMemo(
    () => (
      <PageActionsMenu
        items={[
          {
            icon: <IconPlus size={16} />,
            label: "Novo produto",
            onClick: openCreate,
            primary: true,
          },
        ]}
      />
    ),
    [openCreate],
  );

  /* Injeta busca (center) + ações (actions) no PageHeader do
     SettingsV2Shell — padrão canônico. */
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
      <KpiStrip aria-label="Indicadores de produtos">
        <KpiCard
          label="Todos"
          value={products.length.toLocaleString("pt-BR")}
          icon={<IconLayoutGrid size={20} stroke={2.2} />}
          tone="brand"
          onClick={() => setKindFilter("")}
        />
        {KIND_SEGMENTS.map((seg) => (
          <KpiCard
            key={seg.id}
            label={seg.label}
            value={(kindCounts[seg.id] ?? 0).toLocaleString("pt-BR")}
            icon={seg.icon}
            tone={seg.tone}
            active={kindFilter === seg.id}
            onClick={() =>
              setKindFilter((prev) => (prev === seg.id ? "" : seg.id))
            }
          />
        ))}
      </KpiStrip>

      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-4 py-2.5 backdrop-blur-md">
          <span className="font-display text-[13px] font-bold text-[var(--text-primary)]">
            {selected.size} selecionado{selected.size > 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2">
            <ButtonGlass
              variant="glass"
              size="sm"
              type="button"
              onClick={() => setSelected(new Set())}
              className="border-transparent bg-transparent shadow-none text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)]"
            >
              Limpar
            </ButtonGlass>
            <ButtonGlass variant="danger" size="sm" type="button" onClick={() => setConfirmBulk(true)}>
              <IconTrash size={14} /> Excluir
            </ButtonGlass>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-[64px] animate-pulse rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] shadow-[var(--glass-shadow-sm)]"
            />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg-base)] py-16">
          <IconPackage size={40} className="text-[var(--text-muted)] opacity-40" />
          <p className="text-sm text-[var(--text-muted)]">Nenhum produto encontrado.</p>
          <ButtonGlass variant="glass" size="sm" onClick={openCreate}>
            <IconPlus size={14} /> Criar primeiro
          </ButtonGlass>
        </div>
      ) : (
        <MobileTableScroll minWidth={720}>
          {/* Cabeçalho de colunas (padrão Empresas/Contatos). */}
          <div
            className={listTableHeadRowClass("gap-3 border border-transparent px-4")}
            style={{ gridTemplateColumns: LIST_GRID }}
          >
            <span>
              <CheckboxGlass
                checked={allChecked}
                indeterminate={!allChecked && someChecked}
                onChange={toggleAll}
                aria-label="Selecionar todos"
              />
            </span>
            <SortableHeader label="Produto" sort={dirFor("name")} onSort={() => toggleSort("name")} />
            <SortableHeader label="Preço" sort={dirFor("price")} onSort={() => toggleSort("price")} />
            <SortableHeader label="Tipo" sort={dirFor("kind")} onSort={() => toggleSort("kind")} />
            <SortableHeader label="Status" sort={dirFor("status")} onSort={() => toggleSort("status")} />
            <ListColumnLabel align="right">Ações</ListColumnLabel>
          </div>

          {sorted.map((p) => {
            const isSelected = selected.has(p.id);
            return (
            <div
              key={p.id}
              style={{ gridTemplateColumns: LIST_GRID }}
              className={cn(
                "group grid items-center gap-3 rounded-[var(--radius-xl)] border px-4 py-3 shadow-[var(--glass-shadow-sm)] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:shadow-[var(--glass-shadow)]",
                isSelected
                  ? "border-[var(--brand-primary)] bg-[var(--color-primary-soft)]"
                  : "border-[var(--glass-border)] bg-[var(--glass-bg-base)] hover:border-[var(--input-border-focus)]",
                !p.isActive && "opacity-60",
              )}
            >
              <span>
                <CheckboxGlass
                  checked={isSelected}
                  onChange={() => toggleOne(p.id)}
                  aria-label={`Selecionar ${p.name}`}
                />
              </span>

              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary-soft)] text-[var(--brand-primary)]">
                  {KIND_ICON[p.kind]}
                </span>
                <div className="min-w-0 leading-tight">
                  <button
                    type="button"
                    onClick={() => openEdit(p.id)}
                    className="block max-w-full truncate text-left font-display text-[14px] font-bold text-[var(--text-primary)] transition-colors hover:text-[var(--brand-primary)]"
                  >
                    {p.name}
                  </button>
                  <div className="truncate font-body text-[12px] text-[var(--text-muted)]">
                    {p.sku || "Sem SKU"}
                  </div>
                </div>
              </div>

              <span className="truncate font-display text-[13px] font-semibold text-[var(--text-primary)]">
                {formatCurrency(Number(p.price))}
              </span>

              <span className="truncate font-display text-[13px] text-[var(--text-secondary)]">
                {KIND_LABEL[p.kind]}
              </span>

              <span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 font-display text-[11px] font-bold",
                    p.isActive
                      ? "bg-[var(--color-success-bg)] text-[var(--color-success)]"
                      : "bg-[var(--glass-bg-overlay)] text-[var(--text-muted)]",
                  )}
                >
                  {p.isActive ? "Ativo" : "Inativo"}
                </span>
              </span>

              <div className={LIST_ACTIONS_CELL_CLASS}>
                <button
                  type="button"
                  onClick={() => openEdit(p.id)}
                  aria-label={`Editar ${p.name}`}
                  className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] text-[var(--brand-primary)] transition-colors hover:bg-[var(--color-primary-soft)]"
                >
                  <IconPencil size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleting(p)}
                  aria-label={`Excluir ${p.name}`}
                  className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] hover:text-[var(--color-danger)]"
                >
                  <IconTrash size={15} />
                </button>
              </div>
            </div>
            );
          })}
        </MobileTableScroll>
      )}

      <ProductDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        productId={editingId}
        onCreated={(id) => setEditingId(id)}
      />

      <Dialog open={deleting !== null} onOpenChange={(next) => !next && setDeleting(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] text-[var(--color-danger)]">
                <IconAlertTriangle size={18} />
              </span>
              <DialogTitle className="text-base">Excluir produto?</DialogTitle>
            </div>
            <DialogDescription className="text-[13px] leading-relaxed">
              {deleting
                ? `"${deleting.name}" será desativado e deixará de aparecer nas seleções. Você pode recriá-lo depois.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <ButtonGlass
              variant="glass"
              size="sm"
              type="button"
              onClick={() => setDeleting(null)}
              disabled={deleteMut.isPending}
              className="border-transparent bg-transparent shadow-none text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)]"
            >
              Cancelar
            </ButtonGlass>
            <ButtonGlass
              variant="danger"
              size="sm"
              type="button"
              disabled={deleteMut.isPending}
              onClick={() => deleting && deleteMut.mutate(deleting.id)}
            >
              <IconTrash size={14} /> {deleteMut.isPending ? "Excluindo..." : "Excluir"}
            </ButtonGlass>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmBulk} onOpenChange={(next) => !next && setConfirmBulk(false)}>
        <DialogContent size="sm">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] text-[var(--color-danger)]">
                <IconAlertTriangle size={18} />
              </span>
              <DialogTitle className="text-base">
                {`Excluir ${selected.size === 1 ? "produto" : `${selected.size} produtos`}?`}
              </DialogTitle>
            </div>
            <DialogDescription className="text-[13px] leading-relaxed">
              Os produtos selecionados serão desativados e deixarão de aparecer nas seleções.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <ButtonGlass
              variant="glass"
              size="sm"
              type="button"
              onClick={() => setConfirmBulk(false)}
              disabled={bulkDeleteMut.isPending}
              className="border-transparent bg-transparent shadow-none text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)]"
            >
              Cancelar
            </ButtonGlass>
            <ButtonGlass
              variant="danger"
              size="sm"
              type="button"
              disabled={bulkDeleteMut.isPending}
              onClick={() => bulkDeleteMut.mutate([...selected])}
            >
              <IconTrash size={14} /> {bulkDeleteMut.isPending ? "Excluindo..." : "Excluir"}
            </ButtonGlass>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
