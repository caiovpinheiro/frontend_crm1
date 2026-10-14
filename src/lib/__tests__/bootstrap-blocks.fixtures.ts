/**
 * Fixtures do teste de `lib/bootstrap-blocks.ts`: para cada URL do mapa,
 * um corpo de exemplo (como a rota individual devolve), a chave que o
 * hook usa e o hook REAL que a consome. O teste monta o hook contra a
 * rede mockada e confere que o dado em cache é igual ao semeado.
 */
import { useQuery } from "@tanstack/react-query";

import { useDepartments } from "@/features/conversations-settings/hooks/use-departments";
import { useInboxSettings } from "@/features/conversations-settings/hooks/use-inbox-settings";
import {
  useQuickReplies,
  useQuickReplyGroups,
} from "@/features/conversations-settings/hooks/use-quick-replies";
import { ACTIVITY_ALERT_KEY, useActivityAlert } from "@/features/directory-v2/hooks";
import { useWhatsappChannels } from "@/features/inbox-v2/hooks/use-channels";
import { PIPELINES_QUERY_KEY, usePipelinesQuery } from "@/features/shared/queries/pipelines";
import { teamUsersKey, useTeamUsersQuery } from "@/features/shared/queries/team-users";
import { useTeamChatRooms } from "@/features/team-chat/hooks";
import { useFieldLayout } from "@/hooks/use-field-layout";
import { fetchVisibilitySettings } from "@/hooks/use-viewer-scope-sync";
import { apiUrl } from "@/lib/api";

export type BlockFixture = {
  body: unknown;
  queryKey: readonly unknown[];
  /** Hook real que lê esta chave (monta e busca pela rede mockada). */
  useHook: () => unknown;
};

export const BLOCK_FIXTURES: Record<string, BlockFixture> = {
  "/api/team-chat/rooms": {
    body: { rooms: [{ id: "r1", kind: "DM", name: "Ana", unread: 2, muted: false }] },
    queryKey: ["team-chat-rooms"],
    useHook: () => useTeamChatRooms(true),
  },
  "/api/activities/alerts": {
    body: { alert: null },
    queryKey: ACTIVITY_ALERT_KEY,
    useHook: () => useActivityAlert(true),
  },
  "/api/pipelines": {
    body: [{ id: "p1", name: "Vendas", stages: [{ id: "s1", name: "Novo", color: "#000", position: 0 }] }],
    queryKey: PIPELINES_QUERY_KEY,
    useHook: () => usePipelinesQuery(true),
  },
  "/api/settings/org?prefix=conversation.": {
    body: {
      "conversation.agentSignatureEnabled": "false",
      "conversation.requireSignature": "true",
      "conversation.returnToPreviousAgent": "always",
    },
    queryKey: ["org-settings", "inbox"],
    useHook: () => useInboxSettings(),
  },
  "/api/field-layout?context=deal_panel_v2&forUser=true": {
    body: { admin: [{ id: "profile", visible: true }], agent: null },
    queryKey: ["field-layout", "deal_panel_v2"],
    useHook: () => useFieldLayout("deal_panel_v2"),
  },
  "/api/custom-fields/card-extension": {
    body: [{ id: "cf1", label: "Plano" }],
    queryKey: ["custom-fields-card-extension"],
    // O queryFn real vive dentro de `deal-detail-panel.tsx` (`fetchJsonList`):
    // mesma lógica aqui, sem importar o painel inteiro.
    useHook: () =>
      useQuery({
        queryKey: ["custom-fields-card-extension"],
        queryFn: async () => {
          const res = await fetch(apiUrl("/api/custom-fields/card-extension"));
          if (!res.ok) return [];
          const data: unknown = await res.json();
          return Array.isArray(data) ? data : [];
        },
      }),
  },
  "/api/channels": {
    body: {
      channels: [
        { id: "c1", name: "WA", type: "WHATSAPP", provider: "META", status: "CONNECTED", phoneNumber: "55" },
        { id: "c2", name: "Mail", type: "EMAIL", provider: "X", status: "CONNECTED" },
        { id: "c3", name: "IG", type: "INSTAGRAM", provider: "META", status: "DISCONNECTED" },
      ],
    },
    queryKey: ["inbox-v2", "outbound-messaging-channels"],
    useHook: () => useWhatsappChannels(true),
  },
  "/api/users": {
    body: { items: [{ id: "u1", name: "Ana" }, { id: "u2", name: "Bia" }] },
    queryKey: teamUsersKey(false),
    useHook: () => useTeamUsersQuery(true),
  },
  "/api/settings/quick-replies": {
    body: [{ id: "q1", title: "Oi", content: "Olá!", groupId: null, attachmentUrl: null, position: 0, group: null }],
    queryKey: ["settings", "quick-replies", ""],
    useHook: () => useQuickReplies(""),
  },
  "/api/settings/quick-replies/groups": {
    body: [{ id: "g1", name: "Geral", order: 0, _count: { quickReplies: 1 } }],
    queryKey: ["settings", "quick-reply-groups"],
    useHook: () => useQuickReplyGroups(),
  },
  "/api/settings/visibility": {
    body: { MEMBER: "own", MANAGER: "all" },
    queryKey: ["settings-visibility"],
    useHook: () =>
      useQuery({ queryKey: ["settings-visibility"], queryFn: fetchVisibilitySettings }),
  },
  "/api/settings/departments": {
    body: { items: [{ id: "d1", name: "Vendas", requireTabulationOnClose: false }] },
    queryKey: ["settings", "departments"],
    useHook: () => useDepartments(),
  },
};
