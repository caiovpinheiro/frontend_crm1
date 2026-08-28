"use client";

import { useCallback, useState } from "react";
import { Position, type Node, type NodeProps } from "@xyflow/react";
import { CustomHandle } from "./custom-handle";
import { IconArrowsLeftRight as ArrowRightLeft, IconRobot as Bot, IconRobotFace as BotMessageSquare, IconBriefcase as Briefcase, IconCalendarPlus as CalendarPlus, IconCircleCheck as CheckCircle2, IconChecklist as Checklist, IconClipboardList as ClipboardList, IconCircleX as CircleX, IconClock as Clock, IconCornerDownRight as CornerDownRight, IconFileText as FileText, IconGitBranch as GitBranch, IconGlobe as Globe, IconPhoto as Image, IconListDetails as ListDetails, IconMail as Mail, IconMessageQuestion as MessageCircleQuestion, IconMessage as MessageSquare, IconClick as MousePointerClick, IconPackageOff as PackageMinus, IconPlayerPause as Pause, IconPencil as Pencil, IconPlus as Plus, IconRefresh as RefreshCw, IconRepeat as Repeat, IconRoute as Route, IconShoppingBag as ShoppingBag, IconSquare as Square, IconPlayerStop as StopCircle, IconTag as Tag, IconClock as Timer, IconTrendingUp as TrendingUp, IconTrophy as Trophy, IconUserCheck as UserCheck, IconUserPlus as UserPlus, IconUsersGroup as UsersGroup, IconVariable as Variable } from "@tabler/icons-react";
import type { ComponentType } from "react";

import { cn } from "@/lib/utils";
import type { ActionStepType } from "@/lib/automation-workflow";

import { StepPickerModal } from "./step-picker-modal";

export const stepIcon: Record<string, ComponentType<{ className?: string; strokeWidth?: number }>> = {
  send_email: Mail,
  move_stage: ArrowRightLeft,
  mark_deal_won: Trophy,
  mark_deal_lost: CircleX,
  assign_owner: UserPlus,
  transfer_department: UsersGroup,
  add_tag: Tag,
  remove_tag: Tag,
  update_field: Pencil,
  create_activity: CalendarPlus,
  send_whatsapp_message: MessageSquare,
  send_whatsapp_template: FileText,
  send_whatsapp_media: Image,
  send_whatsapp_interactive: MousePointerClick,
  send_whatsapp_list: ListDetails,
  send_whatsapp_flow: ClipboardList,
  send_product: ShoppingBag,
  webhook: Globe,
  delay: Clock,
  condition: GitBranch,
  round_robin: RefreshCw,
  update_lead_score: TrendingUp,
  question: MessageCircleQuestion,
  wait_for_reply: Pause,
  set_variable: Variable,
  goto: CornerDownRight,
  transfer_automation: Repeat,
  stop_automation: StopCircle,
  finish: Square,
  create_deal: Briefcase,
  finish_conversation: CheckCircle2,
  tabulate_conversation: Checklist,
  business_hours: Timer,
  check_agent_status: UserCheck,
  ask_ai_agent: Bot,
  transfer_to_ai_agent: BotMessageSquare,
  consume_stock: PackageMinus,
  execute_distribution: Route,
};

// Descricao curta (1 linha) usada no modal "O que deseja automatizar?"
// Mantida em pt-BR direta, sem jargao.
export const stepDescription: Record<string, string> = {
  send_email: "Envia um e-mail para o contato.",
  move_stage: "Move o negocio para outra etapa do funil.",
  mark_deal_won: "Marca o negocio como ganho no funil escolhido.",
  mark_deal_lost: "Marca o negocio como perdido, com motivo do funil escolhido.",
  assign_owner: "Atribui um responsavel ao contato/negocio.",
  transfer_department: "Transfere a conversa para um departamento.",
  add_tag: "Adiciona uma tag ao contato.",
  remove_tag: "Remove uma tag do contato.",
  update_field: "Atualiza um campo personalizado.",
  create_activity: "Cria uma tarefa, ligacao ou reuniao.",
  send_whatsapp_message: "Envia uma mensagem de texto pelo WhatsApp.",
  send_whatsapp_template: "Envia um template aprovado pelo WhatsApp.",
  send_whatsapp_media: "Envia imagem, video ou documento.",
  send_whatsapp_interactive: "Envia botoes interativos para o contato escolher.",
  send_whatsapp_list: "Envia um menu em lista (ate 10 opcoes) pelo WhatsApp.",
  send_whatsapp_flow: "Encaminha um formulário WhatsApp FLOW para o contato preencher.",
  send_product: "Envia um produto do catalogo com texto e parametros personalizaveis.",
  webhook: "Dispara uma chamada HTTP para um sistema externo.",
  delay: "Aguarda um intervalo de tempo antes do proximo passo.",
  condition: "Define uma regra com saidas Sim/Nao.",
  round_robin:
    "Escolhe qual caminho seguir em rodizio circular entre execucoes — nao atribui agente.",
  update_lead_score: "Soma ou subtrai pontos no lead score.",
  question: "Faz uma pergunta com opcoes de resposta.",
  wait_for_reply: "Aguarda o contato responder antes de seguir.",
  set_variable: "Cria ou atualiza uma variavel do fluxo.",
  goto: "Salta para outro passo do fluxo.",
  transfer_automation: "Transfere o contato para outra automacao.",
  stop_automation: "Encerra a execucao da automacao.",
  finish: "Encerra a automação neste ponto — nenhum passo posterior será executado.",
  create_deal: "Cria um novo negocio para o contato.",
  finish_conversation: "Marca a conversa como resolvida.",
  tabulate_conversation:
    "Grava o motivo de encerramento da conversa e, por padrao, ja encerra.",
  business_hours: "Decide com base no horario de atendimento.",
  check_agent_status: "Verifica se o responsavel da conversa esta online.",
  ask_ai_agent: "Consulta um agente de IA e salva a resposta em variavel.",
  transfer_to_ai_agent:
    "Transfere o atendimento pra um agente IA, que assume a conversa automaticamente.",
  consume_stock:
    "Reduz o estoque dos produtos do negócio. Bloqueia se faltar saldo (sem estoque negativo).",
  execute_distribution:
    "Distribui o lead entre os responsáveis elegíveis (Distribuição Inteligente).",
};

