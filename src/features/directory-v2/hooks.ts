"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addContactNote,
  addContactTag,
  createActivity,
  createActivityComment,
  createCompany,
  createContact,
  deleteActivity,
  deleteActivityComment,
  deleteCompany,
  deleteContact,
  fetchActivities,
  fetchActivity,
  fetchActivityAlert,
  fetchActivityCommentHistory,
  fetchActivityComments,
  postActivityAlertAction,
  fetchCompanies,
  fetchCompany,
  fetchCompanyFacets,
  fetchCompanyStats,
  fetchContact,
  fetchContacts,
  fetchContactFieldDefs,
  fetchContactStats,
  fetchDuplicates,
  fetchTagsWithCounts,
  mergeContacts,
  removeContactTag,
  updateActivity,
  updateActivityComment,
  updateCompany,
  updateContact,
  type ActivityAlertActionBody,
  type ActivityAlertKind,
  type ActivityAlertResponse,
  type ActivityCommentDto,
  type ActivityCommentRevisionDto,
  type ActivityListItemDto,
  type ActivityListPage,
  type ActivityTypeDto,
  type CompanyDetailDto,
  type CompanyFacetsDto,
  type CompanyListPage,
  type CompanySegment,
  type CompanySortField,
  type CompanyStatsDto,
  type CompanyWriteBody,
  type ContactDetailDto,
  type ContactListPage,
  type ContactNoteDto,
  type ContactFieldDefDto,
  type ContactStatsDto,
  type ContactWriteBody,
  type DuplicatesResponseDto,
  type TagWithCountDto,
  type CreateActivityPayload,
  type UpdateActivityPayload,
} from "./api";

import { isPreviewMode } from "@/lib/preview-mode";
import { isDirectoryMock } from "./mock";
import { isPageMockMode } from "@/lib/page-mock-mode";

/** Em preview/mock mode, ignora o guard de sessão e sempre dispara a query. */
function resolveEnabled(enabled: boolean | undefined): boolean {
  return isPreviewMode() || isDirectoryMock() || isPageMockMode()
    ? true
    : (enabled ?? true);
}

export function useContacts(params: {
  search?: string;
  page?: number;
  perPage?: number;
  lifecycleStage?: string;
  tagIds?: string[];
  unassigned?: boolean;
  createdFrom?: string;
  createdTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
  sortBy?: "name" | "email" | "createdAt" | "updatedAt" | "leadScore" | "lifecycleStage";
  sortOrder?: "asc" | "desc";
  enabled?: boolean;
}) {
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 30;
  const tagIds = params.tagIds ?? [];
  return useQuery<ContactListPage>({
    queryKey: [
      "v2-contacts",
      params.search ?? "",
      page,
      perPage,
      params.lifecycleStage ?? "",
      tagIds.join(","),
      params.unassigned ? "1" : "",
      params.createdFrom ?? "",
      params.createdTo ?? "",
      params.updatedFrom ?? "",
      params.updatedTo ?? "",
      params.sortBy ?? "",
      params.sortOrder ?? "",
    ],
    queryFn: () =>
      fetchContacts({
        search: params.search,
        page,
        perPage,
        lifecycleStage: params.lifecycleStage,
        tagIds: tagIds.length > 0 ? tagIds : undefined,
        unassigned: params.unassigned,
        createdFrom: params.createdFrom,
        createdTo: params.createdTo,
        updatedFrom: params.updatedFrom,
        updatedTo: params.updatedTo,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      }),
    enabled: resolveEnabled(params.enabled),
    staleTime: 10_000,
    placeholderData: (prev) => prev,
  });
}

