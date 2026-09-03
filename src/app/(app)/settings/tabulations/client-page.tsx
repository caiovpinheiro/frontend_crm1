"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  IconCheck,
  IconChevronDown,
  IconCircleDot,
  IconDownload,
  IconEdit,
  IconFolder,
  IconFolderOpen,
  IconLayoutList,
  IconListTree,
  IconPlus,
  IconSparkles,
  IconTrash,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { TabulationsDashboard } from "./tabulations-dashboard";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { GlassCard } from "@/components/crm/glass-card";
import { InputGlass } from "@/components/crm/input-glass";
import { ButtonGlass } from "@/components/crm/button-glass";
import { KpiCard } from "@/components/crm/kpi-card";
import { KpiStrip } from "@/components/crm/kpi-strip";
import { SwitchGlass } from "@/components/crm/switch-glass";
import { cn } from "@/lib/utils";
import { apiUrl } from "@/lib/api";
import {
  PageActionsMenu,
  PageSegmentedControl,
} from "@/components/crm/page-toolbar";
import { SettingsListFilterBar } from "@/components/crm/settings-filter-bar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDepartments } from "@/features/conversations-settings/hooks/use-departments";
import { DeptGlyph } from "@/features/conversations-settings/department-icons";

import {
  SETTINGS_HUB_BACK,
  SettingsV2Shell,
  useSettingsHeaderSlots,
} from "../_v2-shell";

type TabulationNode = {
  id: string;
  number?: number;
  parentId: string | null;
  name: string;
  color: string | null;
  position: number;
  active: boolean;
  children: TabulationNode[];
};

type TabulationsResponse = {
  departmentId: string;
  requireTabulationOnClose: boolean;
  /** Folha aplicada quando quem encerra é a IA / uma automação. */
  autoCloseTabulationId: string | null;
  tree: TabulationNode[];
};

/** Folhas achatadas com o caminho completo — opções do encerramento automático. */
function leafOptions(
  nodes: TabulationNode[],
  parentPath: string[] = [],
): { id: string; path: string }[] {
  const out: { id: string; path: string }[] = [];
  for (const n of nodes) {
    if (!n.active) continue;
    const path = [...parentPath, n.name];
    if (n.children.length === 0) out.push({ id: n.id, path: path.join(" › ") });
    else out.push(...leafOptions(n.children, path));
  }
  return out;
}

function tabulationsQueryKey(departmentId: string | null) {
  return ["settings", "tabulations", departmentId ?? ""] as const;
}

async function fetchTabulations(departmentId: string): Promise<TabulationsResponse> {
  const res = await fetch(
    apiUrl(`/api/settings/tabulations?departmentId=${encodeURIComponent(departmentId)}`),
    { credentials: "include" },
  );
  if (!res.ok) throw new Error("Erro ao carregar tabulações");
  return res.json();
}

function countNodes(nodes: TabulationNode[]): number {
  let total = 0;
  for (const n of nodes) {
    total += 1 + countNodes(n.children);
  }
  return total;
}

function countActiveNodes(nodes: TabulationNode[]): number {
  let total = 0;
  for (const n of nodes) {
    if (n.active) total += 1;
    total += countActiveNodes(n.children);
  }
  return total;
}

function countLeafNodes(nodes: TabulationNode[]): number {
  let total = 0;
  for (const n of nodes) {
    if (n.children.length === 0) total += 1;
    else total += countLeafNodes(n.children);
  }
  return total;
}

/** Filtra a árvore por nome (case-insensitive), preservando ancestrais.
 * Um nó é mantido se casa OU se tem descendentes que casam. Quando o
 * próprio nó casa, sua subárvore completa é preservada. */
function filterTree(nodes: TabulationNode[], query: string): TabulationNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;
  const out: TabulationNode[] = [];
  for (const n of nodes) {
    const selfMatch = n.name.toLowerCase().includes(q);
    const filteredChildren = filterTree(n.children, q);
    if (selfMatch || filteredChildren.length > 0) {
      out.push({ ...n, children: selfMatch ? n.children : filteredChildren });
    }
  }
  return out;
}

/* ─── Nova tabulação (árvore em rascunho, criada ao confirmar) ─────── */

type DraftNode = { id: string; name: string; children: DraftNode[] };

function makeDraftNode(): DraftNode {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `draft-${Math.random().toString(36).slice(2)}`,
    name: "",
    children: [],
  };
}

/** Cria a árvore de rascunho de forma sequencial: cada filho só é criado
 * após o pai retornar seu `id`. Reutiliza o POST existente de tabulações. */
