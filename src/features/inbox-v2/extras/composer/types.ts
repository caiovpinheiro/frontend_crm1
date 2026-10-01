import type { ReactNode } from "react";
import type { OutboundChannelOption } from "@/features/inbox-v2/hooks/use-channels";
import type { PendingTemplate } from "../template-compose-panel";

export interface ComposerProps {
  conversationId: string | null;
  value: string;
  onChange: (value: string) => void;
  /** Pode retornar Promise — o composer aguarda antes de enviar anexos do modelo. */
  onSend: (value: string) => void | Promise<void>;
  /** Envio como nota interna (isPrivate). Quando ausente, o item "Nota interna" não aparece no menu. */
  onSendNote?: (value: string) => void;
  sending?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Quando definido, habilita o item Finalizar/Reabrir no menu "+". */
  isResolved?: boolean;
  contactId?: string | null;
  contactName?: string | null;
  /** Negócio exibido — padrão ao criar tarefa pelo menu "+". */
  dealId?: string | null;
  dealTitle?: string | null;
  /** Negócios do contato para o seletor da tarefa. */
  deals?: { id: string; title: string }[];
  /**
   * Template empurrado por um picker externo (ex.: modal de sessão expirada).
   * Quando muda para não-nulo, abre o painel de validação aqui dentro.
   */
  externalTemplate?: PendingTemplate | null;
  /** Avisado quando o `externalTemplate` foi absorvido (para o pai limpar). */
  onExternalTemplateConsumed?: () => void;
  /** Permissão org-level: agentes podem usar assinatura. Default true. */
  signatureAllowed?: boolean;
  /** Permissão org-level: agentes podem editar o texto da assinatura. Default true. */
  signatureEditable?: boolean;
  /**
   * Canais WhatsApp CONNECTED da org (para seletor de canal de envio).
   * O seletor só é renderizado quando `availableChannels.length > 1` —
   * orgs com 1 canal não precisam do widget.
   */
  availableChannels?: OutboundChannelOption[];
  /** Canal selecionado para o envio. Controlado pelo pai. */
  selectedChannelId?: string | null;
  /** Canal "atual" da conversa (último inbound) — destacado como referência. */
  conversationChannelId?: string | null;
  /** Canal da última mensagem pública — usado pra pré-selecionar no modal. */
  lastMessageChannelId?: string | null;
  /** Callback quando o agente troca o canal de envio. */
  onSelectChannel?: (channelId: string) => void;
  /**
   * Mensagem selecionada para "responder" (estilo WhatsApp). Quando não
   * nula, o composer renderiza uma barra de preview acima do input com o
   * remetente citado + preview do texto. O caller é responsável por incluir
   * `replyToId: replyTo.id` no payload de `sendMessage` e limpar após o envio.
   */
  replyTo?: {
    id: string;
    preview: string;
    senderName?: string | null;
  } | null;
  /** Handler do X para cancelar a resposta. */
  onCancelReply?: () => void;
  /** Departamento da conversa — propagado ao ComposerMenu para abrir
   *  modal de tabulacao ao encerrar quando o dept exige. */
  departmentId?: string | null;
  assignedToId?: string | null;
  requireTabulationOnClose?: boolean;
  /** Reabrir pelo menu "+" cria um NOVO ticket (modelo de ticket); troca o
   *  chat ativo pro id novo. Sem isto o reopen acontece no backend mas a UI
   *  fica presa no ticket resolvido (que some do colapso) — parece "não reabriu". */
  onReopenNewConversation?: (newConversationId: string) => void;
  /** Após Encerrar — atualiza sticky/status local (evita toast de deep-link). */
  onResolved?: (conversationId: string) => void;
  onFollowedUp?: (conversationId: string) => void;
  /** Nº do ticket — exibido ao lado de Encerrar/Reabrir. */
  conversationNumber?: number | null;
  /** Quem mais está com o negócio aberto — mesma linha das tabs. */
  viewersSlot?: ReactNode;
  /** Slot à esquerda das tabs (ex.: TransferPopover). */
  transferSlot?: ReactNode;
  /** Abre o fluxo de template (sessão 24h encerrada). */
  onRequestTemplate?: () => void;
  /** Janela de 24h da Meta encerrada — aviso dedicado + CTA de template. */
  sessionExpired?: boolean;
  /** Exibe "Pedir permissão de ligação" no menu +. */
  enableCallPermission?: boolean;
}
