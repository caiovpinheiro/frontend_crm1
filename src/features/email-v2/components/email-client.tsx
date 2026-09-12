"use client";

import * as React from "react";
import Link from "next/link";
import { IconArrowLeft, IconFilter, IconMail } from "@tabler/icons-react";
import { toast } from "sonner";

import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";
import { PageHeader } from "@/components/crm/page-header";
import {
  PageGhostButton,
  PagePrimaryButton,
  PageSearchBar,
} from "@/components/crm/page-toolbar";
import { ColumnResizer, usePersistentWidth } from "@/components/crm/column-resizer";
import { useIsMobile } from "@/hooks/use-media-query";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

import { EmailList } from "./email-list";
import { EmailReader } from "./email-reader";
import { EmailSidebar } from "./email-sidebar";
import { EmailRulesModal } from "./email-rules-modal";
import { ComposeView } from "./compose-view";
import { useEmailAccounts, useEmailCustomFolders, useEmailDetail, useEmails } from "../hooks";
import { deleteEmail, moveEmail } from "../api/emails";
import type { EmailAccount, EmailCustomFolder, EmailFolder } from "../api/types";
import {
  buildComposeDraft,
  newComposeDraft,
  type ComposeDraft,
} from "../utils/compose-draft";

const POLL_INTERVAL_MS = 5 * 60 * 1000;

type MobilePane = "folders" | "list" | "detail" | "compose";

function folderUnreadFor(account: EmailAccount, folder: EmailFolder): number {
  const counts = account.folderUnread;
  if (!counts) return folder === "INBOX" ? account.unreadCount : 0;
  if (folder === "INBOX") return counts.inbox;
  if (folder === "SENT") return counts.sent;
  return counts.trash;
}

function currentFolderUnread(
  accounts: EmailAccount[],
  customFolders: EmailCustomFolder[],
  selectedAccountId: string | undefined,
  selectedFolder: EmailFolder,
  selectedCustomFolderId: string | null,
): number {
  if (selectedCustomFolderId) {
    return customFolders.find((f) => f.id === selectedCustomFolderId)?.unreadCount ?? 0;
  }
  if (selectedAccountId) {
    const acc = accounts.find((a) => a.id === selectedAccountId);
    return acc ? folderUnreadFor(acc, selectedFolder) : 0;
  }
  if (selectedFolder === "INBOX") {
    return (
      accounts.reduce((s, a) => s + folderUnreadFor(a, "INBOX"), 0) +
      customFolders.reduce((s, f) => s + f.unreadCount, 0)
    );
  }
  return accounts.reduce((s, a) => s + folderUnreadFor(a, selectedFolder), 0);
}

const IcoCompose = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

const IcoRefresh = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9a8 8 0 0 1 13-3l2 2M21 4v4h-4" />
    <path d="M21 15a8 8 0 0 1-13 3l-2-2M3 20v-4h4" />
  </svg>
);

