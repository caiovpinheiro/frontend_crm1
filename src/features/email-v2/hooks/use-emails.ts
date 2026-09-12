"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { EmailDetail, EmailFolder, EmailListItem, EmailPagination } from "../api/types";
import { listEmails, getEmail, markEmailRead } from "../api/emails";

const PAGE_SIZE = 30;

function mergeUnique(prev: EmailListItem[], incoming: EmailListItem[]) {
  if (incoming.length === 0) return prev;
  const seen = new Set(prev.map((e) => e.id));
  const extra = incoming.filter((e) => !seen.has(e.id));
  return extra.length === 0 ? prev : [...prev, ...extra];
}

export function useEmails(params: {
  accountId?: string;
  folder?: EmailFolder;
  customFolderId?: string;
  search?: string;
  unreadOnly?: boolean;
}) {
  const [emails, setEmails] = useState<EmailListItem[]>([]);
  const [pagination, setPagination] = useState<EmailPagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const searching = Boolean(params.search?.trim());
  const emailsRef = useRef(emails);
  emailsRef.current = emails;
  const pageRef = useRef(page);
  pageRef.current = page;
  const loadingMoreRef = useRef(false);

  const load = useCallback(async (p = 1, append = false) => {
    if (append) {
      if (loadingMoreRef.current) return;
      loadingMoreRef.current = true;
      setLoadingMore(true);
    } else if (emailsRef.current.length === 0) {
      setLoading(true);
    }
    setError(null);
    try {
      const data = await listEmails({
        accountId: params.accountId,
        folder: searching ? undefined : params.folder,
        customFolderId: searching ? undefined : params.customFolderId,
        search: params.search,
        unreadOnly: params.unreadOnly,
        page: p,
        perPage: PAGE_SIZE,
      });
      setEmails((prev) => (append ? mergeUnique(prev, data.emails) : data.emails));
      setPagination(data.pagination);
      setPage(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar e-mails.");
    } finally {
      if (append) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      } else {
        setLoading(false);
      }
    }
  }, [params.accountId, params.folder, params.customFolderId, params.search, params.unreadOnly, searching]);

  useEffect(() => {
    setEmails([]);
    setPagination(null);
    setPage(1);
    void load(1, false);
  }, [load]);

  const refresh = useCallback(() => load(1, false), [load]);

  const hasMore = Boolean(pagination && page < pagination.pages);

  const loadMore = useCallback(() => {
    if (!hasMore || loading || loadingMoreRef.current) return;
    void load(pageRef.current + 1, true);
  }, [hasMore, loading, load]);

  const markRead = useCallback(async (id: string, isRead: boolean) => {
    await markEmailRead(id, isRead);
    setEmails((prev) =>
      prev.map((e) => (e.id === id ? { ...e, isRead } : e)),
    );
  }, []);

  return {
    emails,
    pagination,
    loading,
    loadingMore,
    error,
    page,
    setPage,
    hasMore,
    loadMore,
    refresh,
    markRead,
    searching,
  };
}

export function useEmailDetail(id: string | null) {
  const [email, setEmail] = useState<EmailDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) { setEmail(null); return; }
    setLoading(true);
    getEmail(id)
      .then(setEmail)
      .catch(() => setEmail(null))
      .finally(() => setLoading(false));
  }, [id]);

  return { email, loading };
}
