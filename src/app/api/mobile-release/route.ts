/**
 * GET /api/mobile-release
 *
 * Proxy same-origin do manifesto do APK (EasyPanel). O WebView do app
 * usa esta rota quando o fetch direto ao host de releases falha (CORS
 * ou host antigo). Pública: o check de versão precisa ocorrer no login.
 */
import {
  publicMobileReleaseManifest,
  resolveMobileReleaseManifestUrl,
} from "@/lib/native/mobile-release-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const upstream = resolveMobileReleaseManifestUrl();
  try {
    const res = await fetch(`${upstream}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) {
      return Response.json(
        { error: "manifest unavailable" },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }
    // `apkUrl` sai com a base pública configurada (se houver), não com o
    // host interno do serviço de releases — ver `mobile-release-config`.
    const data: unknown = publicMobileReleaseManifest(await res.json());
    return Response.json(data, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch {
    return Response.json(
      { error: "manifest unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
