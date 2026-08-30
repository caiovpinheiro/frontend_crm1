"use client";

import * as React from "react";
import { Download, Upload } from "lucide-react";
import { IconCloudUpload, IconLoader2 } from "@tabler/icons-react";
import { toast } from "sonner";

import { ButtonGlass } from "@/components/crm/button-glass";
import {
  formDialogCancelClass,
  formDialogPrimaryClass,
} from "@/components/ui/form-dialog";
import { apiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

import {
  DataIoModal,
  type DataIoEntity,
  type DataIoMode,
} from "./data-io-modal";
import { downloadCsvFromApi, downloadTextCsv } from "./download-csv";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = ".csv,.xlsx,.xls,.ods,text/csv";
const FORMATS = ["CSV", "XLSX", "XLS", "ODS"] as const;

type IoConfig = {
  importPath: string;
  exportPath: string;
  templateName: string;
  templateCsv: string;
  exportName: string;
};

const CONFIG: Record<"templates" | "products", IoConfig> = {
  templates: {
    importPath: "/api/templates/import",
    exportPath: "/api/templates/export",
    templateName: "modelos-internos-modelo.csv",
    templateCsv:
      "Nome;Conteúdo;Categoria;Idioma;Status;Canal\nBoas-vindas;Olá, como posso ajudar?;Atendimento;pt_BR;DRAFT;WEBCHAT\n",
    exportName: "modelos-internos.csv",
  },
  products: {
    importPath: "/api/products/import",
    exportPath: "/api/products/export?active=false",
    templateName: "produtos-modelo.csv",
    templateCsv:
      "sku;name;description;kind;type;price;unit;is_active;track_stock;stock\nSKU-001;Produto exemplo;Descrição;PHYSICAL;PRODUCT;99.90;un;true;false;0\n",
    exportName: "produtos.csv",
  },
};

type ImportResult = {
  created?: number;
  updated?: number;
  skipped?: number;
  failed?: { row: number; message: string }[];
};

export function CsvIoDialog({
  open,
  onOpenChange,
  entity,
  mode,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: "templates" | "products";
  mode: DataIoMode;
  onDone?: () => void;
}) {
  const cfg = CONFIG[entity];
  const [file, setFile] = React.useState<File | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState<{ loaded: number; total: number | null } | null>(null);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) {
      setFile(null);
      setDragging(false);
      setBusy(false);
      setProgress(null);
      setResult(null);
    }
  }, [open]);

  const pickFile = React.useCallback((next: File | null) => {
    if (!next) return;
    if (next.size > MAX_BYTES) {
      toast.error("Arquivo acima de 10 MB.");
      return;
    }
    setFile(next);
    setResult(null);
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    pickFile(e.dataTransfer.files?.[0] ?? null);
  };

  const runImport = async () => {
    if (!file) {
      toast.error("Selecione um arquivo para importar.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("delimiter", ";");
      const res = await fetch(apiUrl(cfg.importPath), {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as ImportResult & {
        message?: string;
      };
      if (!res.ok) {
        throw new Error(data.message ?? `Falha na importação (${res.status})`);
      }
      setResult(data);
      const created = data.created ?? 0;
      const updated = data.updated ?? 0;
      const failed = data.failed?.length ?? 0;
      if (failed > 0) {
        toast.warning(
          `${created} criados, ${updated} atualizados, ${failed} com erro.`,
        );
      } else {
        toast.success(
          `${created} criados e ${updated} atualizados.`,
        );
      }
      onDone?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na importação.");
    } finally {
      setBusy(false);
    }
  };

  const runExport = async () => {
    setBusy(true);
    setProgress({ loaded: 0, total: null });
    try {
      await downloadCsvFromApi(apiUrl(cfg.exportPath), cfg.exportName, setProgress);
      toast.success("Exportação concluída.");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na exportação.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const pct =
    progress && progress.total && progress.total > 0
      ? Math.min(100, Math.round((progress.loaded / progress.total) * 100))
      : busy && mode === "export"
        ? 15
        : 0;

  const footer =
    mode === "import" ? (
      <div className="flex w-full flex-wrap items-center justify-end gap-2">
        <ButtonGlass
          variant="glass"
          className={cn(formDialogCancelClass, "mr-auto")}
          disabled={busy}
          onClick={() => downloadTextCsv(cfg.templateName, cfg.templateCsv)}
        >
          <Download className="size-3.5" />
          Baixar modelo CSV
        </ButtonGlass>
        <ButtonGlass
          variant="glass"
          className={formDialogCancelClass}
          disabled={busy}
          onClick={() => onOpenChange(false)}
        >
          Cancelar
        </ButtonGlass>
        <ButtonGlass
          variant="primary"
          className={formDialogPrimaryClass}
          disabled={busy || !file}
          onClick={() => void runImport()}
        >
          {busy ? (
            <IconLoader2 className="size-4 animate-spin" />
          ) : (
            <Upload className="size-3.5" />
          )}
          Importar
        </ButtonGlass>
      </div>
    ) : (
      <>
        <ButtonGlass
          variant="glass"
          className={formDialogCancelClass}
          disabled={busy}
          onClick={() => onOpenChange(false)}
        >
          Cancelar
        </ButtonGlass>
        <ButtonGlass
          variant="primary"
          disabled={busy}
          onClick={() => void runExport()}
          className={cn(formDialogPrimaryClass, "relative overflow-hidden")}
        >
          {busy ? (
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 bg-primary-foreground/20"
              style={{ width: `${Math.max(8, pct)}%` }}
            />
          ) : null}
          <span className="relative">{busy ? `Exportando… ${pct}%` : "Exportar CSV"}</span>
        </ButtonGlass>
      </>
    );

  return (
    <DataIoModal
      open={open}
      onOpenChange={onOpenChange}
      entity={entity as DataIoEntity}
      mode={mode}
      busy={busy}
      footer={footer}
    >
      {mode === "import" ? (
        <ImportBody
          file={file}
          dragging={dragging}
          busy={busy}
          result={result}
          inputRef={inputRef}
          onBrowse={() => inputRef.current?.click()}
          onFile={(f) => pickFile(f)}
          onDrop={onDrop}
          onDrag={setDragging}
        />
      ) : (
        <p className="text-sm leading-relaxed text-muted-foreground">
          O arquivo inclui todos os registros da organização e pode ser
          reimportado para atualizar itens existentes.
        </p>
      )}
    </DataIoModal>
  );
}

function ImportBody({
  file,
  dragging,
  busy,
  result,
  inputRef,
  onBrowse,
  onFile,
  onDrop,
  onDrag,
}: {
  file: File | null;
  dragging: boolean;
  busy: boolean;
  result: ImportResult | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onBrowse: () => void;
  onFile: (file: File | null) => void;
  onDrop: (e: React.DragEvent) => void;
  onDrag: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />

      <button
        type="button"
        disabled={busy}
        onClick={onBrowse}
        onDrop={onDrop}
        onDragOver={(e) => {
          e.preventDefault();
          onDrag(true);
        }}
        onDragLeave={() => onDrag(false)}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          dragging
            ? "border-primary bg-primary/5"
            : "border-border bg-card hover:border-primary/60",
          busy && "pointer-events-none opacity-60",
        )}
      >
        <span
          className={cn(
            "flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary",
          )}
        >
          {busy ? (
            <IconLoader2 className="size-6 animate-spin" />
          ) : (
            <IconCloudUpload size={26} stroke={1.6} />
          )}
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">
            {file ? file.name : dragging ? "Solte para anexar" : "Arraste o arquivo aqui"}
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {file
              ? `${(file.size / 1024).toFixed(1)} KB · clique para trocar`
              : "ou clique para selecionar"}
          </p>
        </div>
      </button>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Suportados
        </span>
        {FORMATS.map((fmt) => (
          <span
            key={fmt}
            className="rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] font-semibold text-foreground"
          >
            {fmt}
          </span>
        ))}
        <span className="text-[12px] text-muted-foreground">Até 10 MB</span>
      </div>

      <p className="rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-3.5 py-2.5 text-[13px] leading-relaxed text-foreground">
        Use CSV com separador{" "}
        <code className="rounded-md bg-card px-1.5 py-0.5 font-mono text-[12px]">;</code>
        {" "}para evitar conflito com datas e decimais.
      </p>

      {result ? (
        <p className="text-sm text-muted-foreground">
          {result.created ?? 0} criados · {result.updated ?? 0} atualizados
          {(result.skipped ?? 0) > 0 ? ` · ${result.skipped} ignorados` : ""}
          {(result.failed?.length ?? 0) > 0
            ? ` · ${result.failed?.length} com erro`
            : ""}
        </p>
      ) : null}
    </div>
  );
}
