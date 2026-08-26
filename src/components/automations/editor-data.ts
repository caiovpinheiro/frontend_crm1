"use client"

/**
 * Hooks de dados (somente leitura) para a edição inline do editor visual
 * de automações (/automations/editor). Reusa as MESMAS rotas do editor
 * real, normalizando tudo para `{ value, label, group? }`.
 *
 * Nada aqui faz mutação — apenas GET. As queries têm staleTime alto para
 * não refazer fetch a cada card que abrir.
 */
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { apiUrl } from "@/lib/api"
import { readStepAllowedChannelIds } from "@/lib/automation-workflow"
import {
  fetchConnectedMetaCloudWhatsAppChannels,
  formatMetaChannelLabel,
} from "@/lib/meta-whatsapp/meta-cloud-channels"
import { usePipelinesQuery } from "@/features/shared/queries/pipelines"
import { useTeamUsersQuery } from "@/features/shared/queries/team-users"

export type Opt = { value: string; label: string; group?: string }

/** Mantém o id salvo visível no select mesmo se o catálogo ainda carrega ou o item sumiu. */
export function optionsWithSaved(
  options: Opt[],
  value: string | undefined,
  label?: string,
): Opt[] {
  const v = (value ?? "").trim()
  if (!v) return options
  if (options.some((o) => o.value === v)) return options
  const fallback = (label ?? "").trim()
  return [{ value: v, label: fallback || v, group: "Salvo" }, ...options]
}

const STALE = 5 * 60_000

function asArray(json: unknown): unknown[] {
  if (Array.isArray(json)) return json
  if (json && typeof json === "object") {
    const o = json as Record<string, unknown>
    if (Array.isArray(o.items)) return o.items
    if (Array.isArray(o.data)) return o.data
  }
  return []
}

async function getJson(path: string): Promise<unknown> {
  const res = await fetch(apiUrl(path))
  if (!res.ok) throw new Error(`Falha ao carregar ${path}`)
  return res.json()
}

type RawPipeline = {
  id: string
  name: string
  stages?: { id: string; name: string; slug?: string }[]
}

/** Estágios de todos os funis → value: stageId, group: nome do funil. */
export function useStageOptions() {
  const q = usePipelinesQuery<RawPipeline>()
  const options = useMemo<Opt[]>(
    () =>
      (q.data ?? []).flatMap((p) =>
        (p.stages ?? []).map((s) => ({ value: s.id, label: s.name, group: p.name })),
      ),
    [q.data],
  )
  return { options, isLoading: q.isLoading }
}

/** Funis (pipelines) → value: pipelineId. Para condições `deal.pipelineId`. */
export function usePipelineOptions() {
  const q = usePipelinesQuery<RawPipeline>()
  const options = useMemo<Opt[]>(
    () => (q.data ?? []).map((p) => ({ value: p.id, label: p.name })),
    [q.data],
  )
  return { options, isLoading: q.isLoading }
}

type RawPipelineLossReasonMeta = { reasons?: { id: string; label: string }[] }

/**
 * Motivos de perda cadastrados NO FUNIL (catálogo restrito daquele
 * pipeline, sem "Outro"). Usado pelo node de automação "Perda"
 * (`mark_deal_lost`), que só aceita motivos catalogados. `value` é o
 * `label` — `Deal.lostReason` grava o texto, não o id (mesmo padrão do
 * `LossReasonDialog` do kanban).
 */
export function usePipelineLossReasonOptions(pipelineId?: string | null) {
  const id = pipelineId?.trim() || ""
  const q = useQuery({
    queryKey: ["editor-pipeline-loss-reasons", id],
    staleTime: STALE,
    enabled: !!id,
    queryFn: async (): Promise<Opt[]> => {
      const meta = (await getJson(`/api/pipelines/${id}/loss-reasons`)) as RawPipelineLossReasonMeta
      const reasons = Array.isArray(meta.reasons) ? meta.reasons : []
      return reasons.map((r) => ({ value: r.label, label: r.label }))
    },
  })
  return { options: id ? q.data ?? [] : [], isLoading: id ? q.isLoading : false }
}

type RawDepartment = { id: string; name: string; icon?: string }

