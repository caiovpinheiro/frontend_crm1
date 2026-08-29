import Image from "next/image"

import { cn } from "@/lib/utils"

/** Marca canônica do produto (loader, /rely). Não é logo de tenant. */
export const BWIPO_MARK_SRC = "/bwipo-icon.png"
/** PNG 64px, só o B, alpha 0. Query quebra cache do tile navy. */
export const BWIPO_MARK_LOADER_SRC = `${BWIPO_MARK_SRC}?v=33`

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
      src={BWIPO_MARK_LOADER_SRC}
      alt=""
      width={size}
      height={size}
      aria-hidden="true"
      className={cn("shrink-0 object-contain", className)}
      style={{ width: size, height: size, maxWidth: size, maxHeight: size }}
    />
  )
}

/** PNG do lockup com balão Chat. Query quebra cache da arte antiga. */
const BWIPO_CHAT_LIGHT_SRC = "/bwipo-chat-light.png?v=40"
const BWIPO_CHAT_DARK_SRC = "/bwipo-chat-dark.png?v=40"

export function BwipoWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center", className)}>
      <Image
        src={BWIPO_CHAT_LIGHT_SRC}
        alt="BWiPO Chat"
        width={1071}
        height={280}
        priority
        className="h-14 w-auto object-contain dark:hidden"
      />
      <Image
        src={BWIPO_CHAT_DARK_SRC}
        alt="BWiPO Chat"
        width={1015}
        height={280}
        priority
        className="hidden h-14 w-auto object-contain dark:block"
      />
    </span>
  )
}
