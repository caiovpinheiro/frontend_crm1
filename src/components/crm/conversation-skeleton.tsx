import { cn } from "@/lib/utils";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Base da conversa enquanto as mensagens (e, no Flow, o deal) ainda
 * chegam. Sem marca — o chrome do painel já está no lugar e o composer
 * não “pula” depois do loader.
 */

function Bone({ className }: { className?: string }) {
  return (
    <Skeleton
      className={cn("rounded-[var(--radius-lg)] bg-[var(--glass-bg-strong)]", className)}
    />
  );
}

export function ConversationThreadSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Carregando mensagens"
      aria-busy="true"
      className={cn(
        "flex min-h-0 flex-1 flex-col justify-end gap-3 px-4 pb-6 pt-4",
        className,
      )}
    >
      <div className="flex items-end gap-2">
        <Bone className="size-8 shrink-0 rounded-full" />
        <div className="space-y-1.5">
          <Bone className="h-9 w-[13.5rem]" />
          <Bone className="h-7 w-40" />
        </div>
      </div>
      <div className="flex justify-end">
        <Bone className="h-11 w-[16.5rem]" />
      </div>
      <div className="flex items-end gap-2">
        <Bone className="size-8 shrink-0 rounded-full" />
        <Bone className="h-16 w-[18rem] max-w-[70%]" />
      </div>
      <div className="flex justify-end">
        <div className="space-y-1.5">
          <Bone className="ml-auto h-8 w-44" />
          <Bone className="h-10 w-56" />
        </div>
      </div>
    </div>
  );
}

export function ConversationComposerSkeleton() {
  return (
    <div
      aria-hidden
      className="shrink-0 border-t border-[var(--glass-border-subtle)] bg-[var(--glass-bg-panel)]/95 px-6 pb-2 pt-2"
    >
      <div className="mb-2 flex gap-2">
        <Bone className="h-6 w-24 rounded-full" />
        <Bone className="h-6 w-28 rounded-full" />
      </div>
      <Bone className="h-11 w-full rounded-full" />
    </div>
  );
}

/** Anel no topo do thread enquanto o scroll-up pede histórico. Sticky
 *  para não sumir quando o prepend preserva o ponto de leitura. */
export function ConversationHistoryLoadRing({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Carregando mensagens anteriores"
      className={cn(
        "sticky top-8 z-[16] flex shrink-0 justify-center py-2",
        className,
      )}
    >
      <span
        className="flex size-8 items-center justify-center rounded-full bg-background/90"
        aria-hidden
      >
        <span className="size-5 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
      </span>
    </div>
  );
}

/** Painel inteiro (header + thread + composer) — troca de card no Flow. */
export function ConversationPaneSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Carregando conversa"
      aria-busy="true"
      className={cn("flex h-full min-h-0 flex-1 flex-col overflow-hidden", className)}
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-[var(--glass-border-subtle)] px-4 py-2">
        <Bone className="size-11 shrink-0 rounded-full" />
        <Bone className="h-8 min-w-0 flex-1 max-w-md rounded-full" />
      </div>
      <ConversationThreadSkeleton />
      <ConversationComposerSkeleton />
    </div>
  );
}
