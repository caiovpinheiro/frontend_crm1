"use client";

import { apiUrl } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { IconCheck as Check, IconCopy as Copy, IconLoader2 as Loader2, IconPower as Power, IconShieldCheck as ShieldCheck, IconTrash as Trash2 } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { SelectNative } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { buildTenantUrl } from "@/lib/tenant-url";

type Role = "ADMIN" | "MANAGER" | "MEMBER";
type Status = "ACTIVE" | "SUSPENDED" | "ARCHIVED";
type UserType = "HUMAN" | "AI";

type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  isSuperAdmin: boolean;
  type: UserType;
  createdAt: string;
  isErased?: boolean;
};

type Invite = {
  id: string;
  email: string;
  role: Role;
  token: string | null;
  expiresAt: string;
  createdAt: string;
};

type OrganizationDetailProps = {
  organization: {
    id: string;
    name: string;
    slug: string;
    status: Status;
    industry: string | null;
    size: string | null;
    phone: string | null;
    onboardingCompletedAt: string | null;
    counts: {
      users: number;
      contacts: number;
      deals: number;
      pipelines: number;
      channels: number;
      conversations: number;
    };
    users: User[];
    invites: Invite[];
  };
};

const STATUS_BADGE: Record<Status, { label: string; variant: "success" | "warning" | "secondary" }> = {
  ACTIVE: { label: "Ativa", variant: "success" },
  SUSPENDED: { label: "Suspensa", variant: "warning" },
  ARCHIVED: { label: "Arquivada", variant: "secondary" },
};

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Admin",
  MANAGER: "Gestor",
  MEMBER: "Membro",
};

