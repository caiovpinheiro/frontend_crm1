"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiUrl } from "@/lib/api";

export type DepartmentOperatingHours = {
  start: string;
  end: string;
  weekdays: number[];
};

export interface Department {
  id: string;
  name: string;
  color: string;
  icon: string;
  createdAt: string;
  requireTabulationOnClose?: boolean;
  isSupport?: boolean;
  distributionEnabled?: boolean;
  /** Null = Seg–Sex 09:00–18:00. */
  operatingHours?: DepartmentOperatingHours | null;
  _count?: { conversations?: number; members?: number };
}

const QUERY_KEY = ["settings", "departments"];

function normalizeDepartmentList(data: unknown): Department[] {
  if (Array.isArray(data)) return data as Department[];
  if (data && typeof data === "object") {
    const rec = data as Record<string, unknown>;
    for (const key of ["items", "departments", "data"] as const) {
      if (Array.isArray(rec[key])) return rec[key] as Department[];
    }
  }
  return [];
}

async function fetchDepartments(): Promise<Department[]> {
  const res = await fetch(apiUrl("/api/settings/departments"), {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Erro ao carregar departamentos");
  return normalizeDepartmentList(await res.json().catch(() => null));
}

export function useDepartments(enabled = true) {
  return useQuery<Department[]>({
    queryKey: QUERY_KEY,
    queryFn: fetchDepartments,
    enabled,
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

export function useCreateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, color, icon }: { name: string; color: string; icon: string }) => {
      const res = await fetch(apiUrl("/api/settings/departments"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color, icon }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "Erro ao criar departamento");
      }
      return res.json() as Promise<Department>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useUpdateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; color?: string; icon?: string; requireTabulationOnClose?: boolean; isSupport?: boolean; distributionEnabled?: boolean; operatingHours?: DepartmentOperatingHours | null }) => {
      const res = await fetch(`/api/settings/departments/${id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "Erro ao atualizar departamento");
      }
      return res.json() as Promise<Department>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useDeleteDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(apiUrl(`/api/settings/departments/${id}`), {
        method: "DELETE",
        credentials: "include",
      });
      if (res.status === 409) {
        const err = await res.json().catch(() => ({}));
        throw Object.assign(
          new Error((err as { message?: string }).message ?? "Este departamento está em uso e não pode ser excluído"),
          { status: 409 },
        );
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "Erro ao excluir departamento");
      }
    },
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const prev = qc.getQueryData<Department[]>(QUERY_KEY);
      qc.setQueryData<Department[]>(QUERY_KEY, (old) => old?.filter((d) => d.id !== id) ?? []);
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData<Department[]>(QUERY_KEY, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
