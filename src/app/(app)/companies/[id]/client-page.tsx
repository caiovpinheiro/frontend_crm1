"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  IconBuilding,
  IconDeviceFloppy,
  IconHandStop,
  IconListCheck,
  IconTrash,
  IconUsers,
} from "@tabler/icons-react";

import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";
import { PageHeader } from "@/components/crm/page-header";
import { GlassCard } from "@/components/crm/glass-card";
import { ButtonGlass } from "@/components/crm/button-glass";
import { InputGlass } from "@/components/crm/input-glass";
import { EmptyState } from "@/components/crm/empty-state";
import { CompanyTasks } from "@/components/companies/company-tasks";
import {
  useCompany,
  useDeleteCompany,
  useUpdateCompany,
} from "@/features/directory-v2/hooks";
import { useConfirm } from "@/hooks/use-confirm";
import { entityPath, rewriteNumericPath } from "@/lib/public-path";

type EditState = {
  name: string;
  domain: string;
  industry: string;
  size: string;
  phone: string;
  address: string;
};

const EMPTY_EDIT: EditState = {
  name: "",
  domain: "",
  industry: "",
  size: "",
  phone: "",
  address: "",
};

export default function CompanyDetailClientPage({ id }: { id: string }) {
  const router = useRouter();
  const confirm = useConfirm();

  const query = useCompany(id);
  const updateMutation = useUpdateCompany();
  const deleteMutation = useDeleteCompany();

  const [edit, setEdit] = useState<EditState>(EMPTY_EDIT);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!query.data) return;
    rewriteNumericPath("/companies", id, query.data.number);
    setEdit({
      name: query.data.name ?? "",
      domain: query.data.domain ?? "",
      industry: query.data.industry ?? "",
      size: query.data.size ?? "",
      phone: query.data.phone ?? "",
      address: query.data.address ?? "",
    });
    setDirty(false);
  }, [query.data]);

  function set<K extends keyof EditState>(k: K, v: EditState[K]) {
    setEdit((e) => ({ ...e, [k]: v }));
    setDirty(true);
  }

  async function handleSave() {
    try {
      await updateMutation.mutateAsync({
        id,
        body: {
          name: edit.name,
          domain: edit.domain || null,
          industry: edit.industry || null,
          size: edit.size || null,
          phone: edit.phone || null,
          address: edit.address || null,
        },
      });
      toast.success("Empresa atualizada");
      setDirty(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: "Excluir empresa?",
      description: "Esta ação não pode ser desfeita.",
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await deleteMutation.mutateAsync(id);
      toast.success("Empresa excluída");
      router.push("/companies");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir");
    }
  }

  return (
    <div className="v2-screen grid grid-cols-[var(--nav-rail-w,72px)_1fr] gap-4 overflow-hidden p-4">
      <NavRailSpacer />

      <main className="flex min-w-0 flex-col gap-3.5 overflow-hidden">
        <PageHeader
          back={{ href: "/companies", label: "Empresas" }}
          icon={<IconBuilding size={22} />}
          title={query.data?.name ?? "Empresa"}
          description={
            query.data
              ? `Empresas · ${query.data.domain ?? "sem e-mail"}`
              : "Carregando..."
          }
          actions={
            <>
              {dirty && (
                <ButtonGlass
                  variant="primary"
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                >
                  <IconDeviceFloppy size={16} />
                  {updateMutation.isPending ? "Salvando..." : "Salvar"}
                </ButtonGlass>
              )}
              <ButtonGlass
                variant="glass"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                <IconTrash size={16} /> Excluir
              </ButtonGlass>
            </>
          }
        />

        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto pr-2">
          {query.isLoading && (
            <GlassCard className="p-8 text-center text-[13px] text-[var(--text-muted)]">
              Carregando empresa...
            </GlassCard>
          )}

          {query.isError && (
            <GlassCard className="p-6">
              <EmptyState
                icon={<IconHandStop size={28} />}
                title="Empresa não encontrada"
                description={query.error?.message ?? "Verifique o id ou volte para a lista."}
              />
            </GlassCard>
          )}

          {query.data && (
            <>
              <GlassCard className="p-5">
                <SectionTitle>Informações</SectionTitle>
                <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                  <Field label="Nome da Empresa">
                    <InputGlass
                      value={edit.name}
                      onChange={(e) => set("name", e.target.value)}
                      placeholder="Razão social ou nome fantasia"
                    />
                  </Field>
                  {/* CNPJ persiste na coluna `size` (backend read-only,
                      sem coluna nativa). Ver DECISOES-PENDENTES.md. */}
                  <Field label="CNPJ">
                    <InputGlass
                      value={edit.size}
                      onChange={(e) => set("size", e.target.value)}
                      placeholder="00.000.000/0000-00"
                    />
                  </Field>
                  <Field label="Telefone">
                    <InputGlass
                      value={edit.phone}
                      onChange={(e) => set("phone", e.target.value)}
                      placeholder="(11) 3333-4444"
                    />
                  </Field>
                  {/* E-mail persiste na coluna `domain` (backend read-only,
                      sem coluna nativa). Ver DECISOES-PENDENTES.md. */}
                  <Field label="E-mail">
                    <InputGlass
                      value={edit.domain}
                      onChange={(e) => set("domain", e.target.value)}
                      placeholder="contato@empresa.com"
                    />
                  </Field>
                  <Field label="Endereço da Empresa">
                    <InputGlass
                      value={edit.address}
                      onChange={(e) => set("address", e.target.value)}
                      placeholder="Rua, número, bairro, cidade — UF"
                    />
                  </Field>
                  <Field label="Setor">
                    <InputGlass
                      value={edit.industry}
                      onChange={(e) => set("industry", e.target.value)}
                      placeholder="Ex.: SaaS, Educação"
                    />
                  </Field>
                </div>
              </GlassCard>

              <GlassCard className="p-5">
                <SectionTitle>
                  <span className="inline-flex items-center gap-2">
                    <IconUsers size={14} />
                    Contatos vinculados ({query.data.contacts.length})
                  </span>
                </SectionTitle>
                {query.data.contacts.length === 0 ? (
                  <p className="text-[12px] text-[var(--text-muted)]">
                    Nenhum contato.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {query.data.contacts.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-3 py-2"
                      >
                        <Link
                          href={entityPath("/contacts", c.number, c.id)}
                          className="min-w-0 flex-1 truncate font-body text-[13px] text-[var(--text-primary)] hover:underline"
                        >
                          {c.name}
                        </Link>
                        <span className="font-body text-[12px] text-[var(--text-muted)]">
                          {c.email ?? c.phone ?? "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </GlassCard>

              <GlassCard className="p-5">
                <CompanyTasks
                  companyId={query.data.id}
                  companyName={query.data.name}
                  title={(count) => (
                    <h2 className="font-display text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                      <span className="inline-flex items-center gap-2">
                        <IconListCheck size={14} />
                        Tarefas ({count})
                      </span>
                    </h2>
                  )}
                />
              </GlassCard>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 font-display text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">
      {children}
    </h2>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-display text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}
