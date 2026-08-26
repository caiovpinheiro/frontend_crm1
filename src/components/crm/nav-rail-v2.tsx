"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import {
  IconChevronDown,
  IconChevronsLeft,
  IconChevronsRight,
  IconCopy,
  IconHome,
  IconLogout,
  IconMoon,
  IconPhoto,
  IconSettings,
  IconSun,
  IconTrash,
  IconUserCircle,
} from "@tabler/icons-react";
import { useSession } from "next-auth/react";
import { signOutToLogin } from "@/lib/sign-out-to-login";
import { toast } from "sonner";

import { useEffect, useRef, useState, type ChangeEvent } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DockButton, DockProvider } from "@/components/crm/floating-dock";
import { UserAvatar } from "@/components/crm/user-avatar";
import { AgentStatusDot } from "@/components/crm/agent-status-dot";
import {
  AGENT_STATUS_META,
  AgentStatusPopup,
  useAgentStatus,
  useAgentStatusAutoPrompt,
} from "@/components/crm/agent-status";
import { useThemeV2 } from "@/hooks/use-theme-v2";
import { useUserRole } from "@/hooks/use-user-role";
import { useSettingsDrawer } from "@/features/settings/settings-drawer-context";
import { cn } from "@/lib/utils";
import { isPreviewMode, PREVIEW_USER } from "@/lib/preview-mode";
import {
  filterNavItemsByPermissions,
  filterNavItemsByRole,
  toNavItems,
  type SidebarItemPreference,
} from "@/lib/sidebar-catalog";
import { useSidebarPreferences } from "@/features/sidebar/hooks";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import {
  useOrganization,
  useRemoveOrganizationLogo,
  useUpdateOrganizationLogo,
} from "@/hooks/use-organization";
import { SoftphoneNavIcon } from "@/features/softphone/components/softphone-nav-icon";

/**
 * Cache local da preferencia da sidebar. O react-query perde o cache a cada
 * F5, entao sem isso a nav pisca: renderiza a ordem padrao do catalogo e so
 * troca para a ordem do usuario quando o GET volta (latencia de rede visivel).
 * Guardamos a ultima preferencia conhecida no localStorage e aplicamos
 * assim que o componente monta (sincrono), antes da resposta da API.
 */
const SIDEBAR_PREFS_CACHE = "crm:sidebar-prefs-items";
const SIDEBAR_EXPANDED_CACHE = "crm:sidebar-expanded";

/** Menus Conta/Perfil — branco sólido (não glass cinza do `bg-popover`). */
const ACCOUNT_MENU_CONTENT =
  "z-(--z-popover) w-60 rounded-xl border border-black/5 bg-[var(--color-bg-card)] p-1 text-[var(--color-popover-foreground)] shadow-[0_8px_32px_rgba(0,0,0,0.10)] dark:border-white/10";
const ACCOUNT_MENU_ITEM =
  "gap-2 px-2 py-1.5 text-[13px] text-[var(--color-popover-foreground)] hover:bg-[var(--color-primary-soft)] hover:text-[var(--brand-primary)] focus:bg-[var(--color-primary-soft)] focus:text-[var(--brand-primary)]";

function readCachedSidebarItems(): SidebarItemPreference[] | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(SIDEBAR_PREFS_CACHE);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SidebarItemPreference[]) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * NavRail dedicado ao segmento REAL `/*`.
 * O avatar redireciona diretamente para /settings/profile.
 *
 * Os itens operacionais sao montados a partir do catalogo
 * (`@/lib/sidebar-catalog`) mesclado com a preferencia pessoal do usuario
 * (GET /api/profile/preferences). Antes da preferencia carregar, renderiza
 * a ordem padrao do catalogo (mesmo resultado no SSR e no 1o render client,
 * evitando hydration mismatch).
 */

/**
 * Decide quais hrefs do conjunto devem ficar HIGHLIGHTED dado um
 * pathname. Match básico é `pathname === href || pathname.startsWith(href + "/")`,
 * mas quando dois itens casam (ex.: `/widgets` E `/widgets/calls` ambos
 * casam pra `/widgets/calls`), só o MAIS ESPECÍFICO (href mais longo)
 * fica ativo — evita "dois ícones acesos" visualmente confusos.
 *
 * Implementação: pra cada href candidato, ele só vence se NENHUM outro
 * candidato tiver href estritamente mais longo que também seja prefixo
 * válido (`pathname` casa com os dois, mas o mais específico ganha).
 */