/** Departamentos da org → value: departmentId. Para `conversation.departmentId`
 *  e o passo `transfer_department` das automações. */
export function useDepartmentOptions() {
  const q = useQuery({
    queryKey: ["editor-departments"],
    staleTime: STALE,
    queryFn: async (): Promise<Opt[]> => {
      // getJson lança em !ok — não engolir 403/500 como lista vazia
      // (mascarava schema drift / permissão como "sem departamentos").
      const list = asArray(await getJson("/api/settings/departments")) as RawDepartment[]
      return list.map((d) => ({
        value: d.id,
        // Nome puro: o summary do card (`departmentName`) e o executor
        // usam este label — ícone fica só na tela de Configurações.
        label: d.name,
      }))
    },
  })
  return { options: q.data ?? [], isLoading: q.isLoading, isError: q.isError }
}

type RawUser = { id: string; name?: string; email?: string }

export function useUserOptions() {
  // Key canônica de /api/users — o mapeamento p/ `Opt` vira `select`
  // pra não criar um segundo cache do mesmo endpoint.
  const q = useTeamUsersQuery<RawUser>()
  const options = useMemo<Opt[]>(
    () =>
      (q.data ?? []).map((u) => ({
        value: u.id,
        label: u.email ? `${u.name ?? u.email} (${u.email})` : (u.name ?? u.id),
      })),
    [q.data],
  )
  return { options, isLoading: q.isLoading }
}

type RawAgent = { id: string; userId: string; name: string; active?: boolean }

/** Agentes IA ativos. `by="userId"` para ações que transferem o atendimento. */
export function useAiAgentOptions(by: "id" | "userId" = "id") {
  const q = useQuery({
    queryKey: ["editor-ai-agents"],
    staleTime: STALE,
    queryFn: async (): Promise<RawAgent[]> => asArray(await getJson("/api/ai-agents")) as RawAgent[],
  })
  const options: Opt[] = (q.data ?? [])
    .filter((a) => a.active !== false)
    .map((a) => ({ value: by === "userId" ? a.userId : a.id, label: `🤖 ${a.name}` }))
  return { options, isLoading: q.isLoading }
}

type RawTag = { id: string; name: string }

export function useTagOptions() {
  const q = useQuery({
    queryKey: ["editor-tags"],
    staleTime: STALE,
    queryFn: async (): Promise<Opt[]> => {
      const list = asArray(await getJson("/api/tags")) as RawTag[]
      return list.map((t) => ({ value: t.name, label: t.name }))
    },
  })
  return { options: q.data ?? [], isLoading: q.isLoading }
}

type RawChannel = { id: string; name?: string; type?: string; status?: string }

/** Canais da org (para condições de gatilho "Se canal = X"). value: channelId. */
export function useChannelOptions() {
  const q = useQuery({
    queryKey: ["editor-channels"],
    staleTime: STALE,
    queryFn: async (): Promise<Opt[]> => {
      const json = await getJson("/api/channels")
      const list = (
        Array.isArray(json)
          ? json
          : Array.isArray((json as { channels?: unknown[] })?.channels)
            ? (json as { channels: unknown[] }).channels
            : asArray(json)
      ) as RawChannel[]
      return list.map((c) => ({
        value: c.id,
        label: c.name || c.id,
        group: c.type || undefined,
      }))
    },
  })
  return { options: q.data ?? [], isLoading: q.isLoading }
}

type RawTemplate = { metaTemplateName?: string; name?: string; label?: string; language?: string; languageCode?: string }

type RawTemplateDetail = RawTemplate & {
  bodyPreview?: string
  headerPreview?: string
  footerPreview?: string
  buttons?: { type?: string; text?: string }[]
  headerFormat?: string | null
}

/**
 * Um canal só quando o envio é daquela WABA.
 * Vários = interseção (não usar o último CONNECTED).
 * `undefined` = ainda carregando a lista de canais — não buscar.
 */
