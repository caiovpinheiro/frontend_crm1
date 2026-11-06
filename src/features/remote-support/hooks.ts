import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useActiveWidgetSlugs } from "@/features/widgets/hooks";

import {
  createRemoteSupportControlLink,
  endRemoteSupportSession,
  fetchRemoteSupportSession,
  fetchRemoteSupportSessions,
  startRemoteSupportSession,
  type RemoteSupportSession,
} from "./api";

/** Enquanto a sessão está ativa, confere a cada 4s se o cliente conectou. */
const POLL_MS = 4_000;

export const REMOTE_SUPPORT_WIDGET_SLUG = "remote_support";

/**
 * Gate do módulo: o card "Suporte remoto" só existe com o widget
 * `remote_support` instalado na org (Central de Widgets). `enabled` fica
 * `null` enquanto os slugs carregam — mesmo modelo de `useCallsWidget`.
 */
export function useRemoteSupportWidget(): { enabled: boolean | null; isLoading: boolean } {
  const { data, isLoading } = useActiveWidgetSlugs();
  if (!data) return { enabled: null, isLoading };
  return { enabled: data.activeSlugs.includes(REMOTE_SUPPORT_WIDGET_SLUG), isLoading: false };
}

const listKey = (contactId: string) => ["remote-support", "sessions", contactId] as const;
const sessionKey = (id: string) => ["remote-support", "session", id] as const;

export function isActiveRemoteSession(s: Pick<RemoteSupportSession, "status">): boolean {
  return s.status === "WAITING" || s.status === "CONNECTED";
}

export function useRemoteSupportSessions(contactId: string, enabled = true) {
  return useQuery<RemoteSupportSession[]>({
    queryKey: listKey(contactId),
    queryFn: () => fetchRemoteSupportSessions(contactId),
    enabled: enabled && !!contactId,
  });
}

export function useRemoteSupportSession(id: string | null) {
  return useQuery<RemoteSupportSession>({
    queryKey: sessionKey(id ?? ""),
    queryFn: () => fetchRemoteSupportSession(id as string),
    enabled: !!id,
    refetchInterval: (query) => {
      const s = query.state.data;
      return s && isActiveRemoteSession(s) ? POLL_MS : false;
    },
  });
}

export function useStartRemoteSupport(contactId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => startRemoteSupportSession(contactId),
    onSuccess: (session) => {
      qc.setQueryData(sessionKey(session.id), session);
      void qc.invalidateQueries({ queryKey: listKey(contactId) });
    },
  });
}

export function useRemoteSupportControl() {
  return useMutation({ mutationFn: (id: string) => createRemoteSupportControlLink(id) });
}

export function useEndRemoteSupport(contactId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => endRemoteSupportSession(id),
    onSuccess: (session) => {
      qc.setQueryData(sessionKey(session.id), session);
      void qc.invalidateQueries({ queryKey: listKey(contactId) });
    },
  });
}
