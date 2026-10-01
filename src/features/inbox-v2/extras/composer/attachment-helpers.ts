export const WHATSAPP_IMAGE_CAPTION_MAX = 1024;

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const IMAGE_FILE_EXT = /\.(png|jpe?g|gif|webp|bmp|heic|heif)$/i;

/** Windows Explorer muitas vezes entrega `file.type` vazio no arraste. */
export function fileIsImage(file: File): boolean {
  return file.type.startsWith("image/") || IMAGE_FILE_EXT.test(file.name);
}

export function dragEventHasFiles(e: DragEvent): boolean {
  const types = e.dataTransfer?.types;
  if (types) {
    for (let i = 0; i < types.length; i += 1) {
      const t = types[i];
      if (t === "Files" || t === "application/x-moz-file") return true;
    }
  }
  return (e.dataTransfer?.files?.length ?? 0) > 0;
}

export function isForeignFileDropZone(e: DragEvent): boolean {
  const target = e.target;
  return target instanceof Element && !!target.closest("[data-file-drop-zone]");
}

// Extensão de arquivo a partir do mime da imagem colada.
export function imageExtFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/bmp": "bmp",
    "image/svg+xml": "svg",
  };
  return map[mime] ?? "png";
}
