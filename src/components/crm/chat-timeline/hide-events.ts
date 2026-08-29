"use client"

import { useCallback, useEffect, useState } from "react"

const STORAGE_KEY = "crm.chat.hideEvents"
const CHANGE_EVENT = "crm:chat-hide-events"

/** Eventos de timeline que o olho oculta (`sip_call` / `whatsapp_call`).
 *  Gravação com áudio (`whatsapp_call_recording` / `sip_call` + mediaUrl) fica visível. */
export function isHideableChatEvent(message: {
  kind?: string | null
  messageType?: string | null
  mediaUrl?: string | null
}): boolean {
  const mt = String(message.messageType ?? "").toLowerCase()
  if ((mt === "whatsapp_call_recording" || mt === "sip_call") && message.mediaUrl) return false
  if (mt === "sip_call" || mt === "whatsapp_call") return true
  if (mt === "whatsapp_call_recording") return true
  if (message.kind === "event") return true
  return mt === "event" || mt.startsWith("event:")
}

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

/** Preferência persistida: ocultar eventos da timeline (foco na conversa). */
export function useHideChatEvents() {
  const [hideEvents, setHideEvents] = useState(false)

  useEffect(() => {
    setHideEvents(readStored())
    const sync = () => setHideEvents(readStored())
    window.addEventListener(CHANGE_EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])

  const toggleHideEvents = useCallback(() => {
    setHideEvents((current) => {
      const next = !current
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0")
      } catch {
        /* private mode */
      }
      window.dispatchEvent(new Event(CHANGE_EVENT))
      return next
    })
  }, [])

  return { hideEvents, toggleHideEvents }
}
