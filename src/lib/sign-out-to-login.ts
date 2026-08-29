"use client";

import { signOut } from "next-auth/react";

import { isSingleHostCrm } from "@/lib/tenant-host";
import { getTenantBaseDomain, getTenantProtocol } from "@/lib/tenant-url";

const STALE_HOST_RE = /(^|\.)crm\.eduit\.com\.br$/i;

export function apexOrigin(): string {
  if (typeof window !== "undefined" && isSingleHostCrm(window.location.host)) {
    return window.location.origin;
  }
  const app = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  if (app) {
    try {
      const url = new URL(app);
      if (isSingleHostCrm(url.hostname)) return url.origin;
      if (!STALE_HOST_RE.test(app)) return url.origin;
    } catch {
      /* fallthrough */
    }
  }
  const base = getTenantBaseDomain();
  if (base && !STALE_HOST_RE.test(base) && !isSingleHostCrm(base)) {
    return `${getTenantProtocol()}://${base}`;
  }
  return "https://bwipo.com";
}

/** Logoff: em produção (`bwipo.com` / `{slug}.bwipo.com`) volta ao apex. EasyPanel DEV fica no mesmo host. */
export function apexLoginUrl(): string {
  return `${apexOrigin()}/login`;
}

export function signOutToLogin() {
  return signOut({ callbackUrl: apexLoginUrl() });
}
