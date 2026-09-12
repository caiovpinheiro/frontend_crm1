import { cn } from "@/lib/utils"

type BadgeVariant = 'enterprise' | 'lead' | 'success'

interface BadgeGlassProps {
  variant: BadgeVariant
  children: React.ReactNode
  className?: string
}

const variantClasses: Record<BadgeVariant, string> = {
  enterprise: "border-transparent bg-secondary text-secondary-foreground",
  lead: "border-transparent bg-accent text-accent-foreground",
  success: "border-transparent bg-success text-success-foreground",
}

/**
 * Pill semântica do DS v2 — **sempre `rounded-full`**.
 *
 * Quando usar:
 * - Rótulos de **contexto de negócio** com significado fixo (ENTERPRISE, LEAD, ATIVO).
 * - Status curtos em cards de conversa/contato onde a forma pill reforça “selo”.
 *
 * Quando **não** usar (prefira `Chip`):
 * - Tags de usuário, filtros ativos, categorias de produto, estágios editáveis.
 * - Qualquer label repetível em listas/tabelas — `Chip` usa `rounded-[var(--radius-sm)]`.
 *
 * @see Chip — tags/filtros com cantos sm
 */
export function BadgeGlass({ variant, children, className }: BadgeGlassProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  )
}
