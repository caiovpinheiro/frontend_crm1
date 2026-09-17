"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createKeepCategory,
  createKeepNote,
  deleteKeepCategory,
  deleteKeepNote,
  importGoogleKeepZip,
  listKeepCategories,
  listKeepNotes,
  patchKeepCategory,
  patchKeepNote,
  reorderKeepNotes,
  uploadKeepAttachment,
} from "./api";
import type { KeepCategory, KeepDoc, KeepFolder, KeepNote } from "./types";

export const keepsKey = (folder: KeepFolder, q: string, colors: string[]) =>
  ["keeps", folder, q, [...colors].sort().join(",")] as const;

export const keepCategoriesKey = ["keeps", "categories"] as const;

export function useKeepNotes(folder: KeepFolder, q: string, colors: string[] = []) {
  return useQuery({
    queryKey: keepsKey(folder, q, colors),
    queryFn: () => listKeepNotes(folder, q, colors),
    staleTime: 8_000,
  });
}

export function useKeepCategories() {
  return useQuery({
    queryKey: keepCategoriesKey,
    queryFn: listKeepCategories,
    staleTime: 15_000,
  });
}

export function useKeepMutations(folder: KeepFolder, q: string, colors: string[] = []) {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["keeps"] });

  return {
    create: useMutation({
      mutationFn: (input: { title?: string; content?: KeepDoc; categoryId?: string | null }) =>
        createKeepNote(input),
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
                if (!u) return n;
                return {
                  ...n,
                  position: u.position,
                  ...(u.pinned !== undefined ? { pinned: u.pinned } : {}),
                  ...(u.categoryId !== undefined ? { categoryId: u.categoryId } : {}),
                };
              })
              .sort(
                (a, b) =>
                  Number(b.pinned) - Number(a.pinned) || a.position - b.position,
              ),
          };
        });
      },
      onError: invalidate,
      onSettled: invalidate,
    }),
    createCategory: useMutation({
      mutationFn: (input: { name: string; color: string }) => createKeepCategory(input),
      onSuccess: invalidate,
    }),
    patchCategory: useMutation({
      mutationFn: (input: {
        id: string;
        patch: Partial<{ name: string; position: number; color: string }>;
      }) => patchKeepCategory(input.id, input.patch),
      onSuccess: invalidate,
    }),
    removeCategory: useMutation({
      mutationFn: (id: string) => deleteKeepCategory(id),
      onSuccess: invalidate,
    }),
    invalidate,
    folder,
    q,
  };
}

export type { KeepCategory };
