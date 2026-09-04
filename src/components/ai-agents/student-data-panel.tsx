"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconDatabase as Database,
  IconLoader2 as Loader2,
  IconSearch as Search,
  IconTrash as Trash,
  IconUpload as Upload,
} from "@tabler/icons-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiUrl, parseApiResponse } from "@/lib/api";

type ImportHistory = {
  id: string;
  fileName: string | null;
  totalRows: number;
  importedAt: string;
};

type AcademicStatus = {
  count: number;
  history: ImportHistory[];
};

async function fetchStatus(): Promise<AcademicStatus> {
  const res = await fetch(apiUrl("/api/academic-records"));
  if (!res.ok) throw new Error("Erro ao carregar status dos dados.");
  return res.json();
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function StudentDataPanel() {
  const queryClient = useQueryClient();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [lookupValue, setLookupValue] = React.useState("");
  const [lookupResult, setLookupResult] = React.useState<string | null>(null);
  const [looking, setLooking] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["academic-records-status"],
    queryFn: fetchStatus,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(apiUrl("/api/academic-records/upload"), {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (res.status === 202) {
        return parseApiResponse<{
          operationId: string;
          total: number;
          fileName: string;
        }>(res, "Erro ao enfileirar importação.");
      }
      return parseApiResponse<{ totalRows: number; skipped: number; fileName: string }>(
        res,
        "Erro ao enviar arquivo.",
      );
    },
    onSuccess: (d) => {
      if ("operationId" in d && d.operationId) {
        toast.success(
          `Importação enfileirada (${d.total} linhas). Acompanhe o progresso — a base será atualizada em breve.`,
        );
      } else if ("totalRows" in d) {
        toast.success(
          `Importado: ${d.totalRows} registros${d.skipped ? ` (${d.skipped} linhas ignoradas)` : ""}.`,
        );
      }
      queryClient.invalidateQueries({ queryKey: ["academic-records-status"] });
      // Revalida de novo após o worker processar (best-effort).
      window.setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["academic-records-status"] });
      }, 8_000);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Erro ao importar.");
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(apiUrl("/api/academic-records"), {
        method: "DELETE",
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message ?? "Erro ao limpar a base.");
      return d as { deleted: number };
    },
    onSuccess: (d) => {
      toast.success(`Base limpa: ${d.deleted} registros removidos.`);
      queryClient.invalidateQueries({ queryKey: ["academic-records-status"] });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Erro ao limpar a base.");
    },
  });

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
    if (inputRef.current) inputRef.current.value = "";
  };

  const runLookup = async () => {
    const v = lookupValue.trim();
    if (!v) return;
    setLooking(true);
    setLookupResult(null);
    try {
      const isEmail = v.includes("@");
      const isCpf = /^\d{11}$/.test(v.replace(/\D/g, "")) && !/[a-zA-Z]/.test(v);
      const param = isEmail ? "email" : isCpf ? "cpf" : "phone";
      const res = await fetch(
        apiUrl(`/api/academic-records/lookup?${param}=${encodeURIComponent(v)}`),
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLookupResult(d.message ?? "Erro na consulta.");
        return;
      }
      if (!d.found) {
        setLookupResult("Nenhuma matrícula encontrada.");
        return;
      }
      const first = d.records[0];
      setLookupResult(
        `${first.nome} — ${d.found} matrícula(s). Ex.: ${first.curso ?? "?"} / ${first.polo ?? "?"} / ${first.situacao ?? "?"}`,
      );
    } catch {
      setLookupResult("Erro de rede na consulta.");
    } finally {
      setLooking(false);
    }
  };

  const lastImport = data?.history?.[0];

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-indigo-soft)] text-[var(--color-brand-primary)] dark:bg-indigo-950">
            <Database className="size-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Dados dos alunos (matriculados)</h3>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Suba o relatório de matriculados (Excel/CSV). O agente usa esses
              dados como <b>contexto interno</b> (curso, polo, situação) para
              atender e rotear melhor, casando por telefone/e-mail/CPF do
              contato. Por segurança, o agente <b>não divulga</b> dados pessoais
              ao aluno — se ele pedir informação específica, é transferido para
              um consultor. Cada upload substitui a base anterior.
            </p>
            {isLoading ? (
              <p className="mt-2 text-[12px] text-muted-foreground">Carregando…</p>
            ) : (
              <p className="mt-2 text-[12px] text-muted-foreground">
                <b>{data?.count ?? 0}</b> registros na base
                {lastImport
                  ? ` · último envio: ${fmtDate(lastImport.importedAt)} (${lastImport.fileName ?? "arquivo"})`
                  : " · nenhum envio ainda"}
                .
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.ods,.csv"
            onChange={onFile}
            className="hidden"
          />
          {(data?.count ?? 0) > 0 && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              title="Limpar base"
              aria-label="Limpar base"
              className="text-destructive hover:text-destructive"
              disabled={clearMutation.isPending}
              onClick={() => clearMutation.mutate()}
            >
              {clearMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash className="size-4" />
              )}
            </Button>
          )}
          <Button
            type="button"
            className="gap-2"
            disabled={uploadMutation.isPending}
            onClick={() => inputRef.current?.click()}
          >
            {uploadMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            {uploadMutation.isPending ? "Enviando…" : "Subir relatório"}
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-2">
          <Input
            value={lookupValue}
            onChange={(e) => setLookupValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runLookup();
            }}
            placeholder="Testar consulta: telefone, e-mail ou CPF"
            className="h-9 rounded-lg text-sm"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0 gap-1"
            onClick={runLookup}
            disabled={looking}
          >
            {looking ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            Consultar
          </Button>
        </div>
      </div>
      {lookupResult && (
        <p className="mt-2 rounded-lg bg-muted/40 p-2 text-[12px] text-foreground/80">
          {lookupResult}
        </p>
      )}

      {data?.history && data.history.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[12px] text-muted-foreground hover:text-foreground">
            Histórico de importações ({data.history.length})
          </summary>
          <ul className="mt-2 space-y-1 text-[12px] text-muted-foreground">
            {data.history.map((h) => (
              <li key={h.id} className="flex justify-between gap-2">
                <span className="truncate">{h.fileName ?? "arquivo"}</span>
                <span className="shrink-0">
                  {h.totalRows} reg · {fmtDate(h.importedAt)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
