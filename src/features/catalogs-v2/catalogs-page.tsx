"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  IconAlertTriangle,
  IconBookmark,
  IconBoxMultiple,
  IconPackage,
  IconPencil,
  IconPlus,
  IconStar,
  IconTag,
  IconTrash,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { ButtonGlass } from "@/components/crm/button-glass";
import { CheckboxGlass } from "@/components/crm/checkbox-glass";
import { KpiCard } from "@/components/crm/kpi-card";
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
import { FormDialog } from "@/components/ui/form-dialog";
import { useSettingsHeaderSlots } from "@/app/(app)/settings/_v2-shell";
import { apiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

import { ProductDialog } from "@/features/products-v2/product-dialog";
import { CatalogWizard } from "./catalog-wizard";
import { capabilityMeta } from "./constants";
import { useCatalogs, useSaveAsTemplate } from "./hooks";
import type { CatalogView } from "./types";

/** Grid: [check] Nome | Produtos | Capacidades | Ações */
const LIST_GRID = "32px minmax(0,1fr) 80px minmax(0,180px) max-content";

type SortField = "name" | "products" | "capabilities";

async function deleteCatalogRequest(id: string) {
  const res = await fetch(apiUrl(`/api/catalogs/${id}`), { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { message?: string })?.message ?? "Erro ao excluir catálogo");
  }
}

