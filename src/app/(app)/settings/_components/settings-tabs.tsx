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
}: {
  tabs: SettingsTab[];
  active: string;
  onChange: (id: string) => void;
  trailing?: React.ReactNode;
}) {
  const slots = useSettingsHeaderSlots();
  const tabKey = tabs.map((t) => `${t.id}:${t.label}:${t.badge ?? ""}`).join("|");
  const actions = React.useMemo(
    () => (
      <div className="flex items-center gap-2">
        <HeaderTabs
          tabs={tabs.map((t) => ({ key: t.id, label: t.label, badge: t.badge }))}
          value={active}
          onChange={onChange}
        />
        {trailing}
      </div>
    ),
    // tabKey cobre o conteúdo de `tabs` sem nova identidade a cada render.
    [active, onChange, tabKey, trailing],
  );

  React.useEffect(() => {
    if (!slots) return;
    slots.setActions(actions);
    return () => slots.setActions(null);
  }, [slots, actions]);

  if (slots) return null;
  return <div className="flex justify-end">{actions}</div>;
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
