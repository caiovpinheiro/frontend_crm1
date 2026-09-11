"use client";



import * as React from "react";

import { IconArrowLeft, IconFilter, IconFolder, IconMail } from "@tabler/icons-react";

import { toast } from "sonner";



import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";

import { PageHeader } from "@/components/crm/page-header";

import {

  PageFilterBar,

  PageGhostButton,

  PagePrimaryButton,

  PageSearchBar,

} from "@/components/crm/page-toolbar";

import {

  ColumnResizer,

  usePersistentWidth,

} from "@/components/crm/column-resizer";

import { useRouter } from "next/navigation";

import { useIsDesktop } from "@/hooks/use-media-query";

import { useConfirm } from "@/components/ui/confirm-dialog";



import {

  ComposeModal,

  EmailDetailSheet,

  EmailList,

  EmailReader,

  EmailSidebar,

  EmailRulesModal,

  EmailFoldersModal,

} from "@/features/email-v2";

import {

  useEmailAccounts,

  useEmailCustomFolders,

  useEmailDetail,

  useEmails,

} from "@/features/email-v2/hooks";

import { deleteEmail, moveEmail } from "@/features/email-v2/api/emails";

import type { EmailAccount, EmailCustomFolder, EmailFolder } from "@/features/email-v2/api/types";

import {

  buildComposeDraft,

  newComposeDraft,

  type ComposeDraft,

} from "@/features/email-v2/utils/compose-draft";



const POLL_INTERVAL_MS = 5 * 60 * 1000;

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

    <path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>

  </svg>

);

const IcoRefresh = () => (

  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">

    <path d="M3 9a8 8 0 0 1 13-3l2 2M21 4v4h-4"/><path d="M21 15a8 8 0 0 1-13 3l-2-2M3 20v-4h4"/>

  </svg>

);



