"use client";

/**
 * Seção "Contexto do site" (frente B) do painel Webchat: rótulos das chaves
 * de contexto, limites de `setContext`/`track`, retenção, eventos
 * importantes e rastreio de visitante anônimo.
 * Contrato: `backend_crm1/docs/decisoes/webchat-widget.md` §9.3/§9.7.
 */
import { IconPlus as Plus, IconX as X } from "@tabler/icons-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SwitchGlass } from "@/components/crm/switch-glass";

import {
  clampInt,
  WEBCHAT_CONTEXT_KEY_RE,
  WEBCHAT_EVENT_NAME_RE,
  WEBCHAT_V2_LIMITS,
  type WebchatV2SectionProps,
} from "./v2-config";

type Range = { min: number; max: number; def: number };

function NumberField(props: {
  id: string;
  label: string;
  value: number;
  range: Range;
  onChange: (n: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={props.id} className="text-xs">
        {props.label}
      </Label>
      <Input
        id={props.id}
        type="number"
        min={props.range.min}
        max={props.range.max}
        value={props.value}
        onChange={(e) => props.onChange(clampInt(e.target.value, props.range, props.range.def))}
      />
    </div>
  );
}

export function WebchatContextSection({ value, onChange }: WebchatV2SectionProps) {
  const { context, events } = value;
  const setContext = (p: Partial<typeof context>) => onChange({ ...value, context: { ...context, ...p } });
  const setEvents = (p: Partial<typeof events>) => onChange({ ...value, events: { ...events, ...p } });
  const [labelKey, setLabelKey] = useState("");
  const [labelText, setLabelText] = useState("");
  const [eventDraft, setEventDraft] = useState("");
  const L = WEBCHAT_V2_LIMITS;

  const addLabel = () => {
    const k = labelKey.trim();
    const t = labelText.trim();
    if (!WEBCHAT_CONTEXT_KEY_RE.test(k) || !t) return;
    setContext({ labels: { ...context.labels, [k]: t } });
    setLabelKey("");
    setLabelText("");
  };
  const addEvent = () => {
    const n = eventDraft.trim();
    if (!WEBCHAT_EVENT_NAME_RE.test(n)) return;
    if (!events.important.includes(n)) setEvents({ important: [...events.important, n] });
    setEventDraft("");
  };

  return (
    <section className="space-y-3" aria-labelledby="wc-context-title">
      <p id="wc-context-title" className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        Contexto do site
      </p>
      <p className="text-xs text-[var(--text-muted)]">
        O site pode mandar o estado atual (<code>setContext</code>) e eventos (<code>track</code>)
        para quem atende ver onde o visitante está. O que é enviado, e o aviso ao usuário, são
        decisão do site.
      </p>
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>Aceitar de visitante não identificado</span>
        <SwitchGlass
          size="sm"
          checked={context.anonymous}
          aria-label="Aceitar contexto de visitante não identificado"
          onChange={(on) => setContext({ anonymous: on })}
        />
      </label>

      <div className="space-y-1.5">
        <Label className="text-xs">Rótulos das chaves (sem rótulo, aparece a chave)</Label>
        {Object.entries(context.labels).length ? (
          <ul className="space-y-1">
            {Object.entries(context.labels).map(([k, t]) => (
              <li key={k} className="flex items-center gap-2 text-xs">
                <code className="font-mono">{k}</code>
                <span className="text-[var(--text-muted)]">→</span>
                <span className="min-w-0 flex-1 truncate">{t}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remover rótulo ${k}`}
                  onClick={() => {
                    const next = { ...context.labels };
                    delete next[k];
                    setContext({ labels: next });
                  }}
                >
                  <X className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex gap-2">
          <Input
            aria-label="Chave do contexto"
            placeholder="chave"
            className="font-mono text-xs"
            value={labelKey}
            onChange={(e) => setLabelKey(e.target.value)}
          />
          <Input
            aria-label="Rótulo da chave"
            placeholder="Rótulo"
            maxLength={80}
            value={labelText}
            onChange={(e) => setLabelText(e.target.value)}
          />
          <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addLabel}>
            <Plus className="size-3.5" />
            Rótulo
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <NumberField
          id="wc-ctx-max-keys"
          label="Máximo de chaves"
          value={context.maxKeys}
          range={L.contextMaxKeys}
          onChange={(n) => setContext({ maxKeys: n })}
        />
        <NumberField
          id="wc-ctx-max-chars"
          label="Caracteres por valor"
          value={context.maxValueChars}
          range={L.contextMaxValueChars}
          onChange={(n) => setContext({ maxValueChars: n })}
        />
        <NumberField
          id="wc-ev-batch"
          label="Eventos por envio"
          value={events.maxPerBatch}
          range={L.eventsMaxPerBatch}
          onChange={(n) => setEvents({ maxPerBatch: n })}
        />
        <NumberField
          id="wc-ev-retention"
          label="Guardar eventos e contexto por (dias)"
          value={events.retentionDays}
          range={L.eventsRetentionDays}
          onChange={(n) => setEvents({ retentionDays: n })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="wc-ev-important" className="text-xs">
          Eventos importantes (viram nota na conversa)
        </Label>
        {events.important.length ? (
          <ul className="flex flex-wrap gap-2">
            {events.important.map((n) => (
              <li
                key={n}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--glass-border)] py-1 ps-3 pe-1 font-mono text-xs"
              >
                {n}
                <button
                  type="button"
                  className="inline-flex size-5 items-center justify-center rounded-full text-[var(--text-muted)]"
                  aria-label={`Remover evento ${n}`}
                  onClick={() => setEvents({ important: events.important.filter((x) => x !== n) })}
                >
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex gap-2">
          <Input
            id="wc-ev-important"
            placeholder="nome_do_evento"
            className="font-mono text-xs"
            value={eventDraft}
            onChange={(e) => setEventDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addEvent();
              }
            }}
          />
          <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addEvent}>
            <Plus className="size-3.5" />
            Evento
          </Button>
        </div>
        <p className="text-xs text-[var(--text-muted)]">O site também pode marcar um evento como importante.</p>
      </div>
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>Evento importante sem conversa aberta abre uma</span>
        <SwitchGlass
          size="sm"
          checked={events.importantOpensConversation}
          aria-label="Evento importante abre conversa"
          onChange={(on) => setEvents({ importantOpensConversation: on })}
        />
      </label>
    </section>
  );
}
