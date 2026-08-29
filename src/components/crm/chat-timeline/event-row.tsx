"use client";

import { useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRightLeft,
  CircleCheck,
  ListChecks,
  LogIn,
  LogOut,
  FileText,
  Sparkles,
  Tag,
  UserPlus,
} from "lucide-react";

import { useTeamUsersQuery } from "@/features/shared/queries/team-users";
import { cn } from "@/lib/utils";

import {
  eventActorIsSubject,
  isConversationActorAsAuthorText,
  normalizeConversationEventText,
} from "./classify";
import {
  isGenericHumanEventActor,
  resolveEventActorLabel,
} from "./event-actor";
import type { ConversationEventAction } from "./types";

const ACTION_ICON: Record<ConversationEventAction, LucideIcon> = {
  distribuicao: UserPlus,
  atribuicao: UserPlus,
  transferencia: ArrowRightLeft,
  status: CircleCheck,
  tabulacao: ListChecks,
  tag: Tag,
  entrada: LogIn,
  saida: LogOut,
  ia: Sparkles,
  template: FileText,
};

const ACTION_ICON_CLASS: Record<ConversationEventAction, string> = {
  distribuicao: "text-[var(--color-info)]",
  atribuicao: "text-[var(--color-info)]",
  transferencia: "text-[var(--color-warning)]",
  status: "text-[var(--color-success)]",
  tabulacao: "text-[var(--color-primary)]",
  tag: "text-[var(--color-lavender)]",
  entrada: "text-[var(--color-success)]",
  saida: "text-[var(--color-danger)]",
  ia: "text-[var(--color-lavender)]",
  template: "text-[var(--color-info)]",
};

export type EventRowProps = {
  action?: ConversationEventAction;
  /** Override do ícone (ex.: ligação atendida / não atendida). */
  icon?: LucideIcon;
  /** Override da cor do ícone (ex.: ligação iniciada vs encerrada). */
  iconClassName?: string;
  text: string;
  actor: string;
  /** User.id do agente — usado quando `actor` veio genérico ("Agente"). */
  actorId?: string | null;
  time: string;
  className?: string;
};

export function EventRow({
  action,
  icon,
  iconClassName,
  text,
  actor,
  actorId,
  time,
  className,
}: EventRowProps) {
  const hasActor = Boolean(actor?.trim()) || Boolean(actorId);
  const needsLookup = hasActor && isGenericHumanEventActor(actor) && Boolean(actorId);
  const { data: teamUsers } = useTeamUsersQuery(needsLookup);
  const displayActor = useMemo(() => {
    if (!hasActor) return "";
    const fromUser = actorId
      ? teamUsers?.find((u) => u.id === actorId)
      : undefined;
    return resolveEventActorLabel(actor, {
      name: fromUser?.name,
      email: fromUser?.email,
    });
  }, [actor, actorId, hasActor, teamUsers]);
  const Icon = icon ?? (action ? ACTION_ICON[action] : undefined) ?? Sparkles;
  const displayText = normalizeConversationEventText(text, displayActor);
  const showActor =
    Boolean(displayActor) && !eventActorIsSubject(displayText, displayActor);
  const actorSep = isConversationActorAsAuthorText(displayText) ? "por" : "·";
  const iconTone =
    iconClassName ??
    (action ? ACTION_ICON_CLASS[action] : undefined) ??
    "text-[var(--color-primary)]";

  return (
    <div
      className={cn(
        "flex w-full items-center gap-2 py-1.5 sm:gap-3",
        className,
      )}
    >
      <span className="h-px min-w-4 flex-1 bg-border" aria-hidden />
      <p
        className="flex min-w-0 max-w-[min(100%,36rem)] flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-center text-[10px] leading-snug text-muted-foreground"
        aria-label={
          showActor ? `${displayText} ${actorSep} ${displayActor}` : displayText
        }
      >
        <Icon
          className={cn("size-3 shrink-0", iconTone)}
          strokeWidth={2}
          aria-hidden
        />
        <span className="text-foreground/80">{displayText}</span>
        {showActor ? (
          <span className="text-muted-foreground">
            {actorSep} {displayActor}
          </span>
        ) : null}
        {time ? (
          <time className="text-[9px] tabular-nums text-muted-foreground">
            {time}
          </time>
        ) : null}
      </p>
      <span className="h-px min-w-4 flex-1 bg-border" aria-hidden />
    </div>
  );
}
