"use client";

import { Copy, Lightbulb, MessageCircle, Search } from "lucide-react";

import { CARD_SURFACE_CLASS } from "@/components/crm/sortable-header";
import { cn } from "@/lib/utils";

export type KeepsTourScene = "pipeline" | "inbox";

const SAMPLE_NOTES = [
  {
    title: "Script de preço",
    body: "A mensalidade deste curso é de R$ 249. Posso enviar o plano de pagamento.",
  },
  {
    title: "Checklist matrícula",
    body: "Documentos, contrato assinado e confirmação do primeiro boleto.",
  },
] as const;

function FakeTabs({ items, active }: { items: string[]; active: string }) {
  return (
    <div className="flex w-max max-w-full items-center gap-1 overflow-x-auto rounded-full border border-border bg-card p-1">
      {items.map((label) => {
        const isActive = label === active;
        return (
          <span
            key={label}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground",
            )}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}

function FakePeek() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
          <Search className="size-3.5 shrink-0" aria-hidden />
          Pesquisar notas...
        </div>
        <div className="inline-flex shrink-0 items-center rounded-full border border-border bg-card p-1">
          <span className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
            Keeps
          </span>
          <span className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">
            Categorias
          </span>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-3 overflow-auto">
        {SAMPLE_NOTES.map((note) => (
          <div
            key={note.title}
            className={cn(CARD_SURFACE_CLASS, "flex items-start gap-1 p-3 shadow-none")}
          >
            <div className="min-w-0 flex-1">
              <p className="mb-1 truncate text-sm font-semibold text-foreground">{note.title}</p>
              <p className="line-clamp-4 text-sm leading-relaxed text-muted-foreground">
                {note.body}
              </p>
            </div>
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground"
              aria-hidden
            >
              <Copy className="size-3.5" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PipelineChrome() {
  return (
    <div className="flex min-h-0 flex-1 gap-3">
      <div className="hidden w-56 shrink-0 flex-col gap-2 sm:flex">
        {["Novos", "Em atendimento", "Proposta"].map((col) => (
          <div key={col} className={cn(CARD_SURFACE_CLASS, "p-3")}>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">{col}</p>
            <div className="rounded-xl border border-border bg-secondary/40 px-3 py-2">
              <p className="text-sm font-semibold text-foreground">Maria Silva</p>
              <p className="text-[11px] text-muted-foreground">Card aberto →</p>
            </div>
          </div>
        ))}
      </div>
      <div className={cn(CARD_SURFACE_CLASS, "flex min-h-0 min-w-0 flex-1 flex-col p-4")}>
        <div className="mb-3 flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Lightbulb className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">Negócio · Maria Silva</p>
            <p className="text-xs text-muted-foreground">Painel do card no funil</p>
          </div>
        </div>
        <FakeTabs
          items={["Conversa", "Tarefas", "Notas", "Timeline", "keeps"]}
          active="keeps"
        />
        <div className="mt-3 flex min-h-0 flex-1 flex-col">
          <FakePeek />
        </div>
      </div>
    </div>
  );
}

function InboxChrome() {
  return (
    <div className="flex min-h-0 flex-1 gap-3">
      <div className={cn(CARD_SURFACE_CLASS, "hidden w-56 shrink-0 flex-col gap-2 p-3 sm:flex")}>
        <p className="text-xs font-semibold text-muted-foreground">Conversas</p>
        {["Caio Rodrigues", "Brenda", "Ana Costa"].map((name, i) => (
          <div
            key={name}
            className={cn(
              "rounded-xl border px-3 py-2",
              i === 0 ? "border-primary bg-primary/5" : "border-border",
            )}
          >
            <p className="text-sm font-semibold text-foreground">{name}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {i === 0 ? "Ticket aberto" : "Há 8 min"}
            </p>
          </div>
        ))}
      </div>
      <div className={cn(CARD_SURFACE_CLASS, "flex min-h-0 min-w-0 flex-1 flex-col p-4")}>
        <div className="mb-3 flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MessageCircle className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">Caio Rodrigues</p>
            <p className="text-xs text-muted-foreground">Conversa aberta na caixa de entrada</p>
          </div>
        </div>
        <FakeTabs items={["Conversa", "keeps"]} active="keeps" />
        <div className="mt-3 flex min-h-0 flex-1 flex-col">
          <FakePeek />
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-secondary/40 px-3 py-2">
          <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            Cole o texto da nota e envie no WhatsApp…
          </p>
          <span className="size-8 shrink-0 rounded-full bg-primary/15" aria-hidden />
        </div>
      </div>
    </div>
  );
}

export function KeepsTourDemo({ scene }: { scene: KeepsTourScene }) {
  const isPipeline = scene === "pipeline";

  return (
    <div
      data-tour={isPipeline ? "keeps-demo-pipeline" : "keeps-demo-inbox"}
      className={cn(
        CARD_SURFACE_CLASS,
        "pointer-events-auto flex h-full w-full min-h-0 flex-col overflow-hidden shadow-lg",
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <p className="font-display text-xs font-semibold text-muted-foreground">
          {isPipeline ? "Simulação · Pipeline" : "Simulação · Caixa de entrada"}
        </p>
        <p className="text-[11px] text-muted-foreground">Não sai desta página</p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-4">
        {isPipeline ? <PipelineChrome /> : <InboxChrome />}
      </div>
    </div>
  );
}
