"use client";

/**
 * Seção "Servidor a servidor" (frente C) do painel Webchat: chave S2S,
 * endereço de entrada, etiqueta da fila, URL de callback, campo do negócio
 * que recebe o `ref` e regras de category/priority. Avisa na hora o que o
 * backend recusaria (URL de retorno sem https) ou o salvamento descartaria
 * (regra sem critério ou sem ação), e resume o contrato para quem integra.
 * Contrato: `backend_crm1/docs/decisoes/webchat-widget.md` §9.6/§9.7.
 */
import { IconPlus as Plus, IconX as X } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select";

import { fetchCustomFieldOptions, fetchDepartmentOptions, fetchTagOptions } from "./options";
import { WebchatSecretField } from "./secret-field";
import type { WebchatRoutingRule, WebchatV2SectionProps } from "./v2-config";

export type WebchatS2SSectionProps = WebchatV2SectionProps & {
  /** Origem pública (`https://bwipo.com`) para mostrar o endereço de entrada. */
  publicOrigin: string;
};

/** Mesmo teto do backend (`s2s.rules[].category/priority`). */
const RULE_VALUE_MAX = 64;
const CALLBACK_URL_MAX = 2000;

/** Motivo para a URL de retorno não ser aceita pelo backend (ou `null`). */
export function callbackUrlProblem(raw: string | null): string | null {
  const v = raw?.trim();
  if (!v) return null;
  if (v.length > CALLBACK_URL_MAX) return `No máximo ${CALLBACK_URL_MAX} caracteres.`;
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return "Endereço inválido.";
  }
  if (url.protocol !== "https:") return "Use https://.";
  if (url.username || url.password) return "Sem usuário/senha no endereço.";
  return null;
}

/** Regra que o salvamento descartaria (sem critério ou sem ação). */
export function isIncompleteRule(rule: WebchatRoutingRule): boolean {
  const hasCriterion = Boolean(rule.category?.trim() || rule.priority?.trim());
  const hasAction = Boolean(rule.tagId || rule.departmentId || rule.pinNote);
  return !hasCriterion || !hasAction;
}

const code = "rounded bg-[var(--glass-bg-strong)] px-1 font-mono";