export default function OrganizationDetailClient({
  organization,
}: OrganizationDetailProps) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [status, setStatus] = useState<Status>(organization.status);
  const [invites, setInvites] = useState<Invite[]>(organization.invites);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("ADMIN");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  function inviteUrl(invite: Invite): string | null {
    if (!invite.token) return null;
    return `${buildTenantUrl(organization.slug)}/accept-invite?token=${invite.token}`;
  }

  function copyLink(invite: Invite) {
    const url = inviteUrl(invite);
    if (!url || !invite.token) return;
    navigator.clipboard.writeText(url);
    setCopiedToken(invite.token);
    setTimeout(() => setCopiedToken(null), 2000);
  }

  async function updateStatus(next: Status) {
    setError(null);
    setBusy(`status:${next}`);
    try {
      const res = await fetch(apiUrl(`/api/admin/organizations/${organization.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message ?? "Erro ao atualizar status.");
      }
      setStatus(next);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setBusy(null);
    }
  }

  async function createInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy("invite");
    try {
      const res = await fetch(apiUrl(`/api/admin/organizations/${organization.id}/invite`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? "Erro ao criar convite.");
      setInvites((prev) => [
        {
          id: data.invite.id ?? data.invite.token,
          email: data.invite.email,
          role: inviteRole,
          token: data.invite.token,
          expiresAt: data.invite.expiresAt,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      setInviteEmail("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setBusy(null);
    }
  }

  async function removeUser(user: User) {
    const ok = await confirm({
      title: `Excluir o usuário ${user.name}?`,
      description:
        `Essa operação anonimiza os dados de ${user.email} e bloqueia o login. ` +
        "Os registros históricos (deals, conversas, notas) são mantidos com " +
        "atribuição 'Usuário removido' para preservar a auditoria. Operação irreversível.",
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    setBusy(`user:${user.id}`);
    try {
      const res = await fetch(apiUrl(`/api/admin/organizations/${organization.id}/users/${user.id}`),
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message ?? "Erro ao excluir usuario.");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setBusy(null);
    }
  }

  const statusBadge = STATUS_BADGE[status];

  const activeUsers = useMemo(
    () => organization.users.filter((u) => !u.isErased),
    [organization.users],
  );
  const erasedCount = organization.users.length - activeUsers.length;

  const statCards = useMemo(
    () => [
      { label: "Usuários", value: organization.counts.users },
      { label: "Contatos", value: organization.counts.contacts },
      { label: "Deals", value: organization.counts.deals },
      { label: "Pipelines", value: organization.counts.pipelines },
      { label: "Canais", value: organization.counts.channels },
      { label: "Conversas", value: organization.counts.conversations },
    ],
    [organization.counts],
  );

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 rounded-xl border border-border bg-background p-6 shadow-sm md:grid-cols-[1fr,auto]">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
            {organization.onboardingCompletedAt ? (
              <Badge variant="outline">
                <ShieldCheck className="mr-1 size-3" />
                Onboarding concluído
              </Badge>
            ) : (
              <Badge variant="outline">Onboarding pendente</Badge>
            )}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            {organization.industry ? (
              <div>
                <dt className="text-xs text-muted-foreground">Setor</dt>
                <dd className="font-medium">{organization.industry}</dd>
              </div>
            ) : null}
            {organization.size ? (
              <div>
                <dt className="text-xs text-muted-foreground">Tamanho</dt>
                <dd className="font-medium">{organization.size}</dd>
              </div>
            ) : null}
            {organization.phone ? (
              <div>
                <dt className="text-xs text-muted-foreground">Telefone</dt>
                <dd className="font-medium">{organization.phone}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs text-muted-foreground">ID</dt>
              <dd className="font-mono text-xs">{organization.id}</dd>
            </div>
          </dl>
        </div>

        <div className="flex flex-col gap-2">
          {status === "ACTIVE" ? (
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={() => updateStatus("SUSPENDED")}
            >
              {busy === "status:SUSPENDED" ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Power className="mr-2 size-4" />
              )}
              Suspender
            </Button>
          ) : (
            <Button
              disabled={busy !== null}
              onClick={() => updateStatus("ACTIVE")}
            >
              {busy === "status:ACTIVE" ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Power className="mr-2 size-4" />
              )}
              Reativar
            </Button>
          )}
          {status !== "ARCHIVED" ? (
            <Button
              variant="destructive"
              disabled={busy !== null}
              onClick={async () => {
                const ok = await confirm({
                  title: "Arquivar essa organização?",
                  description: "Usuários perdem acesso.",
                  confirmLabel: "Arquivar",
                  destructive: true,
                });
                if (ok) updateStatus("ARCHIVED");
              }}
            >
              {busy === "status:ARCHIVED" ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 size-4" />
              )}
              Arquivar
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {statCards.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-border bg-background p-4 shadow-sm"
          >
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {s.label}
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-border bg-background p-6 shadow-sm">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Convites pendentes</h2>
            <p className="text-xs text-muted-foreground">
              Gere links de onboarding (admin) ou de aceite (membro/gestor).
            </p>
          </div>
        </header>

        <form
          onSubmit={createInvite}
          className="mb-5 grid gap-3 md:grid-cols-[1fr,160px,auto]"
        >
          <div>
            <Label htmlFor="invite-email" className="text-xs">
              Email
            </Label>
            <Input
              id="invite-email"
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="admin@empresa.com"
            />
          </div>
          <div>
            <Label htmlFor="invite-role" className="text-xs">
              Papel
            </Label>
            <SelectNative
              id="invite-role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as Role)}
              className="h-10 text-sm"
            >
              <option value="ADMIN">Admin (abre wizard)</option>
              <option value="MANAGER">Gestor</option>
              <option value="MEMBER">Membro</option>
            </SelectNative>
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={busy === "invite"}>
              {busy === "invite" ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : null}
              Gerar convite
            </Button>
          </div>
        </form>

        {invites.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum convite pendente.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {invites.map((inv) => {
              const url = inviteUrl(inv);
              return (
                <li
                  key={inv.id}
                  className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{inv.email}</span>
                    <span className="text-xs text-muted-foreground">
                      {ROLE_LABEL[inv.role]} · expira em{" "}
                      {new Date(inv.expiresAt).toLocaleDateString("pt-BR")}
                    </span>
                    <span className="mt-1 truncate font-mono text-xs text-muted-foreground">
                      {url ?? "Link enviado por e-mail (não fica armazenado)."}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyLink(inv)}
                    disabled={!url}
                  >
                    {copiedToken === inv.token ? (
                      <>
                        <Check className="mr-2 size-4" />
                        Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="mr-2 size-4" />
                        Copiar link
                      </>
                    )}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-border bg-background p-6 shadow-sm">
        <header className="mb-4">
          <h2 className="text-base font-semibold">Usuários</h2>
          <p className="text-xs text-muted-foreground">
            {activeUsers.length} membro
            {activeUsers.length === 1 ? "" : "s"} ativo
            {activeUsers.length === 1 ? "" : "s"} na organização
            {erasedCount > 0
              ? ` (${erasedCount} excluído${erasedCount === 1 ? "" : "s"})`
              : ""}
            .
          </p>
        </header>

        {activeUsers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum usuário cadastrado ainda — envie um convite pra admin
            inicial.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {activeUsers.map((u) => (
              <li
                key={u.id}
                className="flex items-center justify-between gap-3 p-3"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{u.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {u.email}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {u.isSuperAdmin ? (
                    <Badge variant="default">Super-admin</Badge>
                  ) : null}
                  <Badge variant="outline">{ROLE_LABEL[u.role]}</Badge>
                  {u.type === "AI" ? (
                    <Badge variant="secondary">IA</Badge>
                  ) : null}
                  {u.isSuperAdmin ? null : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={busy !== null}
                      onClick={() => removeUser(u)}
                      aria-label={`Excluir ${u.name}`}
                      title="Excluir usuário"
                    >
                      {busy === `user:${u.id}` ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {dialog}
    </div>
  );
}
