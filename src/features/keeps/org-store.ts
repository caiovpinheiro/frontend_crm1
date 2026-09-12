"use client";

import { useMemo, useSyncExternalStore } from "react";

import { isKeepNoteColor } from "./palette";
import type { KeepLabel, KeepNoteColor, KeepNoteMeta } from "./types";

const STORAGE_KEY = "bwipo-keeps-org-v1";

type OrgState = {
  labels: KeepLabel[];
  meta: Record<string, KeepNoteMeta>;
};

const EMPTY: OrgState = { labels: [], meta: {} };

function isLabel(value: unknown): value is KeepLabel {
  if (!value || typeof value !== "object") return false;
  const v = value as { id?: unknown; name?: unknown };
  return typeof v.id === "string" && typeof v.name === "string";
}

function isMeta(value: unknown): value is KeepNoteMeta {
  if (!value || typeof value !== "object") return false;
  const v = value as { color?: unknown; labelIds?: unknown };
  return isKeepNoteColor(v.color) && Array.isArray(v.labelIds) && v.labelIds.every((id) => typeof id === "string");
}

function load(): OrgState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return EMPTY;
    const rec = parsed as { labels?: unknown; meta?: unknown };
    const labels = Array.isArray(rec.labels) ? rec.labels.filter(isLabel) : [];
    const meta: Record<string, KeepNoteMeta> = {};
    if (rec.meta && typeof rec.meta === "object") {
      for (const [id, value] of Object.entries(rec.meta as Record<string, unknown>)) {
        if (isMeta(value)) meta[id] = value;
      }
    }
    return { labels, meta };
  } catch {
    return EMPTY;
  }
}

let state: OrgState = typeof window === "undefined" ? EMPTY : load();
const listeners = new Set<() => void>();

function emit() {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return state;
}

function getServerSnapshot() {
  return EMPTY;
}

function uid() {
  return `lbl-${Math.random().toString(36).slice(2, 10)}`;
}

function defaultMeta(): KeepNoteMeta {
  return { color: "default", labelIds: [] };
}

function patchMeta(noteId: string, patch: Partial<KeepNoteMeta>) {
  const prev = state.meta[noteId] ?? defaultMeta();
  state = {
    ...state,
    meta: {
      ...state.meta,
      [noteId]: {
        color: patch.color ?? prev.color,
        labelIds: patch.labelIds ?? prev.labelIds,
      },
    },
  };
  emit();
}

export function useKeepOrg() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return useMemo(() => {
    function colorOf(noteId: string): KeepNoteColor {
      return snap.meta[noteId]?.color ?? "default";
    }

    function labelIdsOf(noteId: string): string[] {
      return snap.meta[noteId]?.labelIds ?? [];
    }

    function labelsOf(noteId: string): KeepLabel[] {
      const ids = new Set(labelIdsOf(noteId));
      return snap.labels.filter((l) => ids.has(l.id));
    }

    function createLabel(name: string): KeepLabel {
      const trimmed = name.trim();
      if (!trimmed) return { id: "", name: "" };
      const existing = state.labels.find((l) => l.name.toLowerCase() === trimmed.toLowerCase());
      if (existing) return existing;
      const label: KeepLabel = { id: uid(), name: trimmed };
      state = { ...state, labels: [...state.labels, label] };
      emit();
      return label;
    }

    function renameLabel(id: string, name: string) {
      const trimmed = name.trim();
      if (!trimmed) return;
      state = {
        ...state,
        labels: state.labels.map((l) => (l.id === id ? { ...l, name: trimmed } : l)),
      };
      emit();
    }

    function deleteLabel(id: string) {
      const meta: Record<string, KeepNoteMeta> = {};
      for (const [noteId, value] of Object.entries(state.meta)) {
        meta[noteId] = { ...value, labelIds: value.labelIds.filter((lid) => lid !== id) };
      }
      state = { labels: state.labels.filter((l) => l.id !== id), meta };
      emit();
    }

    function setNoteColor(noteId: string, color: KeepNoteColor) {
      patchMeta(noteId, { color });
    }

    function setNoteLabels(noteId: string, labelIds: string[]) {
      patchMeta(noteId, { labelIds: [...new Set(labelIds)] });
    }

    function toggleNoteLabel(noteId: string, labelId: string) {
      const current = state.meta[noteId]?.labelIds ?? [];
      const next = current.includes(labelId)
        ? current.filter((id) => id !== labelId)
        : [...current, labelId];
      setNoteLabels(noteId, next);
    }

    function labelCounts(noteIds: string[]): Record<string, number> {
      const counts: Record<string, number> = {};
      for (const label of snap.labels) counts[label.id] = 0;
      for (const noteId of noteIds) {
        for (const id of labelIdsOf(noteId)) {
          counts[id] = (counts[id] ?? 0) + 1;
        }
      }
      return counts;
    }

    return {
      labels: snap.labels,
      meta: snap.meta,
      colorOf,
      labelIdsOf,
      labelsOf,
      createLabel,
      renameLabel,
      deleteLabel,
      setNoteColor,
      setNoteLabels,
      toggleNoteLabel,
      labelCounts,
    };
  }, [snap]);
}
