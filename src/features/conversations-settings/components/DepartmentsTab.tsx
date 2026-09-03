"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  IconAlertTriangle,
  IconBuilding,
  IconHeadset,
  IconPhone,
  IconBriefcase,
  IconCurrencyDollar,
  IconUsers,
  IconDeviceLaptop,
  IconSpeakerphone,
  IconTruck,
  IconScale,
  IconShoppingCart,
  IconLifebuoy,
  IconClipboardList,
  IconStar,
  IconSettings,
  IconChartBar,
  IconMail,
  IconMessageCircle,
  IconTool,
  IconSchool,
  IconGlobe,
  IconHome,
  IconPlus,
  IconTrash,
  IconPencil,
  IconCheck,
  IconUserCheck,
  IconUserMinus,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { InputGlass } from "@/components/crm/input-glass";
import { ButtonGlass } from "@/components/crm/button-glass";
import { CheckboxGlass } from "@/components/crm/checkbox-glass";
import { SwitchGlass } from "@/components/crm/switch-glass";
import { KpiCard } from "@/components/crm/kpi-card";
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
import { useSettingsHeaderSlots } from "@/app/(app)/settings/_v2-shell";
import { PageTourButton } from "@/features/product-tour";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormDialog } from "@/components/ui/form-dialog";
import { apiUrl } from "@/lib/api";
import {
  useDepartments,
  useCreateDepartment,
  useUpdateDepartment,
  useDeleteDepartment,
  type Department,
} from "../hooks/use-departments";
import {
  useDepartmentMembers,
  useSetDepartmentMembers,
} from "../hooks/use-department-members";
import { useTeamUsers } from "@/features/pipeline-v2/hooks/use-deal-mutations";

// ─── Types & helpers ──────────────────────────────────────────────────────────

type SortField = "name" | "members" | "conversations" | "createdAt";
type DeleteResult = { ok: true } | { ok: false; status: number; message: string };

const LIST_GRID = "32px minmax(0,1fr) 100px 140px 120px max-content";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

async function deleteDeptRaw(id: string): Promise<DeleteResult> {
  const res = await fetch(apiUrl(`/api/settings/departments/${id}`), {
    method: "DELETE",
    credentials: "include",
  });
  if (res.ok) return { ok: true };
  const data = await res.json().catch(() => ({}));
  return {
    ok: false,
    status: res.status,
    message: (data as { message?: string }).message ?? "Erro ao excluir departamento",
  };
}

// ─── Icon registry ────────────────────────────────────────────────────────────

type IconComponent = React.ComponentType<{
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
}>;

const ICON_REGISTRY: Record<string, IconComponent> = {
  IconBuilding, IconHeadset, IconPhone, IconBriefcase, IconCurrencyDollar,
  IconUsers, IconDeviceLaptop, IconSpeakerphone, IconTruck, IconScale,
  IconShoppingCart, IconLifebuoy, IconClipboardList, IconStar, IconSettings,
  IconChartBar, IconMail, IconMessageCircle, IconTool, IconSchool,
  IconGlobe, IconHome,
};

const DEPT_ICONS: { name: string; label: string }[] = [
  { name: "IconHeadset",        label: "Atendimento" },
  { name: "IconPhone",          label: "SAC" },
  { name: "IconBriefcase",      label: "Comercial" },
  { name: "IconCurrencyDollar", label: "Financeiro" },
  { name: "IconUsers",          label: "RH" },
  { name: "IconDeviceLaptop",   label: "TI" },
  { name: "IconSpeakerphone",   label: "Marketing" },
  { name: "IconTruck",          label: "Logística" },
  { name: "IconScale",          label: "Jurídico" },
  { name: "IconShoppingCart",   label: "Compras" },
  { name: "IconLifebuoy",       label: "Suporte" },
  { name: "IconClipboardList",  label: "Projetos" },
  { name: "IconStar",           label: "Qualidade" },
  { name: "IconSettings",       label: "Operações" },
  { name: "IconBuilding",       label: "Geral" },
  { name: "IconChartBar",       label: "Análise" },
  { name: "IconMail",           label: "E-mail" },
  { name: "IconMessageCircle",  label: "Chat" },
  { name: "IconTool",           label: "Manutenção" },
  { name: "IconSchool",         label: "Treinamento" },
  { name: "IconGlobe",          label: "Internacional" },
  { name: "IconHome",           label: "Administrativo" },
];