async function createTabulationTree(
  departmentId: string,
  parentId: string | null,
  nodes: DraftNode[],
): Promise<void> {
  for (const node of nodes) {
    const name = node.name.trim();
    if (!name) continue;
    const res = await fetch(apiUrl("/api/settings/tabulations"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ departmentId, parentId, name }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { message?: string }).message ?? "Erro ao criar tabulação");
    }
    const created = (await res.json()) as { id: string };
    if (node.children.length > 0) {
      await createTabulationTree(departmentId, created.id, node.children);
    }
  }
}

/* ─── CSV helpers (round-trip por id) ─────────────────────────────── */

type FlatRow = {
  id: string;
  parentId: string;
  name: string;
  active: string;
  position: string;
  path: string;
};

function flattenTree(
  nodes: TabulationNode[],
  parentPath: string[] = [],
): FlatRow[] {
  const out: FlatRow[] = [];
  for (const n of nodes) {
    const path = [...parentPath, n.name];
    out.push({
      id: n.id,
      parentId: n.parentId ?? "",
      name: n.name,
      active: n.active ? "true" : "false",
      position: String(n.position),
      path: path.join(" > "),
    });
    if (n.children.length) out.push(...flattenTree(n.children, path));
  }
  return out;
}

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function toCsv(rows: FlatRow[]): string {
  const header = ["id", "parentId", "name", "active", "position", "path"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [r.id, r.parentId, r.name, r.active, r.position, r.path].map(csvEscape).join(","),
    );
  }
  return lines.join("\r\n");
}

