"use client";

import { signOut } from "next-auth/react";

import { getTenantBaseDomain, getTenantProtocol } from "@/lib/tenant-url";

const STALE_HOST_RE = /easypanel\.host|(^|\.)crm\.eduit\.com\.br$/i;

export function apexOrigin(): string {
  const app = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  if (app && !STALE_HOST_RE.test(app)) {
    try {
      return new URL(app).origin;
    } catch {
      /* fallthrough */
    }
  }
  const base = getTenantBaseDomain();
  if (base && !STALE_HOST_RE.test(base)) {
    return `${getTenantProtocol()}://${base}`;
  }
  return "https://bwipo.com";
}

/** Logoff sempre volta ao login do apex — nunca EasyPanel / crm.eduit. */
export function apexLoginUrl(): string {
  return `${apexOrigin()}/login`;
}

export function signOutToLogin() {
  return signOut({ callbackUrl: apexLoginUrl() });
}
