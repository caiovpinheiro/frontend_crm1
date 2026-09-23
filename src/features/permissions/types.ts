export interface ActionDef {
  action: string;
  label: string;
  description?: string;
  destructive?: boolean;
  /**
   * Nível mínimo (modo simplificado) em que a action é concedida:
   * 1 = Ver, 2 = Operar, 3 = Total (sensível). Quando ausente, é
   * derivado por heurística em `actionTier()` (level-matrix).
   */
  tier?: 1 | 2 | 3;
}

export interface ResourceDef {
  resource: string;
  label: string;
  description?: string;
  actions: ActionDef[];
}

export interface PermissionsCatalog {
  resources: ResourceDef[];
}

export interface RoleUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
}

/**
 * Preferência de menu lateral persistida no papel — mesmo shape que o
 * catálogo da sidebar usa. Ver `@/lib/sidebar-catalog`. `null` = sem
 * override (o papel cai no catálogo padrão do CRM).
 */
export interface RoleSidebarItem {
  key: string;
  enabled: boolean;
  order: number;
}

/** Grant de etapa do funil concedido a um papel. */
export interface StageGrantEntry {
  stageId: string;
  canView: boolean;
  canEdit: boolean;
}

/** Bloqueio de um funil inteiro. Ausência da linha = o papel vê o funil. */
export interface PipelineGrantEntry {
  pipelineId: string;
  canView: boolean;
}

/** Grant por campo (mascaramento) concedido a um papel. */
export interface FieldGrantEntry {
  /** "deal" | "contact" | "company" | "product" */
  entity: string;
  fieldKey: string;
  canView: boolean;
  canEdit: boolean;
}

export interface RoleSummary {
  id: string;
  name: string;
  systemPreset: string | null;
  isSystem: boolean;
  description: string | null;
  permissions: string[];
  /** Extra: ler/responder conversas não atribuídas (default true). */
  sharedInbox?: boolean;
  /** Extra: baixar/visualizar mídias anexadas (default true). */
  mediaAccess?: boolean;
  /** Visibilidade por etapa do funil (vazio = todas). */
  stageGrants?: StageGrantEntry[];
  /** Funis bloqueados para o papel (vazio = todos). */
  pipelineGrants?: PipelineGrantEntry[];
  /** Restrições por campo (vazio = todos liberados). */
  fieldGrants?: FieldGrantEntry[];
  /**
   * Ponteiro de origem (modelo de herança pragmático): id do role base do
   * qual este grupo personalizado herda. Null/undefined em presets e grupos
   * legados. As permissões efetivas continuam em `permissions`.
   */
  inheritsFrom?: string | null;
  /**
   * Menu lateral configurado pelo admin para este papel. `null` = sem
   * override (usuários do papel veem o catálogo padrão). A sidebar EFETIVA
   * do usuário é a união dos `sidebarItems` de todos os papéis atribuídos
   * a ele — resolvida no backend em `getSidebarPreferences`.
   */
  sidebarItems?: RoleSidebarItem[] | null;
  _count?: { assignments: number };
  assignments?: { id: string; user: RoleUser }[];
}

export interface EffectivePermissions {
  permissions: string[];
  channelGrants: string[];
  stageGrants: string[];
  roles: { id: string; name: string; systemPreset: string | null }[];
}
