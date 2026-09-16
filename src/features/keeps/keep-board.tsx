"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { KeepCard } from "./keep-card";
import type { KeepNote } from "./types";

const GRID = "grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

export type KeepBoardSection = {
  key: string;
  label: string;
  notes: KeepNote[];
  /** Controla o rótulo quando não há header custom. Default: há notas. */
  showLabel?: boolean;
  alwaysShowLabel?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
};

type DragLive = {
  id: string;
  note: KeepNote;
  w: number;
  h: number;
  x: number;
  y: number;
  grabX: number;
  grabY: number;
};

function sameOrder(a: KeepNote[], b: KeepNote[]) {
  return a.length === b.length && a.every((n, i) => n.id === b[i]?.id);
}

function sameSections(
  a: Array<{ key: string; notes: KeepNote[] }>,
  b: Array<{ key: string; notes: KeepNote[] }>,
) {
  return a.length === b.length && a.every((s, i) => s.key === b[i]?.key && sameOrder(s.notes, b[i].notes));
}

/** Índice de inserção 2D (grade): slot sob o ponteiro, não só linha/coluna. */
function insertIndexAtPoint(x: number, y: number, els: HTMLElement[]): number {
  if (els.length === 0) return 0;
  for (let i = 0; i < els.length; i++) {
    const r = els[i].getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
      return x > r.left + r.width / 2 ? i + 1 : i;
    }
  }
  for (let i = 0; i < els.length; i++) {
    const r = els[i].getBoundingClientRect();
    if (y < r.top) return i;
    if (y <= r.bottom && x < r.left + r.width / 2) return i;
  }
  return els.length;
}

