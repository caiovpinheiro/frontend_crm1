"use client";

import {
  Activity,
  BarChart3,
  Building2,
  CircleUser,
  Kanban,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Settings,
  Shuffle,
  SquareCheck,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Resolvedor de iconName (string PascalCase) -> componente Lucide.
 * Centralizado pra que o catalogo `MOBILE_MODULES` em `/lib` permaneça
 * server-safe (sem import de lucide-react). Front faz a resolução.
 *
 * Adicionar modulo novo: adicionar entrada aqui + no MOBILE_MODULES.
 */
const REGISTRY: Record<string, LucideIcon> = {
  LayoutDashboard,
  MessageSquare,
  Kanban,
  CheckSquare: SquareCheck,
  Users,
  Building2,
  Megaphone,
  Zap,
  Shuffle,
  BarChart3,
  Activity,
  Settings,
  UserCircle2: CircleUser,
};

export function MobileModuleIcon({
  name,
  className,
  strokeWidth,
}: {
  name: string;
  className?: string;
  strokeWidth?: number;
}) {
  const Icon = REGISTRY[name] ?? MessageSquare;
  return <Icon className={className} strokeWidth={strokeWidth ?? 2} />;
}

export function getMobileModuleIcon(name: string): LucideIcon {
  return REGISTRY[name] ?? MessageSquare;
}
