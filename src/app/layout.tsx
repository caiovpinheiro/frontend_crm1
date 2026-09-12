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
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";

import { auth } from "@/lib/auth-public";
import "@/lib/auth-types";

import { PreviewMocksInstaller } from "@/components/preview-mocks-installer";
import { NativeApkUpdateDialog } from "@/components/layout/native-apk-update-dialog";
import { Providers } from "./providers";
import "./globals.css";

/* Geist para títulos e corpo. Geist Mono só em dados técnicos. */
const geistSans = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans-next",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono-next",
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
  themeColor: "oklch(0.973 0.005 262)",
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
      className={`bg-background ${geistSans.variable} ${geistMono.variable}`}
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
        <PreviewMocksInstaller />
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
      </body>
    </html>
  );
}
