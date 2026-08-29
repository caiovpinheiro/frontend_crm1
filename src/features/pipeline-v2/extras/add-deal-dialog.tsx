"use client";

/*
 * Formulário completo de criação de negócio (paridade com o DealForm
 * legado + extras pedidos pelo time):
 *  - Campos nativos: título, valor, estágio (selecionável), responsável,
 *    fechamento esperado.
 *  - Contato: nenhum / buscar existente / criar novo (nome + telefone +
 *    e-mail). Ao criar novo, o contato é cadastrado e atribuído ao deal.
 *  - Custom fields de negócio (quando o usuário tem acesso às definições).
 */

import { useEffect, useMemo, useState } from "react";
import { Briefcase } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { ButtonGlass } from "@/components/crm/button-glass";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import { InputGlass } from "@/components/crm/input-glass";
import {
  FormDialog,
  FormDialogGlyphPlus,
  FormDialogIcon,
  formControlClass,
  formDialogCancelClass,
  formDialogPrimaryClass,
  formLabelClass,
} from "@/components/ui/form-dialog";
import { cn } from "@/lib/utils";

import { apiUrl } from "@/lib/api";
import { normalizePhone } from "@/lib/phone";
import { useCreateDeal, useTeamUsers } from "@/features/pipeline-v2/hooks";
import type { StatusFilter } from "@/features/pipeline-v2/api";
import { useContacts, useCreateContact } from "@/features/directory-v2/hooks";

interface AddDealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lista completa de estágios do pipeline ativo (para o seletor). */
  stages: { id: string; name: string }[];
  /** Estágio pré-selecionado (coluna que disparou a criação). */
  defaultStageId?: string | null;
  pipelineId: string | null;
  statusFilter?: StatusFilter;
}

type ContactMode = "none" | "search" | "new";

interface DealFieldDef {
  id: string;
  label: string;
  type: string;
  options?: string[];
  required?: boolean;
}

