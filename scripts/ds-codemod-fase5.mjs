#!/usr/bin/env node
/**
 * Fase 5 da migração v1→v2 — codemod de tokens DS.
 *
 * Aplica substituições hue-preserving (paleta nativa Tailwind → tokens do
 * @theme em globals.css) numa lista explícita de arquivos (top offenders do
 * ds-scan). As trocas são conservadoras: cada classe nativa vira o token
 * semanticamente equivalente com cor quase idêntica, então o delta visual é
 * imperceptível, mas o débito sai da baseline.
 *
 * Uso: node scripts/ds-codemod-fase5.mjs [--dry]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

const FILES = [
  "src/components/inbox/chat-window.tsx",
  "src/components/pipeline/kanban-filters/v2/core.tsx",
  "src/components/inbox/contact-deal-sidebar.tsx",
  "src/components/pipeline/bulk-operation-progress-dialog.tsx",
  "src/components/inbox/whatsapp-call-chip.tsx",
  "src/components/inbox/conversation-list.tsx",
  "src/app/(app)/settings/pipeline/client-page.tsx",
  "src/components/pipeline/funnel-automations.tsx",
  "src/components/pipeline/deal-detail/sidebar.tsx",
  "src/components/pipeline/deal-detail/timeline-panel.tsx",
];

/**
 * Pares [regex, replacement]. Word-boundary em volta da classe completa
 * preserva prefixos (hover:, focus:, dark:) e sufixos de alpha (/70).
 * Ordem importa só para legibilidade — os limites \b evitam colisões
 * (ex.: bg-slate-50 NÃO casa dentro de bg-slate-500).
 */
