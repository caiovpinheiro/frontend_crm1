import { isSafeHref } from "@/lib/safe-href";

export type AdReferral = {
  sourceId?: string;
  sourceType?: string;
  ctwaClid?: string;
  headline?: string;
  body?: string;
  sourceUrl?: string;
  mediaType?: string;
  imageUrl?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  storedImageUrl?: string;
  storedThumbnailUrl?: string;
};

const KEYS = [
  "sourceId",
  "sourceType",
  "ctwaClid",
  "headline",
  "body",
  "sourceUrl",
  "mediaType",
  "imageUrl",
  "videoUrl",
  "thumbnailUrl",
  "storedImageUrl",
  "storedThumbnailUrl",
] as const satisfies readonly (keyof AdReferral)[];

const IMAGE_KEYS = [
  "storedImageUrl",
  "storedThumbnailUrl",
  "imageUrl",
  "thumbnailUrl",
] as const satisfies readonly (keyof AdReferral)[];

export function normalizeAdReferral(raw: unknown): AdReferral | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const src = raw as Record<string, unknown>;
  const out: AdReferral = {};
  for (const key of KEYS) {
    const v = src[key];
    if (typeof v === "string" && v.trim()) out[key] = v.trim();
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function isAdReferral(referral: AdReferral | null | undefined): boolean {
  if (!referral) return false;
  return referral.sourceType === "ad" || !!referral.sourceId || !!referral.ctwaClid;
}

function safeImageSrc(raw: string | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  if (v.startsWith("/api/storage/") || v.startsWith("/uploads/")) return v;
  if (isSafeHref(v) && /^https:\/\//i.test(v)) return v;
  return null;
}

/** storedImageUrl → storedThumbnailUrl → imageUrl → thumbnailUrl. */
export function pickAdImage(referral: AdReferral | null | undefined): string | null {
  if (!referral) return null;
  for (const key of IMAGE_KEYS) {
    const src = safeImageSrc(referral[key]);
    if (src) return src;
  }
  return null;
}

export function safeAdHref(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  if (!v || !isSafeHref(v) || !/^https?:\/\//i.test(v)) return null;
  return v;
}
