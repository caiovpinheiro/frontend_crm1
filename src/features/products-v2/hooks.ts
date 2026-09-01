"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch, parseApiResponse } from "@/lib/api";
import { usePipelinesQuery } from "@/features/shared/queries/pipelines";
import type {
  InventoryMovement,
  InventoryPoolView,
  JobOpening,
  OrgUnit,
  ProductDetail,
  ProductOffer,
  Stakeholder,
} from "./types";

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, {
    ...init,
    headers: init?.body
      ? { "Content-Type": "application/json", ...(init?.headers ?? {}) }
      : init?.headers,
  });
  return parseApiResponse<T>(res, "Erro na requisição");
}

// ── Produto (detalhe multi-tipo) ───────────────────────────────────────────
export function useProductDetail(id: string | null) {
  return useQuery({
    queryKey: ["product-detail", id],
    queryFn: () => jsonFetch<{ product: ProductDetail }>(`/api/products/${id}`),
    enabled: !!id,
    select: (d) => d.product,
  });
}

export function useSaveProductBlocks(id: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      jsonFetch(`/api/products/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product-detail", id] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

// ── Unidades (filiais) ──────────────────────────────────────────────────────
export function useOrgUnits() {
  return useQuery({
    queryKey: ["org-units"],
    queryFn: () => jsonFetch<{ orgUnits: OrgUnit[] }>("/api/org-units"),
    select: (d) => d.orgUnits,
    staleTime: 60_000,
  });
}

// ── Ofertas por unidade ─────────────────────────────────────────────────────
export function useProductOffers(id: string | null) {
  return useQuery({
    queryKey: ["product-offers", id],
    queryFn: () => jsonFetch<{ offers: ProductOffer[] }>(`/api/products/${id}/offers`),
    enabled: !!id,
    select: (d) => d.offers,
  });
}

export function useOfferMutations(id: string | null) {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["product-offers", id] });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      jsonFetch(`/api/products/${id}/offers`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ offerId, body }: { offerId: string; body: Record<string, unknown> }) =>
      jsonFetch(`/api/products/${id}/offers/${offerId}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (offerId: string) =>
      jsonFetch(`/api/products/${id}/offers/${offerId}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
  return { create, update, remove };
}

// ── Stakeholders ────────────────────────────────────────────────────────────
export function useProductStakeholders(id: string | null) {
  return useQuery({
    queryKey: ["product-stakeholders", id],
    queryFn: () =>
      jsonFetch<{ stakeholders: Stakeholder[] }>(`/api/products/${id}/stakeholders`),
    enabled: !!id,
    select: (d) => d.stakeholders,
  });
}

export function useStakeholderMutations(id: string | null) {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["product-stakeholders", id] });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      jsonFetch(`/api/products/${id}/stakeholders`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ sid, body }: { sid: string; body: Record<string, unknown> }) =>
      jsonFetch(`/api/products/${id}/stakeholders/${sid}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (sid: string) =>
      jsonFetch(`/api/products/${id}/stakeholders/${sid}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
  return { create, update, remove };
}

// ── Inventário ──────────────────────────────────────────────────────────────
export function useProductInventory(id: string | null) {
  return useQuery({
    queryKey: ["product-inventory", id],
    queryFn: () =>
      jsonFetch<{ pools: InventoryPoolView[]; movements: InventoryMovement[] }>(
        `/api/products/${id}/inventory`,
      ),
    enabled: !!id,
  });
}

export function useAdjustInventory(id: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      jsonFetch(`/api/products/${id}/inventory/movements`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product-inventory", id] });
      qc.invalidateQueries({ queryKey: ["product-detail", id] });
    },
  });
}

// ── Dropdowns auxiliares ────────────────────────────────────────────────────
export function usePipelinesLite() {
  // Mesmo endpoint/shape do `usePipelines` do pipeline-v2 → key canônica.
  return usePipelinesQuery<{
    id: string;
    name: string;
    stages?: { id: string; name: string }[];
  }>();
}

export function useContactsSearch(search: string) {
  return useQuery({
    queryKey: ["contacts-search", search],
    queryFn: () =>
      jsonFetch<{ contacts: Array<{ id: string; name: string; email: string | null }> }>(
        `/api/contacts?search=${encodeURIComponent(search)}&perPage=20`,
      ),
    enabled: search.trim().length >= 2,
    select: (d) => d.contacts ?? [],
  });
}

export function useCompaniesSearch(search: string) {
  return useQuery({
    queryKey: ["companies-search", search],
    queryFn: () =>
      jsonFetch<{ companies: Array<{ id: string; name: string }> }>(
        `/api/companies?search=${encodeURIComponent(search)}&perPage=20`,
      ),
    enabled: search.trim().length >= 2,
    select: (d) => d.companies ?? [],
  });
}

// ── Vagas (job openings) ────────────────────────────────────────────────────
export function useJobOpenings(status?: string) {
  return useQuery({
    queryKey: ["job-openings", status ?? "all"],
    queryFn: () =>
      jsonFetch<{ jobOpenings: JobOpening[] }>(
        `/api/job-openings${status ? `?status=${status}` : ""}`,
      ),
    select: (d) => d.jobOpenings,
  });
}

export function useJobOpening(id: string | null) {
  return useQuery({
    queryKey: ["job-opening", id],
    queryFn: () => jsonFetch<{ jobOpening: JobOpening }>(`/api/job-openings/${id}`),
    enabled: !!id,
    select: (d) => d.jobOpening,
  });
}

export function useJobCandidates(id: string | null) {
  return useQuery({
    queryKey: ["job-candidates", id],
    queryFn: () =>
      jsonFetch<{
        candidates: Array<{
          id: string;
          title: string;
          contact: { id: string; name: string } | null;
          stage: { id: string; name: string; isWon: boolean; isLost: boolean };
        }>;
      }>(`/api/job-openings/${id}/candidates`),
    enabled: !!id,
    select: (d) => d.candidates,
  });
}

export function useJobMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["job-openings"] });
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      jsonFetch("/api/job-openings", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ jid, body }: { jid: string; body: Record<string, unknown> }) =>
      jsonFetch(`/api/job-openings/${jid}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: (_d, vars) => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["job-opening", vars.jid] });
    },
  });
  return { create, update };
}
