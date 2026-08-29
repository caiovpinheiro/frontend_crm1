/**
 * Reexport: o handler vive em `/sse-messages` para o rewrite `afterFiles`
 * `/api/:path*` não interceptar o stream (mesmo padrão que
 * `/wa-call-permission`). Cliente e EventSource continuam em
 * `/api/sse/messages`.
 *
 * `dynamic` / `runtime` ficam aqui — o Next exige config de rota
 * estaticamente analisável neste arquivo.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export { GET } from "../../../sse-messages/route";
