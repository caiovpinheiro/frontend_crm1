import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiUrl } from "@/lib/api";

import type {
  EffectivePermissions,
  FieldGrantEntry,
  PermissionsCatalog,
  RoleSidebarItem,
  RoleSummary,
  PipelineGrantEntry,
  StageGrantEntry,
} from "./types";

/** Campos de grant compartilhados por create/update de Role. */
type RoleGrantPayload = {
  sharedInbox?: boolean;
  mediaAccess?: boolean;
  stageGrants?: StageGrantEntry[];
  pipelineGrants?: PipelineGrantEntry[];
  fieldGrants?: FieldGrantEntry[];
};

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message ?? `Erro ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Roles ──────────────────────────────────────────────────────────────────

export function useRoles() {
  return useQuery<RoleSummary[]>({
    queryKey: ["roles"],
    queryFn: () => apiFetch("/api/roles"),
  });
}

export function useRole(id: string | null) {
  return useQuery<RoleSummary>({
    queryKey: ["roles", id],
    queryFn: () => apiFetch(`/api/roles/${id}`),
    enabled: !!id,
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      description?: string;
      permissions: string[];
      inheritsFrom?: string | null;
      sidebarItems?: RoleSidebarItem[] | null;
    } & RoleGrantPayload) =>
      apiFetch<RoleSummary>("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["roles"] });
    },
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      name?: string;
      description?: string;
      permissions?: string[];
      inheritsFrom?: string | null;
      sidebarItems?: RoleSidebarItem[] | null;
    } & RoleGrantPayload) =>
      apiFetch<RoleSummary>(`/api/roles/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: (role, { id }) => {
      qc.setQueryData(["roles", id], role);
      void qc.invalidateQueries({ queryKey: ["roles"] });
      void qc.invalidateQueries({ queryKey: ["roles", id] });
      // A sidebar do usuario logado deriva dos roles — invalida pra refletir
      // imediatamente qualquer mudanca sem F5.
      void qc.invalidateQueries({ queryKey: ["sidebar-preferences"] });
    },
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: boolean }>(`/api/roles/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["roles"] });
    },
  });
}

export function useAddRoleAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, userId }: { roleId: string; userId: string }) =>
      apiFetch(`/api/roles/${roleId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      }),
    onSuccess: (_, { roleId, userId }) => {
      void qc.invalidateQueries({ queryKey: ["roles", roleId] });
      void qc.invalidateQueries({ queryKey: ["roles"] });
      // Invalida o efetivo do usuário pra refletir as novas roles na UI sem refresh.
      // `my-permissions` é o cache da sessão corrente — invalidado também caso o
      // admin esteja editando a própria conta (cenário comum em setup inicial).
      void qc.invalidateQueries({ queryKey: ["effective-permissions", userId] });
      void qc.invalidateQueries({ queryKey: ["my-permissions"] });
    },
  });
}

export function useRemoveRoleAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, userId }: { roleId: string; userId: string }) =>
      apiFetch(`/api/roles/${roleId}/assignments/${userId}`, { method: "DELETE" }),
    onSuccess: (_, { roleId, userId }) => {
      void qc.invalidateQueries({ queryKey: ["roles", roleId] });
      void qc.invalidateQueries({ queryKey: ["roles"] });
      void qc.invalidateQueries({ queryKey: ["effective-permissions", userId] });
      void qc.invalidateQueries({ queryKey: ["my-permissions"] });
    },
  });
}

// ── Catálogo de permissões ─────────────────────────────────────────────────

export function usePermissionsCatalog() {
  return useQuery<PermissionsCatalog>({
    queryKey: ["permissions-catalog"],
    queryFn: () => apiFetch("/api/permissions/catalog"),
    staleTime: Infinity,
  });
}

// ── Permissões efetivas ────────────────────────────────────────────────────

export function useEffectivePermissions(userId: string | null) {
  return useQuery<EffectivePermissions>({
    queryKey: ["effective-permissions", userId],
    queryFn: () => apiFetch(`/api/users/${userId}/effective-permissions`),
    enabled: !!userId,
  });
}

// ── Escopo por usuário (funis e canais) ────────────────────────────────────
//
// `null` = sem restrição (acesso a todos). `string[]` = restrito aos IDs.
// Lê/grava o `permissions.scope.grants.v1` da org via endpoint dedicado que
// faz read-merge-write (não apaga regras de outros usuários/papéis).

export type UserScopeGrantsDto = {
  pipelineIds: string[] | null;
  channelViewIds: string[] | null;
  channelSendIds: string[] | null;
  channelInitiateIds: string[] | null;
  channelManageIds: string[] | null;
  channelDenyIds: string[] | null;
};

export function useUserScopeGrants(userId: string | null) {
  return useQuery<UserScopeGrantsDto>({
    queryKey: ["user-scope-grants", userId],
    queryFn: () => apiFetch(`/api/users/${userId}/scope-grants`),
    enabled: !!userId,
  });
}

export function useUpdateUserScopeGrants(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<UserScopeGrantsDto>) =>
      apiFetch<UserScopeGrantsDto & { ok: boolean }>(
        `/api/users/${userId}/scope-grants`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["user-scope-grants", userId] });
      void qc.invalidateQueries({ queryKey: ["my-permissions"] });
    },
  });
}

// ── Escopo de CANAL por Role (RBAC) ──────────────────────────────────────
// Eixo aditivo: concede canais a todos os usuários que possuem a role.
// `null` = sem restrição por esta role. `string[]` = restringe/concede aos IDs.

export type RoleScopeGrantsDto = {
  channelViewIds: string[] | null;
  channelSendIds: string[] | null;
  channelInitiateIds: string[] | null;
  channelManageIds: string[] | null;
  channelDenyIds: string[] | null;
};

export function useRoleScopeGrants(roleId: string | null) {
  return useQuery<RoleScopeGrantsDto>({
    queryKey: ["role-scope-grants", roleId],
    queryFn: () => apiFetch(`/api/roles/${roleId}/scope-grants`),
    enabled: !!roleId,
  });
}

export function useUpdateRoleScopeGrants(roleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<RoleScopeGrantsDto>) =>
      apiFetch<RoleScopeGrantsDto & { ok: boolean }>(
        `/api/roles/${roleId}/scope-grants`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["role-scope-grants", roleId] });
      void qc.invalidateQueries({ queryKey: ["my-permissions"] });
    },
  });
}

export type ScopeEntityOption = { id: string; name: string };

function pickArray(data: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    for (const key of keys) {
      const value = (data as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}

/** Funis da org (id + nome) para o seletor de escopo. */
export function useScopePipelineOptions() {
  return useQuery<ScopeEntityOption[]>({
    queryKey: ["scope-pipelines"],
    queryFn: async () => {
      const data = await apiFetch<unknown>("/api/pipelines");
      return pickArray(data, "pipelines", "items").map((p) => {
        const row = p as { id: string; name?: string };
        return { id: row.id, name: row.name ?? row.id };
      });
    },
    staleTime: 60_000,
  });
}

/** Canais da org (id + nome) para o seletor de escopo. */
export function useScopeChannelOptions() {
  return useQuery<ScopeEntityOption[]>({
    queryKey: ["scope-channels"],
    queryFn: async () => {
      const data = await apiFetch<unknown>("/api/channels");
      return pickArray(data, "channels", "items").map((c) => {
        const row = c as { id: string; name?: string };
        return { id: row.id, name: row.name ?? row.id };
      });
    },
    staleTime: 60_000,
  });
}