export function resolveTemplateChannelIds(
  config?: { channelId?: unknown; channelIds?: unknown; channelScope?: unknown } | null,
  inherited?: string | null,
  connectedIds?: string[] | null,
  opts?: { bindToInbound?: boolean },
): string[] | undefined {
  const allowed = readStepAllowedChannelIds(config)
  if (allowed) {
    return [...new Set(allowed.map((id) => id.trim()).filter(Boolean))]
  }
  const inh = inherited?.trim()
  if (inh) return [inh]
  const override =
    typeof config?.channelId === "string" ? config.channelId.trim() : ""
  if (override && !opts?.bindToInbound) return [override]
  if (connectedIds == null) return undefined
  return [...new Set(connectedIds.map((id) => id.trim()).filter(Boolean))]
}

/** Canal único quando dá para afirmar a WABA; senão `undefined` (não cai no último CONNECTED). */
export function resolveTemplateChannelId(
  config?: { channelId?: unknown; channelIds?: unknown; channelScope?: unknown } | null,
  inherited?: string | null,
  opts?: { bindToInbound?: boolean },
): string | undefined {
  const ids = resolveTemplateChannelIds(config, inherited, null, opts)
  return ids?.length === 1 ? ids[0] : undefined
}

function templateNameOf(t: { metaTemplateName?: string; name?: string }): string {
  return (t.metaTemplateName ?? t.name ?? "").trim()
}

function templateLangOf(t: { language?: string; languageCode?: string }): string {
  return (t.language ?? t.languageCode ?? "pt_BR").trim()
}

function templateLangKey(t: { language?: string; languageCode?: string }): string {
  return templateLangOf(t).toLowerCase()
}

function rowHasTemplate(
  rows: RawTemplate[],
  name: string,
  language?: string | null,
): boolean {
  const n = name.trim()
  if (!n) return true
  const lang = language?.trim().toLowerCase()
  return rows.some((t) => {
    if (templateNameOf(t) !== n) return false
    if (!lang) return true
    return templateLangKey(t) === lang
  })
}

function intersectApprovedRows(lists: RawTemplate[][]): RawTemplate[] {
  if (lists.length === 0) return []
  if (lists.length === 1) return lists[0] ?? []
  const keySets = lists.map((list) => {
    const s = new Set<string>()
    for (const t of list) {
      const n = templateNameOf(t)
      if (n) s.add(`${n}::${templateLangKey(t)}`)
    }
    return s
  })
  const first = keySets[0]!
  const common = new Set([...first].filter((k) => keySets.every((s) => s.has(k))))
  return (lists[0] ?? []).filter((t) => {
    const n = templateNameOf(t)
    return n !== "" && common.has(`${n}::${templateLangKey(t)}`)
  })
}

function optionsFromApproved(list: RawTemplate[]): Opt[] {
  return list
    .map((t) => {
      const v = templateNameOf(t)
      return { value: v, label: t.label || v }
    })
    .filter((o) => o.value !== "")
}

async function fetchApprovedTemplates(channelId: string): Promise<RawTemplateDetail[]> {
  const qs = `?channelId=${encodeURIComponent(channelId)}`
  return asArray(
    await getJson(`/api/whatsapp-template-configs/approved${qs}`),
  ) as RawTemplateDetail[]
}

/** Templates aprovados da WABA. Sem `channelId` não busca o último CONNECTED. */
export function useTemplateOptions(channelId?: string | null) {
  const id = channelId?.trim() || ""
  const q = useQuery({
    queryKey: ["editor-wa-templates", id || "none"],
    staleTime: 60_000,
    enabled: id !== "",
    queryFn: async (): Promise<Opt[]> =>
      optionsFromApproved(await fetchApprovedTemplates(id)),
  })
  return { options: id ? q.data ?? [] : [], isLoading: id ? q.isLoading : false }
}

export type TemplateButtonKind = "reply" | "url" | "call" | "flow" | "copy"

export type TemplateDetail = {
  bodyPreview: string
  headerPreview: string
  footerPreview: string
  quickReplies: string[]
  headerFormat?: string | null
  language?: string
  buttons: { title: string; kind: TemplateButtonKind }[]
}

export function getTemplateDetail(
  map: Map<string, TemplateDetail>,
  name: string,
  language?: string | null,
): TemplateDetail | undefined {
  const n = name.trim()
  if (!n) return undefined
  const lang = language?.trim().toLowerCase()
  if (lang) {
    const hit = map.get(`${n}::${lang}`)
    if (hit) return hit
  }
  return map.get(n)
}

