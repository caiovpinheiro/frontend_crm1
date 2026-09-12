import { cn } from "@/lib/utils"
import {
  type AvatarGlassColor,
  avatarInitials,
  getAvatarGlassColor,
} from "@/lib/avatar"

type AvatarSize = "sm" | "md" | "lg"
type AvatarStatus = "online" | "offline" | "none"

interface AvatarGlassProps {
  initials?: string
  name?: string | null
  imageUrl?: string | null
  size?: AvatarSize
  color?: AvatarGlassColor
  /** Seed para cor determinística quando `color` não é passado. */
  seed?: string
  status?: AvatarStatus
  className?: string
}

const sizeClasses: Record<AvatarSize, string> = {
  sm: "h-8 w-8 text-[11px]",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
}

const sizePx: Record<AvatarSize, number> = {
  sm: 32,
  md: 40,
  lg: 56,
}

const colorStyle: Record<AvatarGlassColor, { bg: string; fg: string }> = {
  blue: { bg: "var(--avatar-2)", fg: "var(--avatar-2-foreground)" },
  teal: { bg: "var(--avatar-3)", fg: "var(--avatar-3-foreground)" },
  orange: { bg: "var(--avatar-4)", fg: "var(--avatar-4-foreground)" },
  purple: { bg: "var(--avatar-2)", fg: "var(--avatar-2-foreground)" },
  pink: { bg: "var(--avatar-1)", fg: "var(--avatar-1-foreground)" },
  coral: { bg: "var(--avatar-5)", fg: "var(--avatar-5-foreground)" },
}

export function AvatarGlass({
  initials: initialsProp,
  name,
  imageUrl,
  size = "md",
  color,
  seed,
  status = "none",
  className,
}: AvatarGlassProps) {
  const resolvedColor =
    color ?? getAvatarGlassColor(seed ?? name ?? initialsProp ?? "?")
  const initials =
    initialsProp ?? avatarInitials(name ?? "?")

  return (
    <div className={cn("relative inline-flex shrink-0", className)} style={{ width: sizePx[size], height: sizePx[size] }}>
      <div
        className={cn(
          "flex size-full items-center justify-center overflow-hidden rounded-full font-bold uppercase",
          sizeClasses[size],
        )}
        style={{
          backgroundColor: colorStyle[resolvedColor].bg,
          color: colorStyle[resolvedColor].fg,
        }}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={name ?? initials}
            className="size-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          initials.slice(0, 2).toUpperCase()
        )}
      </div>
      {status !== "none" && (
        <span
          className={cn(
            "absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-background",
            status === "online" ? "bg-channel-online" : "bg-muted-foreground",
          )}
        />
      )}
    </div>
  )
}
