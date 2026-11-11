"use client";

import * as React from "react";
import {
  IconCheck,
  IconLoader2,
  IconPhone,
  IconSearch,
  IconSend,
} from "@tabler/icons-react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type CallPermissionTemplate = {
  id: string | null;
  name: string;
  language: string;
  sub_category: string | null;
  bodyText: string;
  headerText: string;
  footerText: string;
  buttons: string[];
};

function previewNodes(body: string, contactName: string): React.ReactNode {
  const name = contactName.trim();
  if (!name) return body;
  const parts = body.split(/\{\{\s*\d+\s*\}\}/g);
  if (parts.length === 1) return body;
  return parts.map((part, i) => (
    <React.Fragment key={i}>
      {part}
      {i < parts.length - 1 ? <strong className="font-semibold text-foreground">{name}</strong> : null}
    </React.Fragment>
  ));
}

export function CallPermissionTemplateDialog({
  open,
  onOpenChange,
  contactName,
  templates,
  loading,
  error = null,
  sending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactName?: string | null;
  templates: CallPermissionTemplate[];
  loading: boolean;
  /** Falha ao carregar a lista (mostrada no lugar de "nenhum template"). */
  error?: string | null;
  sending: boolean;
  onSubmit: (templateName: string) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState("");
  const who = (contactName ?? "").trim();

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    setSelected((cur) => {
      if (cur && templates.some((t) => t.name === cur)) return cur;
      try {
        const stored = sessionStorage.getItem("wa_call_permission_tpl")?.trim() ?? "";
        if (stored && templates.some((t) => t.name === stored)) return stored;
      } catch {
        /* ignore */
      }
      return templates[0]?.name ?? "";
    });
  }, [open, templates]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? templates.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.bodyText.toLowerCase().includes(q) ||
          t.language.toLowerCase().includes(q),
      )
    : templates;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        panelClassName="sm:max-w-[440px]"
        bodyClassName="gap-0 overflow-hidden p-0"
      >
        <DialogClose />
        <div className="flex gap-3 px-6 pb-4 pt-6">
          <span
            className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-full text-white"
            style={{ background: "#14B8A6" }}
            aria-hidden
          >
            <IconPhone size={22} stroke={2.2} />
          </span>
          <div className="min-w-0 pr-6">
            <DialogTitle>Pedir permissão de ligação</DialogTitle>
            <DialogDescription className="mt-1 text-[13px] leading-snug">
              Enviar template de voz para{" "}
              <span className="font-semibold text-foreground">{who || "o cliente"}</span>
            </DialogDescription>
          </div>
        </div>

        <div className="px-6">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              Escolha o template
            </span>
            <span className="text-[11px] text-[var(--text-muted)]">
              {templates.length} disponíveis
            </span>
          </div>
          <label className="relative block">
            <IconSearch
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-muted)]"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar template..."
              className="h-10 w-full rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] py-2 pl-9 pr-3.5 text-sm outline-none placeholder:text-[var(--color-ink-muted)] focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20"
            />
          </label>
        </div>

        <div className="mt-3 max-h-[min(360px,46vh)] space-y-2 overflow-y-auto px-6 pb-2">
          {loading ? (
            <div className="flex flex-col items-center gap-2 py-10 text-[13px] text-[var(--text-muted)]">
              <IconLoader2 className="size-5 animate-spin" />
              Carregando templates…
            </div>
          ) : error ? (
            <div
              role="alert"
              className="rounded-xl border border-dashed border-[var(--glass-border)] px-4 py-8 text-center text-[13px] text-[var(--text-muted)]"
            >
              Não foi possível carregar os templates de ligação: {error}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--glass-border)] px-4 py-8 text-center text-[13px] text-[var(--text-muted)]">
              {templates.length === 0 ? (
                <>
                  Nenhum template aprovado de permissão de ligação. Cadastre em{" "}
                  <a
                    href="/settings/message-models?tab=whatsapp"
                    className="font-medium text-primary underline-offset-2 hover:underline"
                  >
                    Configurações → Templates
                  </a>
                  .
                </>
              ) : (
                <>Nenhum template encontrado para “{query.trim()}”.</>
              )}
            </div>
          ) : (
            filtered.map((tpl) => {
              const isSelected = tpl.name === selected;
              return (
                <button
                  key={`${tpl.name}:${tpl.language}`}
                  type="button"
                  onClick={() => setSelected(tpl.name)}
                  className={cn(
                    "flex w-full gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors",
                    isSelected
                      ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/[0.06]"
                      : "border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] hover:border-[var(--brand-primary)]/35",
                  )}
                >
                  <span
                    className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-white"
                    style={{ background: "#22C55E" }}
                    aria-hidden
                  >
                    <IconPhone size={15} stroke={2.4} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="truncate font-mono text-[13px] font-semibold text-foreground">
                        {tpl.name}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="rounded-md bg-black/[0.04] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                          {tpl.language || "pt_BR"}
                        </span>
                        <span
                          className={cn(
                            "flex size-5 items-center justify-center rounded-full border-2",
                            isSelected
                              ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]"
                              : "border-black/15 bg-white",
                          )}
                          aria-hidden
                        >
                          {isSelected ? (
                            <IconCheck size={12} stroke={3} className="text-white" />
                          ) : null}
                        </span>
                      </span>
                    </span>
                    {tpl.bodyText ? (
                      <span className="mt-1 line-clamp-3 text-[12px] leading-snug text-[var(--text-muted)]">
                        {previewNodes(tpl.bodyText, who)}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="mt-1 border-t border-[var(--glass-border)] px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              className="px-2 py-2 text-sm font-medium text-[var(--text-muted)] hover:text-foreground"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!selected || sending || loading}
              onClick={() => selected && onSubmit(selected)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-emerald-500 px-5 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(34,197,94,0.35)] transition-all hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? (
                <IconLoader2 size={16} className="animate-spin" />
              ) : (
                <IconSend size={16} stroke={2.2} />
              )}
              Enviar pedido de permissão
            </button>
          </div>
          <p className="mt-3 text-center text-[11px] leading-snug text-[var(--text-muted)]">
            O cliente recebe a mensagem e decide se autoriza a ligação.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
