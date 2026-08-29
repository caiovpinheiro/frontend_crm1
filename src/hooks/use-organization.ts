/**
 * Dados de identidade da organização do usuário logado.
 *
 * Consome `GET /api/organization` (rewrite pro backend), que retorna o
 * metadata visual da org (id, nome, slug, logo, cor). Usado pela NavRail
 * para renderizar o avatar/iniciais da empresa e expor o ID da conta.
 *
 * staleTime alto: nome/id da org praticamente não mudam durante a sessão.
 * A logo também vai para localStorage — no F5 o rail pinta o cache
 * (useLayoutEffect) em vez do B default enquanto o GET não volta.
 */
"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { apiUrl, parseApiResponse } from "@/lib/api";

export const ORG_BRAND_CACHE_KEY = "crm:org-brand";

export type OrgBrandCache = {
  orgId: string;
  logoUrl: string | null;
  name: string;
};

export function readCachedOrgBrand(orgId?: string | null): OrgBrandCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ORG_BRAND_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OrgBrandCache;
    if (!parsed || typeof parsed.orgId !== "string") return null;
    if (orgId && parsed.orgId !== orgId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCachedOrgBrand(data: OrgBrandCache) {
  try {
    window.localStorage.setItem(ORG_BRAND_CACHE_KEY, JSON.stringify(data));
  } catch {
    /* localStorage indisponível */
  }
}

export type OrganizationData = {
  id: string;
  name: string;
  slug: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  status: string | null;
  onboardingCompletedAt: string | null;
};

export function useOrganization() {
  const { data: session } = useSession();
  const orgId = (session?.user as { organizationId?: string } | undefined)
    ?.organizationId;

  const query = useQuery({
    queryKey: ["organization", orgId],
    queryFn: async (): Promise<OrganizationData | null> => {
      const res = await fetch(apiUrl("/api/organization"));
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!orgId,
    staleTime: 5 * 60_000, // 5 min — identidade da org quase não muda na sessão
  });

  useEffect(() => {
    const org = query.data;
    if (!org?.id) return;
    writeCachedOrgBrand({
      orgId: org.id,
      logoUrl: org.logoUrl,
      name: org.name,
    });
  }, [query.data]);

  return query;
}

/**
 * Hook de identidade da org (id) usado como chave de cache nas mutations
 * abaixo — mantém a invalidação alinhada com `useOrganization`.
 */
function useOrgQueryKey() {
  const { data: session } = useSession();
  const orgId = (session?.user as { organizationId?: string } | undefined)
    ?.organizationId;
  return ["organization", orgId] as const;
}

/**
 * Faz upload do ícone/logo da empresa (`POST /api/organization/logo`) e
 * invalida o cache da org para a navrail refletir a troca na hora.
 */
export function useUpdateOrganizationLogo() {
  const queryClient = useQueryClient();
  const key = useOrgQueryKey();
  return useMutation({
    mutationFn: async (file: File): Promise<{ url: string }> => {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(apiUrl("/api/organization/logo"), {
        method: "POST",
        body,
      });
      return parseApiResponse<{ url: string }>(res, "Erro ao enviar o ícone.");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

/**
 * Remove o ícone da empresa (`DELETE /api/organization/logo`) e invalida
 * o cache da org.
 */
export function useRemoveOrganizationLogo() {
  const queryClient = useQueryClient();
  const key = useOrgQueryKey();
  return useMutation({
    mutationFn: async (): Promise<{ ok: true }> => {
      const res = await fetch(apiUrl("/api/organization/logo"), {
        method: "DELETE",
      });
      return parseApiResponse<{ ok: true }>(res, "Erro ao remover o ícone.");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
