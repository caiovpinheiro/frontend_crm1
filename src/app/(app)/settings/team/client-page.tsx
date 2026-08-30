"use client";

import { apiUrl } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  IconKey,
  IconMail,
  IconPencil,
  IconPlus,
  IconShield,
  IconTrash,
  IconUserPlus,
  IconUsers,
} from "@tabler/icons-react";
import { IconEye as Eye, IconEyeOff as EyeOff, IconKey as KeyRound, IconLoader2 as Loader2, IconTrash as Trash2 } from "@tabler/icons-react";
import { useSession } from "next-auth/react";
import * as React from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormDialog } from "@/components/ui/form-dialog";
import { InputGlass } from "@/components/crm/input-glass";
import { ButtonGlass } from "@/components/crm/button-glass";
import { GlassCard } from "@/components/crm/glass-card";
import { MobileTableScroll } from "@/components/crm/mobile-table-scroll";
import { SwitchGlass } from "@/components/crm/switch-glass";
import { CheckboxGlass } from "@/components/crm/checkbox-glass";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import { LIST_PAGE_PANE_CLASS, PaginationGlass } from "@/components/crm/pagination-glass";
import { PageActionsMenu, PageSegmentedControl } from "@/components/crm/page-toolbar";
import {
  SettingsListFilterBar,
  type SettingsFilterGroup,
} from "@/components/crm/settings-filter-bar";
import { DataView, DataRow } from "@/components/automations/data-view";
import { ViewToggle, useCardsTableView } from "@/components/automations/view-toggle";
import {
  LIST_ACTIONS_CELL_CLASS,
  ListColumnLabel,
  SortableHeader,
  type SortDir,
} from "@/components/crm/sortable-header";
import { UserAvatar } from "@/components/crm/user-avatar";
import { ExpedienteTab } from "@/features/legacy-v1/settings/schedules";
import { DepartmentsTab } from "@/features/conversations-settings/components/DepartmentsTab";
import { useSearchParams } from "next/navigation";
import { AppLoading } from "@/components/crm/app-loading";
import { cn } from "@/lib/utils";
import {
  CRM_ACTION_KEYS,
  CRM_ACTION_LABELS,
  type CrmActionKey,
  setCrmActionGrantsForUser,
} from "@/lib/permissions";

import { useRoles } from "@/features/permissions/hooks";
import {
  TEAM_USERS_QUERY_PREFIX,
  useTeamUsersQuery,
} from "@/features/shared/queries/team-users";
import { useIsDesktop } from "@/hooks/use-media-query";

import {
  SETTINGS_HUB_BACK,
  SettingsV2Shell,
  useSettingsHeaderSlots,
} from "../_v2-shell";
import { TelephonyToggle } from "@/features/telephony/telephony-toggle";
import { EditUserDialog } from "./edit-user-dialog";

type UserRole = "ADMIN" | "MANAGER" | "MEMBER";

type AssignedRole = { id: string; name: string; systemPreset: string | null };

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string | null;
  phone?: string | null;
  assignedRoles?: AssignedRole[];
};

type CrmPermissionDraft = Record<CrmActionKey, boolean>;

const DEFAULT_PER_PAGE = 25;

/** Grid da lista de usuários: [check] | Usuário | E-mail | Função | Telefonia | Ações */
const USER_LIST_GRID = "32px minmax(0,1.5fr) minmax(0,1.3fr) 200px 104px max-content";

const DEFAULT_INVITE_PERMISSIONS: CrmPermissionDraft = {
  editLeads: true,
  runAutomations: true,
  assignOwner: true,
};

/** Classes do badge de função (espelha o HTML de referência DS v2). */
function roleBadgeClass(isAdminRole: boolean): string {
  return isAdminRole
    ? "border-transparent bg-[var(--color-enterprise-bg,rgba(91,111,245,0.15))] text-[var(--brand-primary-dark,#3d52e8)]"
    : "border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-muted)]";
}

/**
 * Resolve a "função" exibida do usuário (modelo híbrido):
 *   - ADMIN legado → preset "Administrador".
 *   - senão, a primeira role CUSTOMIZADA atribuída (não-preset).
 *   - fallback: primeira role atribuída (preset legado MANAGER/MEMBER).
 */
function userFunctionRole(
  u: UserRow,
  adminRoleId: string | undefined,
): AssignedRole | undefined {
  if (u.role === "ADMIN") {
    return adminRoleId
      ? { id: adminRoleId, name: "Administrador", systemPreset: "ADMIN" }
      : { id: "__admin__", name: "Administrador", systemPreset: "ADMIN" };
  }
  const custom = u.assignedRoles?.find((r) => !r.systemPreset);
  if (custom) return custom;
  return u.assignedRoles?.[0];
}

async function parseJsonError(res: Response, fallback: string): Promise<never> {
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  throw new Error(typeof data.message === "string" ? data.message : fallback);
}

export default function TeamV2ClientPage() {
  return (
    <SettingsV2Shell
      back={SETTINGS_HUB_BACK}
      title="Equipe"
      description="Usuários, funções, permissões, expediente e departamentos"
      icon={<IconUsers size={22} />}
    >
      <TeamContent />
    </SettingsV2Shell>
  );
}

