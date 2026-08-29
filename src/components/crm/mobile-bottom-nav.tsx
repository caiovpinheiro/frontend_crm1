"use client";

/**
 * MobileBottomNav — barra inferior mobile/APK com os módulos pinados no
 * Layout Builder (`useMobileLayout().config.bottomNav`) + botão "Mais".
 * Quando os ícones não cabem na largura da tela, a barra faz scroll
 * horizontal (o botão "Mais" permanece fixo fora da área de scroll).
 *
 * Montada em `(app)/layout.tsx` (md:hidden). NavRail fica oculta no
 * mesmo breakpoint. Conta/status/tema ficam no MobileMoreSheet.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Ellipsis } from "lucide-react";
import { useSession } from "next-auth/react";

import {
  AgentStatusPopup,
  useAgentStatus,
  useAgentStatusAutoPrompt,
} from "@/components/crm/agent-status";
import { MobileMoreSheet } from "@/components/crm/mobile-more-sheet";
import { MobileModuleIcon } from "@/components/layout/mobile-module-icon";
import { useMobileLayout } from "@/hooks/use-mobile-layout";
import { useUserRole } from "@/hooks/use-user-role";
import { isModuleAllowedForRole, MOBILE_MODULES } from "@/lib/mobile-layout";
import { isPreviewMode, PREVIEW_USER } from "@/lib/preview-mode";
import { cn } from "@/lib/utils";

const MOBILE_MODULE_MAP = new Map(MOBILE_MODULES.map((m) => [m.id, m] as const));

function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  return parts
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function modulePath(href: string): string {
  return href.split("?")[0] || "/";
}

function computeActiveHrefs(pathname: string, hrefs: readonly string[]): Set<string> {
  const paths = hrefs.map(modulePath);
  const candidates = paths.filter(
    (h) => pathname === h || (h !== "/" && pathname.startsWith(`${h}/`)),
  );
  return new Set(
    candidates.filter(
      (h) =>
        !candidates.some(
          (other) =>
            other !== h &&
            other.length > h.length &&
            other.startsWith(h.endsWith("/") ? h : `${h}/`),
        ),
    ),
  );
}

export function MobileBottomNav() {
  return <MobileBottomNavClassic />;
}

function MobileBottomNavClassic() {
  const pathname = usePathname() ?? "";
  const { data: session } = useSession();
  const { config } = useMobileLayout();
  const { role, isSuperAdmin } = useUserRole();
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.dataset.mobileChatOpen === "1",
  );
  // Vazio até a sessão resolver — nada de "··" preso na barra.
  const [initials, setInitials] = useState("");
  const [displayName, setDisplayName] = useState("Usuário");
  const [email, setEmail] = useState<string | null>(null);

  const agentStatus = useAgentStatus();
  const [statusPopupOpen, setStatusPopupOpen] = useState(false);
  useAgentStatusAutoPrompt(agentStatus, () => setStatusPopupOpen(true));

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const preview = isPreviewMode();
    const sessUser = session?.user;
    const name =
      sessUser?.name?.trim() || (preview ? PREVIEW_USER.name : "Usuário");
    const mail =
      sessUser?.email ?? (preview ? (PREVIEW_USER.email ?? null) : null);
    setDisplayName(name);
    setEmail(mail);
    setInitials(computeInitials(name));
  }, [session]);

  useEffect(() => {
    setVisible(true);
  }, [pathname]);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setChatOpen(root.dataset.mobileChatOpen === "1");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-mobile-chat-open"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const mq = window.matchMedia("(max-width: 767px)");

    const lastScrollTop = new WeakMap<Element, number>();
    const SCROLL_THRESHOLD = 4;
    const TOUCH_THRESHOLD = 10;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchLastY = 0;
    let touchLocked: "h" | "v" | null = null;

    function readScrollTop(t: Element): number {
      if (t === document.documentElement || t === document.body) {
        return window.scrollY || document.documentElement.scrollTop;
      }
      return (t as HTMLElement).scrollTop;
    }

    function hideOrShow(delta: number, y: number) {
      if (delta > 0 && y > 16) setVisible(false);
      else if (delta < 0) setVisible(true);
    }

    function onScroll(e: Event) {
      if (!mq.matches) return;
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest?.("[data-mobile-bottom-nav]")) return;

      const y = readScrollTop(t);
      const prev = lastScrollTop.get(t);
      lastScrollTop.set(t, y);
      if (prev === undefined) return;

      const delta = y - prev;
      if (Math.abs(delta) < SCROLL_THRESHOLD) return;
      hideOrShow(delta, y);
    }

    function onTouchStart(e: TouchEvent) {
      if (!mq.matches || e.touches.length !== 1) return;
      const t = e.touches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
      touchLastY = t.clientY;
      touchLocked = null;
    }

    function onTouchMove(e: TouchEvent) {
      if (!mq.matches || e.touches.length !== 1) return;
      const target = e.target;
      if (target instanceof Element && target.closest("[data-mobile-bottom-nav]")) {
        return;
      }

      const t = e.touches[0];
      const dx = t.clientX - touchStartX;
      const dy = t.clientY - touchStartY;

      if (!touchLocked) {
        if (Math.abs(dx) < TOUCH_THRESHOLD && Math.abs(dy) < TOUCH_THRESHOLD) return;
        touchLocked = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      }
      if (touchLocked === "h") return;

      const deltaFinger = touchLastY - t.clientY;
      touchLastY = t.clientY;
      if (Math.abs(deltaFinger) < TOUCH_THRESHOLD) return;

      hideOrShow(deltaFinger, deltaFinger > 0 ? 32 : 0);
    }

    function bind() {
      document.addEventListener("scroll", onScroll, { capture: true, passive: true });
      document.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
      document.addEventListener("touchmove", onTouchMove, { capture: true, passive: true });
    }
    function unbind() {
      document.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("touchstart", onTouchStart, true);
      document.removeEventListener("touchmove", onTouchMove, true);
    }

    function onMqChange() {
      unbind();
      if (mq.matches) bind();
      else setVisible(true);
    }

    if (mq.matches) bind();
    mq.addEventListener("change", onMqChange);
    return () => {
      unbind();
      mq.removeEventListener("change", onMqChange);
    };
  }, [mounted]);

  const items = config.bottomNav
    .map((id) => MOBILE_MODULE_MAP.get(id))
    .filter((m): m is NonNullable<typeof m> => Boolean(m))
    .filter((m) => isModuleAllowedForRole(m, role, isSuperAdmin));

  const activeHrefs = computeActiveHrefs(
    pathname,
    items.map((i) => i.href),
  );

  const itemClass = (active: boolean) =>
    cn(
      "flex min-w-[3.75rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-md)] px-2.5 py-1.5",
      "font-display text-[10px] font-semibold leading-tight transition-colors",
      active
        ? "bg-[var(--brand-primary)] text-white shadow-[0_4px_12px_rgba(91,111,245,0.35)]"
        : "text-[var(--nav-text-muted)] hover:bg-[var(--nav-text-hover-bg)] hover:text-[var(--nav-text-hover)]",
    );

  if (chatOpen) return null;

  return (
    <>
      <nav
        data-mobile-bottom-nav
        aria-label="Navegação principal mobile"
        className={cn(
          "fixed inset-x-0 bottom-0 z-(--z-popover) md:hidden",
          "border-t border-[var(--nav-border)] bg-[var(--nav-bg)]/95 backdrop-blur-[16px]",
          "pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-8px_24px_rgba(0,0,0,0.28)]",
          "transition-transform duration-200 ease-out",
          visible ? "translate-y-0" : "translate-y-full",
        )}
      >
        <div className="flex items-stretch gap-1 px-2 py-1.5">
          <div
            className="flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
          >
            {items.map((item) => {
              const path = modulePath(item.href);
              const isActive = activeHrefs.has(path);
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  aria-label={item.label}
                  aria-current={isActive ? "page" : undefined}
                  className={itemClass(isActive)}
                >
                  <MobileModuleIcon
                    name={item.iconName}
                    className="size-5"
                    strokeWidth={isActive ? 2.2 : 1.8}
                  />
                  <span className="max-w-[4.5rem] truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-label="Mais opções"
            aria-expanded={moreOpen}
            className={cn(itemClass(moreOpen), "shrink-0")}
          >
            <Ellipsis size={20} strokeWidth={1.8} />
            <span className="max-w-[4.5rem] truncate">Mais</span>
          </button>
        </div>
      </nav>

      <MobileMoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        onStatusClick={() => setStatusPopupOpen(true)}
        agentStatus={agentStatus.status}
        displayName={displayName}
        email={email}
        initials={initials}
      />

      <AgentStatusPopup
        open={statusPopupOpen}
        current={agentStatus.status}
        onClose={() => setStatusPopupOpen(false)}
        onSelect={(s) => agentStatus.setStatus(s)}
      />
    </>
  );
}
