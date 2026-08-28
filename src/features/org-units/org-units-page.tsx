"use client";

/**
 * Admin CRUD de Unidades (OrgUnit). Unidades representam filiais/CNPJs da
 * organização e são referenciadas por ProductOffer (preço por unidade) e
 * DiscountQuota (alocação de volume por unidade).
 */
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconBuilding,
  IconLoader2,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ButtonGlass } from "@/components/crm/button-glass";
import { PageActionsMenu } from "@/components/crm/page-toolbar";
import { SettingsListFilterBar } from "@/components/crm/settings-filter-bar";
import { useSettingsHeaderSlots } from "@/app/(app)/settings/_v2-shell";
import { apiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

type OrgUnit = {
  id: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  address: string | null;
  active: boolean;
  parentId: string | null;
};

async function fetchUnits(): Promise<OrgUnit[]> {
  const res = await fetch(apiUrl(`/api/org-units?active=false`));
  if (!res.ok) throw new Error("Erro ao carregar unidades");
  const data = (await res.json()) as { orgUnits: OrgUnit[] };
  return data.orgUnits;
}

const LIST_GRID = "minmax(0,1.4fr) minmax(0,1fr) 140px 90px 90px";

export function OrgUnitsPage() {
  const slots = useSettingsHeaderSlots();
  const [search, setSearch] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<OrgUnit | null>(null);
  const queryClient = useQueryClient();

  const { data: units = [], isLoading } = useQuery({
    queryKey: ["org-units", "all"],
    queryFn: fetchUnits,
  });

  const deactivateMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(apiUrl(`/api/org-units/${id}`), {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Erro ao desativar");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-units"] });
      queryClient.invalidateQueries({ queryKey: ["quotas-org-units"] });
      toast.success("Unidade desativada.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const filtered = React.useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return units;
    return units.filter(
      (u) =>
        u.name.toLowerCase().includes(s) ||
        (u.legalName ?? "").toLowerCase().includes(s) ||
        (u.taxId ?? "").toLowerCase().includes(s),
    );
  }, [units, search]);

  const openCreate = React.useCallback(() => {
    setEditing(null);
    setDialogOpen(true);
  }, []);

  const openEdit = React.useCallback((unit: OrgUnit) => {
    setEditing(unit);
    setDialogOpen(true);
  }, []);

  const searchNode = React.useMemo(
    () => (
      <SettingsListFilterBar
        search={search}
        onSearch={setSearch}
        placeholder="Buscar unidades…"
        ariaLabel="Buscar unidades"
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
            label: "Nova unidade",
            onClick: openCreate,
            primary: true,
          },
        ]}
      />
    ),
    [openCreate],
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
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-[64px] animate-pulse rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)]"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg-base)] py-16">
          <IconBuilding size={40} className="text-[var(--text-muted)] opacity-40" />
          <p className="text-sm text-[var(--text-muted)]">
            Nenhuma unidade cadastrada.
          </p>
          <ButtonGlass variant="glass" size="sm" onClick={openCreate}>
            <IconPlus size={14} /> Criar primeira unidade
          </ButtonGlass>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-2">
          <div
            className="grid gap-3 px-4 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]"
            style={{ gridTemplateColumns: LIST_GRID }}
          >
            <span>Unidade</span>
            <span>Razão social / endereço</span>
            <span>CNPJ / doc</span>
            <span>Status</span>
            <span className="text-right">Ações</span>
          </div>
          {filtered.map((u) => (
            <div
              key={u.id}
              style={{ gridTemplateColumns: LIST_GRID }}
              className={cn(
                "group grid items-center gap-3 rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-4 py-3 shadow-[var(--glass-shadow-sm)] transition-all hover:border-[var(--input-border-focus)]",
                !u.active && "opacity-60",
              )}
            >
              <div className="min-w-0">
                <div className="truncate font-display text-[14px] font-bold text-[var(--text-primary)]">
                  {u.name}
                </div>
              </div>
              <div className="min-w-0 text-[12px] text-[var(--text-secondary)]">
                <div className="truncate">{u.legalName ?? "—"}</div>
                <div className="truncate text-[11px] text-[var(--text-muted)]">
                  {u.address ?? ""}
                </div>
              </div>
              <span className="truncate font-body text-[12px] text-[var(--text-secondary)]">
                {u.taxId ?? "—"}
              </span>
              <span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 font-display text-[11px] font-bold",
                    u.active
                      ? "bg-[var(--color-success-bg)] text-[var(--color-success)]"
                      : "bg-[var(--glass-bg-overlay)] text-[var(--text-muted)]",
                  )}
                >
                  {u.active ? "Ativa" : "Inativa"}
                </span>
              </span>
              <div className="flex items-center justify-end gap-1">
                <button
                  type="button"
                  onClick={() => openEdit(u)}
                  aria-label={`Editar ${u.name}`}
                  className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] text-[var(--brand-primary)] transition-colors hover:bg-[var(--color-primary-soft)]"
                >
                  <IconPencil size={15} />
                </button>
                {u.active && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Desativar unidade "${u.name}"?`))
                        deactivateMut.mutate(u.id);
                    }}
                    aria-label={`Desativar ${u.name}`}
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

      <OrgUnitDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        unit={editing}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["org-units"] });
          queryClient.invalidateQueries({ queryKey: ["quotas-org-units"] });
        }}
      />
    </div>
  );
}

export function OrgUnitDialog({
  open,
  onOpenChange,
  unit,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  unit: OrgUnit | null;
  onSaved: () => void;
}) {
  const isEdit = Boolean(unit);
  const [name, setName] = React.useState("");
  const [legalName, setLegalName] = React.useState("");
  const [taxId, setTaxId] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [active, setActive] = React.useState(true);

  React.useEffect(() => {
    if (!open) return;
    if (unit) {
      setName(unit.name);
      setLegalName(unit.legalName ?? "");
      setTaxId(unit.taxId ?? "");
      setAddress(unit.address ?? "");
      setActive(unit.active);
    } else {
      setName("");
      setLegalName("");
      setTaxId("");
      setAddress("");
      setActive(true);
    }
  }, [open, unit]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        legalName: legalName || null,
        taxId: taxId || null,
        address: address || null,
        active,
      };
      const url = unit ? `/api/org-units/${unit.id}` : `/api/org-units`;
      const method = unit ? "PUT" : "POST";
      const res = await fetch(apiUrl(url), {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message || "Erro ao salvar unidade");
      }
    },
    onSuccess: () => {
      onSaved();
      toast.success(isEdit ? "Unidade atualizada." : "Unidade criada.");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={isEdit ? "Editar unidade" : "Nova unidade"}
      description="Filiais/CNPJs onde os produtos e cotas podem ter preço e volume próprios."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {isEdit ? "Fechar" : "Cancelar"}
          </Button>
          <Button
            onClick={() => saveMut.mutate()}
            disabled={!name.trim() || saveMut.isPending}
          >
            {saveMut.isPending && (
              <IconLoader2 size={14} className="mr-1.5 animate-spin" />
            )}
            {isEdit ? "Salvar" : "Criar"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <Label>Nome *</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1"
            placeholder="Ex.: Barra Funda"
          />
        </div>
        <div>
          <Label>Razão social</Label>
          <Input
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            className="mt-1"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>CNPJ / doc</Label>
            <Input
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="size-4 rounded accent-[var(--brand-primary)]"
              />
              Ativa
            </label>
          </div>
        </div>
        <div>
          <Label>Endereço</Label>
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="mt-1"
          />
        </div>
      </div>
    </FormDialog>
  );
}
