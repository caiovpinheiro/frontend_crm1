import { ImageResponse } from "next/og";

/**
 * Icone PNG 512x512 — usado pelo Android pra:
 *  - Splash screen do PWA (renderizada antes do React montar).
 *  - Icone na lista de apps em alta densidade.
 *  - Compartilhamento via Web Share Target API.
 *
 * Junto com o /icon0 (192x192), satisfaz o criterio do Chrome
 * Android pro botao "Instalar app" aparecer.
 *
 * Rota gerada pelo Next: /icon1
 */
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon512() {
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
          fontSize: 340,
          fontWeight: 900,
          fontFamily: "system-ui, sans-serif",
          letterSpacing: -16,
        }}
      >
        B
      </div>
    ),
    { ...size },
  );
}
