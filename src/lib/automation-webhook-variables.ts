/**
 * Catálogo de variáveis disponíveis no body/headers do step "Webhook".
 *
 * Os tokens seguem o formato `{{caminho.aninhado}}` e são resolvidos no
 * backend (`automation-executor.ts > case "webhook"`) lendo o
 * RuntimeContext e o payload do evento via `buildWebhookRoot`. Mantenha
 * esta lista alinhada com o que o executor expõe — cada entrada nova
 * aqui só é útil se o root souber resolver o caminho.
 *
 * Por que dotted-path em vez de chaves planas?
 *   O `interpolateVariables` legado (em `automation-context.ts` no backend)
 *   só aceita `[a-zA-Z0-9_]+` — usado em mensagens WhatsApp. Pra webhook
 *   queremos `contact.name`, `contact.adCtwaClid`, `data.referral.headline`
 *   etc. — então o executor usa um resolver dedicado de path (ver
 *   `interpolateWebhookString`).
 *
 * O construtor visual em `webhook-step-config.tsx` consome este catálogo
 * pra montar o seletor de campos. Cada `key` canônica é a chave
 * estável usada também na re-hidratação de bodies salvos (ver
 * `webhook-body-builder.ts > parseBodyToEntries`).
 */

export type WebhookVariableGroup =
  | "Negócio"
  | "Contato"
  | "Anúncio (Meta CTWA)"
  | "Tags"
  | "Conversa"
  | "Automação"
  | "Sistema"
  | "Evento"
  | "Campos customizados do contato"
  | "Campos customizados do negócio";

export interface WebhookVariableOption {
  /**
   * Identificador canônico estável, ex.: `contact.name`. NÃO é o token —
   * é a chave usada pra casar opções entre sessões e pra parsear bodies
   * salvos. Para campos dinâmicos (ex.: custom fields) usamos prefixos
   * dedicados: `contactCustomFields.<name>` / `dealCustomFields.<name>`.
   */
  key: string;
  /** Token completo, ex.: `{{contact.name}}`. */
  token: string;
  /** Rótulo curto pra UI (sem o grupo). */
  label: string;
  /** Tooltip / dica. */
  hint?: string;
  /** Grupo pra renderização agrupada. */
  group: WebhookVariableGroup;
  /**
   * Sugestão de keyPath quando o usuário escolhe este campo no construtor
   * visual. O usuário pode editar livremente. Default = última parte da
   * `key` (ex.: `contact.name` → `name`). Override quando faz mais
   * sentido um nome plano (ex.: `dealId`).
   */
  defaultKeyPath?: string;
}

