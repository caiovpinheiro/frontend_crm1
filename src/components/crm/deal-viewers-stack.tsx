import { UserAvatar } from "@/components/crm/user-avatar";
import { TooltipGlass } from "@/components/crm/tooltip-glass";
import type { EntityViewer } from "@/features/pipeline-v2/hooks";

/**
 * Presença "quem está vendo" (estilo Kommo) — os OUTROS usuários com o mesmo
 * deal aberto. Não renderiza nada quando ninguém mais está vendo.
 *
 * Variantes:
 *  - "stack"  → pilha de avatares sobrepostos (até 5 + "+N"), p/ headers.
 *      `compact` remove o rótulo "Vendo agora".
 *  - "banner" → aviso em linha "Fulano também está nesse negócio", na mesma
 *      linha de Nota interna.
 */
export function DealViewersStack({
  viewers,
  compact = false,
  variant = "stack",
}: {
  viewers: EntityViewer[];
  compact?: boolean;
  variant?: "stack" | "banner";
}) {
  if (viewers.length === 0) return null;

  if (variant === "banner") return <ViewersBanner viewers={viewers} />;

  const MAX = 5;
  const shown = viewers.slice(0, MAX);
  const overflow = viewers.length - shown.length;
  const names = viewers.map((v) => v.name).join(", ");

  const stack = (
    <TooltipGlass label={names} side="bottom">
      <div className="flex items-center">
        {shown.map((v, i) => (
          <div
            key={v.userId}
            className="rounded-full ring-2 ring-[#2e3b6e]"
            style={{ marginLeft: i === 0 ? 0 : -8, zIndex: shown.length - i }}
          >
            <UserAvatar name={v.name} imageUrl={v.avatarUrl} size={26} status="online" />
          </div>
        ))}
        {overflow > 0 && (
          <div
            className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-white/15 text-[11px] font-bold text-white ring-2 ring-[#2e3b6e]"
            style={{ marginLeft: -8 }}
          >
            +{overflow}
          </div>
        )}
      </div>
    </TooltipGlass>
  );

  if (compact) return stack;

  return (
    <div className="mb-4 flex items-center gap-2 text-white/70">
      <span className="text-[11px] font-medium uppercase tracking-wide text-white/50">
        Vendo agora
      </span>
      {stack}
    </div>
  );
}

/**
 * Aviso em linha no rodapé: avatares pequenos + "Fulano também está nesse
 * negócio" (plural quando 2+). Alinhado à direita, tom discreto.
 */
function ViewersBanner({ viewers }: { viewers: EntityViewer[] }) {
  const MAX = 3;
  const shown = viewers.slice(0, MAX);
  const overflow = viewers.length - shown.length;
  const names = viewers.map((v) => v.name);

  const nameLabel =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
  const verb = names.length === 1 ? "está" : "estão";

  return (
    <div className="flex min-w-0 max-w-[280px] items-center gap-2 rounded-full bg-[var(--brand-primary)]/10 px-2 py-1 text-[13px] text-[var(--text-secondary)]">
      <div className="flex shrink-0 items-center">
        {shown.map((v, i) => (
          <div
            key={v.userId}
            className="rounded-full ring-2 ring-[var(--glass-bg-panel)]"
            style={{ marginLeft: i === 0 ? 0 : -8, zIndex: shown.length - i }}
          >
            <UserAvatar name={v.name} imageUrl={v.avatarUrl} size={26} status="online" />
          </div>
        ))}
        {overflow > 0 && (
          <div
            className="flex h-[26px] min-w-[26px] items-center justify-center rounded-full bg-[var(--glass-bg-strong)] px-1 text-[11px] font-bold text-[var(--text-secondary)] ring-2 ring-[var(--glass-bg-panel)]"
            style={{ marginLeft: -8 }}
          >
            +{overflow}
          </div>
        )}
      </div>
      <span className="truncate">
        <strong className="font-semibold text-[var(--text-primary)]">{nameLabel}</strong>{" "}
        também {verb} nesse negócio
      </span>
    </div>
  );
}
