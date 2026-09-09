import { IconBroadcast as Broadcast, IconCalendarTime as CalendarTime, IconDatabase as Database, IconForms as Forms, IconHeadphones as Headphones, IconLifebuoy as LifeBuoy, IconListTree as ListTree, IconLock as Lock, IconMail as Mail, IconMailForward as MailForward, IconMessageCircle as MessageCircle, IconMessage as MessageSquare, IconPackage as Package, IconAdjustments as Settings2, IconDeviceMobile as Smartphone, IconSparkles as Sparkles, IconTag as Tag, IconTemplate as Template, IconUsers as Users } from "@tabler/icons-react";
import type { ComponentType } from "react";
import { UserRole } from "@/lib/prisma-enum-types";

/**
 * Fonte unica de verdade do menu de Configuracoes.
 *
 * A estrutura eh declarativa, hierarquica e orientada ao modelo mental
 * do usuario: itens similares agrupados por INTENCAO, nao por feature
 * tecnica. Inspiracao: Kommo / Intercom / Front.
 *
 * Cada item declara `allowedRoles` — roles que enxergam o item na
 * sidebar. Ausente = todos os roles. Isso eh o "ponto de extensao":
 * quando adicionar uma tabela de permissoes granulares no banco (como
 * o painel de Direitos do Kommo), basta substituir esse array por um
 * override vindo do backend. Enquanto isso, defaults baked-in
 * cobrem 95% dos casos com zero config.
 *
 * Convencoes:
 *  - Um item com `href=null` eh placeholder (nao navegavel). Use so
 *    pra secoes em desenvolvimento — preferir OMITIR o item a colocar
 *    um "em breve" que gera ruido visual.
 *  - `description` eh curta (<=40 chars), aparece embaixo do label em
 *    viewports largos.
 *  - `eyebrow` (opcional) marca itens com badge pequeno no canto
 *    (ex.: "Beta", "Novo"). Nao coloque dados dinamicos aqui.
 */

export type SettingsNavIcon = ComponentType<{ className?: string }>;

export type SettingsNavItem = {
  id: string;
  label: string;
  description?: string;
  icon: SettingsNavIcon;
  href: string | null;
  /**
   * Roles que enxergam o item. Ausente/undefined = visivel pra todos
   * os roles autenticados. Super-admin sempre enxerga tudo.
   */
  allowedRoles?: UserRole[];
  /** Permission key canônica (`resource:action`) para exibir o item. */
  requiredPermission?: string;
  /** Badge discreto no canto do item. Ex.: "Beta", "Novo". */
  eyebrow?: string;
};

export type SettingsNavGroup = {
  id: string;
  label: string;
  /** Icone do grupo — pintado no header da secao. */
  icon: SettingsNavIcon;
  /**
   * Breve descricao do agrupamento (opcional). Aparece embaixo do
   * titulo do grupo em mobile e como tooltip no desktop.
   */
  description?: string;
  items: SettingsNavItem[];
};

/** Lista dos roles padrao de gestao (admin + manager). */
const GESTAO: UserRole[] = [UserRole.ADMIN, UserRole.MANAGER];

/** Apenas admin da organizacao. */
const SO_ADMIN: UserRole[] = [UserRole.ADMIN];

