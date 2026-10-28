"use client";

/**
 * Seção "Servidor a servidor" (frente C) do painel Webchat: chave S2S,
 * endereço de entrada, etiqueta da fila, URL de callback, campo do negócio
 * que recebe o `ref` e regras de category/priority.
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
          placeholder="https://…"
          value={s2s.callbackUrl ?? ""}
          onChange={(e) => setS2S({ callbackUrl: e.target.value.trim() || null })}
        />
        <p className="text-xs text-[var(--text-muted)]">Opcional. Só https; assinada com a mesma chave.</p>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Regras por categoria / prioridade</Label>
        {s2s.rules.map((rule, i) => (
          <div key={i} className="grid gap-2 rounded-[var(--radius-md)] border border-[var(--glass-border)] p-2 sm:grid-cols-2">
            <Input
              aria-label={`Categoria da regra ${i + 1}`}
              placeholder="categoria (opcional)"
              value={rule.category ?? ""}
              onChange={(e) => setRule(i, { category: e.target.value })}
            />
            <Input
              aria-label={`Prioridade da regra ${i + 1}`}
              placeholder="prioridade (opcional)"
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
    </section>
  );
}
