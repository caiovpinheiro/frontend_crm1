"use client";

import * as React from "react";
import { Clock } from "lucide-react";

import { CreateCompanyDialog, ConfirmDeleteDialog as CompanyConfirmDelete } from "@/app/(app)/companies/client-page";
import { ContactFormDialog, ConfirmDeleteDialog as ContactConfirmDelete } from "@/app/(app)/contacts/client-page";
import { CreateItemDialog } from "@/app/(app)/demands/client-page";
import { CreateJobDialog } from "@/app/(app)/job-openings/client-page";
import { FieldFormDialog } from "@/app/(app)/settings/custom-fields/client-page";
import { AddAutomationDrawer } from "@/app/(app)/settings/pipeline/add-automation-drawer";
import { NewTabulationModal } from "@/app/(app)/settings/tabulations/client-page";
import { TagFormDialog } from "@/app/(app)/settings/tags/client-page";
import { EditUserDialog } from "@/app/(app)/settings/team/edit-user-dialog";
import { WidgetConfigDrawer } from "@/app/(app)/widgets/_components/widget-config-drawer";
import { AgentPlayground } from "@/components/ai-agents/agent-playground";
import { AgentWizard } from "@/components/ai-agents/agent-wizard";
import { StepPickerModal } from "@/components/automations/step-picker-modal";
import { CreateChannelDialog } from "@/components/channels/create-channel-dialog";
import { ActivityDetailDialog } from "@/components/crm/activities/activity-detail-dialog";
import { ContactEditDialog } from "@/components/crm/contact-edit-dialog";
import { NewTaskDialog } from "@/components/crm/tasks-view";
import { FavoritesPanel } from "@/components/crm/favorites-panel";
import { CallPermissionTemplateDialog } from "@/components/inbox/call-permission-template-dialog";
import { FlowSimulator } from "@/components/flow/flow-simulator";
import { FlowStepPickerModal } from "@/components/flow/flow-step-picker-modal";
import { LogsModal } from "@/components/flow/logs-modal";
import { SessionInspectionModal } from "@/components/flow/session-inspection-modal";
import { WhatsAppCustomerPreview } from "@/components/flow/whatsapp-customer-preview";
import { BulkEditFieldsDialog } from "@/components/pipeline/bulk-edit-fields-dialog";
import { FilterModalThreeCol, FilterModalTwoCol } from "@/components/pipeline/kanban-filters/v2";
import type { FilterOptionsResponse } from "@/components/pipeline/kanban-filters/types";
import { LossReasonDialog } from "@/components/pipeline/loss-reason-dialog";
import { AvatarCropDialog } from "@/components/profile/avatar-crop-dialog";
import { FormDialog, formLabelClass } from "@/components/ui/form-dialog";
import { InputGlass } from "@/components/crm/input-glass";
import { CockpitCasesDialog } from "@/features/ai-agents/academic-cockpit/cases-dialog";
import { NewAutomationModal } from "@/features/automations-v2/new-automation-modal";
import { CampaignDetailDrawer } from "@/features/campaigns/campaign-detail-drawer";
import type { CampaignListItem } from "@/features/campaigns/types";
import { CatalogWizard } from "@/features/catalogs-v2/catalog-wizard";
import { CreateDepartmentModal } from "@/features/conversations-settings/components/DepartmentsTab";
import { CreateQuickReplyModal } from "@/features/conversations-settings/components/QuickMessagesTab";
import { ComposeModal } from "@/features/email-v2/components/compose-modal";
import { ConnectEmailModal } from "@/features/email-v2/components/connect-email-modal";
import { EmailDetailSheet } from "@/features/email-v2/components/email-detail-sheet";
import { EmailRulesModal } from "@/features/email-v2/components/email-rules-modal";
import type { EmailAccount } from "@/features/email-v2/api/types";
import { AgentAutomationPickerModal } from "@/features/inbox-v2/extras/agent-automation-picker-modal";
import { ChannelPickModal } from "@/features/inbox-v2/extras/channel-pick-modal";
import { InternalTemplatePickerModal } from "@/features/inbox-v2/extras/internal-template-picker-modal";
import { ScheduleDialog } from "@/features/inbox-v2/extras/schedule-dialog";
import { ResolveConfirmDialog } from "@/features/inbox-v2/extras/skip-automations-option";
import { TabulationDialog } from "@/features/inbox-v2/extras/tabulation-dialog";
import { TaskDialog } from "@/features/inbox-v2/extras/task-dialog";
import { WhatsappTemplatePickerModal } from "@/features/inbox-v2/extras/template-picker-popover";
import { OrgUnitDialog } from "@/features/org-units/org-units-page";
import { AddDealDialog } from "@/features/pipeline-v2/extras/add-deal-dialog";
import { PipelineChannelsModal } from "@/features/pipeline-v2/extras/pipeline-channels-modal";
import { ProductDialog } from "@/features/products-v2/product-dialog";
import { CategoryDialog } from "@/features/quotas/category-dialog";
import { QuotaDialog } from "@/features/quotas/quota-dialog";
import { ScheduleDialogShell } from "@/features/settings/schedules/schedule-shared";
import { TelephonyModal } from "@/features/softphone/components/telefonia/telephony-modal";
import { AddMembersDialog, ComposeDialog } from "@/features/team-chat/compose-dialogs";
import type { TeamChatRoom } from "@/features/team-chat/types";
import type { Activity } from "@/lib/activities-data";
import type { LogEntry } from "@/lib/logs-data";

