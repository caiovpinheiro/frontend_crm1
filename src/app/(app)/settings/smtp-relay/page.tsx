import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Relay é infraestrutura (env no backend), não configuração do usuário. */
export default function SmtpRelayRoute() {
  redirect("/settings/email-accounts");
}