function computeActiveHrefs(pathname: string, hrefs: readonly string[]): Set<string> {
  const candidates = hrefs.filter(
    (h) => pathname === h || pathname.startsWith(`${h}/`),
  );
  const winners = candidates.filter(
    (h) =>
      !candidates.some(
        (other) =>
          other !== h &&
          other.length > h.length &&
          // O candidato mais longo precisa estender o mais curto (ex.:
          // `/widgets/calls` estende `/widgets`). Sem essa checagem, dois
          // hrefs irmãos não-aninhados poderiam se "cancelar".
          other.startsWith(h.endsWith("/") ? h : `${h}/`),
      ),
  );
  return new Set(winners);
}

/**
 * Ponto suave enquanto o nome ainda não chegou. Antes exibíamos "··", que
 * ficava "preso" na tela quando a request falhava e parecia conteúdo real.
 */
function AvatarPending() {
  return (
    <span
      aria-hidden
      className="app-loading-halo block size-2 rounded-full"
      style={{ background: "rgba(255, 255, 255, 0.7)" }}
    />
  );
}

function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  return parts
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function NavRailV2({ className }: { className?: string }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { theme, toggle } = useThemeV2();
  const { data: session } = useSession();
  const { role, isSuperAdmin, isManagerUp } = useUserRole();
  const { data: prefs } = useSidebarPreferences();
  const { data: myPerms } = useMyPermissions();
  const { data: organization } = useOrganization();
  const {
    onGearEnter,
    onGearLeave,
  } = useSettingsDrawer();
  /** Só em /settings a engrenagem controla a gaveta do menu (hover). */
  const onSettingsRoute = pathname.startsWith("/settings");
  const settingsHoverProps = onSettingsRoute
    ? { onMouseEnter: onGearEnter, onMouseLeave: onGearLeave }
    : undefined;

  // Identidade da empresa (avatar do topo, estilo Kommo): iniciais do nome da
  // org e o ID da conta (organizationId) copiável no popover. Enquanto a org
  // não carrega, o avatar mostra só um ponto pulsando (nada de texto fake).
  const companyName = organization?.name?.trim() ?? "";
  const companyInitials = companyName ? computeInitials(companyName) : "";
  const companyLogo = organization?.logoUrl ?? null;
  const accountId =
    organization?.id ??
    (session?.user as { organizationId?: string | null } | undefined)
      ?.organizationId ??
    "";
  async function copyAccountId() {
    if (!accountId) return;
    try {
      await navigator.clipboard.writeText(accountId);
      toast.success("ID da conta copiado");
    } catch {
      toast.error("Não foi possível copiar o ID");
    }
  }

  // Ícone da empresa: upload/remoção da logo da org. Só ADMIN/MANAGER
  // veem os itens no popover; o backend também valida (requireManager).
  const logoInputRef = useRef<HTMLInputElement>(null);
  const updateLogo = useUpdateOrganizationLogo();
  const removeLogo = useRemoveOrganizationLogo();
  function onPickLogo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite re-selecionar o mesmo arquivo
    if (!file) return;
    updateLogo.mutate(file, {
      onSuccess: () => toast.success("Ícone da empresa atualizado"),
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "Erro ao enviar o ícone"),
    });
  }
  function onRemoveLogo() {
    removeLogo.mutate(undefined, {
      onSuccess: () => toast.success("Ícone da empresa removido"),
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "Erro ao remover o ícone"),
    });
  }

  const agentStatus = useAgentStatus();
  const [statusPopupOpen, setStatusPopupOpen] = useState(false);
  useAgentStatusAutoPrompt(agentStatus, () => setStatusPopupOpen(true));
  const statusMeta = AGENT_STATUS_META[agentStatus.status];
  const StatusIcon = statusMeta.icon;

  // Cache lido uma unica vez (lazy). So e USADO apos o mount, entao o 1o
  // render (SSR e client) continua usando a ordem padrao do catalogo —
  // preservando a hidratacao sem mismatch.
  const [cachedItems] = useState<SidebarItemPreference[] | undefined>(
    readCachedSidebarItems,
  );

  // Iniciais resolvidas apenas no client para evitar hydration mismatch —
  // isPreviewMode() depende de NEXT_PUBLIC_PREVIEW_MODE que pode diferir entre SSR e client.
  // Prioridade: usuário autenticado (NextAuth) > usuário de preview > genérico.
  const [displayName, setDisplayName] = useState("Usuário");
  const [email, setEmail] = useState<string | null>(null);
  // `mounted` evita hydration mismatch do DropdownMenu (Radix). Quando este
  // componente é instanciado em uma Server Page e passado como prop JSX,
  // os IDs gerados por `useId()` do Radix divergem entre SSR e client porque
  // a posição na árvore difere. Renderizamos um botão estático no SSR e
  // trocamos pelo DropdownMenu real só após mount — comportamento idêntico
  // do ponto de vista do usuário (o dropdown só abre via clique, que naturalmente
  // ocorre depois do mount).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Expand/collapse: quando expandido, o rail cresce (via `w-*` interno) e
  // mostra a legenda ao lado de cada icone. Preferencia persiste em
  // localStorage entre sessoes.
  //
  // Estratégia de layout: as páginas usam `grid-cols-[var(--nav-rail-w,72px)_...]`.
  // Aqui publicamos `--nav-rail-w` em `document.documentElement` (220px quando
  // expandido, 72px quando recolhido). Isso faz o GRID PARENT expandir a
  // coluna do trilho automaticamente — sem `position: fixed` (que quebrava
  // o layout, deixando o main "flutuando" fora da viewport) e sem precisar
  // tocar em cada page shell.
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    try {
      const next = window.localStorage.getItem(SIDEBAR_EXPANDED_CACHE) === "1";
      setExpanded(next);
    } catch {
      /* localStorage indisponivel — ignora */
    }
  }, []);
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.navExpanded = expanded ? "true" : "false";
    return () => {
      // Ao desmontar (ex.: signout / mudança de layout), remove o flag
      // pra o próximo layout que não usa NavRail voltar ao default 72px.
      delete document.documentElement.dataset.navExpanded;
    };
  }, [expanded]);
  function toggleExpanded() {
    setExpanded((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(SIDEBAR_EXPANDED_CACHE, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  // Scroll indicator: quando ha itens abaixo/acima do miolo rolavel, mostramos
  // um chevron piscante como pista visual de que existe mais conteudo.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState<{ top: boolean; bottom: boolean }>({
    top: false,
    bottom: false,
  });
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function update() {
      if (!el) return;
      const canScrollUp = el.scrollTop > 4;
      const canScrollDown = el.scrollTop + el.clientHeight < el.scrollHeight - 4;
      setScrollState({ top: canScrollUp, bottom: canScrollDown });
    }
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [mounted, expanded]);

  // Persiste a preferencia assim que a API responde, para o proximo F5 ja
  // abrir com a ordem certa sem esperar a rede.
  useEffect(() => {
    const items = prefs?.sidebar?.items;
    if (!items) return;
    try {
      window.localStorage.setItem(SIDEBAR_PREFS_CACHE, JSON.stringify(items));
    } catch {
      /* localStorage indisponivel — ignora */
    }
  }, [prefs]);

  // Fonte dos itens: 1o render usa o padrao (mounted=false). Apos montar,
  // aplica a preferencia da API; se ainda nao chegou, usa o cache local —
  // eliminando o flash de "itens diferentes" ao recarregar.
  const effectiveItems =
    prefs?.sidebar?.items ?? (mounted ? cachedItems : undefined);
  // IMPORTANTE: os filtros por role/permission dependem da sessão. Mesmo com
  // session prop hidratada via SessionProvider, a leitura do cookie pelo
  // auth.js no servidor pode resolver `role` em um tick diferente do client
  // (ex.: refresh do JWT no /api/auth/session em background) — qualquer
  // divergência muda a CONTAGEM de DockButtons e dispara hydration mismatch
  // ("div extra/faltando" no FloatingDock). Por isso só aplicamos os
  // filtros após mount, igual já fazemos com `cachedItems`. Trade-off: por
  // 1 frame um non-admin vê itens restritos; aceito (mesmo trade do prefs).
  const baseNavItems = toNavItems(effectiveItems);
  const navItems = mounted
    ? filterNavItemsByPermissions(
        filterNavItemsByRole(baseNavItems, { role, isSuperAdmin }),
        { isSuperAdmin, permissions: myPerms?.permissions },
      )
    : baseNavItems;
  useEffect(() => {
    const preview = isPreviewMode();
    const sessUser = session?.user;
    const name =
      sessUser?.name?.trim() || (preview ? PREVIEW_USER.name : "Usuário");
    const mail =
      sessUser?.email ?? (preview ? (PREVIEW_USER.email ?? null) : null);
    setDisplayName(name);
    setEmail(mail);
  }, [session]);

  const isProfileActive = pathname.startsWith("/settings/profile");

  // Foto do perfil (User.avatarUrl espelhado em session.user.image). Quando
  // presente, sobrepõe as iniciais — "quem manda é o perfil".
  const userImage =
    (session?.user as { image?: string | null } | undefined)?.image ?? null;

  // Classes reutilizadas: item da lista quando expandido — icone + label lado a lado.
  const expandedItemBase =
    "group flex h-11 w-full shrink-0 items-center gap-3 rounded-[var(--radius-md)] px-3 text-[13px] font-medium transition-colors";
  const expandedItemIdle =
    "text-[var(--nav-text-muted)] hover:bg-[var(--nav-text-hover-bg)] hover:text-[var(--nav-text-hover)]";
  const expandedItemActive =
    "bg-[var(--brand-primary)] text-white shadow-[0_4px_12px_rgba(91,111,245,0.35)]";

  return (
    <DockProvider
      aria-label="Navegação principal"
      className={cn(
        // NavRail dedicada: fundo slate-900 translúcido (--nav-bg)
        // para devolver a âncora vertical escura que foi perdida
        // quando o trilho virou glass sobre mesh lavanda. Não usa
        // tokens --glass-* — a rail é intencionalmente mais opaca
        // e escura que qualquer superfície de conteúdo.
        // Sempre `relative w-full h-full` — a largura da coluna do grid
        // parent é controlada por `--nav-rail-w` (72px/220px) publicado
        // no `<html>` pelo effect acima. Assim o layout continua no fluxo
        // e o main renderiza normalmente (evita o bug do `fixed` que
        // deixava o miolo aparentemente "sumido").
        "relative flex h-full w-full flex-col gap-2 bg-[var(--nav-bg)] backdrop-blur-[16px] border border-[var(--nav-border)] rounded-l-none rounded-r-[var(--radius-xl)] py-4 shadow-[var(--glass-shadow)] transition-[width] duration-200",
        // Mobile: rail lateral some — navegação vai para MobileBottomNav.
        "max-md:hidden",
        expanded ? "items-stretch" : "items-center",
        className,
      )}
    >
      {/* Botao expand/collapse — pill maior com border-brand e contraste
          maior no hover pra ficar bem visivel sobre a rail escura. */}
      <button
        type="button"
        onClick={toggleExpanded}
        aria-label={expanded ? "Recolher navegação" : "Expandir navegação"}
        className={cn(
          "absolute -right-3 top-6 z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[var(--brand-primary)] bg-white text-[var(--brand-primary)] shadow-[0_2px_8px_rgba(15,23,42,0.25)] transition-all hover:scale-110 hover:bg-[var(--brand-primary)] hover:text-white",
        )}
      >
        {expanded ? <IconChevronsLeft size={14} strokeWidth={2.5} /> : <IconChevronsRight size={14} strokeWidth={2.5} />}
      </button>

      {/* Avatar da empresa: iniciais do nome da org (estilo Kommo). Ao clicar,
          abre menu no mesmo padrão do avatar do usuário (header + itens).
          Gate `mounted` idêntico ao avatar do usuário: no SSR/1o render usamos
          um Link estático (preserva navegação sem JS) e trocamos pelo dropdown
          após o mount, evitando hydration mismatch do useId. */}
      {!mounted ? (
        <Link
          href="/dashboard"
          aria-label="Início"
          className={cn(
            "mb-2 flex shrink-0 items-center justify-center overflow-hidden font-display text-base font-bold text-white shadow-[0_6px_16px_rgba(91,111,245,0.4)]",
            companyLogo
              ? "h-12 w-12 rounded-full"
              : "h-11 w-11 rounded-[var(--radius-md)] bg-gradient-to-br from-[var(--brand-primary)] to-[var(--brand-secondary)]",
            expanded ? "mx-auto" : "",
          )}
        >
          {companyLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={companyLogo} alt={companyName || "Empresa"} className="size-full object-cover" />
          ) : (
            companyInitials || <AvatarPending />
          )}
        </Link>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger
            title={companyName || "Conta da empresa"}
            aria-label="Conta da empresa"
            className={cn(
              "mb-2 flex shrink-0 items-center justify-center overflow-hidden font-display text-base font-bold text-white shadow-[0_6px_16px_rgba(91,111,245,0.4)] outline-none transition-all hover:ring-4 hover:ring-[var(--brand-primary)]/25 focus-visible:ring-[3px] focus-visible:ring-[var(--brand-primary)]/25",
              companyLogo
                ? "h-12 w-12 rounded-full"
                : "h-11 w-11 rounded-[var(--radius-md)] bg-gradient-to-br from-[var(--brand-primary)] to-[var(--brand-secondary)]",
              expanded ? "mx-auto" : "",
            )}
          >
            {companyLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={companyLogo} alt={companyName || "Empresa"} className="size-full object-cover" />
            ) : (
              companyInitials || <AvatarPending />
            )}
          </DropdownMenuTrigger>

          <DropdownMenuContent align="start" className={ACCOUNT_MENU_CONTENT}>
            <div className="flex items-center gap-3 px-2 py-2">
              <div
                className={cn(
                  "flex shrink-0 items-center justify-center overflow-hidden font-display text-[13px] font-bold text-white",
                  companyLogo
                    ? "h-10 w-10 rounded-full"
                    : "h-9 w-9 rounded-[var(--radius-md)] bg-gradient-to-br from-[var(--brand-primary)] to-[var(--brand-secondary)]",
                )}
              >
                {companyLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={companyLogo} alt={companyName || "Empresa"} className="size-full object-cover" />
                ) : (
                  companyInitials || <AvatarPending />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate font-display text-[13px] font-bold text-[var(--color-popover-foreground)]">
                  {companyName || "Minha empresa"}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {accountId || "Conta"}
                </p>
              </div>
            </div>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              className={ACCOUNT_MENU_ITEM}
              onClick={() => void copyAccountId()}
              disabled={!accountId}
            >
              <IconCopy size={16} className="shrink-0" />
              <span className="font-medium">Copiar ID da conta</span>
            </DropdownMenuItem>

            {isManagerUp && (
              <>
                <DropdownMenuItem
                  className={ACCOUNT_MENU_ITEM}
                  onClick={(e) => {
                    e.preventDefault();
                    logoInputRef.current?.click();
                  }}
                  disabled={updateLogo.isPending}
                >
                  <IconPhoto size={16} className="shrink-0" />
                  <span className="font-medium">
                    {updateLogo.isPending
                      ? "Enviando…"
                      : companyLogo
                        ? "Alterar ícone"
                        : "Adicionar ícone"}
                  </span>
                </DropdownMenuItem>

                {companyLogo && (
                  <DropdownMenuItem
                    className={ACCOUNT_MENU_ITEM}
                    onClick={() => onRemoveLogo()}
                    disabled={removeLogo.isPending}
                  >
                    <IconTrash size={16} className="shrink-0" />
                    <span className="font-medium">
                      {removeLogo.isPending ? "Removendo…" : "Remover ícone"}
                    </span>
                  </DropdownMenuItem>
                )}
              </>
            )}

            <DropdownMenuItem
              className={ACCOUNT_MENU_ITEM}
              onClick={() => router.push("/dashboard")}
            >
              <IconHome size={16} className="shrink-0" />
              <span className="font-medium">Início</span>
            </DropdownMenuItem>
          </DropdownMenuContent>

          {/* input escondido acionado pelo item "Alterar/Adicionar ícone" */}
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={onPickLogo}
          />
        </DropdownMenu>
      )}

      {/* Miolo rolavel — quando ha overflow, chevrons piscantes indicam scroll.
          `overflow-x-clip` permite scroll vertical sem forçar scroll horizontal. */}
      <div className="relative flex w-full min-h-0 flex-1 flex-col">
        {/* Chevron superior — aparece so quando ha conteudo acima */}
        {scrollState.top && (
          <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex justify-center pb-1 pt-0.5">
            <IconChevronDown size={12} className="rotate-180 animate-pulse text-[var(--nav-text-muted)]" />
          </div>
        )}
        <div
          ref={scrollRef}
          className={cn(
            // `py-3` cria uma "zona segura" vertical: como o container é um
            // scroll container (overflow-y-auto), ele CORTA no padding-box.
            // A lupa (scale 1.55) cresce ~12px pra cada lado; o padding dá
            // espaço para o 1º/último ícone ampliarem sem serem cortados.
            // (overflow-clip-margin não resolve — o Chromium o ignora em
            // scroll containers.)
            "flex w-full min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-clip px-3 py-3 [scrollbar-width:none] [scrollbar-gutter:stable_both-edges] [&::-webkit-scrollbar]:hidden",
            expanded ? "items-stretch" : "items-center",
          )}
        >
        {(() => {
          const activeHrefs = computeActiveHrefs(
            pathname,
            navItems.map((i) => i.href),
          );
          return navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeHrefs.has(item.href);
            if (expanded) {
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-label={item.title}
                  className={cn(expandedItemBase, isActive ? expandedItemActive : expandedItemIdle)}
                >
                  <Icon size={20} className="shrink-0" />
                  <span className="truncate">{item.title}</span>
                </Link>
              );
            }
            return (
              <DockButton
                key={item.key}
                href={item.href}
                title={item.title}
                active={isActive}
                disablePop
              >
                <Icon size={20} />
              </DockButton>
            );
          });
        })()}
        </div>
        {/* Chevron inferior — pista visual de que ha mais itens abaixo */}
        {scrollState.bottom && (
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 flex justify-center pb-0.5 pt-1">
            <IconChevronDown size={12} className="animate-pulse text-[var(--nav-text-muted)]" />
          </div>
        )}
      </div>

      {/* Ícones inferiores: status do agente | telefonia + settings + avatar.
          Sem badge/ping no softphone — o idle fica só no ícone sólido da rail. */}
      <div className={cn("flex w-full shrink-0 flex-col gap-2 px-3", expanded ? "items-stretch" : "items-center")}>
      {/* Status do agente + telefonia (wifi | phone sólido) — sem badge de status */}
      {expanded ? (
        <div className={cn(expandedItemBase, expandedItemIdle, "cursor-default hover:bg-transparent")}>
          <button
            type="button"
            onClick={() => setStatusPopupOpen(true)}
            aria-label={`Status: ${statusMeta.label}`}
            className="inline-flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <StatusIcon size={20} className="shrink-0" style={{ color: statusMeta.color }} />
            <span className="truncate">Status: {statusMeta.label}</span>
          </button>
          <SoftphoneNavIcon expanded withPipe className="ml-1" />
        </div>
      ) : (
        // Colapsada (72px): empilha wifi + phone — lado a lado + pipe
        // estoura a largura (DockButton 44px + pipe + phone).
        <div className="flex flex-col items-center gap-1">
          <DockButton
            title={`Status: ${statusMeta.label}`}
            onClick={() => setStatusPopupOpen(true)}
            disablePop
          >
            <StatusIcon size={20} style={{ color: statusMeta.color }} />
          </DockButton>
          <SoftphoneNavIcon />
        </div>
      )}

      {/* Configurações — em /settings, hover abre a gaveta do menu. */}
      {expanded ? (
        <Link
          href="/settings/profile"
          aria-label="Configurações"
          {...settingsHoverProps}
          className={cn(
            expandedItemBase,
            pathname.startsWith("/settings") && !isProfileActive ? expandedItemActive : expandedItemIdle,
          )}
        >
          <IconSettings size={20} className="shrink-0" />
          <span className="truncate">Configurações</span>
        </Link>
      ) : (
        <span {...settingsHoverProps} className="inline-flex">
          <DockButton
            href="/settings/profile"
            title="Configurações"
            active={pathname.startsWith("/settings") && !isProfileActive}
            disablePop
          >
            <IconSettings size={20} />
          </DockButton>
        </span>
      )}

      {/* Avatar — abre menu da conta (Meu perfil / Sair).
          No SSR/primeiro render renderizamos um botão estático equivalente
          para evitar hydration mismatch (ver comentário em `mounted` acima). */}
      {!mounted ? (
        <button
          type="button"
          title="Minha conta"
          aria-label="Abrir menu da conta"
          className={cn(
            "relative rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--brand-primary)]/25",
            expanded ? "flex w-full items-center gap-3 rounded-[var(--radius-md)] px-2 py-1 hover:bg-[var(--nav-text-hover-bg)]" : "block",
          )}
        >
          <span className="relative isolate shrink-0">
            <UserAvatar
              name={displayName}
              imageUrl={userImage}
              size={44}
              className={cn(
                "border-2 transition-all",
                !expanded && "hover:ring-4 hover:ring-[var(--brand-primary)]/25",
                isProfileActive
                  ? "border-[var(--brand-primary)] ring-4 ring-[var(--brand-primary)]/25"
                  : "border-[var(--glass-bg-strong)]",
              )}
            />
            <AgentStatusDot status={agentStatus.status} />
          </span>
          {expanded && (
            <span className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold text-[var(--nav-text-hover)]">
              {displayName}
            </span>
          )}
        </button>
      ) : (
      <DropdownMenu>
        <DropdownMenuTrigger
          title="Minha conta"
          aria-label="Abrir menu da conta"
          className={cn(
            "relative rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--brand-primary)]/25",
            expanded ? "flex w-full items-center gap-3 rounded-[var(--radius-md)] px-2 py-1 text-left hover:bg-[var(--nav-text-hover-bg)]" : "block",
          )}
        >
          <span className="relative isolate shrink-0">
            <UserAvatar
              name={displayName}
              imageUrl={userImage}
              size={44}
              className={cn(
                "border-2 transition-all",
                !expanded && "hover:ring-4 hover:ring-[var(--brand-primary)]/25",
                isProfileActive
                  ? "border-[var(--brand-primary)] ring-4 ring-[var(--brand-primary)]/25"
                  : "border-[var(--glass-bg-strong)]",
              )}
            />
            <AgentStatusDot status={agentStatus.status} />
          </span>
          {expanded && (
            <div className="min-w-0 flex-1 overflow-hidden">
              <p className="truncate text-[13px] font-semibold text-[var(--nav-text-hover)]">{displayName}</p>
              {email && (
                <p className="truncate text-[10.5px] text-[var(--nav-text-muted)]">{email}</p>
              )}
            </div>
          )}
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className={ACCOUNT_MENU_CONTENT}>
          <div className="flex items-center gap-3 px-2 py-2">
            <UserAvatar name={displayName} imageUrl={userImage} size={36} />
            <div className="min-w-0">
              <p className="truncate font-display text-[13px] font-bold text-[var(--color-popover-foreground)]">
                {displayName}
              </p>
              {email && (
                <p className="truncate text-[11px] text-muted-foreground">{email}</p>
              )}
            </div>
          </div>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            className={ACCOUNT_MENU_ITEM}
            onClick={() => setStatusPopupOpen(true)}
          >
            <span
              className="inline-flex h-4 w-4 items-center justify-center"
              aria-hidden
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: statusMeta.color }}
              />
            </span>
            <span className="font-medium">Status: {statusMeta.label}</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            className={ACCOUNT_MENU_ITEM}
            onClick={() => router.push("/settings/profile")}
          >
            <IconUserCircle size={16} className="shrink-0" />
            <span className="font-medium">Meu perfil</span>
          </DropdownMenuItem>

          {/* Toggle de tema migrado do trilho pro dropdown de perfil —
              reduz a quantidade de icones visíveis na NavRail sem esconder
              a funcionalidade. */}
          <DropdownMenuItem className={ACCOUNT_MENU_ITEM} onClick={toggle}>
            {theme === "light" ? (
              <IconMoon size={16} className="shrink-0" />
            ) : (
              <IconSun size={16} className="shrink-0" />
            )}
            <span className="font-medium">
              {theme === "light" ? "Modo escuro" : "Modo claro"}
            </span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => void signOutToLogin()}
            className={cn(
              ACCOUNT_MENU_ITEM,
              "text-destructive hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-destructive",
            )}
          >
            <IconLogout size={16} className="shrink-0" />
            <span className="font-medium">Sair</span>
          </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      </div>

      <AgentStatusPopup
        open={statusPopupOpen}
        current={agentStatus.status}
        onClose={() => setStatusPopupOpen(false)}
        onSelect={(s) => agentStatus.setStatus(s)}
      />
    </DockProvider>
  );
}