export const SETTINGS_NAV: SettingsNavGroup[] = [
  {
    id: "comunicacao",
    label: "Comunicação",
    icon: MessageSquare,
    description: "Canais, templates e avisos",
    items: [
      {
        id: "channels",
        label: "Canais",
        description: "WhatsApp, Instagram, e-mail e webchat",
        icon: Broadcast,
        href: "/settings/channels",
        allowedRoles: GESTAO,
        requiredPermission: "settings:channels",
      },
      {
        id: "message-models",
        label: "Modelos de mensagem",
        description: "Internos, WhatsApp WABA e Flows (Kommo)",
        icon: Template,
        href: "/settings/message-models",
        allowedRoles: GESTAO,
      },
      {
        id: "conversations",
        label: "Conversas",
        description: "Assinatura, permissões de conversa",
        icon: MessageCircle,
        href: "/settings/conversations",
        allowedRoles: SO_ADMIN,
        requiredPermission: "settings:permissions",
      },
      {
        id: "tabulations",
        label: "Tabulações",
        description: "Árvore de motivos + dashboard/logs",
        icon: ListTree,
        href: "/settings/tabulations",
        allowedRoles: GESTAO,
        eyebrow: "Novo",
      },
      {
        id: "email-accounts",
        label: "Contas de e-mail",
        description: "IMAP/SMTP, pastas e regras",
        icon: Mail,
        href: "/settings/email-accounts",
        requiredPermission: "email_account:connect",
        eyebrow: "Novo",
      },
      {
        id: "smtp-relay",
        label: "Relay SMTP",
        description: "Smarthost de saída por domínio",
        icon: MailForward,
        href: "/settings/smtp-relay",
        allowedRoles: SO_ADMIN,
        requiredPermission: "settings:email",
        eyebrow: "Novo",
      },
    ],
  },

  {
    id: "crm-dados",
    label: "CRM & Dados",
    icon: Database,
    description: "Campos, tags e produtos",
    items: [
      {
        id: "custom-fields",
        label: "Campos personalizados",
        description: "Contatos, empresas e negócios",
        icon: Forms,
        href: "/settings/custom-fields",
        allowedRoles: GESTAO,
        requiredPermission: "settings:custom_fields",
      },
      {
        id: "tags",
        label: "Tags",
        description: "Rótulos e cores",
        icon: Tag,
        href: "/settings/tags",
        allowedRoles: GESTAO,
        // tag:edit (e nao tag:view): membro comum ve tags no CRM, mas so
        // quem pode edita-las precisa da tela de administracao.
        requiredPermission: "tag:edit",
      },
      {
        id: "products",
        label: "Produtos",
        description: "Catálogo, produtos e cotas de desconto",
        icon: Package,
        href: "/settings/products",
        allowedRoles: GESTAO,
        requiredPermission: "product:view",
      },
    ],
  },

  {
    id: "equipe-operacao",
    label: "Equipe & Operação",
    icon: Headphones,
    description: "Pessoas, distribuição e expediente",
    items: [
      {
        id: "team",
        label: "Equipe",
        description: "Membros, funções e convites",
        icon: Users,
        href: "/settings/team",
        allowedRoles: GESTAO,
        requiredPermission: "settings:team",
      },
      {
        id: "coverage",
        label: "Cobertura",
        description: "Grade de horários e gaps por área",
        icon: CalendarTime,
        // Vive na tela de Distribuição (aba ao lado de "Equipe"); o card
        // aqui continua sendo o atalho conhecido de Configurações.
        href: "/widgets/distribution?tab=coverage",
        allowedRoles: GESTAO,
        requiredPermission: "settings:team",
      },
    ],
  },

  {
    id: "automacoes-ia",
    label: "Automações & IA",
    icon: Sparkles,
    description: "Agentes e assistentes inteligentes",
    items: [
      {
        id: "ai-config",
        label: "Configuração de IA",
        description: "Chave OpenAI e testes de conexão",
        icon: Sparkles,
        href: "/settings/ai",
        allowedRoles: SO_ADMIN,
        requiredPermission: "settings:ai",
      },
    ],
  },

  {
    id: "sistema",
    label: "Sistema",
    icon: Settings2,
    description: "Preferências e acessos",
    items: [
      {
        id: "security",
        label: "Segurança",
        description: "Permissões, API e Webhooks e feature flags",
        icon: Lock,
        href: "/settings/security",
        allowedRoles: SO_ADMIN,
        requiredPermission: "settings:security",
      },
      {
        id: "mobile-layout",
        label: "App Mobile",
        description: "Barra inferior do PWA",
        icon: Smartphone,
        href: "/settings/mobile-layout",
        allowedRoles: GESTAO,
        requiredPermission: "settings:branding",
      },
    ],
  },
];

/**
 * Atalhos no topo do settings — acessos pessoais que todo usuario tem,
 * independente do role. Separados dos grupos principais pra nao poluir
 * a listagem de configuracoes do workspace.
 */
export const SETTINGS_PERSONAL: SettingsNavItem[] = [
  {
    id: "profile",
    label: "Meu perfil",
    description: "Nome, avatar, senha",
    icon: Users,
    href: "/settings/profile",
  },
  {
    id: "help",
    label: "Suporte",
    description: "Chat interno com o time de suporte",
    icon: LifeBuoy,
    href: "/settings/support",
  },
];
