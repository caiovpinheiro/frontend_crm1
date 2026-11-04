"use client";

/*
 * Blocos do resumo da jornada no site, do mais útil ao atendente para o
 * menos: "Situação" (selo + frase das chaves reservadas do estado, ou o
 * último evento importante; a mensagem do visitante entre aspas, que o
 * clique abre inteira; barra de progresso), "Última localização" (demais
 * chaves do estado em sequência com ›, uma linha + "+N") e "Caminho"
 * (eventos não importantes em sequência, últimos passos + "+N anteriores"),
 * este dentro de "Ver o que fez no site". Funções puras em `./journey`.
 */
import { IconAlertTriangle, IconMapPin } from "@tabler/icons-react";
import { useId, useState, type ComponentType, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import {
  formatSitePathSpan,
  WEBCHAT_PANEL_PATH_STEPS,
  WEBCHAT_PANEL_STATE_CHIPS,
  type SiteHighlight,
  type SitePath,
  type SiteStateChip,
  type SiteStatus,
} from "./journey";

const CHIP =
  "inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border border-border-soft bg-muted/50 px-2 py-0.5 text-[11px] leading-4 text-foreground";
const CHIP_TOGGLE =
  "inline-flex shrink-0 items-center rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] font-medium leading-4 text-primary outline-none transition-colors hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary/30";

/** Passo com até este tanto de texto não encolhe na linha recolhida. */
const SHORT_CHIP_CHARS = 12;

function Separator() {
  return (
    <span aria-hidden className="shrink-0 text-[11px] text-muted-foreground">
      ›
    </span>
  );
}

/** Cartão com ícone à esquerda e rótulo discreto acima do conteúdo. */
function SiteCard({
  icon: Icon,
  label,
  children,
}: {
  icon: ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2.5 rounded-lg border border-border-soft bg-muted/30 px-2.5 py-2">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon size={15} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] leading-4 text-muted-foreground">{label}</p>
        <div className="mt-0.5 min-w-0">{children}</div>
      </div>
    </div>
  );
}

function SiteProgressBar({ progress, alert }: { progress: NonNullable<SiteStatus["progress"]>; alert: boolean }) {
  const pct = Math.round((progress.current / progress.total) * 100);
  const count = `${progress.current.toLocaleString("pt-BR")} de ${progress.total.toLocaleString("pt-BR")}`;
  const label = progress.label ?? "Progresso";
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-baseline justify-between gap-2 text-[11px] leading-4 text-muted-foreground">
        <span className="truncate">{label}</span>
        <span className="shrink-0 tabular-nums">{count}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.current}
        aria-valuetext={count}
        className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full", alert ? "bg-warning" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Situação do visitante, no topo. Frase: `resumo` do site; sem ela, o
 * título do último evento importante (+ selo). Com evento importante, o
 * cartão fica âmbar e mostra a mensagem do visitante entre aspas (duas
 * linhas; o clique abre inteira, com os demais dados).
 */
export function SiteStatusCard({ status, highlight }: { status: SiteStatus; highlight: SiteHighlight | null }) {
  const bodyId = useId();
  const [open, setOpen] = useState(false);
  const headline = status.summary ?? highlight?.title ?? null;
  const badge = status.summary ? null : (highlight?.badge ?? null);
  if (!status.status && !headline && !status.progress) return null;
  const alert = highlight !== null;
  const meta = highlight
    ? [highlight.others, highlight.todayCount > 1 ? `${highlight.todayCount}× hoje` : ""].filter(Boolean).join(" · ")
    : "";
  const message = highlight?.message ?? null;
  return (
    <div
      className={cn(
        "min-w-0 space-y-1.5 rounded-lg border px-2.5 py-2",
        alert ? "border-warning/40 bg-warning-soft" : "border-border-soft bg-muted/30",
      )}
    >
      {status.status || alert ? (
        <p className="flex min-w-0 items-center gap-1.5">
          {alert ? <IconAlertTriangle size={14} stroke={2.25} aria-hidden className="shrink-0 text-warning" /> : null}
          {status.status ? (
            <span
              className={cn(
                "truncate rounded-full px-2 text-[11px] font-semibold leading-5",
                alert ? "bg-warning/20 text-foreground" : "bg-primary/10 text-primary",
              )}
            >
              {status.status}
            </span>
          ) : null}
        </p>
      ) : null}
      {headline ? (
        <p className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 text-sm font-semibold leading-5 text-foreground">
            {alert ? <span className="sr-only">Evento importante: </span> : null}
            {headline}
          </span>
          {badge ? (
            <span className="max-w-[45%] shrink-0 truncate rounded-full bg-warning/20 px-1.5 text-[10px] font-semibold leading-4 text-foreground">
              {badge}
            </span>
          ) : null}
        </p>
      ) : null}
      {message || meta ? (
        <div className="min-w-0">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen((v) => !v)}
            className="w-full min-w-0 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            {message ? (
              <span
                className={cn(
                  "block border-l-2 border-warning/60 pl-2 text-xs leading-4 text-foreground/80",
                  open ? "whitespace-pre-wrap break-words" : "line-clamp-2",
                )}
              >
                “{message}”
              </span>
            ) : (
              <span className="text-[11px] font-medium leading-4 text-primary">
                {open ? "Ocultar detalhes" : "Ver detalhes"}
              </span>
            )}
          </button>
          {open && meta ? (
            <p id={bodyId} className="mt-1 break-words text-[11px] leading-4 text-muted-foreground">
              {meta}
            </p>
          ) : null}
        </div>
      ) : null}
      {status.progress ? <SiteProgressBar progress={status.progress} alert={alert} /> : null}
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
    <SiteCard icon={IconMapPin} label="Última localização">
      {/* Recolhido = uma linha só (passos longos cortam com reticências). */}
      <div className={cn("flex min-w-0 items-center gap-1", open ? "flex-wrap" : "flex-nowrap")}>
        <ol
          id={listId}
          aria-label="Estado atual no site"
          className={cn("flex min-w-0 items-center gap-1", open ? "flex-wrap" : "flex-nowrap")}
        >
          {visible.map((chip, i) => (
            <li
              key={chip.key}
              className={cn(
                "flex min-w-0 items-center gap-1",
                !open && (chip.text.length <= SHORT_CHIP_CHARS ? "shrink-0" : "shrink"),
              )}
              title={chip.title}
            >
              {i > 0 ? <Separator /> : null}
              <span className="truncate text-xs font-semibold leading-4 text-foreground">{chip.text}</span>
            </li>
          ))}
        </ol>
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
    </SiteCard>
  );
}

/** Caminho: eventos não importantes em sequência (intervalo no tooltip do rótulo). */
export function SitePathChips({ path, now }: { path: SitePath; now: number }) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  if (path.steps.length === 0) return null;
  const hidden = path.steps.length - WEBCHAT_PANEL_PATH_STEPS;
  const visible = open || hidden <= 0 ? path.steps : path.steps.slice(-WEBCHAT_PANEL_PATH_STEPS);
  const span = path.since ? formatSitePathSpan(path.since, now) : "";
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-semibold text-foreground" title={span || undefined}>
        Caminho
      </p>
      <ol id={listId} aria-label="Caminho recente no site" className="flex min-w-0 flex-wrap items-center gap-1">
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
            {i > 0 || (hidden > 0 && !open) ? <Separator /> : null}
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
