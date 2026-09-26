"use client";

/**
 * "Exportar regras": ficha do agente (Markdown) com toda a configuração e os
 * pontos de atenção, para revisar com a equipe ou colar numa IA e analisar
 * gaps. JSON para análise técnica.
 */

import * as React from "react";
import { toast } from "sonner";
import { IconDownload, IconLoader2 } from "@tabler/icons-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiFetch, parseApiResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

type Choice = { version: "published" | "draft"; format: "md" | "json"; label: string; hint: string };

const CHOICES: Choice[] = [
  { version: "published", format: "md", label: "Versão publicada", hint: "A que atende no WhatsApp (.md)" },
  { version: "draft", format: "md", label: "Rascunho", hint: "Com as mudanças ainda não publicadas (.md)" },
  { version: "published", format: "json", label: "Configuração técnica", hint: "Versão publicada em JSON" },
];

/** Prompt para colar numa IA junto da ficha (e do CSV do relatório de ações). */
const ANALYSIS_PROMPT = `Você vai revisar a configuração de um agente de atendimento por WhatsApp.
Anexos:
1) FICHA: as regras do agente exportadas (Markdown). A seção "Como o motor decide" explica a ordem em que as regras valem.
2) CSV: o relatório de ações do mesmo agente (uma linha por ação, com a mensagem do cliente, a ação, a situação, o detalhe, o assunto, o atalho, a decisão do modelo e os passos do agente).
3) (opcional) COMPARAR: pontos em que a resposta do agente foi comparada com a de uma pessoa da equipe.

Tarefa: liste os gaps de configuração — o que na FICHA explica um comportamento ruim no CSV/COMPARAR, ou o que está configurado de um jeito que nunca terá efeito.

Regras:
- Use só o que está nos anexos; não invente regras do produto. Se precisar supor, diga "suposição".
- Ignore linhas do CSV com Origem = Teste, salvo se eu pedir.
- Para cada gap, responda neste formato:
  Gap: (uma frase)
  Evidência no CSV: (conversa, data/hora, ação, detalhe ou trecho dos passos)
  Onde está na ficha: (seção e item; use o id do assunto/atalho quando existir)
  Efeito no cliente: (o que ele recebeu ou deixou de receber)
  Correção sugerida: (o que mudar na tela, em linguagem simples)
  Gravidade: alta / média / baixa (alta = cliente sem resposta, resposta errada ou transferência indevida; média = comportamento diferente do esperado; baixa = polimento)
- Agrupe por seção da ficha. Comece pelos gaps com mais ocorrências no CSV. Termine com as perguntas que só a equipe pode responder.
- Cruzamentos que valem a pena: transferência por "citava algo sem fonte" ou "sem material" → assunto sem material ou instruções com valores; transferência por atalho em mensagens que não pediam pessoa → palavra-chave solta; ação barrada (etiqueta, etapa) → ação liberada sem opções; assunto vazio em muitas linhas → gatilhos/exemplos faltando; "não respondeu" → limites, fila ou números de teste.`;

function fileNameFrom(res: Response, fallback: string): string {
  const cd = res.headers.get("content-disposition") ?? "";
  return /filename="([^"]+)"/.exec(cd)?.[1] ?? fallback;
}

export function RulesExportMenu({ agentId }: { agentId: string }) {
  const [busy, setBusy] = React.useState(false);

  const download = async (c: Choice) => {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/ai-agents-v2/${agentId}/export?version=${c.version}&format=${c.format}`);
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !(type.includes("markdown") || (c.format === "json" && type.includes("json") && res.headers.get("content-disposition")))) {
        await parseApiResponse(res, "Erro ao exportar.");
        throw new Error("Erro ao exportar.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileNameFrom(res, `regras-do-agente.${c.format}`);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao exportar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex h-9 items-center gap-1 rounded-md px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50",
        )}
        aria-label="Exportar regras"
        title="Exportar as regras do agente para revisar gaps"
      >
        {busy ? <IconLoader2 className="size-4 animate-spin" /> : <IconDownload className="size-4" />}
        <span className="hidden sm:inline">Exportar regras</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(300px,calc(100vw-2rem))]">
        <DropdownMenuLabel>Exportar regras</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {CHOICES.map((c) => (
          <DropdownMenuItem key={`${c.version}-${c.format}`} onClick={() => !busy && void download(c)} className="flex flex-col items-start gap-0.5">
            <span className="text-sm font-medium">{c.label}</span>
            <span className="text-xs text-muted-foreground">{c.hint}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            void navigator.clipboard
              .writeText(ANALYSIS_PROMPT)
              .then(() => toast.success("Prompt copiado. Cole numa IA junto da ficha e do CSV do relatório de ações."))
              .catch(() => toast.error("Não foi possível copiar."));
          }}
          className="flex flex-col items-start gap-0.5"
        >
          <span className="text-sm font-medium">Copiar prompt para IA</span>
          <span className="text-xs text-muted-foreground">Para achar gaps cruzando a ficha com o relatório de ações</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-xs text-muted-foreground">
          Traz toda a configuração com os nomes, e no topo os pontos de atenção (gaps) encontrados.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
