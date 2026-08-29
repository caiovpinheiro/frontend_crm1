import {
  LIST_CARD_ROW_CLASS,
  LIST_CARD_STACK_CLASS,
} from "@/components/crm/sortable-header";

/** Shell instantâneo da lista — sem overlay de viewport (padrão DataCrazy). */
export function AutomationsListSkeleton() {
  return (
    <div className={LIST_CARD_STACK_CLASS} aria-busy aria-label="Carregando automações">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className={LIST_CARD_ROW_CLASS}>
          <div className="flex items-center gap-3">
            <div className="size-10 shrink-0 animate-pulse rounded-xl bg-muted" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3.5 w-2/5 max-w-[220px] animate-pulse rounded-md bg-muted" />
              <div className="h-3 w-3/5 max-w-[320px] animate-pulse rounded-md bg-muted" />
            </div>
            <div className="h-6 w-16 shrink-0 animate-pulse rounded-full bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}
