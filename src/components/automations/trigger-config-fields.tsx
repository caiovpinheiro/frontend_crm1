"use client";

import * as React from "react";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";

import {
  DropdownGlass,
  FILTER_FIELD_INPUT_CLASS,
  FILTER_FIELD_ITEM_CLASS,
  FILTER_FIELD_MENU_CLASS,
  FILTER_FIELD_TRIGGER_CLASS,
} from "@/components/crm/dropdown-glass";
import { useModalPortalContainer } from "@/components/ui/modal-portal-context";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DeptGlyph } from "@/features/conversations-settings/department-icons";
import { apiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  AUTOMATION_TRIGGER_TYPES,
  readTriggerChannelIds,
  readTriggerChannelScope,
  triggerTypeLabel,
} from "@/lib/automation-workflow";

import { useTagOptions } from "./editor-data";
import { ActiveChannelMultiSelect, useConnectedStepChannels } from "./step-channel-picker";

type Props = {
  triggerType: string;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  /** Card do canvas (320px): um campo por linha, no modelo de "Mensagem recebida". */
  stacked?: boolean;
};

// Estrutura espelha o retorno de `GET /api/pipelines` no backend.
type PipelineStage = { id: string; name: string };
type Pipeline = { id: string; name: string; stages: PipelineStage[] };

/**
 * Hook compartilhado entre os blocos que precisam exibir dropdowns de
 * pipeline/estágio (stage_changed, deal_created, contact_created,
 * message_received/sent). Mesmo `queryKey` reusado entre instâncias —
 * graças ao cache do react-query, abrir o config dialog não bate duas
 * vezes no backend.
 */
export function usePipelines() {
  return useQuery({
    queryKey: ["pipelines-for-trigger"],
    staleTime: 60_000,
    queryFn: async (): Promise<Pipeline[]> => {
      const res = await fetch(apiUrl("/api/pipelines"));
      if (!res.ok) return [];
      return (await res.json()) as Pipeline[];
    },
  });
}

/** id → nome de pipeline, estágio e canal — resumo do card sem CUID. */
export function useTriggerNameLookup(): Record<string, string> {
  const { data: pipelines = [] } = usePipelines();
  const wa = useConnectedStepChannels("send_whatsapp_message");
  const em = useConnectedStepChannels("send_email");
  return React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of pipelines) {
      map[p.id] = p.name;
      for (const s of p.stages) map[s.id] = s.name;
    }
    for (const o of wa.options) map[o.id] = o.label;
    for (const o of em.options) map[o.id] = o.label;
    return map;
  }, [pipelines, wa.options, em.options]);
}

/**
 * Dropdown agrupado de estágios. Ao escolher um estágio, devolve junto
 * o `ownerPipelineId` — quando o operador não filtrou pipeline antes, o
 * componente pai preenche pipelineId automaticamente. Quando não há
 * estágios cadastrados, cai num input livre (escape hatch para casos
 * de seed ainda não rodado).
 *
 * 27/mai/26 — API trocada de dois callbacks separados (`onChange` +
 * `onPipelineChange`) pra um único callback emitindo o par. Isso
 * fechou um bug onde os dois `set(k, v)` consecutivos no pai usavam o
 * mesmo `value` do closure, e o segundo (`pipelineId`) sobrescrevia o
 * primeiro (`stageId`) — visualmente o select voltava pra "Qualquer
 * estágio" logo após o clique.
 */
/**
 * Multi-seleção de estágios. Permite escolher 1..N estágios (ou "Qualquer
 * estágio" = nenhum). Emite o array de ids + o `ownerPipelineId` quando há
 * exatamente 1 selecionado (pra o pai auto-preencher o pipeline). Sem
 * estágios cadastrados, cai num input livre (IDs separados por vírgula).
 */
