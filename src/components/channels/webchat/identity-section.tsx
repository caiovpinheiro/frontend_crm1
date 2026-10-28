"use client";

/**
 * Seção "Identificação pelo site" (frente A) do painel Webchat: chave de
 * identidade (assina o `userHash`), campo do contato que guarda o
 * `externalId` do site e mapeamento atributo → campo personalizado.
 * Contrato: `backend_crm1/docs/decisoes/webchat-widget.md` §9.4/§9.7.
 */
import { IconPlus as Plus, IconX as X } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select";

import { WebchatSecretField } from "./secret-field";
import { fetchCustomFieldOptions } from "./options";
import { WEBCHAT_ATTRIBUTE_RE, type WebchatV2SectionProps } from "./v2-config";

export function WebchatIdentitySection({
  channelId,
  value,
  onChange,
  secrets,
  onSecretsChange,
}: WebchatV2SectionProps) {
  const { data: fields = [] } = useQuery({
    queryKey: ["webchat-v2-options", "custom-fields", "contact"],
    queryFn: () => fetchCustomFieldOptions("contact"),
    staleTime: 60_000,
  });
  const identity = value.identity;
  const setIdentity = (p: Partial<typeof identity>) => onChange({ ...value, identity: { ...identity, ...p } });
  const matchValue = identity.matchField.type === "customField" ? identity.matchField.customFieldId : "";

  return (
    <section className="space-y-3" aria-labelledby="wc-identity-title">
      <p
        id="wc-identity-title"
        className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]"
      >
        Identificação pelo site
      </p>
      <p className="text-xs text-[var(--text-muted)]">
        O site informa quem é o visitante logado com <code>identify</code> e uma assinatura
        (<code>userHash</code>) feita no servidor dele com esta chave. Sem assinatura válida, nada
        é ligado a um contato existente.
      </p>
      <WebchatSecretField
        channelId={channelId}
        kind="identity"
        label="Chave de identidade"
        status={secrets.identity}
        onRotated={onSecretsChange}
      />
      <div className="space-y-1.5">
        <Label htmlFor="wc-match-field" className="text-xs">
          Onde fica o identificador do site no contato
        </Label>
        <SelectNative
          id="wc-match-field"
          value={matchValue}
          onChange={(e) =>
            setIdentity({
              matchField: e.target.value
                ? { type: "customField", customFieldId: e.target.value }
                : { type: "externalId" },
            })
          }
        >
          <option value="">ID externo do contato</option>
          {fields.map((f) => (
            <option key={f.id} value={f.id}>
              Campo: {f.label}
            </option>
          ))}
        </SelectNative>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Atributos do site → campos do contato</Label>
        {identity.attributeMap.map((row, i) => (
          <div key={i} className="flex gap-2">
            <Input
              aria-label={`Atributo ${i + 1}`}
              placeholder="nome_do_atributo"
              value={row.attribute}
              aria-invalid={row.attribute !== "" && !WEBCHAT_ATTRIBUTE_RE.test(row.attribute)}
              className="font-mono text-xs"
              onChange={(e) => {
                const next = [...identity.attributeMap];
                next[i] = { ...row, attribute: e.target.value.trim() };
                setIdentity({ attributeMap: next });
              }}
            />
            <SelectNative
              aria-label={`Campo do atributo ${i + 1}`}
              value={row.customFieldId}
              onChange={(e) => {
                const next = [...identity.attributeMap];
                next[i] = { ...row, customFieldId: e.target.value };
                setIdentity({ attributeMap: next });
              }}
            >
              <option value="">Escolha o campo</option>
              {fields.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </SelectNative>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Remover atributo ${i + 1}`}
              onClick={() => setIdentity({ attributeMap: identity.attributeMap.filter((_, j) => j !== i) })}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() =>
            setIdentity({ attributeMap: [...identity.attributeMap, { attribute: "", customFieldId: "" }] })
          }
        >
          <Plus className="size-3.5" />
          Adicionar atributo
        </Button>
        <p className="text-xs text-[var(--text-muted)]">Atributo sem campo escolhido é ignorado.</p>
      </div>
    </section>
  );
}