export function mergeTemplateQuickReplies(
  prev: { title?: string; text?: string; gotoStepId?: string }[],
  quickReplies: string[],
): { id: string; title: string; gotoStepId: string }[] {
  return quickReplies.map((title, i) => {
    const match = prev.find(
      (p) => (p.title ?? p.text ?? "").trim().toLowerCase() === title.toLowerCase(),
    )
    return { id: `btn_${i}`, title, gotoStepId: match?.gotoStepId ?? "" }
  })
}

function detailFromApproved(t: RawTemplateDetail): TemplateDetail | null {
  const name = templateNameOf(t)
  if (!name) return null
  const language = templateLangOf(t)
  const buttons = (t.buttons ?? [])
    .map((b) => {
      const title = (b.text ?? "").trim()
      if (!title) return null
      const type = String(b.type ?? "").toUpperCase()
      const kind: TemplateButtonKind =
        type === "URL" ? "url"
        : type === "PHONE_NUMBER" || type === "VOICE_CALL" ? "call"
        : type === "FLOW" ? "flow"
        : type === "COPY_CODE" || type === "OTP" ? "copy"
        : "reply"
      return { title, kind }
    })
    .filter((x): x is { title: string; kind: TemplateButtonKind } => Boolean(x))
  return {
    bodyPreview: (t.bodyPreview ?? "").trim(),
    headerPreview: (t.headerPreview ?? "").trim(),
    footerPreview: (t.footerPreview ?? "").trim(),
    quickReplies: buttons.filter((b) => b.kind === "reply").map((b) => b.title),
    headerFormat: t.headerFormat ?? null,
    language,
    buttons,
  }
}

function detailsMapFromApproved(list: RawTemplateDetail[]): Map<string, TemplateDetail> {
  const map = new Map<string, TemplateDetail>()
  for (const t of list) {
    const name = templateNameOf(t)
    const detail = detailFromApproved(t)
    if (!name || !detail) continue
    const language = detail.language ?? "pt_BR"
    map.set(`${name}::${language.toLowerCase()}`, detail)
    const existing = map.get(name)
    if (!existing || language.toLowerCase() === "pt_br") map.set(name, detail)
  }
  return map
}

type ChannelTemplateList = { id: string; list: RawTemplateDetail[] }

export type StepTemplateCatalog = {
  options: Opt[]
  detailsMap: Map<string, TemplateDetail>
  isLoading: boolean
  isIntersect: boolean
  scopedChannelIds: string[]
  missingChannelLabels: (name: string, language?: string | null) => string[]
}

/**
 * Mapa nome-do-template → preview. Sem `channelId` não busca o último CONNECTED.
 */
export function useTemplateDetailsMap(channelId?: string | null) {
  const id = channelId?.trim() || ""
  const q = useQuery({
    queryKey: ["editor-wa-templates-detail", id || "none"],
    staleTime: 60_000,
    enabled: id !== "",
    queryFn: async (): Promise<Map<string, TemplateDetail>> =>
      detailsMapFromApproved(await fetchApprovedTemplates(id)),
  })
  return {
    detailsMap: id ? q.data ?? new Map<string, TemplateDetail>() : new Map<string, TemplateDetail>(),
    isLoading: id ? q.isLoading : false,
  }
}

/**
 * Catálogo do passo: 1 canal → WABA dele; vários / todos → interseção
 * dos CONNECTED. Avisa quais canais não têm o `templateName` gravado.
 */
