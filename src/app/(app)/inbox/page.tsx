/**
 * /v2/inbox — reaproveita integralmente o InboxV2ClientPage do route
 * group `(v2)/inbox-v2`. Apenas injeta o `<NavRailSpacer />` (hrefs /v2/*)
 * via prop `navRail` para casar com o novo shell.
 *
 * Mudanças no chat: nenhuma. Toda a feature inbox-v2 (queries, hooks,
 * popovers, realtime SSE) é reaproveitada exatamente como está.
 */

import { IconMessage } from "@tabler/icons-react";

import InboxV2ClientPage from "./_v2-client";
import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";

export const dynamic = "force-dynamic";

function searchParamsToQuery(
  raw: Record<string, string | string[] | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (value == null) continue;
    params.set(key, Array.isArray(value) ? (value[0] ?? "") : value);
  }
  return params.toString();
}

export default async function V2InboxPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const urlQuery = searchParamsToQuery((await searchParams) ?? {});
  return (
    <InboxV2ClientPage
      navRail={<NavRailSpacer />}
      pageHeader={{
        icon: <IconMessage size={22} />,
        title: "Caixa de entrada",
      }}
      urlQuery={urlQuery || undefined}
    />
  );
}
