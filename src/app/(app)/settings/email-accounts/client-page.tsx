"use client";

import * as React from "react";
import {
  IconBell,
  IconCheck,
  IconFilter,
  IconFolder,
  IconMail,
  IconPlus,
  IconRefresh,
  IconTrash,
  IconUser,
  IconUsers,
  IconX,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { DropdownGlass } from "@/components/crm/dropdown-glass";
import { InputGlass } from "@/components/crm/input-glass";
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
import { SwitchGlass } from "@/components/crm/switch-glass";
import { HeaderTabs } from "@/components/crm/section-header";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ConnectEmailModal } from "@/features/email-v2";
import {
  useEmailAccounts,
  useEmailCustomFolders,
  useEmailRules,
} from "@/features/email-v2/hooks";
import type {
  EmailAccount,
  EmailRule,
  EmailRuleAction,
  EmailRuleField,
} from "@/features/email-v2/api/types";
import { AppLoading } from "@/components/crm/app-loading";
import { cn } from "@/lib/utils";
import { SETTINGS_HUB_BACK, SettingsV2Shell, useSettingsHeaderSlots } from "../_v2-shell";

// ── Constants ─────────────────────────────────────────────────────────────────
const TABS = ["Contas", "Regras de filtro"] as const;
const ACCOUNTS_GRID = "minmax(0,1.8fr) 160px 110px 140px max-content";
const RULES_GRID = "minmax(0,1.4fr) 60px minmax(0,1fr) 150px 64px max-content";

const FIELD_LABELS: Record<EmailRuleField, string> = {
  FROM: "Enviado de",
  TO: "Enviado para",
  SUBJECT: "Assunto",
};

type SortFieldAccounts = "email" | "imapHost" | "visibility" | "lastSyncedAt";
type SortFieldRules = "name" | "priority";
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
      description="Gerencie caixas IMAP/SMTP, pastas e regras de filtro"
      icon={<IconMail size={22} />}
    >
      <EmailAccountsBody />
    </SettingsV2Shell>
  );
}

// ── Body — runs inside the Shell's slot context ───────────────────────────────
function EmailAccountsBody() {
  const slots = useSettingsHeaderSlots();
  const [activeTab, setActiveTab] = React.useState(0);
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
        placeholder={activeTab === 0 ? "Buscar conta de e-mail…" : "Buscar regra…"}
        ariaLabel={activeTab === 0 ? "Buscar contas" : "Buscar regras"}
        onClearAll={() => setSearch("")}
      />
    ),
    [search, activeTab],
  );

  /* Actions slot: tabs inline + hamburger CTA. */
  const actionsNode = React.useMemo(
    () => (
      <div className="flex items-center gap-2">
        <HeaderTabs
          tabs={TABS.map((label, index) => ({ key: String(index), label }))}
          value={String(activeTab)}
          onChange={(key) => setActiveTab(Number(key))}
        />
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
      </div>
    ),
    [activeTab, openConnect],
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
      {activeTab === 0 && (
        <AccountsList
          accounts={accounts}
          loading={accountsLoading}
          onSync={sync}
          onDisconnect={disconnect}
          onConnect={openConnect}
          confirm={confirm}
          search={search}
        />
      )}

      {activeTab === 1 && (
        <RulesPanel accounts={accounts} confirm={confirm} search={search} />
      )}

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

// ── Rules tab ─────────────────────────────────────────────────────────────────
function RulesPanel({
  accounts,
  confirm,
  search,
}: {
  accounts: EmailAccount[];
  confirm: ConfirmFn;
  search: string;
}) {
  const [selectedAccountId, setSelectedAccountId] = React.useState<string | undefined>(
    accounts[0]?.id,
  );

  React.useEffect(() => {
    if (!selectedAccountId && accounts[0]) setSelectedAccountId(accounts[0].id);
  }, [accounts, selectedAccountId]);

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg-base)] py-12">
        <IconMail size={28} className="text-[var(--text-muted)] opacity-40" />
        <p className="text-[13px] text-[var(--text-muted)]">
          Conecte uma conta antes de criar regras.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Account pill selector — preserved */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Conta:
        </span>
        {accounts.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setSelectedAccountId(a.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors",
              selectedAccountId === a.id
                ? "bg-[var(--brand-primary)] text-white"
                : "border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-secondary)] hover:border-[var(--brand-primary)]",
            )}
          >
            {a.email}
          </button>
        ))}
      </div>

      {selectedAccountId && (
        <AccountRules accountId={selectedAccountId} confirm={confirm} search={search} />
      )}
    </div>
  );
}