type HostProps = { onClose: () => void };

const MOCK_STAGES = [
  { id: "s1", name: "Novo" },
  { id: "s2", name: "Qualificado" },
  { id: "s3", name: "Proposta" },
];

const MOCK_CHANNELS = [
  {
    id: "ch-1",
    name: "WhatsApp Vendas",
    type: "WHATSAPP",
    provider: "META",
    status: "CONNECTED",
    phoneNumber: "+55 11 90000-0001",
  },
  {
    id: "ch-2",
    name: "WhatsApp Suporte",
    type: "WHATSAPP",
    provider: "META",
    status: "CONNECTED",
    phoneNumber: "+55 11 90000-0002",
  },
];

const MOCK_FILTER_OPTIONS: FilterOptionsResponse = {
  pipelines: [
    {
      id: "p1",
      name: "Vendas",
      stages: [
        { id: "s1", name: "Novo", color: "#6366f1", position: 0 },
        { id: "s2", name: "Qualificado", color: "#10b981", position: 1 },
        { id: "s3", name: "Proposta", color: "#f59e0b", position: 2 },
      ],
    },
  ],
  users: [{ id: "u1", name: "Julia", avatarUrl: null, role: "AGENT", type: "HUMAN" }],
  tags: [
    { id: "t1", name: "Lead quente", color: "#6366f1" },
    { id: "t2", name: "Acadêmico", color: "#10b981" },
  ],
  dealCustomFields: [],
  contactCustomFields: [],
  sources: ["WhatsApp", "Instagram", "Indicação"],
  lossReasons: ["Preço", "Concorrente"],
};

const MOCK_EMAIL_ACCOUNT: EmailAccount = {
  id: "acc-1",
  email: "contato@empresa.com",
  imapHost: "imap.exemplo.com",
  imapPort: 993,
  imapEncryption: "SSL_TLS",
  smtpHost: "smtp.exemplo.com",
  smtpPort: 587,
  smtpEncryption: "STARTTLS",
  visibility: "SHARED",
  groupInThreads: true,
  createContactsForReplies: false,
  ownerUserId: null,
  unreadCount: 0,
  createdAt: new Date().toISOString(),
  lastSyncedAt: null,
};

const MOCK_CAMPAIGN: CampaignListItem = {
  id: "camp-1",
  name: "Black Friday 2025",
  type: "TEMPLATE",
  status: "COMPLETED",
  totalRecipients: 1240,
  sentCount: 1240,
  deliveredCount: 1198,
  failedCount: 42,
  readCount: 876,
  repliedCount: 214,
  scheduledAt: null,
  startedAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  channel: { id: "ch-wa-main", name: "WhatsApp Principal", provider: "meta" },
  segment: { id: "seg-1", name: "Clientes ativos" },
  createdBy: { id: "user-demo", name: "Marcelo Silva" },
};

