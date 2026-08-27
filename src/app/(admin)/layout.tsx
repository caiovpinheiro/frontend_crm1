import { redirect } from "next/navigation";
import Link from "next/link";
import { IconActivity as Activity, IconBuilding as Building2, IconCreditCard as CreditCard, IconLayoutDashboard as LayoutDashboard, IconShieldCheck as ShieldCheck } from "@tabler/icons-react";

import { auth } from "@/lib/auth-public";

/**
 * Layout do painel admin EduIT. Gated a super-admins — o middleware ja
 * redireciona mas mantemos o check aqui como segunda barreira (defense-in-depth).
 * NAO reusa o DashboardShell proposital: este painel e exclusivo da equipe
 * EduIT e nao deve parecer parte do CRM de cliente (evita confusao em
 * suporte/demo).
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = (await auth()) as
    | { user?: { isSuperAdmin?: boolean; name?: string | null; email?: string | null } }
    | null;
  if (!session?.user?.isSuperAdmin) {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="glass-overlay sticky top-0 z-40 rounded-none border-x-0 border-t-0">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div
              className="flex size-8 items-center justify-center rounded-lg text-white shadow-sm"
              style={{ background: "linear-gradient(135deg, #5b6ff5 0%, #3d52e8 100%)" }}
            >
              <ShieldCheck className="size-4" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Bwipo
              </span>
              <span className="font-display text-sm font-semibold text-foreground">
                Admin
              </span>
            </div>
          </div>
          <nav className="flex items-center gap-1">
            <Link
              href="/admin/organizations"
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-[var(--glass-bg-panel)]"
            >
              <Building2 className="size-4" />
              Organizações
            </Link>
            <Link
              href="/admin/billing"
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-[var(--glass-bg-panel)]"
            >
              <CreditCard className="size-4" />
              Billing
            </Link>
            <Link
              href="/admin/monitoring"
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-[var(--glass-bg-panel)]"
            >
              <Activity className="size-4" />
              Monitoring
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-[var(--glass-bg-panel)] hover:text-foreground"
            >
              <LayoutDashboard className="size-4" />
              Voltar pro CRM
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
