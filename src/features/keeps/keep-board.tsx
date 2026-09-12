"use client";

import type { ReactNode } from "react";

import { KEEP_SECTION_HEADING_CLASS } from "./helpers";
import type { KeepLayout, KeepNote } from "./types";

const MASONRY = "columns-1 sm:columns-2 lg:columns-3 xl:columns-4 [column-gap:0.625rem]";
const LIST = "flex flex-col gap-2";

function Section({
  title,
  visible,
  layout,
  children,
}: {
  title: string;
  visible: boolean;
  layout: KeepLayout;
  children: ReactNode;
}) {
  if (!visible) return null;
  return (
    <section>
      {title ? <p className={KEEP_SECTION_HEADING_CLASS}>{title}</p> : null}
      <div className={layout === "list" ? LIST : MASONRY}>{children}</div>
    </section>
  );
}

export function KeepBoard({
  pinned,
  rest,
  layout,
  renderNote,
}: {
  pinned: KeepNote[];
  rest: KeepNote[];
  layout: KeepLayout;
  renderNote: (note: KeepNote) => ReactNode;
}) {
  const itemClass = layout === "grid" ? "mb-2.5 break-inside-avoid" : undefined;

  return (
    <div className="space-y-5">
      <Section title="Fixadas" visible={pinned.length > 0} layout={layout}>
        {pinned.map((note) => (
          <div key={note.id} className={itemClass}>
            {renderNote(note)}
          </div>
        ))}
      </Section>
      <Section title={pinned.length > 0 ? "Outras" : ""} visible={rest.length > 0} layout={layout}>
        {rest.map((note) => (
          <div key={note.id} className={itemClass}>
            {renderNote(note)}
          </div>
        ))}
      </Section>
    </div>
  );
}
