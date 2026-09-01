import AcceptInviteForm from "./accept-invite-form";
import { apiServerGet } from "@/lib/api-server";

type Props = {
  searchParams: Promise<{ token?: string }>;
};

type InviteValidation = {
  invite: { email: string; role: string; inviteeName?: string | null };
  organization: {
    name: string;
    slug?: string;
    primaryColor?: string | null;
    logoUrl?: string | null;
  };
};

/**
 * No frontend separado a validação do token de convite vira fetch contra
 * `/api/invites/validate?token=...` (rewrite pro backend). Mantemos a
 * mesma UX: validamos no SSR pra evitar piscar o form quando o token é
 * inválido.
 */
export default async function AcceptInvitePage({ searchParams }: Props) {
  const { token } = await searchParams;
  if (!token) {
    return (
      <FullScreenError
        title="Convite ausente"
        message="Peça ao admin da sua empresa para te enviar um novo link."
      />
    );
  }

  try {
    const data = await apiServerGet<InviteValidation>(
      `/api/invites/validate?token=${encodeURIComponent(token)}`,
    );
    if (!data) {
      return (
        <FullScreenError
          title="Convite inválido"
          message="Este convite não foi encontrado ou já expirou."
        />
      );
    }
    return (
      <AcceptInviteForm
        token={token}
        invite={{
          email: data.invite.email,
          role: data.invite.role as "ADMIN" | "MANAGER" | "MEMBER",
          inviteeName: data.invite.inviteeName ?? null,
        }}
        organization={{
          name: data.organization.name,
          slug: data.organization.slug ?? null,
          primaryColor: data.organization.primaryColor ?? null,
          logoUrl: data.organization.logoUrl ?? null,
        }}
      />
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Convite inválido.";
    return <FullScreenError title="Convite inválido" message={msg} />;
  }
}

function FullScreenError({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <div className="max-w-md rounded-2xl border border-border bg-background p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
