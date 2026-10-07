"use client";

/*
 * Tooltip por hover dos gráficos do dashboard.
 *
 * Qualquer elemento com `data-tip="Título\nlinha 2\nlinha 3"` dentro de um
 * `TipScope` mostra o balão junto do ponteiro. O alvo é o elemento inteiro
 * (linha da lista, célula da grade), não só a marca desenhada nele.
 *
 * O balão é um nó fora da árvore React (portal em `document.body`), atualizado
 * direto no DOM: mover o mouse não re-renderiza os gráficos e o balão não é
 * cortado por `overflow` nem por `transform` do grid do dashboard.
 */

import { useEffect, useRef, type HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export const TIP_SEPARATOR = "\n";

/** Junta as linhas do balão no formato lido por `TipScope`. */
export function tipText(...lines: (string | null | undefined | false)[]): string {
  return lines.filter(Boolean).join(TIP_SEPARATOR);
}

const TIP_CLASS =
  "pointer-events-none fixed z-50 max-w-[260px] rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs leading-snug text-popover-foreground shadow-lg tabular-nums";

export function TipScope({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  const scopeRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = document.createElement("div");
    node.setAttribute("role", "tooltip");
    node.className = TIP_CLASS;
    node.hidden = true;
    document.body.appendChild(node);
    tipRef.current = node;
    return () => {
      node.remove();
      tipRef.current = null;
    };
  }, []);

  const hide = () => {
    if (tipRef.current) tipRef.current.hidden = true;
  };

  const show = (e: React.MouseEvent) => {
    const tip = tipRef.current;
    if (!tip) return;
    const target = (e.target as Element | null)?.closest?.("[data-tip]");
    if (!target || !scopeRef.current?.contains(target)) {
      tip.hidden = true;
      return;
    }
    const lines = (target.getAttribute("data-tip") ?? "").split(TIP_SEPARATOR);
    tip.replaceChildren(
      ...lines.map((text, i) => {
        const line = document.createElement(i === 0 ? "p" : "div");
        if (i === 0) line.className = "font-semibold";
        else line.className = "text-muted-foreground";
        line.textContent = text;
        return line;
      }),
    );
    tip.hidden = false;
    const box = tip.getBoundingClientRect();
    let x = e.clientX + 14;
    let y = e.clientY + 14;
    if (x + box.width > window.innerWidth - 8) x = e.clientX - box.width - 10;
    if (y + box.height > window.innerHeight - 8) y = e.clientY - box.height - 10;
    tip.style.left = `${Math.max(8, x)}px`;
    tip.style.top = `${Math.max(8, y)}px`;
  };

  return (
    <div
      {...rest}
      ref={scopeRef}
      className={cn(className)}
      onMouseMove={show}
      onMouseLeave={hide}
    >
      {children}
    </div>
  );
}
