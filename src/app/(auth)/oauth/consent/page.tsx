import { Suspense } from "react";

import ConsentClient from "./consent-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conectar assistente de IA" };

/**
 * Consentimento OAuth do MCP. O servidor MCP (`/oauth/authorize`) manda o
 * usuário para cá com os parâmetros do pedido; sem sessão, o middleware
 * leva ao login e volta com a query intacta (`callbackUrl`).
 */
export default function OAuthConsentPage() {
  return (
    <Suspense fallback={null}>
      <ConsentClient />
    </Suspense>
  );
}