const MAP = [
  // ── Texto neutro (slate/gray/zinc → escala ink do DS) ─────────────
  [/\btext-(?:slate|gray|zinc|neutral|stone)-900\b/g, "text-foreground"],
  [/\btext-(?:slate|gray|zinc|neutral|stone)-800\b/g, "text-foreground"],
  [/\btext-(?:slate|gray|zinc|neutral|stone)-700\b/g, "text-ink-soft"],
  [/\btext-(?:slate|gray|zinc|neutral|stone)-600\b/g, "text-ink-soft"],
  [/\btext-(?:slate|gray|zinc|neutral|stone)-500\b/g, "text-ink-muted"],
  [/\btext-(?:slate|gray|zinc|neutral|stone)-400\b/g, "text-ink-subtle"],
  [/\btext-(?:slate|gray|zinc|neutral|stone)-300\b/g, "text-ink-subtle"],
  [/\btext-(?:slate|gray|zinc|neutral|stone)-200\b/g, "text-ink-subtle"],
  [/\btext-(?:slate|gray|zinc|neutral|stone)-100\b/g, "text-white"],

  // ── Fundos neutros ────────────────────────────────────────────────
  [/\bbg-(?:slate|gray|zinc|neutral|stone)-50\b/g, "bg-muted"],
  [/\bbg-(?:slate|gray|zinc|neutral|stone)-100\b/g, "bg-muted"],
  [/\bbg-(?:slate|gray|zinc|neutral|stone)-200\b/g, "bg-subtle"],
  [/\bbg-(?:slate|gray|zinc|neutral|stone)-300\b/g, "bg-ink-subtle/40"],
  [/\bbg-(?:slate|gray|zinc|neutral|stone)-800\b/g, "bg-ink-soft"],
  [/\bbg-(?:slate|gray|zinc|neutral|stone)-900\b/g, "bg-foreground"],

  // ── Bordas/anéis neutros (cinza claro ≈ preto a 5–10%) ───────────
  [/\bborder-(?:slate|gray|zinc|neutral|stone)-100\b/g, "border-black/5"],
  [/\bborder-(?:slate|gray|zinc|neutral|stone)-200\b/g, "border-black/10"],
  [/\bborder-(?:slate|gray|zinc|neutral|stone)-300\b/g, "border-black/15"],
  [/\bring-(?:slate|gray|zinc|neutral|stone)-200\b/g, "ring-black/10"],
  [/\bring-(?:slate|gray|zinc|neutral|stone)-300\b/g, "ring-black/15"],
  [/\bdivide-(?:slate|gray|zinc|neutral|stone)-100\b/g, "divide-black/5"],
  [/\bdivide-(?:slate|gray|zinc|neutral|stone)-200\b/g, "divide-black/10"],

  // ── Sucesso (emerald/green/teal/lime → success) ───────────────────
  [/\btext-(?:emerald|green|teal|lime)-(?:400|500|600|700|800)\b/g, "text-success"],
  [/\bbg-(?:emerald|green|teal|lime)-(?:50|100)\b/g, "bg-success-soft"],
  [/\bbg-(?:emerald|green|teal|lime)-(?:500|600)\b/g, "bg-success"],
  [/\bborder-(?:emerald|green|teal|lime)-(?:100|200)\b/g, "border-success/20"],
  [/\bborder-(?:emerald|green|teal|lime)-(?:300|400)\b/g, "border-success/40"],
  [/\bring-(?:emerald|green|teal|lime)-(?:100|200)\b/g, "ring-success/20"],

  // ── Erro/destrutivo (red/rose → destructive) ──────────────────────
  [/\btext-(?:red|rose)-(?:400|500|600|700|800)\b/g, "text-destructive"],
  [/\bbg-(?:red|rose)-(?:50|100)\b/g, "bg-destructive-soft"],
  [/\bbg-(?:red|rose)-(?:500|600)\b/g, "bg-destructive"],
  [/\bborder-(?:red|rose)-(?:100|200)\b/g, "border-destructive/20"],
  [/\bborder-(?:red|rose)-(?:300|400)\b/g, "border-destructive/40"],

  // ── Aviso (amber/yellow/orange → warning) ─────────────────────────
  [/\btext-(?:amber|yellow|orange)-(?:400|500|600|700|800)\b/g, "text-warning"],
  [/\bbg-(?:amber|yellow|orange)-(?:50|100)\b/g, "bg-warning-soft"],
  [/\bbg-(?:amber|yellow|orange)-(?:400|500|600)\b/g, "bg-warning"],
  [/\bborder-(?:amber|yellow|orange)-(?:100|200)\b/g, "border-warning/30"],
  [/\bborder-(?:amber|yellow|orange)-(?:300|400)\b/g, "border-warning/40"],

  // ── Informativo (blue/indigo/sky → primary/info) ──────────────────
  [/\btext-(?:blue|indigo)-(?:500|600)\b/g, "text-primary"],
  [/\btext-(?:blue|indigo)-(?:700|800|900)\b/g, "text-primary-dark"],
  [/\btext-sky-(?:500|600|700|800|900)\b/g, "text-info"],
  [/\bbg-(?:blue|indigo|sky)-(?:50|100)\b/g, "bg-primary-soft"],
  [/\bbg-(?:blue|indigo)-(?:500|600)\b/g, "bg-primary"],
  [/\bbg-(?:blue|indigo)-700\b/g, "bg-primary-dark"],
  [/\bborder-(?:blue|indigo|sky)-(?:100|200)\b/g, "border-primary/20"],
  [/\bborder-(?:blue|indigo|sky)-(?:300|400)\b/g, "border-primary/40"],
  [/\bring-(?:blue|indigo|sky)-(?:100|200)\b/g, "ring-primary/20"],

  // ── Acento (violet/purple/fuchsia → accent/lavender; pink → pink) ─
  [/\btext-(?:violet|purple|fuchsia)-(?:400|500|600|700)\b/g, "text-accent"],
  [/\bbg-(?:violet|purple|fuchsia)-(?:50|100)\b/g, "bg-lavender-soft"],
  [/\bbg-(?:violet|purple|fuchsia)-(?:500|600)\b/g, "bg-accent"],
  [/\bborder-(?:violet|purple|fuchsia)-(?:100|200)\b/g, "border-accent/20"],
  [/\btext-pink-(?:400|500|600|700)\b/g, "text-pink"],
  [/\bbg-pink-(?:50|100)\b/g, "bg-pink-soft"],
  [/\bborder-pink-(?:100|200)\b/g, "border-pink/20"],

  // ── Ciano (cyan → token cyan) ─────────────────────────────────────
  [/\btext-cyan-(?:400|500|600|700)\b/g, "text-cyan"],
  [/\bbg-cyan-(?:50|100)\b/g, "bg-cyan-soft"],
  [/\bborder-cyan-(?:100|200)\b/g, "border-cyan/20"],
];

const dry = process.argv.includes("--dry");
let grandTotal = 0;

for (const rel of FILES) {
  const abs = join(ROOT, rel);
  let src;
  try {
    src = readFileSync(abs, "utf8");
  } catch {
    console.warn(`[skip] ${rel} (não encontrado)`);
    continue;
  }
  let out = src;
  let count = 0;
  for (const [re, to] of MAP) {
    out = out.replace(re, (m) => {
      count++;
      return to;
    });
  }
  grandTotal += count;
  console.log(`${String(count).padStart(4)}  ${rel}`);
  if (!dry && count > 0) writeFileSync(abs, out, "utf8");
}

console.log(`\n[codemod] total de substituições: ${grandTotal}${dry ? " (dry-run)" : ""}`);
