"use client";

/**
 * MobileMoreSheet — bottom sheet com módulos secundários (enabled − bottomNav),
 * status, tema, perfil e sair. Acionado pelo botão "Mais" da MobileBottomNav.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import {
  IconLogout,
  IconMoon,
  IconSun,
  IconUserCircle,
  IconX,
} from "@tabler/icons-react";
import { signOutToLogin } from "@/lib/sign-out-to-login";

import {
  AGENT_STATUS_META,
  type AgentOnlineStatus,
} from "@/components/crm/agent-status";
import { MobileModuleIcon } from "@/components/layout/mobile-module-icon";
import { useMobileLayout } from "@/hooks/use-mobile-layout";
import { useThemeV2 } from "@/hooks/use-theme-v2";
import { useUserRole } from "@/hooks/use-user-role";
import { isModuleAllowedForRole, MOBILE_MODULES, MORE_SHEET_ENSURE } from "@/lib/mobile-layout";
import { cn } from "@/lib/utils";

const MOBILE_MODULE_MAP = new Map(MOBILE_MODULES.map((m) => [m.id, m] as const));

function modulePath(href: string): string {
  return href.split("?")[0] || "/";
}

function isModuleActive(pathname: string, href: string): boolean {
  const path = modulePath(href);
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function MobileMoreSheet({
  open,
  onClose,
  onStatusClick,
  agentStatus,
  displayName,
  email,
  initials,
}: {
  open: boolean;
  onClose: () => void;
  onStatusClick: () => void;
  agentStatus: AgentOnlineStatus;
  displayName: string;
  email: string | null;
  initials: string;
}) {
  const pathname = usePathname() ?? "";
  const { theme, toggle } = useThemeV2();
  const { config } = useMobileLayout();
  const { role, isSuperAdmin } = useUserRole();
  const statusMeta = AGENT_STATUS_META[agentStatus];
  const isDark = theme === "dark";

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onEsc);
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onEsc);
      document.documentElement.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const bottomSet = new Set(config.bottomNav);
  const secondaryIds: typeof config.enabled = [];
  const seen = new Set<string>();
  for (const id of config.enabled) {
    if (bottomSet.has(id) || seen.has(id)) continue;
    seen.add(id);
    secondaryIds.push(id);
  }
  // Layouts antigos podem não ter módulos novos em `enabled` — garante
  // entrada no Mais sem exigir re-salvar o Layout Builder.
  for (const id of MORE_SHEET_ENSURE) {
    if (bottomSet.has(id) || seen.has(id)) continue;
    seen.add(id);
    secondaryIds.push(id);
  }
  const secondaryModules = secondaryIds
    .map((id) => MOBILE_MODULE_MAP.get(id))
    .filter((m): m is NonNullable<typeof m> => Boolean(m))
    .filter((m) => isModuleAllowedForRole(m, role, isSuperAdmin));

  return (
    <div
      className="fixed inset-0 z-(--z-popover) md:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Mais opções"
    >
      <button
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto",
          "rounded-t-[28px] border border-[var(--glass-border)]",
          "bg-[var(--glass-bg-modal)] shadow-[var(--glass-shadow-lg)] backdrop-blur-xl",
          "pb-[env(safe-area-inset-bottom,0px)]",
        )}
      >
        <div className="sticky top-0 z-10 bg-[var(--glass-bg-overlay)] pt-2 pb-1 backdrop-blur">
          <div className="mx-auto h-1 w-10 rounded-full bg-[var(--glass-border)]" />
        </div>

        <div className="flex items-center gap-3 border-b border-[var(--glass-border)] px-5 pb-4 pt-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--brand-primary)] to-[var(--brand-secondary)] font-display text-[11px] font-bold text-white">
            {initials || (
              <span
                aria-hidden
                className="app-loading-halo block size-2 rounded-full"
                style={{ background: "rgba(255, 255, 255, 0.7)" }}
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-sm font-bold text-[var(--text-primary)]">
              {displayName}
            </p>
            {email && (
              <p className="truncate text-[11px] text-[var(--text-muted)]">{email}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] active:bg-[var(--glass-bg-subtle)]"
          >
            <IconX size={20} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 px-5 pt-4">
          <button
            type="button"
            onClick={() => {
              onClose();
              onStatusClick();
            }}
            className="flex items-center gap-2.5 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-3 py-3 text-left active:bg-[var(--glass-bg-subtle)]"
          >
            <span
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: statusMeta.color }}
            />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Status
              </p>
              <p className="text-sm font-bold text-[var(--text-primary)]">
                {statusMeta.label}
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={toggle}
            className="flex items-center gap-2.5 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-3 py-3 text-left active:bg-[var(--glass-bg-subtle)]"
          >
            {isDark ? (
              <IconSun size={16} className="text-amber-500" />
            ) : (
              <IconMoon size={16} className="text-[var(--brand-primary)]" />
            )}
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Tema
              </p>
              <p className="text-sm font-bold text-[var(--text-primary)]">
                {isDark ? "Claro" : "Escuro"}
              </p>
            </div>
          </button>
        </div>

        <div className="px-3 py-4">
          <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Mais seções
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {secondaryModules.map((item) => {
              const active = isModuleActive(pathname, item.href);
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  prefetch={false}
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl border px-3 py-3 transition-colors active:scale-[0.98]",
                    active
                      ? "border-[var(--brand-primary)] bg-[var(--color-primary-soft)] text-[var(--brand-primary)]"
                      : "border-[var(--glass-border)] bg-[var(--color-bg-card)] text-[var(--text-primary)] active:bg-[var(--glass-bg-subtle)]",
                  )}
                >
                  <MobileModuleIcon
                    name={item.iconName}
                    className="size-4 shrink-0"
                    strokeWidth={active ? 2.5 : 2}
                  />
                  <span className="flex-1 truncate text-sm font-semibold">
                    {item.label}
                  </span>
                </Link>
              );
            })}
            {secondaryModules.length === 0 && (
              <p className="col-span-2 rounded-xl bg-[var(--glass-bg-overlay)] px-3 py-4 text-center text-[12px] text-[var(--text-muted)]">
                Todos os módulos habilitados estão na barra inferior.
              </p>
            )}
          </div>

          <p className="mt-4 px-2 pb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Conta
          </p>
          <div className="grid grid-cols-1 gap-1.5">
            <Link
              href="/settings/profile"
              prefetch={false}
              onClick={onClose}
              className="flex items-center gap-2.5 rounded-xl border border-[var(--glass-border)] bg-[var(--color-bg-card)] px-3 py-3 text-[var(--text-primary)] active:bg-[var(--glass-bg-subtle)]"
            >
              <IconUserCircle size={16} className="shrink-0" />
              <span className="flex-1 text-sm font-semibold">Meu perfil</span>
            </Link>
            <button
              type="button"
              onClick={() => {
                onClose();
                void signOutToLogin();
              }}
              className="flex items-center gap-2.5 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-3 text-destructive active:bg-destructive/10"
            >
              <IconLogout size={16} className="shrink-0" />
              <span className="flex-1 text-left text-sm font-semibold">Sair</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
