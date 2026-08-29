"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";

import { cn } from "@/lib/utils";
import { tooltipSurfaceClass } from "@/components/crm/tooltip-glass";

/**
 * Efeito "FloatingDock" (estilo Aceternity / macOS dock) adaptado para a
 * orientação VERTICAL da NavRail do CRM.
 *
 * - `DockProvider` renderiza o `<nav>` e rastreia o Y do mouse num
 *   MotionValue compartilhado por contexto.
 * - `DockButton` mede a posição do seu CONTAINER (tamanho fixo) e magnifica
 *   apenas o GLIFO (o ícone interno) via `scale`, mantendo o TILE do mesmo
 *   tamanho. Isso é essencial: a área rolável da NavRail é um scroll
 *   container (`overflow-y:auto`), o que força `overflow-x` a recortar
 *   (o CSS não permite eixo Y rolável com eixo X visível). A barra tem só
 *   ~72px; um tile ampliado (44px × 1.55 ≈ 68px + sombra) não cabe e era
 *   cortado nas laterais. Ampliando só o glifo (20px → ~31px), tudo cabe
 *   com folga dentro do tile de 44px e nada é recortado.
 *   Como o transform não reflui o layout, o centro medido permanece
 *   estável → o mapeamento cursor→ícone fica exato em todos os botões.
 *
 * Não usa `useId` → sem risco de hydration mismatch (ver nota em
 * nav-rail-v2.tsx). Os `<Link href>` são preservados: rotas intactas.
 */

const DockMouseYContext = React.createContext<MotionValue<number> | null>(null);

/** Escala do GLIFO no pico da magnificação (1 = sem efeito). Aplicada só ao
 *  ícone interno, não ao tile — assim o efeito nunca estoura as bordas da
 *  barra estreita (~72px) nem é cortado pelo `overflow-x` do scroll. */
const MAX_SCALE = 1.55;
/** Raio (px) de influência do cursor em torno do centro do botão. Maior =
 *  mais vizinhos acompanham o pico (efeito "onda"). */
const INFLUENCE = 120;

const SPRING = { mass: 0.1, stiffness: 210, damping: 13 } as const;

interface DockProviderProps {
  children: React.ReactNode;
  className?: string;
  "aria-label"?: string;
}

export function DockProvider({
  children,
  className,
  "aria-label": ariaLabel,
}: DockProviderProps) {
  const mouseY = useMotionValue<number>(Number.POSITIVE_INFINITY);

  return (
    <DockMouseYContext.Provider value={mouseY}>
      <nav
        aria-label={ariaLabel}
        onMouseMove={(e) => mouseY.set(e.clientY)}
        onMouseLeave={() => mouseY.set(Number.POSITIVE_INFINITY)}
        className={cn("relative z-50", className)}
      >
        {children}
      </nav>
    </DockMouseYContext.Provider>
  );
}

export interface DockButtonProps {
  /** Ícone exibido no botão. */
  children: React.ReactNode;
  title: string;
  /** Quando presente, renderiza um `<Link>` (rota preservada). */
  href?: string;
  /** Usado quando não há `href` (ex.: toggle de tema). */
  onClick?: () => void;
  active?: boolean;
  className?: string;
  /**
   * @deprecated No-op. Mantido por compatibilidade com chamadas existentes.
   * O zoom agora amplia apenas o glifo (não o tile), então nunca há salto
   * horizontal a desativar — nada é cortado pelo `overflow-x` do scroll.
   */
  disablePop?: boolean;
}

export function DockButton({
  children,
  title,
  href,
  onClick,
  active,
  className,
}: DockButtonProps) {
  const mouseY = React.useContext(DockMouseYContext);
  const ref = React.useRef<HTMLDivElement>(null);
  const fallback = useMotionValue(Number.POSITIVE_INFINITY);
  const source = mouseY ?? fallback;

  // Rótulo (tooltip) renderizado via PORTAL no <body>. A área rolável da
  // NavRail usa `overflow-x: clip` (necessário para o scroll vertical sem
  // cortar a magnificação), o que também cortava o rótulo que aparece à
  // direita do trilho — por isso a legenda "sumia". O portal escapa de
  // qualquer overflow do ancestral; posicionamos por coordenadas de viewport
  // (position: fixed) calculadas a partir do retângulo do container.
  const [labelPos, setLabelPos] = React.useState<{
    top: number;
    left: number;
  } | null>(null);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const showLabel = React.useCallback(() => {
    const b = ref.current?.getBoundingClientRect();
    if (!b) return;
    setLabelPos({ top: b.top + b.height / 2, left: b.right });
  }, []);
  const hideLabel = React.useCallback(() => setLabelPos(null), []);

  // Distância (px) do cursor ao centro vertical do CONTAINER (tamanho fixo).
  const distance = useTransform(source, (y) => {
    const bounds = ref.current?.getBoundingClientRect();
    if (!bounds) return Number.POSITIVE_INFINITY;
    return y - (bounds.y + bounds.height / 2);
  });

  const scaleTarget = useTransform(
    distance,
    [-INFLUENCE, 0, INFLUENCE],
    [1, MAX_SCALE, 1],
  );
  const scale = useSpring(scaleTarget, SPRING);

  // Magnificação (scale) + hover leve pra devolver feedback nos inativos.
  // Como a NavRail é escura (--nav-bg slate-900), usamos --nav-text-muted
  // no idle e --nav-text-hover-bg/--nav-text-hover no hover — contraste
  // adequado sobre fundo escuro. Estado ativo mantém o brand-primary.
  const innerClasses = cn(
    "flex h-full w-full items-center justify-center rounded-2xl transition-colors",
    active
      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-sidebar-primary/30"
      : "bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
    className,
  );

  // Só o GLIFO amplia (o tile fica fixo) — ver nota no topo do arquivo.
  const glyph = (
    <motion.span
      style={{ scale, transformOrigin: "center" }}
      className="flex items-center justify-center"
    >
      {children}
    </motion.span>
  );

  const content = href ? (
    <Link href={href} prefetch={false} aria-label={title} className={innerClasses}>
      {glyph}
    </Link>
  ) : (
    <button
      type="button"
      onClick={onClick}
      aria-label={title}
      className={innerClasses}
    >
      {glyph}
    </button>
  );

  return (
    <div
      ref={ref}
      onMouseEnter={showLabel}
      onMouseLeave={hideLabel}
      className="group relative flex h-11 w-11 shrink-0 items-center justify-center"
    >
      {content}

      {/* Rótulo no hover — portaled no <body> para não ser cortado pelo
          `overflow-x: clip` do container rolável da NavRail. Aparece à
          direita do trilho, centralizado verticalmente no ícone. */}
      {mounted &&
        labelPos &&
        createPortal(
          <span
            style={{
              position: "fixed",
              top: labelPos.top,
              left: labelPos.left + 14,
              transform: "translateY(-50%)",
            }}
            className={cn(
              // Estilo canônico do tooltip do DS (mesma superfície glass
              // escura de TooltipGlass / TooltipContent) — padroniza o
              // rótulo da NavRail com o resto do sistema.
              "pointer-events-none z-(--z-popover) whitespace-nowrap",
              tooltipSurfaceClass,
              "animate-in fade-in-0 zoom-in-95 slide-in-from-left-1",
            )}
          >
            {title}
          </span>,
          document.body,
        )}
    </div>
  );
}