const MOCK_ROOM: TeamChatRoom = {
  id: "room-1",
  kind: "GROUP",
  name: "geral",
  topic: null,
  lastMessageAt: new Date().toISOString(),
  lastPreview: null,
  createdAt: new Date().toISOString(),
  unread: 0,
  peer: null,
  members: [],
  memberCount: 3,
};

const MOCK_ACTIVITY: Activity = {
  id: "act-1",
  kind: "tarefa",
  title: "Ligar para Maria Silva",
  start: new Date().toISOString().slice(0, 16),
  status: "pendente",
  contactName: "Maria Silva",
};

const MOCK_LOG: LogEntry = {
  id: "log-1",
  sessionId: "sess-1",
  status: "success",
  rawStatus: "SUCCESS",
  title: "Concluído com sucesso",
  message: "Mensagem enviada ao contato.",
  timestamp: new Date().toISOString(),
  contactId: "c1",
  dealId: "d1",
  contactLabel: "Maria Silva",
  dealLabel: "Plano anual",
  contactPhone: "+5511999990000",
  stepType: "send_whatsapp_message",
  eventLabel: "Envio",
  channelLabel: "WhatsApp Vendas",
  snippet: "Olá Maria, tudo bem?",
  reason: null,
  payload: null,
  webhook: null,
  summary: {},
  params: {},
};

const MOCK_CALL_TPLS = [
  {
    id: "tpl-1",
    name: "pedido_ligacao",
    language: "pt_BR",
    sub_category: "CALL_PERMISSION_REQUEST",
    bodyText: "Olá {{1}}, podemos ligar para falar sobre sua matrícula?",
    headerText: "",
    footerText: "Responda SIM para autorizar.",
    buttons: ["Autorizar"],
  },
];

function tinyPngFile(): File {
  const b64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], "avatar.png", { type: "image/png" });
}

function closeWhen(onClose: () => void) {
  return (open: boolean) => {
    if (!open) onClose();
  };
}

