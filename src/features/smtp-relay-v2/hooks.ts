"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { deleteSmtpRelay, getSmtpRelay, saveSmtpRelay } from "./api";
import type { SmtpRelayInput } from "./types";

const QUERY_KEY = ["settings", "smtp-relay"] as const;

export function useSmtpRelay() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: getSmtpRelay,
    staleTime: 30_000,
    retry: false,
  });

  const save = useMutation({
    mutationFn: (input: SmtpRelayInput) => saveSmtpRelay(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const remove = useMutation({
    mutationFn: () => deleteSmtpRelay(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  return {
    settings: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    save,
    remove,
  };
}
