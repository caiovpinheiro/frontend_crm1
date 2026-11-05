"use client";

/**
 * Exportar / importar o dashboard entre gestores da mesma empresa.
 *
 * Exportar baixa um `.json` com cards, posições, ordem por aba e filtros.
 * Importar pede confirmação, substitui o dashboard de quem importa e recarrega
 * a tela; o anterior fica guardado para "Desfazer importação".
 * Validação definitiva (formato, empresa, tamanho) é do backend.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IconArrowBackUp, IconDownload, IconUpload } from "@tabler/icons-react";
import { useRef } from "react";
import { toast } from "sonner";

import type { PageActionsMenuItem } from "@/components/crm/page-toolbar";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { apiUrl } from "@/lib/api";

export const DASHBOARD_EXPORT_FORMAT = "bwipo.dashboard";
export const DASHBOARD_IMPORT_BACKUP_KEY = ["dashboard", "import-backup"] as const;
/** Arquivo maior que isso não é um dashboard (o backend aceita ~130 KB). */
const MAX_FILE_BYTES = 512 * 1024;

export interface DashboardExportFile {
  format: string;
  version: number;
  exportedAt: string;
  organizationId: string;
  exportedBy?: { id?: string; name?: string | null };
  preset?: string;
  data: unknown;
}

export interface DashboardImportBackup {
  importedAt: string;
  source: { exportedByName: string | null; exportedAt: string };
}

async function readMessage(res: Response, fallback: string): Promise<string> {
  try {
    const json = (await res.json()) as { message?: unknown };
    return typeof json?.message === "string" ? json.message : fallback;
  } catch {
    return fallback;
  }
}

export async function fetchDashboardExport(): Promise<DashboardExportFile> {
  const res = await fetch(apiUrl("/api/dashboard/layout/export"), { cache: "no-store" });
  if (!res.ok) throw new Error(await readMessage(res, "Não foi possível exportar o dashboard."));
  return (await res.json()) as DashboardExportFile;
}

export async function postDashboardImport(file: DashboardExportFile): Promise<void> {
  const res = await fetch(apiUrl("/api/dashboard/layout/import"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(file),
  });
  if (!res.ok) throw new Error(await readMessage(res, "Não foi possível importar o dashboard."));
}

export async function postDashboardImportUndo(): Promise<void> {
  const res = await fetch(apiUrl("/api/dashboard/layout/import/undo"), { method: "POST" });
  if (!res.ok) throw new Error(await readMessage(res, "Não foi possível desfazer a importação."));
}

export async function fetchDashboardImportBackup(): Promise<DashboardImportBackup | null> {
  const res = await fetch(apiUrl("/api/dashboard/layout/import"), { cache: "no-store" });
  if (!res.ok) return null;
  const json = (await res.json()) as { backup?: DashboardImportBackup | null };
  return json?.backup ?? null;
}

function slug(text: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "gestor"
  );
}

/** `dashboard-ana-souza-2026-11-05.json` */
export function dashboardExportFileName(name: string | null | undefined, at: Date): string {
  const day = [
    at.getFullYear(),
    String(at.getMonth() + 1).padStart(2, "0"),
    String(at.getDate()).padStart(2, "0"),
  ].join("-");
  return `dashboard-${slug(name ?? "")}-${day}.json`;
}

/** Leitura local só para montar a confirmação; o backend valida de novo. */
export function parseDashboardFileText(
  text: string,
): { ok: true; file: DashboardExportFile } | { ok: false; message: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, message: "Este arquivo não é um dashboard exportado do Bwipo." };
  }
  if (
    !raw ||
    typeof raw !== "object" ||
    (raw as { format?: unknown }).format !== DASHBOARD_EXPORT_FORMAT ||
    !(raw as { data?: unknown }).data
  ) {
    return { ok: false, message: "Este arquivo não é um dashboard exportado do Bwipo." };
  }
  return { ok: true, file: raw as DashboardExportFile };
}

export function formatTransferDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Remove os caches locais do dashboard (filtros, ordem, grid, UI) para o
 * dashboard importado do backend valer inteiro ao recarregar.
 */