function AccountRules({
  accountId,
  confirm,
  search,
}: {
  accountId: string;
  confirm: ConfirmFn;
  search: string;
}) {
  const { rules, loading, create, update, remove } = useEmailRules(accountId);
  const { folders } = useEmailCustomFolders(accountId);
  const [showForm, setShowForm] = React.useState(false);
  const [sortBy, setSortBy] = React.useState<SortFieldRules>("name");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");

  const activeCount = rules.filter((r) => r.isActive).length;
  const inactiveCount = rules.length - activeCount;
  const moveCount = rules.filter((r) => r.action === "MOVE").length;
  const trashCount = rules.filter((r) => r.action === "TRASH").length;

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rules;
    return rules.filter((r) => r.name.toLowerCase().includes(q));
  }, [rules, search]);

  const sorted = React.useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "name":
          cmp = a.name.localeCompare(b.name, "pt-BR");
          break;
        case "priority":
          cmp = (a.priority ?? 0) - (b.priority ?? 0);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortBy, sortDir]);

  const toggleSort = React.useCallback((field: SortFieldRules) => {
    setSortBy((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir(field === "name" ? "asc" : "desc");
      return field;
    });
  }, []);

  const dirFor = (f: SortFieldRules): SortDir => (sortBy === f ? sortDir : null);

  return (
    <div className="flex w-full min-w-0 flex-col gap-3.5">
      {/* KPI minidash */}
      <KpiStrip aria-label="Indicadores de regras">
        <KpiCard
          label="Total regras"
          value={rules.length.toLocaleString("pt-BR")}
          icon={<IconFilter size={20} stroke={2.2} />}
          tone="brand"
        />
        <KpiCard
          label="Ativas"
          value={activeCount.toLocaleString("pt-BR")}
          icon={<IconCheck size={20} stroke={2.2} />}
          tone="success"
        />
        <KpiCard
          label="Inativas"
          value={inactiveCount.toLocaleString("pt-BR")}
          icon={<IconX size={20} stroke={2.2} />}
          tone="neutral"
        />
        <KpiCard
          label="Mover pasta"
          value={moveCount.toLocaleString("pt-BR")}
          icon={<IconFolder size={20} stroke={2.2} />}
          tone="violet"
        />
        <KpiCard
          label="Lixeira"
          value={trashCount.toLocaleString("pt-BR")}
          icon={<IconTrash size={20} stroke={2.2} />}
          tone="warning"
        />
      </KpiStrip>

      {/* Create bar */}
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-pretty break-words text-[13px] text-[var(--text-muted)]">
          Primeira regra que bate vence (ordem por prioridade). Aplica-se a novas mensagens recebidas.
        </p>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--brand-primary)] px-3 py-1.5 font-display text-[12px] font-bold text-[var(--brand-primary)] transition-colors hover:bg-[var(--color-enterprise-bg,rgba(91,111,245,0.12))]"
        >
          <IconPlus size={13} /> Nova regra
        </button>
      </div>

      {/* Inline create form — preserved */}
      {showForm && (
        <RuleForm
          accountId={accountId}
          folders={folders}
          onCancel={() => setShowForm(false)}
          onSubmit={async (input) => {
            await create(input);
            setShowForm(false);
          }}
        />
      )}

      {loading ? (
        <AppLoading variant="inline" className="min-h-0 flex-1" />
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg-base)] py-12">
          <IconFilter size={32} className="text-[var(--text-muted)] opacity-40" />
          <p className="text-[13px] text-[var(--text-muted)]">
            {search.trim()
              ? `Nenhuma regra encontrada para "${search}".`
              : "Nenhuma regra cadastrada."}
          </p>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-2">
          <div
            className={listTableHeadRowClass("gap-3 border border-transparent px-4")}
            style={{ gridTemplateColumns: RULES_GRID }}
          >
            <SortableHeader
              label="Nome"
              sort={dirFor("name")}
              onSort={() => toggleSort("name")}
            />
            <SortableHeader
              label="Prioridade"
              sort={dirFor("priority")}
              onSort={() => toggleSort("priority")}
            />
            <ListColumnLabel>Condição</ListColumnLabel>
            <ListColumnLabel>Ação</ListColumnLabel>
            <ListColumnLabel>Ativa</ListColumnLabel>
            <ListColumnLabel align="right">Ações</ListColumnLabel>
          </div>

          {sorted.map((rule) => {
            const target = folders.find((f) => f.id === rule.targetFolderId);
            return (
              <div
                key={rule.id}
                style={{ gridTemplateColumns: RULES_GRID }}
                className={cn(
                  "group grid items-center gap-3 rounded-[var(--radius-xl)] border px-4 py-3 shadow-[var(--glass-shadow-sm)] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:shadow-[var(--glass-shadow)]",
                  rule.isActive
                    ? "border-[var(--glass-border)] bg-[var(--glass-bg-base)] hover:border-[var(--input-border-focus)]"
                    : "border-[var(--glass-border)] bg-[var(--glass-bg-base)] opacity-60 hover:border-[var(--input-border-focus)]",
                )}
              >
                <div className="min-w-0">
                  <p className="truncate font-display text-[13.5px] font-bold text-[var(--text-primary)]">
                    {rule.name}
                  </p>
                </div>

                <span className="font-display text-[13px] text-[var(--text-secondary)]">
                  {rule.priority ?? "—"}
                </span>

                <span className="truncate font-display text-[12px] text-[var(--text-secondary)]">
                  {FIELD_LABELS[rule.conditionField] ?? rule.conditionField}: &ldquo;
                  {rule.conditionValue}&rdquo;
                </span>

                <span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 font-display text-[11px] font-bold",
                      rule.action === "TRASH"
                        ? "bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] text-[var(--color-danger)]"
                        : "bg-[var(--color-enterprise-bg,rgba(91,111,245,0.12))] text-[var(--brand-primary)]",
                    )}
                  >
                    {rule.action === "TRASH" ? "Lixeira" : `Mover: ${target?.name ?? "—"}`}
                  </span>
                </span>

                <span>
                  <SwitchGlass
                    checked={rule.isActive}
                    onChange={(active) => void update(rule.id, { isActive: active })}
                    size="sm"
                    aria-label={rule.isActive ? "Desativar regra" : "Ativar regra"}
                  />
                </span>

                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await confirm({
                        title: `Remover a regra "${rule.name}"?`,
                        description:
                          "Mensagens já filtradas permanecem onde estão. A regra deixa de se aplicar a novas mensagens.",
                        confirmLabel: "Remover",
                        destructive: true,
                      });
                      if (!ok) return;
                      try {
                        await remove(rule.id);
                        toast.success("Regra removida.");
                      } catch (err) {
                        toast.error(
                          err instanceof Error ? err.message : "Erro ao remover regra.",
                        );
                      }
                    }}
                    aria-label={`Remover ${rule.name}`}
                    className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] hover:text-[var(--color-danger)]"
                  >
                    <IconTrash size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Rule form (preserved) ─────────────────────────────────────────────────────
