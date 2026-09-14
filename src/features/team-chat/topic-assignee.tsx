"use client";

import { useMemo, useState } from "react";
import { User } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { Avatar } from "./avatar";
import { getOrbitaAvatarTone, initialsOf, toPerson } from "./helpers";
import { useTeamChatColleagues } from "./hooks";
import type { TeamChatPerson } from "./types";

export type TopicAssigneeValue = {
  id: string | null;
  name: string | null;
};

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

function MiniFace({ id, name }: { id: string; name: string }) {
  const tone = getOrbitaAvatarTone(id);
  return (
    <span
      className="grid size-5 shrink-0 place-items-center rounded-full text-[9px] font-bold leading-none"
      style={{ background: tone.bg, color: tone.fg }}
      aria-hidden
    >
      {initialsOf(name).slice(0, 1)}
    </span>
  );
}

export function TopicAssigneePicker({
  assigneeId,
  assigneeName,
  onChange,
  disabled,
  className,
}: {
  assigneeId: string | null;
  assigneeName: string | null;
  onChange: (next: TopicAssigneeValue) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { data, isLoading } = useTeamChatColleagues(true);
  const [q, setQ] = useState("");
  const people = data?.colleagues ?? [];
  const selected =
    people.find((person) => person.id === assigneeId) ??
    (assigneeId
      ? ({
          id: assigneeId,
          name: assigneeName || "Colega",
          avatarUrl: null,
        } satisfies Pick<TeamChatPerson, "id" | "name" | "avatarUrl">)
      : null);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return people;
    return people.filter((person) => person.name.toLowerCase().includes(needle));
  }, [people, q]);

  return (
    <DropdownMenu onOpenChange={(open) => !open && setQ("")}>
      <DropdownMenuTrigger
        disabled={disabled}
        aria-label={selected ? `Responsável: ${selected.name}` : "Definir responsável"}
        className={cn(
          "h-7 max-w-[9.5rem] gap-1 rounded-full border border-border bg-muted px-1.5 text-[11px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground",
          selected && "text-foreground",
          className,
        )}
      >
        {selected ? (
          <>
            <MiniFace id={selected.id} name={selected.name} />
            <span className="min-w-0 truncate">{firstName(selected.name)}</span>
          </>
        ) : (
          <>
            <User className="size-3.5 shrink-0" />
            <span className="truncate">Responsável</span>
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 p-1">
        <DropdownMenuLabel className="py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Responsável do tópico
        </DropdownMenuLabel>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar no sistema"
          className="mb-1 h-8 w-full rounded-lg border border-border bg-card px-2 text-[12px] text-foreground outline-none placeholder:text-muted-foreground"
        />
        <DropdownMenuItem
          onClick={() => onChange({ id: null, name: null })}
          className="text-[12px] text-muted-foreground"
        >
          Sem responsável
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="max-h-56 overflow-y-auto">
          {isLoading && people.length === 0 ? (
            <p className="px-2 py-3 text-[12px] text-muted-foreground">Carregando o time…</p>
          ) : visible.length === 0 ? (
            <p className="px-2 py-3 text-[12px] text-muted-foreground">Nenhum colega encontrado.</p>
          ) : (
            visible.map((person) => (
              <DropdownMenuItem
                key={person.id}
                onClick={() => onChange({ id: person.id, name: person.name })}
                className={cn(
                  "text-[13px]",
                  person.id === assigneeId && "bg-primary/10 text-primary",
                )}
              >
                <Avatar person={toPerson(person)} size="xs" />
                <span className="min-w-0 truncate">{person.name}</span>
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
