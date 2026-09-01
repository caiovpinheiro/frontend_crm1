"use client";

import Link from "next/link";
import {
  IconChevronRight as ChevronRight,
  IconLogout as Logout,
  IconPlus as Plus,
} from "@tabler/icons-react";

import { HeroGeometric } from "@/components/ui/hero-geometric";
import { cn } from "@/lib/utils";

export type TenantOrgChoice = {
  slug: string;
  name: string;
  status: string;
};

type OrgAccountPickerProps = {
  email: string;
  displayName: string | null;
  orgs: TenantOrgChoice[];
  error?: string | null;
  onSelect: (org: TenantOrgChoice) => void;
  onExit: () => void;
};

function isOrgActive(status: string): boolean {
  return status === "ACTIVE";
}

function firstName(displayName: string | null, email: string): string {
  const fromName = displayName?.trim().split(/\s+/)[0];
  if (fromName) return fromName;
  const local = email.split("@")[0]?.trim();
  return local || "de volta";
}

export function OrgAccountPicker({
  email,
  displayName,
  orgs,
  error,
  onSelect,
  onExit,
}: OrgAccountPickerProps) {
  const welcome = firstName(displayName, email);

  return (
    <HeroGeometric color1="#a78bfa" color2="#f472b6" speed={1}>
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="flex w-full max-w-md flex-col items-center">
          <div className="mb-6 flex flex-col items-center text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-bwipo-white.png"
              alt="Bwipo"
              className="mb-4 h-12 w-auto max-w-[220px] object-contain"
            />
            <p className="font-display text-[22px] font-bold tracking-tight text-white">
              Bem-vindo de volta, {welcome}
            </p>
            <p className="mt-1 text-[14px] text-white/70">{email}</p>
          </div>

          <div className="glass-overlay w-full rounded-[var(--radius-2xl)] p-8">
            <h2 className="mb-4 text-[13px] font-medium text-[var(--text-secondary)]">
              Selecione uma conta
            </h2>

            <ul className="flex flex-col gap-2">
              {orgs.map((org) => {
                const active = isOrgActive(org.status);
                return (
                  <li key={org.slug}>
                    <button
                      type="button"
                      onClick={() => onSelect(org)}
                      className="flex w-full items-center gap-3 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-3 py-3 text-left backdrop-blur transition-all hover:border-primary/40 hover:ring-2 hover:ring-primary/15"
                    >
                      <span
                        className={cn(
                          "inline-flex min-w-[72px] justify-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                          active
                            ? "bg-[var(--color-success-bg)] text-[var(--color-success-text)]"
                            : "bg-[var(--color-danger)]/10 text-[var(--color-danger)]",
                        )}
                      >
                        {active ? "Ativo" : "Expirado"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[var(--text-primary)]">
                        {org.name}
                      </span>
                      <ChevronRight
                        className="size-4 shrink-0 text-[var(--text-muted)]"
                        aria-hidden
                      />
                    </button>
                  </li>
                );
              })}
            </ul>

            {error ? (
              <p
                role="alert"
                className="mt-4 text-[13px] font-medium text-[var(--color-danger)]"
              >
                {error}
              </p>
            ) : null}

            <div className="mt-6 flex flex-col gap-2 text-center text-[13px] text-[var(--text-secondary)]">
              <Link
                href="/?cadastro=empresa"
                className="inline-flex items-center justify-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline"
              >
                <Plus className="size-3.5" aria-hidden />
                Criar outra conta
              </Link>
              <button
                type="button"
                onClick={onExit}
                className="inline-flex items-center justify-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline"
              >
                <Logout className="size-3.5" aria-hidden />
                Sair
              </button>
            </div>
          </div>

          <p className="mt-6 text-center text-[12px] text-white/75">
            Acesso restrito · Bwipo
          </p>
        </div>
      </div>
    </HeroGeometric>
  );
}
