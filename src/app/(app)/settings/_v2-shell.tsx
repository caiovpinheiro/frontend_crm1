"use client";

import * as React from "react";
import { IconSettings } from "@tabler/icons-react";

import { PageHeader, type PageHeaderBack } from "@/components/crm/page-header";

/**
 * Voltar ao hub `/settings`. No desktop o hub redireciona para Perfil;
 * no mobile permanece a lista do menu.
 */
export const SETTINGS_HUB_BACK: PageHeaderBack = {
  href: "/settings",
  label: "Configurações",
};

/**
 * Slots de header preenchidos por uma sub-página filha.
 *
 * Permite que o conteúdo (children) injete controles (ex.: barra de abas,
 * botão de ação) na MESMA linha do `PageHeader` — padrão Pipeline — sem
 * elevar estado/queries para fora do componente. Quando não há provider
 * (ex.: rota `/old` standalone), o hook devolve `null` e o filho renderiza
 * os controles inline.
 */
type SettingsHeaderSlotSetters = {
  setCenter: (node: React.ReactNode) => void;
  setActions: (node: React.ReactNode) => void;
};

const SettingsHeaderSlotsContext =
  React.createContext<SettingsHeaderSlotSetters | null>(null);

export function useSettingsHeaderSlots(): SettingsHeaderSlotSetters | null {
  return React.useContext(SettingsHeaderSlotsContext);
}

/**
 * Shell glass que envolve sub-páginas de settings.
 *
 * A partir do layout master-detail (`settings/layout.tsx`), o NavRailV2 e
 * a sidebar são providos pelo próprio layout — este shell fica com o
 * PageHeader + a área rolável do painel direito. Preserva o Provider dos
 * slots de header para as sub-páginas continuarem injetando controles.
 *
 * Sub-páginas de `/settings/*` (exceto Perfil) podem passar
 * `back={SETTINGS_HUB_BACK}` para o hub. Perfil é a página padrão e
 * não exibe Voltar — saída pela sidebar ou NavRail.
 */
export function SettingsV2Shell({
  title,
  description,
  children,
  icon = <IconSettings size={22} />,
  back,
  center,
  actions,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Ícone do cabeçalho. Default: engrenagem (configurações). */
  icon?: React.ReactNode;
  /** Voltar ao hub ou seção pai (opcional). */
  back?: PageHeaderBack;
  /** Busca opcional, renderizada à direita no PageHeader (slot `center`). */
  center?: React.ReactNode;
  /** Controles/ações opcionais, renderizados à direita do PageHeader. */
  actions?: React.ReactNode;
}) {
  const [slotCenter, setSlotCenter] = React.useState<React.ReactNode>(null);
  const [slotActions, setSlotActions] = React.useState<React.ReactNode>(null);

  const slotSetters = React.useMemo<SettingsHeaderSlotSetters>(
    () => ({ setCenter: setSlotCenter, setActions: setSlotActions }),
    [],
  );

  return (
    <SettingsHeaderSlotsContext.Provider value={slotSetters}>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div
          data-page-scroll=""
          className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-auto overscroll-contain pr-1 sm:gap-3.5 [-webkit-overflow-scrolling:touch]"
        >
          <PageHeader
            back={back}
            icon={icon}
            title={title}
            description={description ?? "Configurações"}
            center={center ?? slotCenter}
            actions={actions ?? slotActions}
          />
          {children}
        </div>
      </main>
    </SettingsHeaderSlotsContext.Provider>
  );
}
