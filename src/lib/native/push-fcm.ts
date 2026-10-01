/**
 * Registro FCM no APK via Capacitor.Plugins (sem pacote no bundle Next).
 * Em browser/desktop este módulo é no-op.
 */
import { logger } from "@/lib/logger";
import { apiUrl } from "@/lib/api";
import {
  getCapacitorPlugins,
  isNativePlatform,
} from "@/lib/native/capacitor";

type PermissionStatus = "granted" | "denied" | "prompt" | "prompt-with-rationale";

interface NativePushPlugin {
  requestPermissions(): Promise<{ receive: PermissionStatus }>;
  register(): Promise<void>;
  addListener(
    eventName:
      | "registration"
      | "registrationError"
      | "pushNotificationReceived"
      | "pushNotificationActionPerformed",
    callback: (event: Record<string, unknown>) => void,
  ): Promise<{ remove: () => void | Promise<void> }> | { remove: () => void | Promise<void> };
}

let started = false;

function getPushPlugin(): NativePushPlugin | undefined {
  return getCapacitorPlugins()?.PushNotifications as NativePushPlugin | undefined;
}

async function sendToken(token: string): Promise<void> {
  await fetch(apiUrl("/api/push/subscribe"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      transport: "fcm",
      token,
      platform: "android",
    }),
  });
}

function navigateFromNotification(data: Record<string, unknown> | undefined): void {
  const url = typeof data?.url === "string" ? data.url : "/activities";
  if (typeof window === "undefined") return;
  if (window.location.pathname + window.location.search !== url) {
    window.location.assign(url);
  }
}

export async function registerNativePush(): Promise<void> {
  if (started || !isNativePlatform()) return;
  const plugin = getPushPlugin();
  if (!plugin?.requestPermissions || !plugin.register) return;
  started = true;

  try {
    const perm = await plugin.requestPermissions();
    if (perm.receive !== "granted") {
      started = false;
      return;
    }

    await plugin.addListener("registration", (event) => {
      const token = typeof event.value === "string" ? event.value : "";
      if (token) void sendToken(token);
    });

    await plugin.addListener("pushNotificationActionPerformed", (event) => {
      const notification = event.notification as
        | { data?: Record<string, unknown> }
        | undefined;
      navigateFromNotification(notification?.data);
    });

    await plugin.addListener("pushNotificationReceived", () => {
      // App em foreground: o TaskAlertCenter já mostra o popup interno.
    });

    await plugin.register();
  } catch (err) {
    started = false;
    logger.warn("fcm", "falha ao registrar push nativo", err);
  }
}
