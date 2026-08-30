"use client";

import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";

import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";
import { PageHeader } from "@/components/crm/page-header";
import { ButtonGlass } from "@/components/crm/button-glass";

/**
 * Shell glass para páginas top-level v2 fora de Settings (ex.: Relatórios,
 * Agentes de IA). Espelha o layout de `SettingsV2Shell` — NavRailV2 +
 * PageHeader + área scroll — mas sem o botão "Voltar para configurações"
 * default. Por design, top-level pages costumam ter o NavRail como única
 * navegação primária; o `backHref` é opcional para casos pontuais.
 *
 * Gutter horizontal (rail↔conteúdo e conteúdo↔borda direita) vem de
 * `--page-gutter` em `.v2-screen` — não repetir `pl-*` aqui.
 */
export function AppV2PageShell({
  title,
  description,
  icon,
  actions,
  children,
  backHref,
  backLabel = "Voltar",
}: {
  title: string;
  description?: string;
  icon: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  const headerActions = backHref ? (
    <div className="flex items-center gap-2">
      {actions}
      <Link href={backHref}>
        <ButtonGlass variant="glass">
          <IconArrowLeft size={16} /> {backLabel}
        </ButtonGlass>
      </Link>
    </div>
  ) : (
    actions
  );

  return (
    <div className="v2-screen grid min-w-0 grid-cols-[var(--nav-rail-w,72px)_minmax(0,1fr)] overflow-hidden">
      <NavRailSpacer />

      <main className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <div
          data-page-scroll=""
          className="flex min-h-0 min-w-0 flex-1 flex-col gap-3.5 overflow-auto overscroll-contain pr-2"
        >
          <PageHeader
            icon={icon}
            title={title}
            actions={headerActions}
          />
          {children}
        </div>
      </main>
    </div>
  );
}