export function useContactStats(enabled?: boolean) {
  return useQuery<ContactStatsDto>({
    queryKey: ["v2-contact-stats"],
    queryFn: fetchContactStats,
    enabled: resolveEnabled(enabled),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export function useContactTags(enabled?: boolean) {
  return useQuery<TagWithCountDto[]>({
    queryKey: ["v2-contact-tags"],
    queryFn: fetchTagsWithCounts,
    enabled: resolveEnabled(enabled),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useContactFieldDefs(enabled?: boolean) {
  return useQuery<ContactFieldDefDto[]>({
    queryKey: ["v2-contact-field-defs"],
    queryFn: fetchContactFieldDefs,
    enabled: resolveEnabled(enabled),
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useContactDuplicates(enabled?: boolean) {
  return useQuery<DuplicatesResponseDto>({
    queryKey: ["v2-contact-duplicates"],
    queryFn: fetchDuplicates,
    enabled: resolveEnabled(enabled),
    staleTime: 30_000,
  });
}

export function useMergeContacts() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, Error, { keepId: string; removeId: string }>({
    mutationFn: ({ keepId, removeId }) => mergeContacts(keepId, removeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["v2-contacts"], exact: false });
      qc.invalidateQueries({ queryKey: ["v2-contact-stats"] });
      qc.invalidateQueries({ queryKey: ["v2-contact-duplicates"] });
    },
  });
}

export function useContact(id: string | null) {
  return useQuery<ContactDetailDto>({
    queryKey: ["v2-contact", id ?? "__none__"],
    queryFn: () => fetchContact(id as string),
    enabled: !!id,
    staleTime: 10_000,
  });
}

function invalidateContacts(qc: ReturnType<typeof useQueryClient>, id?: string) {
  qc.invalidateQueries({ queryKey: ["v2-contacts"], exact: false });
  qc.invalidateQueries({ queryKey: ["v2-contact-stats"] });
  if (id) qc.invalidateQueries({ queryKey: ["v2-contact", id] });
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation<ContactDetailDto, Error, ContactWriteBody>({
    mutationFn: createContact,
    onSuccess: () => invalidateContacts(qc),
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation<ContactDetailDto, Error, { id: string; body: ContactWriteBody }>({
    mutationFn: ({ id, body }) => updateContact(id, body),
    onSuccess: (_d, vars) => invalidateContacts(qc, vars.id),
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, Error, string>({
    mutationFn: deleteContact,
    onSuccess: (_d, id) => invalidateContacts(qc, id),
  });
}

export function useAddContactNote() {
  const qc = useQueryClient();
  return useMutation<ContactNoteDto, Error, { id: string; content: string }>({
    mutationFn: ({ id, content }) => addContactNote(id, content),
    onSuccess: (_d, vars) => invalidateContacts(qc, vars.id),
  });
}

export function useAddContactTag() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, Error, { id: string; tagId: string }>({
    mutationFn: ({ id, tagId }) => addContactTag(id, tagId),
    onSuccess: (_d, vars) => invalidateContacts(qc, vars.id),
  });
}

export function useRemoveContactTag() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, Error, { id: string; tagId: string }>({
    mutationFn: ({ id, tagId }) => removeContactTag(id, tagId),
    onSuccess: (_d, vars) => invalidateContacts(qc, vars.id),
  });
}

export function useCompanies(params: {
  search?: string;
  page?: number;
  perPage?: number;
  segment?: CompanySegment;
  city?: string;
  state?: string;
  industry?: string;
  createdFrom?: string;
  createdTo?: string;
  sortBy?: CompanySortField;
  sortOrder?: "asc" | "desc";
  enabled?: boolean;
}) {
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 30;
  const segment = params.segment ?? "todos";
  return useQuery<CompanyListPage>({
    queryKey: [
      "v2-companies",
      params.search ?? "",
      page,
      perPage,
      segment,
      params.city ?? "",
      params.state ?? "",
      params.industry ?? "",
      params.createdFrom ?? "",
      params.createdTo ?? "",
      params.sortBy ?? "name",
      params.sortOrder ?? "asc",
    ],
    queryFn: () =>
      fetchCompanies({
        search: params.search,
        page,
        perPage,
        segment,
        city: params.city,
        state: params.state,
        industry: params.industry,
        createdFrom: params.createdFrom,
        createdTo: params.createdTo,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      }),
    enabled: resolveEnabled(params.enabled),
    staleTime: 10_000,
    placeholderData: (prev) => prev,
  });
}

export function useCompanyStats(enabled?: boolean) {
  return useQuery<CompanyStatsDto>({
    queryKey: ["v2-company-stats"],
    queryFn: fetchCompanyStats,
    enabled: resolveEnabled(enabled),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export function useCompanyFacets(enabled?: boolean) {
  return useQuery<CompanyFacetsDto>({
    queryKey: ["v2-company-facets"],
    queryFn: fetchCompanyFacets,
    enabled: resolveEnabled(enabled),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useCompany(id: string | null) {
  return useQuery<CompanyDetailDto>({
    queryKey: ["v2-company", id ?? "__none__"],
    queryFn: () => fetchCompany(id as string),
    enabled: !!id,
    staleTime: 10_000,
  });
}

function invalidateCompanies(qc: ReturnType<typeof useQueryClient>, id?: string) {
  qc.invalidateQueries({ queryKey: ["v2-companies"], exact: false });
  qc.invalidateQueries({ queryKey: ["v2-company-stats"] });
  if (id) qc.invalidateQueries({ queryKey: ["v2-company", id] });
}

export function useCreateCompany() {
  const qc = useQueryClient();
  return useMutation<CompanyDetailDto, Error, CompanyWriteBody>({
    mutationFn: createCompany,
    onSuccess: () => invalidateCompanies(qc),
  });
}

export function useUpdateCompany() {
  const qc = useQueryClient();
  return useMutation<CompanyDetailDto, Error, { id: string; body: CompanyWriteBody }>({
    mutationFn: ({ id, body }) => updateCompany(id, body),
    onSuccess: (_d, vars) => invalidateCompanies(qc, vars.id),
  });
}

export function useDeleteCompany() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, Error, string>({
    mutationFn: deleteCompany,
    onSuccess: (_d, id) => invalidateCompanies(qc, id),
  });
}

/** Prefixo canônico das queries de atividades (aba global + painéis). */
export const ACTIVITIES_QUERY_KEY = "v2-activities" as const;

export type UseActivitiesParams = {
  type?: ActivityTypeDto;
  completed?: boolean;
  page?: number;
  perPage?: number;
  scope?: "mine" | "department" | "all";
  dealId?: string;
  contactId?: string;
  enabled?: boolean;
};

export function activitiesQueryKey(params: {
  type?: ActivityTypeDto;
  completed?: boolean;
  scope?: "mine" | "department" | "all";
  dealId?: string;
  contactId?: string;
  page?: number;
  perPage?: number;
}) {
  return [
    ACTIVITIES_QUERY_KEY,
    params.type ?? "__any__",
    params.completed === undefined ? "__any__" : params.completed,
    params.scope ?? "all",
    params.dealId ?? "__any__",
    params.contactId ?? "__any__",
    params.page ?? 1,
    params.perPage ?? 30,
  ] as const;
}

/** Invalida lista global, filtros contextuais e chave legada do painel de deal. */
export function invalidateActivities(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [ACTIVITIES_QUERY_KEY], exact: false });
  qc.invalidateQueries({ queryKey: ["deal-activities"], exact: false });
  qc.invalidateQueries({ queryKey: ["v2-activity"], exact: false });
}

export function useCreateActivity() {
  const qc = useQueryClient();
  return useMutation<ActivityListItemDto, Error, CreateActivityPayload>({
    mutationFn: createActivity,
    onSuccess: () => invalidateActivities(qc),
  });
}

export function useUpdateActivity() {
  const qc = useQueryClient();
  return useMutation<ActivityListItemDto, Error, { id: string; payload: UpdateActivityPayload }>({
    mutationFn: ({ id, payload }) => updateActivity(id, payload),
    onSuccess: () => invalidateActivities(qc),
  });
}

export function useDeleteActivity() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, Error, string>({
    mutationFn: deleteActivity,
    onSuccess: () => invalidateActivities(qc),
  });
}

export function useActivities(params: UseActivitiesParams = {}) {
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 30;
  return useQuery<ActivityListPage>({
    queryKey: activitiesQueryKey({
      type: params.type,
      completed: params.completed,
      scope: params.scope,
      dealId: params.dealId,
      contactId: params.contactId,
      page,
      perPage,
    }),
    queryFn: () =>
      fetchActivities({
        type: params.type,
        completed: params.completed,
        scope: params.scope,
        dealId: params.dealId,
        contactId: params.contactId,
        page,
        perPage,
      }),
    enabled: resolveEnabled(params.enabled),
    staleTime: 10_000,
    placeholderData: (prev) => prev,
  });
}

export function useActivity(id: string | null, enabled = true) {
  return useQuery<ActivityListItemDto>({
    queryKey: ["v2-activity", id],
    queryFn: () => fetchActivity(id!),
    enabled: resolveEnabled(enabled) && Boolean(id),
    staleTime: 10_000,
  });
}

function invalidateActivityComments(
  qc: ReturnType<typeof useQueryClient>,
  activityId: string,
) {
  qc.invalidateQueries({ queryKey: ["v2-activity-comments", activityId] });
  qc.invalidateQueries({ queryKey: ["v2-activity-comment-history", activityId] });
  qc.invalidateQueries({ queryKey: ["v2-activity", activityId] });
  invalidateActivities(qc);
}

export function useActivityComments(activityId: string | null, enabled = true) {
  return useQuery<{ items: ActivityCommentDto[] }>({
    queryKey: ["v2-activity-comments", activityId],
    queryFn: () => fetchActivityComments(activityId!),
    enabled: resolveEnabled(enabled) && Boolean(activityId),
    staleTime: 5_000,
  });
}

export function useActivityCommentHistory(
  activityId: string | null,
  enabled = false,
) {
  return useQuery<{ items: ActivityCommentRevisionDto[] }>({
    queryKey: ["v2-activity-comment-history", activityId],
    queryFn: () => fetchActivityCommentHistory(activityId!),
    enabled: resolveEnabled(enabled) && Boolean(activityId) && enabled,
    staleTime: 10_000,
  });
}

export function useCreateActivityComment(activityId: string | null) {
  const qc = useQueryClient();
  return useMutation<ActivityCommentDto, Error, { content: string }>({
    mutationFn: ({ content }) => {
      if (!activityId) throw new Error("Atividade inválida.");
      return createActivityComment(activityId, content);
    },
    onSuccess: () => {
      if (activityId) invalidateActivityComments(qc, activityId);
    },
  });
}

export function useUpdateActivityComment(activityId: string | null) {
  const qc = useQueryClient();
  return useMutation<
    ActivityCommentDto,
    Error,
    { commentId: string; content: string }
  >({
    mutationFn: ({ commentId, content }) => {
      if (!activityId) throw new Error("Atividade inválida.");
      return updateActivityComment(activityId, commentId, content);
    },
    onSuccess: () => {
      if (activityId) invalidateActivityComments(qc, activityId);
    },
  });
}

export function useDeleteActivityComment(activityId: string | null) {
  const qc = useQueryClient();
  return useMutation<ActivityCommentDto, Error, { commentId: string }>({
    mutationFn: ({ commentId }) => {
      if (!activityId) throw new Error("Atividade inválida.");
      return deleteActivityComment(activityId, commentId);
    },
    onSuccess: () => {
      if (activityId) invalidateActivityComments(qc, activityId);
    },
  });
}

const ACTIVITY_ALERT_KEY = ["v2-activity-alert"] as const;

export { ACTIVITY_ALERT_KEY };

/**
 * Polling de alerta de tarefa (GET consumptivo).
 * `enabled` deve refletir sessão autenticada no shell.
 */
export function useActivityAlert(enabled = true) {
  return useQuery<ActivityAlertResponse>({
    queryKey: ACTIVITY_ALERT_KEY,
    queryFn: fetchActivityAlert,
    enabled: resolveEnabled(enabled),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: false,
    staleTime: 0,
  });
}

function clearActivityAlertCache(qc: ReturnType<typeof useQueryClient>) {
  qc.setQueryData<ActivityAlertResponse>(ACTIVITY_ALERT_KEY, { alert: null });
}

export function useDismissActivityAlert() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, Error, { activityId: string }>({
    mutationFn: ({ activityId }) =>
      postActivityAlertAction(activityId, { action: "dismiss" }),
    onSuccess: () => {
      clearActivityAlertCache(qc);
      void qc.invalidateQueries({ queryKey: ACTIVITY_ALERT_KEY });
    },
  });
}

export function useSnoozeActivityAlert() {
  const qc = useQueryClient();
  return useMutation<
    { ok: true },
    Error,
    { activityId: string; kind: ActivityAlertKind }
  >({
    mutationFn: ({ activityId, kind }) =>
      postActivityAlertAction(activityId, {
        action: "snooze",
        kind,
      } satisfies ActivityAlertActionBody),
    onSuccess: () => {
      clearActivityAlertCache(qc);
      void qc.invalidateQueries({ queryKey: ACTIVITY_ALERT_KEY });
    },
  });
}