export function EmailPage() {

  const router = useRouter();

  const { confirm, dialog: confirmDialog } = useConfirm();

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

  const [composeOpen, setComposeOpen] = React.useState(false);

  const [composeDraft, setComposeDraft] = React.useState<ComposeDraft>(newComposeDraft());

  const [rulesOpen, setRulesOpen] = React.useState(false);

  const [foldersOpen, setFoldersOpen] = React.useState(false);

  const [syncing, setSyncing] = React.useState(false);

  const [lastSyncMsg, setLastSyncMsg] = React.useState<string | null>(null);

  const [searchInput, setSearchInput] = React.useState("");

  const [debouncedSearch, setDebouncedSearch] = React.useState("");



  React.useEffect(() => {

    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);

    return () => clearTimeout(t);

  }, [searchInput]);



  const {

    folders: customFolders,

    create: createCustomFolder,

    rename: renameCustomFolder,

    remove: removeCustomFolder,

    reload: reloadCustomFolders,

  } = useEmailCustomFolders();



  const isDesktop = useIsDesktop();

  const [mobilePane, setMobilePane] = React.useState<"folders" | "list">("list");



  const { emails, loading: emailsLoading, refresh: refreshEmails, markRead, searching } = useEmails({

    accountId: selectedAccountId,

    folder: selectedCustomFolderId ? undefined : selectedFolder,

    customFolderId: selectedCustomFolderId ?? undefined,

    search: debouncedSearch || undefined,

  });



  const { email: emailDetail, loading: detailLoading } = useEmailDetail(selectedEmailId);



  const accountEmailMap = React.useMemo(

    () => Object.fromEntries(accounts.map((a) => [a.id, a.email])),

    [accounts],

  );



  const syncAndRefresh = React.useCallback(

    async (accountId: string) => {

      setSyncing(true);

      setLastSyncMsg(null);

      try {

        const result = await sync(accountId);

        refreshEmails();

        if (result.synced > 0) {

          setLastSyncMsg(`${result.synced} nova${result.synced > 1 ? "s" : ""}`);

          setTimeout(() => setLastSyncMsg(null), 4000);

        }

      } catch { /* silencioso */ }

      finally { setSyncing(false); }

    },

    [sync, refreshEmails],

  );



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

  }, [accounts, sync, refreshEmails, reloadAccounts, reloadCustomFolders]);



  async function handleRefreshAll() {

    setSyncing(true);

    setLastSyncMsg(null);

    try {

      let total = 0;

      for (const a of accounts) {

        try { const r = await sync(a.id); total += r.synced; } catch { /* continua */ }

      }

      refreshEmails();

      refreshUnreadCounts();

      if (total > 0) {

        setLastSyncMsg(`${total} nova${total > 1 ? "s" : ""}`);

        setTimeout(() => setLastSyncMsg(null), 4000);

      }

    } finally { setSyncing(false); }

  }



  function openCompose(draft: ComposeDraft = newComposeDraft(selectedAccountId)) {

    setComposeDraft(draft);

    setComposeOpen(true);

  }



  function handleReply() {

    if (!emailDetail) return;

    openCompose(buildComposeDraft(emailDetail, "reply"));

  }



  function handleForward() {

    if (!emailDetail) return;

    openCompose(buildComposeDraft(emailDetail, "forward"));

  }



  function refreshUnreadCounts() {

    void reloadAccounts();

    void reloadCustomFolders();

  }



  function handleSelectEmail(id: string) {

    setSelectedEmailId(id);

    void markRead(id, true).then(() => refreshUnreadCounts());

  }



  function handleSelectFolder(folder: EmailFolder) {

    setSelectedFolder(folder);

    setSelectedCustomFolderId(null);

    setSelectedEmailId(null);

    setSearchInput("");

  }



  function handleSelectCustomFolder(folderId: string) {

    setSelectedCustomFolderId(folderId);

    setSelectedEmailId(null);

    setSearchInput("");

  }



  async function handleCreateCustomFolder(accountId: string, name: string) {

    try {

      await createCustomFolder({ accountId, name });

    } catch (err) {

      toast.error(err instanceof Error ? err.message : "Erro ao criar pasta.");

      throw err;

    }

  }



  async function handleRenameCustomFolder(folderId: string, name: string) {

    try {

      await renameCustomFolder(folderId, { name });

    } catch (err) {

      toast.error(err instanceof Error ? err.message : "Erro ao renomear pasta.");

      throw err;

    }

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



  async function handleTrash(id: string) {

    try {

      await moveEmail(id, { systemFolder: "TRASH", customFolderId: null });

      if (selectedEmailId === id) setSelectedEmailId(null);

      refreshEmails();

      refreshUnreadCounts();

    } catch (err) {

      toast.error(err instanceof Error ? err.message : "Erro ao mover para lixeira.");

    }

  }



  async function handleRestore(id: string) {

    try {

      await moveEmail(id, { systemFolder: "INBOX" });

      refreshEmails();

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

      if (selectedEmailId === id) setSelectedEmailId(null);

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

    if (folder === "TRASH") return handleTrash(emailId);

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

    [

      accounts,

      customFolders,

      selectedAccountId,

      selectedFolder,

      selectedCustomFolderId,

      searching,

    ],

  );



  const folderLabel = React.useMemo(() => {

    if (searching) return `Resultados: “${debouncedSearch}”`;

    if (selectedCustomFolderId) {

      const f = customFolders.find((x) => x.id === selectedCustomFolderId);

      return f?.name ?? "Pasta";

    }

    return selectedFolder === "INBOX" ? "Caixa de entrada"

      : selectedFolder === "SENT" ? "Enviados"

      : "Excluídos";

  }, [selectedFolder, selectedCustomFolderId, customFolders, searching, debouncedSearch]);



  if (!isDesktop) {
    return (
      <div className="v2-screen grid grid-cols-[var(--nav-rail-w,72px)_minmax(0,1fr)] gap-3 overflow-hidden p-3">
        <NavRailSpacer />
        <main className="flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden">
          <PageHeader
            icon={<IconMail size={22} />}
            title="E-mail"
            center={
              <PageSearchBar
                variant="compact"
                value={searchInput}
                onChange={setSearchInput}
                placeholder="Buscar e-mails…"
                aria-label="Buscar e-mails"
              />
            }
            actions={
              <>
                <PageGhostButton
                  type="button"
                  onClick={() => setFoldersOpen(true)}
                  disabled={accounts.length === 0}
                  aria-label="Organizar pastas"
                  title="Pastas"
                  className="h-10 w-10 justify-center px-0"
                >
                  <IconFolder size={16} stroke={2.2} />
                </PageGhostButton>
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
                  onClick={() =>
                    accounts.length === 0
                      ? router.push("/settings/email-accounts")
                      : openCompose()
                  }
                >
                  <IcoCompose />
                  <span className="hidden sm:inline">
                    {accounts.length === 0 ? "Conectar e-mail" : "Novo e-mail"}
                  </span>
                  <span className="sm:hidden">
                    {accounts.length === 0 ? "Conectar" : "Nova"}
                  </span>
                </PagePrimaryButton>
              </>
            }
          />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-base)] shadow-[var(--glass-shadow)]">
            {mobilePane === "list" ? (
              <>
                <div className="flex shrink-0 items-center gap-2.5 border-b border-[var(--glass-border-subtle,var(--glass-border))] px-4 py-3.5">
                  <button
                    type="button"
                    onClick={() => setMobilePane("folders")}
                    className="flex items-center gap-1.5 rounded-[var(--radius-md)] px-2 py-1.5 text-[13px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--glass-bg-overlay)]"
                  >
                    <IconArrowLeft size={16} stroke={2} />
                    Pastas
                  </button>
                  <h2 className="flex-1 truncate font-display text-[15px] font-extrabold leading-tight">
                    {folderLabel}
                  </h2>
                  {lastSyncMsg ? (
                    <span className="text-[11px] font-semibold text-[var(--brand-primary)]">
                      ✓ {lastSyncMsg}
                    </span>
                  ) : null}
                  <button
                    onClick={() => void handleRefreshAll()}
                    disabled={syncing || accounts.length === 0}
                    aria-label="Sincronizar e atualizar"
                    className="flex h-[34px] w-[34px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-secondary)] transition-all hover:border-[var(--brand-primary)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--brand-primary)] disabled:opacity-40"
                  >
                    <span className={syncing ? "inline-flex animate-spin" : "inline-flex"}>
                      <IcoRefresh />
                    </span>
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <EmailList
                    emails={emails}
                    loading={emailsLoading}
                    selectedId={selectedEmailId}
                    folder={selectedFolder}
                    showAccountTag={!selectedAccountId || searching}
                    accountEmails={accountEmailMap}
                    customFolders={customFolders}
                    onSelect={handleSelectEmail}
                    onTrash={handleTrash}
                    onRestore={handleRestore}
                    onDeletePermanent={handleDeletePermanent}
                    onMoveToCustomFolder={handleMoveToCustomFolder}
                    onRemoveFromCustomFolder={handleRemoveFromCustomFolder}
                    onToggleRead={handleToggleRead}
                  />
                </div>
              </>
            ) : (
              <>
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
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <EmailSidebar
                    accounts={accounts}
                    loading={accountsLoading}
                    customFolders={customFolders}
                    selectedAccountId={selectedAccountId}
                    selectedFolder={selectedFolder}
                    selectedCustomFolderId={selectedCustomFolderId}
                    onSelectAccount={(id) => { setSelectedAccountId(id); setMobilePane("list"); }}
                    onSelectFolder={(f) => { handleSelectFolder(f); setMobilePane("list"); }}
                    onSelectCustomFolder={(id) => { handleSelectCustomFolder(id); setMobilePane("list"); }}
                    onSync={syncAndRefresh}
                    onCreateCustomFolder={handleCreateCustomFolder}
                    onRenameCustomFolder={handleRenameCustomFolder}
                    onDeleteCustomFolder={handleDeleteCustomFolder}
                    onManageFolders={() => setFoldersOpen(true)}
                    onDropToSystemFolder={handleDropToSystemFolder}
                    onDropToCustomFolder={handleMoveToCustomFolder}
                  />
                </div>
              </>
            )}
          </div>
        </main>
        <EmailDetailSheet
          email={emailDetail}
          loading={detailLoading}
          open={!!selectedEmailId && !isDesktop}
          onOpenChange={(o) => { if (!o) setSelectedEmailId(null); }}
        />
        <ComposeModal
          open={composeOpen}
          onOpenChange={setComposeOpen}
          accounts={accounts}
          draft={composeDraft}
          onSent={refreshEmails}
        />
        <EmailRulesModal
          open={rulesOpen}
          onOpenChange={setRulesOpen}
          accounts={accounts}
          customFolders={customFolders}
          defaultAccountId={selectedAccountId}
        />
        <EmailFoldersModal
          open={foldersOpen}
          onOpenChange={setFoldersOpen}
          accounts={accounts}
          folders={customFolders}
          defaultAccountId={selectedAccountId}
          onCreate={handleCreateCustomFolder}
          onRename={handleRenameCustomFolder}
          onDelete={handleDeleteCustomFolder}
        />
        {confirmDialog}
      </div>
    );
  }

  return (

    <div className="v2-screen grid grid-cols-[var(--nav-rail-w,72px)_1fr] gap-4 overflow-hidden p-4">

      <NavRailSpacer />



      <main className="flex min-w-0 flex-col gap-4 overflow-hidden">

        <PageHeader

          icon={<IconMail size={22} />}

          title="E-mail"

          center={

            <PageSearchBar

              variant="compact"

              value={searchInput}

              onChange={setSearchInput}

              placeholder="Buscar e-mails…"

              aria-label="Buscar e-mails"

            />

          }

          actions={

            <>

              <PageGhostButton

                type="button"

                onClick={() => setFoldersOpen(true)}

                disabled={accounts.length === 0}

                aria-label="Organizar pastas"

                title="Pastas"

                className="h-10 w-10 justify-center px-0"

              >

                <IconFolder size={16} stroke={2.2} />

              </PageGhostButton>

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

                onClick={() =>

                  accounts.length === 0

                    ? router.push("/settings/email-accounts")

                    : openCompose()

                }

              >

                <IcoCompose />

                {accounts.length === 0 ? "Conectar e-mail" : "Novo e-mail"}

              </PagePrimaryButton>

            </>

          }

        />



        {searching ? (

          <PageFilterBar>

            <span className="font-body text-[13px] text-[var(--text-muted)]">

              Busca em todas as pastas da conta selecionada

            </span>

          </PageFilterBar>

        ) : null}



        <div

          className="grid min-h-0 flex-1 overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] shadow-[var(--glass-shadow)]"

          style={{ gridTemplateColumns: `${sidebarWidth}px ${listWidth}px 1fr` }}

        >

          {/* COL 1 — Sidebar */}

          <div className="relative flex min-h-0 flex-col overflow-hidden border-r border-[var(--glass-border-subtle,var(--glass-border))] bg-[var(--glass-bg-overlay)]">

            <EmailSidebar

              accounts={accounts}

              loading={accountsLoading}

              customFolders={customFolders}

              selectedAccountId={selectedAccountId}

              selectedFolder={selectedFolder}

              selectedCustomFolderId={selectedCustomFolderId}

              onSelectAccount={setSelectedAccountId}

              onSelectFolder={handleSelectFolder}

              onSelectCustomFolder={handleSelectCustomFolder}

              onSync={syncAndRefresh}

              onCreateCustomFolder={handleCreateCustomFolder}

              onRenameCustomFolder={handleRenameCustomFolder}

              onDeleteCustomFolder={handleDeleteCustomFolder}

              onManageFolders={() => setFoldersOpen(true)}

              onDropToSystemFolder={handleDropToSystemFolder}

              onDropToCustomFolder={handleMoveToCustomFolder}

            />

            <ColumnResizer

              value={sidebarWidth}

              onChange={setSidebarWidth}

              min={200}

              max={360}

            />

          </div>



          {/* COL 2 — Lista */}

          <div className="relative flex min-h-0 flex-col overflow-hidden border-r border-[var(--glass-border-subtle,var(--glass-border))]">

            <div className="flex shrink-0 items-center gap-2.5 border-b border-[var(--glass-border-subtle,var(--glass-border))] px-4 py-3.5">

              <h2 className="flex-1 font-display text-[15px] font-extrabold leading-tight">

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

                onClick={() => void handleRefreshAll()}

                disabled={syncing || accounts.length === 0}

                aria-label="Sincronizar e atualizar"

                className="flex h-[34px] w-[34px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-secondary)] transition-all hover:border-[var(--brand-primary)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--brand-primary)] disabled:opacity-40"

              >

                <span className={syncing ? "inline-flex animate-spin" : "inline-flex"}>

                  <IcoRefresh />

                </span>

              </button>

            </div>



            <div className="min-h-0 flex-1 overflow-y-auto">

              <EmailList

                emails={emails}

                loading={emailsLoading}

                selectedId={selectedEmailId}

                folder={selectedFolder}

                showAccountTag={!selectedAccountId || searching}

                accountEmails={accountEmailMap}

                customFolders={customFolders}

                onSelect={handleSelectEmail}

                onTrash={handleTrash}

                onRestore={handleRestore}

                onDeletePermanent={handleDeletePermanent}

                onMoveToCustomFolder={handleMoveToCustomFolder}

                onRemoveFromCustomFolder={handleRemoveFromCustomFolder}

                onToggleRead={handleToggleRead}

              />

            </div>

            <ColumnResizer

              value={listWidth}

              onChange={setListWidth}

              min={280}

              max={560}

            />

          </div>



          {/* COL 3 — Reader */}

          <div className="hidden min-h-0 flex-col md:flex">

            <EmailReader

              email={emailDetail}

              loading={detailLoading && !!selectedEmailId}

              onReply={handleReply}

              onForward={handleForward}

              onDelete={

                selectedEmailId

                  ? () => {

                      if (selectedFolder === "TRASH") {

                        void handleDeletePermanent(selectedEmailId);

                      } else {

                        void handleTrash(selectedEmailId);

                      }

                    }

                  : undefined

              }

            />

          </div>

        </div>

      </main>



      <EmailDetailSheet

        email={emailDetail}

        loading={detailLoading}

        open={!!selectedEmailId && !isDesktop}

        onOpenChange={(o) => { if (!o) setSelectedEmailId(null); }}

      />



      <ComposeModal

        open={composeOpen}

        onOpenChange={setComposeOpen}

        accounts={accounts}

        draft={composeDraft}

        onSent={refreshEmails}

      />



      <EmailRulesModal

        open={rulesOpen}

        onOpenChange={setRulesOpen}

        accounts={accounts}

        customFolders={customFolders}

        defaultAccountId={selectedAccountId}

      />



      <EmailFoldersModal

        open={foldersOpen}

        onOpenChange={setFoldersOpen}

        accounts={accounts}

        folders={customFolders}

        defaultAccountId={selectedAccountId}

        onCreate={handleCreateCustomFolder}

        onRename={handleRenameCustomFolder}

        onDelete={handleDeleteCustomFolder}

      />



      {confirmDialog}

    </div>

  );

}

