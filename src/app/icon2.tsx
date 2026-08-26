import { ImageResponse } from "next/og";

/**
 * Icone PNG 512x512 MASKABLE — Android adaptive icon.
 *
 * O Android recorta o icone em formas (circulo, squircle, rect com
 * cantos arredondados) dependendo do launcher. Tudo fora da "safe
 * zone" central (80% do canvas, ~ 410px de raio) pode ser cortado.
 *
 * Por isso o "E" aqui esta em fontSize menor que o icon1 (any),
 * mantido dentro da safe zone para garantir que nunca seja recortado
 * em nenhum launcher Android.
 *
 * Rota: /icon2 — declarado no manifest.ts com purpose: "maskable".
 */
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function IconMaskable() {
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
          color: "white",
          fontSize: 240,
          fontWeight: 900,
          fontFamily: "system-ui, sans-serif",
          letterSpacing: -10,
        }}
      >
        B
      </div>
    ),
    { ...size },
  );
}
