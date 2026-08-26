import { ImageResponse } from "next/og";

/**
 * Favicon dinâmico — Next 15 gera PNG 32x32 em build-time.
 * Substitui o favicon.ico estático: nao precisa salvar binario no
 * repo, e fica sempre sincronizado com a identidade visual.
 *
 * NB: rota = /icon (Next monta automaticamente).
 */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
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
          borderRadius: 7,
          color: "white",
          fontSize: 22,
          fontWeight: 900,
          fontFamily: "system-ui, sans-serif",
          letterSpacing: -1,
        }}
      >
        B
      </div>
    ),
    { ...size },
  );
}
