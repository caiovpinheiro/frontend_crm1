"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  IconArrowRight,
  IconCheck,
  IconChevronLeft as ChevronLeft,
  IconChevronRight as ChevronRight,
  IconClockHour4,
  IconFolder,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";

import { cn } from "@/lib/utils";
import { InputGlass } from "@/components/crm/input-glass";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import { getTabulations, type TabulationNode } from "../api/conversations";

function normalizeSearch(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function countActiveChildren(node: TabulationNode): number {
  return node.children.filter((c) => c.active).length;
}

function itemsLabel(count: number): string {
  return count === 1 ? "1 item" : `${count} itens`;
}

/** Resultado de busca no ramo atual: o nó e o caminho relativo até ele. */
type SearchHit = { node: TabulationNode; trail: TabulationNode[] };

function collectSearchHits(
  nodes: TabulationNode[],
  q: string,
  trail: TabulationNode[] = [],
): SearchHit[] {
  const hits: SearchHit[] = [];
  for (const node of nodes) {
    if (!node.active) continue;
    if (normalizeSearch(node.name).includes(q)) {
      hits.push({ node, trail });
    }
    if (node.children.length > 0) {
      hits.push(...collectSearchHits(node.children, q, [...trail, node]));
    }
  }
  return hits;
}

/** Departamento dominante entre as conversas selecionadas — só escolhe a árvore do modal. A folha vale para o lote inteiro. */
export function pickBulkCloseDepartment(
  rows: Array<{
    id: string;
    status?: string;
    departmentId?: string | null;
    department?: { id: string; requireTabulationOnClose?: boolean } | null;
  }>,
  selectedIds: Iterable<string>,
  opts?: { allInFilter?: boolean },
): {
  departmentId: string | null;
  requireTabulationOnClose: boolean;
  mixed: boolean;
} {
  const selected = new Set(selectedIds);
  const pool = opts?.allInFilter
    ? rows.filter((r) => r.status !== "RESOLVED")
    : rows.filter((r) => selected.has(r.id) && r.status !== "RESOLVED");
  const counts = new Map<
    string,
    { n: number; require: boolean }
  >();
  for (const r of pool) {
    const id = r.departmentId ?? r.department?.id ?? null;
    if (!id) continue;
    const prev = counts.get(id) ?? { n: 0, require: false };
    counts.set(id, {
      n: prev.n + 1,
      require: prev.require || !!r.department?.requireTabulationOnClose,
    });
  }
  if (counts.size === 0) {
    return { departmentId: null, requireTabulationOnClose: false, mixed: false };
  }
  let bestId: string | null = null;
  let bestN = -1;
  let bestRequire = false;
  for (const [id, v] of counts) {
    if (v.n > bestN || (v.n === bestN && v.require && !bestRequire)) {
      bestId = id;
      bestN = v.n;
      bestRequire = v.require;
    }
  }
  return {
    departmentId: bestId,
    requireTabulationOnClose: bestRequire,
    mixed: counts.size > 1,
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departmentId: string | null;
  /** Callback recebe o id da folha escolhida. */
  onConfirm: (
    tabulationId: string,
    extra?: { skipAutomations?: boolean },
  ) => void;
  /** Se true, permite fechar sem escolher (uso opcional em ambientes que
   *  nao exigem). Default false (exige selecao). */
  optional?: boolean;
  submitting?: boolean;
  /** ADMIN: mostra opção para encerrar sem disparar automações. */
  allowSkipAutomations?: boolean;
};

/**
 * Modal drill-down para selecionar uma tabulacao (folha) ao encerrar
 * uma conversa. Pastas abrem o próximo nível; só a folha habilita confirmar.
 */
export function TabulationDialog({
  open,
  onOpenChange,
  departmentId,
  onConfirm,
  optional,
  submitting,
  allowSkipAutomations,
}: Props) {
  const query = useQuery({
    queryKey: ["inbox-tabulations", departmentId ?? ""],
    queryFn: () => getTabulations(departmentId!),
    enabled: open && !!departmentId,
    staleTime: 30_000,
  });

  // path[]: caminho atual (categoria pai -> ... -> nó selecionado).
  // Se o ultimo do path for folha, permite confirmar.
  const [path, setPath] = useState<TabulationNode[]>([]);
  const [skipAutomations, setSkipAutomations] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setPath([]);
      setSkipAutomations(false);
      setSearch("");
      return;
    }
    const t = window.setTimeout(() => searchRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, [open]);

  const isLeafSelected =
    path.length > 0 && path[path.length - 1].children.length === 0;

  const folderPath = isLeafSelected ? path.slice(0, -1) : path;

  const currentChildren: TabulationNode[] = useMemo(() => {
    if (!query.data) return [];
    const last = path[path.length - 1];
    if (!last) return query.data.tree.filter((n) => n.active);
    if (last.children.length === 0) {
      const parent = path[path.length - 2];
      const siblings = parent ? parent.children : query.data.tree;
      return siblings.filter((n) => n.active);
    }
    return last.children.filter((n) => n.active);
  }, [query.data, path]);

  const listed: SearchHit[] = useMemo(() => {
    const q = normalizeSearch(search.trim());
    if (!q) return currentChildren.map((node) => ({ node, trail: [] }));
    return collectSearchHits(currentChildren, q);
  }, [currentChildren, search]);

  const isSearching = normalizeSearch(search.trim()).length > 0;

  function selectNode(n: TabulationNode, trail: TabulationNode[]) {
    if (n.children.length > 0) setSearch("");
    setPath((prev) => {
      const base =
        prev.length > 0 && prev[prev.length - 1].children.length === 0
          ? prev.slice(0, -1)
          : prev;
      return [...base, ...trail, n];
    });
  }

  function goBack() {
    setSearch("");
    setPath((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.children.length === 0) return prev.slice(0, -2);
      return prev.slice(0, -1);
    });
  }

  const listRef = useRef<HTMLUListElement | null>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [path.length, search]);

  const canConfirm = isLeafSelected && !submitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        className="open:p-3 sm:open:p-4"
        bodyClassName="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-5 py-5 sm:px-6 sm:py-6"
        panelClassName="h-[min(82vh,680px)] max-h-[calc(100dvh-1.5rem)] sm:max-h-[min(82vh,700px)]"
      >
        <DialogHeader className="shrink-0 gap-1.5 text-left">
          <DialogTitle className="pr-8 text-[18px] font-bold leading-snug tracking-tight sm:text-[20px]">
            Selecione a tabulação
          </DialogTitle>
          <DialogDescription className="text-pretty text-[13px] leading-relaxed text-[var(--text-muted)]">
            Escolha o motivo do encerramento. Os níveis abrem submotivos até um
            nível final.
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0">
          <InputGlass
            ref={searchRef}
            type="search"
            withSearch
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar tabulação..."
            aria-label="Pesquisar tabulação"
            autoComplete="off"
            className="h-11 rounded-2xl"
          />
        </div>

        {folderPath.length > 0 ? (
          <nav
            className="flex min-w-0 shrink-0 flex-wrap items-center gap-1 font-body text-[13px]"
            aria-label="Nível atual"
          >
            <button
              type="button"
              className="rounded-md px-1 py-0.5 font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
              onClick={() => {
                setSearch("");
                setPath([]);
              }}
            >
              Início
            </button>
            {folderPath.map((n, i) => (
              <span key={n.id} className="flex min-w-0 items-center gap-1">
                <ChevronRight
                  size={14}
                  className="shrink-0 text-[var(--text-muted)] opacity-70"
                />
                <button
                  type="button"
                  className={cn(
                    "min-w-0 max-w-[14rem] truncate rounded-md px-1 py-0.5 text-left font-medium transition-colors",
                    i === folderPath.length - 1
                      ? "text-[var(--brand-primary)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
                  )}
                  title={n.name}
                  onClick={() => {
                    setSearch("");
                    setPath(folderPath.slice(0, i + 1));
                  }}
                >
                  {n.name}
                </button>
              </span>
            ))}
          </nav>
        ) : null}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2.5">
          {query.isLoading ? (
            <div className="flex flex-1 items-center justify-center py-8 text-center text-sm text-[var(--text-muted)]">
              Carregando…
            </div>
          ) : query.isError ? (
            <div className="flex flex-1 items-center justify-center py-8 text-center text-sm text-[var(--color-danger)]">
              Erro ao carregar tabulações.
            </div>
          ) : listed.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-[var(--glass-border)] p-4 text-center font-body text-[13px] text-[var(--text-muted)] sm:p-6">
              {isSearching
                ? `Nenhuma tabulação encontrada para “${search.trim()}”.`
                : path.length === 0
                  ? "Nenhuma tabulação disponível para este departamento."
                  : "Fim do ramo — selecione esta opção para confirmar."}
            </div>
          ) : (
            <ul
              ref={listRef}
              className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain pr-0.5"
            >
              {listed.map(({ node: n, trail }) => {
                const hasChildren = n.children.length > 0;
                const selected =
                  !hasChildren &&
                  path.length > 0 &&
                  path[path.length - 1].id === n.id;
                const trailLabel = trail.map((t) => t.name).join(" › ");
                return (
                  <li
                    key={[...trail.map((t) => t.id), n.id].join(":")}
                    className="min-w-0"
                  >
                    {hasChildren ? (
                      <FolderRow
                        name={n.name}
                        trailLabel={trailLabel}
                        count={countActiveChildren(n)}
                        onClick={() => selectNode(n, trail)}
                      />
                    ) : (
                      <LeafRow
                        name={n.name}
                        trailLabel={trailLabel}
                        selected={selected}
                        onClick={() => selectNode(n, trail)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {allowSkipAutomations ? (
            <SkipAutomationsRow
              checked={skipAutomations}
              onChange={setSkipAutomations}
            />
          ) : null}
        </div>

        <DialogFooter className="shrink-0 !flex-row !flex-wrap items-center gap-2 border-t border-[var(--glass-border-subtle)] pt-4 sm:!justify-between">
          <div className="min-w-0 flex-1">
            {folderPath.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto border-0 bg-transparent px-0 py-1 shadow-none hover:bg-transparent hover:text-[var(--text-primary)]"
                onClick={goBack}
              >
                <ChevronLeft size={16} />
                Voltar
              </Button>
            ) : (
              <p className="font-body text-[12.5px] text-[var(--text-muted)]">
                Selecione um motivo para continuar
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Button
              type="button"
              variant="ghost"
              className="border-0 bg-transparent px-3 shadow-none hover:bg-[var(--glass-bg-base)]"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {optional ? "Cancelar" : "Fechar"}
            </Button>
            <Button
              type="button"
              className="px-5"
              disabled={!canConfirm}
              onClick={() => {
                const leaf = path[path.length - 1];
                if (!leaf || leaf.children.length > 0) return;
                onConfirm(
                  leaf.id,
                  allowSkipAutomations ? { skipAutomations } : undefined,
                );
              }}
            >
              {submitting ? "Encerrando…" : "Confirmar encerramento"}
              {!submitting ? <IconArrowRight size={16} /> : null}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FolderRow({
  name,
  trailLabel,
  count,
  onClick,
}: {
  name: string;
  trailLabel?: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full min-w-0 items-center gap-3 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-3.5 py-3 text-left transition-colors hover:border-[var(--brand-primary)]/35 hover:bg-[var(--glass-bg-base)]"
      onClick={onClick}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
        <IconFolder size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block break-words font-display text-[14px] font-semibold leading-snug text-[var(--text-primary)]">
          {name}
        </span>
        {trailLabel ? (
          <span className="mt-0.5 block truncate font-body text-[11px] text-[var(--text-muted)]">
            {trailLabel}
          </span>
        ) : null}
      </span>
      <span className="shrink-0 font-body text-[12.5px] text-[var(--text-muted)]">
        {itemsLabel(count)}
      </span>
      <ChevronRight size={16} className="shrink-0 text-[var(--text-muted)]" />
    </button>
  );
}

function LeafRow({
  name,
  trailLabel,
  selected,
  onClick,
}: {
  name: string;
  trailLabel?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full min-w-0 items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors",
        selected
          ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/8"
          : "border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] hover:border-[var(--brand-primary)]/35 hover:bg-[var(--glass-bg-base)]",
      )}
      onClick={onClick}
    >
      <span
        className={cn(
          "flex size-[22px] shrink-0 items-center justify-center rounded-full border-2",
          selected
            ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white"
            : "border-[var(--glass-border)] bg-[var(--glass-bg-overlay)]",
        )}
        aria-hidden
      >
        {selected ? <IconCheck size={12} stroke={3} /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block break-words font-display text-[14px] font-semibold leading-snug text-[var(--text-primary)]">
          {name}
        </span>
        {trailLabel ? (
          <span className="mt-0.5 block truncate font-body text-[11px] text-[var(--text-muted)]">
            {trailLabel}
          </span>
        ) : null}
      </span>
      <span
        className={cn(
          "shrink-0 font-display text-[10px] font-bold uppercase tracking-[0.12em]",
          selected
            ? "text-[var(--brand-primary)]"
            : "text-[var(--text-muted)]",
        )}
      >
        {selected ? "Selecionado" : "Selecionar"}
      </span>
    </button>
  );
}

function SkipAutomationsRow({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      className={cn(
        "flex w-full shrink-0 items-center gap-3 rounded-xl border border-dashed px-3.5 py-3 text-left transition-colors",
        checked
          ? "border-[var(--color-warning)] bg-[var(--color-warning)]/12"
          : "border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] hover:bg-[var(--glass-bg-base)]",
      )}
      onClick={() => onChange(!checked)}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg",
          checked
            ? "bg-[var(--color-warning)]/25 text-[var(--color-warning-text)]"
            : "bg-[var(--glass-bg-base)] text-[var(--text-muted)]",
        )}
      >
        <IconClockHour4 size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[13.5px] font-semibold leading-snug text-[var(--text-primary)]">
          Encerrar sem executar nenhuma automação
        </span>
        <span className="mt-0.5 block font-body text-[12px] leading-relaxed text-[var(--text-muted)]">
          Nenhum fluxo ligado ao encerramento será disparado.
        </span>
      </span>
      <span
        className={cn(
          "flex size-[22px] shrink-0 items-center justify-center rounded-full border-2",
          checked
            ? "border-[var(--color-warning)] bg-[var(--color-warning)] text-white"
            : "border-[var(--glass-border)] bg-[var(--glass-bg-overlay)]",
        )}
        aria-hidden
      >
        {checked ? <IconCheck size={12} stroke={3} /> : null}
      </span>
    </button>
  );
}
