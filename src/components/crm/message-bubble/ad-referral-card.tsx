"use client"

import { useState } from "react"
import { IconExternalLink } from "@tabler/icons-react"

import { resolveMediaUrl } from "@/components/crm/message-bubble/media-helpers"
import {
  pickAdImage,
  safeAdHref,
  type AdReferral,
} from "@/lib/ad-referral"

const BODY_MAX = 160

export function AdReferralCard({ referral }: { referral: AdReferral }) {
  const [imageFailed, setImageFailed] = useState(false)
  const rawImage = pickAdImage(referral)
  const imageSrc = rawImage ? resolveMediaUrl(rawImage) : null
  const title = referral.headline?.trim() || "Anúncio Meta"
  const showKicker = Boolean(referral.headline?.trim())
  const body = referral.body?.trim() ?? ""
  const secondary =
    body && body !== title ? (body.length > BODY_MAX ? `${body.slice(0, BODY_MAX)}…` : body) : ""
  const href = safeAdHref(referral.sourceUrl)

  return (
    <div
      data-ad-referral=""
      className="mb-1.5 flex max-w-full gap-2.5 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] p-2"
    >
      {imageSrc && !imageFailed ? (
        <img
          src={imageSrc}
          alt=""
          className="h-[88px] w-[88px] shrink-0 rounded-[var(--radius-md)] object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : null}
      <div className="min-w-0 flex-1 py-0.5">
        {showKicker ? (
          <div className="text-[11px] font-medium leading-4 text-[var(--text-muted)]">
            Anúncio Meta
          </div>
        ) : null}
        <div className="break-words text-[13px] font-semibold leading-snug text-[var(--text-primary)]">
          {title}
        </div>
        {secondary ? (
          <div className="mt-0.5 line-clamp-2 break-words text-[12px] leading-snug text-[var(--text-secondary)]">
            {secondary}
          </div>
        ) : null}
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex max-w-full items-center gap-1 text-[12px] font-medium text-[var(--brand-primary)] underline-offset-2 hover:underline"
          >
            Ver anúncio
            <IconExternalLink size={12} aria-hidden />
          </a>
        ) : null}
      </div>
    </div>
  )
}
