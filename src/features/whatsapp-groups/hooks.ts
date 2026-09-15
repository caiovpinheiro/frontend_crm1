"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getWhatsAppGroup,
  listWhatsAppGroupMessages,
  listWhatsAppGroups,
  openWhatsAppGroupMember,
  sendWhatsAppGroupMessage,
  syncWhatsAppGroups,
} from "./api";

export const whatsappGroupsKey = ["whatsapp-groups"] as const;

export function useWhatsAppGroups() {
  return useQuery({
    queryKey: whatsappGroupsKey,
    queryFn: listWhatsAppGroups,
    staleTime: 8_000,
  });
}

export function useWhatsAppGroup(id: string | null) {
  return useQuery({
    queryKey: [...whatsappGroupsKey, id],
    queryFn: () => getWhatsAppGroup(id!),
    enabled: Boolean(id),
    staleTime: 8_000,
  });
}

export function useWhatsAppGroupMessages(id: string | null) {
  return useQuery({
    queryKey: [...whatsappGroupsKey, id, "messages"],
    queryFn: () => listWhatsAppGroupMessages(id!),
    enabled: Boolean(id),
    staleTime: 4_000,
    refetchInterval: 6_000,
  });
}

export function useWhatsAppGroupMutations() {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: whatsappGroupsKey });

  return {
    sync: useMutation({
      mutationFn: syncWhatsAppGroups,
      onSuccess: invalidate,
    }),
    send: useMutation({
      mutationFn: ({ id, text }: { id: string; text: string }) =>
        sendWhatsAppGroupMessage(id, text),
      onSuccess: (_data, vars) => {
        void qc.invalidateQueries({ queryKey: [...whatsappGroupsKey, vars.id, "messages"] });
      },
    }),
    openMember: useMutation({
      mutationFn: ({ groupId, memberId }: { groupId: string; memberId: string }) =>
        openWhatsAppGroupMember(groupId, memberId),
    }),
  };
}
