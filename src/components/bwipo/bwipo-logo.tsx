import Image from "next/image"

import { cn } from "@/lib/utils"

/** Marca canônica do produto (loader, /rely). Não é logo de tenant. */
export const BWIPO_MARK_SRC = "/bwipo-icon.png"
/** Recorte 32px — query evita cache do tile/3D antigo no `next/image`. */
export const BWIPO_MARK_LOADER_SRC = `${BWIPO_MARK_SRC}?v=32`

/** Marca do produto. Sempre com px inline — `next/image` usa width:100%
 *  e, sem CSS (F5), o PNG intrínseco (centenas de px) vira o “B fantasma”. */
export function BwipoMark({
  className,
  size = 32,
}: {
  className?: string
  size?: number
}) {
  return (
    <Image
      src={BWIPO_MARK_SRC}
      alt=""
      width={size}
      height={size}
      aria-hidden="true"
      className={cn("shrink-0 object-contain", className)}
      style={{ width: size, height: size, maxWidth: size, maxHeight: size }}
    />
  )
}

export function BwipoWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center", className)}>
      <Image
        src="/bwipo-chat-light.png"
        alt="BWiPO Chat"
        width={264}
        height={88}
        priority
        className="h-14 w-auto object-contain dark:hidden"
      />
      <Image
        src="/bwipo-chat-dark.png"
        alt="BWiPO Chat"
        width={264}
        height={88}
        priority
        className="hidden h-14 w-auto object-contain dark:block"
      />
    </span>
  )
}
