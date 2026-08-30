"use client";

import OldProfilePage from "@/features/legacy-v1/settings/profile";
import { ProfileSidebarCard } from "@/features/sidebar/profile-sidebar-card";
import { SettingsV2Shell } from "../_v2-shell";

/**
 * Página padrão de Settings — sem botão Voltar. Navegação sai pela
 * sidebar de configurações ou pela NavRail.
 */
export default function ProfileV2ClientPage() {
  return (
    <SettingsV2Shell
      title="Perfil"
      description="Dados pessoais e organização da NavRail"
    >
      <OldProfilePage />
      <ProfileSidebarCard />
    </SettingsV2Shell>
  );
}
