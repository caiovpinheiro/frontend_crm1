"use client"

import { IconUser } from "@tabler/icons-react"
import { toast } from "sonner"

import type { Message } from "./types"

type SharedContact = NonNullable<Message["sharedContacts"]>[number]

export function copySharedPhone(phone: string) {
  void navigator.clipboard.writeText(phone).then(
    () => toast.success("Copiado"),
    () => toast.error("Falha ao copiar"),
  )
}

function ContactCard({ contact }: { contact: SharedContact }) {
  const phones = contact.phones ?? []
  const emails = contact.emails ?? []
  const title = contact.name?.trim() || phones[0]?.phone || emails[0]?.email || "Contato"
  const extra = [contact.company, contact.title].filter(Boolean).join(" · ")
  return (
    <div className="flex min-w-[200px] max-w-[280px] flex-col gap-1 rounded-[var(--radius-md)] bg-[var(--glass-bg-strong)] px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
          <IconUser size={16} />
        </span>
        <span className="min-w-0 truncate text-[13px] font-semibold text-[var(--text-primary)]">
          {title}
        </span>
      </div>
      {phones.map((entry) => (
        <div key={entry.phone} className="flex min-w-0 items-center justify-between gap-2 pl-10">
          <span className="min-w-0 truncate text-[12px] text-[var(--text-muted)]">{entry.phone}</span>
          <button
            type="button"
            className="shrink-0 text-[11px] font-medium text-[var(--brand-primary)]"
            onClick={(event) => {
              event.stopPropagation()
              event.preventDefault()
              copySharedPhone(entry.phone)
            }}
          >
            Copiar telefone
          </button>
        </div>
      ))}
      {emails.map((entry) => (
        <span key={entry.email} className="truncate pl-10 text-[12px] text-[var(--text-muted)]">
          {entry.email}
        </span>
      ))}
      {extra ? (
        <span className="truncate pl-10 text-[12px] text-[var(--text-muted)]">{extra}</span>
      ) : null}
    </div>
  )
}

export function SharedContactCards({ contacts }: { contacts: SharedContact[] }) {
  return (
    <div className="flex flex-col gap-2">
      {contacts.map((contact, index) => (
        <ContactCard key={`${contact.name}-${index}`} contact={contact} />
      ))}
    </div>
  )
}