function RuleForm({
  accountId,
  folders,
  onCancel,
  onSubmit,
}: {
  accountId: string;
  folders: { id: string; name: string }[];
  onCancel: () => void;
  onSubmit: (input: {
    accountId: string;
    name: string;
    conditionField: EmailRuleField;
    conditionValue: string;
    action: EmailRuleAction;
    targetFolderId?: string | null;
  }) => Promise<void>;
}) {
  const [name, setName] = React.useState("");
  const [conditionField, setConditionField] = React.useState<EmailRuleField>("FROM");
  const [conditionValue, setConditionValue] = React.useState("");
  const [action, setAction] = React.useState<EmailRuleAction>("MOVE");
  const [targetFolderId, setTargetFolderId] = React.useState<string>(folders[0]?.id ?? "");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Dê um nome à regra.");
    if (!conditionValue.trim()) return setError("Informe o valor da condição.");
    if (action === "MOVE" && !targetFolderId) {
      return setError("Crie uma pasta antes de usar a ação 'Mover para'.");
    }

    setSubmitting(true);
    try {
      await onSubmit({
        accountId,
        name: name.trim(),
        conditionField,
        conditionValue: conditionValue.trim(),
        action,
        targetFolderId: action === "MOVE" ? targetFolderId : null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-[var(--radius-xl)] border border-[var(--brand-primary)] bg-[var(--glass-bg-base)] p-4"
    >
      <p className="font-display text-[13px] font-bold text-[var(--text-primary)]">Nova regra</p>

      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Nome
        </span>
        <InputGlass
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex.: Boletos da Receita"
        />
      </label>

      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[160px_1fr]">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Campo
          </span>
          <DropdownGlass
            value={conditionField}
            onValueChange={(v) => setConditionField(v as EmailRuleField)}
            options={[
              { value: "FROM", label: "Enviado de" },
              { value: "TO", label: "Enviado para" },
              { value: "SUBJECT", label: "Assunto" },
            ]}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Contém o texto
          </span>
          <InputGlass
            type="text"
            value={conditionValue}
            onChange={(e) => setConditionValue(e.target.value)}
            placeholder="ex.: receita.gov.br"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[160px_1fr]">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Ação
          </span>
          <DropdownGlass
            value={action}
            onValueChange={(v) => setAction(v as EmailRuleAction)}
            options={[
              { value: "MOVE", label: "Mover para pasta" },
              { value: "TRASH", label: "Excluir (mover para lixeira)" },
            ]}
          />
        </label>

        {action === "MOVE" && (
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Pasta de destino
            </span>
            <DropdownGlass
              value={targetFolderId}
              onValueChange={setTargetFolderId}
              disabled={folders.length === 0}
              placeholder="Nenhuma pasta — crie no Inbox"
              options={
                folders.length === 0
                  ? [{ value: "", label: "Nenhuma pasta — crie no Inbox", disabled: true }]
                  : folders.map((f) => ({ value: f.id, label: f.name }))
              }
            />
          </label>
        )}
      </div>

      {error && (
        <p className="text-[12px] font-semibold text-[var(--color-danger)]">{error}</p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-black/5"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-primary)] px-4 py-1.5 text-[12px] font-bold text-white transition-colors hover:bg-[var(--brand-primary-dark,#3d52e8)] disabled:opacity-50"
        >
          {submitting ? "Salvando…" : "Salvar regra"}
        </button>
      </div>
    </form>
  );
}
