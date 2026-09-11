"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ExternalLink, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { findCurrentInboxConversationForContact } from "@/features/inbox-v2/api/conversations"
import { inboxConversationDeepLink } from "@/features/inbox-v2/hooks/use-inbox-url-sync"
import {
  canOpenAttendance,
  inboxHrefForLog,
  type LogEntry,
} from "@/lib/logs-data"
import { cn } from "@/lib/utils"

export function AttendanceLink({
  entry,
  className,
}: {
  entry: LogEntry
  className?: string
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  if (!canOpenAttendance(entry)) return null

  async function go() {
    const direct = inboxHrefForLog(entry)
    if (direct) {
      router.push(direct)
      return
    }
    if (!entry.contactId) return
    setPending(true)
    try {
      const conv = await findCurrentInboxConversationForContact(entry.contactId)
      if (!conv) {
        toast.error("Não foi possível localizar o atendimento deste contato.")
        return
      }
      router.push(inboxConversationDeepLink({ number: conv.number, id: conv.id }))
    } catch {
      toast.error("Não foi possível abrir o atendimento.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={go}
      className={cn(
        "gap-1.5 text-[var(--brand-primary)] hover:text-[var(--brand-primary)]",
        className,
      )}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <ExternalLink className="size-4" aria-hidden />
      )}
      Ir ao atendimento
    </Button>
  )
}
