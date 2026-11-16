"use client";

/**
 * Configuração do passo "Enviar para empresa" (`send_company_group`):
 * envia texto ou mídia no(s) grupo(s) de WhatsApp vinculados à empresa,
 * pelo número QR do grupo. Os editores de texto/mídia vêm do inline-editor
 * (mesmo atalho de variáveis e upload dos outros blocos).
 */
import * as React from "react";
import {
  IconAlertTriangle as Alert,
  IconBuildingSkyscraper as Building,
  IconSearch as Search,
  IconStarFilled as Star,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";

import { DropdownGlass } from "@/components/crm/dropdown-glass";
import { useCompanies } from "@/features/directory-v2/hooks";
import { apiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

type Cfg = Record<string, unknown>;

export type CompanyGroupOption = { id: string; name: string; connected: boolean };

const str = (v: unknown) => (typeof v === "string" ? v : "");

const MEDIA_TYPES = [
  { value: "image", label: "Imagem" },
  { value: "video", label: "Vídeo" },
  { value: "audio", label: "Áudio" },
  { value: "document", label: "Documento" },
] as const;

export function useCompanyGroups(companyId: string) {
  return useQuery({
    queryKey: ["company-whatsapp-groups", companyId],
    enabled: Boolean(companyId),
    staleTime: 30_000,
    queryFn: async (): Promise<CompanyGroupOption[]> => {
      const res = await fetch(apiUrl(`/api/companies/${companyId}/whatsapp-groups`));
      if (!res.ok) return [];
      return ((await res.json()) as { items: CompanyGroupOption[] }).items;
    },
  });
}

function stop(e: React.PointerEvent) {
  e.stopPropagation();
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: React.ReactNode }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="nodrag flex gap-1 rounded-lg bg-[var(--color-bg-subtle,#F1F5F9)] p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onPointerDown={stop}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[12px] font-semibold transition-colors",
            value === o.value
              ? "bg-white text-[var(--brand-primary)] shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Check({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="nodrag flex cursor-pointer items-center gap-2 text-[12.5px] text-foreground" onPointerDown={stop}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-3.5 accent-[var(--brand-primary)]"
      />
      <span>{children}</span>
    </label>
  );
}

function CompanyPicker({
  companyId,
  companyName,
  onPick,
}: {
  companyId: string;
  companyName: string;
  onPick: (c: { id: string; name: string }) => void;
}) {
  const [open, setOpen] = React.useState(!companyId);
  const [q, setQ] = React.useState("");
  const search = q.trim();
  const list = useCompanies({ search: search || undefined, perPage: 8, enabled: open });
  const results = list.data?.items ?? [];

  if (!open && companyId) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2">
        <Building className="size-4 shrink-0 text-[var(--brand-primary)]" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
          {companyName || "Empresa"}
        </span>
        <button
          type="button"
          onPointerDown={stop}
          onClick={() => setOpen(true)}
          className="nodrag text-[11.5px] font-semibold text-[var(--brand-primary)] hover:underline"
        >
          Trocar
        </button>
      </div>
    );
  }

  return (
    <div className="nodrag nowheel space-y-1.5" onPointerDown={stop}>
      <label className="flex items-center gap-2 rounded-lg border border-border bg-white px-2.5">
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar empresa pelo nome"
          aria-label="Buscar empresa"
          className="h-8 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
        />
      </label>
      <div className="max-h-44 overflow-y-auto rounded-lg border border-border bg-white">
        {list.isLoading ? (
          <p className="px-3 py-2.5 text-center text-xs text-muted-foreground">Carregando…</p>
        ) : results.length === 0 ? (
          <p className="px-3 py-2.5 text-center text-xs text-muted-foreground">
            {search ? "Nenhuma empresa com esse nome." : "Nenhuma empresa cadastrada."}
          </p>
        ) : (
          results.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onPick({ id: c.id, name: c.name });
                setOpen(false);
                setQ("");
              }}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors hover:bg-[var(--color-bg-subtle,#F1F5F9)]",
                c.id === companyId && "bg-[var(--color-bg-subtle,#F1F5F9)] font-semibold",
              )}
            >
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              {[c.city, c.state].filter(Boolean).length > 0 ? (
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {[c.city, c.state].filter(Boolean).join("/")}
                </span>
              ) : null}
            </button>
          ))
        )}
      </div>
      {companyId ? (
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[11.5px] font-semibold text-muted-foreground hover:underline"
        >
          Cancelar
        </button>
      ) : null}
    </div>
  );
}

