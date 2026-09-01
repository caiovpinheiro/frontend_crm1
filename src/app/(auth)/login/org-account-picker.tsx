"use client";

import Link from "next/link";
import {
  IconChevronRight as ChevronRight,
  IconLogout as Logout,
  IconPlus as Plus,
} from "@tabler/icons-react";
import { motion } from "framer-motion";

import { BlurText } from "@/components/ui/blur-text";
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

const fieldVariants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
};

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

          <motion.div
            className="relative w-full"
            initial={{ opacity: 0, y: 28, scale: 0.96, filter: "blur(14px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            <div className="absolute -inset-2 rounded-3xl bg-linear-to-br from-primary/20 via-primary/5 to-transparent blur-2xl" />
            <motion.div
              className="relative flex w-full flex-col gap-4 rounded-2xl border border-border bg-background p-6 text-foreground shadow-xl md:p-8"
              initial="hidden"
              animate="show"
              variants={{
                hidden: {},
                show: { transition: { staggerChildren: 0.07, delayChildren: 0.35 } },
              }}
            >
              <motion.div variants={fieldVariants}>
                <h2 className="text-xl font-bold text-foreground">
                  <BlurText
                    text="Selecione uma conta"
                    delay={70}
                    className="font-bold text-foreground"
                  />
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  <BlurText
                    text="Escolha a organização para continuar o login."
                    delay={40}
                    startDelay={160}
                    className="text-xs text-muted-foreground"
                  />
                </p>
              </motion.div>

              <motion.ul className="flex flex-col gap-2" variants={fieldVariants}>
                {orgs.map((org) => {
                  const active = isOrgActive(org.status);
                  return (
                    <li key={org.slug}>
                      <button
                        type="button"
                        onClick={() => onSelect(org)}
                        className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left transition-all hover:border-primary/40 hover:ring-2 hover:ring-primary/15"
                      >
                        <span
                          className={cn(
                            "inline-flex min-w-[72px] justify-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                            active
                              ? "bg-[var(--color-success-bg)] text-[var(--color-success-text)]"
                              : "bg-destructive/10 text-destructive",
                          )}
                        >
                          {active ? "Ativo" : "Expirado"}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                          {org.name}
                        </span>
                        <ChevronRight
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                      </button>
                    </li>
                  );
                })}
              </motion.ul>

              {error ? (
                <p role="alert" className="text-sm font-medium text-destructive">
                  {error}
                </p>
              ) : null}

              <motion.div
                className="flex flex-col gap-2 text-center text-xs text-muted-foreground"
                variants={fieldVariants}
              >
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
              </motion.div>
            </motion.div>
          </motion.div>

          <p className="mt-6 text-center text-[12px] text-white/75">
            Acesso restrito · Bwipo
          </p>
        </div>
      </div>
    </HeroGeometric>
  );
}
