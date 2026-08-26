import { ImageResponse } from "next/og";

/**
 * Apple Touch Icon — Next 15 gera PNG 180x180 em build-time.
 * iOS exige PNG (nao aceita SVG no apple-touch-icon nem em manifest
 * para "Adicionar a Tela de Inicio"), entao geramos via JSX +
 * ImageResponse aproveitando a infra do Next (sem dep extra).
 *
 * NB: rota = /apple-icon (Next monta automaticamente). O <head> tag
 * <link rel="apple-touch-icon"> e injetado via metadata API.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
          fontSize: 120,
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
