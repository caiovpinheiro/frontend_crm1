"use client";

import dynamic from "next/dynamic";

/** Chat legado (~5k linhas) — só entra no bundle quando o painel abre. */
export const ChatWindow = dynamic(
  () =>
    import("@/components/inbox/chat-window").then((m) => ({
      default: m.ChatWindow,
    })),
  { ssr: false },
);
