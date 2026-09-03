"use client";

/**
 * Sidebar mestre da tela de Configurações (layout master-detail).
 *
 * Fonte de dados: `SETTINGS_NAV` + `SETTINGS_PERSONAL` filtrados por
 * permissão via `filterSettingsNav`. Itens são achatados numa única lista
 * ordenada alfabeticamente — sem cabeçalhos de grupo, mais limpo.
 *
 * A sidebar é uma gaveta: abre no hover da engrenagem (NavRail) e fecha
 * ao sair, salvo se pinada. O layout anima a largura via
 * grid-template-columns; aqui só `transform` (sem opacity) — mesmo
 * padrão do aside CRM do Flow. Tokens `--drawer-*` em globals.css.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import {
  IconAdjustments as Settings2,
  IconGripVertical,
  IconPin,
  IconPinFilled,
} from "@tabler/icons-react";

import { PageSearchBar } from "@/components/crm/page-toolbar";
import { TooltipGlass } from "@/components/crm/tooltip-glass";
import { PageTourButton } from "@/features/product-tour";
import { useSettingsDrawer } from "@/features/settings/settings-drawer-context";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { useUserRole } from "@/hooks/use-user-role";
import { cn } from "@/lib/utils";
import { filterSettingsNav, type Viewer } from "@/lib/nav-visibility";
import {
  SETTINGS_NAV,
  SETTINGS_PERSONAL,
  type SettingsNavIcon,
  type SettingsNavItem,
} from "@/lib/settings-nav";

/** Chave do localStorage para a ordem personalizada do menu. */
const ORDER_KEY = "settings-sidebar-order-v1";

interface SettingsSidebarProps {
  open: boolean;
}

