"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export type QuickReplyGroup = {
  id: string;
  name: string;
  order: number;
  _count: { quickReplies: number };
};

export type QuickReply = {
  id: string;
  title: string;
  content: string;
  groupId: string | null;
  attachmentUrl: string | null;
  position: number;
  group: { id: string; name: string } | null;
};

const GROUPS_QK = ["settings", "quick-reply-groups"];
const REPLIES_QK = ["settings", "quick-replies"];

export function useQuickReplyGroups() {
  return useQuery<QuickReplyGroup[]>({
    queryKey: GROUPS_QK,
    queryFn: async () => {
      const res = await fetch("/api/settings/quick-replies/groups", { credentials: "include" });
      if (!res.ok) throw new Error("Falha ao carregar grupos");
      return res.json();
    },
  });
}

export function useQuickReplies(search = "") {
  return useQuery<QuickReply[]>({
    queryKey: [...REPLIES_QK, search],
    queryFn: async () => {
      const url = `/api/settings/quick-replies${search ? `?q=${encodeURIComponent(search)}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Falha ao carregar mensagens rápidas");
      return res.json();
    },
  });
}

export function useCreateQuickReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { title: string; content: string; groupId?: string | null; attachmentUrl?: string | null }) => {
      const res = await fetch("/api/settings/quick-replies", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "Erro ao criar");
      return res.json() as Promise<QuickReply>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: REPLIES_QK });
      toast.success("Mensagem rápida criada.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCreateQuickReplyGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch("/api/settings/quick-replies/groups", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "Erro ao criar grupo");
      return res.json() as Promise<QuickReplyGroup>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GROUPS_QK });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useImportDefaultQuickReplies() {
  const qc = useQueryClient();
  const createGroup = useCreateQuickReplyGroup();
  const createReply = useCreateQuickReply();

  return useMutation({
    mutationFn: async (
      items: Array<{ title: string; content: string; group: string }>,
    ) => {
      const existingGroups =
        qc.getQueryData<QuickReplyGroup[]>(GROUPS_QK) ?? [];
      const groupMap = new Map<string, string>();
      const groupNames = [...new Set(items.map((item) => item.group))];

      for (const name of groupNames) {
        const found = existingGroups.find((g) => g.name === name);
        if (found) {
          groupMap.set(name, found.id);
        } else {
          const created = await createGroup.mutateAsync(name);
          groupMap.set(name, created.id);
          existingGroups.push(created);
        }
      }

      for (const item of items) {
        await createReply.mutateAsync({
          title: item.title,
          content: item.content,
          groupId: groupMap.get(item.group) ?? null,
        });
      }

      return { count: items.length };
    },
    onSuccess: ({ count }) => {
      qc.invalidateQueries({ queryKey: GROUPS_QK });
      qc.invalidateQueries({ queryKey: REPLIES_QK });
      toast.success(`${count} mensagens importadas.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteQuickReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/settings/quick-replies/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Erro ao excluir");
      return res.json();
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: REPLIES_QK });
      const prevs = qc.getQueriesData<QuickReply[]>({ queryKey: REPLIES_QK });
      qc.setQueriesData<QuickReply[]>({ queryKey: REPLIES_QK }, (old) =>
        old?.filter((r) => r.id !== id) ?? []
      );
      return { prevs };
    },
    onError: (e: Error, _id, ctx: { prevs: [unknown, QuickReply[] | undefined][] } | undefined) => {
      if (ctx?.prevs) {
        for (const [key, data] of ctx.prevs) qc.setQueryData(key as string[], data);
      }
      toast.error(e.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: REPLIES_QK }),
  });
}