export const WEBHOOK_VARIABLE_OPTIONS: WebhookVariableOption[] = [
  // ─── Negócio ─────────────────────────────────────────────
  { group: "Negócio", key: "deal.id", token: "{{deal.id}}", label: "ID do negócio", defaultKeyPath: "dealId" },
  { group: "Negócio", key: "deal.title", token: "{{deal.title}}", label: "Título" },
  { group: "Negócio", key: "deal.value", token: "{{deal.value}}", label: "Valor" },
  { group: "Negócio", key: "deal.status", token: "{{deal.status}}", label: "Status (OPEN/WON/LOST)" },
  { group: "Negócio", key: "deal.stageId", token: "{{deal.stageId}}", label: "ID do estágio" },
  { group: "Negócio", key: "deal.stageName", token: "{{deal.stageName}}", label: "Nome do estágio" },
  { group: "Negócio", key: "deal.pipelineId", token: "{{deal.pipelineId}}", label: "ID do pipeline" },
  { group: "Negócio", key: "deal.pipelineName", token: "{{deal.pipelineName}}", label: "Nome do pipeline" },
  { group: "Negócio", key: "deal.ownerId", token: "{{deal.ownerId}}", label: "ID do responsável" },
  { group: "Negócio", key: "deal.createdAt", token: "{{deal.createdAt}}", label: "Criado em (ISO)" },
  { group: "Negócio", key: "deal.updatedAt", token: "{{deal.updatedAt}}", label: "Atualizado em (ISO)" },

  // ─── Contato ─────────────────────────────────────────────
  { group: "Contato", key: "contact.id", token: "{{contact.id}}", label: "ID do contato", defaultKeyPath: "contactId" },
  { group: "Contato", key: "contact.name", token: "{{contact.name}}", label: "Nome" },
  { group: "Contato", key: "contact.email", token: "{{contact.email}}", label: "E-mail" },
  { group: "Contato", key: "contact.phone", token: "{{contact.phone}}", label: "Telefone" },
  { group: "Contato", key: "contact.leadScore", token: "{{contact.leadScore}}", label: "Lead score" },
  { group: "Contato", key: "contact.lifecycleStage", token: "{{contact.lifecycleStage}}", label: "Ciclo de vida" },
  { group: "Contato", key: "contact.source", token: "{{contact.source}}", label: "Origem (campo source)" },
  { group: "Contato", key: "contact.adUtmSource", token: "{{contact.adUtmSource}}", label: "utm_source" },
  { group: "Contato", key: "contact.adUtmMedium", token: "{{contact.adUtmMedium}}", label: "utm_medium" },
  { group: "Contato", key: "contact.adUtmCampaign", token: "{{contact.adUtmCampaign}}", label: "utm_campaign" },
  { group: "Contato", key: "contact.adUtmContent", token: "{{contact.adUtmContent}}", label: "utm_content" },
  { group: "Contato", key: "contact.adUtmTerm", token: "{{contact.adUtmTerm}}", label: "utm_term" },
  { group: "Contato", key: "contact.gclid", token: "{{contact.gclid}}", label: "gclid" },
  { group: "Contato", key: "contact.fbclid", token: "{{contact.fbclid}}", label: "fbclid" },
  { group: "Contato", key: "contact.assignedToId", token: "{{contact.assignedToId}}", label: "ID do responsável" },
  { group: "Contato", key: "contact.companyId", token: "{{contact.companyId}}", label: "ID da empresa" },
  { group: "Contato", key: "contact.whatsappJid", token: "{{contact.whatsappJid}}", label: "WhatsApp JID" },
  { group: "Contato", key: "contact.whatsappBsuid", token: "{{contact.whatsappBsuid}}", label: "WhatsApp BSUID" },
  { group: "Contato", key: "contact.createdAt", token: "{{contact.createdAt}}", label: "Criado em (ISO)" },

  // ─── Anúncio (Meta CTWA) ──────────────────────────────────
  {
    group: "Anúncio (Meta CTWA)",
    key: "contact.adSourceId",
    token: "{{contact.adSourceId}}",
    label: "Source ID (post/ad)",
    hint: "Identificador retornado pela Meta no referral",
  },
  {
    group: "Anúncio (Meta CTWA)",
    key: "contact.adSourceType",
    token: "{{contact.adSourceType}}",
    label: "Tipo da origem",
    hint: "ad | post",
  },
  {
    group: "Anúncio (Meta CTWA)",
    key: "contact.adCtwaClid",
    token: "{{contact.adCtwaClid}}",
    label: "CTWA Click ID",
    hint: "Click identifier do Click-to-WhatsApp",
  },
  {
    group: "Anúncio (Meta CTWA)",
    key: "contact.adHeadline",
    token: "{{contact.adHeadline}}",
    label: "Headline do anúncio",
  },
  {
    group: "Anúncio (Meta CTWA)",
    key: "contact.adResolvedId",
    token: "{{contact.adResolvedId}}",
    label: "Ad ID resolvido",
    hint: "Ad ID após resolver post→ad pela Marketing API",
  },
  {
    group: "Anúncio (Meta CTWA)",
    key: "contact.adResolvedName",
    token: "{{contact.adResolvedName}}",
    label: "Nome do anúncio resolvido",
  },
  {
    group: "Anúncio (Meta CTWA)",
    key: "contact.adResolvedAdsetId",
    token: "{{contact.adResolvedAdsetId}}",
    label: "Adset ID",
  },
  {
    group: "Anúncio (Meta CTWA)",
    key: "contact.adResolvedAdsetName",
    token: "{{contact.adResolvedAdsetName}}",
    label: "Adset name",
  },
  {
    group: "Anúncio (Meta CTWA)",
    key: "contact.adResolvedCampaignId",
    token: "{{contact.adResolvedCampaignId}}",
    label: "Campaign ID",
  },
  {
    group: "Anúncio (Meta CTWA)",
    key: "contact.adResolvedCampaignName",
    token: "{{contact.adResolvedCampaignName}}",
    label: "Campaign name",
  },
  { group: "Anúncio (Meta CTWA)", key: "contact.adUtmSource", token: "{{contact.adUtmSource}}", label: "utm_source" },
  { group: "Anúncio (Meta CTWA)", key: "contact.adUtmMedium", token: "{{contact.adUtmMedium}}", label: "utm_medium" },
  { group: "Anúncio (Meta CTWA)", key: "contact.adUtmCampaign", token: "{{contact.adUtmCampaign}}", label: "utm_campaign" },
  { group: "Anúncio (Meta CTWA)", key: "contact.adUtmContent", token: "{{contact.adUtmContent}}", label: "utm_content" },
  { group: "Anúncio (Meta CTWA)", key: "contact.adUtmTerm", token: "{{contact.adUtmTerm}}", label: "utm_term" },

  // ─── Tags ────────────────────────────────────────────────
  {
    group: "Tags",
    key: "contactTagNames",
    token: "{{contactTagNames}}",
    label: "Tags do contato (lista)",
    hint: "Array de nomes — serializa como JSON",
  },
  {
    group: "Tags",
    key: "contactTagIds",
    token: "{{contactTagIds}}",
    label: "Tags do contato — IDs (lista)",
  },
  {
    group: "Tags",
    key: "dealTagNames",
    token: "{{dealTagNames}}",
    label: "Tags do negócio (lista)",
  },
  {
    group: "Tags",
    key: "dealTagIds",
    token: "{{dealTagIds}}",
    label: "Tags do negócio — IDs (lista)",
  },

  // ─── Conversa ────────────────────────────────────────────
  { group: "Conversa", key: "conversation.id", token: "{{conversation.id}}", label: "ID da conversa" },
  { group: "Conversa", key: "conversation.channel", token: "{{conversation.channel}}", label: "Canal" },
  { group: "Conversa", key: "conversation.status", token: "{{conversation.status}}", label: "Status" },
  {
    group: "Conversa",
    key: "conversation.assignedToId",
    token: "{{conversation.assignedToId}}",
    label: "ID do responsável da conversa",
  },

  // ─── Automação ───────────────────────────────────────────
  {
    group: "Automação",
    key: "automationId",
    token: "{{automationId}}",
    label: "ID da automação",
    defaultKeyPath: "automationId",
  },

  // ─── Sistema ─────────────────────────────────────────────
  {
    group: "Sistema",
    key: "timestamp",
    token: "{{timestamp}}",
    label: "Timestamp ISO atual",
    hint: "Gerado no momento do disparo",
    defaultKeyPath: "timestamp",
  },

  // ─── Evento ──────────────────────────────────────────────
  {
    group: "Evento",
    key: "event",
    token: "{{event}}",
    label: "Tipo do evento",
    hint: "ex.: message_received, contact_created, stage_changed",
    defaultKeyPath: "event",
  },
  {
    group: "Evento",
    key: "data",
    token: "{{data}}",
    label: "Payload do evento (JSON cru)",
    hint: "Útil pra debug — serializa o objeto inteiro",
    defaultKeyPath: "eventData",
  },
];