export function CompanyGroupInlineConfig({
  config,
  onChange,
  textEditor,
  mediaEditor,
  captionEditor,
}: {
  config: Cfg;
  onChange: (next: Cfg) => void;
  textEditor: React.ReactNode;
  mediaEditor: React.ReactNode;
  captionEditor: React.ReactNode;
}) {
  const mode = config.companyMode === "deal_primary" ? "deal_primary" : "fixed";
  const contentType = config.contentType === "media" ? "media" : "text";
  const companyId = str(config.companyId);
  const groupId = str(config.groupId);
  const allGroups = config.allGroups === true;
  const signatureEnabled = config.signatureEnabled === true;
  const groups = useCompanyGroups(mode === "fixed" ? companyId : "");
  const items = groups.data ?? [];
  const patch = (p: Cfg) => onChange({ ...config, ...p });
  const selectedGroup = items.find((g) => g.id === groupId);

  return (
    <div className="space-y-3">
      <div className="cfg-field">
        <span className="cfg-label">Empresa</span>
        <Segmented
          label="Qual empresa"
          value={mode}
          onChange={(v) => patch({ companyMode: v })}
          options={[
            { value: "fixed", label: "Escolher empresa" },
            {
              value: "deal_primary",
              label: (
                <>
                  <Star className="size-3 text-amber-500" /> Principal do negócio
                </>
              ),
            },
          ]}
        />
      </div>

      {mode === "fixed" ? (
        <>
          <CompanyPicker
            companyId={companyId}
            companyName={str(config.companyName)}
            onPick={(c) =>
              c.id === companyId
                ? undefined
                : patch({ companyId: c.id, companyName: c.name, groupId: "", groupName: "" })
            }
          />
          {companyId ? (
            <div className="cfg-field">
              <span className="cfg-label">Grupo do WhatsApp</span>
              {groups.isLoading ? (
                <p className="cfg-hint">Carregando grupos…</p>
              ) : items.length === 0 ? (
                <p className="flex items-start gap-1.5 text-[12px] text-amber-700">
                  <Alert className="mt-0.5 size-3.5 shrink-0" />
                  Esta empresa não tem grupo vinculado. Vincule em Grupos do WhatsApp → Empresa.
                </p>
              ) : (
                <>
                  {!allGroups ? (
                    <div className="nodrag nopan" onPointerDown={stop}>
                      <DropdownGlass
                        options={items.map((g) => ({
                          value: g.id,
                          label: g.connected ? g.name : `${g.name} (QR desconectado)`,
                        }))}
                        value={groupId}
                        onValueChange={(id) =>
                          patch({ groupId: id, groupName: items.find((g) => g.id === id)?.name ?? "" })
                        }
                        placeholder="Escolha o grupo"
                        matchTriggerWidth
                        searchable={items.length > 6}
                        searchPlaceholder="Buscar grupo"
                        triggerClassName="!w-full"
                      />
                    </div>
                  ) : null}
                  <Check checked={allGroups} onChange={(v) => patch({ allGroups: v })}>
                    Enviar em todos os grupos da empresa ({items.length})
                  </Check>
                  {!allGroups && selectedGroup && !selectedGroup.connected ? (
                    <p className="text-[11.5px] text-amber-700">
                      O número QR deste grupo está desconectado — o envio vai para a saída de erro.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </>
      ) : (
        <div className="space-y-1.5">
          <p className="cfg-hint">
            Usa a empresa marcada com ★ no negócio. Sem empresa ou sem grupo, segue pela saída de erro.
          </p>
          <Check checked={allGroups} onChange={(v) => patch({ allGroups: v })}>
            Enviar em todos os grupos da empresa
          </Check>
          {!allGroups ? <p className="cfg-hint">Desmarcado: só o grupo vinculado por último.</p> : null}
        </div>
      )}

      <div className="cfg-field">
        <span className="cfg-label">Conteúdo</span>
        <Segmented
          label="Tipo de conteúdo"
          value={contentType}
          onChange={(v) => patch({ contentType: v })}
          options={[
            { value: "text", label: "Texto" },
            { value: "media", label: "Mídia" },
          ]}
        />
      </div>

      {contentType === "text" ? (
        <div className="cfg-field">
          {textEditor}
          <span className="cfg-hint">Digite {"{"} para variáveis do contato, negócio e {"{{empresa.nome}}"}.</span>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="nodrag nopan" onPointerDown={stop}>
            <DropdownGlass
              options={MEDIA_TYPES.map((m) => ({ value: m.value, label: m.label }))}
              value={str(config.mediaType) || "image"}
              onValueChange={(v) => patch({ mediaType: v })}
              matchTriggerWidth
              triggerClassName="!w-full"
            />
          </div>
          {mediaEditor}
          {config.mediaType === "document" ? (
            <p className="cfg-hint">No documento o WhatsApp mostra o nome do arquivo; a legenda fica no histórico do CRM.</p>
          ) : (
            <div className="cfg-field">
              <span className="cfg-label">
                Legenda <em className="cfg-opt">opcional</em>
              </span>
              {captionEditor}
            </div>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Check checked={signatureEnabled} onChange={(v) => patch({ signatureEnabled: v })}>
          Assinar como <strong>{str(config.signatureName).trim() || "DNA Work"}</strong>
        </Check>
        {signatureEnabled ? (
          <input
            value={str(config.signatureName)}
            onChange={(e) => patch({ signatureName: e.target.value })}
            onPointerDown={stop}
            placeholder="DNA Work"
            aria-label="Nome da assinatura"
            className="nodrag h-8 w-full rounded-lg border border-border bg-white px-2.5 text-[12.5px] outline-none focus:border-[var(--brand-primary)]"
          />
        ) : null}
      </div>
    </div>
  );
}
