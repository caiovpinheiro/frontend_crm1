"use client";

import {
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import { RouteLoading } from "@/components/crm/page-loading";
import {
  readPipelineViewPreference,
  resolvePipelineEntry,
} from "@/lib/pipeline-view-preference";

import KanbanV2ClientPage from "./_v2-client";

/**
 * Se o `router.replace` para lista/flow pendurar, monta o kanban mesmo
 * assim — a página nunca fica num loader eterno.
 */
const REDIRECT_FALLBACK_MS = 2_000;

const REDIRECT_PREFIX = "redirect:";

function subscribeNoop() {
  return () => {};
}

/** Snapshot do cliente: "kanban" | "redirect:<href>" (string → estável por valor). */
function readEntrySnapshot(): string {
  const decision = resolvePipelineEntry({
    search: window.location.search,
    preferred: readPipelineViewPreference(),
  });
  return decision.kind === "kanban" ? "kanban" : `${REDIRECT_PREFIX}${decision.href}`;
}

/** No servidor (e na hidratação) ainda não há preferência: loader leve. */
function readServerSnapshot(): string {
  return "pending";
}

/**
 * Resolve a view salva ANTES de montar o kanban. Antes o kanban montava
 * sempre (fallback imediato) e, com preferência "lista", o board inteiro
 * era baixado e descartado no redirect — dois boards por abertura.
 * `useSyncExternalStore` lê URL + localStorage no primeiro render do
 * cliente; o kanban só entra na árvore (e só dispara `GET /board`) quando
 * é a view final. Quem grava a preferência "kanban" é o próprio kanban ao
 * montar (`KanbanV2ClientPage`), como antes.
 */
export function PipelineEntryClient({ navRail }: { navRail?: ReactNode }) {
  const router = useRouter();
  const entry = useSyncExternalStore(subscribeNoop, readEntrySnapshot, readServerSnapshot);
  const redirectHref = entry.startsWith(REDIRECT_PREFIX)
    ? entry.slice(REDIRECT_PREFIX.length)
    : null;
  const [fallbackKanban, setFallbackKanban] = useState(false);

  useLayoutEffect(() => {
    if (!redirectHref) return;
    router.replace(redirectHref);
    const t = setTimeout(() => setFallbackKanban(true), REDIRECT_FALLBACK_MS);
    return () => clearTimeout(t);
  }, [redirectHref, router]);

  if (entry !== "kanban" && !fallbackKanban) return <RouteLoading />;

  return (
    <KanbanV2ClientPage navRail={navRail} listHref="/pipeline/list" />
  );
}
