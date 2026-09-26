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
        <p className="px-2 py-1.5 text-xs text-muted-foreground">
          Traz toda a configuração com os nomes, e no topo os pontos de atenção (gaps) encontrados.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
