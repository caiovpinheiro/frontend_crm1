"use client";

import { apiUrl } from "@/lib/api";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { IconLoader2 as Loader2 } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  token: string;
  invite: {
    email: string;
    role: "ADMIN" | "MANAGER" | "MEMBER";
    inviteeName?: string | null;
  };
  organization: {
    name: string;
    slug?: string | null;
    primaryColor: string | null;
    logoUrl: string | null;
  };
};

const ROLE_LABEL: Record<Props["invite"]["role"], string> = {
  ADMIN: "Administrador",
  MANAGER: "Gestor",
  MEMBER: "Membro",
};

export default function AcceptInviteForm({
  token,
  invite,
  organization,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(invite.inviteeName?.trim() ?? "");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const bg = organization.primaryColor ?? "#1e3a8a";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) {
      setError("Informe seu nome.");
      return;
    }
    if (password.length < 8) {
      setError("Senha precisa ter no mínimo 8 caracteres.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("As senhas não coincidem.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(apiUrl("/api/invites/accept"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? "Erro ao aceitar convite.");

      const signInRes = await signIn("credentials", {
        email: invite.email,
        password,
        organizationSlug: organization.slug ?? undefined,
        redirect: false,
      });
      if (!signInRes || signInRes.error) {
        router.push("/login");
        return;
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-50 px-4 py-10 dark:bg-zinc-950">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
        <div
          className="flex items-center gap-3 p-6 text-white"
          style={{ backgroundColor: bg }}
        >
          {organization.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={organization.logoUrl}
              alt=""
              className="h-10 w-10 rounded-lg bg-[var(--glass-bg-subtle)] object-contain p-1"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--glass-bg-subtle)] font-bold">
              {organization.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <div className="text-xs uppercase tracking-wider opacity-80">
              Convite para
            </div>
            <div className="text-lg font-semibold">{organization.name}</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6">
          <p className="text-sm text-muted-foreground">
            Você foi convidado como{" "}
            <strong>{ROLE_LABEL[invite.role]}</strong>. Crie sua senha para
            entrar no CRM.
          </p>

          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div>
            <Label htmlFor="name">Nome completo</Label>
            <Input
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
            />
          </div>

          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" readOnly value={invite.email} />
          </div>

          <div>
            <Label htmlFor="pass">Senha</Label>
            <Input
              id="pass"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="pass2">Confirmar senha</Label>
            <Input
              id="pass2"
              type="password"
              required
              minLength={8}
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
            />
          </div>

          <Button type="submit" disabled={submitting}>
            {submitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Entrar no {organization.name}
          </Button>
        </form>
      </div>
    </div>
  );
}
