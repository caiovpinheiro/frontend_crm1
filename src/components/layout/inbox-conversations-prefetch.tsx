"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { readInboxViewForPrefetch } from "@/features/inbox-v2/hooks/use-inbox-filters-url-sync";
import {
  inboxListServerFilters,
  prefetchInboxWarmCache,
} from "@/features/inbox-v2/hooks/use-conversations";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { useUserRole } from "@/hooks/use-user-role";
import { INBOX_PREFETCH_INTENT_EVENT } from "@/lib/inbox-prefetch-intent";
import { filterNavItemsByPermissions, getSidebarCatalogItem } from "@/lib/sidebar-catalog";

/**
 * Aquece a lista do Inbox quando o usuário sinaliza que vai abri-lo
 * (hover/foco/toque no item Inbox do menu — `signalInboxPrefetchIntent`)
 * e só se ele tem o item no menu. No /inbox a própria página busca —
 * prefetch aqui seria duplicata. Uma vez por montagem do layout.
 */
export function InboxConversationsPrefetch() {
  const { status } = useSession();
  const pathname = usePathname() ?? "";
  const queryClient = useQueryClient();
  const { isSuperAdmin } = useUserRole();
  const { data: myPerms } = useMyPermissions();
  const started = useRef(false);

  const inboxItem = getSidebarCatalogItem("inbox");
  // Permissões ainda carregando (`undefined`) = não aquece; só super admin passa.
  const canSeeInbox = Boolean(
    inboxItem &&
      (isSuperAdmin || myPerms) &&
      filterNavItemsByPermissions([inboxItem], {
        isSuperAdmin,
        permissions: myPerms?.permissions ?? [],
      }).length > 0,
  );

  useEffect(() => {
    if (status !== "authenticated") return;
    if (!canSeeInbox) return;
    if (pathname.startsWith("/inbox")) return;

    const run = () => {
      if (started.current) return;
      started.current = true;
      const view = readInboxViewForPrefetch();
      void prefetchInboxWarmCache(
        queryClient,
        view.tab,
        inboxListServerFilters(view.filters),
      );
    };

    window.addEventListener(INBOX_PREFETCH_INTENT_EVENT, run);
    return () => {
      window.removeEventListener(INBOX_PREFETCH_INTENT_EVENT, run);
    };
  }, [status, canSeeInbox, queryClient, pathname]);

  return null;
}
