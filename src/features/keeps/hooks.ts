"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createKeepNote,
  deleteKeepNote,
  importGoogleKeepZip,
  listKeepNotes,
  patchKeepNote,
  reorderKeepNotes,
  uploadKeepAttachment,
} from "./api";
import type { KeepDoc, KeepFolder, KeepNote } from "./types";

export const keepsKey = (folder: KeepFolder, q: string) => ["keeps", folder, q] as const;

export function useKeepNotes(folder: KeepFolder, q: string) {
  return useQuery({
    queryKey: keepsKey(folder, q),
    queryFn: () => listKeepNotes(folder, q),
    staleTime: 8_000,
  });
}

export function useKeepMutations(folder: KeepFolder, q: string) {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["keeps"] });

  return {
    create: useMutation({
      mutationFn: (input: { title?: string; content?: KeepDoc }) => createKeepNote(input),
      onSuccess: invalidate,
    }),
    patch: useMutation({
      mutationFn: (input: {
        id: string;
        patch: Parameters<typeof patchKeepNote>[1];
      }) => patchKeepNote(input.id, input.patch),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (input: { id: string; forever?: boolean }) => deleteKeepNote(input.id, input.forever),
      onSuccess: invalidate,
    }),
    attach: useMutation({
      mutationFn: (input: { noteId: string; file: File }) => uploadKeepAttachment(input.noteId, input.file),
      onSuccess: invalidate,
    }),
    importZip: useMutation({
      mutationFn: importGoogleKeepZip,
      onSuccess: invalidate,
    }),
    reorder: useMutation({
      mutationFn: reorderKeepNotes,
      onMutate: async (items) => {
        await qc.cancelQueries({ queryKey: ["keeps"] });
        const map = new Map(items.map((i) => [i.id, i]));
        qc.setQueriesData<{ items: KeepNote[] }>({ queryKey: ["keeps"] }, (old) => {
          if (!old?.items) return old;
          return {
            items: [...old.items]
              .map((n) => {
                const u = map.get(n.id);
                return u ? { ...n, pinned: u.pinned, position: u.position } : n;
              })
              .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.position - b.position),
          };
        });
      },
      onError: invalidate,
      onSettled: invalidate,
    }),
    invalidate,
    folder,
    q,
  };
}
