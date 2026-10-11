"use client";

import { useMutation } from "@tanstack/react-query";
import { IconLoader2 as Loader2, IconLogout as LogOut } from "@tabler/icons-react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

import { ButtonGlass } from "@/components/crm/button-glass";
import { useConfirm } from "@/hooks/use-confirm";
import { apiUrl } from "@/lib/api";

/** `POST /api/users/:id/sessions/revoke` (admin da mesma org) → `{ ok, sessionVersion }`. */
async function postRevokeUserSessions(userId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/users/${encodeURIComponent(userId)}/sessions/revoke`), {
    method: "POST",
    credentials: "include",
  });
  if (res.ok) return;
  const body = (await res.json().catch(() => ({}))) as { message?: unknown };
  throw new Error(
    typeof body.message === "string" && body.message
      ? body.message
      : "Não foi possível encerrar as sessões.",
  );
}

/**
 * "Encerrar sessões" de OUTRO usuário (admin): desconecta-o de todos os
 * dispositivos. Não aparece para quem não é admin nem para o próprio
 * usuário logado — esse tem "Sair de todos os dispositivos" no perfil
 * (`components/profile/password-card.tsx`).
 */
export function RevokeUserSessionsButton({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}) {
  const { data: session } = useSession();
  const confirm = useConfirm();

  const revoke = useMutation({
    mutationFn: () => postRevokeUserSessions(userId),
    onSuccess: () => toast.success(`Sessões de ${userName} encerradas.`),
    onError: (e: Error) => toast.error(e.message),
  });

  const me = session?.user;
  if (me?.role !== "ADMIN" || !me.id || me.id === userId) return null;

  const handleClick = async () => {
    if (revoke.isPending) return;
    const ok = await confirm({
      title: "Encerrar sessões?",
      description: "O usuário será desconectado de todos os dispositivos.",
      confirmLabel: "Encerrar sessões",
      destructive: true,
    });
    if (ok) revoke.mutate();
  };

  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-medium">Sessões</span>
      <p className="text-[11px] leading-snug text-[var(--text-muted)]">
        Desconecta {userName} de todos os navegadores e aparelhos. Para voltar, é preciso entrar
        de novo.
      </p>
      <ButtonGlass
        type="button"
        variant="glass"
        onClick={() => void handleClick()}
        disabled={revoke.isPending}
        className="w-fit"
      >
        {revoke.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <LogOut className="size-4" />
        )}
        Encerrar sessões
      </ButtonGlass>
    </div>
  );
}
