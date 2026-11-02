"use client";

/**
 * Imagem própria do avatar do canal. O arquivo sobe na hora, mas só vale depois
 * de salvar o canal: até lá ele não é público.
 */

import { useRef, useState, type ChangeEvent } from "react";
import { IconLoader2 as Loader2, IconUpload as Upload } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeAvatarUrl } from "@/features/webchat-widget/types";
import { apiUrl } from "@/lib/api";

export const WEBCHAT_LOGO_MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** Caminho de imagem enviada, que não aparece no campo de link. */
function isUploadedLogo(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith("/api/storage/"));
}

export function WebchatLogoUpload({
  channelId,
  value,
  onChange,
}: {
  channelId: string;
  value: string | null | undefined;
  onChange: (next: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = safeAvatarUrl(value);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Envie uma imagem JPG, PNG, WEBP ou GIF.");
      return;
    }
    if (file.size > WEBCHAT_LOGO_MAX_BYTES) {
      setError("A imagem precisa ter até 2 MB.");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(apiUrl(`/api/channels/${channelId}/webchat-logo`), {
        method: "POST",
        body,
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
      if (!res.ok || !data.url) throw new Error(data.message ?? "Não foi possível enviar a imagem.");
      onChange(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar a imagem.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-strong)]">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Prévia do avatar" className="size-full object-cover" />
          ) : null}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
          {isUploadedLogo(value) ? "Trocar imagem" : "Enviar imagem"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          className="sr-only"
          aria-label="Imagem do avatar"
          tabIndex={-1}
          onChange={handleFile}
        />
      </div>
      {error ? (
        <p role="alert" className="text-xs text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      <p className="text-xs text-[var(--text-muted)]">
        JPG, PNG, WEBP ou GIF, até 2 MB. O avatar é redondo: prefira imagem quadrada, com a marca
        no centro. A imagem vale depois de salvar.
      </p>
      <Input
        id="wc-avatar"
        aria-label="Avatar (URL https da imagem)"
        value={isUploadedLogo(value) ? "" : (value ?? "")}
        placeholder="Ou cole um link: https://…/logo.png"
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
