/**
 * O middleware deve consultar o backend (`/api/organization/by-slug`) para
 * saber se o subdomínio `{slug}` existe antes de atender este caminho?
 *
 *  - Páginas HTML: sim — subdomínio inexistente mostra a tela
 *    "organização não encontrada" (404).
 *  - `/api/*`: NÃO. Antes, `GET https://{slug}.<base>/api/qualquer-coisa`
 *    respondia 404 HTML para slug inexistente e 401 JSON para slug existente
 *    — um oráculo barato de enumeração de organizações (pentest). Sem a
 *    checagem, a requisição segue o fluxo normal e a resposta (status,
 *    content-type, corpo e cookies) é a mesma para qualquer subdomínio; quem
 *    decide é a autenticação.
 *  - `/_next/*`: não (assets; nunca precisou).
 *
 * Helper puro, sem imports do Next, para ser testável em vitest (node).
 */
export function shouldVerifyTenantExistence(pathname: string): boolean {
  if (pathname === "/api" || pathname.startsWith("/api/")) return false;
  if (pathname.startsWith("/_next")) return false;
  return true;
}
