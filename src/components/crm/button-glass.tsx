import { cn } from "@/lib/utils"
import * as React from "react"
import { forwardRef } from "react"
import { TooltipGlass } from "@/components/crm/tooltip-glass"

type ButtonGlassVariant = 'primary' | 'glass' | 'danger' | 'icon'
type ButtonGlassSize = 'default' | 'sm' | 'icon'

function mergeRefs<T>(...refs: (React.Ref<T> | undefined)[]): React.RefCallback<T> {
  return (value) => {
    for (const ref of refs) {
      if (ref == null) continue
      if (typeof ref === "function") ref(value)
      else (ref as React.MutableRefObject<T | null>).current = value
    }
  }
}

function Slot({
  children,
  ...props
}: React.ComponentPropsWithoutRef<"span"> & {
  children: React.ReactElement
  ref?: React.Ref<unknown>
}) {
  const { ref: refFromProps, ...rest } = props
  if (!React.isValidElement(children)) {
    throw new Error("Slot expects a single valid React element child.")
  }
  const child = children as React.ReactElement<{
    ref?: React.Ref<unknown>
    className?: string
    style?: React.CSSProperties
  }>
  return React.cloneElement(child, {
    ...rest,
    ...child.props,
    ref: mergeRefs(refFromProps as React.Ref<unknown> | undefined, child.props.ref),
    className: cn((rest as { className?: string }).className, child.props.className),
    style: {
      ...(rest as { style?: React.CSSProperties }).style,
      ...child.props.style,
    },
  } as never)
}

export function buttonGlassClassName({
  variant = 'glass',
  size = 'default',
  className,
}: {
  variant?: ButtonGlassVariant
  size?: ButtonGlassSize
  className?: string
}) {
  return cn(
    "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-display font-semibold outline-none transition-all duration-150 disabled:pointer-events-auto disabled:opacity-50 disabled:hover:translate-y-0",
    variant === 'primary' && "bg-primary text-primary-foreground hover:bg-primary-dark",
    variant === 'glass' && "bg-[var(--glass-bg-strong)] backdrop-blur-md border border-[var(--glass-border)] text-[var(--text-primary)] shadow-[var(--glass-shadow-sm)] hover:bg-[var(--glass-bg-overlay)]",
    variant === 'danger' && "bg-[var(--color-destructive)] text-[var(--color-destructive-foreground)] shadow-[0_4px_14px_rgba(239,68,68,0.35)] hover:bg-[color-mix(in_srgb,var(--color-destructive)_88%,black)] hover:-translate-y-0.5",
    variant === 'icon' && "bg-transparent text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--brand-primary)]",
    size === 'default' && "px-4.5 py-2 text-[13px]",
    size === 'sm' && "px-3 py-1.5 text-xs",
    size === 'icon' && "h-9 w-9 p-0 rounded-[var(--radius-md)] text-[17px]",
    className,
  )
}

interface ButtonGlassProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonGlassVariant
  size?: ButtonGlassSize
  children: React.ReactNode
  /** Mescla estilos no filho (ex.: `<Link>`) preservando prefetch e nova aba. */
  asChild?: boolean
  /** Tooltip do DS v2. Substitui o atributo nativo `title` do browser. */
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right'
}

export const ButtonGlass = forwardRef<HTMLButtonElement, ButtonGlassProps>(
  (
    {
      variant = 'glass',
      size = 'default',
      className,
      children,
      title,
      tooltipSide = 'top',
      asChild = false,
      ...props
    },
    ref,
  ) => {
    const classes = buttonGlassClassName({ variant, size, className })

    const rendered = asChild ? (
      (() => {
        if (!React.isValidElement(children)) {
          throw new Error("asChild requires a single React element child.")
        }
        return (
          <Slot
            ref={ref as React.Ref<unknown>}
            className={classes}
            {...(props as React.ComponentPropsWithoutRef<"span">)}
          >
            {children}
          </Slot>
        )
      })()
    ) : (
      <button ref={ref} className={classes} {...props}>
        {children}
      </button>
    )

    if (!title) return rendered
    return <TooltipGlass label={title} side={tooltipSide}>{rendered}</TooltipGlass>
  },
)
ButtonGlass.displayName = "ButtonGlass"