function StageMultiSelect({
  id,
  label,
  helper,
  values,
  onChange,
  pipelinesFromValue,
}: {
  id: string;
  label: string;
  helper?: string;
  values: string[];
  onChange: (
    stageIds: string[],
    owner: { id: string; name: string } | null,
    stageNames: string[],
  ) => void;
  pipelinesFromValue?: string;
}) {
  const { data: pipelines = [], isLoading } = usePipelines();
  const portalContainer = useModalPortalContainer();
  const [q, setQ] = React.useState("");

  // Se o operador filtrou por pipeline antes do estágio, mostramos só os
  // estágios desse pipeline. Sem pipeline filtrado, mostramos todos
  // agrupados.
  const visiblePipelines = pipelinesFromValue
    ? pipelines.filter((p) => p.id === pipelinesFromValue)
    : pipelines;
  const allStages = visiblePipelines.flatMap((p) => p.stages);

  const namesOf = (ids: string[]) =>
    ids
      .map((id) => allStages.find((s) => s.id === id)?.name)
      .filter((n): n is string => Boolean(n));

  const ownerOf = (ids: string[]): { id: string; name: string } | null => {
    if (ids.length !== 1) return null;
    const p = pipelines.find((pipe) => pipe.stages.some((s) => s.id === ids[0]));
    return p ? { id: p.id, name: p.name } : null;
  };

  const toggle = (sid: string) => {
    const next = values.includes(sid)
      ? values.filter((v) => v !== sid)
      : [...values, sid];
    onChange(next, ownerOf(next), namesOf(next));
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs text-muted-foreground">Carregando estágios…</p>
      </div>
    );
  }

  if (allStages.length === 0) {
    return (
      <div className="space-y-2">
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          value={values.join(", ")}
          onChange={(e) => {
            const ids = e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            onChange(ids, null, ids);
          }}
          placeholder="IDs dos estágios (separados por vírgula)"
        />
        {helper ? (
          <p className="text-xs text-muted-foreground">{helper}</p>
        ) : null}
      </div>
    );
  }

  const triggerLabel =
    values.length === 0
      ? "Qualquer estágio"
      : values.length === 1
        ? allStages.find((s) => s.id === values[0])?.name ?? "1 estágio"
        : `${values.length} estágios selecionados`;

  const matchesQuery = (name: string) =>
    !q.trim() || name.toLowerCase().includes(q.trim().toLowerCase());

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <DropdownPrimitive.Root
        modal={false}
        onOpenChange={(o) => {
          if (!o) setQ("");
        }}
      >
        <DropdownPrimitive.Trigger asChild suppressHydrationWarning>
          <button
            type="button"
            className={cn(
              FILTER_FIELD_TRIGGER_CLASS,
              "group",
              values.length > 0 && "text-[var(--text-primary)]",
            )}
          >
            <span className="min-w-0 flex-1 truncate text-left">
              {triggerLabel}
            </span>
            <IconChevronDown
              size={15}
              className="ml-auto shrink-0 text-current opacity-60 transition-transform duration-200 group-data-[state=open]:rotate-180"
            />
          </button>
        </DropdownPrimitive.Trigger>

        <DropdownPrimitive.Portal container={portalContainer ?? undefined}>
          <DropdownPrimitive.Content
            align="start"
            sideOffset={6}
            className={cn(
              FILTER_FIELD_MENU_CLASS,
              "min-w-[var(--radix-dropdown-menu-trigger-width)]",
            )}
          >
            <div className="p-1 pb-1.5">
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                // Deixa Radix cuidar de navegação (setas/enter/esc); as demais
                // teclas ficam no input (senão o typeahead do menu rouba).
                onKeyDown={(e) => {
                  if (!["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(e.key))
                    e.stopPropagation();
                }}
                placeholder="Buscar estágio…"
                className={FILTER_FIELD_INPUT_CLASS}
              />
            </div>
            {values.length > 0 ? (
              <DropdownPrimitive.Item
                onSelect={(e) => {
                  e.preventDefault();
                  onChange([], null, []);
                }}
                className={cn(
                  FILTER_FIELD_ITEM_CLASS,
                  "text-[var(--text-muted)]",
                )}
              >
                Limpar seleção
              </DropdownPrimitive.Item>
            ) : null}
            {visiblePipelines.map((p) => {
              const stages = p.stages.filter((s) => matchesQuery(s.name));
              if (stages.length === 0) return null;
              return (
                <DropdownPrimitive.Group key={p.id}>
                  <DropdownPrimitive.Label className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    {p.name}
                  </DropdownPrimitive.Label>
                  {stages.map((s) => {
                    const checked = values.includes(s.id);
                    return (
                      <DropdownPrimitive.CheckboxItem
                        key={s.id}
                        checked={checked}
                        onSelect={(e) => e.preventDefault()}
                        onCheckedChange={() => toggle(s.id)}
                        className={FILTER_FIELD_ITEM_CLASS}
                      >
                        <span
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                            checked
                              ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white"
                              : "border-[var(--glass-border)]",
                          )}
                        >
                          {checked ? <IconCheck size={12} /> : null}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      </DropdownPrimitive.CheckboxItem>
                    );
                  })}
                </DropdownPrimitive.Group>
              );
            })}
          </DropdownPrimitive.Content>
        </DropdownPrimitive.Portal>
      </DropdownPrimitive.Root>
      {helper ? (
        <p className="text-xs text-muted-foreground">{helper}</p>
      ) : null}
    </div>
  );
}

