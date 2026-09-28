"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconMessage, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { toast } from "sonner";

import { ButtonGlass } from "@/components/crm/button-glass";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  FormDialog,
  FormDialogIcon,
  formControlClass,
  formDialogCancelClass,
  formDialogPrimaryClass,
  formLabelClass,
} from "@/components/ui/form-dialog";
import { Textarea } from "@/components/ui/textarea";
import { apiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

import { COURSE_LEVEL_LABEL, KIND_LABEL, type CourseLevel, type ProductKind } from "./types";

type Template = {
  id: string;
  name: string;
  kind: ProductKind;
  courseLevel: CourseLevel | null;
  content: string;
  active: boolean;
};

type Variable = { key: string; label: string; sample: string };

const KINDS: ProductKind[] = ["PHYSICAL", "SERVICE", "COURSE", "JOB_OPENING"];

async function fetchTemplates(): Promise<Template[]> {
  const res = await fetch(apiUrl("/api/product-messages"));
  if (!res.ok) throw new Error("Erro ao carregar mensagens");
  const data = (await res.json()) as { templates: Template[] };
  return data.templates;
}

async function fetchVariables(kind: ProductKind, level: string): Promise<Variable[]> {
  const params = new URLSearchParams({ kind });
  if (kind === "COURSE" && level) params.set("level", level);
  const res = await fetch(apiUrl(`/api/product-messages/variables?${params}`));
  if (!res.ok) return [];
  const data = (await res.json()) as { variables: Variable[] };
  return data.variables;
}

function scopeLabel(row: Template): string {
  if (row.kind !== "COURSE") return KIND_LABEL[row.kind];
  return row.courseLevel ? `${KIND_LABEL.COURSE} · ${COURSE_LEVEL_LABEL[row.courseLevel]}` : "Curso · todos os níveis";
}

function fillSample(content: string, variables: Variable[]): string {
  const map = new Map(variables.map((v) => [v.key, v.sample]));
  return content.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key: string) => map.get(key.toLowerCase()) ?? "");
}