export function SettingsSidebar({
  open,
}: SettingsSidebarProps) {
  const pathname = usePathname();
  const { pinned, togglePinned } = useSettingsDrawer();
  const { role, isSuperAdmin } = useUserRole();
  const { data: myPerms } = useMyPermissions();

  const viewer: Viewer = useMemo(
    () => ({
      role: role ?? undefined,
      isSuperAdmin,
      permissions: myPerms?.permissions ?? [],
    }),
    [role, isSuperAdmin, myPerms?.permissions],
  );

  // Itens do workspace ficam em ordem alfabética; no final, fora da
  // ordenação alfabética (decisão de produto), fixamos nesta ordem:
  // Meu perfil → App Mobile → Suporte.
  const flatItems = useMemo(() => {
    const fromGroups = filterSettingsNav(SETTINGS_NAV, viewer).flatMap(
      (g) => g.items,
    );
    const mobileItem = fromGroups.find((i) => i.id === "mobile-layout");
    const alphabetical = fromGroups
      .filter((i) => i.id !== "mobile-layout")
      .sort((a, b) =>
        a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }),
      );
    const profile = SETTINGS_PERSONAL.filter((p) => p.id === "profile");
    const support = SETTINGS_PERSONAL.filter((p) => p.id === "help");
    return [
      ...alphabetical,
      ...profile,
      ...(mobileItem ? [mobileItem] : []),
      ...support,
    ];
  }, [viewer]);

  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const searching = q.length > 0;

  // Ordem personalizada pelo usuário (drag-and-drop), persistida no
  // localStorage. É uma lista de ids; itens novos caem no fim (ordem
  // default) e ids que não existem mais são ignorados.
  const [order, setOrder] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(ORDER_KEY);
      if (raw) setOrder(JSON.parse(raw) as string[]);
    } catch {
      // localStorage indisponível/JSON inválido — usa ordem default.
    }
  }, []);

  // Aplica a ordem salva sobre os itens default (sort estável: ids
  // conhecidos primeiro na sequência salva; desconhecidos mantêm a
  // ordem default no fim).
  const orderedItems = useMemo(() => {
    if (order.length === 0) return flatItems;
    const rank = new Map(order.map((id, i) => [id, i]));
    return [...flatItems].sort((a, b) => {
      const ra = rank.get(a.id) ?? Number.POSITIVE_INFINITY;
      const rb = rank.get(b.id) ?? Number.POSITIVE_INFINITY;
      return ra - rb;
    });
  }, [flatItems, order]);

  const items = useMemo(() => {
    if (!searching) return orderedItems;
    return orderedItems.filter((it) =>
      [it.label, it.description, it.eyebrow].some((p) =>
        p?.toLowerCase().includes(q),
      ),
    );
  }, [orderedItems, searching, q]);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination || result.destination.index === result.source.index)
      return;
    const next = Array.from(orderedItems);
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    const ids = next.map((i) => i.id);
    setOrder(ids);
    try {
      localStorage.setItem(ORDER_KEY, JSON.stringify(ids));
    } catch {
      // ignora falha de persistência (modo privado, quota, etc.)
    }
  };

  return (
    <aside
      aria-label="Menu de configurações"
      aria-hidden={!open}
      data-tour="settings-nav"
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] shadow-[var(--glass-shadow-sm)] backdrop-blur-sm",
        // Largura fixa (a mesma da track aberta no layout): sem isso a
        // aside estica junto com a coluna e o conteúdo inteiro é
        // re-layoutado a cada frame do fechamento — trunca texto, refaz
        // flex e re-rasteriza o backdrop-blur. Fixa, a coluna só clipa.
        "w-full md:w-[288px] md:shrink-0",
        // Sem `scale` / sem `opacity`: o painel tem backdrop-blur e
        // escalar re-rasteriza o desfoque; fade no close esvazia o
        // recheio no 1º frame (mesmo ajuste do Flow CRM aside).
        "transition-transform motion-reduce:transition-none",
        open
          ? "translate-x-0 duration-[var(--drawer-duration)] ease-[var(--ease-drawer-open)]"
          : "-translate-x-[100px] duration-[var(--drawer-duration-close)] ease-[var(--ease-drawer-close)]",
      )}
    >
      {/* Header do card — pin mantém a gaveta aberta sem hover. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--glass-border-subtle)] px-3 py-3 sm:px-4">
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-md)]"
          style={{
            background: "var(--color-enterprise-bg)",
            color: "var(--brand-primary)",
          }}
        >
          <Settings2 className="size-[18px]" />
        </span>
        <h2
          className="min-w-0 flex-1 truncate font-display text-[15px] font-bold leading-tight"
          style={{ color: "var(--text-primary)" }}
        >
          Configurações
        </h2>
        <PageTourButton tourId="settings" size="sm" />
        <TooltipGlass
          label={
            pinned
              ? "Desafixar menu (fecha ao sair)"
              : "Fixar menu (permanece aberto)"
          }
          side="bottom"
        >
          <button
            type="button"
            data-tour="settings-pin"
            aria-label={pinned ? "Desafixar menu" : "Fixar menu"}
            aria-pressed={pinned}
            onClick={togglePinned}
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] transition-colors",
              pinned
                ? "bg-[var(--color-enterprise-bg)] text-[var(--brand-primary)]"
                : "text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--brand-primary)]",
            )}
          >
            {pinned ? (
              <IconPinFilled size={16} stroke={1.7} />
            ) : (
              <IconPin size={16} stroke={1.7} />
            )}
          </button>
        </TooltipGlass>
      </div>

      {/* Busca */}
      <div className="shrink-0 border-b border-[var(--glass-border-subtle)] px-3 py-2.5 sm:px-4" data-tour="settings-search">
        <PageSearchBar
          variant="compact"
          value={search}
          onChange={setSearch}
          placeholder="Buscar…"
          aria-label="Buscar em configurações"
        />
      </div>

      {/* Lista rolável — reordenável por drag-and-drop (exceto durante busca) */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-2 py-2 [-webkit-overflow-scrolling:touch] sm:px-2.5">
        {items.length > 0 ? (
          searching ? (
            <ul className="flex flex-col gap-0.5">
              {items.map((item) => (
                <li key={item.id}>
                  <SidebarItem item={item} pathname={pathname} />
                </li>
              ))}
            </ul>
          ) : (
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="settings-sidebar">
                {(dropProvided) => (
                  <ul
                    ref={dropProvided.innerRef}
                    {...dropProvided.droppableProps}
                    className="flex flex-col gap-0.5"
                  >
                    {items.map((item, index) => (
                      <Draggable
                        key={item.id}
                        draggableId={item.id}
                        index={index}
                      >
                        {(dragProvided, snapshot) => (
                          <li
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            className={cn(
                              "group/row relative rounded-[var(--radius-md)]",
                              snapshot.isDragging &&
                                "bg-[var(--glass-bg-overlay)] shadow-[var(--glass-shadow-sm)]",
                            )}
                          >
                            <SidebarItem item={item} pathname={pathname} />
                            <button
                              type="button"
                              {...dragProvided.dragHandleProps}
                              aria-label={`Reordenar ${item.label}`}
                              tabIndex={-1}
                              className="absolute right-1 top-1/2 flex size-6 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] opacity-0 transition-opacity duration-150 hover:text-[var(--brand-primary)] focus-visible:opacity-100 group-hover/row:opacity-100 active:cursor-grabbing"
                            >
                              <IconGripVertical className="size-3.5" />
                            </button>
                          </li>
                        )}
                      </Draggable>
                    ))}
                    {dropProvided.placeholder}
                  </ul>
                )}
              </Droppable>
            </DragDropContext>
          )
        ) : (
          <div className="mt-4 rounded-[var(--radius-md)] border border-dashed border-[var(--glass-border)] px-3 py-4 text-center">
            <p
              className="text-[12px] font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              Nenhum resultado
            </p>
            <p
              className="mt-0.5 text-[11px]"
              style={{ color: "var(--text-muted)" }}
            >
              Tente outro termo.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}

/* ── SidebarItem ─────────────────────────────────────────────────────── */

function SidebarItem({
  item,
  pathname,
}: {
  item: SettingsNavItem;
  pathname: string;
}) {
  const Icon: SettingsNavIcon = item.icon;
  const active = !!item.href && isRouteActive(pathname, item.href);

  const body = (
    <span
      className={cn(
        "group/item flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 transition-colors duration-150",
        active
          ? "bg-[rgba(91,111,245,0.08)]"
          : item.href
            ? "hover:bg-[var(--glass-bg-overlay)]"
            : "cursor-not-allowed opacity-50",
      )}
    >
      <span
        className="flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] transition-colors"
        style={
          active
            ? {
                background: "var(--color-enterprise-bg)",
                color: "var(--brand-primary)",
              }
            : { color: "var(--text-muted)" }
        }
      >
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span
            className="block truncate text-[12.5px] font-medium leading-tight"
            style={{
              color: active
                ? "var(--brand-primary)"
                : "var(--text-primary)",
            }}
          >
            {item.label}
          </span>
          {item.eyebrow && (
            <span
              className="inline-flex shrink-0 items-center rounded-full px-1.5 py-px text-[8.5px] font-bold uppercase tracking-wide"
              style={{
                background: "var(--color-enterprise-bg)",
                color: "var(--brand-primary)",
                border: "1px solid rgba(91,111,245,0.25)",
              }}
            >
              {item.eyebrow}
            </span>
          )}
        </span>
      </span>
    </span>
  );

  if (!item.href) return <span className="block">{body}</span>;

  const isExternal =
    item.href.startsWith("http") || item.href.startsWith("mailto:");

  if (isExternal)
    return (
      <a href={item.href} className="block" target="_blank" rel="noreferrer">
        {body}
      </a>
    );

  return (
    <Link href={item.href} className="block">
      {body}
    </Link>
  );
}

function isRouteActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}