export function AddDealDialog({
  open,
  onOpenChange,
  stages,
  defaultStageId,
  pipelineId,
  statusFilter = "OPEN",
}: AddDealDialogProps) {
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [stageId, setStageId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [expectedClose, setExpectedClose] = useState("");

  const [contactMode, setContactMode] = useState<ContactMode>("none");
  const [contactSearch, setContactSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedContact, setSelectedContact] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");

  const [cfValues, setCfValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createDeal = useCreateDeal(pipelineId, statusFilter);
  const createContact = useCreateContact();
  const { data: users = [] } = useTeamUsers(open);

  const { data: fieldDefs = [] } = useQuery<DealFieldDef[]>({
    queryKey: ["deal-field-defs-v2"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/custom-fields?entity=deal"));
      if (!res.ok) return [];
      const data = await res.json().catch(() => []);
      return Array.isArray(data) ? (data as DealFieldDef[]) : [];
    },
    enabled: open,
    staleTime: 60_000,
  });

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(contactSearch), 300);
    return () => window.clearTimeout(t);
  }, [contactSearch]);

  const { data: contactsPage, isFetching: contactsLoading } = useContacts({
    search: debouncedSearch || undefined,
    page: 1,
    perPage: 8,
    enabled: open && contactMode === "search",
  });
  const contacts = contactsPage?.items ?? [];

  useEffect(() => {
    if (open) {
      setStageId(defaultStageId || stages[0]?.id || "");
    } else {
      setTitle("");
      setValue("");
      setOwnerId("");
      setExpectedClose("");
      setContactMode("none");
      setContactSearch("");
      setSelectedContact(null);
      setNewName("");
      setNewPhone("");
      setNewEmail("");
      setCfValues({});
      setError(null);
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultStageId]);

  const pending = saving || createDeal.isPending || createContact.isPending;

  const canSubmit = useMemo(() => {
    // Título é opcional: negócio sem nome é batizado como "Negócio - #<id>"
    // no backend. Só o estágio (e o contato, quando modo "novo") são exigidos.
    if (!stageId) return false;
    if (contactMode === "new" && !newName.trim()) return false;
    return true;
  }, [stageId, contactMode, newName]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || pending) return;
    setError(null);
    setSaving(true);
    try {
      let contactId: string | undefined;
      if (contactMode === "search" && selectedContact) {
        contactId = selectedContact.id;
      } else if (contactMode === "new" && newName.trim()) {
        const rawPhone = newPhone.trim();
        const phoneToSend = rawPhone
          ? normalizePhone(rawPhone) ?? rawPhone
          : null;
        const created = await createContact.mutateAsync({
          name: newName.trim(),
          phone: phoneToSend,
          email: newEmail.trim() || null,
        });
        contactId = created.id;
      }

      const num = value.trim() ? Number(value.replace(",", ".")) : undefined;
      const { deal } = await createDeal.mutateAsync({
        // Sem título → não envia; backend gera "Negócio - #<number>".
        title: title.trim() || undefined,
        stageId,
        value: Number.isFinite(num) ? (num as number) : undefined,
        ownerId: ownerId || undefined,
        contactId,
        expectedClose: expectedClose
          ? new Date(expectedClose + "T12:00:00").toISOString()
          : undefined,
      });

      const cfPayload = Object.entries(cfValues)
        .filter(([, v]) => v != null && v !== "")
        .map(([fieldId, v]) => ({ fieldId, value: String(v) }));
      if (cfPayload.length > 0 && deal?.id) {
        const res = await fetch(apiUrl(`/api/deals/${deal.id}/custom-fields`), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ values: cfPayload }),
        });
        if (!res.ok) {
          toast.warning(
            "Negócio criado, mas não foi possível salvar os campos personalizados.",
          );
        }
      }

      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar negócio.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Novo negócio"
      description="Preencha os dados para criar o negócio no pipeline."
      icon={
        <FormDialogIcon>
          <FormDialogGlyphPlus>
            <Briefcase className="size-4" />
          </FormDialogGlyphPlus>
        </FormDialogIcon>
      }
      size="md"
      busy={pending}
      footer={
        <>
          <ButtonGlass
            variant="glass"
            size="sm"
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={pending}
            className={formDialogCancelClass}
          >
            Cancelar
          </ButtonGlass>
          <ButtonGlass
            variant="primary"
            size="sm"
            type="submit"
            form="add-deal-form"
            disabled={!canSubmit || pending}
            className={formDialogPrimaryClass}
          >
            {pending ? "Criando…" : "Criar negócio"}
          </ButtonGlass>
        </>
      }
    >
      <form id="add-deal-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="block">
          <span className={formLabelClass}>Título</span>
          <InputGlass
            type="text"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Opcional — vira “Negócio - #id” se vazio"
            className={formControlClass}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={formLabelClass}>Valor (R$)</span>
            <InputGlass
              type="number"
              min="0"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0,00"
              className={formControlClass}
            />
          </label>
          <label className="block">
            <span className={formLabelClass}>Estágio *</span>
            <DropdownGlass
              options={stages.map((s) => ({ value: s.id, label: s.name }))}
              value={stageId}
              onValueChange={setStageId}
              triggerClassName={cn(formControlClass, "w-full")}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={formLabelClass}>Responsável</span>
            <DropdownGlass
              options={[
                { value: "", label: "Sem responsável" },
                ...users.map((u) => ({ value: u.id, label: u.name })),
              ]}
              value={ownerId}
              onValueChange={setOwnerId}
              triggerClassName={cn(formControlClass, "w-full")}
            />
          </label>
          <label className="block">
            <span className={formLabelClass}>Fechamento esperado</span>
            <InputGlass
              type="date"
              value={expectedClose}
              onChange={(e) => setExpectedClose(e.target.value)}
              className={formControlClass}
            />
          </label>
        </div>

        {/* Contato */}
        <div className="rounded-xl border border-border p-3">
          <span className={formLabelClass}>Contato</span>
          <div className="mb-2 flex gap-1">
            {(
              [
                { id: "none", label: "Sem contato" },
                { id: "search", label: "Buscar" },
                { id: "new", label: "Novo" },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setContactMode(m.id)}
                className={cn(
                  "rounded-full px-3 py-1 font-display text-[11px] font-semibold transition-colors",
                  contactMode === m.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          {contactMode === "search" ? (
            <div>
              {selectedContact ? (
                <div className="flex items-center justify-between rounded-xl bg-secondary px-3 py-2 text-[13px]">
                  <span className="font-medium text-foreground">
                    {selectedContact.name}
                  </span>
                  <button
                    type="button"
                    className="text-[12px] text-primary underline"
                    onClick={() => setSelectedContact(null)}
                  >
                    trocar
                  </button>
                </div>
              ) : (
                <>
                  <InputGlass
                    type="text"
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    placeholder="Buscar por nome, e-mail…"
                    className={formControlClass}
                  />
                  <div className="mt-1 max-h-40 overflow-y-auto rounded-xl border border-border">
                    {contactsLoading ? (
                      <p className="p-2 text-[12px] text-muted-foreground">
                        Buscando…
                      </p>
                    ) : contacts.length === 0 ? (
                      <p className="p-2 text-[12px] text-muted-foreground">
                        Nenhum contato encontrado.
                      </p>
                    ) : (
                      <ul>
                        {contacts.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-[13px] hover:bg-secondary"
                              onClick={() => {
                                setSelectedContact({ id: c.id, name: c.name });
                                setContactSearch("");
                              }}
                            >
                              <span className="font-medium text-foreground">
                                {c.name}
                              </span>
                              {c.email ? (
                                <span className="text-[11px] text-muted-foreground">
                                  {c.email}
                                </span>
                              ) : null}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : null}

          {contactMode === "new" ? (
            <div className="space-y-2">
              <InputGlass
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nome do contato *"
                className={formControlClass}
              />
              <div className="grid grid-cols-2 gap-2">
                <InputGlass
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  onBlur={(e) => {
                    const raw = e.target.value.trim();
                    if (!raw) return;
                    const normalized = normalizePhone(raw);
                    if (normalized && normalized !== raw) setNewPhone(normalized);
                  }}
                  placeholder="Telefone (ex.: 11987654321)"
                  className={formControlClass}
                />
                <InputGlass
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="E-mail"
                  className={formControlClass}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                O contato é criado e atribuído ao negócio automaticamente.
              </p>
            </div>
          ) : null}
        </div>

        {/* Custom fields */}
        {fieldDefs.length > 0 ? (
          <div className="space-y-4 border-t border-border pt-4">
            {fieldDefs.map((f) => {
              const v = cfValues[f.id] ?? "";
              const onChange = (val: string) =>
                setCfValues((prev) => ({ ...prev, [f.id]: val }));
              const type = (f.type || "").toLowerCase();
              return (
                <label key={f.id} className="block">
                  <span className={formLabelClass}>
                    {f.label}
                    {f.required ? " *" : ""}
                  </span>
                  {f.options && f.options.length > 0 ? (
                    <DropdownGlass
                      options={f.options.map((opt) => ({ value: opt, label: opt }))}
                      value={v || undefined}
                      onValueChange={onChange}
                      placeholder="Selecione…"
                      triggerClassName={cn(formControlClass, "w-full")}
                    />
                  ) : type === "date" ? (
                    <InputGlass
                      type="date"
                      value={v}
                      onChange={(e) => onChange(e.target.value)}
                      className={formControlClass}
                    />
                  ) : type === "number" ? (
                    <InputGlass
                      type="number"
                      value={v}
                      onChange={(e) => onChange(e.target.value)}
                      className={formControlClass}
                    />
                  ) : (
                    <InputGlass
                      type="text"
                      value={v}
                      onChange={(e) => onChange(e.target.value)}
                      className={formControlClass}
                    />
                  )}
                </label>
              );
            })}
          </div>
        ) : null}

        {error ? (
          <p className="text-[12px] text-destructive">{error}</p>
        ) : null}
      </form>
    </FormDialog>
  );
}
