"use client";

/**
 * Avisos temporários: situação com início e fim que muda o que o agente
 * diz enquanto dura (manutenção, instabilidade, prazo prorrogado). Fora da
 * janela o motor ignora o aviso — expira sozinho.
 */

import * as React from "react";
import { IconAlertTriangle, IconPlus, IconTrash } from "@tabler/icons-react";

import { ChipInput } from "@/components/ai-agents/chip-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MultiSelectPopover } from "@/features/dashboard-v2/components/multi-select-popover";

export type Notice = {
  id: string;
  title?: string;
  message: string;
  startsAt: string;
  endsAt?: string;
  themeIds?: string[];
  when?: string[];
  holdTransfers?: boolean;
};

const newId = () => `aviso_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

/** "2026-10-11T08:00" no horário do navegador (o mesmo do agente na prática). */
function localInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function parseLocal(v: string | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function noticeStatus(n: Notice, now: Date = new Date()): "active" | "scheduled" | "ended" | "invalid" {
  const start = parseLocal(n.startsAt);
  if (!start) return "invalid";
  const endRaw = parseLocal(n.endsAt);
  const end = endRaw && endRaw > start ? endRaw : new Date(start.getTime() + 24 * 3_600_000);
  if (now < start) return "scheduled";
  if (now >= end) return "ended";
  return "active";
}

const STATUS: Record<ReturnType<typeof noticeStatus>, { label: string; variant: "indigo" | "muted" | "destructive" | "success" }> = {
  active: { label: "Em vigor", variant: "success" },
  scheduled: { label: "Agendado", variant: "indigo" },
  ended: { label: "Encerrado", variant: "muted" },
  invalid: { label: "Sem início", variant: "destructive" },
};

export function NoticesStep({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (path: string, value: unknown) => void;
}) {
  const notices = ((config.notices as Notice[] | undefined) ?? []) as Notice[];
  const themes = ((config.themes as Array<{ id: string; name?: string }> | undefined) ?? []).filter((t) => t?.id);
  const setNotices = (next: Notice[]) => onChange("notices", next);
  const update = (id: string, patch: Partial<Notice>) => setNotices(notices.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  const add = () => {
    const now = new Date();
    const end = new Date(now.getTime() + 24 * 3_600_000);
    setNotices([{ id: newId(), title: "", message: "", startsAt: localInput(now), endsAt: localInput(end), themeIds: [], when: [], holdTransfers: true }, ...notices]);
  };
  const ended = notices.filter((n) => noticeStatus(n) === "ended");

  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-2xl border border-border bg-white p-5 v2-dark:bg-card">
        <div className="flex items-start gap-3">
          <IconAlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1 space-y-1">
            <h3 className="text-[15px] font-semibold">Avisos temporários</h3>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Uma situação que vale por um tempo — sistema em manutenção, instabilidade, prazo prorrogado. Enquanto o aviso estiver em vigor, o agente explica a situação quando o pedido tiver relação com ela, diz o que o cliente deve fazer e não transfere por causa disso. Depois do fim, o aviso deixa de valer sozinho.
            </p>
          </div>
          <Button className="h-9 shrink-0 gap-1.5" onClick={add}>
            <IconPlus className="size-4" /> Novo aviso
          </Button>
        </div>

        {notices.length === 0 && (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhum aviso. Use quando algo fora do normal estiver acontecendo e o agente precisar saber.</p>
        )}

        <ul className="space-y-3">
          {notices.map((n) => {
            const status = noticeStatus(n);
            return (
              <li key={n.id} className="space-y-3 rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={STATUS[status].variant}>{STATUS[status].label}</Badge>
                  <Input
                    value={n.title ?? ""}
                    onChange={(e) => update(n.id, { title: e.target.value })}
                    placeholder="Título (ex.: Sistema em manutenção)"
                    className="h-9 min-w-0 flex-1"
                  />
                  <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" aria-label="Apagar aviso" onClick={() => setNotices(notices.filter((x) => x.id !== n.id))}>
                    <IconTrash className="size-4" />
                  </Button>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">O que o agente deve dizer</label>
                  <Textarea
                    value={n.message}
                    onChange={(e) => update(n.id, { message: e.target.value })}
                    rows={3}
                    maxLength={600}
                    placeholder="O fato e o que o cliente deve fazer. Ex.: O sistema está em manutenção até amanhã às 8h. Aguarde e tente de novo depois desse horário."
                  />
                  <p className="text-xs text-muted-foreground">O agente só afirma o que estiver aqui sobre a situação: escreva prazos e condições completos.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Começa</label>
                    <Input type="datetime-local" value={n.startsAt ?? ""} onChange={(e) => update(n.id, { startsAt: e.target.value })} className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Termina (vazio: 24 h depois do início)</label>
                    <Input type="datetime-local" value={n.endsAt ?? ""} onChange={(e) => update(n.id, { endsAt: e.target.value || undefined })} className="h-9" />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Vale para os assuntos (nenhum: todos)</label>
                    <MultiSelectPopover
                      label="Todos os assuntos"
                      options={themes.map((t) => ({ value: t.id, label: t.name || t.id }))}
                      selected={(n.themeIds ?? []).map(String)}
                      onChange={(v) => update(n.id, { themeIds: v })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Palavras que ligam a mensagem ao aviso (em qualquer assunto)</label>
                    <ChipInput values={(n.when ?? []).map(String)} onChange={(v) => update(n.id, { when: v })} placeholder="fora do ar" />
                  </div>
                </div>
                <label className="flex items-start gap-3 text-sm">
                  <Switch checked={n.holdTransfers !== false} onCheckedChange={(v) => update(n.id, { holdTransfers: v })} aria-label="Segurar transferência" />
                  <span>
                    <span className="font-medium">Segurar transferência por falha</span>
                    <span className="block text-xs text-muted-foreground">
                      Quando o cliente disser que tentou e deu erro, o agente responde com este aviso em vez de passar para a equipe (uma vez por conversa; se o cliente insistir, transfere).
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        {ended.length > 0 && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-muted-foreground v2-dark:bg-muted">
            {ended.length} aviso{ended.length === 1 ? "" : "s"} já encerrado{ended.length === 1 ? "" : "s"} (o agente não usa mais).
            <Button variant="ghost" size="sm" className="h-7" onClick={() => setNotices(notices.filter((x) => noticeStatus(x) !== "ended"))}>
              Apagar encerrados
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
