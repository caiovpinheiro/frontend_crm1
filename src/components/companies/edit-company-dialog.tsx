"use client";

import { useEffect, useState } from "react";
import { IconPencil } from "@tabler/icons-react";
import { toast } from "sonner";

import { ButtonGlass } from "@/components/crm/button-glass";
import { InputGlass } from "@/components/crm/input-glass";
import {
  FormDialog,
  FormDialogIcon,
  formControlClass,
  formDialogCancelClass,
  formDialogPrimaryClass,
  formLabelClass,
} from "@/components/ui/form-dialog";
import type { CompanyListItemDto } from "@/features/directory-v2/api";
import { useUpdateCompany } from "@/features/directory-v2/hooks";
import { normalizePhone } from "@/lib/phone";

/** Campos da empresa que o popup edita (lista da tela Empresas ou detalhe). */
export type EditableCompany = Pick<
  CompanyListItemDto,
  "id" | "name" | "size" | "phone" | "domain" | "cep" | "city" | "state" | "address"
>;

/**
 * "Editar empresa" — o mesmo popup da tela Empresas, reaproveitado no
 * painel "Dados do grupo" dos Grupos WhatsApp.
 */
export function EditCompanyDialog({
  company,
  onClose,
  onSaved,
}: {
  company: EditableCompany | null;
  onClose: () => void;
  /** Depois de salvar (ex.: o grupo atualiza o nome da empresa vinculada). */
  onSaved?: () => void;
}) {
  const open = company !== null;
  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [cep, setCep] = useState("");
  const [city, setCity] = useState("");
  const [uf, setUf] = useState("");
  const [address, setAddress] = useState("");
  const updateMut = useUpdateCompany();

  useEffect(() => {
    if (company) {
      setName(company.name);
      setCnpj(company.size ?? "");
      setPhone(company.phone ?? "");
      setEmail(company.domain ?? "");
      setCep(company.cep ?? "");
      setCity(company.city ?? "");
      setUf(company.state ?? "");
      setAddress(company.address ?? "");
      updateMut.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n || !company) return;
    updateMut.mutate({
      id: company.id,
      body: {
        name: n,
        size: cnpj.trim() || null,
        phone: normalizePhone(phone) ?? (phone.trim() || null),
        domain: email.trim() || null,
        cep: cep.trim() || null,
        city: city.trim() || null,
        state: uf.trim() || null,
        address: address.trim() || null,
      },
    }, {
      onSuccess: () => { toast.success("Empresa atualizada."); onSaved?.(); onClose(); },
    });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="Editar empresa"
      description={name || company?.name}
      icon={
        <FormDialogIcon>
          <IconPencil className="size-4" />
        </FormDialogIcon>
      }
      size="lg"
      footer={
        <>
          <ButtonGlass variant="glass" size="sm" type="button" onClick={onClose} className={formDialogCancelClass}>Cancelar</ButtonGlass>
          <ButtonGlass variant="primary" size="sm" type="submit" form="edit-company-form" disabled={!name.trim() || updateMut.isPending} className={formDialogPrimaryClass}>{updateMut.isPending ? "Salvando..." : "Salvar"}</ButtonGlass>
        </>
      }
    >
      <form id="edit-company-form" onSubmit={handleSubmit} className="flex flex-col">
        <FieldInput label="Nome da empresa *" type="text" required autoFocus value={name} onChange={setName} placeholder="Razão social ou nome fantasia" />
        <div className="grid grid-cols-2 gap-3">
          <FieldInput label="CNPJ" type="text" value={cnpj} onChange={setCnpj} placeholder="00.000.000/0000-00" />
          <FieldInput label="Telefone" type="tel" value={phone} onChange={setPhone} placeholder="(11) 3333-4444" />
        </div>
        <FieldInput label="E-mail" type="email" value={email} onChange={setEmail} placeholder="contato@empresa.com" />
        <div className="grid grid-cols-[1fr_1.4fr_0.7fr] gap-3">
          <FieldInput label="CEP" type="text" value={cep} onChange={setCep} placeholder="00000-000" />
          <FieldInput label="Cidade" type="text" value={city} onChange={setCity} placeholder="São Paulo" />
          <FieldInput label="Estado" type="text" value={uf} onChange={setUf} placeholder="UF" />
        </div>
        <FieldInput label="Endereço da empresa" type="text" value={address} onChange={setAddress} placeholder="Rua, número, complemento" />
        {updateMut.isError && (
          <p className="text-[12px] text-[var(--color-danger-text)]">{updateMut.error instanceof Error ? updateMut.error.message : "Erro ao atualizar empresa."}</p>
        )}
      </form>
    </FormDialog>
  );
}

export function FieldInput({ label, type, value, onChange, placeholder, required, autoFocus }: {
  label: string; type: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; autoFocus?: boolean;
}) {
  return (
    <label className="mb-3 block">
      <span className={formLabelClass}>{label}</span>
      <InputGlass type={type} required={required} autoFocus={autoFocus} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={formControlClass} />
    </label>
  );
}
