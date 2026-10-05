import { mediaAssetUrl, resolveMediaCdnBaseUrl } from "@/lib/media-cdn";

/**
 * Tutorial "Como importar Keeps": player HTML estático + vídeo.
 *
 * O vídeo tem o hash do conteúdo no nome (`/tutorials/*` sai com cache de
 * 1 ano, imutável — `next.config.ts`): trocar o vídeo = arquivo novo com
 * hash novo + atualizar este nome e o `src` do HTML. O HTML tem nome fixo
 * e revalida a cada abertura.
 *
 * Com `NEXT_PUBLIC_MEDIA_CDN_BASE_URL` o player abre na CDN; o vídeo vai
 * junto (o HTML o referencia por caminho relativo), então os dois arquivos
 * sobem para `<base>/tutorials/`.
 */
export const GOOGLE_KEEP_TUTORIAL_VIDEO_FILE = "como-importar-google-keep.d1e09be4ff71.mp4";
export const GOOGLE_KEEP_TUTORIAL_PLAYER_PATH = "/tutorials/como-importar-google-keep.html";

export function googleKeepTutorialPlayerUrl(
  base: string | null = resolveMediaCdnBaseUrl(),
): string {
  return mediaAssetUrl(GOOGLE_KEEP_TUTORIAL_PLAYER_PATH, base);
}
