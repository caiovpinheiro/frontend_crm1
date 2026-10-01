"use client";

import { apiUrl } from "@/lib/api";
/**
 * Painel de configuração da política de apresentação de produtos.
 *
 * Aparece quando a tool `search_products` está habilitada. Mostra ao
 * admin todos os campos disponíveis (fixos + custom fields do Product)
 * e oferece um textarea livre pra escrever as regras que o agente
 * deve seguir ao apresentar produtos.
 *
 * O botão "Gerar a partir dos selecionados" produz um template com
 * estrutura recomendada, que o admin pode ajustar manualmente — assim
 * o admin não precisa começar do zero nem memorizar os nomes dos
 * campos personalizados.
 */

import { useQuery } from "@tanstack/react-query";
import { IconPackage as Package, IconSparkles as Sparkles, IconInfoCircle as Info, IconLoader2 as Loader2 } from "@tabler/icons-react";
import * as React from "react";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { TooltipGlass } from "@/components/crm/tooltip-glass";

type FieldBuiltin = {
  source: "builtin";
  name: string;
  label: string;
  description: string;
};
type FieldCustom = {
  source: "custom";
  name: string;
  label: string;
  type: string;
  description: string;
};
type ProductField = FieldBuiltin | FieldCustom;

type ProductFieldsResponse = {
  builtin: FieldBuiltin[];
  custom: FieldCustom[];
};

async function fetchProductFields(): Promise<ProductFieldsResponse> {
  const res = await fetch(apiUrl("/api/ai-agents/product-fields"));
  if (!res.ok) throw new Error("Erro ao carregar campos.");
  return res.json();
}

type Props = {
  value: string;
  onChange: (v: string) => void;
  /// Quando falso, mostra um aviso amarelo avisando que a tool não
  /// está habilitada e a política será ignorada.
  enabled: boolean;
  /// Para aninhar dentro de containers diferentes (wizard vs. dialog).
  compact?: boolean;
};

const EXAMPLES: { label: string; content: string }[] = [
  {
    label: "Apresentação padrão",
    content: `- Apresente o produto com: nome, preço em BRL e uma linha curta sobre o benefício principal.
- Inclua a duração/modalidade quando disponível.
- Finalize convidando para agendar uma conversa com um consultor humano via transfer_to_human.
- Nunca mencione desconto ou condição especial — só o preço oficial retornado pela busca.`,
  },
  {
    label: "Consultivo (educacional)",
    content: `- Comece resumindo em UMA frase o que o curso forma ("Você sai preparado para...").
- Mostre: nome completo, modalidade, duração, investimento (preço).
- Se houver mais de um resultado similar (ex.: EAD e presencial), apresente as duas opções lado a lado em lista.
- Termine perguntando qual dúvida o aluno ainda tem antes de oferecer handoff.`,
  },
  {
    label: "Comparativo curto",
    content: `- Quando o lead perguntar "qual é o melhor", nunca diga — apresente objetivamente os 2-3 itens mais relevantes em bullet points.
- Para cada item: nome | preço | 1 benefício chave.
- Ao final, pergunte: "Qual desses faz mais sentido pro seu objetivo?".`,
  },
];