export function clearDashboardLocalCache(storage: Storage | null = safeStorage()): void {
  if (!storage) return;
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && key.startsWith("dashboard-")) keys.push(key);
  }
  for (const key of keys) {
    try {
      storage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function downloadJson(fileName: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function reloadPage(): void {
  window.location.reload();
}

/**
 * Itens do menu "Ações do dashboard" + elementos (input de arquivo e diálogo).
 * `onApplied` roda depois de importar/desfazer (padrão: limpa cache e recarrega).
 */
export function useDashboardTransfer(options: { onApplied?: () => void } = {}) {
  const { confirm, dialog } = useConfirm();
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const backupQuery = useQuery({
    queryKey: DASHBOARD_IMPORT_BACKUP_KEY,
    queryFn: fetchDashboardImportBackup,
    staleTime: 60_000,
  });
  const backup = backupQuery.data ?? null;

  function applied() {
    clearDashboardLocalCache();
    void queryClient.invalidateQueries({ queryKey: DASHBOARD_IMPORT_BACKUP_KEY });
    (options.onApplied ?? reloadPage)();
  }

  async function handleExport() {
    try {
      const file = await fetchDashboardExport();
      downloadJson(dashboardExportFileName(file.exportedBy?.name, new Date()), file);
      toast.success("Dashboard exportado. Envie o arquivo para o outro gestor.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível exportar o dashboard.");
    }
  }

  async function handleFile(selected: File | undefined) {
    if (inputRef.current) inputRef.current.value = "";
    if (!selected) return;
    if (selected.size > MAX_FILE_BYTES) {
      toast.error("Este arquivo não é um dashboard exportado do Bwipo.");
      return;
    }
    const parsed = parseDashboardFileText(await selected.text());
    if (!parsed.ok) {
      toast.error(parsed.message);
      return;
    }
    const who = parsed.file.exportedBy?.name?.trim() || "outro gestor";
    const when = formatTransferDate(parsed.file.exportedAt);
    const ok = await confirm({
      title: "Importar dashboard?",
      description: `Dashboard exportado por ${who}${when ? ` em ${when}` : ""}. Ele vai substituir o seu dashboard atual. O seu fica guardado e você pode voltar a ele em "Desfazer importação".`,
      confirmLabel: "Importar",
      pendingLabel: "Importando…",
      action: async () => {
        try {
          await postDashboardImport(parsed.file);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Não foi possível importar o dashboard.");
          throw e;
        }
      },
    });
    if (!ok) return;
    toast.success("Dashboard importado.");
    applied();
  }

  async function handleUndo() {
    if (!backup) return;
    const who = backup.source.exportedByName?.trim() || "outro gestor";
    const ok = await confirm({
      title: "Desfazer importação?",
      description: `Remove o dashboard importado de ${who} e volta ao dashboard que você tinha antes.`,
      confirmLabel: "Desfazer",
      pendingLabel: "Desfazendo…",
      action: async () => {
        try {
          await postDashboardImportUndo();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Não foi possível desfazer a importação.");
          throw e;
        }
      },
    });
    if (!ok) return;
    toast.success("Importação desfeita.");
    applied();
  }

  const items: PageActionsMenuItem[] = [
    {
      icon: <IconDownload className="size-4" />,
      label: "Exportar dashboard",
      onClick: () => void handleExport(),
      divider: true,
      primary: false,
    },
    {
      icon: <IconUpload className="size-4" />,
      label: "Importar dashboard",
      onClick: () => inputRef.current?.click(),
      primary: false,
    },
    ...(backup
      ? [
          {
            icon: <IconArrowBackUp className="size-4" />,
            label: "Desfazer importação",
            onClick: () => void handleUndo(),
            primary: false,
          } satisfies PageActionsMenuItem,
        ]
      : []),
  ];

  const element = (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-label="Arquivo de dashboard para importar"
        data-testid="dashboard-import-input"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      {dialog}
    </>
  );

  return { items, element, backup };
}
