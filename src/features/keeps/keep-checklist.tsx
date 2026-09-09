"use client";

import { useEffect, useRef, useState } from "react";
import { GripVertical, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import type { KeepDoc } from "./types";

export type KeepCheckItem = { id: string; text: string; checked: boolean };

function newId() {
  return `li-${Math.random().toString(36).slice(2, 9)}`;
}

function textFromNode(node: { text?: string; content?: unknown[] } | undefined): string {
  if (!node) return "";
  if (node.text) return node.text;
  if (!Array.isArray(node.content)) return "";
  return node.content.map((c) => textFromNode(c as { text?: string; content?: unknown[] })).join("");
}

export function checklistFromDoc(doc: KeepDoc | undefined): KeepCheckItem[] | null {
  const content = doc?.content;
  if (!Array.isArray(content) || content.length === 0) return null;
  const list = content.find((n) => n && typeof n === "object" && (n as { type?: string }).type === "taskList") as
    | { type: string; content?: Array<{ type?: string; attrs?: { checked?: boolean }; content?: unknown[] }> }
    | undefined;
  if (!list?.content) return null;
  const items = list.content
    .filter((n) => n.type === "taskItem")
    .map((n) => ({
      id: newId(),
      checked: Boolean(n.attrs?.checked),
      text: textFromNode({ content: n.content }),
    }));
  return items.length ? items : [{ id: newId(), text: "", checked: false }];
}

export function isChecklistDoc(doc: KeepDoc | undefined): boolean {
  return checklistFromDoc(doc) !== null;
}

export function checklistToDoc(items: KeepCheckItem[]): KeepDoc {
  const rows = items.length ? items : [{ id: newId(), text: "", checked: false }];
  return {
    type: "doc",
    content: [
      {
        type: "taskList",
        content: rows.map((item) => ({
          type: "taskItem",
          attrs: { checked: item.checked },
          content: [
            {
              type: "paragraph",
              content: item.text ? [{ type: "text", text: item.text }] : [],
            },
          ],
        })),
      },
    ],
  };
}

export function KeepChecklist({
  items,
  onChange,
  autoFocus,
}: {
  items: KeepCheckItem[];
  onChange: (items: KeepCheckItem[]) => void;
  autoFocus?: boolean;
}) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [focusIndex, setFocusIndex] = useState<number | null>(autoFocus ? 0 : null);

  useEffect(() => {
    if (focusIndex == null) return;
    inputRefs.current[focusIndex]?.focus();
  }, [focusIndex, items.length]);

  function patch(index: number, next: Partial<KeepCheckItem>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...next } : item)));
  }

  function addAt(index: number) {
    const next = [...items];
    next.splice(index, 0, { id: newId(), text: "", checked: false });
    onChange(next);
    setFocusIndex(index);
  }

  function removeAt(index: number) {
    if (items.length <= 1) {
      onChange([{ id: newId(), text: "", checked: false }]);
      setFocusIndex(0);
      return;
    }
    onChange(items.filter((_, i) => i !== index));
    setFocusIndex(Math.max(0, index - 1));
  }

  return (
    <div className="flex flex-col">
      {items.map((item, index) => (
        <div
          key={item.id}
          className="flex items-center gap-1.5 border-b border-border py-1.5"
        >
          <span className="flex size-6 shrink-0 items-center justify-center text-muted-foreground" aria-hidden>
            <GripVertical className="size-3.5" />
          </span>
          <input
            type="checkbox"
            checked={item.checked}
            onChange={(e) => patch(index, { checked: e.target.checked })}
            className="size-4 shrink-0 rounded border-border accent-primary"
            aria-label="Concluir item"
          />
          <input
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            value={item.text}
            onChange={(e) => patch(index, { text: e.target.value })}
            placeholder="Item da lista"
            className={cn(
              "min-w-0 flex-1 bg-transparent py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground",
              item.checked && "text-muted-foreground line-through",
            )}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addAt(index + 1);
              }
              if (e.key === "Backspace" && item.text === "") {
                e.preventDefault();
                removeAt(index);
              }
            }}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() => addAt(items.length)}
        className="flex items-center gap-1.5 py-2 text-left text-sm text-muted-foreground hover:text-foreground"
      >
        <span className="flex size-6 shrink-0 items-center justify-center">
          <Plus className="size-4" />
        </span>
        <span className="size-4 shrink-0" aria-hidden />
        Item da lista
      </button>
    </div>
  );
}
