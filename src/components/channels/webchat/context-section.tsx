"use client";

/**
 * Seção "Contexto do site" (frente B) do painel Webchat: rótulos das chaves
 * de contexto, limites de `setContext`/`track`, retenção, eventos
 * importantes e rastreio de visitante anônimo.
 * Contrato: `backend_crm1/docs/decisoes/webchat-widget.md` §9.3/§9.7.
 *
 * Nada fixo de cliente: as chaves e os nomes de evento são os que o site
 * manda; aqui a org só dá rótulos e decide o que vira nota.
 */
import { IconPlus as Plus, IconX as X } from "@tabler/icons-react";
import { useState, type KeyboardEvent, type ReactNode } from "react";

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

/** Mesmos tetos do backend (`v2-config.ts`). */
const MAX_LABELS = 100;
const MAX_LABEL_CHARS = 80;
const MAX_IMPORTANT_EVENTS = 50;

type Range = { min: number; max: number; def: number };

function NumberField(props: {
  id: string;
  label: string;
  hint?: string;
  value: number;
  range: Range;
  onChange: (n: number) => void;
}) {
  const hintId = props.hint ? `${props.id}-hint` : undefined;
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
        aria-describedby={hintId}
        onChange={(e) => props.onChange(clampInt(e.target.value, props.range, props.range.def))}
      />
      {props.hint ? (
        <p id={hintId} className="text-[11px] text-[var(--text-muted)]">
          {props.hint}
        </p>
      ) : null}
    </div>
  );
}

function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="text-xs text-[var(--warning)]">
      {children}
    </p>
  );
}

export function WebchatContextSection({ value, onChange }: WebchatV2SectionProps) {
  const { context, events } = value;
  const setContext = (p: Partial<typeof context>) => onChange({ ...value, context: { ...context, ...p } });
  const setEvents = (p: Partial<typeof events>) => onChange({ ...value, events: { ...events, ...p } });
  const [labelKey, setLabelKey] = useState("");
  const [labelText, setLabelText] = useState("");
  const [labelError, setLabelError] = useState<string | null>(null);
  const [eventDraft, setEventDraft] = useState("");
  const [eventError, setEventError] = useState<string | null>(null);
  const L = WEBCHAT_V2_LIMITS;
  const labelEntries = Object.entries(context.labels);

  const addLabel = () => {
    const k = labelKey.trim();
    const t = labelText.trim();
    if (!WEBCHAT_CONTEXT_KEY_RE.test(k)) {
      setLabelError("Chave inválida: letras, números, _ . - (até 64, sem espaço).");
      return;
    }
    if (!t) {
      setLabelError("Informe o rótulo.");
      return;
    }
    if (!(k in context.labels) && labelEntries.length >= MAX_LABELS) {
      setLabelError(`No máximo ${MAX_LABELS} rótulos.`);
      return;
    }
    setContext({ labels: { ...context.labels, [k]: t.slice(0, MAX_LABEL_CHARS) } });
    setLabelKey("");
    setLabelText("");
    setLabelError(null);
  };
  const addEvent = () => {
    const n = eventDraft.trim();
    if (!WEBCHAT_EVENT_NAME_RE.test(n)) {
      setEventError("Nome inválido: comece com letra ou número; use letras, números, _ . : - (até 64).");
      return;
    }
    if (!events.important.includes(n)) {
      if (events.important.length >= MAX_IMPORTANT_EVENTS) {
        setEventError(`No máximo ${MAX_IMPORTANT_EVENTS} eventos.`);
        return;
      }
      setEvents({ important: [...events.important, n] });
    }
    setEventDraft("");
    setEventError(null);
  };
  const onEnter = (fn: () => void) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      fn();
    }
  };

  return (
    <section className="space-y-3" aria-labelledby="wc-context-title">
      <p id="wc-context-title" className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        Contexto do site
      </p>
      <p className="text-xs text-[var(--text-muted)]">
        O site pode mandar o estado atual (<code>setContext</code>) e eventos (<code>track</code>)
        para quem atende ver onde o visitante está, no painel “No site agora” da conversa. O que é
        enviado, e o aviso ao usuário, são decisão do site.
      </p>
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>
          Aceitar de visitante não identificado
          <span className="block text-xs text-[var(--text-muted)]">
            Sem isso, só depois do identify assinado. O que chegar antes passa para o contato quando
            ele for identificado.
          </span>
        </span>
        <SwitchGlass
          size="sm"
          checked={context.anonymous}
          aria-label="Aceitar contexto de visitante não identificado"
          onChange={(on) => setContext({ anonymous: on })}
        />
      </label>

      <div className="space-y-1.5">
        <Label className="text-xs">Rótulos das chaves (sem rótulo, aparece a chave)</Label>
        {labelEntries.length ? (
          <ul className="space-y-1">
            {labelEntries.map(([k, t]) => (
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
            maxLength={64}
            value={labelKey}
            aria-invalid={!!labelError}
            aria-describedby={labelError ? "wc-label-error" : undefined}
            onChange={(e) => {
              setLabelKey(e.target.value);
              setLabelError(null);
            }}
            onKeyDown={onEnter(addLabel)}
          />
          <Input
            aria-label="Rótulo da chave"
            placeholder="Rótulo"
            maxLength={MAX_LABEL_CHARS}
            value={labelText}
            onChange={(e) => {
              setLabelText(e.target.value);
              setLabelError(null);
            }}
            onKeyDown={onEnter(addLabel)}
          />
          <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addLabel}>
            <Plus className="size-3.5" />
            Rótulo
          </Button>
        </div>
        {labelError ? <FieldError id="wc-label-error">{labelError}</FieldError> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <NumberField
          id="wc-ctx-max-keys"
          label="Máximo de chaves"
          hint="Chave nova além disso é ignorada."
          value={context.maxKeys}
          range={L.contextMaxKeys}
          onChange={(n) => setContext({ maxKeys: n })}
        />
        <NumberField
          id="wc-ctx-max-chars"
          label="Caracteres por valor"
          hint="Texto maior é cortado."
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
          hint="Depois disso são apagados (varredura diária)."
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
            maxLength={64}
            value={eventDraft}
            aria-invalid={!!eventError}
            aria-describedby={eventError ? "wc-event-error" : undefined}
            onChange={(e) => {
              setEventDraft(e.target.value);
              setEventError(null);
            }}
            onKeyDown={onEnter(addEvent)}
          />
          <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addEvent}>
            <Plus className="size-3.5" />
            Evento
          </Button>
        </div>
        {eventError ? <FieldError id="wc-event-error">{eventError}</FieldError> : null}
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