export function TriggerChannelScope({
  id,
  values,
  scope,
  onChange,
}: {
  id: string;
  values: string[];
  scope: "all" | "selected";
  onChange: (scope: "all" | "selected", channelIds: string[]) => void;
}) {
  return (
    <ActiveChannelMultiSelect
      id={id}
      kinds="all"
      scope={scope}
      values={values}
      onChange={onChange}
    />
  );
}

function TriggerChannelTypeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>Restringir por tipo (opcional)</Label>
      <DropdownGlass
        triggerClassName="w-full"
        placeholder="Todos os tipos"
        value={value}
        options={[
          { value: "", label: "Todos os tipos" },
          { value: "whatsapp", label: "WhatsApp" },
          { value: "email", label: "E-mail" },
        ]}
        onValueChange={onChange}
      />
    </div>
  );
}

function patchTriggerChannels(
  patch: (next: Record<string, unknown>) => void,
  scope: "all" | "selected",
  ids: string[],
) {
  patch({
    channelScope: scope,
    channelIds: scope === "all" ? [] : ids,
    channelId: scope === "selected" && ids.length === 1 ? ids[0] : "",
    ...(scope === "selected" ? { channel: "" } : {}),
  });
}

function PipelineSelect({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (pipelineId: string, pipelineName: string) => void;
}) {
  const { data: pipelines = [], isLoading } = usePipelines();

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs text-muted-foreground">Carregando pipelines…</p>
      </div>
    );
  }

  if (pipelines.length === 0) {
    return (
      <div className="space-y-2">
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value, "")}
          placeholder="ID do pipeline"
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <DropdownGlass
        triggerClassName="w-full"
        placeholder="Qualquer pipeline"
        value={value}
        options={[
          { value: "", label: "Qualquer pipeline" },
          ...pipelines.map((p) => ({ value: p.id, label: p.name })),
        ]}
        onValueChange={(v) =>
          onChange(v, pipelines.find((p) => p.id === v)?.name ?? "")
        }
      />
    </div>
  );
}

/**
 * Dropdown de tags cadastradas na org (`GET /api/tags`). Salva o NOME
 * da tag (não o id) — o backend do gatilho `tag_added` dispara por nome.
 * Sem tags cadastradas, cai num input livre (mesmo escape hatch do
 * PipelineSelect). Se o valor atual não estiver mais na lista (tag
 * renomeada/apagada), inclui uma option extra pra não perder a seleção.
 */
