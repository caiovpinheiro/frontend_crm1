"use client";

/**
 * Calendário do agente: datas e prazos oficiais, fora dos materiais. O
 * motor calcula se cada evento já passou, é hoje, está em andamento ou é
 * próximo, e entrega pronto ao agente. Importa de arquivo ou texto, com
 * revisão antes de entrar.
 */

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { IconCalendarEvent, IconLoader2, IconPlus, IconTrash, IconUpload } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, parseApiResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

type CalendarEvent = { id: string; start: string; end?: string; title: string };
type ImportResult = { events: CalendarEvent[]; unparsed: string[]; method: "lines" | "ai" };
type Status = "past" | "today" | "ongoing" | "upcoming";

const STATUS: Record<Status, { label: string; variant: "muted" | "success" | "indigo" | "outline" }> = {
  past: { label: "já passou", variant: "muted" },
  today: { label: "hoje", variant: "success" },
  ongoing: { label: "em andamento", variant: "success" },
  upcoming: { label: "próximo", variant: "indigo" },
};

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function statusOf(ev: CalendarEvent, today: string): Status {
  const end = ev.end || ev.start;
  if (end < today) return "past";
  if (ev.start === today && end === today) return "today";
  if (ev.start <= today) return "ongoing";
  return "upcoming";
}

