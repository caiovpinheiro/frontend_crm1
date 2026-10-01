"use client";

import { logger } from "@/lib/logger";
import { apiUrl } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";
import { ensureNotificationPermission } from "@/lib/native/permissions";
import { isNativePlatform } from "@/lib/native/capacitor";

/**
 * Hook do Web Push do EduIT.
 *
 * Estados expostos:
 *  - `isSupported`: navegador tem PushManager + ServiceWorker.
 *  - `permission`: estado atual (default | granted | denied).
 *  - `isSubscribed`: o SW deste navegador tem subscription ativa.
 *  - `isLoading`: alguma operacao em curso.
 *
 * Acoes:
 *  - `subscribe()`: pede permissao (se necessario), gera subscription
 *    com a chave VAPID do servidor, e POST /api/push/subscribe.
 *  - `unsubscribe()`: cancela local + remove do banco.
 *
 * Sem fetch automatico — a UI decide quando ativar. Evitamos pedir
 * permissao na carga (UX ruim, alta taxa de "deny perpetuo").
 */
export interface PushSubscriptionState {
  isSupported: boolean;
  permission: NotificationPermission;
  isSubscribed: boolean;
  isLoading: boolean;
  error: string | null;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

export function usePushSubscription(): PushSubscriptionState {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const supported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setIsSupported(supported);
    if (!supported) return;

    setPermission(Notification.permission);

    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setIsSubscribed(Boolean(sub)))
      .catch(() => {});
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      setError("push_not_supported");
      return false;
    }
    setError(null);
    setIsLoading(true);
    try {
      // 1. Permissao
      const permissionResult = await ensureNotificationPermission();
      if (permissionResult.status !== "unsupported") {
        setPermission(permissionResult.status);
      }
      if (!permissionResult.ok) {
        setError("permission_denied");
        if (isNativePlatform() && permissionResult.error) {
          logger.warn("push", "permissão negada no APK", permissionResult.error);
        }
        return false;
      }

      // 2. VAPID public key do servidor
      const vapidRes = await fetch(apiUrl("/api/push/vapid-public"));
      if (!vapidRes.ok) {
        setError("vapid_unavailable");
        return false;
      }
      const { publicKey } = (await vapidRes.json()) as { publicKey: string };

      // 3. Subscribe via SW
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        });
      }

      // 4. Manda pro backend
      const res = await fetch(apiUrl("/api/push/subscribe"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) {
        setError("subscribe_failed");
        return false;
      }

      setIsSubscribed(true);
      return true;
    } catch (err) {
      logger.error("push", "subscribe error", err);
      setError("subscribe_exception");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;
    setIsLoading(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) {
        setIsSubscribed(false);
        return true;
      }
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await fetch(apiUrl("/api/push/unsubscribe"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });
      setIsSubscribed(false);
      return true;
    } catch (err) {
      logger.error("push", "unsubscribe error", err);
      setError("unsubscribe_exception");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

  return {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    error,
    subscribe,
    unsubscribe,
  };
}
