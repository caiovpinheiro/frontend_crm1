"use client";

/**
 * Seção "Identificação pelo site" (frente A) do painel Webchat: chave de
 * identidade (assina o `userHash`), campo do contato ou do negócio que guarda
 * o `externalId` do site e mapeamento atributo → campo personalizado.
 * Contrato: `backend_crm1/docs/decisoes/webchat-widget.md` §9.4/§9.7/§9.12.
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

/** Valor do campo de negócio no seletor; o de contato segue sendo o id puro. */
const DEAL_FIELD_PREFIX = "deal:";

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
  const { data: dealFields = [] } = useQuery({
    queryKey: ["webchat-v2-options", "custom-fields", "deal"],
    queryFn: () => fetchCustomFieldOptions("deal"),
    staleTime: 60_000,
  });
  const identity = value.identity;
  const setIdentity = (p: Partial<typeof identity>) => onChange({ ...value, identity: { ...identity, ...p } });
  const matchField = identity.matchField;
  const matchValue =
    matchField.type === "customField"
      ? matchField.customFieldId
      : matchField.type === "dealCustomField"
        ? `${DEAL_FIELD_PREFIX}${matchField.customFieldId}`
        : "";
  const dealFieldMissing =
    matchField.type === "dealCustomField" &&
    dealFields.length > 0 &&
    !dealFields.some((f) => f.id === matchField.customFieldId);
  const attributeCount = new Map<string, number>();
  for (const row of identity.attributeMap) {
    if (row.attribute) attributeCount.set(row.attribute, (attributeCount.get(row.attribute) ?? 0) + 1);
  }

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
      <div className="space-y-1 rounded-md bg-[var(--glass-bg-subtle)] p-2 text-xs text-[var(--text-muted)]">
        <p>
          No servidor do site: <code>userHash = hex(HMAC-SHA256(chave, externalId))</code>. A chave
          nunca vai para o navegador.
        </p>
        <p>
          Na página: <code>BwipoWebchat.identify({"{ externalId, userHash, name, email, phone, attributes }"})</code>
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="wc-match-field" className="text-xs">
          Onde fica o identificador do site
        </Label>
        <SelectNative
          id="wc-match-field"
          value={matchValue}
          aria-describedby="wc-match-field-help"
          onChange={(e) => {
            const v = e.target.value;
            if (v.startsWith(DEAL_FIELD_PREFIX)) {
              setIdentity({
                matchField: {
                  type: "dealCustomField",
                  customFieldId: v.slice(DEAL_FIELD_PREFIX.length),
                  normalize: matchField.type === "dealCustomField" ? matchField.normalize : "none",
                },
              });
              return;
            }
            setIdentity({
              matchField: v ? { type: "customField", customFieldId: v } : { type: "externalId" },
            });
          }}
        >
          <option value="">ID externo do contato</option>
          {fields.length > 0 ? (
            <optgroup label="Campos do contato">
              {fields.map((f) => (
                <option key={f.id} value={f.id}>
                  Campo: {f.label}
                </option>
              ))}
            </optgroup>
          ) : null}
          {dealFields.length > 0 ? (
            <optgroup label="Campos do negócio">
              {dealFields.map((f) => (
                <option key={f.id} value={`${DEAL_FIELD_PREFIX}${f.id}`}>
                  Negócio: {f.label}
                </option>
              ))}
            </optgroup>
          ) : null}
          {dealFieldMissing ? <option value={matchValue}>Campo de negócio removido</option> : null}
        </SelectNative>
        {matchField.type === "dealCustomField" ? (
          <p id="wc-match-field-help" className="text-xs text-[var(--text-muted)]">
            Quem chega identificado entra no contato do negócio que tem esse valor, sem criar outro.
            Se esse contato já estiver ligado a outro valor, como dois identificadores no mesmo
            telefone, o visitante fica em um contato próprio e uma nota interna avisa a equipe.
          </p>
        ) : null}
      </div>
      {matchField.type === "dealCustomField" ? (
        <div className="space-y-1.5">
          <Label htmlFor="wc-match-normalize" className="text-xs">
            Como comparar o valor
          </Label>
          <SelectNative
            id="wc-match-normalize"
            value={matchField.normalize}
            onChange={(e) =>
              setIdentity({
                matchField: {
                  ...matchField,
                  normalize: e.target.value === "digits" ? "digits" : "none",
                },
              })
            }
          >
            <option value="none">Exatamente como está escrito</option>
            <option value="digits">Só os números (ignora pontos, traços e letras)</option>
          </SelectNative>
        </div>
      ) : null}
      <div className="space-y-1.5">
        <Label className="text-xs">Atributos do site → campos do contato</Label>
        {identity.attributeMap.map((row, i) => (
          <div key={i} className="flex gap-2">
            <Input
              aria-label={`Atributo ${i + 1}`}
              placeholder="nome_do_atributo"
              value={row.attribute}
              aria-invalid={
                row.attribute !== "" &&
                (!WEBCHAT_ATTRIBUTE_RE.test(row.attribute) || (attributeCount.get(row.attribute) ?? 0) > 1)
              }
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
        <p className="text-xs text-[var(--text-muted)]">
          Atributo sem campo escolhido é ignorado. Cada atributo aparece uma vez só.
        </p>
      </div>
    </section>
  );
}
