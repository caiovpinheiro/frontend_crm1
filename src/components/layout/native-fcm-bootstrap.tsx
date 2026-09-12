"use client";

import { useSession } from "next-auth/react";
import { useEffect } from "react";

import { useIdleEnabled } from "@/hooks/use-idle-enabled";
import { registerNativePush } from "@/lib/native/push-fcm";

/** Após o first paint no APK, pede permissão e registra o token FCM. */
export function NativeFcmBootstrap() {
  const { status } = useSession();
  const idle = useIdleEnabled();

  useEffect(() => {
    if (status !== "authenticated" || !idle) return;
    void registerNativePush();
  }, [status, idle]);

  return null;
}
