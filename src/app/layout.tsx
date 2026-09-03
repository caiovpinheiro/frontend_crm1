import type { Metadata, Viewport } from "next";
// O modelo filled oficial usa estes glifos Lucide; manter paridade 1:1 com o ZIP.
// eslint-disable-next-line no-restricted-imports
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  LoaderCircle,
  X,
  XCircle,
} from "lucide-react";
import { DM_Sans, Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "sonner";

import { auth } from "@/lib/auth-public";
import "@/lib/auth-types";

import { PreviewMocksInstaller } from "@/components/preview-mocks-installer";
import { NativeApkUpdateDialog } from "@/components/layout/native-apk-update-dialog";
import { BootSplash } from "@/components/layout/boot-splash";
import { Providers } from "./providers";
import "./globals.css";
import "@/components/crm/b-loader.css";

/* Fontes via next/font: bundling local + preload + zero FOUT.
   - DM Sans   → body (via --font-sans-next)
   - Plus Jakarta Sans → display/headings (via --font-display-next)
   Mantemos os import @import url(...) em globals.css como fallback
   pra navegadores que não recebem o CSS dos chunks do Next em
   tempo de paint (paranoia útil em SSR + cache estale). */
const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--font-sans-next",
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-display-next",
});

export const metadata: Metadata = {
  title: "Bwipo",
  description: "CRM para gestão de relacionamento com clientes",
  applicationName: "Bwipo",
  // PWA / iOS standalone — quando instalado na home, abre fullscreen
  // com a barra de status preta translucida (Safari respeita "default"
  // mais "black-translucent": o conteudo passa por baixo da status bar
  // e aproveitamos o env(safe-area-inset-top) pra empurrar o conteudo).
  appleWebApp: {
    capable: true,
    title: "Bwipo",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  // Manifest: gerado dinamicamente em /manifest.webmanifest pelo
  // arquivo app/manifest.ts. O Next 15 ja injeta o <link> automatico
  // via metadata API quando o arquivo esta presente — declaramos
  // aqui apenas para garantir override consistente.
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32", type: "image/x-icon" },
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

/* Viewport mobile-first:
   - `width=device-width` + `initialScale=1` → escala correta no celular.
   - `viewportFit: "cover"` → usa safe-area do iPhone (notch/home indicator)
     com env(safe-area-inset-*); combinado com utilities `.pb-safe` etc.
   - `maximumScale=5` (não 1) → permite zoom acessibilidade.
   - `themeColor` agora é o azul-claro do mesh — combina com a barra
     de URL do Chrome Android quando o app está aberto. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#f4f6fb",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`bl-booting bg-background ${dmSans.variable} ${plusJakarta.variable}`}
      data-chat-theme="azul"
      style={{ fontFamily: "var(--font-sans)" }}
    >
      <body className="min-h-dvh font-sans antialiased">
        {/* Aplica `.v2-dark`/`.dark` no <html> ANTES do primeiro paint, lendo
            o mesmo storage key usado por `useThemeV2` (`crm-v2-theme`). Sem
            isso o tema só é aplicado no useEffect do hook, causando FOUC:
            body renderiza com o gradiente light de `globals.css` por um
            frame, mesmo quando o usuário escolheu dark.
            Precisa ser o PRIMEIRO filho de <body> (pai válido de <script>):
            executa síncrono antes do resto do body pintar, e evita os avisos
            de DOM nesting ("<script> cannot be a child of <html>") e de
            hoisting do React 19. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function () {
  try {
    var t = localStorage.getItem("crm-v2-theme");
    if (t !== "dark" && t !== "light") {
      t = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    var dark = t === "dark";
    var el = document.documentElement;
    el.classList.toggle("v2-dark", dark);
    el.classList.toggle("dark", dark);
    el.style.colorScheme = dark ? "dark" : "light";
  } catch (e) {}
})();`,
          }}
        />
        <style
          dangerouslySetInnerHTML={{
            __html:
              "html.bl-booting{overflow:hidden}html.bl-booting #crm-app,html.bl-booting [data-sonner-toaster],html.bl-booting [data-app-loading-screen]{content-visibility:hidden;visibility:hidden;pointer-events:none}",
          }}
        />
        <link rel="preload" href="/brand/logo-b.png" as="image" />
        <BootSplash />
        <PreviewMocksInstaller />
        <div id="crm-app">
          <Providers session={session}>
            {children}
            <NativeApkUpdateDialog />
          </Providers>
          <Toaster
            className="crm-toaster"
            position="bottom-right"
            theme="light"
            richColors={false}
            closeButton
            icons={{
              success: <CheckCircle2 aria-hidden="true" />,
              error: <XCircle aria-hidden="true" />,
              warning: <AlertTriangle aria-hidden="true" />,
              info: <Info aria-hidden="true" />,
              loading: <LoaderCircle aria-hidden="true" className="animate-spin" />,
              close: <X aria-hidden="true" />,
            }}
            toastOptions={{
              closeButtonAriaLabel: "Fechar notificação",
            }}
          />
        </div>
      </body>
    </html>
  );
}
