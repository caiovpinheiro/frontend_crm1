"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  IconBoxMultiple,
  IconPackage,
  IconTicket,
} from "@tabler/icons-react";

import { ProductsV2Page } from "@/features/products-v2/products-page";
import { CatalogsManager } from "@/features/catalogs-v2/catalogs-page";
import { QuotasPage } from "@/features/quotas/quotas-page";
import { RestrictedScreen } from "@/components/crm/restricted-screen";
import { useUserRole } from "@/hooks/use-user-role";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { canSeeItem, type Viewer } from "@/lib/nav-visibility";
import { SETTINGS_HUB_BACK, SettingsV2Shell } from "../_v2-shell";
import { SettingsHeaderNav, type SettingsTab } from "../_components/settings-tabs";

const TAB_META: (SettingsTab & { permission: string })[] = [
  { id: "catalog", label: "Catálogo", icon: IconBoxMultiple, permission: "catalog:view" },
  { id: "products", label: "Produtos", icon: IconPackage, permission: "product:view" },
  { id: "cotas", label: "Cotas de desconto", icon: IconTicket, permission: "quota:view" },
];

export default function ProductsV2ClientPage() {
  const router = useRouter();
  const params = useSearchParams();
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

  const tabs = useMemo(
    () => TAB_META.filter((t) => canSeeItem({ requiredPermission: t.permission }, viewer)),
    [viewer],
  );

  const [productMenu, setProductMenu] = useState<ReactNode>(null);

  const requested = params.get("tab");
  const active = tabs.some((t) => t.id === requested)
    ? (requested as string)
    : tabs[0]?.id ?? "products";

  const setActive = useCallback(
    (id: string) => {
      const sp = new URLSearchParams(params.toString());
      sp.set("tab", id);
      router.replace(`/settings/products?${sp.toString()}`);
    },
    [params, router],
  );

  return (
    <SettingsV2Shell
      back={SETTINGS_HUB_BACK}
      title="Produtos"
      description="Catálogo, produtos e cotas de desconto"
      icon={<IconPackage size={22} />}
    >
      {tabs.length === 0 ? (
        <RestrictedScreen
          title="Acesso restrito"
          description="Você não tem permissão para ver estas seções."
        />
      ) : (
        <>
          <SettingsHeaderNav
            tabs={tabs}
            active={active}
            onChange={setActive}
            trailing={active === "products" ? productMenu : undefined}
          />
          {active === "catalog" && <CatalogsManager />}
          {active === "products" && (
            <ProductsV2Page onHeaderMenu={setProductMenu} />
          )}
          {active === "cotas" && <QuotasPage />}
        </>
      )}
    </SettingsV2Shell>
  );
}