function TagSelect({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (tagName: string) => void;
}) {
  const { options: tags, isLoading } = useTagOptions();

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs text-muted-foreground">Carregando tags…</p>
      </div>
    );
  }

  if (tags.length === 0) {
    return (
      <div className="space-y-2">
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Nome da tag"
        />
      </div>
    );
  }

  const hasCurrent = value.length > 0 && tags.some((t) => t.value === value);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {/* DropdownGlass (não SelectNative): o <select> nativo ignora o tema
          escuro na lista de options do SO/browser. */}
      <DropdownGlass
        triggerClassName="w-full"
        placeholder="Selecione uma tag…"
        value={value}
        options={[
          { value: "", label: "Selecione uma tag…" },
          ...(!hasCurrent && value
            ? [{ value, label: `${value} (valor personalizado)` }]
            : []),
          ...tags.map((t) => ({ value: t.value, label: t.label })),
        ]}
        onValueChange={onChange}
      />
    </div>
  );
}

/**
 * Lê os estágios selecionados de um campo do config, aceitando o formato
 * novo (array `<key>Ids`) e o legado (string `<key>Id`). Ex.: key="stage"
 * → lê `stageIds` (array) ou `stageId` (legado).
 */
function readStageIdsFromConfig(
  value: Record<string, unknown>,
  key: string,
): string[] {
  const arr = value[`${key}Ids`];
  if (Array.isArray(arr)) {
    return arr.filter((x): x is string => typeof x === "string" && x !== "");
  }
  const single = value[`${key}Id`];
  return typeof single === "string" && single ? [single] : [];
}

