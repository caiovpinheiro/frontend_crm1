"use client";

/**
 * Quais ferramentas este agente pode ter.
 *
 * A lista é do backend, não do frontend: o núcleo tem as ferramentas que
 * servem a qualquer ramo, e o pack do tenant pode acrescentar as do produto
 * dele. Enquanto a tela usava só a constante local, todo tenant via uma
 * ferramenta de outro produto e ligá-la não fazia nada — o runtime dele nem
 * a construía.
 *
 * `TOOLS_CATALOG` continua como valor inicial para a tela abrir preenchida
 * e para o caso de a busca falhar: o núcleo é igual em todo tenant, então
 * mostrá-lo antes da resposta não engana ninguém.
 */
import { useQuery } from "@tanstack/react-query";

import { apiUrl } from "@/lib/api";
import { TOOLS_CATALOG, type ToolDescriptor } from "@/lib/ai-agents/tools-catalog";

export function useToolCatalog(agentId: string | null): {
  tools: ToolDescriptor[];
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery({
    queryKey: ["ai-agent-tools", agentId],
    queryFn: async (): Promise<ToolDescriptor[]> => {
      const res = await fetch(
        apiUrl(
          agentId
            ? `/api/ai-agents/tools?agentId=${encodeURIComponent(agentId)}`
            : "/api/ai-agents/tools",
        ),
      );
      if (!res.ok) throw new Error("Erro ao carregar as ferramentas.");
      const json = (await res.json()) as { tools?: unknown };
      return Array.isArray(json.tools)
        ? (json.tools as ToolDescriptor[])
        : TOOLS_CATALOG;
    },
    staleTime: 5 * 60_000,
  });

  return { tools: data ?? TOOLS_CATALOG, isLoading };
}
