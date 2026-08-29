import { cn } from "@/lib/utils";

export function SalsichaBar({
  ratio,
  color,
  className,
}: {
  ratio: number;
  color?: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, ratio * 100));
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-secondary", className)}>
      <div
        className="h-full rounded-full bg-primary"
        style={{
          width: `${pct}%`,
          background: color || undefined,
        }}
      />
    </div>
  );
}