export function TriggerConfigFields({ triggerType, value, onChange, stacked }: Props) {
  const set = (k: string, v: unknown) => onChange({ ...value, [k]: v });
  // Patch parcial — usado quando uma mesma interação muda mais de um
  // campo (ex.: ao escolher um estágio, preencher pipelineId junto).
  const patch = (next: Record<string, unknown>) => onChange({ ...value, ...next });
  const pair = stacked ? "flex flex-col gap-3" : "grid gap-4 sm:grid-cols-2";

  switch (triggerType) {
    case "stage_changed":
      return (
        <div className={pair}>
          <StageMultiSelect
            id="tc-from"
            label="Estágio(s) de origem (opcional)"
            values={readStageIdsFromConfig(value, "fromStage")}
            onChange={(sids, _owner, names) =>
              patch({
                fromStageIds: sids,
                fromStageId: "",
                fromStageNames: names,
                fromStageName: names[0] ?? "",
              })
            }
          />
          <StageMultiSelect
            id="tc-to"
            label="Estágio(s) de destino"
            values={readStageIdsFromConfig(value, "toStage")}
            onChange={(sids, _owner, names) =>
              patch({
                toStageIds: sids,
                toStageId: "",
                toStageNames: names,
                toStageName: names[0] ?? "",
              })
            }
            helper="Deixe vazio para qualquer destino. Pode escolher mais de um."
          />
        </div>
      );
      // (stage_changed não usa pipelineId no config — só estágios.)
    case "tag_added":
      return (
        <TagSelect
          id="tc-tag"
          label="Nome da tag"
          value={String(value.tagName ?? "")}
          onChange={(tagName) => set("tagName", tagName)}
        />
      );
    case "lead_score_reached":
      return (
        <div className="space-y-2">
          <Label htmlFor="tc-th">Pontuação mínima</Label>
          <Input
            id="tc-th"
            type="number"
            value={value.threshold != null ? String(value.threshold) : ""}
            onChange={(e) => set("threshold", Number(e.target.value) || 0)}
          />
        </div>
      );
    case "deal_created":
    case "deal_won":
    case "deal_lost":
      return (
        <div className={pair}>
          <PipelineSelect
            id="tc-pipe"
            label="Pipeline (opcional)"
            value={String(value.pipelineId ?? "")}
            onChange={(pid, pipelineName) => {
              // Trocou de pipeline: limpa estágios (evita filtro
              // inconsistente do tipo "pipeline A, estágio do B").
              patch({
                pipelineId: pid,
                pipelineName,
                stageIds: [],
                stageId: "",
                stageNames: [],
                stageName: "",
              });
            }}
          />
          <StageMultiSelect
            id="tc-stage"
            label="Estágio(s) (opcional)"
            values={readStageIdsFromConfig(value, "stage")}
            onChange={(sids, owner, names) =>
              patch({
                stageIds: sids,
                stageId: "",
                stageNames: names,
                stageName: names[0] ?? "",
                // Só preenche pipelineId quando o usuário ainda não tinha
                // setado um (senão respeita a escolha explícita do operador).
                ...(owner && !value.pipelineId
                  ? { pipelineId: owner.id, pipelineName: owner.name }
                  : {}),
              })
            }
            pipelinesFromValue={String(value.pipelineId ?? "")}
            helper="Dispara quando o negócio entra em algum destes estágios."
          />
        </div>
      );
    case "contact_created":
      return (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Disparado quando um novo contato é criado. Opcionalmente,
            restrinja a um pipeline/estágio — o filtro só vale se o auto-deal
            já tiver sido criado no momento do evento.
          </p>
          <div className={pair}>
            <PipelineSelect
              id="tc-cc-pipe"
              label="Pipeline (opcional)"
              value={String(value.pipelineId ?? "")}
              onChange={(pid, pipelineName) =>
                patch({
                  pipelineId: pid,
                  pipelineName,
                  stageIds: [],
                  stageId: "",
                  stageNames: [],
                  stageName: "",
                })
              }
            />
            <StageMultiSelect
              id="tc-cc-stage"
              label="Estágio(s) (opcional)"
              values={readStageIdsFromConfig(value, "stage")}
              onChange={(sids, owner, names) =>
                patch({
                  stageIds: sids,
                  stageId: "",
                  stageNames: names,
                  stageName: names[0] ?? "",
                  ...(owner && !value.pipelineId
                    ? { pipelineId: owner.id, pipelineName: owner.name }
                    : {}),
                })
              }
              pipelinesFromValue={String(value.pipelineId ?? "")}
            />
          </div>
        </div>
      );
    case "conversation_created":
      return (
        <div className="space-y-3">
          <TriggerChannelScope
            id="tc-conv-ch"
            values={readTriggerChannelIds(value)}
            scope={readTriggerChannelScope(value)}
            onChange={(scope, ids) => patchTriggerChannels(patch, scope, ids)}
          />
          {readTriggerChannelScope(value) === "all" ? (
            <TriggerChannelTypeField
              value={String(value.channel ?? "")}
              onChange={(v) => set("channel", v)}
            />
          ) : null}
        </div>
      );
    case "whatsapp_session_expiring": {
      const hours = Number(value.hoursBeforeExpiry ?? 1);
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="tc-session-hours">Horas antes do encerramento</Label>
            <div className="grid grid-cols-5 gap-2">
              {[1, 2, 4, 6, 12].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => set("hoursBeforeExpiry", preset)}
                  className={cn(
                    "h-9 rounded-[var(--radius-md)] border font-display text-xs font-semibold transition-colors",
                    hours === preset
                      ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white"
                      : "border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-secondary)] hover:text-[var(--brand-primary)]",
                  )}
                >
                  {preset}h
                </button>
              ))}
            </div>
            <Input
              id="tc-session-hours"
              type="number"
              min={0.1}
              max={23.9}
              step={0.5}
              value={Number.isFinite(hours) ? hours : ""}
              onChange={(event) =>
                set("hoursBeforeExpiry", Number(event.target.value))
              }
              placeholder="Valor entre 0 e 24 horas"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Dispara uma vez por janela Meta aberta. Uma nova mensagem do cliente
            inicia outra janela e permite um novo disparo.
          </p>
        </div>
      );
    }
    case "message_received":
    case "message_sent":
      return (
        <div className="space-y-3">
          <TriggerChannelScope
            id="tc-msg-ch"
            values={readTriggerChannelIds(value)}
            scope={readTriggerChannelScope(value)}
            onChange={(scope, ids) => patchTriggerChannels(patch, scope, ids)}
          />
          {readTriggerChannelScope(value) === "all" ? (
            <TriggerChannelTypeField
              value={String(value.channel ?? "")}
              onChange={(v) => set("channel", v)}
            />
          ) : null}
          <div className={pair}>
            <PipelineSelect
              id="tc-msg-pipe"
              label="Pipeline (opcional)"
              value={String(value.pipelineId ?? "")}
              onChange={(pid, pipelineName) =>
                patch({
                  pipelineId: pid,
                  pipelineName,
                  stageIds: [],
                  stageId: "",
                  stageNames: [],
                  stageName: "",
                })
              }
            />
            <StageMultiSelect
              id="tc-msg-stage"
              label="Estágio(s) (opcional)"
              values={readStageIdsFromConfig(value, "stage")}
              onChange={(sids, owner, names) =>
                patch({
                  stageIds: sids,
                  stageId: "",
                  stageNames: names,
                  stageName: names[0] ?? "",
                  ...(owner && !value.pipelineId
                    ? { pipelineId: owner.id, pipelineName: owner.name }
                    : {}),
                })
              }
              pipelinesFromValue={String(value.pipelineId ?? "")}
              helper={
                triggerType === "message_received"
                  ? "Dispara quando o lead que enviou a mensagem está em algum destes estágios."
                  : "Dispara quando a mensagem é enviada para um lead em algum destes estágios."
              }
            />
          </div>
          {/*
            27/mai/26 — Filtro por status do negocio. Usamos um select
            simples (em vez de multi-select) com 4 opcoes + uma composta
            "Ganho ou Perdido" — esse e o caso pratico que o operador
            mencionou (retencao pos-venda e reengajamento de perdidos
            no mesmo gatilho). Valor armazenado e CSV ("WON,LOST"),
            interpretado no backend como "any of".
          */}
          <div className="space-y-2">
            <Label htmlFor="tc-msg-status">Status do negócio (opcional)</Label>
            <DropdownGlass
              triggerClassName="w-full"
              placeholder="Qualquer status"
              value={String(value.dealStatus ?? "")}
              options={[
                { value: "", label: "Qualquer status" },
                { value: "OPEN", label: "Em aberto" },
                { value: "WON", label: "Ganho" },
                { value: "LOST", label: "Perdido" },
                { value: "WON,LOST", label: "Ganho ou Perdido" },
              ]}
              onValueChange={(v) => set("dealStatus", v)}
            />
            <p className="text-xs text-muted-foreground">
              {triggerType === "message_received"
                ? "Dispara só quando o contato que enviou a mensagem tem negócio neste status. Use \"Ganho ou Perdido\" para pós-venda e reengajamento."
                : "Dispara só quando a mensagem é enviada para um contato com negócio neste status."}
            </p>
          </div>
        </div>
      );
    case "call_received":
    case "call_made":
      return (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {triggerType === "call_received"
              ? "Disparado quando uma ligação de entrada é encerrada (WhatsApp ou telefonia SIP). Filtre por atendidas ou não atendidas."
              : "Disparado quando uma ligação de saída é encerrada (WhatsApp ou telefonia SIP)."}
          </p>
          <div className="space-y-2">
            <Label htmlFor="tc-call-status">Resultado da ligação (opcional)</Label>
            <DropdownGlass
              triggerClassName="w-full"
              placeholder="Qualquer ligação"
              value={String(value.status ?? "")}
              options={[
                { value: "", label: "Qualquer ligação" },
                { value: "answered", label: "Apenas atendidas" },
                { value: "missed", label: "Apenas não atendidas" },
              ]}
              onValueChange={(v) => set("status", v)}
            />
          </div>
        </div>
      );
    case "call_permission_granted":
      return (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Disparado quando o cliente aceita o pedido de permissão de ligação no WhatsApp
            (opt-in de voz). Não inclui ligações SIP.
          </p>
          <div className="space-y-2">
            <Label htmlFor="tc-consent-type">Tipo de permissão (opcional)</Label>
            <DropdownGlass
              triggerClassName="w-full"
              placeholder="Qualquer"
              value={String(value.consentType ?? "")}
              options={[
                { value: "", label: "Qualquer" },
                { value: "PERMANENT", label: "Permanente" },
                { value: "TEMPORARY", label: "Temporária 7 dias" },
              ]}
              onValueChange={(v) => set("consentType", v)}
            />
          </div>
        </div>
      );
    case "lead_distributed":
      return <LeadDistributedFields value={value} patch={patch} />;
    case "manual":
      return (
        <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3 text-sm text-foreground">
          <p className="font-semibold">Esta automação é disparada manualmente.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Não há filtro automático — ela aparece como opção no botão{" "}
            <span className="font-medium text-foreground">&quot;Rodar automação&quot;</span> dentro
            das conversas do inbox e do detalhe de cada negócio no kanban. Use
            para fluxos sob demanda (ex.: enviar resumo, abrir cobrança,
            transferir para outro setor) que o operador decide quando executar.
          </p>
        </div>
      );
    case "lifecycle_changed":
      return (
        <div className={pair}>
          <div className="space-y-2">
            <Label htmlFor="tc-lf">De (opcional)</Label>
            <Input
              id="tc-lf"
              value={String(value.fromLifecycle ?? value.from ?? "")}
              onChange={(e) => set("fromLifecycle", e.target.value)}
              placeholder="ex.: LEAD"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tc-lt">Para (opcional)</Label>
            <Input
              id="tc-lt"
              value={String(value.toLifecycle ?? value.lifecycleStage ?? "")}
              onChange={(e) => set("toLifecycle", e.target.value)}
              placeholder="ex.: MQL"
            />
          </div>
        </div>
      );
    case "conversation_tabulated":
      return <ConversationTabulatedFields value={value} patch={patch} />;
    default:
      return (
        <p className="text-sm text-muted-foreground">Selecione um tipo de gatilho.</p>
      );
  }
}

