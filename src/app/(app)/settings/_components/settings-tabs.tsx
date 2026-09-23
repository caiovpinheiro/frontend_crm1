"use client";

import * as React from "react";
import type { ComponentType } from "react";

import { HeaderTabs } from "@/components/crm/section-header";

import { useSettingsHeaderSlots } from "../_v2-shell";

export type SettingsTab = {
  id: string;
  label: string;
  badge?: number;
  icon?: ComponentType<{ size?: number; className?: string }>;
};

/**
 * Abas canônicas no slot `actions` do PageHeader (antes do hamburger).
 * Sem o shell, cai no corpo alinhado à direita.
 */
export function SettingsHeaderNav({
  tabs,
  active,
  onChange,
  trailing,
  inTitle = false,
}: {
  tabs: SettingsTab[];
  active: string;
  onChange: (id: string) => void;
  trailing?: React.ReactNode;
  /** Abas na linha do título; o restante fica na linha da busca. */
  inTitle?: boolean;
}) {
  const slots = useSettingsHeaderSlots();
  const tabKey = tabs.map((t) => `${t.id}:${t.label}:${t.badge ?? ""}`).join("|");
  const tabsNode = React.useMemo(
    () => (
      <HeaderTabs
        tabs={tabs.map((t) => ({ key: t.id, label: t.label, badge: t.badge }))}
        value={active}
        onChange={onChange}
      />
    ),
    // tabKey cobre o conteúdo de `tabs` sem nova identidade a cada render.
    [active, onChange, tabKey],
  );
  const actions = React.useMemo(
    () =>
      inTitle ? (
        trailing ? <div className="flex shrink-0 items-center">{trailing}</div> : null
      ) : (
        <div className="flex min-w-0 max-w-full flex-1 items-center gap-2">
          {tabsNode}
          {trailing}
        </div>
      ),
    [inTitle, tabsNode, trailing],
  );

  React.useEffect(() => {
    if (!slots) return;
    if (inTitle) {
      slots.setTitleAccessory(tabsNode);
      if (actions) slots.setActions(actions);
      return () => {
        slots.setTitleAccessory(null);
        if (actions) slots.setActions(null);
      };
    }
    slots.setActions(actions);
    return () => slots.setActions(null);
  }, [slots, actions, inTitle, tabsNode]);

  if (slots) return null;
  return (
    <div className="flex justify-end">
      {inTitle ? (
        <>
          {tabsNode}
          {actions}
        </>
      ) : (
        actions
      )}
    </div>
  );
}

/** @deprecated Prefira `SettingsHeaderNav` no header. Mantido para fallback no corpo. */
export function SettingsTabs({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: SettingsTab[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <HeaderTabs
        tabs={tabs.map((t) => ({ key: t.id, label: t.label, badge: t.badge }))}
        value={active}
        onChange={onChange}
      />
    </div>
  );
}
