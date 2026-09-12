"use client";

import type React from "react";
import { cn } from "@/lib/utils";
import {
  IconBuilding,
  IconChartBar,
  IconClipboardList,
  IconCurrencyDollar,
  IconDeviceLaptop,
  IconGlobe,
  IconHeadset,
  IconHome,
  IconLifebuoy,
  IconMail,
  IconMessageCircle,
  IconPhone,
  IconScale,
  IconSchool,
  IconSettings,
  IconShoppingCart,
  IconSpeakerphone,
  IconStar,
  IconTool,
  IconTruck,
  IconUsers,
} from "@tabler/icons-react";

/**
 * Registro compartilhado de ícones de departamento.
 *
 * O campo `Department.icon` guarda uma STRING: normalmente o nome de um
 * componente Tabler (ex.: "IconHeadset") — mas algumas orgs antigas
 * salvaram um emoji. Este módulo centraliza o mapeamento nome→componente
 * e o fallback (emoji cru ou ícone padrão), pra que a string nunca vaze
 * como texto na UI (bug do `<option>IconHeadset ...`).
 */

type IconComponent = React.ComponentType<{
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
}>;

export const DEPARTMENT_ICON_REGISTRY: Record<string, IconComponent> = {
  IconBuilding,
  IconHeadset,
  IconPhone,
  IconBriefcase: IconClipboardList, // alias legado
  IconCurrencyDollar,
  IconUsers,
  IconDeviceLaptop,
  IconSpeakerphone,
  IconTruck,
  IconScale,
  IconShoppingCart,
  IconLifebuoy,
  IconClipboardList,
  IconStar,
  IconSettings,
  IconChartBar,
  IconMail,
  IconMessageCircle,
  IconTool,
  IconSchool,
  IconGlobe,
  IconHome,
};

/**
 * Renderiza o glifo de um departamento a partir da string `icon`:
 *  - nome de componente conhecido → ícone Tabler
 *  - string sem letra/dígito ASCII (emoji) → o próprio glifo
 *  - qualquer outro caso → ícone genérico (prédio). Nunca o identificador.
 */
export function DeptGlyph({
  icon,
  size = 16,
  color,
  className,
}: {
  icon: string | null | undefined;
  size?: number;
  color?: string;
  className?: string;
}) {
  const name = icon ?? "";
  const Comp = DEPARTMENT_ICON_REGISTRY[name];
  if (Comp) {
    return (
      <Comp
        size={size}
        strokeWidth={1.75}
        className={className}
        style={color ? { color } : undefined}
      />
    );
  }
  // Emoji salvo em orgs antigas. A decisão é pelo FORMATO do conteúdo, não por
  // "não começa com Icon": qualquer identificador desconhecido — "IconMoodX",
  // "icon-headset", "MessageCircle" — vazava como texto cru na UI com a regra
  // antiga. Emoji não tem letra nem dígito ASCII e cabe em poucos code units
  // (sequências com ZWJ chegam a ~8).
  const trimmed = name.trim();
  const looksLikeEmoji =
    trimmed.length > 0 && trimmed.length <= 8 && !/[A-Za-z0-9]/.test(trimmed);
  if (looksLikeEmoji) {
    return (
      <span
        className={className}
        style={{ fontSize: size, lineHeight: 1, color }}
        aria-hidden
      >
        {trimmed}
      </span>
    );
  }
  return (
    <IconBuilding
      size={size}
      strokeWidth={1.75}
      className={className}
      style={color ? { color } : undefined}
    />
  );
}

const DEFAULT_DEPT_COLOR = "#6366f1";

/** Pill compacta: glifo + nome na cor do departamento. */
export function DepartmentChip({
  name,
  icon,
  color,
  className,
}: {
  name: string;
  icon?: string | null;
  color?: string | null;
  className?: string;
}) {
  const fg = color?.trim() || DEFAULT_DEPT_COLOR;
  return (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-[7.5rem] items-center gap-1 truncate rounded-full px-1.5 py-px font-display text-[10px] font-semibold",
        className,
      )}
      style={{ color: fg, backgroundColor: `${fg}1f` }}
      title={name}
    >
      <DeptGlyph icon={icon} size={12} color={fg} className="shrink-0" />
      <span className="truncate">{name}</span>
    </span>
  );
}
