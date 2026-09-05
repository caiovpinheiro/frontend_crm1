"use client";

import {
  BookOpen,
  Inbox,
  Radar,
  ShieldCheck,
  Target,
  User,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

import { SECTION_META, type AgentSectionId } from "./types";

const SECTION_ICONS: Record<AgentSectionId, LucideIcon> = {
  identity: User,
  rules: ShieldCheck,
  scope: Target,
  tools: Wrench,
  piloting: Radar,
  inbox: Inbox,
  knowledge: BookOpen,
};

const SECTIONS: AgentSectionId[] = [
  "identity",
  "rules",
  "scope",
  "tools",
  "piloting",
  "inbox",
  "knowledge",
];

export function SidebarNav({
  active,
  onChange,
}: {
  active: AgentSectionId;
  onChange: (id: AgentSectionId) => void;
}) {
  return (
    <nav
      className="flex w-[220px] shrink-0 flex-col gap-0.5 border-r border-border bg-card/60 p-3"
      aria-label="Seções do agente"
    >
      {SECTIONS.map((id) => {
        const Icon = SECTION_ICONS[id];
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={cn(
              "flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors",
              isActive
                ? "border-l-2 border-primary bg-primary/10 font-medium text-primary"
                : "border-l-2 border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span>{SECTION_META[id].label}</span>
          </button>
        );
      })}
    </nav>
  );
}