// ─────────────────────────────────────────────────────────────
// lead_distributed — filtro opcional por departamento
// ─────────────────────────────────────────────────────────────

function LeadDistributedFields({
  value,
  patch,
}: {
  value: Record<string, unknown>;
  patch: (n: Record<string, unknown>) => void;
}) {
  const departmentId = String(value.departmentId ?? "");
  const departmentsQuery = useQuery({
    queryKey: ["automation-trigger-departments"],
    staleTime: 60_000,
    queryFn: async (): Promise<{ id: string; name: string; icon?: string }[]> => {
      const res = await fetch(apiUrl("/api/settings/departments"));
      if (!res.ok) return [];
      return (await res.json()) as { id: string; name: string; icon?: string }[];
    },
  });

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Disparado automaticamente quando a distribuição inteligente atribui um
        consultor humano (vindo da IA ou sem responsável) — inclusive se o
        aluno já teve atendimento humano nesta conversa. Não re-dispara em
        transferência entre consultores. Use a mensagem WhatsApp com{" "}
        <span className="font-medium text-foreground">Enviar como → Responsável</span>{" "}
        e tokens{" "}
        <code className="text-[11px]">{"{{contact.name}}"}</code> /{" "}
        <code className="text-[11px]">{"{{assignee.name}}"}</code>.
      </p>
      <div className="space-y-2">
        <Label htmlFor="tc-lead-dist-dept">Departamento (opcional)</Label>
        <DropdownGlass
          triggerClassName="w-full"
          placeholder="Qualquer departamento"
          value={departmentId}
          options={[
            { value: "", label: "Qualquer departamento" },
            ...(departmentsQuery.data ?? []).map((d) => ({
              value: d.id,
              label: d.name,
              icon: <DeptGlyph icon={d.icon} size={16} />,
            })),
          ]}
          onValueChange={(v) => {
            const d = (departmentsQuery.data ?? []).find((x) => x.id === v);
            patch({ departmentId: v, departmentName: d?.name ?? "" });
          }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// conversation_tabulated — seletor departamento + arvore
// ─────────────────────────────────────────────────────────────

type TabulationNodeApi = {
  id: string;
  number?: number;
  parentId: string | null;
  name: string;
  color: string | null;
  position: number;
  active: boolean;
  children: TabulationNodeApi[];
};

function ConversationTabulatedFields({
  value,
  patch,
}: {
  value: Record<string, unknown>;
  patch: (n: Record<string, unknown>) => void;
}) {
  const departmentId = String(value.departmentId ?? "");
  const tabulationId = String(value.tabulationId ?? "");
  const requireTabulation = value.requireTabulation === true;

  const departmentsQuery = useQuery({
    queryKey: ["automation-trigger-departments"],
    staleTime: 60_000,
    queryFn: async (): Promise<{ id: string; name: string; icon?: string }[]> => {
      const res = await fetch(apiUrl("/api/settings/departments"));
      if (!res.ok) return [];
      return (await res.json()) as { id: string; name: string; icon?: string }[];
    },
  });

  const treeQuery = useQuery({
    queryKey: ["automation-trigger-tabulations", departmentId],
    enabled: !!departmentId,
    staleTime: 30_000,
    queryFn: async (): Promise<{ tree: TabulationNodeApi[] }> => {
      const res = await fetch(
        apiUrl(`/api/tabulations?departmentId=${encodeURIComponent(departmentId)}`),
      );
      if (!res.ok) return { tree: [] };
      return (await res.json()) as { tree: TabulationNodeApi[] };
    },
  });

  // Achata a arvore em opcoes indentadas: cada nó carrega seu caminho
  // completo pra o operador identificar rapidamente. Categorias tambem
  // podem ser escolhidas (mirar categoria vale pra todos os descendentes).
  const flat = flattenTabulationTree(treeQuery.data?.tree ?? []);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Disparado quando um agente encerra uma conversa. Por padrão vale
        qualquer encerramento manual — marque a opção abaixo para restringir
        apenas aos encerramentos com tabulação. Filtros de departamento e
        tabulação são opcionais (categoria pai inclui todos os itens abaixo).
      </p>

      <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-[var(--brand-primary)]"
          checked={requireTabulation}
          onChange={(e) => patch({ requireTabulation: e.target.checked })}
        />
        <span>Somente quando tiver tabulação</span>
      </label>

      <div className="space-y-2">
        <Label htmlFor="tc-tab-dept">Departamento (opcional)</Label>
        <DropdownGlass
          triggerClassName="w-full"
          placeholder="Qualquer departamento"
          value={departmentId}
          options={[
            { value: "", label: "Qualquer departamento" },
            ...(departmentsQuery.data ?? []).map((d) => ({
              value: d.id,
              label: d.name,
              icon: <DeptGlyph icon={d.icon} size={16} />,
            })),
          ]}
          onValueChange={(v) => {
            const d = (departmentsQuery.data ?? []).find((x) => x.id === v);
            patch({
              departmentId: v,
              departmentName: d?.name ?? "",
              tabulationId: "",
              tabulationLabel: "",
            });
          }}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="tc-tab-node">Tabulação (opcional)</Label>
        <DropdownGlass
          triggerClassName="w-full"
          placeholder="Qualquer tabulação do departamento"
          value={tabulationId}
          disabled={!departmentId}
          searchable
          options={[
            { value: "", label: "Qualquer tabulação do departamento" },
            ...flat.map((f) => ({ value: f.id, label: f.label })),
          ]}
          onValueChange={(id) => {
            const found = flat.find((f) => f.id === id);
            patch({
              tabulationId: id,
              tabulationLabel: found?.label ?? "",
            });
          }}
        />
        {!departmentId ? (
          <p className="text-xs text-muted-foreground">
            Escolha um departamento para listar as tabulações.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function flattenTabulationTree(
  nodes: TabulationNodeApi[],
  depth = 0,
  prefix = "",
): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  for (const n of nodes) {
    const indent = "— ".repeat(depth);
    const path = prefix ? `${prefix} › ${n.name}` : n.name;
    out.push({ id: n.id, label: `${indent}${n.name}` });
    if (n.children.length > 0) {
      out.push(...flattenTabulationTree(n.children, depth + 1, path));
    }
  }
  return out;
}

export function TriggerTypeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (t: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="tc-type">Tipo de gatilho</Label>
      <DropdownGlass
        triggerClassName="w-full"
        value={value}
        searchable
        options={AUTOMATION_TRIGGER_TYPES.map((t) => ({
          value: t,
          label: triggerTypeLabel(t),
        }))}
        onValueChange={onChange}
      />
    </div>
  );
}
