import type { MetadataRoute } from "next";

/**
 * PWA Web App Manifest
 * ─────────────────────
 * Renderizado em /manifest.webmanifest pelo Next 15 — referenciado
 * automaticamente no <head> via metadata API.
 *
 * Decisões:
 *  - `start_url: "/inbox"` — operador abre direto no Inbox, padrao
 *    chat-first (igual WhatsApp Business). Nao perde o login porque o
 *    middleware redireciona pra /login com callbackUrl quando a sessao
 *    expira.
 *  - `display: "standalone"` — sem barra de URL no celular; parece app
 *    nativo. iOS so respeita "standalone" se instalado via "Adicionar a
 *    Tela de Inicio".
 *  - `background_color: "#0d1b3e"` (navy) — pintado durante a splash
 *    screen, antes do React montar. Combina com o tema da sidebar.
 *  - `theme_color: "#0d1b3e"` — controla a cor da barra de status no
 *    Android e o address bar do Chrome.
 *  - `orientation: "portrait"` — operador usa em pe; libera fullscreen
 *    sem rotacionar.
 *  - Icones: combinacao de SVG (nitido em qq DPI) + PNG raster
 *    (192/512) gerados via app/icon{0,1,2}.tsx + ImageResponse.
 *    O Chrome Android EXIGE PNG raster pra considerar instalavel —
 *    SVG sozinho nao satisfaz o criterio "Web App Install" desde
 *    Chrome 91+. Sem icon0/icon1 o menu nao mostra "Instalar app".
 *    O apple-icon.tsx gera o PNG 180x180 que o iOS exige.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bwipo",
    short_name: "Bwipo",
    description:
      "Bwipo — Inbox, Pipeline e atendimento WhatsApp em um app instalavel.",
    start_url: "/inbox",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0d1b3e",
    theme_color: "#0d1b3e",
    lang: "pt-BR",
    categories: ["business", "productivity"],
    icons: [
      // PNG 192 — minimo obrigatorio do Chrome Android pra installable.
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      // PNG 512 — splash screen Android + icone alta densidade.
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // PNG 512 maskable — adaptive icon Android (corta em circulo/squircle).
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      // SVG vetorial — fallback de alta qualidade pra navegadores
      // modernos (Chrome desktop, Edge). Carregado depois dos PNGs.
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: "Inbox",
        short_name: "Inbox",
        description: "Conversas em aberto",
        url: "/inbox",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Pipeline",
        short_name: "Pipeline",
        description: "Funil de vendas",
        url: "/pipeline",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Tarefas",
        short_name: "Tarefas",
        description: "Minhas tarefas",
        url: "/activities",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
