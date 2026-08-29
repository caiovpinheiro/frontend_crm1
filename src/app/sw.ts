/// <reference lib="webworker" />
import { apiUrl } from "@/lib/api";
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

/**
 * Service Worker do EduIT CRM — gerenciado pelo Serwist.
 *
 * Responsabilidades:
 *  1. Precache do shell do app (gerado em build pelo Serwist).
 *  2. Runtime cache de assets estaticos (defaultCache do Serwist).
 *  3. Push notifications: receber payloads do servidor + clique
 *     abrir/focar a janela na conversa correta.
 *  4. Fallback offline minimo.
 *
 * NAO faz:
 *  - Cache de NENHUMA rota de /api/. Cobre a mídia autenticada
 *    (/api/storage e /api/media), cujas respostas parciais 206 precisam
 *    preservar o Range, e o SSE (/api/sse/messages), que é um stream sem
 *    fim. Vale para o resto da API também: são dados de um tenant, e o
 *    Cache Storage sobrevive ao logout.
 *  - Background sync de mensagens (proxima fase).
 */

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
};

function isSseRequest(pathname: string, request?: Request): boolean {
  if (pathname.startsWith("/api/sse")) return true;
  return Boolean(request?.headers.get("accept")?.includes("text/event-stream"));
}

/**
 * defaultCache do Serwist também casa navegação e RSC (`pages-rsc`,
 * `pages-rsc-prefetch`). Hard refresh + payload velho = error.tsx
 * ("Algo deu errado") com APIs 200. SSE: `respondWith` aborta o stream.
 */
function skipFragileRuntime<T extends { matcher: unknown }>(rule: T): T {
  const orig = rule.matcher;
  if (typeof orig !== "function") return rule;
  return {
    ...rule,
    matcher: (options: { request?: Request; url: URL }) => {
      const request = options.request;
      if (options.url.pathname.startsWith("/api/")) return false;
      if (isSseRequest(options.url.pathname, request)) return false;
      if (request?.mode === "navigate") return false;
      if (request?.headers.get("RSC") === "1") return false;
      if (request?.headers.get("Next-Router-Prefetch") === "1") return false;
      return orig(options);
    },
  };
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // /api/* não entra no SW: NetworkOnly ainda gera 2 linhas no HAR
    // (página + worker) e um hop extra. Sem matcher, o browser fala
    // com a rede direto — igual SSE. defaultCache já ignora /api/.
    // Rotas de página das chamadas WhatsApp — fora de /api/, então não são
    // cobertas pelas regras acima.
    {
      matcher: ({ sameOrigin, url: { pathname } }) =>
        sameOrigin &&
        (pathname === "/wa-call-permission" ||
          pathname === "/wa-whatsapp-call" ||
          pathname.includes("/whatsapp-calls")),
      method: "POST",
      handler: new NetworkOnly(),
    },
    ...defaultCache.map(skipFragileRuntime),
  ],
});

serwist.addEventListeners();

/**
 * Apaga caches deixadas pelas versões anteriores deste worker.
 * "apis": NetworkFirst de /api/ (24h) — dado autenticado no disco.
 * RSC: payload de rota com hash de chunk velho → ChunkLoadError após deploy.
 */
self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(
    Promise.all([
      caches.delete("apis"),
      caches.delete("pages-rsc"),
      caches.delete("pages-rsc-prefetch"),
    ]),
  );
});

// ─────────────────────────────────────────────────────────────────
// PUSH NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────

interface PushPayload {
  title: string;
  body: string;
  /** Caminho relativo a abrir ao clicar — ex: "/inbox?conv=abc". */
  url?: string;
  /** ID unico pra agregar notificacoes da mesma conversa. */
  tag?: string;
  /** Forca exibicao mesmo se outra com mesma tag existe. */
  renotify?: boolean;
  /** URL da imagem grande (preview de midia). */
  image?: string;
  /** Icone customizado por payload (default = icone do app). */
  icon?: string;
  /** Vibration pattern em ms — [vibrate, pause, vibrate, ...]. */
  vibrate?: number[];
  /** Dados arbitrarios pra notificationclick. */
  data?: Record<string, unknown>;
}

self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;

  let payload: PushPayload;
  try {
    payload = event.data.json() as PushPayload;
  } catch {
    // Fallback: trata como texto puro.
    payload = { title: "Bwipo", body: event.data.text() };
  }

  const {
    title,
    body,
    url = "/inbox",
    tag,
    renotify = false,
    image,
    icon = "/icon.svg",
    vibrate,
    data,
  } = payload;

  const options: NotificationOptions & {
    vibrate?: number[];
    image?: string;
    renotify?: boolean;
  } = {
    body,
    icon,
    badge: "/icon.svg",
    tag,
    renotify,
    image,
    vibrate: vibrate ?? [80, 40, 80],
    data: { url, ...(data ?? {}) },
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const data = (event.notification.data ?? {}) as { url?: string };
  const targetUrl = data.url ?? "/inbox";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Tenta focar uma janela ja aberta do app — economiza memoria
      // e mantem estado do React (queries em cache, scroll position).
      for (const client of allClients) {
        const clientUrl = new URL(client.url);
        const targetFull = new URL(targetUrl, self.location.origin);
        if (clientUrl.origin === targetFull.origin) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await (client as WindowClient).navigate(targetFull.href);
            } catch {
              // Fallback: postMessage pro app fazer router.push.
              (client as WindowClient).postMessage({
                type: "PUSH_NAVIGATE",
                url: targetUrl,
              });
            }
          }
          return;
        }
      }

      await self.clients.openWindow(targetUrl);
    })(),
  );
});

// ─────────────────────────────────────────────────────────────────
// PUSH SUBSCRIPTION CHANGE — re-subscreve automaticamente quando o
// browser invalida a subscription (rotacao de chaves do navegador).
// ─────────────────────────────────────────────────────────────────
self.addEventListener("pushsubscriptionchange", (event: any) => {
  event.waitUntil(
    (async () => {
      try {
        const res = await fetch(apiUrl("/api/push/vapid-public"));
        if (!res.ok) return;
        const { publicKey } = (await res.json()) as { publicKey: string };
        const newSub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        });
        await fetch(apiUrl("/api/push/subscribe"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newSub.toJSON()),
        });
      } catch (err) {
        console.error("[sw] pushsubscriptionchange failed:", err);
      }
    })(),
  );
});

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

export {};