/**
 * Injeta busca (center) + ações (actions) no header do SettingsV2Shell.
 * Montado apenas nas abas Usuários/Expediente — desmonta na aba
 * Departamentos, cedendo os slots ao DepartmentsTab sem conflito.
 */
function TeamHeaderSlots({
  center,
  actions,
}: {
  center: React.ReactNode;
  actions: React.ReactNode;
}) {
  const headerSlots = useSettingsHeaderSlots();
  React.useEffect(() => {
    if (!headerSlots) return;
    headerSlots.setCenter(center);
    headerSlots.setActions(actions);
    return () => {
      headerSlots.setCenter(null);
      headerSlots.setActions(null);
    };
  }, [headerSlots, center, actions]);
  return null;
}

function TeamContent() {
  const qc = useQueryClient();
  const { data: session, status } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const canManageDepartments =
    session?.user?.role === "ADMIN" || session?.user?.role === "MANAGER";
  const isDesktop = useIsDesktop();
  const searchParams = useSearchParams();

  // Funções disponíveis: Administrador + demais papéis (Gestor/Operador +
  // customizados). Antes filtrávamos `!isSystem`, o que escondia Gestor e
  // Operador — só aparecia Administrador se a org ainda não tinha roles
  // customizadas em Permissões.
  const { data: roles = [] } = useRoles();
  const adminRole = React.useMemo(
    () => roles.find((r) => r.systemPreset === "ADMIN"),
    [roles],
  );
  const baseRoleOptions = React.useMemo(() => {
    const adminOpt = adminRole
      ? [{ value: adminRole.id, label: "Administrador" }]
      : [];
    const others = roles
      .filter((r) => r.systemPreset !== "ADMIN")
      .map((r) => ({ value: r.id, label: r.name }));
    return [...adminOpt, ...others];
  }, [adminRole, roles]);

  // 0 = Usuários, 1 = Expediente, 2 = Departamentos. Suporta deep-link
  // via ?tab= (usado pelo redirect da rota antiga /settings/departments).
  const [activeTab, setActiveTab] = React.useState(() => {
    const t = searchParams?.get("tab");
    if (t === "departamentos") return 2;
    if (t === "expediente") return 1;
    return 0;
  });
  const [search, setSearch] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState("all");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [page, setPage] = React.useState(1);
  const [perPage, setPerPage] = React.useState(DEFAULT_PER_PAGE);
  const [sortBy, setSortBy] = React.useState<"name" | "email">("name");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");
  const [view, setView] = useCardsTableView();

  // Expediente tab (busca própria + modal "Novo expediente")
  const [expedienteSearch, setExpedienteSearch] = React.useState("");
  const [expedienteNewOpen, setExpedienteNewOpen] = React.useState(false);

  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [inviteName, setInviteName] = React.useState("");
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [invitePassword, setInvitePassword] = React.useState("");
  const [inviteRoleId, setInviteRoleId] = React.useState<string>("");
  const [invitePermissions, setInvitePermissions] = React.useState<CrmPermissionDraft>(
    DEFAULT_INVITE_PERMISSIONS,
  );

  const [passwordTarget, setPasswordTarget] = React.useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);

  const [editTarget, setEditTarget] = React.useState<UserRow | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<UserRow | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false);
  const [bulkDeleting, setBulkDeleting] = React.useState(false);

  const {
    data: users = [],
    isLoading,
    isError,
    error,
  } = useTeamUsersQuery<UserRow>(status === "authenticated");

  // ─── Derivados: busca client-side ──────────────────────────────────────
  const term = search.trim().toLowerCase();
  const filtered = React.useMemo(
    () =>
      users.filter((u) => {
        if (roleFilter !== "all" && u.role !== roleFilter) return false;
        if (
          term &&
          !u.name.toLowerCase().includes(term) &&
          !u.email.toLowerCase().includes(term)
        )
          return false;
        return true;
      }),
    [users, term, roleFilter],
  );

  React.useEffect(() => {
    setSelected(new Set());
  }, [term, roleFilter]);

  React.useEffect(() => {
    setPage(1);
  }, [term, roleFilter, perPage]);

  const sorted = React.useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const cmp =
        sortBy === "email"
          ? a.email.localeCompare(b.email, "pt-BR")
          : a.name.localeCompare(b.name, "pt-BR");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortBy, sortDir]);

  const toggleSort = React.useCallback((field: "name" | "email") => {
    setSortBy((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir("asc");
      return field;
    });
  }, []);

  const dirFor = (f: "name" | "email"): SortDir => (sortBy === f ? sortDir : null);

  const total = sorted.length;
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const currentPage = Math.min(page, lastPage);
  const pageItems = React.useMemo(
    () => sorted.slice((currentPage - 1) * perPage, currentPage * perPage),
    [sorted, currentPage, perPage],
  );

  const visibleUsers = isDesktop ? pageItems : sorted;

  React.useEffect(() => {
    if (isDesktop) setSelected(new Set());
  }, [currentPage, isDesktop]);

  const adminCount = users.filter((u) => u.role === "ADMIN").length;
  const othersCount = users.filter((u) => u.role !== "ADMIN").length;

  const allChecked = visibleUsers.length > 0 && visibleUsers.every((u) => selected.has(u.id));
  const someChecked = visibleUsers.some((u) => selected.has(u.id));

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) visibleUsers.forEach((u) => next.delete(u.id));
      else visibleUsers.forEach((u) => next.add(u.id));
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ─── Mutations ─────────────────────────────────────────────────────────
  // Função primária: aponta para uma Role (preset ADMIN ou customizada).
  const setPrimaryRole = useMutation({
    mutationFn: async ({ id, roleId }: { id: string; roleId: string }) => {
      const res = await fetch(apiUrl(`/api/users/${id}/primary-role`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId }),
      });
      if (!res.ok) await parseJsonError(res, "Erro ao atualizar função.");
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: TEAM_USERS_QUERY_PREFIX });
      void qc.invalidateQueries({ queryKey: ["my-permissions"] });
      toast.success("Função atualizada.");
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar função."),
  });

  const updatePassword = useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) => {
      const res = await fetch(apiUrl(`/api/users/${id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) await parseJsonError(res, "Erro ao trocar senha.");
      return res.json();
    },
    onSuccess: (_data, vars) => {
      const targetName = passwordTarget?.name ?? "o usuário";
      if (vars.id === session?.user?.id) {
        toast.success("Sua senha foi atualizada.");
      } else {
        toast.success(`Senha de ${targetName} atualizada.`);
      }
      closePasswordDialog();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Erro ao trocar senha."),
  });

  const closePasswordDialog = React.useCallback(() => {
    setPasswordTarget(null);
    setNewPassword("");
    setConfirmPassword("");
    setShowPassword(false);
  }, []);

  const openPasswordDialog = React.useCallback((u: UserRow) => {
    setPasswordTarget(u);
    setNewPassword("");
    setConfirmPassword("");
    setShowPassword(false);
  }, []);

  const passwordMismatch =
    confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSubmitPassword =
    newPassword.length >= 6 &&
    newPassword === confirmPassword &&
    !updatePassword.isPending;

  const inviteIsAdmin = inviteRoleId !== "" && inviteRoleId === adminRole?.id;
  const inviteSelectedRole = React.useMemo(
    () => roles.find((r) => r.id === inviteRoleId),
    [roles, inviteRoleId],
  );

  const invite = useMutation({
    mutationFn: async () => {
      const legacyRole =
        inviteSelectedRole?.systemPreset === "ADMIN" ||
        inviteSelectedRole?.systemPreset === "MANAGER" ||
        inviteSelectedRole?.systemPreset === "MEMBER"
          ? inviteSelectedRole.systemPreset
          : inviteIsAdmin
            ? "ADMIN"
            : "MEMBER";
      const res = await fetch(apiUrl("/api/users"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: inviteName.trim(),
          email: inviteEmail.trim(),
          password: invitePassword,
          // Baseline legado ADMIN/MANAGER/MEMBER. Role customizada (ou
          // confirmação do preset) é aplicada em seguida via primary-role.
          role: legacyRole,
        }),
      });
      if (!res.ok) await parseJsonError(res, "Erro ao convidar membro.");
      const created = (await res.json()) as { id?: string } & UserRow;

      if (created?.id && inviteRoleId && !inviteIsAdmin) {
        try {
          await fetch(apiUrl(`/api/users/${created.id}/primary-role`), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roleId: inviteRoleId }),
          });
        } catch {
          toast.warning(
            "Usuário criado, mas a função não foi aplicada. Ajuste na lista de Equipe.",
          );
        }
      }

      const allTrue = CRM_ACTION_KEYS.every((k) => invitePermissions[k] === true);
      if (created?.id && !allTrue && !inviteIsAdmin) {
        try {
          const cur = await fetch(apiUrl("/api/settings/permissions"));
          const curData = (await cur.json().catch(() => ({}))) as {
            scopeGrants?: Record<string, unknown>;
          };
          const nextGrants = setCrmActionGrantsForUser(
            curData?.scopeGrants ?? {},
            created.id,
            invitePermissions,
          );
          await fetch(apiUrl("/api/settings/permissions"), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scopeGrants: nextGrants }),
          });
        } catch (err) {
          toast.warning(
            "Usuário criado, mas as permissões customizadas não foram salvas. Ajuste em Configurações → Permissões.",
          );
          throw err;
        }
      }
      return created;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: TEAM_USERS_QUERY_PREFIX });
      void qc.invalidateQueries({ queryKey: ["visibility-settings"] });
      toast.success("Usuário criado com sucesso.");
      setInviteOpen(false);
      setInviteName("");
      setInviteEmail("");
      setInvitePassword("");
      setInviteRoleId("");
      setInvitePermissions(DEFAULT_INVITE_PERMISSIONS);
    },
  });

  const deleteUser = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(apiUrl(`/api/users/${id}`), { method: "DELETE" });
      if (!res.ok) await parseJsonError(res, "Erro ao excluir usuário.");
      return res.json() as Promise<{ ok: true }>;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: TEAM_USERS_QUERY_PREFIX });
      toast.success("Usuário excluído com sucesso.");
      setDeleteTarget(null);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Erro ao excluir usuário."),
  });

  async function handleBulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkDeleting(true);
    let ok = 0;
    let fail = 0;
    for (const id of ids) {
      try {
        const res = await fetch(apiUrl(`/api/users/${id}`), { method: "DELETE" });
        if (!res.ok) throw new Error();
        ok += 1;
      } catch {
        fail += 1;
      }
    }
    setBulkDeleting(false);
    setBulkDeleteOpen(false);
    setSelected(new Set());
    void qc.invalidateQueries({ queryKey: TEAM_USERS_QUERY_PREFIX });
    if (fail === 0) {
      toast.success(ok === 1 ? "Usuário excluído." : `${ok} usuários excluídos.`);
    } else if (ok === 0) {
      toast.error("Não foi possível excluir os usuários selecionados.");
    } else {
      toast.error(`${ok} excluído(s), ${fail} falharam.`);
    }
  }

  // Membro sem gestão não acessa Departamentos — se cair na aba via
  // deep-link, volta para Usuários assim que a sessão resolve.
  React.useEffect(() => {
    if (activeTab === 2 && session && !canManageDepartments) setActiveTab(0);
  }, [activeTab, session, canManageDepartments]);

  const roleFilterGroup = React.useMemo<SettingsFilterGroup>(
    () => ({
      key: "role",
      label: "Filtrar por função",
      value: roleFilter,
      onChange: setRoleFilter,
      options: [
        { value: "all", label: "Todos", count: users.length },
        {
          value: "ADMIN",
          label: "Admin",
          count: users.filter((u) => u.role === "ADMIN").length,
        },
        {
          value: "MANAGER",
          label: "Gerente",
          count: users.filter((u) => u.role === "MANAGER").length,
        },
        {
          value: "MEMBER",
          label: "Atendente",
          count: users.filter((u) => u.role === "MEMBER").length,
        },
      ],
    }),
    [roleFilter, users],
  );

  const searchNode = React.useMemo(
    () =>
      activeTab === 0 ? (
        <SettingsListFilterBar
          search={search}
          onSearch={setSearch}
          placeholder="Buscar por nome, e-mail..."
          ariaLabel="Buscar usuários"
          groups={[roleFilterGroup]}
          onClearAll={() => {
            setSearch("");
            setRoleFilter("all");
          }}
          popoverTitle="Filtros de equipe"
        />
      ) : (
        <SettingsListFilterBar
          search={expedienteSearch}
          onSearch={setExpedienteSearch}
          placeholder="Buscar agente…"
          ariaLabel="Buscar agente por nome ou e-mail"
          onClearAll={() => setExpedienteSearch("")}
        />
      ),
    [activeTab, search, roleFilterGroup, expedienteSearch],
  );

  // Segmented control compartilhado pelas 3 abas. É reusado tanto no
  // header próprio de Usuários/Expediente quanto injetado no header do
  // DepartmentsTab (via tabsSlot) — garante que as abas fiquem sempre
  // visíveis, inclusive na aba Departamentos.
  const segmentedControl = React.useMemo(() => {
    const tabValue =
      activeTab === 2 ? "departamentos" : activeTab === 1 ? "expediente" : "usuarios";
    return (
      <div className="toolbar-hscroll min-w-0 max-w-full">
        <PageSegmentedControl
          size="compact"
          aria-label="Abas da equipe"
          items={[
            { value: "usuarios", label: "Usuários" },
            { value: "expediente", label: "Expediente" },
            ...(canManageDepartments
              ? [{ value: "departamentos", label: "Departamentos" }]
              : []),
          ]}
          value={tabValue}
          onChange={(v) =>
            setActiveTab(v === "departamentos" ? 2 : v === "expediente" ? 1 : 0)
          }
        />
      </div>
    );
  }, [activeTab, canManageDepartments]);

  const editFnRole = editTarget
    ? userFunctionRole(editTarget, adminRole?.id)
    : undefined;
  const editRoleOptions = React.useMemo(() => {
    if (
      editFnRole &&
      editFnRole.id !== "__admin__" &&
      !baseRoleOptions.some((o) => o.value === editFnRole.id)
    ) {
      return [{ value: editFnRole.id, label: editFnRole.name }, ...baseRoleOptions];
    }
    return baseRoleOptions;
  }, [editFnRole, baseRoleOptions]);

  const actionsNode = React.useMemo(
    () => (
      <div className="flex items-center gap-2">
        {activeTab === 0 ? <ViewToggle value={view} onChange={setView} /> : null}
        {segmentedControl}
        <PageActionsMenu
          aria-label="Ações da equipe"
          items={
            activeTab === 0
              ? [
                  {
                    icon: <IconPlus size={14} stroke={2.6} />,
                    label: "Novo usuário",
                    onClick: () => setInviteOpen(true),
                    primary: true,
                  },
                ]
              : [
                  {
                    icon: <IconPlus size={14} stroke={2.6} />,
                    label: "Novo expediente",
                    onClick: () => setExpedienteNewOpen(true),
                    primary: true,
                  },
                ]
          }
        />
      </div>
    ),
    [activeTab, segmentedControl, view],
  );

  return (
    <>
      {/* Header (busca + ações) das abas Usuários/Expediente. Na aba
          Departamentos quem gerencia o header é o próprio DepartmentsTab
          (com o segmented control injetado via tabsSlot) — nunca os dois
          ao mesmo tempo, evitando disputa pelos slots do shell. */}
      {activeTab !== 2 && (
        <TeamHeaderSlots center={searchNode} actions={actionsNode} />
      )}
      {activeTab === 2 ? (
        <DepartmentsTab tabsSlot={segmentedControl} />
      ) : activeTab === 1 ? (
        <ExpedienteTab
          search={expedienteSearch}
          newExpedienteOpen={expedienteNewOpen}
          onNewExpedienteOpenChange={setExpedienteNewOpen}
        />
      ) : (
      <>
      {isLoading && users.length === 0 ? (
        <AppLoading variant="inline" className="min-h-0 flex-1" />
      ) : (
      <>
      <div className={cn(LIST_PAGE_PANE_CLASS, "min-h-min")}>
      {/* STATS — shrink-0: toolbar-hscroll/overflow em flex-col colapsava a altura
          (~só o topo dos ícones visível). Mobile: 3 mini-cards; desktop: StatCards. */}
      <div className="grid shrink-0 grid-cols-3 gap-2 sm:hidden">
        <CompactStat
          tone="brand"
          icon={<IconUsers size={16} />}
          value={users.length}
          label="Usuários"
        />
        <CompactStat
          tone="violet"
          icon={<IconShield size={16} />}
          value={adminCount}
          label={adminCount === 1 ? "Admin" : "Admins"}
        />
        <CompactStat
          tone="green"
          icon={<IconUserPlus size={16} />}
          value={othersCount}
          label="Demais"
        />
      </div>
      <div className="hidden shrink-0 sm:grid sm:grid-cols-[repeat(auto-fit,minmax(180px,1fr))] sm:gap-3.5">
        <StatCard
          tone="brand"
          icon={<IconUsers size={20} />}
          value={users.length}
          label="Usuários ativos"
        />
        <StatCard
          tone="violet"
          icon={<IconShield size={20} />}
          value={adminCount}
          label={adminCount === 1 ? "Administrador" : "Administradores"}
        />
        <StatCard
          tone="green"
          icon={<IconUserPlus size={20} />}
          value={othersCount}
          label="Demais funções"
        />
      </div>

      {/* BULK BAR */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-4 py-2.5 backdrop-blur-md">
          <span className="font-display text-[13px] font-bold text-[var(--text-primary)]">
            {selected.size} selecionado{selected.size > 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="rounded-full px-3 py-1.5 font-display text-[12px] font-semibold text-[var(--text-secondary)] hover:bg-black/5"
            >
              Limpar
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setBulkDeleteOpen(true)}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-[var(--color-danger,#e11d48)] px-3.5 py-1.5 font-display text-[12px] font-bold text-white transition-all hover:-translate-y-px"
              >
                <IconTrash size={14} /> Excluir
              </button>
            )}
          </div>
        </div>
      )}

      {isError && error instanceof Error ? (
        <p className="rounded-[var(--radius-lg)] border border-[var(--color-danger)]/30 bg-[color-mix(in_srgb,var(--color-danger)_8%,transparent)] px-4 py-3 text-sm text-[var(--color-danger,#e11d48)]">
          {error.message}
        </p>
      ) : null}

      {/* LISTA — linha a linha (padrão canônico) */}
      {filtered.length === 0 ? (
        <GlassCard variant="panel" className="px-6 py-12 text-center font-body text-[13px] text-[var(--text-muted)]">
          {term || roleFilter !== "all"
            ? "Nenhum usuário encontrado para os filtros atuais."
            : "Nenhum usuário cadastrado ainda."}
        </GlassCard>
      ) : (
        <MobileTableScroll minWidth={780}>
          <DataView
            view={view}
            columnClass="grid items-center gap-3"
            style={{ gridTemplateColumns: USER_LIST_GRID }}
            header={
              <>
                <span>
                  <CheckboxGlass
                    checked={allChecked}
                    indeterminate={!allChecked && someChecked}
                    onChange={toggleAll}
                    aria-label="Selecionar todos"
                  />
                </span>
                <SortableHeader label="Nome" sort={dirFor("name")} onSort={() => toggleSort("name")} />
                <SortableHeader label="E-mail" sort={dirFor("email")} onSort={() => toggleSort("email")} />
                <ListColumnLabel>Função</ListColumnLabel>
                <ListColumnLabel>Telefonia</ListColumnLabel>
                <ListColumnLabel align="right">Ações</ListColumnLabel>
              </>
            }
          >
          {visibleUsers.map((u) => {
            const isSelected = selected.has(u.id);
            const fnRole = userFunctionRole(u, adminRole?.id);
            const isAdminRole = fnRole?.systemPreset === "ADMIN";
            const fnLabel = fnRole?.name ?? "Sem função";
            // Garante que o valor atual apareça no dropdown mesmo se for um
            // preset legado (MANAGER/MEMBER) fora das opções base.
            const rowOptions =
              fnRole && fnRole.id !== "__admin__" &&
              !baseRoleOptions.some((o) => o.value === fnRole.id)
                ? [{ value: fnRole.id, label: fnLabel }, ...baseRoleOptions]
                : baseRoleOptions;
            return (
              <DataRow
                key={u.id}
                className={cn(
                  "group",
                  isSelected && "border-primary bg-primary/10",
                )}
              >
                <span>
                  <CheckboxGlass
                    checked={isSelected}
                    onChange={() => toggleOne(u.id)}
                    aria-label={`Selecionar ${u.name}`}
                  />
                </span>

                {/* Usuário */}
                <div className="flex min-w-0 items-center gap-2.5">
                  <UserAvatar size={32} name={u.name} imageUrl={u.avatarUrl} />
                  <div className="min-w-0 leading-tight">
                    {isAdmin ? (
                      <button
                        type="button"
                        onClick={() => setEditTarget(u)}
                        className="block max-w-full truncate text-left font-display text-[14px] font-bold text-[var(--text-primary)] hover:underline"
                      >
                        {u.name}
                      </button>
                    ) : (
                      <span className="block max-w-full truncate font-display text-[14px] font-bold text-[var(--text-primary)]">
                        {u.name}
                      </span>
                    )}
                    <span
                      className={cn(
                        "mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px font-display text-[10px] font-bold",
                        roleBadgeClass(isAdminRole),
                      )}
                    >
                      <IconShield size={10} className="opacity-85" />
                      {fnLabel}
                    </span>
                  </div>
                </div>

                {/* E-mail */}
                <div className="flex min-w-0 items-center gap-1.5 font-body text-[13px] text-[var(--text-secondary)]">
                  <IconMail size={13} className="shrink-0 text-[var(--text-muted)]" />
                  <span className="truncate">{u.email}</span>
                </div>

                {/* Função */}
                <div className="min-w-0">
                  <DropdownGlass
                    options={rowOptions}
                    value={fnRole && fnRole.id !== "__admin__" ? fnRole.id : undefined}
                    placeholder="Definir função"
                    onValueChange={(next) => {
                      if (fnRole && next === fnRole.id) return;
                      setPrimaryRole.mutate({ id: u.id, roleId: next });
                    }}
                    disabled={setPrimaryRole.isPending || !isAdmin}
                    matchTriggerWidth={false}
                    triggerClassName="h-9 w-full min-w-0"
                  />
                </div>

                {/* Telefonia */}
                <div className="flex items-center">
                  {isAdmin ? (
                    <TelephonyToggle userId={u.id} />
                  ) : (
                    <span className="font-body text-[12px] text-[var(--text-muted)]">—</span>
                  )}
                </div>

                {/* Ações */}
                <div className={LIST_ACTIONS_CELL_CLASS}>
                  {isAdmin ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditTarget(u)}
                        aria-label={`Editar ${u.name}`}
                        title="Editar usuário"
                        className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] text-[var(--brand-primary)] transition-colors hover:bg-[var(--color-primary-soft)]"
                      >
                        <IconPencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => openPasswordDialog(u)}
                        aria-label={`Trocar senha de ${u.name}`}
                        title="Trocar senha"
                        className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] text-[var(--brand-primary)] transition-colors hover:bg-[var(--color-primary-soft)]"
                      >
                        <IconKey size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(u)}
                        aria-label={`Excluir ${u.name}`}
                        title="Excluir usuário"
                        className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] hover:text-[var(--color-danger)]"
                      >
                        <IconTrash size={14} />
                      </button>
                    </>
                  ) : (
                    <span className="font-body text-[12px] text-[var(--text-muted)]">—</span>
                  )}
                </div>
              </DataRow>
            );
          })}
          </DataView>
        </MobileTableScroll>
      )}

      {isDesktop && filtered.length > 0 ? (
        <PaginationGlass
          label={`${total.toLocaleString("pt-BR")} ${total === 1 ? "usuário" : "usuários"} — página ${currentPage} de ${lastPage}`}
          canPrev={currentPage > 1}
          canNext={currentPage < lastPage}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(lastPage, p + 1))}
          perPage={perPage}
          onPerPageChange={(value) => {
            setPerPage(value);
            setPage(1);
          }}
        />
      ) : null}
      </div>
      </>
      )}
      </>
      )}

      <EditUserDialog
        user={editTarget}
        roleOptions={editRoleOptions}
        roleId={editFnRole && editFnRole.id !== "__admin__" ? editFnRole.id : undefined}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
      />

      {/* ─── Dialog: criar usuário ─── */}
      <FormDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        busy={invite.isPending}
        size="lg"
        title="Criar usuário"
        description="O usuário é criado na hora e já acessa com o e-mail e a senha definidos abaixo. Nenhum e-mail de convite é enviado."
        footer={
          <>
            <ButtonGlass type="button" variant="glass" onClick={() => setInviteOpen(false)}>Cancelar</ButtonGlass>
            <ButtonGlass
              type="button"
              variant="primary"
              disabled={invite.isPending || !inviteName.trim() || !inviteEmail.trim() || invitePassword.length < 6}
              onClick={() => invite.mutate()}
            >
              {invite.isPending ? <Loader2 className="size-4 animate-spin" /> : <IconPlus size={16} />}
              Criar usuário
            </ButtonGlass>
          </>
        }
      >
        <div className="grid gap-3">
            <div className="grid gap-1.5">
              <label htmlFor="invite-name" className="text-sm font-medium">
                Nome
              </label>
              <InputGlass
                id="invite-name"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Nome completo"
                autoComplete="name"
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="invite-email" className="text-sm font-medium">
                E-mail
              </label>
              <InputGlass
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="email@empresa.com"
                autoComplete="email"
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="invite-password" className="text-sm font-medium">
                Senha inicial
              </label>
              <InputGlass
                id="invite-password"
                type="password"
                value={invitePassword}
                onChange={(e) => setInvitePassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
              <p
                className={cn(
                  "text-[11px]",
                  invitePassword.length > 0 && invitePassword.length < 6
                    ? "text-[var(--color-danger,#e11d48)]"
                    : "text-[var(--text-muted)]",
                )}
              >
                Mínimo de 6 caracteres.
              </p>
            </div>
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">Função</span>
              <DropdownGlass
                options={baseRoleOptions}
                value={inviteRoleId || undefined}
                placeholder="Selecione a função"
                onValueChange={(next) => setInviteRoleId(next)}
                matchTriggerWidth
                triggerClassName="w-full"
              />
              <p className="text-[11px] text-[var(--text-muted)]">
                Lista os papéis de <strong>Permissões</strong> (Gestor, Operador
                e roles personalizadas), além de Administrador.
              </p>
            </div>
            <GlassCard variant="overlay" className="grid gap-2 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Permissões iniciais</span>
                {inviteIsAdmin ? (
                  <span className="text-[11px] font-semibold uppercase text-[var(--color-warn)]">
                    Admin · tudo liberado
                  </span>
                ) : (
                  <span className="text-[11px] text-[var(--text-muted)]">
                    Editáveis depois em Configurações → Permissões
                  </span>
                )}
              </div>
              <div className="grid gap-1.5">
                {CRM_ACTION_KEYS.map((action) => {
                  const checked =
                    inviteIsAdmin ? true : invitePermissions[action];
                  return (
                    <label
                      key={action}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-lg border border-transparent bg-[var(--glass-bg-overlay)] px-3 py-2 text-sm transition-colors",
                        !inviteIsAdmin && "hover:border-[var(--glass-border)]",
                      )}
                    >
                      <span className="min-w-0 truncate text-[var(--text-primary)]">
                        {CRM_ACTION_LABELS[action]}
                      </span>
                      <SwitchGlass
                        size="sm"
                        checked={checked}
                        disabled={inviteIsAdmin}
                        onChange={() =>
                          setInvitePermissions((prev) => ({
                            ...prev,
                            [action]: !prev[action],
                          }))
                        }
                        aria-label={CRM_ACTION_LABELS[action]}
                      />
                    </label>
                  );
                })}
              </div>
            </GlassCard>
          {invite.isError && invite.error instanceof Error ? (
            <p className="text-sm text-[var(--color-danger,#e11d48)]">
              {invite.error.message}
            </p>
          ) : null}
        </div>
      </FormDialog>

      {/* ─── Dialog: trocar senha ─── */}
      <FormDialog
        open={passwordTarget != null}
        onOpenChange={(open) => {
          if (!open) closePasswordDialog();
        }}
        busy={updatePassword.isPending}
        size="sm"
        icon={<KeyRound className="size-5 text-[var(--color-lavender)]" />}
        title="Trocar senha"
        description={
          passwordTarget ? (
            <>
              Defina uma nova senha para{" "}
              <span className="font-medium text-[var(--text-primary)]">
                {passwordTarget.name}
              </span>{" "}
              <span className="text-[var(--text-muted)]">
                ({passwordTarget.email})
              </span>
              . O próximo login usará esta senha.
            </>
          ) : null
        }
        footer={
          <>
            <ButtonGlass type="button" variant="glass" onClick={closePasswordDialog} disabled={updatePassword.isPending}>Cancelar</ButtonGlass>
            <ButtonGlass
              type="button"
              variant="primary"
              disabled={!canSubmitPassword}
              onClick={() => {
                if (!passwordTarget) return;
                updatePassword.mutate({ id: passwordTarget.id, password: newPassword });
              }}
            >
              {updatePassword.isPending ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
              Salvar nova senha
            </ButtonGlass>
          </>
        }
      >
        <div className="grid gap-3">
            <div className="grid gap-1.5">
              <label htmlFor="new-password" className="text-sm font-medium">
                Nova senha
              </label>
              <div className="relative">
                <InputGlass
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">Mínimo de 6 caracteres.</p>
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="confirm-password" className="text-sm font-medium">
                Confirmar nova senha
              </label>
              <InputGlass
                id="confirm-password"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
              {passwordMismatch ? (
                <p className="text-[11px] text-[var(--color-danger,#e11d48)]">
                  As senhas não coincidem.
                </p>
              ) : null}
            </div>
        </div>
      </FormDialog>

      {/* ─── Dialog: excluir (single) ─── */}
      <Dialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open && !deleteUser.isPending) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="size-4 text-[var(--color-danger,#e11d48)]" />
              Excluir usuário
            </DialogTitle>
            <DialogDescription>
              {deleteTarget ? (
                <>
                  Esta ação remove o acesso de{" "}
                  <span className="font-medium text-[var(--text-primary)]">
                    {deleteTarget.name}
                  </span>{" "}
                  (<span className="text-[var(--text-muted)]">{deleteTarget.email}</span>).
                  Negócios e contatos sob responsabilidade dessa pessoa ficam{" "}
                  <span className="font-medium text-[var(--text-primary)]">
                    sem responsável
                  </span>
                  .
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <ButtonGlass
              type="button"
              variant="glass"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteUser.isPending}
            >
              Cancelar
            </ButtonGlass>
            <ButtonGlass
              type="button"
              variant="danger"
              disabled={deleteUser.isPending || !deleteTarget}
              onClick={() => {
                if (!deleteTarget) return;
                deleteUser.mutate(deleteTarget.id);
              }}
            >
              {deleteUser.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Confirmar exclusão
            </ButtonGlass>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: excluir (bulk) ─── */}
      <Dialog
        open={bulkDeleteOpen}
        onOpenChange={(open) => {
          if (!open && !bulkDeleting) setBulkDeleteOpen(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="size-4 text-[var(--color-danger,#e11d48)]" />
              Excluir {selected.size === 1 ? "usuário" : `${selected.size} usuários`}
            </DialogTitle>
            <DialogDescription>
              Esta ação remove o acesso{" "}
              {selected.size === 1 ? "do usuário selecionado" : "dos usuários selecionados"}.
              Não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <ButtonGlass
              type="button"
              variant="glass"
              onClick={() => setBulkDeleteOpen(false)}
              disabled={bulkDeleting}
            >
              Cancelar
            </ButtonGlass>
            <ButtonGlass
              type="button"
              variant="danger"
              disabled={bulkDeleting}
              onClick={handleBulkDelete}
            >
              {bulkDeleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Confirmar exclusão
            </ButtonGlass>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatCard({
  tone,
  icon,
  value,
  label,
}: {
  tone: "brand" | "violet" | "green";
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  const toneClass =
    tone === "brand"
      ? "bg-[var(--color-enterprise-bg,rgba(91,111,245,0.15))] text-[var(--brand-primary)]"
      : tone === "violet"
        ? "bg-[rgba(167,139,250,0.18)] text-[var(--brand-secondary)]"
        : "bg-[var(--color-success-bg,rgba(16,185,129,0.12))] text-[var(--color-success-dark)]";
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-4 py-3.5 shadow-[var(--glass-shadow-sm)] backdrop-blur-md">
      <span
        className={cn(
          "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)]",
          toneClass,
        )}
      >
        {icon}
      </span>
      <div>
        <div className="font-display text-[21px] font-extrabold leading-none tracking-tight text-[var(--text-primary)]">
          {value}
        </div>
        <div className="mt-1 font-body text-[11.5px] font-semibold text-[var(--text-muted)]">
          {label}
        </div>
      </div>
    </div>
  );
}

/** Mini-card de métrica — 3 colunas no mobile, altura estável (sem overflow). */
function CompactStat({
  tone,
  icon,
  value,
  label,
}: {
  tone: "brand" | "violet" | "green";
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  const toneClass =
    tone === "brand"
      ? "bg-[var(--color-enterprise-bg,rgba(91,111,245,0.15))] text-[var(--brand-primary)]"
      : tone === "violet"
        ? "bg-[rgba(167,139,250,0.18)] text-[var(--brand-secondary)]"
        : "bg-[var(--color-success-bg,rgba(16,185,129,0.12))] text-[var(--color-success-dark)]";
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5 rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-2 py-2.5 text-center shadow-[var(--glass-shadow-sm)] backdrop-blur-md">
      <span
        className={cn(
          "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)]",
          toneClass,
        )}
      >
        {icon}
      </span>
      <span className="font-display text-[18px] font-extrabold leading-none tracking-tight text-[var(--text-primary)]">
        {value}
      </span>
      <span className="line-clamp-2 font-body text-[10px] font-semibold leading-tight text-[var(--text-muted)]">
        {label}
      </span>
    </div>
  );
}
