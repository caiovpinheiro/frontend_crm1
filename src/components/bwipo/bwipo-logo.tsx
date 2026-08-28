import Image from "next/image"

import { cn } from "@/lib/utils"

export function BwipoMark({ className }: { className?: string }) {
  return (
    <Image
      src="/bwipo-icon.png"
      alt=""
      width={44}
      height={44}
      priority
      aria-hidden="true"
      className={cn("shrink-0 rounded-xl object-contain shadow-sm", className)}
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