export function EmailClient() {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const isMobile = useIsMobile();

  const {
    accounts,
    loading: accountsLoading,
    sync,
    reload: reloadAccounts,
  } = useEmailAccounts();

  const [sidebarWidth, setSidebarWidth] = usePersistentWidth("email-v2:sidebar", 248);
  const [listWidth, setListWidth] = usePersistentWidth("email-v2:list", 380);

  const [selectedAccountId, setSelectedAccountId] = React.useState<string | undefined>(undefined);
  const [selectedFolder, setSelectedFolder] = React.useState<EmailFolder>("INBOX");
  const [selectedCustomFolderId, setSelectedCustomFolderId] = React.useState<string | null>(null);
  const [selectedEmailId, setSelectedEmailId] = React.useState<string | null>(null);
  const [composing, setComposing] = React.useState(false);
  const [composeDraft, setComposeDraft] = React.useState<ComposeDraft>(newComposeDraft());
  const [rulesOpen, setRulesOpen] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [lastSyncMsg, setLastSyncMsg] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [unreadOnly, setUnreadOnly] = React.useState(false);
  const [mobilePane, setMobilePane] = React.useState<MobilePane>("list");

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const {
    folders: customFolders,
    create: createCustomFolder,
    remove: removeCustomFolder,
    reload: reloadCustomFolders,
  } = useEmailCustomFolders();

  const {
    emails,
    loading: emailsLoading,
    error: emailsError,
    refresh: refreshEmails,
    markRead,
    searching,
  } = useEmails({
    accountId: selectedAccountId,
    folder: selectedCustomFolderId ? undefined : selectedFolder,
    customFolderId: selectedCustomFolderId ?? undefined,
    search: debouncedSearch || undefined,
    unreadOnly,
  });

  const { email: emailDetail, loading: detailLoading } = useEmailDetail(
    composing ? null : selectedEmailId,
  );

  const accountEmailMap = React.useMemo(
    () => Object.fromEntries(accounts.map((a) => [a.id, a.email])),
    [accounts],
  );

  const refreshUnreadCounts = React.useCallback(() => {
    void reloadAccounts();
    void reloadCustomFolders();
  }, [reloadAccounts, reloadCustomFolders]);

  React.useEffect(() => {
    if (accounts.length === 0) return;
    const timer = setInterval(() => {
      accounts.forEach((a) => void sync(a.id).catch(() => {}));
      setTimeout(() => {
        refreshEmails();
        refreshUnreadCounts();
      }, 3000);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [accounts, sync, refreshEmails, refreshUnreadCounts]);

  async function handleRefresh() {
    setSyncing(true);
    setLastSyncMsg(null);
    try {
      let total = 0;
      for (const a of accounts) {
        try {
          const r = await sync(a.id);
          total += r.synced;
        } catch {
          /* continua as outras contas */
        }
      }
      refreshEmails();
      refreshUnreadCounts();
      if (total > 0) {
        setLastSyncMsg(`${total} nova${total > 1 ? "s" : ""}`);
        setTimeout(() => setLastSyncMsg(null), 4000);
      }
    } finally {
      setSyncing(false);
    }
  }

  function openCompose(draft: ComposeDraft = newComposeDraft(selectedAccountId)) {
    setComposeDraft(draft);
    setComposing(true);
    setMobilePane("compose");
  }

  function handleSelect(id: string) {
    setComposing(false);
    setSelectedEmailId(id);
    setMobilePane("detail");
    void markRead(id, true).then(() => refreshUnreadCounts());
  }

  function handleFolderChange(folder: EmailFolder) {
    setSelectedFolder(folder);
    setSelectedCustomFolderId(null);
    setSelectedEmailId(null);
    setComposing(false);
    setQuery("");
    setMobilePane("list");
  }

  function handleSelectCustomFolder(folderId: string) {
    setSelectedCustomFolderId(folderId);
    setSelectedEmailId(null);
    setComposing(false);
    setQuery("");
    setMobilePane("list");
  }

  async function handleCreateFolder(accountId: string, name: string) {
    const folder = await createCustomFolder({ accountId, name });
    setSelectedAccountId(accountId);
    setSelectedCustomFolderId(folder.id);
    setSelectedEmailId(null);
    setComposing(false);
    setQuery("");
    setMobilePane("list");
  }

  async function handleDeleteCustomFolder(folderId: string) {
    const folder = customFolders.find((f) => f.id === folderId);
    const ok = await confirm({
      title: `Remover a pasta "${folder?.name ?? ""}"?`,
      description: "As mensagens voltam para a Caixa de entrada. A pasta em si será apagada.",
      confirmLabel: "Remover",
      destructive: true,
    });
    if (!ok) return;
    try {
      await removeCustomFolder(folderId);
      if (selectedCustomFolderId === folderId) {
        setSelectedCustomFolderId(null);
        setSelectedFolder("INBOX");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover pasta.");
    }
  }

  async function handleDelete(id: string) {
    try {
      await moveEmail(id, { systemFolder: "TRASH", customFolderId: null });
      if (selectedEmailId === id) {
        setSelectedEmailId(null);
        if (isMobile) setMobilePane("list");
      }
      refreshEmails();
      refreshUnreadCounts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao mover para lixeira.");
    }
  }

  function handleSend(id: string) {
    setComposing(false);
    setComposeDraft(newComposeDraft(selectedAccountId));
    setSelectedCustomFolderId(null);
    setSelectedFolder("SENT");
    setUnreadOnly(false);
    setQuery("");
    setSelectedEmailId(id);
    setMobilePane("detail");
    toast.success("E-mail enviado.");
    refreshEmails();
    refreshUnreadCounts();
  }

  function handleReply() {
    if (!emailDetail) return;
    openCompose(buildComposeDraft(emailDetail, "reply"));
  }

  function handleForward() {
    if (!emailDetail) return;
    openCompose(buildComposeDraft(emailDetail, "forward"));
  }

  function handleCancelCompose() {
    setComposing(false);
    setMobilePane(selectedEmailId ? "detail" : "list");
  }

  async function handleRestore(id: string) {
    try {
      await moveEmail(id, { systemFolder: "INBOX" });
      refreshEmails();
      refreshUnreadCounts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao restaurar.");
    }
  }

  async function handleDeletePermanent(id: string) {
    const ok = await confirm({
      title: "Excluir permanentemente?",
      description: "Essa ação não pode ser desfeita. O e-mail será apagado da lixeira.",
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteEmail(id);
      if (selectedEmailId === id) {
        setSelectedEmailId(null);
        if (isMobile) setMobilePane("list");
      }
      refreshEmails();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir.");
    }
  }

  async function handleMoveToCustomFolder(emailId: string, folderId: string) {
    try {
      await moveEmail(emailId, { systemFolder: "INBOX", customFolderId: folderId });
      refreshEmails();
      refreshUnreadCounts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao mover.");
    }
  }

  async function handleRemoveFromCustomFolder(emailId: string) {
    try {
      await moveEmail(emailId, { customFolderId: null });
      refreshEmails();
      refreshUnreadCounts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao mover.");
    }
  }

  async function handleDropToSystemFolder(emailId: string, folder: EmailFolder) {
    if (folder === "TRASH") return handleDelete(emailId);
    try {
      await moveEmail(emailId, { systemFolder: folder, customFolderId: null });
      refreshEmails();
      refreshUnreadCounts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao mover.");
    }
  }

  async function handleToggleRead(id: string, isRead: boolean) {
    await markRead(id, isRead);
    refreshEmails();
    refreshUnreadCounts();
  }

  const folderUnread = React.useMemo(
    () =>
      searching
        ? 0
        : currentFolderUnread(
            accounts,
            customFolders,
            selectedAccountId,
            selectedFolder,
            selectedCustomFolderId,
          ),
    [accounts, customFolders, selectedAccountId, selectedFolder, selectedCustomFolderId, searching],
  );

  const folderLabel = React.useMemo(() => {
    if (searching) return `Resultados: “${debouncedSearch}”`;
    if (selectedCustomFolderId) {
      return customFolders.find((x) => x.id === selectedCustomFolderId)?.name ?? "Pasta";
    }
    if (selectedFolder === "INBOX") return "Caixa de entrada";
    if (selectedFolder === "SENT") return "Enviados";
    return "Excluídos";
  }, [selectedFolder, selectedCustomFolderId, customFolders, searching, debouncedSearch]);

  const composeAccounts = selectedAccountId
    ? accounts.filter((a) => a.id === selectedAccountId)
    : accounts;

  const showSidebar = !isMobile || mobilePane === "folders";
  const showList = !isMobile || mobilePane === "list";
  const showDetail = !isMobile || mobilePane === "detail" || mobilePane === "compose";

  return (
    <div className="v2-screen grid grid-cols-[var(--nav-rail-w,72px)_minmax(0,1fr)] gap-3 overflow-hidden p-3 md:gap-4 md:p-4">
      <NavRailSpacer />

      <main className="flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden md:gap-4">
        <PageHeader
          icon={<IconMail size={22} />}
          title="E-mail"
          center={
            isMobile ? undefined : (
              <div className="ml-auto max-w-sm">
                <PageSearchBar
                  variant="compact"
                  value={query}
                  onChange={setQuery}
                  placeholder="Buscar e-mails…"
                  aria-label="Buscar e-mails"
                />
              </div>
            )
          }
          actions={
            <>
              <PageGhostButton
                type="button"
                onClick={() => setRulesOpen(true)}
                disabled={accounts.length === 0}
                aria-label="Regras de e-mail"
                title="Regras"
                className="h-10 w-10 justify-center px-0"
              >
                <IconFilter size={16} stroke={2.2} />
              </PageGhostButton>
              <PagePrimaryButton
                type="button"
                onClick={() => openCompose()}
                disabled={accounts.length === 0}
              >
                <IcoCompose />
                <span className="hidden sm:inline">Novo e-mail</span>
                <span className="sm:hidden">Nova</span>
              </PagePrimaryButton>
            </>
          }
        />

        <div className="md:hidden">
          <PageSearchBar
            variant="compact"
            value={query}
            onChange={setQuery}
            placeholder="Buscar e-mails…"
            aria-label="Buscar e-mails"
          />
        </div>

        <div
          className="grid min-h-0 flex-1 overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] shadow-[var(--glass-shadow)] max-md:grid-cols-1"
          style={
            isMobile
              ? undefined
              : { gridTemplateColumns: `${sidebarWidth}px ${listWidth}px 1fr` }
          }
        >
          <div
            className={cn(
              "relative min-h-0 flex-col overflow-hidden border-r border-[var(--glass-border-subtle,var(--glass-border))] bg-[var(--glass-bg-overlay)]",
              showSidebar ? "flex" : "hidden",
            )}
          >
            {isMobile ? (
              <div className="flex shrink-0 items-center border-b border-[var(--glass-border-subtle,var(--glass-border))] px-4 py-3.5">
                <button
                  type="button"
                  onClick={() => setMobilePane("list")}
                  className="flex items-center gap-1.5 rounded-[var(--radius-md)] px-2 py-1.5 text-[13px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--glass-bg-overlay)]"
                >
                  <IconArrowLeft size={16} stroke={2} />
                  Voltar
                </button>
              </div>
            ) : null}
            <EmailSidebar
              accounts={accounts}
              loading={accountsLoading}
              customFolders={customFolders}
              selectedAccountId={selectedAccountId}
              selectedFolder={selectedFolder}
              selectedCustomFolderId={selectedCustomFolderId}
              onSelectAccount={(id) => {
                setSelectedAccountId(id);
                if (isMobile) setMobilePane("list");
              }}
              onSelectFolder={handleFolderChange}
              onSelectCustomFolder={handleSelectCustomFolder}
              onCreateCustomFolder={handleCreateFolder}
              onDeleteCustomFolder={handleDeleteCustomFolder}
              onDropToSystemFolder={handleDropToSystemFolder}
              onDropToCustomFolder={handleMoveToCustomFolder}
            />
            <ColumnResizer
              value={sidebarWidth}
              onChange={setSidebarWidth}
              min={200}
              max={360}
              className="hidden md:block"
            />
          </div>

          <div
            className={cn(
              "relative min-h-0 flex-col overflow-hidden border-r border-[var(--glass-border-subtle,var(--glass-border))]",
              showList ? "flex" : "hidden",
            )}
          >
            <div className="flex shrink-0 items-center gap-2.5 border-b border-[var(--glass-border-subtle,var(--glass-border))] px-4 py-3.5">
              {isMobile ? (
                <button
                  type="button"
                  onClick={() => setMobilePane("folders")}
                  className="flex items-center gap-1.5 rounded-[var(--radius-md)] px-2 py-1.5 text-[13px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--glass-bg-overlay)]"
                >
                  <IconArrowLeft size={16} stroke={2} />
                  Pastas
                </button>
              ) : null}
              <h2 className="min-w-0 flex-1 truncate font-display text-[15px] font-extrabold leading-tight">
                {folderLabel}
              </h2>
              {!searching && folderUnread > 0 ? (
                <span className="shrink-0 rounded-full bg-[var(--color-enterprise-bg,rgba(91,111,245,0.15))] px-2.5 py-0.5 font-display text-[11px] font-bold text-[var(--brand-primary-dark,var(--brand-primary))]">
                  {folderUnread > 99 ? "99+" : folderUnread} não lido{folderUnread !== 1 ? "s" : ""}
                </span>
              ) : null}
              {lastSyncMsg ? (
                <span className="text-[11px] font-semibold text-[var(--brand-primary)]">
                  ✓ {lastSyncMsg}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => void handleRefresh()}
                disabled={syncing || accounts.length === 0}
                aria-label="Sincronizar e atualizar"
                className="flex h-[34px] w-[34px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-secondary)] transition-all hover:border-[var(--brand-primary)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--brand-primary)] disabled:opacity-40"
              >
                <span className={syncing ? "inline-flex animate-spin" : "inline-flex"}>
                  <IcoRefresh />
                </span>
              </button>
            </div>

            <div className="flex shrink-0 items-center border-b border-[var(--glass-border-subtle,var(--glass-border))] px-4 py-2">
              <button
                type="button"
                onClick={() => setUnreadOnly((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors"
                style={{
                  background: unreadOnly
                    ? "color-mix(in srgb, var(--brand-primary) 14%, transparent)"
                    : "var(--glass-bg-soft, var(--glass-bg-overlay))",
                  color: unreadOnly ? "var(--brand-primary)" : "var(--glass-fg-muted, var(--text-muted))",
                  border: `1px solid ${
                    unreadOnly
                      ? "color-mix(in srgb, var(--brand-primary) 28%, transparent)"
                      : "var(--glass-border)"
                  }`,
                }}
              >
                Somente não lidos
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {emailsError ? (
                <p className="px-4 py-3 font-body text-[13px] text-destructive">{emailsError}</p>
              ) : accounts.length === 0 && !accountsLoading ? (
                <EmptyAccounts />
              ) : (
                <EmailList
                  emails={emails}
                  loading={emailsLoading}
                  selectedId={selectedEmailId}
                  folder={selectedFolder}
                  showAccountTag={!selectedAccountId || searching}
                  accountEmails={accountEmailMap}
                  customFolders={customFolders}
                  onSelect={handleSelect}
                  onTrash={handleDelete}
                  onRestore={handleRestore}
                  onDeletePermanent={handleDeletePermanent}
                  onMoveToCustomFolder={handleMoveToCustomFolder}
                  onRemoveFromCustomFolder={handleRemoveFromCustomFolder}
                  onToggleRead={handleToggleRead}
                />
              )}
            </div>
            <ColumnResizer
              value={listWidth}
              onChange={setListWidth}
              min={280}
              max={560}
              className="hidden md:block"
            />
          </div>

          <div className={cn("min-h-0 flex-col", showDetail ? "flex" : "hidden")}>
            {composing ? (
              <ComposeView
                accounts={composeAccounts.length > 0 ? composeAccounts : accounts}
                draft={composeDraft}
                onCancel={handleCancelCompose}
                onSent={handleSend}
                onBack={handleCancelCompose}
              />
            ) : (
              <EmailReader
                email={emailDetail}
                loading={detailLoading && !!selectedEmailId}
                onBack={() => {
                  setSelectedEmailId(null);
                  setMobilePane("list");
                }}
                onReply={handleReply}
                onForward={handleForward}
                onDelete={
                  selectedEmailId
                    ? () => {
                        if (selectedFolder === "TRASH") {
                          void handleDeletePermanent(selectedEmailId);
                        } else {
                          void handleDelete(selectedEmailId);
                        }
                      }
                    : undefined
                }
              />
            )}
          </div>
        </div>
      </main>

      <EmailRulesModal
        open={rulesOpen}
        onOpenChange={setRulesOpen}
        accounts={accounts}
        customFolders={customFolders}
        defaultAccountId={selectedAccountId}
      />

      {confirmDialog}
    </div>
  );
}

function EmptyAccounts() {
  return (
    <div className="flex h-52 flex-col items-center justify-center gap-2 px-6 text-center text-[var(--text-muted)]">
      <p className="font-display text-[14px] font-semibold text-[var(--text-secondary)]">
        Nenhuma conta conectada
      </p>
      <p className="font-body text-[13px]">
        Conecte uma caixa em{" "}
        <Link
          href="/settings/email-accounts"
          className="font-semibold text-[var(--brand-primary)] hover:underline"
        >
          Configurações → Contas de e-mail
        </Link>
        .
      </p>
    </div>
  );
}
