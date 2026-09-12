"use client";

import { useState, useEffect, useCallback } from "react";
import type { EmailDetail, EmailFolder, EmailListItem, EmailPagination } from "../api/types";
import { listEmails, getEmail, markEmailRead } from "../api/emails";

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
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const searching = Boolean(params.search?.trim());

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    setError(null);
    try {
      const data = await listEmails({
        accountId: params.accountId,
        folder: searching ? undefined : params.folder,
        customFolderId: searching ? undefined : params.customFolderId,
        search: params.search,
        unreadOnly: params.unreadOnly,
        page: p,
        perPage: 30,
      });
      setEmails(data.emails);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar e-mails.");
    } finally {
      setLoading(false);
    }
  }, [params.accountId, params.folder, params.customFolderId, params.search, params.unreadOnly, searching]);

  useEffect(() => {
    setPage(1);
    void load(1);
  }, [load]);

  const refresh = useCallback(() => load(page), [load, page]);

  const markRead = useCallback(async (id: string, isRead: boolean) => {
    await markEmailRead(id, isRead);
    setEmails((prev) =>
      prev.map((e) => (e.id === id ? { ...e, isRead } : e)),
    );
  }, []);

  return { emails, pagination, loading, error, page, setPage, refresh, markRead, searching };
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