export function useStepTemplateCatalog(
  config?: { channelId?: unknown; channelIds?: unknown; channelScope?: unknown } | null,
  inherited?: string | null,
  opts?: { bindToInbound?: boolean; enabled?: boolean },
): StepTemplateCatalog {
  const enabled = opts?.enabled !== false
  const channelsQ = useQuery({
    queryKey: ["automation-step-connected-channels", "whatsapp"],
    staleTime: 60_000,
    enabled,
    queryFn: fetchConnectedMetaCloudWhatsAppChannels,
  })
  const connectedIds = channelsQ.isLoading
    ? undefined
    : (channelsQ.data ?? []).map((c) => c.id)
  const scoped = resolveTemplateChannelIds(config, inherited, connectedIds, {
    bindToInbound: opts?.bindToInbound,
  })
  const ready = enabled && Array.isArray(scoped)
  const ids = ready ? scoped : []
  const listsQ = useQuery({
    queryKey: ["editor-wa-templates-scoped", ids.slice().sort().join(",") || "none"],
    staleTime: 60_000,
    enabled: ready && ids.length > 0,
    queryFn: async (): Promise<ChannelTemplateList[]> =>
      Promise.all(
        ids.map(async (id) => ({ id, list: await fetchApprovedTemplates(id) })),
      ),
  })

  const labelById = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of channelsQ.data ?? []) {
      m.set(c.id, formatMetaChannelLabel(c))
    }
    return m
  }, [channelsQ.data])

  return useMemo(() => {
    const lists = listsQ.data ?? []
    const intersect = intersectApprovedRows(lists.map((x) => x.list))
    const union = lists.flatMap((x) => x.list)
    const isIntersect = ids.length > 1
    const isLoading =
      (enabled && (channelsQ.isLoading || scoped === undefined)) ||
      (ready && ids.length > 0 && listsQ.isLoading)
    return {
      options: optionsFromApproved(isIntersect ? intersect : (lists[0]?.list ?? [])),
      detailsMap: detailsMapFromApproved(union.length > 0 ? union : intersect),
      isLoading,
      isIntersect,
      scopedChannelIds: ids,
      missingChannelLabels: (name: string, language?: string | null) => {
        if (!name.trim() || lists.length === 0) return []
        return lists
          .filter((x) => !rowHasTemplate(x.list, name, language))
          .map((x) => labelById.get(x.id) ?? x.id)
      },
    }
  }, [
    channelsQ.isLoading,
    enabled,
    ids,
    labelById,
    listsQ.data,
    listsQ.isLoading,
    ready,
    scoped,
  ])
}

type RawAutomation = { id: string; name: string }

export function useAutomationOptions() {
  const q = useQuery({
    queryKey: ["editor-automations"],
    staleTime: STALE,
    queryFn: async (): Promise<Opt[]> => {
      const list = asArray(await getJson("/api/automations?perPage=100")) as RawAutomation[]
      return list.map((a) => ({ value: a.id, label: a.name }))
    },
  })
  return { options: q.data ?? [], isLoading: q.isLoading }
}

type RawCustomField = { id: string; name?: string; label?: string; type?: string; options?: string[] }

const BUILTIN_FIELDS: Record<"contact" | "deal", Opt[]> = {
  contact: [
    { value: "name", label: "Nome do contato" },
    { value: "email", label: "E-mail" },
    { value: "phone", label: "Telefone" },
    { value: "source", label: "Origem" },
    { value: "lifecycleStage", label: "Ciclo de vida" },
    { value: "assignedToId", label: "Responsável" },
  ],
  deal: [
    { value: "title", label: "Título do negócio" },
    { value: "value", label: "Valor" },
    { value: "status", label: "Status" },
    { value: "stageId", label: "Etapa (ID)" },
  ],
}

/**
 * Custom fields crus (contato + negócio) para montar tokens de variável
 * (`{{contactCustomFields.<name>}}` / `{{dealCustomFields.<name>}}`) no
 * autocomplete do textarea de mensagem. Retorna o `name` (slug), não o id.
 */
export function useCustomFieldTokens() {
  const contact = useQuery({
    queryKey: ["editor-custom-fields-raw", "contact"],
    staleTime: STALE,
    queryFn: async (): Promise<RawCustomField[]> =>
      asArray(await getJson("/api/custom-fields?entity=contact")) as RawCustomField[],
  })
  const deal = useQuery({
    queryKey: ["editor-custom-fields-raw", "deal"],
    staleTime: STALE,
    queryFn: async (): Promise<RawCustomField[]> =>
      asArray(await getJson("/api/custom-fields?entity=deal")) as RawCustomField[],
  })
  return {
    contact: contact.data ?? [],
    deal: deal.data ?? [],
    isLoading: contact.isLoading || deal.isLoading,
  }
}

