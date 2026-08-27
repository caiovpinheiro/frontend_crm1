import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Health page do frontend separado.
 *
 * O frontend NÃO tem acesso direto a Postgres ou Redis (essas dependências
 * vivem no backend). Esta rota apenas confirma que o processo Next.js está
 * vivo e respondendo.
 *
 * Para checar o estado real de banco/cache/workers, consulte
 * `${NEXT_PUBLIC_API_BASE_URL}/health` (o backend tem o health rico com
 * checks de dependência).
 */

const startedAt = Date.now();

function formatUptime(totalSec: number): string {
  if (totalSec < 60) return `${totalSec}s`;
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

export async function GET() {
  const uptimeSec = Math.round((Date.now() - startedAt) / 1000);
  const backendUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").trim().replace(/\/$/, "");
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="30">
  <title>Frontend OK · Bwipo</title>
  <style>
    body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;background:#f8fafc;color:#0f172a;min-height:100dvh;padding:64px 24px}
    .shell{max-width:480px;margin:0 auto;background:#fff;border-radius:16px;border:1px solid rgba(0,0,0,0.06);padding:24px}
    .dot{display:inline-block;width:10px;height:10px;border-radius:9999px;background:#10b981;margin-right:8px;vertical-align:middle}
    h1{margin:0 0 4px;font-size:18px;font-weight:900;letter-spacing:-0.02em}
    p{margin:0;font-size:13px;color:#64748b}
    dl{margin:20px 0 0;display:grid;grid-template-columns:1fr 1fr;row-gap:8px;font-size:13px}
    dt{color:#64748b}
    dd{margin:0;text-align:right;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:600;color:#0f172a}
    a{color:#3b82f6;text-decoration:none}
  </style>
</head>
<body>
  <div class="shell">
    <div><span class="dot"></span><h1 style="display:inline">Frontend operacional</h1></div>
    <p>Processo Next.js respondendo. Para checar dependências (banco, cache, workers), consulte o backend.</p>
    <dl>
      <dt>Uptime</dt><dd>${formatUptime(uptimeSec)}</dd>
      <dt>HTTP</dt><dd>200</dd>
      <dt>Backend health</dt><dd>${backendUrl ? `<a href="${backendUrl}/health" target="_blank" rel="noreferrer">${backendUrl}/health</a>` : "(NEXT_PUBLIC_API_BASE_URL não configurado)"}</dd>
    </dl>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