const DEPT_COLORS = [
  "#6366f1", "#2563eb", "#7c3aed", "#db2777", "#dc2626",
  "#ea580c", "#ca8a04", "#16a34a", "#0d9488", "#0891b2",
  "#6b7280", "#334155",
];

function DeptIcon({
  name,
  size = 16,
  color,
  className,
}: {
  name: string;
  size?: number;
  color?: string;
  className?: string;
}) {
  const Comp = ICON_REGISTRY[name] ?? IconBuilding;
  return <Comp size={size} strokeWidth={1.75} className={className} style={color ? { color } : undefined} />;
}

function DeptIconBadge({ dept, size = 36 }: { dept: Department; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-[var(--radius-md)]"
      style={{ width: size, height: size, backgroundColor: dept.color + "18" }}
    >
      <DeptIcon name={dept.icon ?? "IconBuilding"} size={size * 0.45} color={dept.color} />
    </div>
  );
}

// ─── Create modal ─────────────────────────────────────────────────────────────

export function CreateDepartmentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState(DEPT_COLORS[0]);
  const [iconName, setIconName] = React.useState(DEPT_ICONS[0].name);
  const createMutation = useCreateDepartment();

  function reset() { setName(""); setColor(DEPT_COLORS[0]); setIconName(DEPT_ICONS[0].name); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate({ name: name.trim(), color, icon: iconName }, {
      onSuccess: () => { toast.success("Departamento criado"); reset(); onClose(); },
      onError: (err: Error) => toast.error(err.message),
    });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}
      busy={createMutation.isPending}
      size="lg"
      icon={<DeptIcon name={iconName} size={20} color={color} />}
      title="Novo departamento"
      description={name.trim() || undefined}
      headerAccessory={<PageTourButton tourId="team-department-create" size="sm" />}
      footer={
        <>
          <button
            type="button"
            onClick={() => { reset(); onClose(); }}
            className="rounded-[var(--radius-md)] border border-[var(--glass-border)] px-4 py-1.5 font-display text-[13px] font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-overlay)]"
          >
            Cancelar
          </button>
          <ButtonGlass
            type="submit"
            form="new-dept-form"
            variant="primary"
            disabled={!name.trim() || createMutation.isPending}
            data-tour="dept-create-submit"
          >
            {createMutation.isPending ? "Criando…" : "Criar"}
          </ButtonGlass>
        </>
      }
    >
      <form id="new-dept-form" onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div data-tour="dept-create-name">
          <label className="mb-1.5 block font-display text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Nome
          </label>
          <InputGlass
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Suporte, Vendas, Financeiro…"
            autoFocus
          />
        </div>

        <div data-tour="dept-create-icon">
          <label className="mb-1.5 block font-display text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Ícone
          </label>
          <div className="grid grid-cols-11 gap-1 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] p-2">
            {DEPT_ICONS.map(({ name: ic, label }) => (
              <button
                key={ic}
                type="button"
                title={label}
                onClick={() => setIconName(ic)}
                className={cn(
                  "flex h-8 w-full items-center justify-center rounded-[var(--radius-sm)] transition-all",
                  iconName === ic
                    ? "bg-[var(--brand-primary)]/12 ring-1 ring-[var(--brand-primary)]/40"
                    : "hover:bg-[var(--glass-bg-strong)]",
                )}
              >
                <DeptIcon
                  name={ic}
                  size={17}
                  color={iconName === ic ? color : undefined}
                  className={iconName === ic ? undefined : "text-[var(--text-muted)]"}
                />
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-center font-body text-[11px] text-[var(--text-muted)]">
            {DEPT_ICONS.find((i) => i.name === iconName)?.label}
          </p>
        </div>

        <div data-tour="dept-create-color">
          <label className="mb-1.5 block font-display text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Cor
          </label>
          <div className="flex flex-wrap gap-2 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-3 py-2.5">
            {DEPT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={cn(
                  "relative size-6 rounded-full transition-all hover:scale-110",
                  color === c && "scale-110 ring-2 ring-offset-2",
                )}
                style={{ backgroundColor: c, ...(color === c ? { ringColor: c } : {}) }}
                aria-label={c}
              >
                {color === c && <IconCheck size={12} strokeWidth={3} className="absolute inset-0 m-auto text-white" />}
              </button>
            ))}
          </div>
        </div>
      </form>
    </FormDialog>
  );
}

