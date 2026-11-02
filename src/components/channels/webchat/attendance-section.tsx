"use client";

/**
 * Seção "Atendimento de quem entra identificado" do painel Webchat: fila,
 * destino, responsável atual e alternativa. Vale só para quem o site confirmou
 * quem é. Id apagado não quebra nada: o backend cai na alternativa.
 * Contrato: `backend_crm1/docs/decisoes/webchat-widget.md` §9.12.
 */
import { useQuery } from "@tanstack/react-query";

import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select";

import {
  fetchAiAgentOptions,
  fetchDepartmentOptions,
  fetchUserOptions,
  type WebchatOption,
} from "./options";
import {
  isIncompleteRoutingTarget,
  type WebchatRoutingTarget,
  type WebchatRoutingTargetType,
  type WebchatV2SectionProps,
} from "./v2-config";

export type WebchatRoutingOptions = {
  user: WebchatOption[];
  department: WebchatOption[];
  ai_agent: WebchatOption[];
  loaded: boolean;
};

const TARGET_COPY: Record<
  Exclude<WebchatRoutingTargetType, "distribution">,
  { label: string; pick: string; empty: string }
> = {
  user: { label: "Uma pessoa", pick: "Qual pessoa", empty: "Escolha a pessoa" },
  department: { label: "Um departamento", pick: "Qual departamento", empty: "Escolha o departamento" },
  ai_agent: { label: "Um agente de IA", pick: "Qual agente de IA", empty: "Escolha o agente" },
};

/** Listas para escolher o destino. Falha = lista vazia, como nas outras seções. */
export function useWebchatRoutingOptions(): WebchatRoutingOptions {
  const opts = { staleTime: 60_000 };
  const users = useQuery({ queryKey: ["webchat-v2-options", "users"], queryFn: fetchUserOptions, ...opts });
  const departments = useQuery({
    queryKey: ["webchat-v2-options", "departments"],
    queryFn: fetchDepartmentOptions,
    ...opts,
  });
  const agents = useQuery({ queryKey: ["webchat-v2-options", "ai-agents"], queryFn: fetchAiAgentOptions, ...opts });
  return {
    user: users.data ?? [],
    department: departments.data ?? [],
    ai_agent: agents.data ?? [],
    loaded: users.isSuccess && departments.isSuccess && agents.isSuccess,
  };
}

export function WebchatRoutingTargetField({
  idPrefix,
  label,
  emptyLabel,
  value,
  options,
  onChange,
}: {
  idPrefix: string;
  label: string;
  /** Com ele, dá para não escolher nada (regra do S2S segue o canal). */
  emptyLabel?: string;
  value: WebchatRoutingTarget | undefined;
  options: WebchatRoutingOptions;
  onChange: (next: WebchatRoutingTarget | undefined) => void;
}) {
  const type = value?.type ?? (emptyLabel ? "" : "distribution");
  const copy = value && value.type !== "distribution" ? TARGET_COPY[value.type] : null;
  const list = value && value.type !== "distribution" ? options[value.type] : [];
  const missing = Boolean(value?.id && options.loaded && !list.some((o) => o.id === value.id));
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-type`} className="text-xs">
          {label}
        </Label>
        <SelectNative
          id={`${idPrefix}-type`}
          value={type}
          onChange={(e) => {
            const next = e.target.value;
            if (!next) onChange(undefined);
            else onChange({ type: next as WebchatRoutingTargetType });
          }}
        >
          {emptyLabel ? <option value="">{emptyLabel}</option> : null}
          <option value="distribution">Distribuição normal</option>
          <option value="user">{TARGET_COPY.user.label}</option>
          <option value="department">{TARGET_COPY.department.label}</option>
          <option value="ai_agent">{TARGET_COPY.ai_agent.label}</option>
        </SelectNative>
      </div>
      {copy && value ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-id`} className="text-xs">
            {copy.pick}
          </Label>
          <SelectNative
            id={`${idPrefix}-id`}
            value={value.id ?? ""}
            aria-invalid={isIncompleteRoutingTarget(value) || missing ? true : undefined}
            onChange={(e) => onChange({ type: value.type, id: e.target.value || undefined })}
          >
            <option value="">{copy.empty}</option>
            {list.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
            {missing ? <option value={value.id}>Removido. Vai para a alternativa</option> : null}
          </SelectNative>
          {isIncompleteRoutingTarget(value) ? (
            <p className="text-xs text-[var(--text-muted)]">Sem escolher, fica a distribuição normal.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function WebchatAttendanceSection({ value, onChange }: WebchatV2SectionProps) {
  const options = useWebchatRoutingOptions();
  const routing = value.routing;
  const setRouting = (p: Partial<typeof routing>) => onChange({ ...value, routing: { ...routing, ...p } });

  return (
    <section className="space-y-3" aria-labelledby="wc-attendance-title">
      <p
        id="wc-attendance-title"
        className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]"
      >
        Atendimento de quem entra identificado
      </p>
      <p className="text-xs text-[var(--text-muted)]">
        Vale só para quem o site confirmou quem é. Os demais visitantes seguem as regras de sempre.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="wc-routing-priority" className="text-xs">
          Fila
        </Label>
        <SelectNative
          id="wc-routing-priority"
          value={routing.priority}
          onChange={(e) => setRouting({ priority: e.target.value === "high" ? "high" : "standard" })}
          aria-describedby="wc-routing-priority-help"
        >
          <option value="standard">Normal</option>
          <option value="high">Prioritária</option>
        </SelectNative>
        <p id="wc-routing-priority-help" className="text-xs text-[var(--text-muted)]">
          {routing.priority === "high"
            ? "É atendida antes das outras e aparece no topo da lista, até a primeira resposta de uma pessoa ou o encerramento. Se não houver um destino escolhido, vai direto para a equipe, sem passar pela IA."
            : "Entra na ordem de sempre."}
        </p>
      </div>
      <WebchatRoutingTargetField
        idPrefix="wc-routing-destination"
        label="Para onde vai"
        value={routing.destination}
        options={options}
        onChange={(next) => setRouting({ destination: next ?? { type: "distribution" } })}
      />
      <label className="flex items-start gap-2 text-xs">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={routing.keepCurrentOwner}
          onChange={(e) => setRouting({ keepCurrentOwner: e.target.checked })}
        />
        <span>Se o contato já tem responsável disponível, manter com ele</span>
      </label>
      <div className="space-y-1.5">
        <WebchatRoutingTargetField
          idPrefix="wc-routing-fallback"
          label="Se não estiver disponível"
          value={routing.fallback}
          options={options}
          onChange={(next) => setRouting({ fallback: next ?? { type: "distribution" } })}
        />
        <p className="text-xs text-[var(--text-muted)]">
          Vale quando o destino está offline, fora do horário ou foi removido. Por último, a conversa
          sempre vai para a distribuição normal, ou fica na Entrada se a distribuição estiver desligada.
        </p>
      </div>
    </section>
  );
}