export function ProductMessagesPage() {
  const { confirm, dialog } = useConfirm();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Template | null>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["product-messages"],
    queryFn: fetchTemplates,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(apiUrl(`/api/product-messages/${id}`), { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? "Erro ao remover");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-messages"] });
      toast.success("Mensagem removida.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          Texto enviado no chat ao encaminhar um produto. Use as variáveis dos dados cadastrados.
        </p>
        <ButtonGlass
          variant="primary"
          className="h-9 shrink-0 rounded-full px-3"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <IconPlus size={15} />
          Nova mensagem
        </ButtonGlass>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : templates.length === 0 ? (
        <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          Nenhuma mensagem cadastrada. Sem modelo, o encaminhamento continua com o texto atual.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {templates.map((row) => (
            <li
              key={row.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{row.name}</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">{scopeLabel(row)}</p>
              </div>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  row.active ? "bg-emerald-500/15 text-emerald-700" : "bg-muted text-muted-foreground",
                )}
              >
                {row.active ? "Ativa" : "Inativa"}
              </span>
              <button
                type="button"
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label="Editar mensagem"
                onClick={() => {
                  setEditing(row);
                  setOpen(true);
                }}
              >
                <IconPencil size={16} />
              </button>
              <button
                type="button"
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-destructive"
                aria-label="Remover mensagem"
                onClick={() => {
                  void confirm({
                    title: "Remover mensagem",
                    description: `Remover “${row.name}”? O encaminhamento desse tipo volta ao texto atual.`,
                    confirmLabel: "Remover",
                    destructive: true,
                  }).then((ok) => {
                    if (ok) remove.mutate(row.id);
                  });
                }}
              >
                <IconTrash size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <MessageDialog
        open={open}
        editing={editing}
        onOpenChange={setOpen}
        onSaved={() => {
          setOpen(false);
          queryClient.invalidateQueries({ queryKey: ["product-messages"] });
          queryClient.invalidateQueries({ queryKey: ["product-message-preview"] });
        }}
      />
      {dialog}
    </div>
  );
}

function MessageDialog({
  open,
  editing,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  editing: Template | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const areaRef = React.useRef<HTMLTextAreaElement>(null);
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<ProductKind>("COURSE");
  const [level, setLevel] = React.useState<"" | CourseLevel>("");
  const [content, setContent] = React.useState("");
  const [active, setActive] = React.useState(true);

  React.useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setKind(editing?.kind ?? "COURSE");
    setLevel(editing?.courseLevel ?? "");
    setContent(editing?.content ?? "");
    setActive(editing?.active ?? true);
  }, [open, editing]);

  const { data: variables = [] } = useQuery({
    queryKey: ["product-message-variables", kind, level],
    queryFn: () => fetchVariables(kind, level),
    enabled: open,
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        kind,
        courseLevel: kind === "COURSE" ? level || null : null,
        content,
        active,
      };
      const res = await fetch(apiUrl(editing ? `/api/product-messages/${editing.id}` : "/api/product-messages"), {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message ?? "Erro ao salvar");
    },
    onSuccess: () => {
      toast.success(editing ? "Mensagem atualizada." : "Mensagem criada.");
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  function insertVariable(key: string) {
    const token = `{{${key}}}`;
    const el = areaRef.current;
    if (!el) {
      setContent((prev) => `${prev}${token}`);
      return;
    }
    const start = el.selectionStart ?? content.length;
    const end = el.selectionEnd ?? start;
    const next = content.slice(0, start) + token + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  }

  const preview = fillSample(content, variables).trim();

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={editing ? "Editar mensagem" : "Nova mensagem"}
      description="Escolha o tipo e monte o texto com as variáveis do produto."
      icon={
        <FormDialogIcon>
          <IconMessage size={16} />
        </FormDialogIcon>
      }
      busy={save.isPending}
      footer={
        <>
          <ButtonGlass variant="glass" className={formDialogCancelClass} onClick={() => onOpenChange(false)}>
            Cancelar
          </ButtonGlass>
          <ButtonGlass
            variant="primary"
            className={formDialogPrimaryClass}
            disabled={save.isPending || !name.trim() || !content.trim()}
            onClick={() => save.mutate()}
          >
            Salvar
          </ButtonGlass>
        </>
      }
    >
      <label className={formLabelClass}>Nome</label>
      <input className={formControlClass} value={name} onChange={(e) => setName(e.target.value)} />

      <label className={cn(formLabelClass, "mt-4")}>Tipo de produto</label>
      <div className="flex flex-wrap gap-2">
        {KINDS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => {
              setKind(item);
              if (item !== "COURSE") setLevel("");
            }}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[12px] font-semibold",
              kind === item
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground",
            )}
          >
            {KIND_LABEL[item]}
          </button>
        ))}
      </div>

      {kind === "COURSE" && (
        <>
          <label className={cn(formLabelClass, "mt-4")}>Nível</label>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["", "Todos"],
                ["GRADUATION", COURSE_LEVEL_LABEL.GRADUATION],
                ["POSTGRADUATE", COURSE_LEVEL_LABEL.POSTGRADUATE],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value || "all"}
                type="button"
                onClick={() => setLevel(value)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[12px] font-semibold",
                  level === value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      <label className={cn(formLabelClass, "mt-4")}>Variáveis</label>
      <div className="flex flex-wrap gap-1.5">
        {variables.map((variable) => (
          <button
            key={variable.key}
            type="button"
            title={variable.sample ? `Ex.: ${variable.sample}` : variable.label}
            onClick={() => insertVariable(variable.key)}
            className="rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] font-semibold text-foreground hover:bg-secondary/70"
          >
            {variable.label}
          </button>
        ))}
      </div>

      <label className={cn(formLabelClass, "mt-4")}>Mensagem</label>
      <Textarea
        ref={areaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={8}
        className="rounded-xl border-border bg-card"
      />

      <label className="mt-3 flex items-center gap-2 text-[13px] text-foreground">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Ativa
      </label>

      {preview ? (
        <div className="mt-4 rounded-xl border border-border bg-secondary/40 px-3 py-2">
          <p className={formLabelClass}>Prévia com exemplo</p>
          <p className="whitespace-pre-wrap text-[13px] text-foreground">{preview}</p>
        </div>
      ) : null}
    </FormDialog>
  );
}