// ─── Edit modal ───────────────────────────────────────────────────────────────

function EditDepartmentModal({ dept, onClose }: { dept: Department | null; onClose: () => void }) {
  const [name, setName] = React.useState(dept?.name ?? "");
  const [icon, setIcon] = React.useState(dept?.icon ?? "IconBuilding");
  const [color, setColor] = React.useState(dept?.color ?? "#6366f1");
  const [isSupport, setIsSupport] = React.useState(dept?.isSupport ?? false);
  const [distributionEnabled, setDistributionEnabled] = React.useState(
    dept?.distributionEnabled ?? false,
  );
  const updateMutation = useUpdateDepartment();
  const setMembersMutation = useSetDepartmentMembers();

  const { data: orgUsers = [] } = useTeamUsers(!!dept);
  const { data: currentMembers = [] } = useDepartmentMembers(dept?.id ?? null);

  const [memberIds, setMemberIds] = React.useState<Set<string>>(new Set());
  const [memberSearch, setMemberSearch] = React.useState("");

  React.useEffect(() => {
    if (dept) { setName(dept.name); setIcon(dept.icon); setColor(dept.color); setIsSupport(dept.isSupport ?? false); setDistributionEnabled(dept.distributionEnabled ?? false); setMemberSearch(""); }
  }, [dept?.id]);

  // Stable key prevents infinite re-render loop when currentMembers reference changes.
  const membersKey = currentMembers.map((m) => m.user.id).sort().join(",");
  React.useEffect(() => {
    setMemberIds(new Set(membersKey ? membersKey.split(",") : []));
  }, [membersKey]);

  const filteredUsers = React.useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    const list = [...orgUsers].sort((a, b) => a.name.localeCompare(b.name));
    if (!q) return list;
    return list.filter(
      (u) => u.name.toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q),
    );
  }, [orgUsers, memberSearch]);

  function toggleMember(id: string) {
    setMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const saving = updateMutation.isPending || setMembersMutation.isPending;

  function handleSave() {
    if (!dept) return;
    const deptId = dept.id;
    updateMutation.mutate(
      { id: deptId, name: name.trim(), icon, color, isSupport, distributionEnabled },
      {
        onSuccess: () => {
          setMembersMutation.mutate(
            { departmentId: deptId, userIds: [...memberIds] },
            { onSuccess: () => onClose(), onError: () => onClose() },
          );
        },
      },
    );
  }

  return (
    <FormDialog
      open={!!dept}
      onOpenChange={(v) => { if (!v) onClose(); }}
      busy={saving}
      size="xl"
      icon={dept ? <DeptIcon name={icon} size={20} color={color} /> : undefined}
      title="Editar departamento"
      description={dept?.name}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--radius-md)] border border-[var(--glass-border)] px-4 py-1.5 font-display text-[13px] font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-overlay)]"
          >
            Cancelar
          </button>
          <ButtonGlass type="button" variant="primary" disabled={!name.trim() || saving} onClick={handleSave}>
            {saving ? "Salvando…" : "Salvar"}
          </ButtonGlass>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block font-display text-[12px] font-semibold text-[var(--text-muted)]">Nome</label>
          <InputGlass value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do departamento" />
        </div>

        <div>
          <label className="mb-2 block font-display text-[12px] font-semibold text-[var(--text-muted)]">Ícone</label>
          <div className="grid grid-cols-6 gap-1.5 rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] p-2.5">
            {DEPT_ICONS.map(({ name: n, label }) => (
              <button
                key={n}
                type="button"
                title={label}
                onClick={() => setIcon(n)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-[var(--radius-md)] px-1 py-2 transition-all",
                  icon === n
                    ? "bg-[var(--brand-primary)]/10 ring-1 ring-[var(--brand-primary)]"
                    : "hover:bg-[var(--glass-bg-strong)]",
                )}
              >
                <DeptIcon name={n} size={16} color={icon === n ? color : "var(--text-muted)"} />
                <span className="text-center font-body text-[9px] leading-tight text-[var(--text-muted)]">
                  {label}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-2 block font-display text-[12px] font-semibold text-[var(--text-muted)]">Cor</label>
          <div className="flex flex-wrap gap-2">
            {DEPT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={cn(
                  "h-7 w-7 rounded-full transition-transform hover:scale-110",
                  color === c && "ring-2 ring-offset-1 ring-[var(--brand-primary)] scale-110",
                )}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>

        <div className="flex items-start justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-3.5 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <IconLifebuoy size={15} className="text-[var(--brand-primary)]" />
              <span className="font-display text-[12.5px] font-semibold text-[var(--text-primary)]">
                Departamento de suporte
              </span>
            </div>
            <p className="mt-0.5 text-[11.5px] leading-snug text-[var(--text-muted)]">
              Recebe os chamados do chat interno de suporte. Apenas um
              departamento pode ter isso ativo.
            </p>
          </div>
          <SwitchGlass
            checked={isSupport}
            onChange={setIsSupport}
            aria-label="Departamento de suporte"
          />
        </div>

        <div className="flex items-start justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-3.5 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <IconUserCheck size={15} className="text-[var(--brand-primary)]" />
              <span className="font-display text-[12.5px] font-semibold text-[var(--text-primary)]">
                Distribuição por departamento
              </span>
            </div>
            <p className="mt-0.5 text-[11.5px] leading-snug text-[var(--text-muted)]">
              Leads roteados para este departamento são distribuídos apenas
              entre seus membros elegíveis (a regra individual de cada um
              continua valendo). Se desligado, este departamento não recebe
              distribuição automática.
            </p>
          </div>
          <SwitchGlass
            checked={distributionEnabled}
            onChange={setDistributionEnabled}
            aria-label="Distribuição por departamento"
          />
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2">
            <label className="font-display text-[12px] font-semibold text-[var(--text-muted)]">Membros</label>
            {memberIds.size > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--brand-primary)]/10 px-1.5 font-display text-[10px] font-bold text-[var(--brand-primary)]">
                {memberIds.size}
              </span>
            )}
          </div>

          <div className="mb-2">
            <InputGlass
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Buscar usuário por nome ou e-mail…"
              withSearch
            />
          </div>

          {orgUsers.length === 0 ? (
            <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-4 py-4 text-center">
              <IconUsers size={16} className="mx-auto mb-1 text-[var(--text-muted)] opacity-40" />
              <p className="font-body text-[12px] text-[var(--text-muted)]">Nenhum usuário na organização.</p>
            </div>
          ) : (
            <div className="max-h-[240px] overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)]">
              <div className="flex flex-col divide-y divide-[var(--glass-border-subtle)]">
                {filteredUsers.map((u) => {
                  const isSelected = memberIds.has(u.id);
                  const roleLabel =
                    u.role === "ADMIN" ? "Admin" : u.role === "MANAGER" ? "Gerente" : "Atendente";
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleMember(u.id)}
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors",
                        isSelected ? "bg-[var(--brand-primary)]/8" : "hover:bg-[var(--glass-bg-strong)]",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border transition-colors",
                          isSelected
                            ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white"
                            : "border-[var(--glass-border)] bg-white",
                        )}
                      >
                        {isSelected && <IconCheck size={13} />}
                      </span>
                      {u.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={u.avatarUrl} alt={u.name} className="h-8 w-8 shrink-0 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)]/15 font-display text-[12px] font-bold text-[var(--brand-primary)]">
                          {u.name.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-[13px] font-semibold text-[var(--text-primary)]">
                          {u.name}
                        </span>
                        <span className="block truncate font-body text-[11px] text-[var(--text-muted)]">
                          {u.email}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 font-display text-[10px] font-semibold",
                          u.role === "ADMIN"
                            ? "bg-violet-100 text-violet-700"
                            : u.role === "MANAGER"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-slate-100 text-slate-600",
                        )}
                      >
                        {roleLabel}
                      </span>
                    </button>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <div className="px-3 py-4 text-center font-body text-[12px] text-[var(--text-muted)]">
                    Nenhum usuário encontrado.
                  </div>
                )}
              </div>
            </div>
          )}
          <p className="mt-1.5 font-body text-[11px] text-[var(--text-muted)]">
            O vínculo define a composição do time. Não altera o acesso à caixa de entrada (isso é configurado em
            Permissões).
          </p>
        </div>
      </div>
    </FormDialog>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DepartmentsTab({ tabsSlot }: { tabsSlot?: React.ReactNode } = {}) {
  const { data: departments = [], isLoading } = useDepartments();
  const deleteMut = useDeleteDepartment();
  const queryClient = useQueryClient();
  const headerSlots = useSettingsHeaderSlots();

  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<"all" | "with" | "without">("all");
  const [showCreate, setShowCreate] = React.useState(false);
  const [deleting, setDeleting] = React.useState<Department | null>(null);
  const [editTarget, setEditTarget] = React.useState<Department | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = React.useState(false);
  const [sortBy, setSortBy] = React.useState<SortField>("name");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");

  const bulkDeleteMut = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.all(ids.map(deleteDeptRaw));
      const failures = results.filter((r): r is { ok: false; status: number; message: string } => !r.ok);
      return {
        ok: results.length - failures.length,
        fail409: failures.filter((r) => r.status === 409).length,
        failOther: failures.filter((r) => r.status !== 409).length,
      };
    },
    onSuccess: ({ ok, fail409, failOther }) => {
      queryClient.invalidateQueries({ queryKey: ["settings", "departments"] });
      setSelected(new Set());
      setConfirmBulk(false);
      const fail = fail409 + failOther;
      if (fail === 0) {
        toast.success(ok === 1 ? "Departamento removido." : `${ok} departamentos removidos.`);
      } else if (ok === 0 && fail409 > 0) {
        toast.error("Nenhum departamento excluído — todos têm conversas abertas.");
      } else if (ok === 0) {
        toast.error("Não foi possível remover os departamentos selecionados.");
      } else {
        const parts: string[] = [`${ok} removido${ok !== 1 ? "s" : ""}`];
        if (fail409 > 0) parts.push(`${fail409} com conversas abertas`);
        if (failOther > 0) parts.push(`${failOther} com falha`);
        toast.error(parts.join(", ") + ".");
      }
    },
  });

  const stats = React.useMemo(() => {
    let members = 0;
    let conversations = 0;
    let withMembers = 0;
    for (const d of departments) {
      const m = d._count?.members ?? 0;
      members += m;
      conversations += d._count?.conversations ?? 0;
      if (m > 0) withMembers += 1;
    }
    return {
      total: departments.length,
      members,
      conversations,
      withMembers,
      withoutMembers: departments.length - withMembers,
    };
  }, [departments]);

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase().trim();
    return departments.filter((d) => {
      if (q && !d.name.toLowerCase().includes(q)) return false;
      const m = d._count?.members ?? 0;
      if (filter === "with" && m === 0) return false;
      if (filter === "without" && m > 0) return false;
      return true;
    });
  }, [departments, search, filter]);

  const sorted = React.useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "name":
          cmp = a.name.localeCompare(b.name, "pt-BR");
          break;
        case "members":
          cmp = (a._count?.members ?? 0) - (b._count?.members ?? 0);
          break;
        case "conversations":
          cmp = (a._count?.conversations ?? 0) - (b._count?.conversations ?? 0);
          break;
        case "createdAt":
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortBy, sortDir]);

  React.useEffect(() => {
    setSelected(new Set());
  }, [search, filter]);

  const allChecked = sorted.length > 0 && sorted.every((d) => selected.has(d.id));
  const someChecked = sorted.some((d) => selected.has(d.id));

  const toggleAll = React.useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (sorted.every((d) => next.has(d.id))) sorted.forEach((d) => next.delete(d.id));
      else sorted.forEach((d) => next.add(d.id));
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

  const searchNode = React.useMemo(
    () => (
      <div data-tour="team-dept-search" className="relative w-full">
        <SettingsListFilterBar
          search={search}
          onSearch={setSearch}
          placeholder="Buscar departamento…"
          ariaLabel="Buscar departamentos"
          groups={[
            {
              key: "membership",
              label: "Membros",
              options: [
                { value: "all", label: "Todos", count: stats.total },
                { value: "with", label: "Com membros", count: stats.withMembers },
                { value: "without", label: "Sem membros", count: stats.withoutMembers },
              ],
              value: filter,
              onChange: (v) => setFilter(v as "all" | "with" | "without"),
            },
          ]}
          onClearAll={() => { setSearch(""); setFilter("all"); }}
          popoverTitle="Filtrar por membros"
        />
      </div>
    ),
    [search, filter, stats.total, stats.withMembers, stats.withoutMembers],
  );

  const actionsNode = React.useMemo(
    () => (
      <div className="flex items-center gap-2">
        <PageTourButton tourId="team-departments" />
        {tabsSlot}
        <div data-tour="team-dept-actions" className="flex shrink-0">
          <PageActionsMenu
            items={[
              {
                icon: <IconPlus size={14} stroke={2.6} />,
                label: "Criar departamento",
                onClick: () => setShowCreate(true),
                primary: true,
                tourId: "team-dept-new-item",
              },
            ]}
          />
        </div>
      </div>
    ),
    [tabsSlot],
  );

  React.useEffect(() => {
    if (!headerSlots) return;
    headerSlots.setCenter(searchNode);
    headerSlots.setActions(actionsNode);
    return () => {
      headerSlots.setCenter(null);
      headerSlots.setActions(null);
    };
  }, [headerSlots, searchNode, actionsNode]);

  return (
    <div className="flex w-full min-w-0 flex-col gap-3.5">
      {/* KPI mini-dash */}
      <div data-tour="team-dept-kpis">
      <KpiStrip aria-label="Indicadores de departamentos">
        <KpiCard
          label="Departamentos"
          value={stats.total.toLocaleString("pt-BR")}
          icon={<IconBuilding size={20} stroke={2.2} />}
          tone="brand"
        />
        <KpiCard
          label="Membros vinculados"
          value={stats.members.toLocaleString("pt-BR")}
          icon={<IconUsers size={20} stroke={2.2} />}
          tone="violet"
        />
        <KpiCard
          label="Conversas abertas"
          value={stats.conversations.toLocaleString("pt-BR")}
          icon={<IconMessageCircle size={20} stroke={2.2} />}
          tone="success"
        />
        <KpiCard
          label="Com membros"
          value={stats.withMembers.toLocaleString("pt-BR")}
          icon={<IconUserCheck size={20} stroke={2.2} />}
          tone="warning"
          active={filter === "with"}
          onClick={() => setFilter((prev) => (prev === "with" ? "all" : "with"))}
        />
        <KpiCard
          label="Sem membros"
          value={stats.withoutMembers.toLocaleString("pt-BR")}
          icon={<IconUserMinus size={20} stroke={2.2} />}
          tone="neutral"
          active={filter === "without"}
          onClick={() => setFilter((prev) => (prev === "without" ? "all" : "without"))}
        />
      </KpiStrip>
      </div>

      {/* Bulk-delete bar */}
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

      {/* Table */}
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
          <IconBuilding size={40} className="text-[var(--text-muted)] opacity-40" />
          <p className="text-sm text-[var(--text-muted)]">
            {search || filter !== "all" ? "Nenhum resultado encontrado." : "Nenhum departamento cadastrado."}
          </p>
          {!search && filter === "all" && (
            <ButtonGlass variant="glass" size="sm" onClick={() => setShowCreate(true)}>
              <IconPlus size={14} /> Criar primeiro
            </ButtonGlass>
          )}
        </div>
      ) : (
        <div data-tour="team-dept-list">
        <MobileTableScroll minWidth={780}>
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
            <SortableHeader label="Nome" sort={dirFor("name")} onSort={() => toggleSort("name")} />
            <SortableHeader label="Membros" sort={dirFor("members")} onSort={() => toggleSort("members")} />
            <SortableHeader
              label="Conversas abertas"
              sort={dirFor("conversations")}
              onSort={() => toggleSort("conversations")}
            />
            <SortableHeader label="Criado em" sort={dirFor("createdAt")} onSort={() => toggleSort("createdAt")} />
            <ListColumnLabel align="right">Ações</ListColumnLabel>
          </div>

          {sorted.map((dept) => {
            const isSelected = selected.has(dept.id);
            const members = dept._count?.members ?? 0;
            const conversations = dept._count?.conversations ?? 0;
            return (
              <div
                key={dept.id}
                style={{ gridTemplateColumns: LIST_GRID }}
                className={cn(
                  "group grid items-center gap-3 rounded-[var(--radius-xl)] border px-4 py-3 shadow-[var(--glass-shadow-sm)] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:shadow-[var(--glass-shadow)]",
                  isSelected
                    ? "border-[var(--brand-primary)] bg-[var(--color-primary-soft)]"
                    : "border-[var(--glass-border)] bg-[var(--glass-bg-base)] hover:border-[var(--input-border-focus)]",
                )}
              >
                <span>
                  <CheckboxGlass
                    checked={isSelected}
                    onChange={() => toggleOne(dept.id)}
                    aria-label={`Selecionar ${dept.name}`}
                  />
                </span>

                <div className="flex min-w-0 items-center gap-2.5">
                  <DeptIconBadge dept={dept} size={36} />
                  <button
                    type="button"
                    onClick={() => setEditTarget(dept)}
                    className="block max-w-full truncate text-left font-display text-[14px] font-bold text-[var(--text-primary)] transition-colors hover:text-[var(--brand-primary)]"
                  >
                    {dept.name}
                  </button>
                </div>

                <span className="truncate font-display text-[13px] text-[var(--text-secondary)]">
                  {members.toLocaleString("pt-BR")}
                </span>

                <span className="truncate font-display text-[13px] text-[var(--text-secondary)]">
                  {conversations.toLocaleString("pt-BR")}
                </span>

                <span className="truncate font-body text-[12px] text-[var(--text-muted)]">
                  {formatDate(dept.createdAt)}
                </span>

                <div className={LIST_ACTIONS_CELL_CLASS}>
                  <button
                    type="button"
                    onClick={() => setEditTarget(dept)}
                    aria-label={`Editar ${dept.name}`}
                    className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] text-[var(--brand-primary)] transition-colors hover:bg-[var(--color-primary-soft)]"
                  >
                    <IconPencil size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(dept)}
                    aria-label={`Excluir ${dept.name}`}
                    className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] hover:text-[var(--color-danger)]"
                  >
                    <IconTrash size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </MobileTableScroll>
        </div>
      )}

      <CreateDepartmentModal open={showCreate} onClose={() => setShowCreate(false)} />
      <EditDepartmentModal dept={editTarget} onClose={() => setEditTarget(null)} />

      {/* Single delete dialog */}
      <Dialog open={deleting !== null} onOpenChange={(next) => !next && setDeleting(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] text-[var(--color-danger)]">
                <IconAlertTriangle size={18} />
              </span>
              <DialogTitle className="text-base">Excluir departamento?</DialogTitle>
            </div>
            <DialogDescription className="text-[13px] leading-relaxed">
              {deleting
                ? `"${deleting.name}" será removido permanentemente. Esta ação não pode ser desfeita.`
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
              onClick={() => {
                if (!deleting) return;
                deleteMut.mutate(deleting.id, {
                  onSuccess: () => {
                    toast.success("Departamento excluído.");
                    setDeleting(null);
                  },
                  onError: (err) => {
                    toast.error(err instanceof Error ? err.message : "Erro ao excluir departamento.");
                    setDeleting(null);
                  },
                });
              }}
            >
              <IconTrash size={14} /> {deleteMut.isPending ? "Excluindo..." : "Excluir"}
            </ButtonGlass>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk delete dialog */}
      <Dialog open={confirmBulk} onOpenChange={(next) => !next && setConfirmBulk(false)}>
        <DialogContent size="sm">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] text-[var(--color-danger)]">
                <IconAlertTriangle size={18} />
              </span>
              <DialogTitle className="text-base">
                {`Excluir ${selected.size === 1 ? "departamento" : `${selected.size} departamentos`}?`}
              </DialogTitle>
            </div>
            <DialogDescription className="text-[13px] leading-relaxed">
              Departamentos com conversas abertas não poderão ser excluídos e serão sinalizados no resultado.
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