/** Campos nativos + custom da entidade, para `update_field`. */
export function useFieldOptions(entity: "contact" | "deal") {
  const q = useQuery({
    queryKey: ["editor-custom-fields", entity],
    staleTime: STALE,
    queryFn: async (): Promise<Opt[]> => {
      const list = asArray(await getJson(`/api/custom-fields?entity=${entity}`)) as RawCustomField[]
      return list
        .filter((c) => c.name || c.id)
        .map((c) => ({
          value: c.name || c.id, // slug — o que o executor espera
          label: c.label && c.name ? `${c.label} (${c.name})` : (c.label || c.name || c.id),
          group: "Campos personalizados",
        }))
    },
  })
  const builtins = BUILTIN_FIELDS[entity].map((o) => ({ ...o, group: "Campos nativos" }))
  return { options: [...builtins, ...(q.data ?? [])], isLoading: q.isLoading }
}

/**
 * Campos personalizados da org para o seletor de `condition`
 * (`contactCustomFields.<name>` / `dealCustomFields.<name>`).
 * Combine com `CONDITION_FIELDS` no consumidor.
 */
export function useConditionFieldOptions() {
  const q = useQuery({
    queryKey: ["editor-condition-custom-fields"],
    staleTime: STALE,
    queryFn: async (): Promise<Opt[]> => {
      const [contacts, deals] = await Promise.all([
        asArray(await getJson("/api/custom-fields?entity=contact")) as RawCustomField[],
        asArray(await getJson("/api/custom-fields?entity=deal")) as RawCustomField[],
      ])
      const contactOpts = contacts
        .filter((c) => (c.name || "").trim())
        .map((c) => ({
          value: `contactCustomFields.${c.name}`,
          label: c.label || c.name || c.id,
          group: "Campos personalizados (contato)",
        }))
      const dealOpts = deals
        .filter((c) => (c.name || "").trim())
        .map((c) => ({
          value: `dealCustomFields.${c.name}`,
          label: c.label || c.name || c.id,
          group: "Campos personalizados (negócio)",
        }))
      return [...contactOpts, ...dealOpts]
    },
  })
  return { options: q.data ?? [], isLoading: q.isLoading }
}

function displayUserLabel(label: string): string {
  return label.replace(/\s*\([^)]+@[^)]+\)\s*$/, "").trim() || label
}

/**
 * id → nome pra preview de condição (etapas, funis, usuários, depto, tags, campos).
 * Reusa as mesmas queries dos dropdowns do editor.
 */
export function useConditionNameLookup(): Record<string, string> {
  const pipelines = usePipelinesQuery<RawPipeline>()
  const users = useUserOptions()
  const depts = useDepartmentOptions()
  const tags = useTagOptions()
  const fields = useConditionFieldOptions()
  const tokens = useCustomFieldTokens()
  return useMemo(() => {
    const map: Record<string, string> = {}
    for (const p of pipelines.data ?? []) {
      if (p.id && p.name) map[p.id] = p.name
      for (const s of p.stages ?? []) {
        if (s.id && s.name) {
          map[s.id] = s.name
          map[`${p.id}:${s.id}`] = s.name
        }
        if (s.slug && s.name) map[s.slug] = s.name
      }
    }
    for (const o of users.options) if (o.value) map[o.value] = displayUserLabel(o.label)
    for (const o of depts.options) if (o.value) map[o.value] = o.label
    for (const o of tags.options) if (o.value) map[o.value] = o.label
    for (const o of fields.options) if (o.value) map[o.value] = o.label
    const indexCustom = (entity: "contact" | "deal", list: RawCustomField[]) => {
      for (const c of list) {
        const label = c.label || c.name || c.id
        if (!label) continue
        const prefix = entity === "contact" ? "contactCustomFields" : "dealCustomFields"
        if (c.name) map[`${prefix}.${c.name}`] = label
        if (c.id) map[`${prefix}.${c.id}`] = label
      }
    }
    indexCustom("contact", tokens.contact)
    indexCustom("deal", tokens.deal)
    return map
  }, [pipelines.data, users.options, depts.options, tags.options, fields.options, tokens.contact, tokens.deal])
}

export type CustomFieldConditionMeta = { type: string; options: string[] }