/** Parser CSV tolerante a aspas, vírgulas e quebras de linha dentro de campos. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, ""); // remove BOM
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.length > 0)) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((f) => f.length > 0)) rows.push(row);
  }
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((h, idx) => {
      obj[h] = (r[idx] ?? "").trim();
    });
    return obj;
  });
}

export default function TabulationsClientPage() {
  return (
    <SettingsV2Shell
      back={SETTINGS_HUB_BACK}
      title="Tabulações"
      description="Motivos hierárquicos escolhidos ao encerrar conversas"
      icon={<IconLayoutList size={22} />}
    >
      <TabulationsBody />
    </SettingsV2Shell>
  );
}

function TabulationsBody() {
  const slots = useSettingsHeaderSlots();
  const qc = useQueryClient();
  const departmentsQuery = useDepartments();
  const departments = departmentsQuery.data ?? [];

  const [view, setView] = useState<"tree" | "dashboard">("tree");
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const effectiveDeptId = departmentId ?? departments[0]?.id ?? null;

  const treeQuery = useQuery({
    queryKey: tabulationsQueryKey(effectiveDeptId),
    queryFn: () => fetchTabulations(effectiveDeptId!),
    enabled: !!effectiveDeptId,
    staleTime: 15_000,
  });

  const requireOnClose = treeQuery.data?.requireTabulationOnClose ?? false;
  const autoCloseTabulationId = treeQuery.data?.autoCloseTabulationId ?? "";
  const tree = useMemo(() => treeQuery.data?.tree ?? [], [treeQuery.data?.tree]);
  const leaves = useMemo(() => leafOptions(tree), [tree]);
  const nodeCount = useMemo(() => countNodes(tree), [tree]);
  const activeCount = useMemo(() => countActiveNodes(tree), [tree]);
  const leafCount = useMemo(() => countLeafNodes(tree), [tree]);

  const filteredTree = useMemo(() => filterTree(tree, search), [tree, search]);
  const filteredCount = useMemo(() => countNodes(filteredTree), [filteredTree]);

  const toggleRequire = useMutation({
    mutationFn: async (next: boolean) => {
      if (!effectiveDeptId) throw new Error("Sem departamento");
      const res = await fetch(apiUrl(`/api/settings/departments/${effectiveDeptId}`), {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requireTabulationOnClose: next }),
      });
      if (!res.ok) throw new Error("Falha ao alternar exigência");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tabulationsQueryKey(effectiveDeptId) });
    },
  });

  const setAutoClose = useMutation({
    mutationFn: async (next: string | null) => {
      if (!effectiveDeptId) throw new Error("Sem departamento");
      const res = await fetch(apiUrl(`/api/settings/departments/${effectiveDeptId}`), {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoCloseTabulationId: next }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { message?: string }).message ?? "Falha ao definir a tabulação",
        );
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tabulationsQueryKey(effectiveDeptId) });
      qc.invalidateQueries({ queryKey: ["settings", "departments"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar."),
  });

  const createNode = useMutation({
    mutationFn: async (input: { parentId: string | null; name: string }) => {
      if (!effectiveDeptId) throw new Error("Sem departamento");
      const res = await fetch(apiUrl("/api/settings/tabulations"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          departmentId: effectiveDeptId,
          parentId: input.parentId,
          name: input.name,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "Erro ao criar");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tabulationsQueryKey(effectiveDeptId) });
    },
  });

  const updateNode = useMutation({
    mutationFn: async (input: { id: string; name?: string; active?: boolean }) => {
      const res = await fetch(apiUrl(`/api/settings/tabulations/${input.id}`), {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: input.name, active: input.active }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "Erro ao atualizar");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tabulationsQueryKey(effectiveDeptId) });
    },
  });

  const deleteNode = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(apiUrl(`/api/settings/tabulations/${id}`), {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Erro ao remover");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tabulationsQueryKey(effectiveDeptId) });
    },
  });

  const importCsv = useMutation({
    mutationFn: async (rows: { id?: string; parentId?: string; name: string; active?: boolean; position?: number }[]) => {
      if (!effectiveDeptId) throw new Error("Sem departamento");
      const res = await fetch(apiUrl("/api/settings/tabulations/import"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId: effectiveDeptId, rows }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "Erro ao importar");
      }
      return res.json() as Promise<{ created: number; updated: number; skipped: number }>;
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: tabulationsQueryKey(effectiveDeptId) });
      alert(
        `Importação concluída.\nCriados: ${r.created} · Atualizados: ${r.updated} · Ignorados: ${r.skipped}`,
      );
    },
    onError: (e) => {
      alert(`Falha na importação: ${e instanceof Error ? e.message : "erro desconhecido"}`);
    },
  });

  const selectedDept = departments.find((d) => d.id === effectiveDeptId) ?? null;
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const rows = flattenTree(tree);
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const slug = (selectedDept?.name ?? "departamento")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    a.href = url;
    a.download = `tabulacoes-${slug}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseCsv(text);
    const rows = parsed
      .map((r) => {
        const name = (r.name ?? "").trim();
        if (!name) return null;
        const activeRaw = (r.active ?? "").trim().toLowerCase();
        const active =
          activeRaw === "" ? undefined : ["true", "1", "sim", "ativo", "yes"].includes(activeRaw);
        const posNum = Number((r.position ?? "").trim());
        return {
          id: (r.id ?? "").trim() || undefined,
          parentId: (r.parentId ?? "").trim() || undefined,
          name,
          active,
          position: Number.isFinite(posNum) && (r.position ?? "").trim() !== "" ? posNum : undefined,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (rows.length === 0) {
      alert("Nenhuma linha válida encontrada no CSV (coluna 'name' é obrigatória).");
      return;
    }
    importCsv.mutate(rows);
  };

  // Apenas busca no centro do PageHeader. O departamento NAO fica aqui:
  // escondido no popover de filtros, ele passava despercebido e as
  // tabulacoes acabavam criadas no departamento errado (o primeiro da
  // lista, escolhido por default). Agora ele e' um seletor fixo e
  // destacado no topo do conteudo.
  const centerNode = useMemo(
    () => (
      <SettingsListFilterBar
        search={search}
        onSearch={setSearch}
        placeholder="Buscar tabulação…"
        ariaLabel="Buscar tabulação"
        onClearAll={() => setSearch("")}
      />
    ),
    [search],
  );

  // CTAs de CSV no hambúrguer à direita do PageHeader.
  const actionsNode = useMemo(
    () => (
      <div className="flex items-center gap-2">
        <PageSegmentedControl
          aria-label="Visão de tabulações"
          size="compact"
          value={view}
          onChange={(v) => setView(v as "tree" | "dashboard")}
          items={[
            { value: "tree", label: "Árvore" },
            { value: "dashboard", label: "Dashboard" },
          ]}
        />
        {view === "tree" ? (
          <PageActionsMenu
            aria-label="Ações de tabulações"
            items={[
              {
                icon: <IconPlus size={16} />,
                label: "Nova tabulação",
                onClick: () => setNewOpen(true),
                primary: true,
              },
              {
                icon: <IconUpload size={16} />,
                label: importCsv.isPending ? "Importando…" : "Importar CSV",
                onClick: () => fileRef.current?.click(),
                disabled: importCsv.isPending,
                divider: true,
              },
              {
                icon: <IconDownload size={16} />,
                label: "Exportar CSV",
                onClick: handleExport,
                disabled: tree.length === 0,
              },
            ]}
          />
        ) : null}
      </div>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [importCsv.isPending, tree, view],
  );

  useEffect(() => {
    if (!slots) return;
    slots.setCenter(view === "tree" ? centerNode : null);
    slots.setActions(actionsNode);
    return () => {
      slots.setCenter(null);
      slots.setActions(null);
    };
  }, [slots, centerNode, actionsNode, view]);

  if (view === "dashboard") {
    return (
      <div className="flex w-full min-w-0 flex-col gap-4 px-1 pb-8">
        <TabulationsDashboard />
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-4 px-1 pb-8">
      {/* Import CSV escondido — acionado pelo hambúrguer do header. */}
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleImportFile(f);
          e.target.value = "";
        }}
      />

      {/* Departamentos como abas SEMPRE visiveis. Antes ficavam escondidos no
          popover de filtros da busca e a tela abria no primeiro da lista sem
          avisar — na Cruzeiro EaD isso fez 67 tabulacoes nascerem no
          departamento errado. Com as abas a vista, qual arvore esta aberta
          (e quais existem) fica obvio sem nenhum clique. */}
      {departments.length > 0 ? (
        <GlassCard variant="panel" className="min-w-0 p-4 sm:p-5">
          <p className="mb-2.5 font-display text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">
            Departamento
          </p>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Departamento das tabulações">
            {departments.map((d) => {
              const isSel = d.id === effectiveDeptId;
              return (
                <button
                  key={d.id}
                  type="button"
                  role="tab"
                  aria-selected={isSel}
                  onClick={() => setDepartmentId(d.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3.5 py-2 transition-colors",
                    isSel
                      ? "border-[var(--brand-primary)] bg-[var(--color-primary-soft)]"
                      : "border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] hover:border-[var(--brand-primary)]/50",
                  )}
                >
                  <span
                    className="flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)]"
                    style={{ backgroundColor: (d.color ?? "#6366f1") + "1f" }}
                  >
                    <DeptGlyph icon={d.icon} size={14} color={d.color ?? undefined} />
                  </span>
                  <span
                    className={cn(
                      "font-display text-[13px] font-semibold",
                      isSel ? "text-[var(--brand-primary)]" : "text-[var(--text-secondary)]",
                    )}
                  >
                    {d.name}
                  </span>
                  {isSel ? (
                    <IconCheck size={14} stroke={2.6} className="shrink-0 text-[var(--brand-primary)]" />
                  ) : null}
                </button>
              );
            })}
          </div>
          <p className="mt-3 font-body text-[12px] leading-relaxed text-[var(--text-muted)]">
            Cada departamento tem sua própria árvore. Tudo que você criar abaixo vale
            somente para{" "}
            <strong className="font-semibold text-[var(--text-primary)]">
              {selectedDept?.name ?? "—"}
            </strong>
            .
          </p>
        </GlassCard>
      ) : null}

      {departments.length === 0 ? (
        <GlassCard variant="panel" className="min-w-0 p-4 sm:p-5">
          <p className="font-body text-[12px] text-[var(--text-muted)]">
            Nenhum departamento ainda.{" "}
            <Link
              href="/settings/departments"
              className="font-semibold text-[var(--brand-primary)] underline-offset-2 hover:underline"
            >
              Cadastrar em Equipe &amp; Operação › Departamentos
            </Link>
            .
          </p>
        </GlassCard>
      ) : null}

      {/* ── Exigência de tabulação ─────────────────────────────────── */}
      {effectiveDeptId ? (
        <GlassCard variant="panel" className="min-w-0 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-4 py-3">
            <div className="min-w-0">
              <div className="font-display text-[13.5px] font-semibold text-[var(--text-primary)]">
                Exigir tabulação ao encerrar
              </div>
              <div className="mt-0.5 font-body text-[12px] text-[var(--text-muted)]">
                Quando ativado, o agente escolhe um nível final antes de resolver a conversa
                {selectedDept ? (
                  <>
                    {" "}
                    de{" "}
                    <strong className="font-semibold text-[var(--text-secondary)]">
                      {selectedDept.name}
                    </strong>
                  </>
                ) : (
                  " deste departamento"
                )}
                .
              </div>
            </div>
            <SwitchGlass
              checked={requireOnClose}
              onChange={(v) => toggleRequire.mutate(v)}
              disabled={toggleRequire.isPending}
              size="list"
              aria-label="Exigir tabulação ao encerrar"
            />
          </div>

          {/* Encerramento automático (IA / automação) não passa pelo modal do
              agente. Sem esta folha, ele fecha sem tabular e some do
              dashboard, mesmo com a exigência acima ligada. */}
          <div className="mt-3 rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-4 py-3">
            <div className="font-display text-[13.5px] font-semibold text-[var(--text-primary)]">
              Tabulação no encerramento automático
            </div>
            <div className="mt-0.5 font-body text-[12px] text-[var(--text-muted)]">
              Aplicada quando quem encerra é a IA ou uma automação, que não veem
              o modal do agente. Sem definir, esses encerramentos ficam sem
              tabulação e fora do dashboard.
            </div>
            <select
              value={autoCloseTabulationId}
              onChange={(e) => setAutoClose.mutate(e.target.value || null)}
              disabled={setAutoClose.isPending || leaves.length === 0}
              aria-label="Tabulação no encerramento automático"
              className="mt-2.5 h-9 w-full max-w-[420px] rounded-[var(--radius-sm)] border border-[var(--glass-border)] bg-[var(--glass-bg)] px-2.5 text-[12.5px] text-[var(--text-primary)] disabled:opacity-50"
            >
              <option value="">Não tabular</option>
              {leaves.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.path}
                </option>
              ))}
            </select>
            {leaves.length === 0 ? (
              <p className="mt-1.5 font-body text-[11.5px] text-[var(--text-muted)]">
                Crie ao menos um nível final na árvore abaixo para poder
                escolher.
              </p>
            ) : null}
          </div>
        </GlassCard>
      ) : null}

      {/* ── KPI minidash de tabulações ────────────────────────────── */}
      {effectiveDeptId ? (
        <KpiStrip aria-label="Indicadores de tabulações">
          <KpiCard
            label="Total níveis"
            value={nodeCount.toLocaleString("pt-BR")}
            icon={<IconListTree size={20} stroke={2.2} />}
            tone="brand"
          />
          <KpiCard
            label="Ativos"
            value={activeCount.toLocaleString("pt-BR")}
            icon={<IconCheck size={20} stroke={2.2} />}
            tone="success"
          />
          <KpiCard
            label="Inativos"
            value={(nodeCount - activeCount).toLocaleString("pt-BR")}
            icon={<IconX size={20} stroke={2.2} />}
            tone="neutral"
          />
          <KpiCard
            label="Níveis finais"
            value={leafCount.toLocaleString("pt-BR")}
            icon={<IconCircleDot size={20} stroke={2.2} />}
            tone="violet"
          />
          <KpiCard
            label="Exigência ativa"
            value={requireOnClose ? "Sim" : "Não"}
            icon={<IconSparkles size={20} stroke={2.2} />}
            tone="warning"
          />
        </KpiStrip>
      ) : null}

      {/* ── Árvore de tabulações ─────────────────────────────────── */}
      {effectiveDeptId ? (
        <TreeEditor
          tree={filteredTree}
          loading={treeQuery.isLoading}
          nodeCount={filteredCount}
          departmentName={selectedDept?.name ?? null}
          onCreate={(parentId, name) => createNode.mutate({ parentId, name })}
          onRename={(id, name) => updateNode.mutate({ id, name })}
          onToggleActive={(id, active) => updateNode.mutate({ id, active })}
          onDelete={(id) => deleteNode.mutate(id)}
        />
      ) : null}

      <NewTabulationModal
        open={newOpen}
        onOpenChange={setNewOpen}
        departmentId={effectiveDeptId}
        departmentName={selectedDept?.name ?? null}
        onCreated={() =>
          qc.invalidateQueries({ queryKey: tabulationsQueryKey(effectiveDeptId) })
        }
      />
    </div>
  );
}