export function WebchatS2SSection({
  channelId,
  publicKey,
  publicOrigin,
  value,
  onChange,
  secrets,
  onSecretsChange,
}: WebchatS2SSectionProps) {
  const opts = { staleTime: 60_000 };
  const { data: tags = [] } = useQuery({ queryKey: ["webchat-v2-options", "tags"], queryFn: fetchTagOptions, ...opts });
  const { data: departments = [] } = useQuery({
    queryKey: ["webchat-v2-options", "departments"],
    queryFn: fetchDepartmentOptions,
    ...opts,
  });
  const { data: dealFields = [] } = useQuery({
    queryKey: ["webchat-v2-options", "custom-fields", "deal"],
    queryFn: () => fetchCustomFieldOptions("deal"),
    ...opts,
  });
  const s2s = value.s2s;
  const setS2S = (p: Partial<typeof s2s>) => onChange({ ...value, s2s: { ...s2s, ...p } });
  const setRule = (i: number, p: Partial<WebchatRoutingRule>) => {
    const rules = [...s2s.rules];
    const next: WebchatRoutingRule = { ...rules[i], ...p };
    for (const k of Object.keys(next) as (keyof WebchatRoutingRule)[]) {
      if (next[k] === "" || next[k] === undefined || next[k] === false) delete next[k];
    }
    rules[i] = next;
    setS2S({ rules });
  };
  const endpoint = publicKey ? `${publicOrigin}/api/public/webchat/s2s/${publicKey}` : null;
  const callbackError = callbackUrlProblem(s2s.callbackUrl);

  return (
    <section className="space-y-3" aria-labelledby="wc-s2s-title">
      <p id="wc-s2s-title" className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        Servidor a servidor
      </p>
      <p className="text-xs text-[var(--text-muted)]">
        O sistema do site avisa o CRM direto do servidor (vale mesmo se a página fechar), com
        assinatura feita com esta chave.
      </p>
      <WebchatSecretField
        channelId={channelId}
        kind="s2s"
        label="Chave servidor a servidor"
        status={secrets.s2s}
        onRotated={onSecretsChange}
      />
      {endpoint ? (
        <div className="space-y-1.5">
          <Label htmlFor="wc-s2s-endpoint" className="text-xs">
            Endereço de entrada (POST)
          </Label>
          <Input id="wc-s2s-endpoint" readOnly value={endpoint} className="font-mono text-xs" />
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="wc-s2s-tag" className="text-xs">
            Etiqueta ao abrir conversa nova
          </Label>
          <SelectNative
            id="wc-s2s-tag"
            value={s2s.queueTagId ?? ""}
            onChange={(e) => setS2S({ queueTagId: e.target.value || null })}
          >
            <option value="">Nenhuma</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </SelectNative>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wc-ref-field" className="text-xs">
            Campo do negócio que recebe o ref
          </Label>
          <SelectNative
            id="wc-ref-field"
            value={value.refDealCustomFieldId ?? ""}
            onChange={(e) => onChange({ ...value, refDealCustomFieldId: e.target.value || null })}
          >
            <option value="">Não copiar</option>
            {dealFields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </SelectNative>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="wc-s2s-callback" className="text-xs">
          URL de retorno (atendido / resolvido)
        </Label>
        <Input
          id="wc-s2s-callback"
          type="url"
          inputMode="url"
          placeholder="https://…"
          maxLength={CALLBACK_URL_MAX}
          aria-invalid={callbackError ? true : undefined}
          aria-describedby="wc-s2s-callback-help"
          value={s2s.callbackUrl ?? ""}
          onChange={(e) => setS2S({ callbackUrl: e.target.value.trim() || null })}
        />
        {callbackError ? (
          <p id="wc-s2s-callback-help" className="text-xs text-[var(--color-danger-text)]" role="alert">
            {callbackError}
          </p>
        ) : (
          <p id="wc-s2s-callback-help" className="text-xs text-[var(--text-muted)]">
            Opcional. Só https público; o CRM avisa quando a conversa é atendida e quando é
            resolvida, assinando com a mesma chave.
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Regras por categoria / prioridade</Label>
        <p className="text-xs text-[var(--text-muted)]">
          Valores livres que o site manda em <code className={code}>category</code> e{" "}
          <code className={code}>priority</code> (sem diferença de maiúsculas). A regra vale quando
          todos os critérios preenchidos batem; várias regras podem valer juntas.
        </p>
        {s2s.rules.map((rule, i) => (
          <div key={i} className="grid gap-2 rounded-[var(--radius-md)] border border-[var(--glass-border)] p-2 sm:grid-cols-2">
            <Input
              aria-label={`Categoria da regra ${i + 1}`}
              placeholder="categoria (opcional)"
              maxLength={RULE_VALUE_MAX}
              value={rule.category ?? ""}
              onChange={(e) => setRule(i, { category: e.target.value })}
            />
            <Input
              aria-label={`Prioridade da regra ${i + 1}`}
              placeholder="prioridade (opcional)"
              maxLength={RULE_VALUE_MAX}
              value={rule.priority ?? ""}
              onChange={(e) => setRule(i, { priority: e.target.value })}
            />
            <SelectNative
              aria-label={`Etiqueta da regra ${i + 1}`}
              value={rule.tagId ?? ""}
              onChange={(e) => setRule(i, { tagId: e.target.value })}
            >
              <option value="">Sem etiqueta</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </SelectNative>
            <SelectNative
              aria-label={`Departamento da regra ${i + 1}`}
              value={rule.departmentId ?? ""}
              onChange={(e) => setRule(i, { departmentId: e.target.value })}
            >
              <option value="">Sem departamento</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </SelectNative>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={rule.pinNote === true}
                onChange={(e) => setRule(i, { pinNote: e.target.checked })}
              />
              Fixar a nota no topo da conversa
            </label>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remover regra ${i + 1}`}
                onClick={() => setS2S({ rules: s2s.rules.filter((_, j) => j !== i) })}
              >
                <X className="size-3.5" />
              </Button>
            </div>
            {isIncompleteRule(rule) ? (
              <p className="text-xs text-[var(--text-muted)] sm:col-span-2">
                Incompleta: informe categoria e/ou prioridade e escolha ao menos uma ação. Regra
                incompleta não é salva.
              </p>
            ) : null}
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => setS2S({ rules: [...s2s.rules, {}] })}
        >
          <Plus className="size-3.5" />
          Adicionar regra
        </Button>
      </div>
      <details className="rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-3 py-2 text-xs">
        <summary className="cursor-pointer font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          Como integrar
        </summary>
        <div className="mt-2 space-y-2 text-[var(--text-muted)]">
          <p>
            Cabeçalhos: <code className={code}>X-Timestamp</code> (segundos Unix, até 5 min de
            diferença), <code className={code}>X-Signature</code> ={" "}
            <code className={code}>sha256=</code> + HMAC-SHA256 da chave sobre{" "}
            <code className={code}>timestamp + &quot;.&quot; + corpo</code> em hex, e{" "}
            <code className={code}>Idempotency-Key</code> (a mesma chave com o mesmo corpo não
            duplica nada por 24 h).
          </p>
          <p>
            Corpo (JSON, até 32 KB): <code className={code}>external_id</code> (obrigatório),{" "}
            <code className={code}>ref</code>, <code className={code}>category</code>,{" "}
            <code className={code}>priority</code>, <code className={code}>text</code> (vira nota
            interna), <code className={code}>fields</code> (contexto do site) e{" "}
            <code className={code}>links</code> (até 5 <code className={code}>{"{ label, url }"}</code>{" "}
            https, listados na nota). Informe <code className={code}>text</code> ou{" "}
            <code className={code}>fields</code>.
          </p>
          <p>
            Resposta: <code className={code}>{"{ conversation_id, url }"}</code>. Sem conversa
            aberta, o CRM abre uma na fila deste canal com a etiqueta escolhida acima.
          </p>
          <p>
            Retorno: <code className={code}>POST</code> com os mesmos cabeçalhos assinados e{" "}
            <code className={code}>{"{ ref, status, conversation_id }"}</code>, status{" "}
            <code className={code}>attended</code> ou <code className={code}>resolved</code>, uma vez
            por <code className={code}>ref</code>.
          </p>
        </div>
      </details>
    </section>
  );
}
