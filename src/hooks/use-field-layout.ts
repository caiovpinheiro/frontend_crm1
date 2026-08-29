"use client";

import { apiUrl } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import {
  DEFAULTS,
  mergeLayouts,
  type SectionConfig,
} from "@/lib/field-layout";

export type FieldLayoutContext =
  | "deal_workspace"
  | "inbox_crm"
  | "inbox_lead_v2"
  | "deal_panel_v2";

export function useFieldLayout(context: FieldLayoutContext, enabled = true) {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role;
  const isAdmin = role === "ADMIN" || role === "MANAGER";
  const queryClient = useQueryClient();

  const { data } = useQuery<{ admin: SectionConfig[] | null; agent: SectionConfig[] | null }>({
    queryKey: ["field-layout", context],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/field-layout?context=${context}&forUser=true`));
      if (!res.ok) return { admin: null, agent: null };
      return res.json();
    },
    staleTime: 60_000,
    enabled,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const adminSections = (data?.admin as SectionConfig[] | null) ?? DEFAULTS[context];
  const agentSections = data?.agent as SectionConfig[] | null;
  const sections = mergeLayouts(adminSections, agentSections);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["field-layout", context] });

  const saveAdmin = useMutation({
    mutationFn: async (newSections: SectionConfig[]) => {
      const res = await fetch(apiUrl("/api/field-layout"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context, sections: newSections, scope: "admin" }),
      });
      if (!res.ok) throw new Error("Erro ao salvar padrão");
    },
    onSuccess: invalidate,
  });

  const saveAgent = useMutation({
    mutationFn: async (newSections: SectionConfig[]) => {
      const res = await fetch(apiUrl("/api/field-layout"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context, sections: newSections, scope: "agent" }),
      });
      if (!res.ok) throw new Error("Erro ao salvar layout");
    },
    onSuccess: invalidate,
  });

  const resetAgent = useMutation({
    mutationFn: async () => {
      const res = await fetch(apiUrl("/api/field-layout"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context, sections: [], scope: "agent" }),
      });
      if (!res.ok) throw new Error("Erro ao resetar layout");
    },
    onSuccess: invalidate,
  });

  return {
    sections,
    adminSections,
    isAdmin,
    hasAgentOverride: !!agentSections,
    saveAdmin: saveAdmin.mutate,
    saveAdminPending: saveAdmin.isPending,
    saveAgent: saveAgent.mutate,
    saveAgentPending: saveAgent.isPending,
    resetAgent: resetAgent.mutate,
  };
}