export const WEBHOOK_VARIABLE_GROUPS: WebhookVariableGroup[] = [
  "Negócio",
  "Contato",
  "Anúncio (Meta CTWA)",
  "Campos customizados do negócio",
  "Campos customizados do contato",
  "Tags",
  "Conversa",
  "Automação",
  "Sistema",
  "Evento",
];

/**
 * Prefixo usado para tokens de custom fields. O backend (`buildWebhookRoot`)
 * expõe os snapshots como `contactCustomFields` / `dealCustomFields`
 * (mapa `name` → valor) — então o token canônico é
 * `{{contactCustomFields.<name>}}`.
 */
export const CONTACT_CUSTOM_FIELD_KEY_PREFIX = "contactCustomFields.";
export const DEAL_CUSTOM_FIELD_KEY_PREFIX = "dealCustomFields.";

/**
 * Gera as opções de catálogo a partir da lista de custom fields
 * carregada via `/api/custom-fields`. As `key`s são estáveis
 * (`contactCustomFields.<name>`) — usadas pra parsing de bodies salvos.
 */
export function buildCustomFieldOptions(
  fields: Array<{ name: string; label?: string; entity: string }>,
): WebhookVariableOption[] {
  const out: WebhookVariableOption[] = [];
  for (const f of fields) {
    const name = (f.name || "").trim();
    if (!name) continue;
    // Antes esses campos ficavam em categorias próprias ("Campos
    // customizados do negócio/contato"). Na prática o operador escolhia
    // "Negócio" no dropdown e não achava os customs — trocamos pra
    // mesclar dentro da própria entidade, marcando com "★" pra
    // distinguir visualmente dos campos padrão. A `key`/`token`
    // continuam idênticas, então bodies salvos continuam parseáveis.
    if (f.entity === "deal") {
      out.push({
        group: "Negócio",
        key: `${DEAL_CUSTOM_FIELD_KEY_PREFIX}${name}`,
        token: `{{${DEAL_CUSTOM_FIELD_KEY_PREFIX}${name}}}`,
        label: `★ ${f.label || name}`,
        hint: `Campo customizado do negócio (${name})`,
        defaultKeyPath: name,
      });
    } else if (f.entity === "contact") {
      out.push({
        group: "Contato",
        key: `${CONTACT_CUSTOM_FIELD_KEY_PREFIX}${name}`,
        token: `{{${CONTACT_CUSTOM_FIELD_KEY_PREFIX}${name}}}`,
        label: `★ ${f.label || name}`,
        hint: `Campo customizado do contato (${name})`,
        defaultKeyPath: name,
      });
    }
  }
  return out;
}

