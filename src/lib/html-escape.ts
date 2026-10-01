/** Escape for interpolation into HTML text/attributes. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function unknownTenantHtml(slug: string, apexHref: string): string {
  const safeSlug = escapeHtml(slug);
  const safeApex = escapeHtml(apexHref);
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Organização não encontrada</title>
  <style>
    body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#0b1220;color:#e8eefc}
    main{max-width:28rem;padding:2rem;text-align:center}
    a{color:#7dd3fc}
    code{background:#1e293b;padding:.1rem .35rem;border-radius:.25rem}
  </style>
</head>
<body>
  <main>
    <h1>Organização não encontrada</h1>
    <p>O endereço <code>${safeSlug}</code> não é um workspace válido.</p>
    <p><a href="${safeApex}/">Voltar para o início</a></p>
  </main>
</body>
</html>`;
}
