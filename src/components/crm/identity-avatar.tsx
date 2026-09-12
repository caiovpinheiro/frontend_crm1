import { cn } from "@/lib/utils";
import {
  avatarInitials,
  getAvatarTokenIndex,
  type AvatarTokenIndex,
} from "@/lib/avatar";

type AvatarSize = "sm" | "md" | "lg";

const sizeClass: Record<AvatarSize, string> = {
  sm: "size-8 text-[11px]",
  md: "size-10 text-sm",
  lg: "size-12 text-base",
};

interface IdentityAvatarProps {
  name?: string | null;
  seed?: string | null;
  initials?: string;
  imageUrl?: string | null;
  size?: AvatarSize;
  online?: boolean;
  className?: string;
}

export function IdentityAvatar({
  name,
  seed,
  initials: initialsProp,
  imageUrl,
  size = "md",
  online = false,
  className,
}: IdentityAvatarProps) {
  const index: AvatarTokenIndex = getAvatarTokenIndex(seed ?? name ?? initialsProp ?? "?");
  const initials = (initialsProp ?? avatarInitials(name ?? seed ?? "?")).slice(0, 2).toUpperCase();

  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span
        className={cn(
          "flex items-center justify-center overflow-hidden rounded-full font-bold uppercase",
          sizeClass[size],
        )}
        style={{
          backgroundColor: `var(--avatar-${index})`,
          color: `var(--avatar-${index}-foreground)`,
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
          initials
        )}
      </span>
      {online ? (
        <span
          aria-hidden
          className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-background bg-channel-online"
        />
      ) : null}
    </span>
  );
}