/**
 * Helper para o construtor visual: dado um `WebhookVariableOption`,
 * deriva o `keyPath` default que aparece no input "chave do webhook".
 * Se a opção tem `defaultKeyPath` explícito, usa ele; senão pega a
 * última parte da `key` (`contact.phone` → `phone`).
 */
export function defaultKeyPathFor(option: WebhookVariableOption): string {
  if (option.defaultKeyPath) return option.defaultKeyPath;
  const parts = option.key.split(".");
  return parts[parts.length - 1] || option.key;
}

/**
 * Modelo de body legado — mantido pra retrocompat. NÃO é mais inserido
 * por nenhum botão na UI nova (o usuário monta o body via construtor
 * visual), mas o constante segue aqui caso alguém precise referenciar
 * o formato esperado pelo backend.
 */
export const DEFAULT_WEBHOOK_BODY_TEMPLATE = `{
  "event": "{{event}}",
  "contactId": "{{contact.id}}",
  "contact": {
    "name": "{{contact.name}}",
    "phone": "{{contact.phone}}",
    "email": "{{contact.email}}"
  },
  "ad": {
    "source_id": "{{contact.adSourceId}}",
    "ctwa_clid": "{{contact.adCtwaClid}}",
    "headline": "{{contact.adHeadline}}",
    "campaign_name": "{{contact.adResolvedCampaignName}}"
  },
  "dealId": "{{deal.id}}",
  "automationId": "{{automationId}}",
  "timestamp": "{{timestamp}}"
}`;