function sectionKeyFromPoint(
  x: number,
  y: number,
  refs: Map<string, HTMLElement | null>,
  order: string[],
): string {
  for (const key of order) {
    const el = refs.get(key);
    const r = el?.getBoundingClientRect();
    if (r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return key;
  }
  let best = order[order.length - 1] ?? order[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const key of order) {
    const el = refs.get(key);
    const r = el?.getBoundingClientRect();
    if (!r) continue;
    const cy = (r.top + r.bottom) / 2;
    const dist = Math.abs(y - cy);
    if (dist < bestDist) {
      bestDist = dist;
      best = key;
    }
  }
  return best;
}

export function KeepBoard({
  sections,
  onOpen,
  onPin,
  onArchive,
  onTrash,
  onColor,
  onReorder,
}: {
  sections: KeepBoardSection[];
  onOpen: (note: KeepNote) => void;
  onPin?: (note: KeepNote) => void;
  onArchive: (note: KeepNote) => void;
  onTrash: (note: KeepNote) => void;
  onReorder: (sections: Array<{ key: string; notes: KeepNote[] }>) => void;
  onColor: (note: KeepNote, color: string | null) => void;
}) {
  const [live, setLive] = useState(sections);
  const [drag, setDrag] = useState<DragLive | null>(null);
  const skipOpen = useRef(false);
  const start = useRef<{ id: string; x: number; y: number } | null>(null);
  const origin = useRef<Array<{ key: string; notes: KeepNote[] }> | null>(null);
  const zoneRefs = useRef(new Map<string, HTMLElement | null>());
  const liveRef = useRef(live);
  liveRef.current = live;

  useEffect(() => {
    if (drag) return;
    setLive(sections);
  }, [sections, drag]);

  function handleOpen(note: KeepNote) {
    if (skipOpen.current) return;
    onOpen(note);
  }

  function placeAt(
    id: string,
    zoneKey: string,
    index: number,
    lists: Array<{ key: string; notes: KeepNote[]; meta?: KeepBoardSection }>,
  ) {
    const all = lists.flatMap((s) => s.notes);
    const note = all.find((n) => n.id === id);
    if (!note) return lists;
    return lists.map((s) => {
      const nextNotes = s.notes.filter((n) => n.id !== id);
      if (s.key === zoneKey) {
        nextNotes.splice(Math.max(0, Math.min(index, nextNotes.length)), 0, note);
      }
      return { ...s, notes: nextNotes };
    });
  }

  function applyPoint(id: string, x: number, y: number) {
    const order = liveRef.current.map((s) => s.key);
    const zoneKey = sectionKeyFromPoint(x, y, zoneRefs.current, order);
    const root = zoneRefs.current.get(zoneKey) ?? null;
    const els = [...(root?.querySelectorAll<HTMLElement>("[data-keep-id]") ?? [])].filter(
      (el) => el.dataset.keepId !== id && !el.closest("[data-keep-float]"),
    );
    const index = insertIndexAtPoint(x, y, els);
    const next = placeAt(id, zoneKey, index, liveRef.current);
    if (sameSections(next, liveRef.current)) return;
    setLive(next);
  }

  function onCardPointerDown(note: KeepNote, event: ReactPointerEvent) {
    if (event.button !== 0) return;
    start.current = { id: note.id, x: event.clientX, y: event.clientY };
    const target = event.currentTarget as HTMLElement;
    const move = (e: PointerEvent) => {
      const s = start.current;
      if (!s) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (!origin.current) {
        if (dx * dx + dy * dy < 64) return;
        skipOpen.current = true;
        origin.current = liveRef.current.map((sec) => ({ key: sec.key, notes: sec.notes }));
        document.body.style.userSelect = "none";
        const r = target.getBoundingClientRect();
        setDrag({
          id: note.id,
          note,
          w: r.width,
          h: r.height,
          x: e.clientX - (e.clientX - r.left),
          y: e.clientY - (e.clientY - r.top),
          grabX: e.clientX - r.left,
          grabY: e.clientY - r.top,
        });
        try {
          target.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
      setDrag((d) => (d ? { ...d, x: e.clientX - d.grabX, y: e.clientY - d.grabY } : d));
      applyPoint(note.id, e.clientX, e.clientY);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      const started = Boolean(origin.current);
      const before = origin.current;
      const after = liveRef.current.map((sec) => ({ key: sec.key, notes: sec.notes }));
      start.current = null;
      origin.current = null;
      document.body.style.userSelect = "";
      setDrag(null);
      if (!started) return;
      window.setTimeout(() => {
        skipOpen.current = false;
      }, 160);
      if (!before) return;
      if (sameSections(before, after)) return;
      onReorder(after);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  return (
    <div className="space-y-6">
      {live.map((section) => {
        const showLabel =
          section.alwaysShowLabel ||
          Boolean(section.header) ||
          Boolean(drag) ||
          (section.showLabel ?? section.notes.length > 0);
        return (
          <section key={section.key}>
            {showLabel ? (
              <div className="mb-2 flex min-h-6 items-center justify-between gap-2">
                {section.header ?? (
                  <p className="text-xs font-semibold text-muted-foreground">{section.label}</p>
                )}
              </div>
            ) : null}
            <div
              ref={(el) => {
                zoneRefs.current.set(section.key, el);
              }}
              className={section.notes.length === 0 ? "min-h-10" : GRID}
            >
              {section.notes.map((note) => (
                <KeepCard
                  key={note.id}
                  note={note}
                  ghost={drag?.id === note.id}
                  onOpen={() => handleOpen(note)}
                  onPin={onPin ? () => onPin(note) : undefined}
                  onArchive={() => onArchive(note)}
                  onTrash={() => onTrash(note)}
                  onColor={(color) => onColor(note, color)}
                  onMovePointerDown={(e) => onCardPointerDown(note, e)}
                />
              ))}
            </div>
            {section.footer}
          </section>
        );
      })}
      {drag && typeof document !== "undefined"
        ? createPortal(
            <div
              data-keep-float=""
              className="pointer-events-none fixed z-[80]"
              style={{ left: drag.x, top: drag.y, width: drag.w }}
            >
              <KeepCard note={drag.note} onOpen={() => undefined} floating />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