/**
 * Metadados (type + options) dos campos personalizados, indexados pelo
 * MESMO path usado em `field` da condição (`contactCustomFields.<name>` /
 * `dealCustomFields.<name>`). Usado pelo widget de valor da condição para
 * decidir se mostra dropdown (SELECT/MULTI_SELECT/BOOLEAN) ou texto livre.
 * Reusa a query de `useCustomFieldTokens` (mesma queryKey).
 */
export function useCustomFieldConditionMeta() {
  const contact = useQuery({
    queryKey: ["editor-custom-fields-raw", "contact"],
    staleTime: STALE,
    queryFn: async (): Promise<RawCustomField[]> =>
      asArray(await getJson("/api/custom-fields?entity=contact")) as RawCustomField[],
  })
  const deal = useQuery({
    queryKey: ["editor-custom-fields-raw", "deal"],
    staleTime: STALE,
    queryFn: async (): Promise<RawCustomField[]> =>
      asArray(await getJson("/api/custom-fields?entity=deal")) as RawCustomField[],
  })
  const byPath = new Map<string, CustomFieldConditionMeta>()
  for (const c of contact.data ?? []) {
    if (!(c.name || "").trim()) continue
    byPath.set(`contactCustomFields.${c.name}`, {
      type: (c.type || "").toUpperCase(),
      options: c.options ?? [],
    })
  }
  for (const c of deal.data ?? []) {
    if (!(c.name || "").trim()) continue
    byPath.set(`dealCustomFields.${c.name}`, {
      type: (c.type || "").toUpperCase(),
      options: c.options ?? [],
    })
  }
  return { byPath, isLoading: contact.isLoading || deal.isLoading }
}

export type CustomFieldSlugMeta = { type: string; options: string[] }

/**
 * Metadados (type + options) indexados pelo slug (`name`) do custom field,
 * para o nó `update_field` (que grava só o slug em `config.field`).
 * Reusa a queryKey de `useCustomFieldTokens` / `useCustomFieldConditionMeta`.
 */
type RawProduct = { id: string; name?: string; sku?: string | null }

export function useProductOptions() {
  const q = useQuery({
    queryKey: ["editor-products"],
    staleTime: STALE,
    queryFn: async (): Promise<Opt[]> => {
      const json = (await getJson("/api/products?perPage=200")) as Record<string, unknown>
      const list = (
        Array.isArray(json.products) ? json.products : asArray(json)
      ) as RawProduct[]
      return list
        .filter((p) => p.id && (p.name || "").trim())
        .map((p) => ({
          value: p.id,
          label: p.sku ? `${p.name} · ${p.sku}` : p.name || p.id,
        }))
    },
  })
  return { options: q.data ?? [], isLoading: q.isLoading, isError: q.isError }
}

export function useCustomFieldMetaBySlug(entity: "contact" | "deal") {
  const q = useQuery({
    queryKey: ["editor-custom-fields-raw", entity],
    staleTime: STALE,
    queryFn: async (): Promise<RawCustomField[]> =>
      asArray(await getJson(`/api/custom-fields?entity=${entity}`)) as RawCustomField[],
  })
  const bySlug = new Map<string, CustomFieldSlugMeta>()
  for (const c of q.data ?? []) {
    if (!(c.name || "").trim()) continue
    bySlug.set(c.name!, {
      type: (c.type || "").toUpperCase(),
      options: c.options ?? [],
    })
  }
  return { bySlug, isLoading: q.isLoading }
}

type PublishedFlowRow = {
  id: string
  shortId?: string | null
  name: string
  metaFlowId?: string | null
}

/** Flows publicados na Meta — seletor do node Formulário e catálogo do `/`. */
export function usePublishedFlowOptions() {
  const q = useQuery({
    queryKey: ["editor-wa-published-flows"],
    staleTime: 60_000,
    queryFn: async (): Promise<Opt[]> => {
      const rows = asArray(await getJson("/api/whatsapp-flow-definitions/published")) as PublishedFlowRow[]
      return rows
        .filter((r) => (r.id ?? "").trim() && (r.name ?? "").trim())
        .map((r) => ({ value: r.id, label: r.name }))
    },
  })
  return { options: q.data ?? [], isLoading: q.isLoading }
}

