import type { SidebarItemPreference } from "@/lib/sidebar-catalog";

export type { SidebarItemPreference };

/** Resposta de GET /api/profile/preferences (campos usados pela sidebar). */
export interface SidebarPreferencesResponse {
  sidebar: {
    items: SidebarItemPreference[];
  };
  /** Teto do papel — o overlay pessoal nao reexibe o que o admin escondeu. */
  roleSidebar?: {
    items: SidebarItemPreference[];
  };
  availableKeys?: string[];
  appearance?: {
    theme: "light" | "dark" | null;
  };
}