const LIVE: Record<string, React.ComponentType<HostProps>> = {
  "contact-new": function ContactNew({ onClose }) {
    return <ContactFormDialog open contact={null} availableTags={[]} onOpenChange={closeWhen(onClose)} />;
  },
  "contact-edit-quick": function ContactEditQuick({ onClose }) {
    return (
      <ContactEditDialog
        contactId="showcase-contact"
        initial={{ name: "Maria Silva", email: "maria@empresa.com", phone: "(11) 99999-0000" }}
        open
        onOpenChange={closeWhen(onClose)}
      />
    );
  },
  "company-new": function CompanyNew({ onClose }) {
    return <CreateCompanyDialog open onOpenChange={closeWhen(onClose)} />;
  },
  "deal-new": function DealNew({ onClose }) {
    return (
      <AddDealDialog
        open
        onOpenChange={closeWhen(onClose)}
        stages={MOCK_STAGES}
        defaultStageId="s1"
        pipelineId="showcase-pipeline"
      />
    );
  },
  "product-new": function ProductNew({ onClose }) {
    return <ProductDialog open onOpenChange={closeWhen(onClose)} productId={null} />;
  },
  "quota-new": function QuotaNew({ onClose }) {
    return <QuotaDialog open onOpenChange={closeWhen(onClose)} quotaId={null} />;
  },
  "category-new": function CategoryNew({ onClose }) {
    return <CategoryDialog open onOpenChange={closeWhen(onClose)} categoryId={null} />;
  },
  "org-unit": function OrgUnit({ onClose }) {
    return <OrgUnitDialog open onOpenChange={closeWhen(onClose)} unit={null} onSaved={onClose} />;
  },
  "tag-new": function TagNew({ onClose }) {
    return <TagFormDialog tag={null} isPending={false} onSubmit={() => onClose()} onClose={onClose} />;
  },
  "field-new": function FieldNew({ onClose }) {
    return (
      <FieldFormDialog
        open
        onOpenChange={closeWhen(onClose)}
        mode="create"
        defaultEntity="deal"
        onSaved={onClose}
      />
    );
  },
  "department-new": function DepartmentNew({ onClose }) {
    return <CreateDepartmentModal open onClose={onClose} />;
  },
  "quick-reply": function QuickReply({ onClose }) {
    return <CreateQuickReplyModal open onClose={onClose} groups={[]} />;
  },
  "tabulation-new": function TabulationNew({ onClose }) {
    return (
      <NewTabulationModal
        open
        onOpenChange={closeWhen(onClose)}
        departmentId="showcase-dept"
        departmentName="Comercial"
        onCreated={onClose}
      />
    );
  },
  "demand-item": function DemandItem({ onClose }) {
    return (
      <CreateItemDialog
        open
        onOpenChange={closeWhen(onClose)}
        boardId="showcase-board"
        stages={[{ id: "s1", name: "Backlog" }]}
        defaultKind="REQUEST"
        pending={false}
        onSubmit={async () => onClose()}
      />
    );
  },
  "job-new": function JobNew({ onClose }) {
    return <CreateJobDialog open onOpenChange={closeWhen(onClose)} />;
  },
  "task-agenda": function TaskAgenda({ onClose }) {
    return (
      <NewTaskDialog open onOpenChange={closeWhen(onClose)} defaultDate={new Date()} onCreate={() => onClose()} />
    );
  },
  "user-edit": function UserEdit({ onClose }) {
    return (
      <EditUserDialog
        user={{ id: "u-showcase", name: "Ana Souza", email: "ana@empresa.com" }}
        roleOptions={[
          { value: "AGENT", label: "Agente" },
          { value: "ADMIN", label: "Administrador" },
        ]}
        onOpenChange={closeWhen(onClose)}
      />
    );
  },
  "catalog-new": function CatalogNew({ onClose }) {
    return (
      <FormDialog
        open
        onOpenChange={closeWhen(onClose)}
        size="lg"
        title="Novo catálogo"
        description="Responda perguntas de negócio — o catálogo monta as capacidades para você."
      >
        <CatalogWizard onDone={() => onClose()} onCancel={onClose} />
      </FormDialog>
    );
  },
  "confirm-contact": function ConfirmContact({ onClose }) {
    return (
      <ContactConfirmDelete open count={1} pending={false} onCancel={onClose} onConfirm={onClose} />
    );
  },
  "confirm-company": function ConfirmCompany({ onClose }) {
    return (
      <CompanyConfirmDelete open count={1} pending={false} onCancel={onClose} onConfirm={onClose} />
    );
  },
  "resolve-inbox": function ResolveInbox({ onClose }) {
    return (
      <ResolveConfirmDialog open onOpenChange={closeWhen(onClose)} onConfirm={() => onClose()} />
    );
  },
  tabulation: function Tabulation({ onClose }) {
    return (
      <TabulationDialog
        open
        onOpenChange={closeWhen(onClose)}
        departmentId={null}
        optional
        onConfirm={() => onClose()}
      />
    );
  },
  "channel-pick": function ChannelPick({ onClose }) {
    return (
      <ChannelPickModal
        open
        onOpenChange={closeWhen(onClose)}
        channels={MOCK_CHANNELS}
        selectedChannelId="ch-1"
        onConfirm={() => onClose()}
      />
    );
  },
  "task-inbox": function TaskInbox({ onClose }) {
    return (
      <TaskDialog
        open
        onClose={onClose}
        contactId={null}
        contactName="Maria Silva"
        deals={[{ id: "d1", title: "Plano anual" }]}
      />
    );
  },
  "schedule-msg": function ScheduleMsg({ onClose }) {
    return (
      <ScheduleDialog
        open
        onClose={onClose}
        conversationId="showcase-conv"
        initialContent="Olá, passando para confirmar o horário."
      />
    );
  },
  "internal-tpl": function InternalTpl({ onClose }) {
    return (
      <InternalTemplatePickerModal
        open
        onClose={onClose}
        conversationId="showcase-conv"
        onPick={() => onClose()}
      />
    );
  },
  "agent-auto": function AgentAuto({ onClose }) {
    return (
      <AgentAutomationPickerModal
        open
        onClose={onClose}
        conversationId="showcase-conv"
        contactId={null}
      />
    );
  },
  "wa-tpl": function WaTpl({ onClose }) {
    return (
      <WhatsappTemplatePickerModal
        open
        onClose={onClose}
        conversationId="showcase-conv"
        contactName="Maria Silva"
        onPick={() => onClose()}
      />
    );
  },
  "call-perm": function CallPerm({ onClose }) {
    return (
      <CallPermissionTemplateDialog
        open
        onOpenChange={closeWhen(onClose)}
        contactName="Maria Silva"
        templates={MOCK_CALL_TPLS}
        loading={false}
        sending={false}
        onSubmit={() => onClose()}
      />
    );
  },
  favorites: function Favorites({ onClose }) {
    return <FavoritesPanel open onOpenChange={closeWhen(onClose)} conversationId={null} />;
  },
  "team-compose": function TeamCompose({ onClose }) {
    return (
      <ComposeDialog open onOpenChange={closeWhen(onClose)} meId="me-showcase" onCreated={() => onClose()} />
    );
  },
  "team-members": function TeamMembers({ onClose }) {
    return <AddMembersDialog open onOpenChange={closeWhen(onClose)} room={MOCK_ROOM} meId="me-showcase" />;
  },
  "loss-reason": function LossReason({ onClose }) {
    return <LossReasonDialog open onOpenChange={closeWhen(onClose)} onConfirm={() => onClose()} />;
  },
  "bulk-edit": function BulkEdit({ onClose }) {
    return (
      <BulkEditFieldsDialog
        open
        onOpenChange={closeWhen(onClose)}
        dealIds={["showcase-deal"]}
        onEnqueued={() => onClose()}
      />
    );
  },
  "pipeline-channels": function PipelineChannels({ onClose }) {
    return (
      <PipelineChannelsModal
        pipelineId="showcase-pipeline"
        pipelineName="Vendas"
        open
        onClose={onClose}
      />
    );
  },
  "filter-3col": function Filter3({ onClose }) {
    return (
      <FilterModalThreeCol
        open
        onOpenChange={closeWhen(onClose)}
        value={{}}
        options={MOCK_FILTER_OPTIONS}
        optionsLoading={false}
        onApply={() => onClose()}
        onClear={() => undefined}
      />
    );
  },
  "filter-2col": function Filter2({ onClose }) {
    return (
      <FilterModalTwoCol
        open
        onOpenChange={closeWhen(onClose)}
        value={{}}
        options={MOCK_FILTER_OPTIONS}
        optionsLoading={false}
        onApply={() => onClose()}
        onClear={() => undefined}
      />
    );
  },
  "add-automation": function AddAuto({ onClose }) {
    return (
      <AddAutomationDrawer
        open
        stageName="Novo"
        stages={MOCK_STAGES}
        currentStageId="s1"
        onClose={onClose}
        onConfirm={() => onClose()}
      />
    );
  },
  "schedule-shell": function ScheduleShell({ onClose }) {
    return (
      <ScheduleDialogShell
        open
        onOpenChange={closeWhen(onClose)}
        title="Expediente"
        description="Horário de atendimento desta cobertura."
        icon={<Clock className="size-4" />}
        submitLabel="Salvar"
        onSubmit={onClose}
      >
        <label className="block">
          <span className={formLabelClass}>Início</span>
          <InputGlass defaultValue="09:00" readOnly />
        </label>
        <label className="block">
          <span className={formLabelClass}>Fim</span>
          <InputGlass defaultValue="18:00" readOnly />
        </label>
      </ScheduleDialogShell>
    );
  },
  "widget-config": function WidgetConfig({ onClose }) {
    return <WidgetConfigDrawer slug="smart_distribution" onClose={onClose} />;
  },
  telephony: function Telephony({ onClose }) {
    return <TelephonyModal onClose={onClose} />;
  },
  "create-channel": function CreateChannel({ onClose }) {
    return <CreateChannelDialog open onOpenChange={closeWhen(onClose)} onCreated={onClose} />;
  },
  "connect-email": function ConnectEmail({ onClose }) {
    return <ConnectEmailModal open onOpenChange={closeWhen(onClose)} onSuccess={() => onClose()} />;
  },
  "compose-email": function ComposeEmail({ onClose }) {
    return <ComposeModal open onOpenChange={closeWhen(onClose)} accounts={[MOCK_EMAIL_ACCOUNT]} />;
  },
  "email-rules": function EmailRules({ onClose }) {
    return (
      <EmailRulesModal
        open
        onOpenChange={closeWhen(onClose)}
        accounts={[MOCK_EMAIL_ACCOUNT]}
        customFolders={[]}
      />
    );
  },
  "email-sheet": function EmailSheet({ onClose }) {
    return <EmailDetailSheet email={null} loading={false} open onOpenChange={closeWhen(onClose)} />;
  },
  "new-automation": function NewAutomation({ onClose }) {
    return <NewAutomationModal open onOpenChange={closeWhen(onClose)} />;
  },
  "step-picker": function StepPicker({ onClose }) {
    return <StepPickerModal open onClose={onClose} onSelect={() => onClose()} />;
  },
  "flow-step": function FlowStep({ onClose }) {
    return <FlowStepPickerModal open onClose={onClose} onSelect={() => onClose()} />;
  },
  "agent-wizard": function Wizard({ onClose }) {
    return <AgentWizard open onOpenChange={closeWhen(onClose)} onCreated={() => onClose()} />;
  },
  "agent-playground": function Playground({ onClose }) {
    return (
      <AgentPlayground
        agentId="showcase-agent"
        agentName="Agente demo"
        open
        onOpenChange={closeWhen(onClose)}
      />
    );
  },
  "cockpit-cases": function Cockpit({ onClose }) {
    return (
      <CockpitCasesDialog open={{ key: "spoke_today", title: "Falou hoje" }} onClose={onClose} />
    );
  },
  "logs-modal": function Logs({ onClose }) {
    return (
      <LogsModal
        automationId="showcase-auto"
        target={{ nodeId: "trigger", title: "Gatilho", ref: 1 }}
        open
        onOpenChange={closeWhen(onClose)}
      />
    );
  },
  "session-inspect": function SessionInspect({ onClose }) {
    return <SessionInspectionModal entry={MOCK_LOG} open onOpenChange={closeWhen(onClose)} />;
  },
  "flow-sim": function FlowSim({ onClose }) {
    return <FlowSimulator open onOpenChange={closeWhen(onClose)} nodes={[]} edges={[]} />;
  },
  "wa-preview": function WaPreview({ onClose }) {
    return (
      <WhatsAppCustomerPreview
        open
        onOpenChange={closeWhen(onClose)}
        stepType="message"
        config={{}}
        outputs={[]}
      />
    );
  },
  "campaign-detail": function CampaignDetail({ onClose }) {
    return <CampaignDetailDrawer campaign={MOCK_CAMPAIGN} onClose={onClose} />;
  },
  "avatar-crop": function AvatarCrop({ onClose }) {
    return (
      <AvatarCropDialog
        file={tinyPngFile()}
        onCancel={onClose}
        onApply={async () => onClose()}
      />
    );
  },
  "activity-detail": function ActivityDetail({ onClose }) {
    return (
      <ActivityDetailDialog
        open
        onOpenChange={closeWhen(onClose)}
        activityId={null}
        activity={MOCK_ACTIVITY}
      />
    );
  },
};

export function LiveModalHost({ id, onClose }: { id: string; onClose: () => void }) {
  const Comp = LIVE[id];
  if (!Comp) return null;
  return <Comp onClose={onClose} />;
}

export function hasLiveRenderer(id: string): boolean {
  return Boolean(LIVE[id]);
}