const br = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "");
const newId = () => `ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

function SectionBox({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5">
      <div className="space-y-1">
        <h3 className="text-base font-bold leading-tight">{title}</h3>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function CalendarStep({
  agentId,
  config,
  onChange,
}: {
  agentId: string;
  config: Record<string, unknown>;
  onChange: (path: string, value: unknown) => void;
}) {
  const events = (((config.calendar as { events?: CalendarEvent[] } | undefined)?.events) ?? []) as CalendarEvent[];
  const today = todayIso();
  const [showPast, setShowPast] = React.useState(false);
  const [pasted, setPasted] = React.useState("");
  const [year, setYear] = React.useState(new Date().getFullYear());
  const [preview, setPreview] = React.useState<(ImportResult & { selected: Set<string> }) | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const setEvents = (next: CalendarEvent[]) =>
    onChange("calendar", { events: [...next].sort((a, b) => a.start.localeCompare(b.start)) });

  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start));
  const counts = sorted.reduce(
    (acc, e) => {
      const s = statusOf(e, today);
      acc[s === "past" ? "past" : "next"]++;
      return acc;
    },
    { past: 0, next: 0 },
  );
  const visible = showPast ? sorted : sorted.filter((e) => statusOf(e, today) !== "past");

  const importer = useMutation({
    mutationFn: async (input: { file?: File; text?: string }) => {
      let res: Response;
      if (input.file) {
        const form = new FormData();
        form.append("file", input.file);
        form.append("year", String(year));
        res = await apiFetch(`/api/ai-agents-v2/${agentId}/calendar/import`, { method: "POST", body: form }, 120_000);
      } else {
        res = await apiFetch(
          `/api/ai-agents-v2/${agentId}/calendar/import`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: input.text, year }) },
          120_000,
        );
      }
      return parseApiResponse<ImportResult>(res, "Não foi possível ler o calendário.");
    },
    onSuccess: (r) => setPreview({ ...r, selected: new Set(r.events.map((e) => e.id)) }),
  });

  const applyPreview = (mode: "replace" | "append") => {
    if (!preview) return;
    const chosen = preview.events.filter((e) => preview.selected.has(e.id)).map((e) => ({ ...e, id: newId() }));
    setEvents(mode === "replace" ? chosen : [...events, ...chosen]);
    setPreview(null);
    setPasted("");
  };

  const update = (id: string, patch: Partial<CalendarEvent>) =>
    setEvents(events.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  return (
    <div className="space-y-5">
      <SectionBox
        title="Datas cadastradas"
        description="O agente responde datas daqui. O sistema calcula sozinho o que já passou e o que vem, então ele não apresenta como próximo um evento que já passou. Vale no atendimento depois de publicar."
      >
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="indigo">{counts.next} próximas ou em andamento</Badge>
          <Badge variant="muted">{counts.past} já passaram</Badge>
          <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} className="size-4 accent-primary" />
            Mostrar as que já passaram
          </label>
        </div>

        {visible.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            {events.length === 0 ? "Nenhuma data ainda. Importe um calendário abaixo ou adicione à mão." : "Nenhuma data próxima."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <div className="min-w-[640px]">
              <div className="grid grid-cols-[150px_150px_minmax(0,1fr)_110px_44px] gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-bold text-muted-foreground">
                <span>Início</span>
                <span>Fim (se for período)</span>
                <span>O que acontece</span>
                <span>Situação</span>
                <span />
              </div>
              {visible.map((e) => {
                const s = STATUS[statusOf(e, today)];
                return (
                  <div key={e.id} className="grid grid-cols-[150px_150px_minmax(0,1fr)_110px_44px] items-center gap-2 border-b px-3 py-2 last:border-b-0">
                    <Input type="date" value={e.start} aria-label="Início" onChange={(ev) => update(e.id, { start: ev.target.value })} />
                    <Input
                      type="date"
                      value={e.end ?? ""}
                      aria-label="Fim"
                      onChange={(ev) => update(e.id, { end: ev.target.value || undefined })}
                    />
                    <Input value={e.title} aria-label="O que acontece" onChange={(ev) => update(e.id, { title: ev.target.value })} />
                    <Badge variant={s.variant} className="justify-center">{s.label}</Badge>
                    <Button variant="ghost" size="icon" aria-label={`Remover ${e.title}`} onClick={() => setEvents(events.filter((x) => x.id !== e.id))}>
                      <IconTrash className="size-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <Button
          variant="outline"
          className="gap-1 self-start"
          onClick={() => setEvents([...events, { id: newId(), start: today, title: "" }])}
        >
          <IconPlus className="size-4" /> Adicionar data
        </Button>
      </SectionBox>

      <SectionBox
        title="Importar calendário"
        description="Envie o arquivo (PDF, Word, TXT ou CSV) ou cole o texto. Linhas no formato “dd/mm/aaaa – evento” entram direto; PDF de tabela é organizado automaticamente. Você confere antes de entrar."
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-sm font-semibold">
            Ano de referência
            <Input type="number" className="w-28" value={year} onChange={(e) => setYear(Number(e.target.value) || year)} />
          </label>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.txt,.csv,.tsv,.md,.docx"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importer.mutate({ file });
              e.target.value = "";
            }}
          />
          <Button variant="outline" className="gap-1" disabled={importer.isPending} onClick={() => fileRef.current?.click()}>
            {importer.isPending ? <IconLoader2 className="size-4 animate-spin" /> : <IconUpload className="size-4" />}
            Enviar arquivo
          </Button>
        </div>
        <Textarea
          rows={5}
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder={"Ou cole aqui, uma data por linha:\n02/10/2026 a 05/10/2026 – Semana de inscrições\n19/10/2026 – Divulgação dos resultados"}
        />
        <Button className="gap-1 self-start" disabled={!pasted.trim() || importer.isPending} onClick={() => importer.mutate({ text: pasted })}>
          {importer.isPending ? <IconLoader2 className="size-4 animate-spin" /> : <IconCalendarEvent className="size-4" />}
          Ler datas
        </Button>
        {importer.isError && <p className="text-sm text-destructive">{(importer.error as Error)?.message}</p>}

        {preview && (
          <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
            <p className="text-sm font-semibold">
              {preview.events.length} {preview.events.length === 1 ? "data encontrada" : "datas encontradas"}{" "}
              <span className="font-normal text-muted-foreground">
                {preview.method === "ai"
                  ? "· organizadas automaticamente a partir do arquivo: confira mês e ano antes de usar."
                  : "· lidas linha a linha."}
              </span>
            </p>
            <div className="max-h-80 space-y-1 overflow-y-auto rounded-lg border bg-card p-2">
              {preview.events.map((e) => (
                <label key={e.id} className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-sm hover:bg-muted/50">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-primary"
                    checked={preview.selected.has(e.id)}
                    onChange={(ev) => {
                      const next = new Set(preview.selected);
                      if (ev.target.checked) next.add(e.id);
                      else next.delete(e.id);
                      setPreview({ ...preview, selected: next });
                    }}
                  />
                  <span className={cn("w-44 shrink-0 font-medium tabular-nums", statusOf(e, today) === "past" && "text-muted-foreground")}>
                    {br(e.start)}
                    {e.end ? ` a ${br(e.end)}` : ""}
                  </span>
                  <span>{e.title}</span>
                </label>
              ))}
            </div>
            {preview.unparsed.length > 0 && (
              <details className="text-sm text-muted-foreground">
                <summary className="cursor-pointer">{preview.unparsed.length} linhas sem data ficaram de fora</summary>
                <ul className="mt-1 list-disc pl-5">
                  {preview.unparsed.slice(0, 30).map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </details>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => applyPreview(events.length > 0 ? "replace" : "append")} disabled={preview.selected.size === 0}>
                {events.length > 0 ? `Substituir as ${events.length} datas atuais` : `Usar ${preview.selected.size} datas`}
              </Button>
              {events.length > 0 && (
                <Button variant="outline" onClick={() => applyPreview("append")} disabled={preview.selected.size === 0}>
                  Adicionar às atuais
                </Button>
              )}
              <Button variant="ghost" onClick={() => setPreview(null)}>
                Descartar
              </Button>
            </div>
          </div>
        )}
      </SectionBox>
    </div>
  );
}
