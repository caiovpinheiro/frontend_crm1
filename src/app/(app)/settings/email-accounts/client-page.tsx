"use client";

import * as React from "react";
import {
  IconBell,
  IconMail,
  IconPlus,
  IconRefresh,
  IconTrash,
  IconUser,
  IconUsers,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { KpiCard } from "@/components/crm/kpi-card";
import { KpiStrip } from "@/components/crm/kpi-strip";
import { PageActionsMenu } from "@/components/crm/page-toolbar";
import { SettingsListFilterBar } from "@/components/crm/settings-filter-bar";
import {
  LIST_ACTIONS_CELL_CLASS,
  ListColumnLabel,
  SortableHeader,
  listTableHeadRowClass,
  type SortDir,
} from "@/components/crm/sortable-header";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ConnectEmailModal } from "@/features/email-v2";
import { useEmailAccounts } from "@/features/email-v2/hooks";
import type { EmailAccount } from "@/features/email-v2/api/types";
import { AppLoading } from "@/components/crm/app-loading";
import { cn } from "@/lib/utils";
import { SETTINGS_HUB_BACK, SettingsV2Shell, useSettingsHeaderSlots } from "../_v2-shell";

const ACCOUNTS_GRID = "minmax(0,1.8fr) 160px 110px 140px max-content";

type SortFieldAccounts = "email" | "imapHost" | "visibility" | "lastSyncedAt";
type ConfirmFn = ReturnType<typeof useConfirm>["confirm"];

function relativeDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "Nunca";
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2) return "agora";
  if (mins < 60) return `há ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "ontem";
  if (days < 7) return `há ${days} dias`;
  return d.toLocaleDateString("pt-BR");
}

// ── Page shell ────────────────────────────────────────────────────────────────
export default function EmailAccountsClientPage() {
  return (
    <SettingsV2Shell
      back={SETTINGS_HUB_BACK}
      title="Contas de e-mail"
      description="Conecte Gmail, Outlook, UOL ou outro provedor. Regras e ausência ficam na caixa de e-mail."
      icon={<IconMail size={22} />}
    >
      <EmailAccountsBody />
    </SettingsV2Shell>
  );
}

// ── Body — runs inside the Shell's slot context ───────────────────────────────
function EmailAccountsBody() {
  const slots = useSettingsHeaderSlots();
  const [connectOpen, setConnectOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const { confirm, dialog: confirmDialog } = useConfirm();

  const {
    accounts,
    loading: accountsLoading,
    reload: reloadAccounts,
    disconnect,
    sync,
  } = useEmailAccounts();

  const openConnect = React.useCallback(() => setConnectOpen(true), []);

  /* Center slot: canonical search bar. */
  const searchNode = React.useMemo(
    () => (
      <SettingsListFilterBar
        search={search}
        onSearch={setSearch}
        placeholder="Buscar conta de e-mail…"
        ariaLabel="Buscar contas"
        onClearAll={() => setSearch("")}
      />
    ),
    [search],
  );

  const actionsNode = React.useMemo(
    () => (
      <PageActionsMenu
        aria-label="Ações de e-mail"
        items={[
          {
            icon: <IconPlus size={16} />,
            label: "Conectar e-mail",
            onClick: openConnect,
            primary: true,
          },
        ]}
      />
    ),
    [openConnect],
  );

  /* Inject into PageHeader via shell context — canonical pattern. */
  React.useEffect(() => {
    if (!slots) return;
    slots.setCenter(searchNode);
    slots.setActions(actionsNode);
    return () => {
      slots.setCenter(null);
      slots.setActions(null);
    };
  }, [slots, searchNode, actionsNode]);

  return (
    <div className="flex w-full min-w-0 flex-col gap-3.5">
      <AccountsList
        accounts={accounts}
        loading={accountsLoading}
        onSync={sync}
        onDisconnect={disconnect}
        onConnect={openConnect}
        confirm={confirm}
        search={search}
      />

      <ConnectEmailModal
        open={connectOpen}
        onOpenChange={setConnectOpen}
        onSuccess={async () => {
          await reloadAccounts();
        }}
      />

      {confirmDialog}
    </div>
  );
}

// ── Accounts tab ──────────────────────────────────────────────────────────────
function AccountsList({
  accounts,
  loading,
  onSync,
  onDisconnect,
  onConnect,
  confirm,
  search,
}: {
  accounts: EmailAccount[];
  loading: boolean;
  onSync: (id: string) => Promise<unknown>;
  onDisconnect: (id: string) => Promise<void>;
  onConnect: () => void;
  confirm: ConfirmFn;
  search: string;
}) {
  const [syncing, setSyncing] = React.useState<string | null>(null);
  const [sortBy, setSortBy] = React.useState<SortFieldAccounts>("email");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");

  const personal = accounts.filter((a) => a.visibility === "PERSONAL").length;
  const shared = accounts.filter((a) => a.visibility === "SHARED").length;
  const withUnread = accounts.filter((a) => (a.unreadCount ?? 0) > 0).length;

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) => a.email.toLowerCase().includes(q) || a.imapHost.toLowerCase().includes(q),
    );
  }, [accounts, search]);

  const sorted = React.useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "email":
          cmp = a.email.localeCompare(b.email, "pt-BR");
          break;
        case "imapHost":
          cmp = a.imapHost.localeCompare(b.imapHost, "pt-BR");
          break;
        case "visibility":
          cmp = a.visibility.localeCompare(b.visibility);
          break;
        case "lastSyncedAt": {
          const tA = a.lastSyncedAt ? new Date(a.lastSyncedAt).getTime() : 0;
          const tB = b.lastSyncedAt ? new Date(b.lastSyncedAt).getTime() : 0;
          cmp = tA - tB;
          break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortBy, sortDir]);

  const toggleSort = React.useCallback((field: SortFieldAccounts) => {
    setSortBy((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir("asc");
      return field;
    });
  }, []);

  const dirFor = (f: SortFieldAccounts): SortDir => (sortBy === f ? sortDir : null);

  async function handleSync(id: string) {
    setSyncing(id);
    try {
      await onSync(id);
    } finally {
      setSyncing(null);
    }
  }

  async function handleDisconnect(id: string, email: string) {
    const ok = await confirm({
      title: `Desconectar "${email}"?`,
      description:
        "Todos os e-mails sincronizados dessa conta serão removidos do CRM. A caixa original no servidor não é afetada.",
      confirmLabel: "Desconectar",
      destructive: true,
    });
    if (!ok) return;
    try {
      await onDisconnect(id);
      toast.success("Conta desconectada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao desconectar.");
    }
  }

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-3.5">
      {loading ? (
        <AppLoading variant="inline" className="min-h-0 flex-1" />
      ) : (
      <>
      {/* KPI minidash */}
      <KpiStrip
        aria-label="Indicadores de contas"
        gridClassName="grid grid-cols-2 gap-2.5 sm:gap-3.5 lg:grid-cols-4"
      >
        <KpiCard
          label="Total contas"
          value={accounts.length.toLocaleString("pt-BR")}
          icon={<IconMail size={20} stroke={2.2} />}
          tone="brand"
        />
        <KpiCard
          label="Pessoais"
          value={personal.toLocaleString("pt-BR")}
          icon={<IconUser size={20} stroke={2.2} />}
          tone="violet"
        />
        <KpiCard
          label="Compartilhadas"
          value={shared.toLocaleString("pt-BR")}
          icon={<IconUsers size={20} stroke={2.2} />}
          tone="success"
        />
        <KpiCard
          label="Com não-lidos"
          value={withUnread.toLocaleString("pt-BR")}
          icon={<IconBell size={20} stroke={2.2} />}
          tone="warning"
        />
      </KpiStrip>

      {accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg-base)] py-16">
          <IconMail size={40} className="text-[var(--text-muted)] opacity-40" />
          <p className="text-sm text-[var(--text-muted)]">Nenhuma conta de e-mail conectada ainda.</p>
          <button
            type="button"
            onClick={onConnect}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-primary)] px-4 py-2 font-display text-[13px] font-bold text-white shadow-[0_4px_14px_rgba(91,111,245,0.35)] transition-all hover:-translate-y-px hover:bg-[var(--brand-primary-dark,#3d52e8)]"
          >
            <IconPlus size={15} /> Conectar primeira conta
          </button>
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg-base)] py-16">
          <IconMail size={40} className="text-[var(--text-muted)] opacity-40" />
          <p className="text-sm text-[var(--text-muted)]">
            Nenhuma conta encontrada para &ldquo;{search}&rdquo;.
          </p>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-2">
          <div
            className={listTableHeadRowClass("gap-3 border border-transparent px-4")}
            style={{ gridTemplateColumns: ACCOUNTS_GRID }}
          >
            <SortableHeader
              label="E-mail"
              sort={dirFor("email")}
              onSort={() => toggleSort("email")}
            />
            <SortableHeader
              label="Servidor IMAP"
              sort={dirFor("imapHost")}
              onSort={() => toggleSort("imapHost")}
            />
            <SortableHeader
              label="Visibilidade"
              sort={dirFor("visibility")}
              onSort={() => toggleSort("visibility")}
            />
            <SortableHeader
              label="Última sync"
              sort={dirFor("lastSyncedAt")}
              onSort={() => toggleSort("lastSyncedAt")}
            />
            <ListColumnLabel align="right">Ações</ListColumnLabel>
          </div>

          {sorted.map((acc) => (
            <div
              key={acc.id}
              style={{ gridTemplateColumns: ACCOUNTS_GRID }}
              className="group grid items-center gap-3 rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-4 py-3 shadow-[var(--glass-shadow-sm)] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-[var(--input-border-focus)] hover:shadow-[var(--glass-shadow)]"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)] font-display text-[14px] font-bold text-white">
                  {acc.email[0]?.toUpperCase()}
                </span>
                <div className="min-w-0 leading-tight">
                  <p className="truncate font-display text-[14px] font-bold text-[var(--text-primary)]">
                    {acc.email}
                  </p>
                  {(acc.unreadCount ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-lead-bg)] px-2 py-0.5 font-display text-[11px] font-bold text-[var(--color-warning)]">
                      {acc.unreadCount} não-lido{(acc.unreadCount ?? 0) > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>

              <span className="truncate font-display text-[13px] text-[var(--text-secondary)]">
                {acc.imapHost}
              </span>

              <span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 font-display text-[11px] font-bold",
                    acc.visibility === "SHARED"
                      ? "bg-[var(--color-success-bg)] text-[var(--color-success)]"
                      : "bg-[var(--glass-bg-overlay)] text-[var(--text-muted)]",
                  )}
                >
                  {acc.visibility === "SHARED" ? "Compartilhada" : "Pessoal"}
                </span>
              </span>

              <span className="truncate font-display text-[13px] text-[var(--text-secondary)]">
                {relativeDate(acc.lastSyncedAt)}
              </span>

              <div className={LIST_ACTIONS_CELL_CLASS}>
                <button
                  type="button"
                  onClick={() => void handleSync(acc.id)}
                  disabled={syncing === acc.id}
                  aria-label={`Sincronizar ${acc.email}`}
                  className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] text-[var(--brand-primary)] transition-colors hover:bg-[var(--color-primary-soft)] disabled:opacity-50"
                >
                  <span className={syncing === acc.id ? "animate-spin inline-flex" : "inline-flex"}>
                    <IconRefresh size={15} />
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleDisconnect(acc.id, acc.email)}
                  aria-label={`Desconectar ${acc.email}`}
                  className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] hover:text-[var(--color-danger)]"
                >
                  <IconTrash size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      </>
      )}
    </div>
  );
}

