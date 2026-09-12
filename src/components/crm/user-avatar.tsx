import { IdentityAvatar } from "@/components/crm/identity-avatar"
import { cn } from "@/lib/utils"

/**
 * Avatar canônico de pessoa interna (equipe, expediente, navrail, bolha).
 * Mesma face de `IdentityAvatar` (`--avatar-1..5` + foto). Não usar para
 * contato/cliente — esses usam `ChatAvatar` (mesma face + badge de canal).
 */
type UserAvatarStatus = "online" | "offline" | "away"

interface UserAvatarProps {
  name?: string | null
  /** Iniciais explícitas (sobrepõe o cálculo a partir de `name`). */
  initials?: string
  /** Foto do perfil — quando presente, sobrepõe as iniciais. */
  imageUrl?: string | null
  /** Seed estável (user id). Sem isso, a cor vem do nome. */
  seed?: string | null
  /** Diâmetro em px (default 40). */
  size?: number
  /** Bolinha de status no canto inferior direito. */
  status?: UserAvatarStatus | null
  /** Cor custom da bolinha de status (sobrepõe o mapa padrão). */
  statusColor?: string
  /** Anel de destaque (ex.: item ativo no navrail). */
  ring?: "none" | "active"
  /** @deprecated A face é sempre o token canônico; mantido por compat. */
  variant?: "default" | "sidebar"
  className?: string
  title?: string
}

const STATUS_DOT: Record<UserAvatarStatus, string> = {
  online: "var(--color-online)",
  offline: "var(--color-offline)",
  away: "var(--color-warning)",
}

export function UserAvatar({
  name,
  initials,
  imageUrl,
  seed,
  size = 40,
  status,
  statusColor,
  ring = "none",
  className,
  title,
}: UserAvatarProps) {
  const dot = status ? statusColor ?? STATUS_DOT[status] : statusColor
  const dotSize = Math.max(8, Math.round(size * 0.26))

  return (
    <span
      className={cn("identity-avatar relative inline-flex shrink-0", className)}
      title={title ?? name ?? undefined}
    >
      <IdentityAvatar
        name={name}
        seed={seed ?? name}
        initials={initials}
        imageUrl={imageUrl}
        size={size}
        className={
          ring === "active"
            ? "rounded-full ring-2 ring-primary/60 ring-offset-2 ring-offset-background"
            : undefined
        }
      />
      {dot ? (
        <span
          aria-hidden
          className="absolute -bottom-px -right-px rounded-full border-2 border-background shadow-sm"
          style={{ width: dotSize, height: dotSize, backgroundColor: dot }}
        />
      ) : null}
    </span>
  )
}
