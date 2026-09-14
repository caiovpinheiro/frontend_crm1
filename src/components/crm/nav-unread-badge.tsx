import { cn } from "@/lib/utils";

export function NavUnreadBadge({
  count,
  pulse = false,
  contrast = false,
  className,
}: {
  count: number;
  pulse?: boolean;
  /** Texto/fundo invertidos — item ativo da NavRail expandida. */
  contrast?: boolean;
  className?: string;
}) {
  if (count <= 0 && !pulse) return null;
  const label = count > 99 ? "99+" : String(count);

  return (
    <span
      className={cn("relative isolate inline-flex shrink-0", className)}
      aria-hidden
    >
      {pulse ? (
        <span
          className={cn(
            "absolute inset-0 animate-ping rounded-full opacity-70",
            contrast ? "bg-sidebar-primary-foreground" : "bg-primary",
          )}
        />
      ) : null}
      {count > 0 ? (
        <span
          className={cn(
            "relative flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 font-display text-[10px] font-bold leading-none tabular-nums",
            contrast
              ? "bg-sidebar-primary-foreground text-sidebar-primary"
              : "bg-primary text-primary-foreground",
          )}
        >
          {label}
        </span>
      ) : (
        <span
          className={cn(
            "relative block h-2.5 w-2.5 rounded-full",
            contrast ? "bg-sidebar-primary-foreground" : "bg-primary",
          )}
        />
      )}
    </span>
  );
}
