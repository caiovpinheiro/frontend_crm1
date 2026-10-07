"use client";

import { IconLoader2, IconMessageCircle, IconPencil } from "@tabler/icons-react";

import { CheckboxGlass } from "@/components/crm/checkbox-glass";
import { ChatAvatar } from "@/components/inbox/chat-avatar";
import { AVATAR_SIZE } from "@/lib/avatar";
import { formatPhoneDisplay } from "@/lib/phone";
import { cn } from "@/lib/utils";
import type { ContactListItemDto } from "@/features/directory-v2/api";

/**
 * Lista de contatos em CARDS para o celular (< md). A tabela de 800+ px de
 * largura obrigava a rolar na horizontal dentro do card; aqui cada contato é
 * um card com nome, telefone, origem e responsável, e os alvos de toque têm
 * 40×40 px.
 */
export function ContactMobileCards({
  items,
  selected,
  allChecked,
  someChecked,
  onToggleAll,
  onToggleOne,
  onEdit,
  onOpenLead,
  openingLeadId,
}: {
  items: ContactListItemDto[];
  selected: Set<string>;
  allChecked: boolean;
  someChecked: boolean;
  onToggleAll: () => void;
  onToggleOne: (id: string) => void;
  onEdit: (c: ContactListItemDto) => void;
  onOpenLead: (c: ContactListItemDto) => void;
  openingLeadId: string | null;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 md:hidden" data-testid="contacts-mobile-list">
      <div className="flex items-center gap-1 px-1 font-display text-[12px] font-semibold text-[var(--text-secondary)]">
        <CheckboxGlass
          checked={allChecked}
          indeterminate={!allChecked && someChecked}
          onChange={onToggleAll}
          aria-label="Selecionar todos"
          touchTarget
        />
        <span>Selecionar todos</span>
      </div>
      <ul className="flex min-w-0 flex-col gap-2">
        {items.map((c) => {
          const isSelected = selected.has(c.id);
          const phone = c.phone ? formatPhoneDisplay(c.phone) || c.phone : null;
          return (
            <li
              key={c.id}
              data-testid="contact-mobile-card"
              className={cn(
                "min-w-0 rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] p-3 shadow-[var(--glass-shadow-sm)] backdrop-blur-md",
                isSelected && "border-primary bg-primary/10",
              )}
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <CheckboxGlass
                  checked={isSelected}
                  onChange={() => onToggleOne(c.id)}
                  aria-label={`Selecionar ${c.name}`}
                  touchTarget
                />
                <ChatAvatar
                  user={{ id: c.id, name: c.name, imageUrl: c.avatarUrl ?? null }}
                  phone={c.phone}
                  channel={c.phone ? "whatsapp" : null}
                  size={AVATAR_SIZE.md}
                />
                <button
                  type="button"
                  onClick={() => onEdit(c)}
                  title={c.name}
                  className="min-h-10 min-w-0 flex-1 text-left"
                >
                  <span className="block truncate font-display text-[14px] font-bold text-[var(--text-primary)]">
                    {c.name}
                  </span>
                  <span className="block truncate font-body text-[12px] text-[var(--text-muted)]">
                    {c.email ?? "—"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenLead(c)}
                  disabled={openingLeadId === c.id}
                  aria-label={`Abrir lead de ${c.name}`}
                  title="Abrir lead (cria se não existir)"
                  className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--brand-primary)] disabled:opacity-50"
                >
                  {openingLeadId === c.id ? (
                    <IconLoader2 size={18} className="animate-spin" />
                  ) : (
                    <IconMessageCircle size={18} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onEdit(c)}
                  aria-label={`Editar ${c.name}`}
                  className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] text-[var(--brand-primary)] transition-colors hover:bg-[var(--color-primary-soft)]"
                >
                  <IconPencil size={18} />
                </button>
              </div>
              <dl className="mt-2 grid min-w-0 grid-cols-2 gap-x-3 gap-y-1.5 border-t border-[var(--glass-border-subtle)] pt-2 font-body text-[12px]">
                <ContactField label="Telefone" value={phone} href={c.phone ? `tel:${c.phone}` : undefined} />
                <ContactField label="Origem" value={c.source} />
                <ContactField label="Responsável" value={c.assignedTo?.name ?? null} wide />
              </dl>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ContactField({
  label,
  value,
  href,
  wide = false,
}: {
  label: string;
  value: string | null | undefined;
  href?: string;
  wide?: boolean;
}) {
  const text = value?.trim() ? value : "—";
  return (
    <div className={cn("min-w-0", wide && "col-span-2")}>
      <dt className="font-display text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </dt>
      <dd className="min-w-0 truncate text-[var(--text-secondary)]" title={text}>
        {href && value?.trim() ? (
          <a href={href} className="hover:text-[var(--brand-primary)]">
            {text}
          </a>
        ) : (
          text
        )}
      </dd>
    </div>
  );
}
