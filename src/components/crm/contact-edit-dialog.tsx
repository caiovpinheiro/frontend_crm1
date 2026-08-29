"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

import { ButtonGlass } from "@/components/crm/button-glass";
import { InputGlass } from "@/components/crm/input-glass";
import { TooltipGlass } from "@/components/crm/tooltip-glass";
import {
  FormDialog,
  FormDialogIcon,
  formControlClass,
  formDialogCancelClass,
  formDialogPrimaryClass,
  formLabelClass,
} from "@/components/ui/form-dialog";
import { updateContact, type ContactWriteBody } from "@/features/directory-v2/api";

export interface ContactEditInitial {
  name: string;
  email?: string | null;
  phone?: string | null;
}

interface ContactEditDialogProps {
  contactId: string;
  initial: ContactEditInitial;
  /** Trigger custom. Default: botão lápis glass. */
  trigger?: React.ReactNode;
  /** Chamado após salvar com sucesso (para invalidações extras do caller). */
  onSaved?: () => void;
  /** Se informado, o dialog fica controlado (sem trigger). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Diálogo reutilizável de edição rápida de contato (nome/e-mail/telefone).
 * Usado em: ContactAside (inbox), DealDetailPanel (pipeline) e onde mais
 * for preciso editar o contato sem sair do fluxo.
 */
export function ContactEditDialog({
  contactId,
  initial,
  trigger,
  onSaved,
  open: openProp,
  onOpenChange,
}: ContactEditDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (!controlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: (body: ContactWriteBody) => updateContact(contactId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["v2-contacts"], exact: false });
      qc.invalidateQueries({ queryKey: ["v2-contact", contactId] });
      qc.invalidateQueries({ queryKey: ["contact-sidebar", contactId] });
      qc.invalidateQueries({ queryKey: ["inbox-conversations"], exact: false });
      toast.success("Contato atualizado.");
      onSaved?.();
      setOpen(false);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar contato.");
    },
  });

  // Re-sincroniza o draft sempre que abrir (valores podem ter mudado).
  useEffect(() => {
    if (open) {
      setName(initial.name);
      setEmail(initial.email ?? "");
      setPhone(initial.phone ?? "");
    }
  }, [open, initial.name, initial.email, initial.phone]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    const body: ContactWriteBody = {};
    if (n !== initial.name) body.name = n;
    if (email.trim() !== (initial.email ?? "")) body.email = email.trim() || null;
    if (phone.trim() !== (initial.phone ?? "")) body.phone = phone.trim() || null;
    if (Object.keys(body).length === 0) {
      setOpen(false);
      return;
    }
    mutation.mutate(body);
  }

  const triggerNode = trigger ?? (
    <TooltipGlass label="Editar contato" side="left">
      <span className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--brand-primary)]">
        <Pencil className="size-3.5" />
      </span>
    </TooltipGlass>
  );

  return (
    <>
      {controlled ? null : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center bg-transparent p-0"
          aria-label="Editar contato"
        >
          {triggerNode}
        </button>
      )}

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Editar contato"
        description={name || initial.name}
        icon={
          <FormDialogIcon>
            <Pencil className="size-4" />
          </FormDialogIcon>
        }
        size="md"
        busy={mutation.isPending}
        footer={
          <>
            <ButtonGlass variant="glass" size="sm" type="button" onClick={() => setOpen(false)} disabled={mutation.isPending} className={formDialogCancelClass}>
              Cancelar
            </ButtonGlass>
            <ButtonGlass variant="primary" size="sm" type="submit" form="contact-quick-edit-form" disabled={!name.trim() || mutation.isPending} className={formDialogPrimaryClass}>
              {mutation.isPending ? "Salvando..." : "Salvar"}
            </ButtonGlass>
          </>
        }
      >
        <form id="contact-quick-edit-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="block">
            <span className={formLabelClass}>Nome *</span>
            <InputGlass type="text" autoFocus required value={name} onChange={(e) => setName(e.target.value)} className={formControlClass} />
          </label>
          <label className="block">
            <span className={formLabelClass}>E-mail</span>
            <InputGlass type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="maria@empresa.com" className={formControlClass} />
          </label>
          <label className="block">
            <span className={formLabelClass}>Telefone</span>
            <InputGlass type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" className={formControlClass} />
          </label>
        </form>
      </FormDialog>
    </>
  );
}
