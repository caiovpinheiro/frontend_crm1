"use client";

/*
 * Blocos do resumo da jornada no site: destaque âmbar do último evento
 * importante, "Onde está" (estado atual em chips, uma linha + "+N") e
 * "Caminho" (eventos recentes não importantes em sequência com ›, últimos
 * passos + "+N anteriores"). Funções puras em `./journey`.
 */
import { IconAlertTriangle } from "@tabler/icons-react";
import { useId, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import {
  formatSitePathSpan,
  WEBCHAT_PANEL_PATH_STEPS,
  WEBCHAT_PANEL_STATE_CHIPS,
  type SiteHighlight,
  type SitePath,
  type SiteStateChip,
} from "./journey";
import { formatSiteRelativeTime } from "./model";

const CHIP =
  "inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border border-border-soft bg-muted/50 px-2 py-0.5 text-[11px] leading-4 text-foreground";
const CHIP_TOGGLE =
  "inline-flex shrink-0 items-center rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] font-medium leading-4 text-primary outline-none transition-colors hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary/30";

/** Chip com até este tanto de texto não encolhe na linha recolhida. */
const SHORT_CHIP_CHARS = 12;

function SectionLabel({ children, extra }: { children: ReactNode; extra?: string }) {
  return (
    <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
      {children}
      {extra ? <span className="font-normal normal-case tracking-normal"> · {extra}</span> : null}
    </p>
  );
}

export function SiteHighlightCard({ highlight, now }: { highlight: SiteHighlight; now: number }) {
  const meta = [
    highlight.others,
    formatSiteRelativeTime(highlight.occurredAt, now),
    highlight.todayCount > 1 ? `${highlight.todayCount}× hoje` : "",
  ].filter(Boolean);
  const heading = highlight.primary ? `${highlight.title} · ${highlight.primary}` : highlight.title;
  return (
    <div className="flex min-w-0 gap-2 rounded-lg border border-warning/40 bg-warning-soft px-2.5 py-1.5">
      <IconAlertTriangle size={14} stroke={2.25} aria-hidden className="mt-px shrink-0 text-warning" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold leading-4 text-foreground" title={heading}>
          <span className="sr-only">Evento importante: </span>
          {heading}
        </p>
        <p className="truncate text-[11px] leading-4 text-muted-foreground" title={meta.join(" · ")}>
          {meta.join(" · ")}
        </p>
      </div>
    </div>
  );
}

export function SiteStateChips({ chips }: { chips: SiteStateChip[] }) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  if (chips.length === 0) return null;
  const extra = chips.length - WEBCHAT_PANEL_STATE_CHIPS;
  const visible = open || extra <= 0 ? chips : chips.slice(0, WEBCHAT_PANEL_STATE_CHIPS);
  return (
    <div className="min-w-0">
      <SectionLabel>Onde está</SectionLabel>
      {/* Recolhido = uma linha só (chips encolhem com reticências). */}
      <div className={cn("flex min-w-0 items-center gap-1", open ? "flex-wrap" : "flex-nowrap")}>
        <ul id={listId} aria-label="Estado atual no site" className={cn("flex min-w-0 gap-1", open ? "flex-wrap" : "flex-nowrap")}>
          {visible.map((chip) => (
            <li
              key={chip.key}
              // Recolhido: chip curto não encolhe; o longo corta com reticências.
              className={cn(CHIP, !open && (chip.text.length <= SHORT_CHIP_CHARS ? "shrink-0" : "shrink"))}
              title={chip.title}
            >
              <span className="truncate">{chip.text}</span>
            </li>
          ))}
        </ul>
        {extra > 0 ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            aria-label={open ? "Mostrar menos dados do site" : `Mostrar mais ${extra} dados do site`}
            onClick={() => setOpen((v) => !v)}
            className={CHIP_TOGGLE}
          >
            {open ? "menos" : `+${extra}`}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function SitePathChips({ path, now }: { path: SitePath; now: number }) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  if (path.steps.length === 0) return null;
  const hidden = path.steps.length - WEBCHAT_PANEL_PATH_STEPS;
  const visible = open || hidden <= 0 ? path.steps : path.steps.slice(-WEBCHAT_PANEL_PATH_STEPS);
  const span = path.since ? formatSitePathSpan(path.since, now) : "";
  return (
    <div className="min-w-0">
      <SectionLabel extra={span}>Caminho</SectionLabel>
      <ol
        id={listId}
        aria-label="Caminho recente no site"
        className="flex min-w-0 flex-wrap items-center gap-1"
      >
        {hidden > 0 ? (
          // Fora da contagem de passos para o leitor de tela.
          <li role="none" className="flex shrink-0">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={listId}
              onClick={() => setOpen((v) => !v)}
              className={CHIP_TOGGLE}
            >
              {open ? "menos" : `+${hidden} anteriores`}
            </button>
          </li>
        ) : null}
        {visible.map((step, i) => (
          <li key={step.id} className="flex min-w-0 max-w-full items-center gap-1">
            {i > 0 || (hidden > 0 && !open) ? (
              <span aria-hidden className="shrink-0 text-[11px] text-muted-foreground">
                ›
              </span>
            ) : null}
            <span className={cn(CHIP, "max-w-[11rem]")} title={step.title}>
              <span className="truncate">{step.text}</span>
              {step.count > 1 ? (
                <span className="shrink-0 text-[10px] font-semibold tabular-nums text-muted-foreground">
                  <span aria-hidden>×{step.count}</span>
                  <span className="sr-only">, {step.count} vezes</span>
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