export function ProductPolicyPanel({
  value,
  onChange,
  enabled,
  compact = false,
}: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["ai-product-fields"],
    queryFn: fetchProductFields,
    staleTime: 5 * 60_000,
  });

  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const allFields: ProductField[] = React.useMemo(() => {
    if (!data) return [];
    return [...data.builtin, ...data.custom];
  }, [data]);

  const toggleField = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const generateFromSelected = () => {
    if (!data) return;
    const picked = allFields.filter((f) => selected.has(f.name));
    if (picked.length === 0) return;

    const bulletLines = picked.map((f) => {
      if (f.source === "custom") {
        return `- ${f.label}: cite o valor do campo personalizado "${f.name}" (tipo ${f.type}).`;
      }
      switch (f.name) {
        case "priceFormatted":
          return `- Preço: use o valor em BRL retornado pela busca (campo \`priceFormatted\`). Nunca arredonde nem negocie.`;
        case "name":
          return `- Nome: sempre comece a apresentação com o nome oficial.`;
        case "description":
          return `- Descrição: extraia 1 frase curta da descrição para destacar o benefício.`;
        case "sku":
          return `- SKU/código: cite apenas se o cliente perguntar pelo código.`;
        case "unit":
          return `- Unidade: mencione a unidade (${f.label}) quando relevante para o contexto.`;
        case "type":
          return `- Tipo: não exponha o campo tipo ao cliente; use só internamente.`;
        default:
          return `- ${f.label}: use ao apresentar.`;
      }
    });

    const template = [
      "## Como apresentar produtos",
      ...bulletLines,
      "",
      "## Regras gerais",
      "- Nunca invente dados que não vieram da tool search_products.",
      "- Se a busca não retornar nada, ofereça transferir para um humano.",
    ].join("\n");

    onChange(template);
  };

  const applyExample = (example: string) => {
    onChange(example);
  };

  const insertField = (label: string) => {
    const snippet = `- ${label}: `;
    const next = value ? `${value.replace(/\s+$/, "")}\n${snippet}` : snippet;
    onChange(next);
  };

  return (
    <div className={cn("space-y-4", compact ? "" : "rounded-xl border bg-muted/10 p-4")}>
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-info-bg)] text-[var(--brand-primary)] dark:bg-indigo-950 dark:text-[var(--color-brand-primary)]">
          <Package className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold">Política de apresentação de produtos</h4>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Essas instruções são injetadas no prompt somente quando a tool{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
              search_products
            </code>{" "}
            está ativa. O agente segue estas regras ao mostrar qualquer item do catálogo.
          </p>
        </div>
      </div>

      {!enabled && (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--color-warning)]/70 bg-[var(--color-warn-bg)]/60 p-3 text-[12px] text-[var(--color-warn-text)] dark:border-amber-700/60 dark:bg-amber-950/20 dark:text-[var(--color-warning)]/70">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p>
            A tool <strong>Consultar catálogo de produtos</strong> não está selecionada
            nas ferramentas deste agente. As instruções abaixo ficam salvas, mas o
            agente não vai poder consultar o catálogo até a tool ser habilitada.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-[12px] font-medium text-muted-foreground">
            Campos disponíveis
          </Label>
          <span className="text-[10px] text-muted-foreground">
            Clique para incluir no rascunho abaixo
          </span>
        </div>
        {isLoading ? (
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Carregando campos...
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {allFields.map((f) => {
              const isSel = selected.has(f.name);
              const btn = (
                <button
                  key={`${f.source}-${f.name}`}
                  type="button"
                  onClick={() => {
                    toggleField(f.name);
                    insertField(f.label);
                  }}
                  className={cn(
                    "group flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                    isSel
                      ? "border-[var(--color-brand-primary)] bg-[var(--color-info-bg)] text-indigo-900 dark:border-indigo-400 dark:bg-indigo-950/40 dark:text-indigo-100"
                      : "border-border bg-background text-muted-foreground hover:bg-muted/60",
                  )}
                >
                  <span className="font-medium">{f.label}</span>
                  {f.source === "custom" && (
                    <span className="rounded-full bg-[var(--color-lavender-soft)] px-1.5 py-0.5 text-[9px] font-semibold uppercase text-[var(--color-purple-text)] dark:bg-purple-950 dark:text-purple-300">
                      custom
                    </span>
                  )}
                </button>
              );
              return f.description ? (
                <TooltipGlass key={`${f.source}-${f.name}`} label={f.description} side="top">{btn}</TooltipGlass>
              ) : btn;
            })}
            {allFields.length === 0 && (
              <p className="text-[12px] text-muted-foreground">
                Nenhum campo disponível. Cadastre produtos em{" "}
                <code>/products</code> primeiro.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={generateFromSelected}
          disabled={selected.size === 0}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors",
            selected.size === 0
              ? "cursor-not-allowed border-border text-muted-foreground/60"
              : "border-[var(--color-brand-primary)] bg-[var(--color-info-bg)] text-[var(--brand-primary)] hover:bg-[var(--color-primary-soft)] dark:border-indigo-400 dark:bg-indigo-950/40 dark:text-indigo-200",
          )}
        >
          <Sparkles className="size-3.5" />
          Gerar a partir dos selecionados
        </button>
        <span className="text-[10px] text-muted-foreground">ou comece de um exemplo:</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            type="button"
            onClick={() => applyExample(ex.content)}
            className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted/60"
          >
            {ex.label}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="product-policy" className="text-[12px] font-medium">
          Instruções ao agente
        </Label>
        <Textarea
          id="product-policy"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={compact ? 6 : 8}
          placeholder={`Ex.:
- Apresente sempre o nome completo e o preço.
- Inclua modalidade e duração quando disponível.
- Nunca prometa desconto.
- Ao final, pergunte se o lead quer falar com um consultor.`}
          className="w-full resize-y"
        />
        <p className="text-[10px] text-muted-foreground">
          Máximo recomendado: ~800 caracteres. Quanto mais conciso, melhor o agente segue.
        </p>
      </div>
    </div>
  );
}
