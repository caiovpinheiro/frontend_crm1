/**
 * Nome do arquivo no "Baixar" da imagem.
 *
 * O lightbox baixa via blob e punha o rótulo da bolha (`Imagem`, legenda)
 * no atributo `download`, sem extensão. No Windows o Chrome completa
 * `image/jpeg` com `.jfif` (extensão preferida do registro para esse MIME).
 * JPEG sai como `.jpg`; PNG/GIF/WebP seguem o tipo real.
 */

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/pjpeg": "jpg",
  "image/jfif": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

/** Extensão de imagem já conhecida → canônica (jfif/jpeg/jpe viram jpg). */
const NAME_TO_EXT: Record<string, string> = {
  jpg: "jpg",
  jpeg: "jpg",
  jpe: "jpg",
  jfif: "jpg",
  png: "png",
  gif: "gif",
  webp: "webp",
};

function imageExtFromLabel(label: string): string | null {
  const match = /\.([a-z0-9]+)$/i.exec(label);
  if (!match) return null;
  return NAME_TO_EXT[match[1].toLowerCase()] ?? null;
}

function imageExtFromUrl(sourceUrl: string | null | undefined): string | null {
  if (!sourceUrl) return null;
  const path = sourceUrl.split("?")[0].split("#")[0];
  const segment = path.split("/").pop() ?? "";
  return imageExtFromLabel(segment);
}

export function imageDownloadName(opts: {
  suggested?: string | null;
  contentType?: string | null;
  sourceUrl?: string | null;
}): string {
  const mime = (opts.contentType ?? "").split(";")[0].trim().toLowerCase();
  const fromMime = MIME_TO_EXT[mime] ?? null;
  const cleaned = (opts.suggested ?? "")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  const fromName = imageExtFromLabel(cleaned);
  const ext = fromMime ?? fromName ?? imageExtFromUrl(opts.sourceUrl) ?? "jpg";

  const stem = cleaned.replace(/\.(jpe?g|jpe|jfif|png|gif|webp)$/i, "");
  const base = stem.replace(/\.+$/g, "") || "imagem";
  return `${base}.${ext}`;
}
