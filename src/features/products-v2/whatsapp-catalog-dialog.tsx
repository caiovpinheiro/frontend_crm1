"use client";

import * as React from "react";
import { IconBrandWhatsapp, IconLoader2 } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ButtonGlass } from "@/components/crm/button-glass";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import {
  FormDialog,
  formDialogCancelClass,
  formDialogPrimaryClass,
} from "@/components/ui/form-dialog";
import { apiFetch, parseApiResponse } from "@/lib/api";

const MODE_OPTIONS = [
  {
    value: "normal",
    label: "Normal",
    description: "Sempre o envio atual (texto e imagem)",
  },
  {
    value: "catalog_always",
    label: "Catálogo sempre",
    description: "1 produto nativo Meta · 2+ carrossel Meta",
  },
  {
    value: "catalog_multiple",
    label: "Catálogo em lote",
    description: "1 produto no envio atual · 2+ carrossel Meta",
  },
  {
    value: "ask",
    label: "Perguntar no envio",
    description: "O consultor escolhe o formato na hora",
  },
] as const;

type SendMode = (typeof MODE_OPTIONS)[number]["value"];

type SettingsPayload = {
  sendMode?: SendMode;
};

type CatalogPayload = {
  connected?: boolean;
  catalogId?: string | null;
  catalogName?: string | null;
  canUseCatalog?: boolean;
  message?: string;
};

export function WhatsAppCatalogDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [sendMode, setSendMode] = React.useState<SendMode>("normal");

  const settingsQ = useQuery({
    queryKey: ["products-whatsapp-settings"],
    queryFn: async () => {
      const res = await apiFetch("/api/products/whatsapp-settings");
      return parseApiResponse<SettingsPayload>(res, "Erro ao ler modo de envio");
    },
    enabled: open,
  });

  const catalogQ = useQuery({
    queryKey: ["products-meta-catalog"],
    queryFn: async () => {
      const res = await apiFetch("/api/products/meta-catalog");
      return parseApiResponse<CatalogPayload>(res, "Erro ao detectar catálogo Meta");
    },
    enabled: open,
  });

  React.useEffect(() => {
    if (settingsQ.data?.sendMode) setSendMode(settingsQ.data.sendMode);
  }, [settingsQ.data?.sendMode]);

  const saveMut = useMutation({
    mutationFn: async (next: SendMode) => {
      const res = await apiFetch("/api/products/whatsapp-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sendMode: next }),
      });
      return parseApiResponse<SettingsPayload>(res, "Erro ao salvar modo de envio");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products-whatsapp-settings"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Modo de envio salvo.");
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Não foi possível salvar.");
    },
  });

  const catalog = catalogQ.data;
  const loading = settingsQ.isLoading || catalogQ.isLoading;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title="Envio de produtos no WhatsApp"
      description="Modo da organização. O vínculo com o produto da Meta fica em cada produto (ID do catálogo Commerce)."
      footer={
        <>
          <ButtonGlass
            type="button"
            variant="glass"
            className={formDialogCancelClass}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </ButtonGlass>
          <ButtonGlass
            type="button"
            variant="primary"
            className={formDialogPrimaryClass}
            disabled={saveMut.isPending || loading}
            onClick={() => saveMut.mutate(sendMode)}
          >
            {saveMut.isPending && <IconLoader2 size={14} className="mr-1.5 animate-spin" />}
            Salvar
          </ButtonGlass>
        </>
      }
    >
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <IconLoader2 size={16} className="animate-spin" />
          Carregando…
        </p>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              <IconBrandWhatsapp size={14} />
              Modo de envio
            </p>
            <DropdownGlass
              options={MODE_OPTIONS.map((m) => ({
                value: m.value,
                label: m.label,
                description: m.description,
              }))}
              value={sendMode}
              onValueChange={(v) => setSendMode(v as SendMode)}
              triggerClassName="h-10 w-full text-[13px]"
            />
          </div>
          <div className="rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-3 py-2.5 text-[13px] leading-relaxed text-[var(--text-secondary)]">
            {catalog?.canUseCatalog ? (
              <>
                Catálogo Meta conectado
                {catalog.catalogName ? `: ${catalog.catalogName}` : ""}.
                {catalog.catalogId ? (
                  <span className="mt-1 block font-mono text-[11px] text-[var(--text-primary)]">
                    {catalog.catalogId}
                  </span>
                ) : null}
              </>
            ) : (
              catalog?.message ||
              "Nenhum catálogo Commerce associado à WABA deste canal. O envio atual continua funcionando."
            )}
          </div>
        </div>
      )}
    </FormDialog>
  );
}