export const stepColor: Record<string, string> = {
  send_email: "text-[var(--color-info)]",
  move_stage: "text-[var(--brand-primary)]",
  mark_deal_won: "text-[var(--color-success)]",
  mark_deal_lost: "text-[var(--color-danger)]",
  assign_owner: "text-[var(--color-success)]",
  transfer_department: "text-[var(--color-success)]",
  add_tag: "text-[var(--color-success)]",
  remove_tag: "text-[var(--color-danger)]",
  update_field: "text-[var(--color-warn)]",
  create_activity: "text-[var(--color-lavender)]",
  send_whatsapp_message: "text-[var(--color-success)]",
  send_whatsapp_template: "text-[var(--color-success)]",
  send_whatsapp_media: "text-[var(--color-success)]",
  send_whatsapp_interactive: "text-[var(--color-lavender)]",
  send_whatsapp_list: "text-[var(--color-lavender)]",
  send_whatsapp_flow: "text-[var(--color-lavender)]",
  send_product: "text-[var(--color-success-text)]",
  webhook: "text-[var(--text-muted)]",
  delay: "text-[var(--color-orange)]",
  condition: "text-[var(--color-cyan)]",
  round_robin: "text-[var(--color-cyan)]",
  update_lead_score: "text-[var(--color-pink)]",
  question: "text-[var(--color-info)]",
  wait_for_reply: "text-[var(--color-warning)]",
  set_variable: "text-[var(--color-fuchsia)]",
  goto: "text-[var(--color-sky)]",
  transfer_automation: "text-[var(--brand-primary)]",
  stop_automation: "text-[var(--color-danger)]",
  finish: "text-[var(--color-danger)]",
  create_deal: "text-[var(--color-success-text)]",
  finish_conversation: "text-[var(--color-success)]",
  tabulate_conversation: "text-[var(--color-cyan)]",
  business_hours: "text-[var(--color-warn)]",
  check_agent_status: "text-[var(--color-warn)]",
  ask_ai_agent: "text-[var(--color-lavender)]",
  transfer_to_ai_agent: "text-[var(--color-lavender)]",
  consume_stock: "text-[var(--color-warning)]",
  execute_distribution: "text-[var(--brand-primary)]",
};

export type StepGroup = { title: string; items: ActionStepType[] };

export const STEP_GROUPS: StepGroup[] = [
  {
    title: "Mensagens",
    items: [
      "send_whatsapp_message",
      "send_whatsapp_template",
      "send_whatsapp_media",
      "send_whatsapp_interactive",
      "send_whatsapp_list",
      "send_whatsapp_flow",
      "send_product",
      "send_email",
    ],
  },
  {
    title: "Salesbot",
    items: ["question", "wait_for_reply", "set_variable", "goto", "transfer_automation", "finish"],
  },
  {
    title: "Ações",
    items: [
      "move_stage",
      "mark_deal_won",
      "mark_deal_lost",
      "assign_owner",
      "transfer_department",
      "add_tag",
      "remove_tag",
      "update_field",
      "create_activity",
      "update_lead_score",
      "create_deal",
      "tabulate_conversation",
      "finish_conversation",
      "consume_stock",
      "execute_distribution",
    ],
  },
  {
    title: "Lógica",
    items: ["delay", "condition", "round_robin", "business_hours", "check_agent_status"],
  },
  {
    title: "Integrações",
    items: ["webhook"],
  },
  {
    title: "IA",
    items: ["transfer_to_ai_agent", "ask_ai_agent"],
  },
];

export type AddStepNodeData = {
  afterStepId: string | null;
  onSelectType: (stepType: ActionStepType, afterStepId: string | null) => void;
};

type AddStepRF = Node<AddStepNodeData, "addStep">;

/**
 * AddStepNode — pílula "Adicionar próximo passo" no fim do canvas.
 */
export function AddStepNode({ data }: NodeProps<AddStepRF>) {
  const [open, setOpen] = useState(false);

  const handleSelect = useCallback(
    (type: ActionStepType) => {
      data.onSelectType(type, data.afterStepId);
      setOpen(false);
    },
    [data]
  );

  return (
    <div className="relative flex flex-col items-center">
      <CustomHandle
        type="target"
        position={Position.Left}
        connectionLimit={1}
        className="!size-2 !border-none !bg-transparent"
      />

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title="Clique para adicionar um passo · arraste até outro node para conectar · ou solte no vazio para criar"
        className={cn(
          "flex cursor-grab items-center gap-2 rounded-full border border-dashed px-3.5 py-1.5 text-[12px] font-semibold tracking-tight transition-colors active:cursor-grabbing",
          open
            ? "border-primary bg-[var(--color-primary-soft)] text-primary"
            : "border-primary/40 bg-[var(--color-bg-card)] text-[var(--text-muted)] hover:border-primary hover:bg-[var(--color-primary-soft)] hover:text-primary"
        )}
      >
        <Plus className="size-3.5" strokeWidth={2.6} />
        <span>Adicionar próximo passo</span>
      </button>

      <StepPickerModal
        open={open}
        onClose={() => setOpen(false)}
        onSelect={handleSelect}
      />
    </div>
  );
}