/* ─── Modal "Nova tabulação" (monta árvore antes de salvar) ────────── */

export function NewTabulationModal({
  open,
  onOpenChange,
  departmentId,
  departmentName,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departmentId: string | null;
  departmentName: string | null;
  onCreated: () => void;
}) {
  const [rootName, setRootName] = useState("");
  const [children, setChildren] = useState<DraftNode[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setRootName("");
      setChildren([]);
      setSaving(false);
    }
  }, [open]);

  const canSave = !!departmentId && rootName.trim().length > 0 && !saving;

  const handleSave = async () => {
    if (!departmentId || !rootName.trim()) return;
    setSaving(true);
    try {
      await createTabulationTree(departmentId, null, [
        { id: "root", name: rootName.trim(), children },
      ]);
      toast.success("Tabulação criada com sucesso.");
      onCreated();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar tabulação.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Nova tabulação</DialogTitle>
          <DialogDescription>
            {departmentId
              ? `Monte a estrutura de níveis e subníveis${departmentName ? ` para ${departmentName}` : ""} antes de salvar.`
              : "Selecione um departamento para criar uma tabulação."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block font-display text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">
              Nível raiz
            </label>
            <InputGlass
              autoFocus
              value={rootName}
              placeholder="Nome do nível raiz…"
              onChange={(e) => setRootName(e.target.value)}
              disabled={!departmentId}
            />
          </div>

          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <p className="font-display text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                Subníveis
              </p>
              <ButtonGlass
                type="button"
                variant="glass"
                onClick={() => setChildren((c) => [...c, makeDraftNode()])}
                disabled={!departmentId}
                className="shrink-0"
              >
                <IconPlus size={16} /> Adicionar subnível
              </ButtonGlass>
            </div>

            {children.length === 0 ? (
              <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--glass-border)] py-6 text-center font-body text-[12.5px] text-[var(--text-muted)]">
                Nenhum subnível. A tabulação será criada apenas com o nível raiz.
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {children.map((child, idx) => (
                  <DraftNodeEditor
                    key={child.id}
                    node={child}
                    depth={1}
                    onChange={(next) =>
                      setChildren((cs) => cs.map((c, i) => (i === idx ? next : c)))
                    }
                    onRemove={() =>
                      setChildren((cs) => cs.filter((_, i) => i !== idx))
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <ButtonGlass type="button" variant="glass" onClick={() => onOpenChange(false)}>
            Cancelar
          </ButtonGlass>
          <ButtonGlass type="button" variant="primary" onClick={handleSave} disabled={!canSave}>
            {saving ? "Criando…" : "Criar tabulação"}
          </ButtonGlass>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Editor recursivo de um nó de rascunho: nome + adicionar/remover subníveis. */
function DraftNodeEditor({
  node,
  depth,
  onChange,
  onRemove,
}: {
  node: DraftNode;
  depth: number;
  onChange: (next: DraftNode) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] p-2.5">
      <div className="flex items-center gap-2">
        <span className="shrink-0 rounded-full bg-[var(--brand-primary)]/10 px-2 py-0.5 font-display text-[9.5px] font-bold uppercase tracking-wider text-[var(--brand-primary)]">
          Nível {depth + 1}
        </span>
        <InputGlass
          value={node.name}
          placeholder="Nome do subnível…"
          onChange={(e) => onChange({ ...node, name: e.target.value })}
        />
        <button
          type="button"
          onClick={() =>
            onChange({ ...node, children: [...node.children, makeDraftNode()] })
          }
          aria-label="Adicionar subnível"
          className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--brand-primary)]"
        >
          <IconPlus size={16} />
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remover nível"
          className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]"
        >
          <IconTrash size={16} />
        </button>
      </div>

      {node.children.length > 0 && (
        <div className="ml-3 mt-2.5 flex flex-col gap-2.5 border-l border-[var(--glass-border)] pl-3">
          {node.children.map((child, idx) => (
            <DraftNodeEditor
              key={child.id}
              node={child}
              depth={depth + 1}
              onChange={(next) =>
                onChange({
                  ...node,
                  children: node.children.map((c, i) => (i === idx ? next : c)),
                })
              }
              onRemove={() =>
                onChange({
                  ...node,
                  children: node.children.filter((_, i) => i !== idx),
                })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Editor da árvore ────────────────────────────────────────────── */

function TreeEditor(props: {
  tree: TabulationNode[];
  loading: boolean;
  nodeCount: number;
  departmentName: string | null;
  onCreate: (parentId: string | null, name: string) => void;
  onRename: (id: string, name: string) => void;
  onToggleActive: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const [newRootName, setNewRootName] = useState("");

  const submitRoot = () => {
    const name = newRootName.trim();
    if (!name) return;
    props.onCreate(null, name);
    setNewRootName("");
  };

  return (
    <GlassCard variant="panel" className="relative z-10 min-w-0 p-4 sm:p-5">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
          <IconListTree size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex flex-wrap items-center gap-x-2 font-display text-[15px] font-bold text-[var(--text-primary)]">
            Árvore de tabulações
            {props.departmentName ? (
              <span className="rounded-full bg-[var(--brand-primary)]/10 px-2.5 py-0.5 font-display text-[11.5px] font-bold text-[var(--brand-primary)]">
                {props.departmentName}
              </span>
            ) : null}
          </h2>
          <p className="font-body text-[12px] text-[var(--text-muted)]">
            Organize os níveis; o agente escolhe um nível final ao encerrar.
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--glass-bg-base)] px-2.5 py-1 font-display text-[11.5px] font-semibold text-[var(--text-secondary)]">
          <IconSparkles size={14} className="text-[var(--brand-primary)]" />
          {props.nodeCount} {props.nodeCount === 1 ? "nível" : "níveis"}
        </span>
      </div>

      {/* Nova categoria raiz */}
      <div className="mb-4 flex min-w-0 items-center gap-2">
        <InputGlass
          placeholder="Novo nível raiz…"
          value={newRootName}
          className="min-w-0 flex-1"
          onChange={(e) => setNewRootName(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter") {
              e.preventDefault();
              submitRoot();
            }
          }}
        />
        <ButtonGlass
          type="button"
          variant="primary"
          onClick={submitRoot}
          disabled={!newRootName.trim()}
          className="shrink-0 max-sm:px-2.5"
        >
          <IconPlus size={16} />
          <span className="max-sm:hidden">Adicionar</span>
        </ButtonGlass>
      </div>

      {props.loading ? (
        <div className="py-10 text-center font-body text-[13px] text-[var(--text-muted)]">
          Carregando…
        </div>
      ) : props.tree.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--glass-border)] py-10 text-center font-body text-[13px] text-[var(--text-muted)]">
          Nenhuma tabulação ainda. Crie o primeiro nível acima.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {props.tree.map((n) => (
            <TreeCard
              key={n.id}
              node={n}
              depth={0}
              onCreate={props.onCreate}
              onRename={props.onRename}
              onToggleActive={props.onToggleActive}
              onDelete={props.onDelete}
            />
          ))}
        </div>
      )}
    </GlassCard>
  );
}

/* ─── Card de nó (estilo v0 + DS v2) ──────────────────────────────── */

function TreeCard(props: {
  node: TabulationNode;
  depth: number;
  onCreate: (parentId: string | null, name: string) => void;
  onRename: (id: string, name: string) => void;
  onToggleActive: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const { node, depth } = props;
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.name);
  const [adding, setAdding] = useState(false);
  const [childName, setChildName] = useState("");

  const hasChildren = node.children.length > 0;
  const isLeaf = !hasChildren;

  const commitRename = () => {
    const t = draft.trim();
    if (t && t !== node.name) props.onRename(node.id, t);
    setEditing(false);
  };
  const commitAdd = () => {
    const t = childName.trim();
    if (t) {
      props.onCreate(node.id, t);
      setOpen(true);
    }
    setChildName("");
    setAdding(false);
  };

  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border bg-[var(--glass-bg-base)] shadow-[var(--glass-shadow-sm)] transition-all hover:-translate-y-0.5 hover:border-[var(--input-border-focus)] hover:shadow-[var(--glass-shadow)]",
        node.active
          ? "border-[var(--glass-border)]"
          : "border-dashed border-[var(--glass-border)] opacity-75",
      )}
    >
      <div className="group flex items-center gap-3 p-2.5 max-sm:gap-2 max-sm:p-2">
        {/* Ícone tile */}
        <button
          type="button"
          onClick={() => hasChildren && setOpen((v) => !v)}
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] transition-colors",
            isLeaf
              ? "bg-[var(--glass-bg-base)] text-[var(--text-secondary)]"
              : "bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/15",
          )}
          aria-label={hasChildren ? (open ? "Recolher" : "Expandir") : undefined}
        >
          {isLeaf ? (
            <IconCircleDot size={19} />
          ) : open ? (
            <IconFolderOpen size={19} />
          ) : (
            <IconFolder size={19} />
          )}
        </button>

        {/* Nome + subtítulo OU edição — texto/input com flex-1 para usar
            todo o espaço até o switch (antes truncava cedo com faixa vazia). */}
        {editing ? (
          <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
            <InputGlass
              autoFocus
              value={draft}
              className="min-w-0 flex-1"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitRename();
                }
                if (e.key === "Escape") {
                  setDraft(node.name);
                  setEditing(false);
                }
              }}
            />
            <button
              type="button"
              onClick={commitRename}
              aria-label="Salvar"
              className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--brand-primary)] transition-colors hover:bg-[var(--glass-bg-base)]"
            >
              <IconCheck size={17} />
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(node.name);
                setEditing(false);
              }}
              aria-label="Cancelar"
              className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-base)]"
            >
              <IconX size={17} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => hasChildren && setOpen((v) => !v)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left sm:gap-2.5"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span
                className={cn(
                  "truncate font-display text-[13.5px] font-semibold",
                  node.active
                    ? "text-[var(--text-primary)]"
                    : "text-[var(--text-muted)] line-through",
                )}
                title={
                  node.number != null
                    ? `${node.name} (#${node.number})`
                    : node.name
                }
              >
                {node.name}
                {node.number != null ? (
                  <span className="ml-1 font-body text-[11px] font-normal text-[var(--text-muted)]">
                    #{node.number}
                  </span>
                ) : null}
              </span>
              <span className="truncate font-body text-[11px] text-[var(--text-muted)]">
                {isLeaf
                  ? (
                      <>
                        <span className="sm:hidden">Nível final</span>
                        <span className="hidden sm:inline">
                          Nível final — selecionável pelo agente
                        </span>
                      </>
                    )
                  : `${node.children.length} ${node.children.length === 1 ? "subnível" : "subníveis"}`}
              </span>
            </span>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 font-display text-[9.5px] font-bold uppercase tracking-wider max-sm:hidden",
                isLeaf
                  ? "bg-[var(--glass-bg-base)] text-[var(--text-secondary)]"
                  : "bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]",
              )}
            >
              Nível {depth + 1}
            </span>
            {hasChildren && (
              <IconChevronDown
                size={16}
                className={cn(
                  "shrink-0 text-[var(--text-muted)] transition-transform",
                  open && "rotate-180",
                )}
              />
            )}
          </button>
        )}

        {/* Ações — no mobile os ícones +/✎/🗑 ficam sempre acessíveis sem
            reservar ~110px invisíveis (opacity-0) que engoliam o nome. */}
        {!editing && (
          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
            <SwitchGlass
              checked={node.active}
              onChange={(v) => props.onToggleActive(node.id, v)}
              size="sm"
              aria-label={node.active ? "Desativar" : "Ativar"}
            />
            <div className="flex items-center gap-0.5 sm:opacity-0 sm:transition-opacity sm:focus-within:opacity-100 sm:group-hover:opacity-100">
              <button
                type="button"
                onClick={() => setAdding(true)}
                aria-label="Adicionar subnível"
                className="flex size-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-base)] hover:text-[var(--brand-primary)] sm:size-9"
              >
                <IconPlus size={16} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(node.name);
                  setEditing(true);
                }}
                aria-label="Renomear"
                className="flex size-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-base)] hover:text-[var(--text-primary)] sm:size-9"
              >
                <IconEdit size={16} />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Remover "${node.name}" e todos os subitens?`)) {
                    props.onDelete(node.id);
                  }
                }}
                aria-label="Excluir"
                className="flex size-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)] sm:size-9"
              >
                <IconTrash size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Form de adicionar filho */}
      {adding && (
        <div className="flex min-w-0 items-center gap-2 px-2.5 pb-2.5 max-sm:pl-3 sm:pl-[62px]">
          <InputGlass
            autoFocus
            value={childName}
            placeholder="Nome do subnível…"
            className="min-w-0 flex-1"
            onChange={(e) => setChildName(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter") {
                e.preventDefault();
                commitAdd();
              }
              if (e.key === "Escape") {
                setChildName("");
                setAdding(false);
              }
            }}
          />
          <ButtonGlass type="button" variant="primary" onClick={commitAdd} className="shrink-0 max-sm:px-2.5">
            <IconCheck size={16} />
            <span className="max-sm:hidden">Adicionar</span>
          </ButtonGlass>
          <button
            type="button"
            onClick={() => {
              setChildName("");
              setAdding(false);
            }}
            aria-label="Cancelar"
            className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-base)]"
          >
            <IconX size={17} />
          </button>
        </div>
      )}

      {/* Filhos */}
      {hasChildren && open && (
        <div className="ml-5 space-y-2.5 border-l border-[var(--glass-border)] py-1 pb-2.5 pl-4 pr-2.5 max-sm:ml-2 max-sm:pl-2">
          {node.children.map((child) => (
            <TreeCard
              key={child.id}
              node={child}
              depth={depth + 1}
              onCreate={props.onCreate}
              onRename={props.onRename}
              onToggleActive={props.onToggleActive}
              onDelete={props.onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
