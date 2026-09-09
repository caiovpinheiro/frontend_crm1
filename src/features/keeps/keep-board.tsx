"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";

import { KeepCard } from "./keep-card";
import type { KeepNote } from "./types";

const GRID = "grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

type Zone = "pinned" | "others";

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

function positions(ids: string[], pinned: boolean) {
  return ids.map((id, i) => ({ id, pinned, position: (i + 1) * 1000 }));
}

function sameOrder(a: KeepNote[], b: KeepNote[]) {
  return a.length === b.length && a.every((n, i) => n.id === b[i]?.id);
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

function zoneFromPoint(x: number, y: number, pinnedEl: HTMLElement | null, othersEl: HTMLElement | null): Zone {
  const pr = pinnedEl?.getBoundingClientRect();
  const or = othersEl?.getBoundingClientRect();
  if (pr && x >= pr.left && x <= pr.right && y >= pr.top && y <= pr.bottom) return "pinned";
  if (or && x >= or.left && x <= or.right && y >= or.top && y <= or.bottom) return "others";
  if (pr && y < (or?.top ?? pr.bottom + 40)) return "pinned";
  return "others";
}

export function KeepBoard({
  pinned,
  rest,
  onOpen,
  onPin,
  onArchive,
  onTrash,
  onReorder,
}: {
  pinned: KeepNote[];
  rest: KeepNote[];
  onOpen: (note: KeepNote) => void;
  onPin: (note: KeepNote) => void;
  onArchive: (note: KeepNote) => void;
  onTrash: (note: KeepNote) => void;
  onReorder: (items: Array<{ id: string; pinned: boolean; position: number }>) => void;
}) {
  const [livePinned, setPinned] = useState(pinned);
  const [liveRest, setRest] = useState(rest);
  const [drag, setDrag] = useState<DragLive | null>(null);
  const skipOpen = useRef(false);
  const start = useRef<{ id: string; x: number; y: number } | null>(null);
  const origin = useRef<{ pinned: KeepNote[]; rest: KeepNote[] } | null>(null);
  const pinnedRef = useRef<HTMLDivElement>(null);
  const othersRef = useRef<HTMLDivElement>(null);
  const livePinnedRef = useRef(livePinned);
  const liveRestRef = useRef(liveRest);
  livePinnedRef.current = livePinned;
  liveRestRef.current = liveRest;

  useEffect(() => {
    if (drag) return;
    setPinned(pinned);
    setRest(rest);
  }, [pinned, rest, drag]);

  function handleOpen(note: KeepNote) {
    if (skipOpen.current) return;
    onOpen(note);
  }

  function placeAt(id: string, zone: Zone, index: number, lists: { pinned: KeepNote[]; rest: KeepNote[] }) {
    const all = [...lists.pinned, ...lists.rest];
    const note = all.find((n) => n.id === id);
    if (!note) return lists;
    const nextPinned = lists.pinned.filter((n) => n.id !== id);
    const nextRest = lists.rest.filter((n) => n.id !== id);
    const dest = zone === "pinned" ? nextPinned : nextRest;
    dest.splice(Math.max(0, Math.min(index, dest.length)), 0, note);
    return { pinned: nextPinned, rest: nextRest };
  }

  function applyPoint(id: string, x: number, y: number) {
    const zone = zoneFromPoint(x, y, pinnedRef.current, othersRef.current);
    const root = zone === "pinned" ? pinnedRef.current : othersRef.current;
    const els = [...(root?.querySelectorAll<HTMLElement>("[data-keep-id]") ?? [])].filter(
      (el) => el.dataset.keepId !== id && !el.closest("[data-keep-float]"),
    );
    const index = insertIndexAtPoint(x, y, els);
    const next = placeAt(id, zone, index, { pinned: livePinnedRef.current, rest: liveRestRef.current });
    if (sameOrder(next.pinned, livePinnedRef.current) && sameOrder(next.rest, liveRestRef.current)) return;
    setPinned(next.pinned);
    setRest(next.rest);
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
        origin.current = { pinned: livePinnedRef.current, rest: liveRestRef.current };
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
      setDrag((d) =>
        d
          ? { ...d, x: e.clientX - d.grabX, y: e.clientY - d.grabY }
          : d,
      );
      applyPoint(note.id, e.clientX, e.clientY);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      const started = Boolean(origin.current);
      const before = origin.current;
      const afterPinned = livePinnedRef.current;
      const afterRest = liveRestRef.current;
      start.current = null;
      origin.current = null;
      document.body.style.userSelect = "";
      setDrag(null);
      if (!started) return;
      window.setTimeout(() => {
        skipOpen.current = false;
      }, 160);
      if (!before) return;
      if (sameOrder(before.pinned, afterPinned) && sameOrder(before.rest, afterRest)) return;
      onReorder([
        ...positions(
          afterPinned.map((n) => n.id),
          true,
        ),
        ...positions(
          afterRest.map((n) => n.id),
          false,
        ),
      ]);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  return (
    <div className="space-y-6">
      <section>
        {livePinned.length > 0 || drag ? (
          <p className="mb-2 text-xs font-semibold text-muted-foreground">Fixadas</p>
        ) : null}
        <div ref={pinnedRef} className={livePinned.length === 0 ? "min-h-10" : GRID}>
          {livePinned.map((note) => (
            <KeepCard
              key={note.id}
              note={note}
              ghost={drag?.id === note.id}
              onOpen={() => handleOpen(note)}
              onPin={() => onPin(note)}
              onArchive={() => onArchive(note)}
              onTrash={() => onTrash(note)}
              onMovePointerDown={(e) => onCardPointerDown(note, e)}
            />
          ))}
        </div>
      </section>
      <section>
        {livePinned.length > 0 ? (
          <p className="mb-2 text-xs font-semibold text-muted-foreground">Outras</p>
        ) : null}
        <div ref={othersRef} className={liveRest.length === 0 ? "min-h-10" : GRID}>
          {liveRest.map((note) => (
            <KeepCard
              key={note.id}
              note={note}
              ghost={drag?.id === note.id}
              onOpen={() => handleOpen(note)}
              onPin={() => onPin(note)}
              onArchive={() => onArchive(note)}
              onTrash={() => onTrash(note)}
              onMovePointerDown={(e) => onCardPointerDown(note, e)}
            />
          ))}
        </div>
      </section>
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
