import { cn } from "@/lib/utils"
import { avatarInitials } from "@/lib/avatar"

/**
 * Avatar CANÔNICO de USUÁRIO/AGENTE — padrão único do sistema, espelhando o
 * token do chat (bolha outgoing "ED"): círculo com gradiente da marca
 * (brand-primary → brand-secondary) e iniciais brancas em negrito.
 *
 * "Quem manda é o perfil": se houver `imageUrl` (User.avatarUrl /
 * session.user.image), a foto sobrepõe as iniciais.
 *
 * Usar SEMPRE que representar uma pessoa interna (equipe, expediente,
 * navrail, chat, perfil). NÃO usar para contatos/clientes — esses seguem o
 * `ChatAvatar` (cor sólida determinística + badge de canal).
 */
type UserAvatarStatus = "online" | "offline" | "away"

interface UserAvatarProps {
  name?: string | null
  /** Iniciais explícitas (sobrepõe o cálculo a partir de `name`). */
  initials?: string
  /** Foto do perfil — quando presente, sobrepõe as iniciais. */
  imageUrl?: string | null
  /** Diâmetro em px (default 40). */
  size?: number
  /** Bolinha de status no canto inferior direito. */
  status?: UserAvatarStatus | null
  /** Cor custom da bolinha de status (sobrepõe o mapa padrão). */
  statusColor?: string
  /** Anel de destaque (ex.: item ativo no navrail). */
  ring?: "none" | "active"
  /** Gradiente da NavRail (sidebar-primary → accent). */
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
  size = 40,
  status,
  statusColor,
  ring = "none",
  variant = "default",
  className,
  title,
}: UserAvatarProps) {
  const text = initials ?? avatarInitials(name ?? "?")
  const dot = status ? statusColor ?? STATUS_DOT[status] : statusColor
  const dotSize = Math.max(10, Math.round(size * 0.26))

  return (
    <div
      className={cn("relative shrink-0 rounded-full", className)}
      style={{ width: size, height: size }}
      title={title ?? name ?? undefined}
    >
      <div
        className={cn(
          "relative flex size-full items-center justify-center overflow-hidden rounded-full bg-gradient-to-br font-display font-bold leading-none text-accent-foreground",
          variant === "sidebar"
            ? "from-sidebar-primary to-accent"
            : "from-primary to-accent",
          ring === "active" &&
            "ring-2 ring-primary/60 ring-offset-2 ring-offset-background",
        )}
        style={{ fontSize: Math.round(size * 0.36) }}
      >
        <span aria-hidden={Boolean(imageUrl)}>{text}</span>
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={name ?? text}
            className="absolute inset-0 size-full object-cover"
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.style.display = "none"
            }}
          />
        ) : null}
      </div>
      {dot ? (
        <span
          aria-hidden
          className="absolute -bottom-px -right-px rounded-full border-2 border-background shadow-sm"
          style={{ width: dotSize, height: dotSize, backgroundColor: dot }}
        />
      ) : null}
    </div>
  )
}