export function CatalogsManager() {
  const slots = useSettingsHeaderSlots();
  const queryClient = useQueryClient();
  const { data: catalogs = [], isLoading } = useCatalogs();
  const templateMutation = useSaveAsTemplate();

  const [query, setQuery] = React.useState("");
  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CatalogView | null>(null);
  const [newProductCatalogId, setNewProductCatalogId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<CatalogView | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = React.useState(false);
  const [sortBy, setSortBy] = React.useState<SortField>("name");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");

  const deleteMut = useMutation({
    mutationFn: deleteCatalogRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["catalogs"] });
      toast.success("Catálogo removido.");
      setDeleting(null);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Erro ao excluir catálogo."),
  });

  const bulkDeleteMut = useMutation({
    mutationFn: async (ids: string[]) => {
      let fail = 0;
      for (const id of ids) {
        try {
          await deleteCatalogRequest(id);
        } catch {
          fail += 1;
        }
      }
      return { ok: ids.length - fail, fail };
    },
    onSuccess: ({ ok, fail }) => {
      queryClient.invalidateQueries({ queryKey: ["catalogs"] });
      setSelected(new Set());
      setConfirmBulk(false);
      if (fail === 0)
        toast.success(ok === 1 ? "Catálogo removido." : `${ok} catálogos removidos.`);
      else if (ok === 0)
        toast.error("Não foi possível remover os catálogos selecionados.");
      else toast.error(`${ok} removido(s), ${fail} falharam.`);
    },
  });

  /* Métricas — somam todos os catálogos sem filtro (visão organizacional). */
  const stats = React.useMemo(() => {
    const activeCapabilities = catalogs.reduce(
      (sum, c) => sum + c.capabilities.filter((cap) => cap.enabled).length,
      0,
    );
    const totalProducts = catalogs.reduce((sum, c) => sum + (c._count?.products ?? 0), 0);
    const defaults = catalogs.filter((c) => c.isDefault).length;
    const templates = catalogs.filter((c) => c.isTemplate).length;
    return { total: catalogs.length, activeCapabilities, totalProducts, defaults, templates };
  }, [catalogs]);

  /* Filtro por busca, case-insensitive sobre name+description. */
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalogs;
    return catalogs.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description?.toLowerCase().includes(q) ?? false),
    );
  }, [catalogs, query]);

  /* Ordenação client-side. */
  const sorted = React.useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "name":
          cmp = a.name.localeCompare(b.name, "pt-BR");
          break;
        case "products":
          cmp = (a._count?.products ?? 0) - (b._count?.products ?? 0);
          break;
        case "capabilities":
          cmp =
            a.capabilities.filter((c) => c.enabled).length -
            b.capabilities.filter((c) => c.enabled).length;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortBy, sortDir]);

  /* Limpa seleção ao mudar busca. */
  React.useEffect(() => {
    setSelected(new Set());
  }, [query]);

  const allChecked = sorted.length > 0 && sorted.every((c) => selected.has(c.id));
  const someChecked = sorted.some((c) => selected.has(c.id));

  const toggleAll = React.useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (sorted.every((c) => next.has(c.id))) sorted.forEach((c) => next.delete(c.id));
      else sorted.forEach((c) => next.add(c.id));
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
      setSortDir(field === "name" ? "asc" : "desc");
      return field;
    });
  }, []);

  const dirFor = (f: SortField): SortDir => (sortBy === f ? sortDir : null);

  /* IDs selecionados que podem ser excluídos (ignora isDefault). */
  const bulkableSelected = React.useMemo(
    () =>
      [...selected].filter((id) => {
        const cat = catalogs.find((c) => c.id === id);
        return cat && !cat.isDefault;
      }),
    [selected, catalogs],
  );

  function handleSaveTemplate(cat: CatalogView) {
    templateMutation.mutate(
      { id: cat.id },
      {
        onSuccess: () => toast.success("Salvo como template da organização."),
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Erro ao salvar template"),
      },
    );
  }

  /* Injeta busca (center) + ações (actions) no PageHeader do
     SettingsV2Shell — padrão canônico. */
  const searchNode = React.useMemo(
    () => (
      <SettingsListFilterBar
        search={query}
        onSearch={setQuery}
        placeholder="Buscar catálogo..."
        ariaLabel="Buscar catálogo"
        onClearAll={() => setQuery("")}
      />
    ),
    [query],
  );

  const actionsNode = React.useMemo(
    () => (
      <PageActionsMenu
        items={[
          {
            icon: <IconPlus size={16} />,
            label: "Novo catálogo",
            onClick: () => setWizardOpen(true),
            primary: true,
          },
        ]}
      />
    ),
    [],
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
      {/* KPI MINI-DASH */}
      <section
        className="grid shrink-0 grid-cols-2 gap-2.5 sm:gap-3.5 lg:grid-cols-5"
        aria-label="Indicadores de catálogos"
      >
        <KpiCard
          label="Catálogos"
          value={stats.total.toLocaleString("pt-BR")}
          icon={<IconBoxMultiple size={20} stroke={2.2} />}
          tone="brand"
        />
        <KpiCard
          label="Capacidades ativas"
          value={stats.activeCapabilities.toLocaleString("pt-BR")}
          icon={<IconTag size={20} stroke={2.2} />}
          tone="violet"
        />
        <KpiCard
          label="Produtos"
          value={stats.totalProducts.toLocaleString("pt-BR")}
          icon={<IconPackage size={20} stroke={2.2} />}
          tone="success"
        />
        <KpiCard
          label="Padrão"
          value={stats.defaults.toLocaleString("pt-BR")}
          icon={<IconStar size={20} stroke={2.2} />}
          tone="warning"
        />
        <KpiCard
          label="Templates"
          value={stats.templates.toLocaleString("pt-BR")}
          icon={<IconBookmark size={20} stroke={2.2} />}
          tone="neutral"
        />
      </section>

      {/* BULK BAR */}
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
            <ButtonGlass
              variant="danger"
              size="sm"
              type="button"
              disabled={bulkableSelected.length === 0}
              onClick={() => setConfirmBulk(true)}
            >
              <IconTrash size={14} /> Excluir
            </ButtonGlass>
          </div>
        </div>
      )}

      {/* LIST */}
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-[64px] animate-pulse rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] shadow-[var(--glass-shadow-sm)]"
            />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg-base)] py-16">
          <IconBoxMultiple size={40} className="text-[var(--text-muted)] opacity-40" />
          <p className="text-sm text-[var(--text-muted)]">
            {query
              ? `Nenhum catálogo encontrado para "${query}".`
              : "Nenhum catálogo encontrado."}
          </p>
          {!query && (
            <ButtonGlass variant="glass" size="sm" onClick={() => setWizardOpen(true)}>
              <IconPlus size={14} /> Criar primeiro
            </ButtonGlass>
          )}
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-2">
          {/* Cabeçalho de colunas — padrão canônico. */}
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
            <SortableHeader
              label="Nome"
              sort={dirFor("name")}
              onSort={() => toggleSort("name")}
            />
            <SortableHeader
              label="Produtos"
              sort={dirFor("products")}
              onSort={() => toggleSort("products")}
            />
            <SortableHeader
              label="Capacidades"
              sort={dirFor("capabilities")}
              onSort={() => toggleSort("capabilities")}
            />
            <ListColumnLabel align="right">Ações</ListColumnLabel>
          </div>

          {sorted.map((cat) => {
            const isSelected = selected.has(cat.id);
            const activeCaps = cat.capabilities.filter((c) => c.enabled);
            const productCount = cat._count?.products ?? 0;
            return (
              <div
                key={cat.id}
                style={{ gridTemplateColumns: LIST_GRID }}
                className={cn(
                  "group grid items-center gap-3 rounded-[var(--radius-xl)] border px-4 py-3 shadow-[var(--glass-shadow-sm)] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:shadow-[var(--glass-shadow)]",
                  isSelected
                    ? "border-[var(--brand-primary)] bg-[var(--color-primary-soft)]"
                    : "border-[var(--glass-border)] bg-[var(--glass-bg-base)] hover:border-[var(--input-border-focus)]",
                )}
              >
                {/* Checkbox */}
                <span>
                  <CheckboxGlass
                    checked={isSelected}
                    onChange={() => toggleOne(cat.id)}
                    aria-label={`Selecionar ${cat.name}`}
                  />
                </span>

                {/* Nome + badges + descrição */}
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary-soft)] text-[var(--brand-primary)]">
                    <IconBoxMultiple size={17} stroke={2.2} />
                  </span>
                  <div className="min-w-0 leading-tight">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEditing(cat)}
                        className="block max-w-full truncate text-left font-display text-[14px] font-bold text-[var(--text-primary)] transition-colors hover:text-[var(--brand-primary)]"
                      >
                        {cat.name}
                      </button>
                      {cat.isDefault && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-enterprise-bg)] px-2 py-0.5 font-display text-[11px] font-bold text-[var(--brand-primary)]">
                          <IconStar size={10} /> Padrão
                        </span>
                      )}
                      {cat.isTemplate && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--glass-border-subtle)] px-2 py-0.5 font-display text-[11px] font-bold text-[var(--text-secondary)]">
                          <IconBookmark size={10} /> Template
                        </span>
                      )}
                    </div>
                    {cat.description && (
                      <div className="truncate font-body text-[12px] text-[var(--text-muted)]">
                        {cat.description}
                      </div>
                    )}
                  </div>
                </div>

                {/* Produtos */}
                <span className="truncate font-display text-[13px] font-semibold text-[var(--text-primary)]">
                  {productCount.toLocaleString("pt-BR")}
                </span>

                {/* Capacidades — pills truncadas */}
                <div className="flex min-w-0 flex-wrap items-center gap-1">
                  {activeCaps.length === 0 ? (
                    <span className="text-[11px] italic text-[var(--text-muted)]">—</span>
                  ) : (
                    <>
                      {activeCaps.slice(0, 2).map((c) => {
                        const meta = capabilityMeta(c.capabilityKey);
                        const Icon = meta.icon;
                        return (
                          <span
                            key={c.id}
                            className="inline-flex items-center gap-1 rounded-full border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] px-2 py-0.5 font-display text-[11px] font-bold text-[var(--text-secondary)]"
                          >
                            <Icon size={10} className="text-[var(--brand-secondary)]" />
                            {meta.short}
                          </span>
                        );
                      })}
                      {activeCaps.length > 2 && (
                        <span className="text-[11px] font-semibold text-[var(--text-muted)]">
                          +{activeCaps.length - 2}
                        </span>
                      )}
                    </>
                  )}
                </div>

                {/* Ações: editar / salvar-template / excluir */}
                <div className={LIST_ACTIONS_CELL_CLASS}>
                  <button
                    type="button"
                    onClick={() => setEditing(cat)}
                    aria-label={`Editar ${cat.name}`}
                    className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] text-[var(--brand-primary)] transition-colors hover:bg-[var(--color-primary-soft)]"
                  >
                    <IconPencil size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveTemplate(cat)}
                    aria-label={`Salvar ${cat.name} como template`}
                    disabled={templateMutation.isPending}
                    className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-strong)] hover:text-[var(--brand-primary)] disabled:opacity-50"
                  >
                    <IconBookmark size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(cat)}
                    aria-label={`Excluir ${cat.name}`}
                    disabled={cat.isDefault}
                    className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] hover:text-[var(--color-danger)] disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <IconTrash size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* WIZARD — criar */}
      <FormDialog
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        size="lg"
        title="Novo catálogo"
        description="Responda perguntas de negócio — o catálogo monta as capacidades para você."
      >
        <CatalogWizard
          onDone={(createdId) => {
            setWizardOpen(false);
            if (createdId) setNewProductCatalogId(createdId);
          }}
          onCancel={() => setWizardOpen(false)}
        />
      </FormDialog>

      {/* WIZARD — editar */}
      <FormDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        size="lg"
        title="Editar catálogo"
        description="Ajuste capacidades, modos e políticas de override deste catálogo."
      >
        {editing && (
          <CatalogWizard
            key={editing.id}
            catalog={editing}
            onDone={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
        )}
      </FormDialog>

      {/* Pós-criação: abre dialog de produto vinculado. */}
      <ProductDialog
        open={!!newProductCatalogId}
        onOpenChange={(o) => !o && setNewProductCatalogId(null)}
        productId={null}
        initialCatalogId={newProductCatalogId ?? undefined}
        onCreated={() => setNewProductCatalogId(null)}
      />

      {/* Dialog de exclusão individual */}
      <Dialog open={deleting !== null} onOpenChange={(next) => !next && setDeleting(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] text-[var(--color-danger)]">
                <IconAlertTriangle size={18} />
              </span>
              <DialogTitle className="text-base">Excluir catálogo?</DialogTitle>
            </div>
            <DialogDescription className="text-[13px] leading-relaxed">
              {deleting
                ? `"${deleting.name}" será removido. Os produtos ficarão sem catálogo.`
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

      {/* Dialog de exclusão em lote */}
      <Dialog open={confirmBulk} onOpenChange={(next) => !next && setConfirmBulk(false)}>
        <DialogContent size="sm">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] text-[var(--color-danger)]">
                <IconAlertTriangle size={18} />
              </span>
              <DialogTitle className="text-base">
                {`Excluir ${bulkableSelected.length === 1 ? "catálogo" : `${bulkableSelected.length} catálogos`}?`}
              </DialogTitle>
            </div>
            <DialogDescription className="text-[13px] leading-relaxed">
              Os catálogos selecionados serão removidos. Catálogos padrão são ignorados
              automaticamente.
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
              onClick={() => bulkDeleteMut.mutate(bulkableSelected)}
            >
              <IconTrash size={14} />{" "}
              {bulkDeleteMut.isPending ? "Excluindo..." : "Excluir"}
            </ButtonGlass>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
