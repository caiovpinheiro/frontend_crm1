import { ImageResponse } from "next/og";

/**
 * Icone PNG 192x192 — exigido pelo Chrome Android pra considerar
 * o app "installable" no criterio Web App Install.
 *
 * Sem este (ou um 512), o menu do Chrome NAO mostra "Instalar app"
 * mesmo com manifest + service worker corretos. O Chrome Android
 * trata SVG no manifest como insuficiente desde Chrome 91+.
 *
 * Rota gerada pelo Next: /icon0
 * Liberada no middleware via PWA_PUBLIC_PATHS.
 */
export const size = { width: 192, height: 192 };
export const contentType = "image/png";

export default function Icon192() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0d1b3e",
          backgroundImage:
            "radial-gradient(circle at 80% 80%, rgba(6,182,212,0.32), transparent 60%)",
          color: "white",
          fontSize: 130,
          fontWeight: 900,
          fontFamily: "system-ui, sans-serif",
          letterSpacing: -6,
        }}
      >
        B
      </div>
    ),
    { ...size },
  );
}
