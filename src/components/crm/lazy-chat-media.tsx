"use client";

import { useState, type ReactNode } from "react";
import {
  IconDownload,
  IconFile,
  IconPhoto,
  IconPlayerPlay,
} from "@tabler/icons-react";

import { ImageLightbox } from "@/components/crm/image-lightbox";
import { cn } from "@/lib/utils";

export type LazyChatMediaKind = "image" | "video" | "audio" | "document";

/** blob:/data: já estão na memória — podem pintar sem hit de rede. */
export function isImmediateMediaSrc(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.startsWith("blob:") || url.startsWith("data:");
}

function kindLabel(kind: LazyChatMediaKind): string {
  switch (kind) {
    case "image":
      return "Imagem";
    case "video":
      return "Vídeo";
    case "audio":
      return "Áudio";
    case "document":
      return "Documento";
  }
}

function actionLabel(kind: LazyChatMediaKind): string {
  if (kind === "document") return "Abrir";
  if (kind === "image") return "Ver";
  return "Reproduzir";
}

export function LazyChatMediaPlaceholder({
  kind,
  fileName,
  durationLabel,
  onAction,
  href,
  download,
}: {
  kind: LazyChatMediaKind;
  fileName: string;
  durationLabel?: string | null;
  onAction?: () => void;
  href?: string;
  download?: boolean;
}) {
  const Icon =
    kind === "image" ? IconPhoto : kind === "document" ? IconFile : IconPlayerPlay;
  const inner = (
    <>
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon
          className={cn(
            "size-5",
            (kind === "video" || kind === "audio") && "translate-x-px",
          )}
        />
      </div>
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-medium text-foreground">{fileName}</p>
        <p className="text-[11px] text-muted-foreground">
          {kindLabel(kind)}
          {durationLabel ? ` · ${durationLabel}` : ""}
        </p>
      </div>
      {kind === "document" ? (
        <IconDownload className="size-4 shrink-0 text-muted-foreground" />
      ) : (
        <span className="shrink-0 rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground">
          {actionLabel(kind)}
        </span>
      )}
    </>
  );

  const cls =
    "flex w-full min-w-[200px] max-w-[280px] items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left";

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        download={download || undefined}
        className={cls}
      >
        {inner}
      </a>
    );
  }

  return (
    <button type="button" onClick={onAction} className={cls}>
      {inner}
    </button>
  );
}

export function LazyChatImage({
  url,
  fileName,
  caption,
  isUploading,
}: {
  url: string;
  fileName: string;
  caption?: ReactNode;
  isUploading?: boolean;
}) {
  const [loaded, setLoaded] = useState(
    () => isImmediateMediaSrc(url) || !!isUploading,
  );
  const [open, setOpen] = useState(false);

  if (!loaded) {
    return (
      <div className="flex flex-col gap-1.5">
        <LazyChatMediaPlaceholder
          kind="image"
          fileName={fileName}
          onAction={() => setLoaded(true)}
        />
        {caption}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group block cursor-zoom-in overflow-hidden rounded-xl text-left"
          aria-label="Ampliar imagem"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={fileName}
            className="max-h-[320px] w-auto max-w-full rounded-xl object-cover transition-opacity group-hover:opacity-[0.97]"
          />
        </button>
        {caption}
      </div>
      <ImageLightbox src={url} alt={fileName} open={open} onOpenChange={setOpen} />
    </>
  );
}

export function LazyChatVideo({
  url,
  fileName,
  caption,
  isUploading,
}: {
  url: string;
  fileName: string;
  caption?: ReactNode;
  isUploading?: boolean;
}) {
  const [loaded, setLoaded] = useState(
    () => isImmediateMediaSrc(url) || !!isUploading,
  );

  if (!loaded) {
    return (
      <div className="flex flex-col gap-1.5">
        <LazyChatMediaPlaceholder
          kind="video"
          fileName={fileName}
          onAction={() => setLoaded(true)}
        />
        {caption}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <video
        controls
        playsInline
        src={url}
        className="max-h-[320px] w-full min-w-[220px] rounded-xl bg-card"
      />
      {caption}
    </div>
  );
}

export function LazyChatDocument({
  url,
  fileName,
}: {
  url: string;
  fileName: string;
}) {
  return (
    <LazyChatMediaPlaceholder
      kind="document"
      fileName={fileName}
      href={url}
      download
    />
  );
}
