"use client";

import {
  createContext,
  useContext,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { IconAlertTriangle as AlertTriangle } from "@tabler/icons-react";

import { TooltipHost } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Tipos Suave — definem `--fx-type` via modificador CSS. */
export type FlowNodeType =
  | "trigger"
  | "message"
  | "action"
  | "condition"
  | "api"
  | "fields";

/** @deprecated Preferir `FlowNodeType`. Mantido p/ nós existentes. */
export type FlowNodeAccent =
  | "primary"
  | "cyan"
  | "amber"
  | "orange"
  | "rose"
  | "green"
  | "slate"
  | "violet";

export type FlowNodeShellProps = {
  selected?: boolean;
  incomplete?: boolean;
  dragging?: boolean;
  /** Tipo visual Suave (cor do card). */
  type?: FlowNodeType;
  /** Fallback legado → mapeado p/ `type`. */
  accent?: FlowNodeAccent;
  stepIndex?: number;
  /** Largura quando selecionado (inline editor). */
  expanded?: boolean;
  defaultCollapsed?: boolean;
  /** Classes extras no card (ex.: overflow-visible). */
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
};

function accentToType(accent: FlowNodeAccent): FlowNodeType {
  switch (accent) {
    case "green":
      return "message";
    case "violet":
      return "action";
    case "cyan":
      return "condition";
    case "slate":
      return "api";
    case "amber":
    case "orange":
    case "rose":
      return "fields";
    case "primary":
    default:
      return "trigger";
  }
}

type CollapseCtx = {
  collapsed: boolean;
  toggle: () => void;
};

const CollapseContext = createContext<CollapseCtx | null>(null);

/**
 * Chrome Suave: tokens `--fx-*`, anatomia fx-node.
 * Conteúdo (itens, saídas, config) fica nos children.
 */
export function FlowNodeShell({
  selected,
  incomplete,
  dragging,
  type,
  accent = "primary",
  stepIndex,
  expanded,
  defaultCollapsed = false,
  className,
  style,
  children,
}: FlowNodeShellProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const nodeType = type ?? accentToType(accent);

  return (
    <CollapseContext.Provider
      value={{
        collapsed,
        toggle: () => setCollapsed((c) => !c),
      }}
    >
      <div
        className={cn(
          "wf-node fx-node group/node relative",
          `fx-node--${nodeType}`,
          `wf-node--${accent}`,
          selected && "is-selected wf-node--selected",
          incomplete && "is-invalid wf-node--incomplete",
          dragging && "is-dragging",
          collapsed && "is-collapsed",
          expanded && "wf-node--expanded",
          className
        )}
        style={style}
      >
        {stepIndex != null && (
          <span className="wf-node__index" aria-hidden>
            {stepIndex}
          </span>
        )}
        {incomplete && (
          <TooltipHost
            label="Configuração incompleta — esse passo vai falhar em runtime"
            side="top"
          >
            <span className="wf-node__warn">
              <AlertTriangle className="size-3" strokeWidth={2.6} />
            </span>
          </TooltipHost>
        )}
        {children}
      </div>
    </CollapseContext.Provider>
  );
}

export type FlowNodeHeaderProps = {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  eyebrow?: string;
  /** Ações à direita (delete, kebab). */
  actions?: ReactNode;
  /** Badge abaixo do subtítulo. */
  badge?: ReactNode;
  className?: string;
  /** Mostra chevron de recolher (padrão true). */
  collapsible?: boolean;
};

export function FlowNodeHeader({
  icon,
  title,
  subtitle,
  eyebrow,
  actions,
  badge,
  className,
  collapsible = true,
}: FlowNodeHeaderProps) {
  const collapse = useContext(CollapseContext);
  const collapsed = collapse?.collapsed ?? false;

  return (
    <div className={cn("wf-node__head fx-node__head node-drag-handle", className)}>
      <span className="wf-node__ico fx-node__icon">{icon}</span>
      <div className="wf-node__titles">
        {eyebrow && <p className="wf-node__eyebrow">{eyebrow}</p>}
        <p className="wf-node__title fx-node__title">{title}</p>
        {subtitle && <p className="wf-node__sub fx-node__desc">{subtitle}</p>}
        {badge && <div className="wf-node__badge-slot">{badge}</div>}
      </div>
      {actions && <div className="wf-node__actions">{actions}</div>}
      {collapsible && collapse && (
        <button
          type="button"
          className="fx-node__chevron"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expandir card" : "Recolher card"}
          onClick={(e) => {
            e.stopPropagation();
            collapse.toggle();
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      )}
    </div>
  );
}

export function FlowNodeDeleteButton({
  onDelete,
  label = "Remover passo",
}: {
  onDelete?: () => void;
  label?: string;
}) {
  if (!onDelete) return null;
  return (
    <TooltipHost label={label} side="top">
      <button
        type="button"
        className="wf-node__del"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        aria-label={label}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M3 6h18" />
          <path d="M8 6V4h8v2" />
          <path d="M19 6l-1 14H6L5 6" />
          <path d="M10 11v6M14 11v6" />
        </svg>
      </button>
    </TooltipHost>
  );
}

/** Rodapé Suave: Sucessos / Alertas / Erros. */
export function FlowNodeStats({
  success = 0,
  warning = 0,
  error = 0,
  onClick,
}: {
  success?: number;
  warning?: number;
  error?: number;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="fx-stat fx-stat--ok">
        <b>{success}</b>
        <span>Sucessos</span>
      </div>
      <div className="fx-stat fx-stat--warn">
        <b>{warning}</b>
        <span>Alertas</span>
      </div>
      <div className="fx-stat fx-stat--err" data-has-error={error > 0 ? "" : undefined}>
        <b>{error}</b>
        <span>Erros</span>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className="fx-node__foot wf-node__stats"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        aria-label="Ver estatísticas do passo"
      >
        {body}
      </button>
    );
  }

  return <div className="fx-node__foot wf-node__stats">{body}</div>;
}
