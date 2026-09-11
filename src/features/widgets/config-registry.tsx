"use client";

/**
 * Registry de configuração dos widgets instaláveis.
 *
 * Cada entrada mapeia um `slug` de widget para o painel de configuração que
 * abre no drawer da Central (`/widgets`). Só widgets presentes aqui ganham
 * o botão "Configurar" no card.
 *
 * Contrato:
 *  - `Component` é renderizado dentro do corpo rolável do FormDialog, sem
 *    header próprio (o header vem do modal).
 *  - `requiredPermission` é a permission key canônica (`resource:action`).
 *    Falta dela (ou de "*") esconde o botão "Configurar" no card.
 */

import { IconPhone } from "@tabler/icons-react";
import type { ComponentType, ReactNode } from "react";
import dynamic from "next/dynamic";

import { DistributionIcon } from "@/components/icons/distribution-icon";

export type WidgetConfigSize = "sm" | "md" | "lg" | "xl";

export interface WidgetConfigEntry {
  title: string;
  description?: string;
  icon: ReactNode;
  size: WidgetConfigSize;
  requiredPermission: string;
  Component: ComponentType<{ onClose?: () => void }>;
  /** Modal próprio (header/abas/overlay). Não usa o FormDialog da Central. */
  standalone?: boolean;
}

// Componentes carregados sob demanda — configs pesadas (Distribuição em
// especial) não devem entrar no bundle inicial da Central.
const DistributionConfig = dynamic(
  () => import("@/features/distribution/settings-panel"),
  { ssr: false },
);

const TelephonyModal = dynamic(
  () =>
    import("@/features/softphone/components/telefonia/telephony-modal").then(
      (m) => m.TelephonyModal,
    ),
  { ssr: false },
);

export const WIDGET_CONFIG_REGISTRY: Record<string, WidgetConfigEntry> = {
  smart_distribution: {
    title: "Distribuição",
    description: "Motor, departamentos e atribuição automática",
    icon: <DistributionIcon size={20} />,
    size: "xl",
    requiredPermission: "distribution:manage",
    Component: DistributionConfig,
  },
  calls_history: {
    title: "Telefonia IP",
    description: "Token, webhook e ramais da equipe",
    icon: <IconPhone size={20} />,
    size: "xl",
    requiredPermission: "sip_extension:manage",
    Component: TelephonyModal,
    standalone: true,
  },
};

export function getWidgetConfig(slug: string): WidgetConfigEntry | null {
  return WIDGET_CONFIG_REGISTRY[slug] ?? null;
}
