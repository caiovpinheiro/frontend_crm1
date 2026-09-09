import { Hash } from "lucide-react";

import { cn } from "@/lib/utils";

import {
  getOrbitaAvatarTone,
  getOrbitaChannelTonal,
  normalizeAvatarUrl,
  PRESENCE_DOT,
  type ChatPerson,
} from "./helpers";

const sizePx = {
  xs: 28,
  sm: 36,
  md: 44,
  lg: 56,
  xl: 80,
} as const;

export function Avatar({
  person,
  size = "md",
  showPresence = false,
  className,
}: {
  person: ChatPerson;
  size?: keyof typeof sizePx;
  showPresence?: boolean;
  className?: string;
}) {
  const px = sizePx[size];
  const tone = getOrbitaAvatarTone(person.id);
  const imageUrl = normalizeAvatarUrl(person.avatarUrl);
  const dotSize = Math.max(10, Math.round(px * 0.26));

  return (
    <div
      data-orbita-avatar
      className={cn("relative shrink-0 overflow-visible", className)}
      style={{ width: px, height: px }}
      title={person.name}
    >
      <div
        className="relative flex size-full items-center justify-center overflow-hidden font-display font-bold leading-none"
        style={{
          background: tone.bg,
          color: tone.fg,
          fontSize: Math.round(px * 0.36),
          borderRadius: "50%",
        }}
      >
        <span aria-hidden={Boolean(imageUrl)}>{person.initials}</span>
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={person.name}
            className="absolute inset-0 size-full object-cover"
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : null}
      </div>
      {showPresence ? (
        <span
          aria-hidden
          className="absolute -bottom-px -right-px rounded-full border-2 border-[var(--orbita-chrome)] shadow-sm"
          style={{
            width: dotSize,
            height: dotSize,
            backgroundColor: PRESENCE_DOT[person.presence],
          }}
        />
      ) : null}
    </div>
  );
}

export function GroupGlyph({ seed, size = 40 }: { seed: string; size?: number }) {
  const tone = getOrbitaChannelTonal(seed);
  return (
    <div
      className="grid shrink-0 place-items-center"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: tone.bg,
        color: tone.fg,
      }}
    >
      <Hash className="h-4 w-4" />
    </div>
  );
}

export function AvatarStack({ people, size = "sm" }: { people: ChatPerson[]; size?: keyof typeof sizePx }) {
  const shown = people.slice(0, 3);
  return (
    <div className="flex -space-x-3" aria-hidden="true">
      {shown.map((p) => (
        <div key={p.id} className="rounded-full ring-2 ring-[var(--orbita-chrome)]">
          <Avatar person={p} size={size} />
        </div>
      ))}
    </div>
  );
}
