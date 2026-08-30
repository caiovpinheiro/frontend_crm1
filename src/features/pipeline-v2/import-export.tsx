"use client";

/**
 * Componentes de Importação e Exportação de dados (contatos e negócios).
 *
 * ImportPanel: fluxo em 3 etapas estilo Kommo:
 *   1) Upload (CSV/XLSX/ODS) com detecção de delimitador
 *   2) Mapping (mapeamento de colunas → campos do CRM + tag + updateExisting)
 *   3) Result (resumo created/updated/skipped/failed + lista de erros)
 *
 * ExportPanel: CSV com barra de progresso (X-Export-Total + stream).
 */

import * as React from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { IconAlertCircle as AlertCircle, IconArrowLeft as ArrowLeft, IconCircleCheck as CheckCircle2, IconDownload as Download, IconFileSpreadsheet as FileSpreadsheet, IconLoader2 as Loader2, IconDeviceFloppy as Save, IconUpload as Upload, IconCircleX as XCircle } from "@tabler/icons-react";
import {
  IconArrowLeft,
  IconCheck,
  IconCloudUpload,
  IconFileSpreadsheet,
  IconRefresh,
  IconTableImport,
  IconX,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { usePipelinesQuery } from "@/features/shared/queries/pipelines";
import { ButtonGlass } from "@/components/crm/button-glass";
import { CheckboxGlass } from "@/components/crm/checkbox-glass";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import { InputGlass } from "@/components/crm/input-glass";
import { TabsGlass } from "@/components/crm/tabs-glass";
import { TooltipGlass } from "@/components/crm/tooltip-glass";
import { BulkOperationProgressDialog } from "@/components/pipeline/bulk-operation-progress-dialog";
import { Button } from "@/components/ui/button";
import { SelectNative } from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  type AdvancedDealFilters,
  isEmptyFilters,
} from "@/components/pipeline/kanban-filters/types";
import { encodeFiltersParam } from "@/components/pipeline/kanban-filters/use-kanban-filters";
import { apiUrl } from "@/lib/api";
import {
  type CsvDelimiter,
  detectDelimiter,
  normalizeCsvHeader,
  parseCsv,
  parseXlsx,
} from "@/lib/csv-parse";
import {
  type ImportEntity,
  type ImportMode,
  type ImportModel,
  deleteImportModel,
  getImportModels,
  saveImportModel,
} from "@/lib/import-models";
import { cn } from "@/lib/utils";

// ─── Templates CSV ───────────────────────────────────────────────────────────

const CONTACT_TEMPLATE = `Nome,E-mail,Telefone,Ciclo de vida,Origem,Empresa,Responsável,E-mail do responsável
João Silva,joao.silva@empresa.com,+5511999990001,LEAD,Site,Acme Tecnologia,,admin@empresa.com
Maria Souza,maria.souza@email.com,+5511999990002,MQL,Indicação,Beta Solutions,,admin@empresa.com
Pedro Costa,pedro.costa@gmail.com,+5511999990003,SQL,Google Ads,Gamma Group,,admin@empresa.com
Ana Pereira,ana.pereira@outlook.com,+5511999990004,OPPORTUNITY,Facebook Ads,Delta Comercio,,admin@empresa.com
Lucas Ribeiro,lucas.ribeiro@uol.com.br,+5521999990005,LEAD,Webinar,Epsilon Servicos,,admin@empresa.com
Beatriz Almeida,beatriz.almeida@hotmail.com,+5521999990006,CUSTOMER,Site,Zeta Industria,,admin@empresa.com
Rafael Santos,rafael.santos@yahoo.com,+5531999990007,LEAD,LinkedIn,Eta Consultoria,,admin@empresa.com
Juliana Oliveira,juliana.oliveira@empresa.com,+5531999990008,SUBSCRIBER,Newsletter,Theta Educacao,,admin@empresa.com
Marcos Rocha,marcos.rocha@gmail.com,+5541999990009,SQL,Indicação,Iota Marketing,,admin@empresa.com
Carla Mendes,carla.mendes@outlook.com,+5541999990010,MQL,Google Ads,Kappa Logistica,,admin@empresa.com`;

/**
 * Template Kommo PT-BR — espelha o CSV oficial de exportação do Kommo
 * (delimitador `;`, headers longos em PT-BR). Auto-mapping reconhece todos
 * os campos relevantes; colunas sem equivalente no CRM (IM, endereço, fax)
 * ficam não mapeadas e são ignoradas. Valor e datas aceitam tanto formato
 * BR ("100.000,00", "23/03/2012") quanto ISO.
 *
 * Regra do CRM: cada deal exige UM dos três — Nome do contato, E-mail do
 * contato ou Telefone do contato. Linhas que não atendem são reportadas
 * como erro no resultado do import.
 */
const DEAL_TEMPLATE = `Título do lead;Venda do lead;Usuário responsável;Status do lead;Tags do lead;Nome completo do contato;Nome da empresa;Email comercial (contato);Email privado (contato);Telefone comercial (contato);Telefone residencial (contato);Outro telefone (contato)
Implantação CRM - Acme;"12.500,00";admin@empresa.com;Qualificado;importacao;João Silva;Acme Tecnologia;joao.silva@acme.com.br;;+55 11 98888-0001;;
Pacote Premium - Beta;"8.900,50";admin@empresa.com;Proposta;importacao;Maria Souza;Beta Solutions;maria.souza@beta.com.br;maria.s@gmail.com;+55 11 98888-0002;+55 11 3000-0002;
Renovação - Gamma Group;"24.000,00";admin@empresa.com;Negociação;importacao,renovacao;Pedro Costa;Gamma Group;pedro@gamma.com.br;;;+55 11 3000-0003;
Onboarding - Delta;"4.500,00";admin@empresa.com;Fechamento;importacao;Ana Lima;Delta Comércio;ana.lima@delta.com.br;;+55 21 98888-0004;;
Treinamento - Epsilon;"3.200,00";admin@empresa.com;Novo;importacao;Bruno Alves;Epsilon Serviços;bruno@epsilon.io;;+55 21 98888-0005;;
Enterprise - Zeta;"55.000,00";admin@empresa.com;Proposta;importacao,vip;Camila Dias;Zeta Indústria;camila@zeta.tech;;+55 31 98888-0006;;
Plataforma EAD - Theta;"18.750,00";admin@empresa.com;Qualificado;importacao;Fernanda Reis;Theta Educação;fernanda@theta.edu;;+55 11 98888-0008;;
Campanha - Iota;"6.700,00";admin@empresa.com;Negociação;importacao;Marcos Rocha;Iota Marketing;marcos.rocha@iota.com;;+55 41 98888-0009;;
Migração - Kappa;"32.000,00";admin@empresa.com;Fechamento;importacao,enterprise;Carla Mendes;Kappa Tech;carla@kappa.com.br;;;+55 41 3000-0010;
Suporte Anual - Lambda;"9.800,00";admin@empresa.com;Novo;importacao;Rafael Santos;Lambda Cloud;rafael@lambda.com.br;;+55 51 98888-0011;;`;

// ─── Campos do sistema (mapeamento) ──────────────────────────────────────────

type SystemField = { key: string; label: string };

/** Campo personalizado (entity contact/deal) usado no mapeamento de import. */
type CustomFieldLite = { id: string; name: string; label: string };

/** Mapeia a entidade do import para a entidade dos campos personalizados. */
const CUSTOM_FIELD_ENTITY: Record<ImportEntity, string> = {
  contacts: "contact",
  deals: "deal",
};

const SYSTEM_FIELDS: Record<ImportEntity, SystemField[]> = {
  contacts: [
    { key: "name", label: "Nome" },
    { key: "email", label: "E-mail (chave de identificação)" },
    { key: "phone", label: "Telefone" },
    { key: "lifecycle_stage", label: "Ciclo de vida" },
    { key: "source", label: "Origem" },
    { key: "company", label: "Empresa" },
    { key: "assigned_to_name", label: "Responsável" },
    { key: "assigned_to_email", label: "E-mail do responsável" },
    { key: "lead_score", label: "Lead Score" },
    { key: "avatar_url", label: "URL do avatar" },
  ],
  deals: [
    { key: "external_id", label: "ID de origem (external_id) — chave de atualização" },
    { key: "deal_number", label: "Número do negócio (chave de atualização)" },
    { key: "title", label: "Título" },
    { key: "value", label: "Valor" },
    { key: "status", label: "Status (OPEN/WON/LOST)" },
    { key: "pipeline_name", label: "Pipeline" },
    { key: "stage_name", label: "Etapa" },
    { key: "contact_name", label: "Nome do contato (criar se não existir)" },
    { key: "contact_email", label: "E-mail do contato" },
    { key: "contact_phone", label: "Telefone do contato" },
    { key: "company_name", label: "Nome da empresa" },
    { key: "owner_name", label: "Responsável" },
    { key: "owner_email", label: "E-mail do responsável" },
    { key: "expected_close", label: "Previsão de fechamento" },
    { key: "tags", label: "Tags do negócio (separadas por , ou ;)" },
    { key: "lost_reason", label: "Motivo da perda" },
  ],
};

/**
 * Aliases para auto-mapping. Mapeia o header normalizado do CSV (lowercase,
 * sem acento, sem espaço, _ ao invés de espaço) para a chave do sistema.
 * Inclui sinônimos em PT-BR + inglês para compatibilidade com CSVs antigos.
 */
const ALIAS_MAP: Record<string, string> = {
  // contatos
  nome: "name",
  email: "email",
  e_mail: "email",
  telefone: "phone",
  celular: "phone",
  whatsapp: "phone",
  ciclo_de_vida: "lifecycle_stage",
  lifecycle: "lifecycle_stage",
  origem: "source",
  empresa: "company",
  responsavel: "assigned_to_name",
  nome_do_responsavel: "assigned_to_name",
  e_mail_do_responsavel: "assigned_to_email",
  email_do_responsavel: "assigned_to_email",
  email_responsavel: "assigned_to_email",
  // deals
  external_id: "external_id",
  externalid: "external_id",
  id_de_origem: "external_id",
  id_origem: "external_id",
  id_externo: "external_id",
  numero_do_negocio: "deal_number",
  numero_negocio: "deal_number",
  numero: "deal_number",
  titulo: "title",
  titulo_do_negocio: "title",
  valor: "value",
  pipeline: "pipeline_name",
  nome_do_pipeline: "pipeline_name",
  etapa: "stage_name",
  nome_da_etapa: "stage_name",
  estagio: "stage_name",
  nome_do_contato: "contact_name",
  e_mail_do_contato: "contact_email",
  email_do_contato: "contact_email",
  telefone_do_contato: "contact_phone",
  // deals — responsável (overrides do mapping de contato quando entidade=deals)
  // ATENÇÃO: como o ALIAS_MAP é global, deals usam owner_*. Reescrevemos
  // depois com base na entidade no autoMapColumns.
  previsao: "expected_close",
  previsao_de_fechamento: "expected_close",
  motivo_da_perda: "lost_reason",
  motivo_perda: "lost_reason",
};

/**
 * Overrides do alias dependentes da entidade. "Responsável" mapeia para
 * assigned_to_* em contatos e owner_* em negócios.
 */
const ALIAS_OVERRIDES_BY_ENTITY: Record<ImportEntity, Record<string, string>> = {
  contacts: {},
  deals: {
    responsavel: "owner_name",
    nome_do_responsavel: "owner_name",
    e_mail_do_responsavel: "owner_email",
    email_do_responsavel: "owner_email",
    email_responsavel: "owner_email",

    // ── Aliases Kommo PT-BR (template oficial) ──
    // Lead/negócio
    titulo_do_lead: "title",
    venda_do_lead: "value",
    status_do_lead: "stage_name",
    tags_do_lead: "tags",
    usuario_responsavel: "owner_name",
    criado_em_lead: "expected_close", // sem campo "criado_em" no schema; usamos só se vier

    // Contato (campos múltiplos do Kommo são consolidados no buildRemappedCsv;
    // aqui apontamos cada um para o canônico apropriado — o consolidador
    // escolhe o primeiro não-vazio entre todos os mapeados para a mesma chave).
    nome_completo_do_contato: "contact_name",

    // E-mails (3 colunas Kommo → consolidam em contact_email)
    email_comercial_contato: "contact_email",
    email_privado_contato: "contact_email",
    outro_email_contato: "contact_email",

    // Telefones (4 colunas Kommo → consolidam em contact_phone)
    telefone_comercial_contato: "contact_phone",
    telefone_residencial_contato: "contact_phone",
    fax_contato: "contact_phone",
    outro_telefone_contato: "contact_phone",

    // Empresa
    nome_da_empresa: "company_name",
  },
};

function autoMapColumns(headers: string[], entity: ImportEntity): Record<string, string> {
  const mapping: Record<string, string> = {};
  const fields = SYSTEM_FIELDS[entity];
  const overrides = ALIAS_OVERRIDES_BY_ENTITY[entity];
  for (const header of headers) {
    const normalized = normalizeCsvHeader(header);
    // 1) match exato com a chave técnica (deal_number, contact_email, etc.)
    const exact = fields.find((f) => f.key === normalized);
    if (exact) {
      mapping[header] = exact.key;
      continue;
    }
    // 2) match com o label PT-BR do campo (case/acento-insensitive)
    const byLabel = fields.find((f) => normalizeCsvHeader(f.label) === normalized);
    if (byLabel) {
      mapping[header] = byLabel.key;
      continue;
    }
    // 3) overrides por entidade (ex.: "responsavel" -> owner_name em deals)
    if (overrides[normalized]) {
      mapping[header] = overrides[normalized];
      continue;
    }
    // 4) ALIAS_MAP global (sinônimos comuns)
    if (ALIAS_MAP[normalized]) {
      mapping[header] = ALIAS_MAP[normalized];
    }
  }
  return mapping;
}

// ─── Utilitários ─────────────────────────────────────────────────────────────

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob(["\ufeff", content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export type ExportDownloadProgress = {
  loaded: number;
  total: number | null;
};

export type DownloadFromApiOptions = {
  onProgress?: (progress: ExportDownloadProgress) => void;
  /** Total conhecido pela UI (filtro) até o header `X-Export-Total` chegar. */
  estimatedTotal?: number | null;
};

function parseExportTotal(res: Response, fallback?: number | null): number | null {
  const raw = res.headers.get("X-Export-Total");
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  if (fallback != null && Number.isFinite(fallback) && fallback >= 0) return fallback;
  const bytes = Number(res.headers.get("Content-Length"));
  if (Number.isFinite(bytes) && bytes > 0) return bytes;
  return null;
}

function countCrlf(chunk: Uint8Array, prevLastWasCr: boolean): {
  count: number;
  lastWasCr: boolean;
} {
  let count = 0;
  let lastWasCr = prevLastWasCr;
  for (const byte of chunk) {
    if (lastWasCr && byte === 10) count += 1;
    lastWasCr = byte === 13;
  }
  return { count, lastWasCr };
}

export async function downloadFromApi(
  url: string,
  fallbackName: string,
  options?: DownloadFromApiOptions,
): Promise<void> {
  const onProgress = options?.onProgress;
  onProgress?.({ loaded: 0, total: options?.estimatedTotal ?? null });

  const res = await fetch(url, { method: "GET", credentials: "include" });
  if (!res.ok) {
    let msg = `Falha na exportação (${res.status})`;
    try {
      const text = await res.text();
      try {
        const j = JSON.parse(text) as { message?: string };
        if (typeof j?.message === "string" && j.message.trim()) msg = j.message;
      } catch {
        if (text.trim().length > 0 && text.trim().length < 200) msg = text.trim();
        else if (res.status === 502 || res.status === 504) {
          msg =
            "Exportação expirou (pipeline muito grande). Tente de novo — o servidor agora exporta em lotes.";
        }
      }
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }

  const total = parseExportTotal(res, options?.estimatedTotal);
  const useRows = Boolean(res.headers.get("X-Export-Total") || options?.estimatedTotal);
  const cd = res.headers.get("Content-Disposition") ?? "";
  const m = /filename="?([^";]+)"?/.exec(cd);
  const name = m?.[1] ?? fallbackName;

  let blob: Blob;
  if (!res.body) {
    blob = await res.blob();
    onProgress?.({ loaded: total ?? 1, total: total ?? 1 });
  } else {
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let crlf = 0;
    let lastWasCr = false;
    let bytes = 0;
    let lastEmit = 0;

    const emit = (loaded: number, force = false) => {
      const now = performance.now();
      if (!force && now - lastEmit < 80) return;
      lastEmit = now;
      onProgress?.({ loaded, total });
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      bytes += value.byteLength;
      const counted = countCrlf(value, lastWasCr);
      crlf += counted.count;
      lastWasCr = counted.lastWasCr;
      const loaded = useRows ? Math.max(0, crlf - 1) : bytes;
      emit(loaded);
    }

    const loaded = useRows ? Math.max(0, crlf - 1) : bytes;
    onProgress?.({ loaded: total ?? loaded, total: total ?? loaded });
    blob = new Blob(chunks as BlobPart[], { type: "text/csv;charset=utf-8" });
  }

  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objUrl;
  a.download = name;
  a.click();
  URL.revokeObjectURL(objUrl);
}

/**
 * Constrói o CSV final a ser enviado ao backend.
 *
 * Consolida múltiplos headers de origem que apontam para o mesmo target.
 * Importante para templates estilo Kommo onde existem várias colunas de
 * telefone (Comercial / Residencial / Fax / Outro) e e-mail (Comercial /
 * Privado / Outro) que precisam ser reduzidas aos campos canônicos do CRM
 * (`contact_phone`, `contact_email`).
 *
 * Estratégia: para cada target key, escolhe o PRIMEIRO valor não-vazio entre
 * os headers de origem (na ordem em que aparecem no CSV original). Saída tem
 * exatamente 1 coluna por target key — sem duplicação.
 *
 * Suporta também valores extras injetados por linha (`extraValues`), úteis
 * para campos que vêm de UI (ex: pipeline alvo selecionado no dropdown).
 */
function buildRemappedCsv(
  headers: string[],
  rows: Record<string, string>[],
  columnMapping: Record<string, string>,
  extraValues: Record<string, string> = {},
): string {
  // Agrupa source headers por target key, preservando a ordem do CSV original.
  const sourcesByTarget = new Map<string, string[]>();
  for (const h of headers) {
    const target = columnMapping[h];
    if (!target) continue;
    const list = sourcesByTarget.get(target);
    if (list) list.push(h);
    else sourcesByTarget.set(target, [h]);
  }

  // Targets adicionais (injetados via UI) não estão no mapping, mas devem
  // aparecer no CSV final. Se já existem no mapping, o valor do CSV PREVALECE
  // (linha-a-linha): só usamos o extra como fallback quando a linha vier vazia.
  for (const k of Object.keys(extraValues)) {
    if (!sourcesByTarget.has(k)) sourcesByTarget.set(k, []);
  }

  const targetKeys = Array.from(sourcesByTarget.keys());

  const escape = (v: string) => {
    if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };

  const lines = [targetKeys.join(",")];
  for (const row of rows) {
    const cols = targetKeys.map((target) => {
      const sources = sourcesByTarget.get(target) ?? [];
      // Primeiro valor não-vazio entre os headers de origem
      let v = "";
      for (const src of sources) {
        const cell = row[src]?.trim() ?? "";
        if (cell !== "") {
          v = cell;
          break;
        }
      }
      // Fallback: valor injetado via UI (ex: pipeline alvo do dropdown)
      if (v === "" && extraValues[target]) {
        v = extraValues[target];
      }
      return escape(v);
    });
    lines.push(cols.join(","));
  }
  return lines.join("\n");
}

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

// ─── Tipos do fluxo ──────────────────────────────────────────────────────────

type ImportStep = "upload" | "mapping" | "result";

interface ImportResult {
  created: number;
  updated: number;
  skipped?: number;
  failed: { row: number; message: string }[];
  totalRows: number;
  tagId?: string | null;
}

// ─── ImportPanel ──────────────────────────────────────────────────────────────

export function ImportPanel({
  onDone,
  fixedEntity,
}: {
  onDone: () => void;
  /**
   * Quando informado, trava o painel em uma única entidade (contacts | deals)
   * e oculta o seletor de abas. Usado no kebab do /pipeline para expor apenas
   * a importação de deals — contatos serão importados em /contacts.
   */
  fixedEntity?: ImportEntity;
}) {
  const [entity, setEntity] = React.useState<ImportEntity>(fixedEntity ?? "contacts");

  // Estado do fluxo (independente por aba)
  const [step, setStep] = React.useState<ImportStep>("upload");
  const [file, setFile] = React.useState<File | null>(null);
  const [delimiter, setDelimiter] = React.useState<CsvDelimiter>(",");
  const [skipHeader, setSkipHeader] = React.useState(true);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [allRows, setAllRows] = React.useState<Record<string, string>[]>([]);
  const [columnMapping, setColumnMapping] = React.useState<Record<string, string>>({});
  const [tag, setTag] = React.useState(`importar_${todayYmd()}`);
  const [updateExisting, setUpdateExisting] = React.useState(true);
  // Modo de importação (deals): "create" = só leads novos, "update" = só
  // atualizar existentes (casa por ID de origem/external_id). Default "create".
  const [importMode, setImportMode] = React.useState<ImportMode>("create");
  const [modelName, setModelName] = React.useState("");
  const [selectedModel, setSelectedModel] = React.useState("");
  const [savedModels, setSavedModels] = React.useState<ImportModel[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  // Fluxo assíncrono (ETL worker): import de contatos retorna 202 { operationId }.
  const [etlOperationId, setEtlOperationId] = React.useState<string | null>(null);
  const [etlTotal, setEtlTotal] = React.useState<number | undefined>(undefined);

  // Pipeline alvo opcional (apenas para entity="deals"). Quando definido,
  // injeta `pipeline_name` nas linhas que NÃO trouxeram a coluna (CSVs estilo
  // Kommo só têm "Status do lead" = nome do estágio, sem pipeline). Se a
  // linha já trouxer `pipeline_name`, o valor do CSV prevalece.
  const [targetPipelineName, setTargetPipelineName] = React.useState<string>("");

  // Etapa alvo opcional (apenas para entity="deals"). Quando definida, injeta
  // `stage_id` em TODAS as linhas — necessário para arquivos que não trazem
  // coluna de etapa (ex.: relatório de matriculados só com Título/CPF/RGM). O
  // backend exige `stage_id` OU o par `pipeline_name`+`stage_name`; sem isso a
  // importação é rejeitada inteira. Se a linha já trouxer stage_id/stage_name,
  // o valor do CSV prevalece (extraValues é só fallback).
  const [targetStageId, setTargetStageId] = React.useState<string>("");

  type PipelineLite = { id: string; name: string; stages: { id: string; name: string }[] };

  // Lista de pipelines da org (com etapas) para os dropdowns opcionais. Só faz
  // fetch quando o painel é renderizado em modo "deals" — para "contacts" não
  // há custo.
  const { data: pipelines = [] } = usePipelinesQuery<PipelineLite>(
    entity === "deals",
  );

  // Etapas do pipeline alvo selecionado (por nome). Alimenta o dropdown de
  // "Etapa alvo".
  const targetPipelineStages = React.useMemo(() => {
    if (!targetPipelineName.trim()) return [];
    const p = pipelines.find((x) => x.name === targetPipelineName);
    return p?.stages ?? [];
  }, [pipelines, targetPipelineName]);

  // Trocar de pipeline invalida a etapa alvo escolhida (evita stage_id órfão
  // de outro pipeline).
  React.useEffect(() => {
    setTargetStageId("");
  }, [targetPipelineName]);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Campos personalizados da entidade (contact/deal) — alimentam o dropdown
  // de mapeamento e o auto-map. Falha silenciosa (ex.: sem permissão) cai
  // num array vazio, mantendo só os campos padrão.
  // Contatos e Negócios: ambos gravam campos personalizados no backend.
  const { data: customFields = [] } = useQuery<CustomFieldLite[]>({
    queryKey: ["custom-fields", CUSTOM_FIELD_ENTITY[entity]],
    queryFn: async () => {
      const res = await fetch(
        apiUrl(`/api/custom-fields?entity=${CUSTOM_FIELD_ENTITY[entity]}`),
      );
      if (!res.ok) return [];
      const data = (await res.json()) as unknown;
      if (!Array.isArray(data)) return [];
      return data
        .filter(
          (f): f is CustomFieldLite =>
            !!f && typeof (f as CustomFieldLite).id === "string",
        )
        .map((f) => ({ id: f.id, name: f.name, label: f.label }));
    },
    staleTime: 60_000,
  });

  // Carregar modelos salvos quando a aba muda
  React.useEffect(() => {
    setSavedModels(getImportModels(entity));
  }, [entity]);

  // Auto-map de campos personalizados: quando os campos chegam (async) e há
  // colunas ainda não mapeadas que casam com nome/label de um custom field,
  // preenche com `cf:<id>` sem sobrescrever escolhas existentes.
  React.useEffect(() => {
    if (headers.length === 0 || customFields.length === 0) return;
    setColumnMapping((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const h of headers) {
        if (next[h]) continue;
        const norm = normalizeCsvHeader(h);
        const cf = customFields.find(
          (f) =>
            normalizeCsvHeader(f.name) === norm ||
            normalizeCsvHeader(f.label) === norm,
        );
        if (cf) {
          next[h] = `cf:${cf.id}`;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [headers, customFields]);

  const reset = React.useCallback(() => {
    setStep("upload");
    setFile(null);
    setHeaders([]);
    setAllRows([]);
    setColumnMapping({});
    setResult(null);
    setSelectedModel("");
    setModelName("");
    setTargetPipelineName("");
    setTargetStageId("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleEntityChange = (next: string) => {
    if (fixedEntity) return;
    if (next !== "contacts" && next !== "deals") return;
    if (next === entity) return;
    reset();
    setEntity(next);
  };

  const ingestFile = async (f: File) => {
    setBusy(true);
    try {
      const name = f.name.toLowerCase();
      let parsed: { headers: string[]; rows: Record<string, string>[] };
      let detected: CsvDelimiter = delimiter;

      if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".ods")) {
        const buf = await f.arrayBuffer();
        parsed = await parseXlsx(buf);
      } else {
        const text = await f.text();
        detected = detectDelimiter(text);
        parsed = parseCsv(text, detected);
      }

      if (parsed.headers.length === 0) {
        toast.error("Arquivo vazio ou sem cabeçalho.");
        return;
      }

      setFile(f);
      setDelimiter(detected);
      setHeaders(parsed.headers);
      setAllRows(parsed.rows);
      setColumnMapping(autoMapColumns(parsed.headers, entity));
      setStep("mapping");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao ler o arquivo.");
    } finally {
      setBusy(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) void ingestFile(f);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) void ingestFile(f);
  };

  const reparseWithDelimiter = async (d: CsvDelimiter) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".ods")) {
      // XLSX/ODS não usa delimitador
      setDelimiter(d);
      return;
    }
    setBusy(true);
    try {
      const text = await file.text();
      const parsed = parseCsv(text, d);
      setDelimiter(d);
      setHeaders(parsed.headers);
      setAllRows(parsed.rows);
      setColumnMapping(autoMapColumns(parsed.headers, entity));
    } finally {
      setBusy(false);
    }
  };

  const applyModel = (modelId: string) => {
    setSelectedModel(modelId);
    if (!modelId) return;
    const m = savedModels.find((x) => x.id === modelId);
    if (!m) return;
    setColumnMapping(m.columnMapping);
    setDelimiter(m.delimiter);
    setSkipHeader(m.skipHeader);
    setUpdateExisting(m.updateExisting);
    if (m.importMode) setImportMode(m.importMode);
    toast.success(`Modelo "${m.name}" aplicado.`);
  };

  const persistModel = () => {
    const name = modelName.trim();
    if (!name) {
      toast.error("Informe um nome para o modelo.");
      return;
    }
    saveImportModel({
      name,
      entity,
      columnMapping,
      delimiter,
      skipHeader,
      updateExisting,
      ...(entity === "deals" ? { importMode } : {}),
    });
    setSavedModels(getImportModels(entity));
    setModelName("");
    toast.success(`Modelo "${name}" salvo.`);
  };

  const removeModel = (id: string) => {
    deleteImportModel(id);
    setSavedModels(getImportModels(entity));
    if (selectedModel === id) setSelectedModel("");
  };

  const submit = async () => {
    if (!file) return;
    const usedColumns = headers.filter((h) => columnMapping[h]);
    if (usedColumns.length === 0) {
      toast.error("Mapeie ao menos uma coluna.");
      return;
    }

    setBusy(true);
    try {
      // Pipeline/Etapa alvo (entity=deals): fallback para linhas sem
      // `pipeline_name` / sem estágio. `stage_id` injetado satisfaz a validação
      // do backend (que exige stage_id OU pipeline_name+stage_name) e resolve a
      // etapa direto por id.
      const extraValues: Record<string, string> = {};
      if (entity === "deals") {
        if (targetPipelineName.trim()) extraValues.pipeline_name = targetPipelineName.trim();
        if (targetStageId.trim()) extraValues.stage_id = targetStageId.trim();
      }
      const remapped = buildRemappedCsv(headers, allRows, columnMapping, extraValues);
      const fd = new FormData();
      fd.append("file", new Blob([remapped], { type: "text/csv;charset=utf-8" }), "import.csv");
      fd.append("delimiter", ",");
      if (tag.trim()) fd.append("tag", tag.trim());
      fd.append("updateExisting", String(updateExisting));
      // Deals: modo explícito (novos vs atualizar). O backend usa importMode e,
      // na ausência dele, cai no updateExisting (compat).
      if (entity === "deals") fd.append("importMode", importMode);

      const endpoint = entity === "contacts" ? "/api/contacts/import" : "/api/deals/import";
      const res = await fetch(apiUrl(endpoint), { method: "POST", body: fd });
      const json = (await res.json().catch(() => ({}))) as
        | ImportResult
        | { operationId?: string; total?: number; message?: string };

      if (!res.ok) {
        const msg = "message" in json && typeof json.message === "string" ? json.message : "Falha na importação";
        toast.error(msg);
        return;
      }

      // Fluxo assíncrono (ETL): contatos retornam 202 { operationId }. Abre o
      // dialog de progresso (polling) em vez do ResultStep síncrono.
      if (res.status === 202 && "operationId" in json && json.operationId) {
        setEtlOperationId(json.operationId);
        setEtlTotal(typeof json.total === "number" ? json.total : undefined);
        toast.info("Importação enfileirada. Acompanhe o progresso.");
        return;
      }

      const r = json as ImportResult;
      setResult(r);
      setStep("result");

      const created = r.created ?? 0;
      const updated = r.updated ?? 0;
      const failed = r.failed?.length ?? 0;
      const skipped = r.skipped ?? 0;
      const successCount = created + updated;

      if (failed === 0 && successCount > 0) {
        toast.success(
          `Importação concluída: ${created} criado(s), ${updated} atualizado(s)` +
            (skipped > 0 ? `, ${skipped} ignorado(s).` : "."),
        );
      } else if (successCount > 0 && failed > 0) {
        toast.warning(
          `Importação parcial: ${created} criado(s), ${updated} atualizado(s), ${failed} falha(s).`,
        );
      } else if (failed > 0 && successCount === 0) {
        toast.error(`Nenhuma linha importada. ${failed} falha(s).`);
      } else if (successCount === 0 && skipped > 0) {
        toast.info(`${skipped} linha(s) ignorada(s). Nenhuma criação ou atualização.`);
      }

      if (successCount > 0) onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao importar.");
    } finally {
      setBusy(false);
    }
  };

  const tabIndex = entity === "contacts" ? 0 : 1;

  const sharedFlowProps = {
    step,
    file,
    delimiter,
    skipHeader,
    headers,
    rows: allRows,
    columnMapping,
    customFields,
    tag,
    updateExisting,
    importMode,
    modelName,
    selectedModel,
    savedModels,
    busy,
    result,
    fileInputRef,
    onSelectFile: () => fileInputRef.current?.click(),
    onFileInputChange: handleFileInputChange,
    onDrop: handleDrop,
    onDelimiterChange: (d: CsvDelimiter) => void reparseWithDelimiter(d),
    onSkipHeaderChange: setSkipHeader,
    onColumnChange: (h: string, v: string) => setColumnMapping((m) => ({ ...m, [h]: v })),
    onTagChange: setTag,
    onUpdateExistingChange: setUpdateExisting,
    onImportModeChange: setImportMode,
    onModelNameChange: setModelName,
    onApplyModel: applyModel,
    onSaveModel: persistModel,
    onDeleteModel: removeModel,
    onBackToUpload: reset,
    onCancel: reset,
    onSubmit: submit,
    onCloseResult: reset,
  };

  // ── Render ──
  return (
    <div className="flex w-full flex-col gap-4">
      {!fixedEntity && (
        <TabsGlass
          tabs={["Contatos", "Negócios (leads)"]}
          activeTab={tabIndex}
          onChange={(i) => handleEntityChange(i === 0 ? "contacts" : "deals")}
        />
      )}

      {/* Pipeline alvo: exibido apenas durante o mapeamento de deals. CSVs
          estilo Kommo só têm "Status do lead" (= nome da etapa) — sem indicar
          o pipeline. O dropdown serve como FALLBACK: se a linha já trouxer
          `pipeline_name`, o valor da linha prevalece. */}
      {entity === "deals" && step === "mapping" && (
        <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--brand-primary)]/20 bg-[var(--brand-primary)]/[0.04] p-4">
          <label className="font-display text-[12px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Pipeline alvo (opcional)
          </label>
          <DropdownGlass
            options={[
              { value: "", label: "— Usar pipeline do CSV (coluna Pipeline) —" },
              ...pipelines.map((p) => ({ value: p.name, label: p.name })),
            ]}
            value={targetPipelineName}
            onValueChange={setTargetPipelineName}
            triggerClassName="h-10 w-full text-[13px]"
          />
          <p className="font-body text-[12px] leading-relaxed text-[var(--text-muted)]">
            Use quando o arquivo só trouxer a etapa (ex.: <span className="font-medium">Status do lead</span> do Kommo) sem indicar o pipeline. Se a linha já tiver coluna <span className="font-medium">Pipeline</span> preenchida, ela prevalece.
          </p>

          {/* Etapa alvo: aparece após escolher o pipeline. Injeta `stage_id`
              em todas as linhas — necessário para arquivos SEM coluna de etapa
              (ex.: relatório de matriculados só com Título/CPF/RGM). Se a linha
              já trouxer stage_id / stage_name, o valor da linha prevalece. */}
          {targetPipelineName.trim() && (
            <div className="mt-2 flex flex-col gap-2 border-t border-[var(--brand-primary)]/15 pt-3">
              <label className="font-display text-[12px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Etapa alvo (opcional)
              </label>
              <DropdownGlass
                options={[
                  { value: "", label: "— Usar etapa do CSV (coluna Etapa) —" },
                  ...targetPipelineStages.map((s) => ({ value: s.id, label: s.name })),
                ]}
                value={targetStageId}
                onValueChange={setTargetStageId}
                triggerClassName="h-10 w-full text-[13px]"
              />
              <p className="font-body text-[12px] leading-relaxed text-[var(--text-muted)]">
                Defina a etapa quando o arquivo <span className="font-medium">não</span> tiver coluna de etapa (ex.: relatório de matriculados). Todos os negócios importados entram nesta etapa.
              </p>
            </div>
          )}
        </div>
      )}

      <ImportFlow
        entity={entity}
        template={entity === "contacts" ? CONTACT_TEMPLATE : DEAL_TEMPLATE}
        {...sharedFlowProps}
      />

      {/* Progresso da importação assíncrona (ETL worker) — contatos e negócios. */}
      <BulkOperationProgressDialog
        operationId={etlOperationId}
        optimisticTotal={etlTotal}
        title={entity === "contacts" ? "Importação de contatos" : "Importação de negócios"}
        onOpenChange={(open) => {
          if (!open) {
            setEtlOperationId(null);
            setEtlTotal(undefined);
            reset();
          }
        }}
        onFinished={() => {
          onDone();
        }}
      />
    </div>
  );
}

// ─── ImportFlow (compartilhado entre tabs) ───────────────────────────────────

interface ImportFlowProps {
  entity: ImportEntity;
  step: ImportStep;
  file: File | null;
  delimiter: CsvDelimiter;
  skipHeader: boolean;
  headers: string[];
  rows: Record<string, string>[];
  columnMapping: Record<string, string>;
  customFields: CustomFieldLite[];
  tag: string;
  updateExisting: boolean;
  importMode: ImportMode;
  modelName: string;
  selectedModel: string;
  savedModels: ImportModel[];
  busy: boolean;
  result: ImportResult | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  template: string;
  onSelectFile: () => void;
  onFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDelimiterChange: (d: CsvDelimiter) => void;
  onSkipHeaderChange: (v: boolean) => void;
  onColumnChange: (header: string, value: string) => void;
  onTagChange: (v: string) => void;
  onUpdateExistingChange: (v: boolean) => void;
  onImportModeChange: (v: ImportMode) => void;
  onModelNameChange: (v: string) => void;
  onApplyModel: (id: string) => void;
  onSaveModel: () => void;
  onDeleteModel: (id: string) => void;
  onBackToUpload: () => void;
  onCancel: () => void;
  onSubmit: () => void;
  onCloseResult: () => void;
}

function ImportFlow(props: ImportFlowProps) {
  if (props.step === "upload") return <UploadStep {...props} />;
  if (props.step === "mapping") return <MappingStep {...props} />;
  return <ResultStep {...props} />;
}

// ─── Step 1 — Upload ──────────────────────────────────────────────────────────

function UploadStep({
  entity,
  busy,
  fileInputRef,
  template,
  onSelectFile,
  onFileInputChange,
  onDrop,
}: ImportFlowProps) {
  const [dragging, setDragging] = React.useState(false);

  return (
    <div className="flex flex-col gap-6">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls,.ods,text/csv"
        className="hidden"
        onChange={onFileInputChange}
      />

      {/* Drop zone */}
      <div
        onClick={!busy ? onSelectFile : undefined}
        onDrop={(e) => { setDragging(false); onDrop(e); }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        className={cn(
          "group relative flex cursor-pointer flex-col items-center justify-center gap-5 overflow-hidden rounded-[var(--radius-xl)] border-2 border-dashed px-8 py-14 text-center transition-all duration-200",
          "lg:flex-row lg:gap-8 lg:px-12 lg:py-12 lg:text-left",
          dragging
            ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/5"
            : "border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] hover:border-[var(--brand-primary)]/60 hover:bg-[var(--glass-bg-strong)]",
          busy && "pointer-events-none opacity-60",
        )}
      >
        {dragging && (
          <div className="pointer-events-none absolute inset-0 animate-pulse rounded-[var(--radius-xl)] bg-[var(--brand-primary)]/5" />
        )}

        <div className={cn(
          "flex h-16 w-16 shrink-0 items-center justify-center rounded-[var(--radius-lg)] border-2 transition-all duration-200",
          dragging
            ? "border-[var(--brand-primary)]/40 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]"
            : "border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-muted)] group-hover:border-[var(--brand-primary)]/40 group-hover:text-[var(--brand-primary)]",
        )}>
          {busy
            ? <Loader2 className="size-7 animate-spin" />
            : <IconCloudUpload size={28} stroke={1.5} />
          }
        </div>

        <div className="flex flex-1 flex-col gap-1.5">
          <p className="font-display text-[16px] font-bold text-[var(--text-primary)]">
            {busy ? "Lendo arquivo…" : dragging ? "Solte para importar" : "Arraste o arquivo aqui"}
          </p>
          <p className="font-body text-[13px] leading-relaxed text-[var(--text-muted)]">
            {busy ? "Aguarde, não feche esta janela" : "ou clique para selecionar · CSV, XLSX, XLS, ODS"}
          </p>
        </div>

        {!busy && (
          <ButtonGlass
            variant="primary"
            size="default"
            onClick={(e) => { e.stopPropagation(); onSelectFile(); }}
            className="shrink-0"
          >
            <IconCloudUpload size={16} />
            Selecionar arquivo
          </ButtonGlass>
        )}
      </div>

      {/* Formatos suportados + ação baixar modelo */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-body text-[12px] text-[var(--text-muted)]">Suportados:</span>
          {["CSV", "XLSX", "XLS", "ODS"].map((fmt) => (
            <span
              key={fmt}
              className="rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-3 py-1 font-display text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]"
            >
              .{fmt.toLowerCase()}
            </span>
          ))}
          <span className="font-body text-[12px] text-[var(--text-muted)]">· Até 10 MB</span>
        </div>
        <ButtonGlass
          variant="glass"
          size="sm"
          onClick={() => downloadCsv(
            entity === "contacts" ? "contatos-modelo.csv" : "negocios-modelo.csv",
            template,
          )}
        >
          <Download size={14} />
          Baixar modelo CSV
        </ButtonGlass>
      </div>

      {/* Dica */}
      <p className="rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-4 py-3 font-body text-[13px] leading-relaxed text-[var(--text-muted)]">
        Dica: para arquivos com datas, use CSV com separador{" "}
        <code className="rounded bg-[var(--glass-bg-strong)] px-1.5 py-0.5 font-mono text-[12px] text-[var(--text-primary)]">;</code>
        {" "}para evitar conflitos.
      </p>
    </div>
  );
}

// ─── Step 2 — Mapping ─────────────────────────────────────────────────────────

function MappingStep({
  entity,
  delimiter,
  skipHeader,
  headers,
  rows,
  columnMapping,
  customFields,
  tag,
  updateExisting,
  importMode,
  modelName,
  selectedModel,
  savedModels,
  busy,
  file,
  onDelimiterChange,
  onSkipHeaderChange,
  onColumnChange,
  onTagChange,
  onUpdateExistingChange,
  onImportModeChange,
  onModelNameChange,
  onApplyModel,
  onSaveModel,
  onDeleteModel,
  onBackToUpload,
  onCancel,
  onSubmit,
}: ImportFlowProps) {
  const fields = SYSTEM_FIELDS[entity];
  const preview = rows.slice(0, 3);
  const isSpreadsheet = !!file && /\.(xlsx|xls|ods)$/i.test(file.name);
  const mappedCount = headers.filter((h) => !!columnMapping[h]).length;

  return (
    <div className="flex flex-col gap-7">

      {/* ── Cabeçalho contextual ── */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-display text-[15px] font-bold text-[var(--text-primary)]">
            Configurações de Importação
          </h3>
          <p className="mt-1 truncate font-body text-[13px] text-[var(--text-muted)]">
            <span className="font-medium text-[var(--text-secondary)]">{file?.name}</span>
            {" · "}{rows.length} {rows.length === 1 ? "linha detectada" : "linhas detectadas"}
            {" · "}
            <span className={cn(
              "font-semibold",
              mappedCount === headers.length ? "text-[var(--color-success-text)]" : "text-[var(--brand-primary)]"
            )}>
              {mappedCount}/{headers.length} colunas mapeadas
            </span>
          </p>
        </div>
        <ButtonGlass variant="glass" size="sm" onClick={onBackToUpload}>
          <IconArrowLeft size={14} />
          Trocar arquivo
        </ButtonGlass>
      </div>

      {/* ── Modelo salvo + Delimitador ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-2">
          <label className="font-display text-[12px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Modelo salvo
          </label>
          <div className="flex gap-2">
            <DropdownGlass
              options={[
                { value: "", label: "— Nenhum (mapeamento atual) —" },
                ...savedModels.map((m) => ({ value: m.id, label: m.name })),
              ]}
              value={selectedModel}
              onValueChange={onApplyModel}
              triggerClassName="flex-1 h-10 text-[13px]"
            />
            {selectedModel && (
              <TooltipGlass label="Remover modelo" side="top">
                <button
                  type="button"
                  onClick={() => onDeleteModel(selectedModel)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-muted)] transition-colors hover:border-[var(--color-danger)]/50 hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]"
                >
                  <IconX size={15} />
                </button>
              </TooltipGlass>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="font-display text-[12px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Delimitador
          </label>
          <DropdownGlass
            options={[
              { value: ";", label: "Ponto e vírgula ( ; )" },
              { value: ",", label: "Vírgula ( , )" },
              { value: "\t", label: "Tab" },
            ]}
            value={delimiter}
            onValueChange={(v) => onDelimiterChange(v as CsvDelimiter)}
            disabled={isSpreadsheet}
            triggerClassName="h-10 w-full text-[13px]"
          />
          {isSpreadsheet && (
            <p className="font-body text-[12px] text-[var(--text-muted)]">Não aplicável a planilhas</p>
          )}
        </div>
      </div>

      {/* ── Toggle: ignorar primeira linha ── */}
      <label className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-4 py-3 transition-colors hover:bg-[var(--glass-bg-strong)]">
        <CheckboxGlass
          checked={skipHeader}
          onChange={onSkipHeaderChange}
          aria-label="Ignorar primeira linha"
        />
        <span className="font-body text-[14px] leading-relaxed text-[var(--text-primary)]">
          Não importe a primeira linha{" "}
          <span className="text-[var(--text-muted)]">(contém nomes de campos)</span>
        </span>
      </label>

      {/* ── Tabela de pré-visualização + mapeamento de colunas ── */}
      <div className="flex flex-col gap-2">
        <p className="font-display text-[12px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          Pré-visualização e mapeamento de colunas
        </p>
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)]">
          <table className="w-full min-w-max">
            <thead>
              <tr className="border-b border-[var(--glass-border)] bg-[var(--glass-bg-strong)]">
                {headers.map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-4 py-3 text-left font-display text-[12px] font-bold uppercase tracking-wide text-[var(--text-secondary)]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => (
                <tr
                  key={i}
                  className={cn(
                    "border-b border-[var(--glass-border)]/60 transition-colors",
                    i % 2 === 0 ? "bg-transparent" : "bg-[var(--glass-bg-subtle)]",
                  )}
                >
                  {headers.map((h) => (
                    <td
                      key={h}
                      className="max-w-[200px] truncate whitespace-nowrap px-4 py-2.5 font-body text-[13px] text-[var(--text-secondary)]"
                    >
                      {row[h] || <span className="text-[var(--text-muted)] opacity-40">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
              {/* Linha de mapeamento */}
              <tr className="border-t-2 border-[var(--brand-primary)]/25 bg-[var(--brand-primary)]/[0.04]">
                {headers.map((h) => {
                  const isMapped = !!columnMapping[h];
                  return (
                    <td key={h} className="px-2 py-2.5">
                      <SelectNative
                        value={columnMapping[h] ?? ""}
                        onChange={(e) => onColumnChange(h, e.target.value)}
                        className={cn(
                          "h-9 min-w-[140px] text-[12px]",
                          isMapped
                            ? "border-[var(--brand-primary)]/50 bg-[var(--brand-primary)]/5 text-[var(--brand-primary)]"
                            : "",
                        )}
                      >
                        <option value="">Não importar</option>
                        {fields.map((f) => (
                          <option key={f.key} value={f.key}>{f.label}</option>
                        ))}
                        {customFields.length > 0 && (
                          <optgroup label="Campos personalizados">
                            {customFields.map((cf) => (
                              <option key={cf.id} value={`cf:${cf.id}`}>
                                {cf.label}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </SelectNative>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Tag + salvar modelo ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:gap-6">
        <div className="flex flex-col gap-2">
          <label className="font-display text-[12px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Criar tag
          </label>
          <InputGlass
            value={tag}
            onChange={(e) => onTagChange(e.target.value)}
            placeholder="Nome da tag (opcional)"
            className="h-10 text-[13px]"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="font-display text-[12px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Salvar modelo
          </label>
          <div className="flex gap-2">
            <InputGlass
              value={modelName}
              onChange={(e) => onModelNameChange(e.target.value)}
              placeholder="Nome para salvar o mapeamento"
              onKeyDown={(e) => { if (e.key === "Enter" && modelName.trim()) onSaveModel(); }}
              className="flex-1 h-10 text-[13px]"
            />
            <TooltipGlass label="Salvar modelo" side="top">
              <button
                type="button"
                onClick={onSaveModel}
                disabled={!modelName.trim()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-muted)] transition-colors hover:border-[var(--brand-primary)]/40 hover:text-[var(--brand-primary)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Save size={16} />
              </button>
            </TooltipGlass>
          </div>
        </div>
      </div>

      {/* ── Modo de importação (deals) / atualizar existentes (contatos) ── */}
      {entity === "deals" ? (
        <div className="flex flex-col gap-2">
          <label className="font-display text-[12px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Modo de importação
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                value: "create" as ImportMode,
                title: "Leads novos",
                desc: "Cria novos negócios. Se o lead já existir (mesmo ID de origem), é ignorado — sem duplicar.",
              },
              {
                value: "update" as ImportMode,
                title: "Atualizar existentes",
                desc: "Casa por Número do negócio ou ID de origem (external_id) e atualiza os dados. Linhas sem correspondência são ignoradas.",
              },
            ].map((opt) => {
              const active = importMode === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onImportModeChange(opt.value)}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-[var(--radius-md)] border px-4 py-3 text-left transition-colors",
                    active
                      ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/[0.06]"
                      : "border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] hover:bg-[var(--glass-bg-strong)]",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded-full border",
                        active
                          ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]"
                          : "border-[var(--glass-border)]",
                      )}
                    >
                      {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </span>
                    <span className="font-display text-[14px] font-semibold text-[var(--text-primary)]">
                      {opt.title}
                    </span>
                  </span>
                  <span className="font-body text-[12px] leading-relaxed text-[var(--text-muted)]">
                    {opt.desc}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="font-body text-[12px] leading-relaxed text-[var(--text-muted)]">
            Para atualizar, mapeie a coluna que identifica o negócio como{" "}
            <span className="font-medium">Número do negócio</span> ou{" "}
            <span className="font-medium">ID de origem (external_id)</span>.
            A coluna vinda da Exportação do CRM já corresponde ao Número do negócio.
          </p>
        </div>
      ) : (
        <label className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-4 py-3 transition-colors hover:bg-[var(--glass-bg-strong)]">
          <CheckboxGlass
            checked={updateExisting}
            onChange={onUpdateExistingChange}
            aria-label="Atualizar dados existentes"
          />
          <span className="font-body text-[14px] leading-relaxed text-[var(--text-primary)]">
            Atualizar dados existentes{" "}
            <span className="text-[var(--text-muted)]">
              (match por{" "}
              <code className="rounded bg-[var(--glass-bg-strong)] px-1.5 py-0.5 font-mono text-[12px] text-[var(--text-primary)]">id</code>
              {" "}ou{" "}
              <code className="rounded bg-[var(--glass-bg-strong)] px-1.5 py-0.5 font-mono text-[12px] text-[var(--text-primary)]">external_id</code>)
            </span>
          </span>
        </label>
      )}

      {/* ── Loading state ── */}
      {busy && (
        <div
          className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--brand-primary)]/20 bg-[var(--brand-primary)]/[0.04]"
          role="status"
          aria-live="polite"
        >
          <div className="h-1 w-full overflow-hidden bg-[var(--brand-primary)]/10">
            <div className="h-full w-1/3 animate-[importprogress_1.4s_cubic-bezier(0.4,0,0.6,1)_infinite] rounded-full bg-[var(--brand-primary)]" />
          </div>
          <div className="flex items-center gap-4 px-5 py-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)]/10">
              <Loader2 className="size-5 animate-spin text-[var(--brand-primary)]" />
            </div>
            <div className="min-w-0">
              <p className="font-display text-[14px] font-semibold text-[var(--text-primary)]">
                Importando {rows.length} {rows.length === 1 ? "linha" : "linhas"}…
              </p>
              <p className="font-body text-[12px] text-[var(--text-muted)]">
                Não feche esta janela
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Actions ── */}
      <div className="flex items-center gap-3 border-t border-[var(--glass-border)] pt-5">
        <ButtonGlass
          variant="primary"
          size="default"
          onClick={onSubmit}
          disabled={busy}
          className="min-w-[160px]"
        >
          {busy
            ? <><Loader2 className="size-4 animate-spin" /> Importando…</>
            : <><IconTableImport size={16} /> Importar agora</>
          }
        </ButtonGlass>
        <ButtonGlass variant="glass" size="default" onClick={onCancel} disabled={busy}>
          Cancelar
        </ButtonGlass>
        <p className="ml-auto hidden font-body text-[12px] text-[var(--text-muted)] sm:block">
          {mappedCount} de {headers.length} colunas mapeadas
        </p>
      </div>
    </div>
  );
}

// ─── Step 3 — Result ──────────────────────────────────────────────────────────

function ResultStep({ result, onCloseResult, onBackToUpload }: ImportFlowProps) {
  if (!result) return null;
  const skipped = result.skipped ?? 0;
  const failed = Array.isArray(result.failed) ? result.failed : [];
  const hasFailures = failed.length > 0;
  const successCount = result.created + result.updated;
  const isFullSuccess = !hasFailures && successCount > 0;
  const isAllFailed = hasFailures && successCount === 0;

  return (
    <div className="flex flex-col gap-6">

      {/* ── Banner de status ── */}
      <div className={cn(
        "flex items-center gap-4 rounded-[var(--radius-lg)] border px-5 py-4",
        isFullSuccess
          ? "border-[var(--color-success)]/30 bg-[var(--color-success-bg)]"
          : isAllFailed
            ? "border-[var(--color-danger)]/30 bg-[var(--color-danger-bg)]"
            : "border-[var(--color-warning)]/30 bg-[var(--color-warn-bg)]",
      )}>
        <div className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
          isFullSuccess ? "bg-[var(--color-success-bg)]"
            : isAllFailed ? "bg-[var(--color-danger-bg)]"
            : "bg-[var(--color-warn-bg)]",
        )}>
          {isFullSuccess
            ? <IconCheck size={20} className="text-[var(--color-success-text)]" />
            : isAllFailed
              ? <AlertCircle size={20} className="text-[var(--color-danger-text)]" />
              : <AlertCircle size={20} className="text-[var(--color-warning)]" />
          }
        </div>
        <div>
          <p className="font-display text-[15px] font-bold text-[var(--text-primary)]">
            {isFullSuccess
              ? "Importação concluída com sucesso"
              : isAllFailed
                ? "Nenhuma linha importada"
                : "Importação concluída com falhas parciais"}
          </p>
          <p className="mt-0.5 font-body text-[13px] text-[var(--text-muted)]">
            {result.totalRows} {result.totalRows === 1 ? "linha processada" : "linhas processadas"}
            {result.tagId ? " · tag aplicada" : ""}
          </p>
        </div>
      </div>

      {/* ── Stats grid ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ResultStat label="Criados" value={result.created} tone="success" />
        <ResultStat label="Atualizados" value={result.updated} tone="info" />
        <ResultStat label="Ignorados" value={skipped} tone="neutral" />
        <ResultStat label="Falhas" value={failed.length} tone="danger" />
      </div>

      {/* ── Lista de falhas ── */}
      {hasFailures && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-danger)]/30 bg-[var(--color-danger-bg)]">
          <div className="flex items-center gap-2.5 border-b border-[var(--color-danger)]/20 px-4 py-3">
            <AlertCircle size={15} className="shrink-0 text-[var(--color-danger-text)]" />
            <span className="font-display text-[13px] font-semibold text-[var(--color-danger-text)]">
              {failed.length} {failed.length === 1 ? "linha com falha" : "linhas com falha"}
            </span>
          </div>
          <div className="max-h-52 divide-y divide-[var(--color-danger)]/10 overflow-y-auto">
            {failed.map((f, i) => (
              <div key={`${f.row}-${i}`} className="flex items-baseline gap-3 px-4 py-2.5">
                <span className="shrink-0 rounded-full bg-[var(--color-danger-bg)] px-2 py-0.5 font-display text-[11px] font-bold text-[var(--color-danger-text)]">
                  L{f.row}
                </span>
                <span className="font-body text-[13px] text-[var(--text-secondary)]">{f.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Actions ── */}
      <div className="flex items-center gap-3 border-t border-[var(--glass-border)] pt-5">
        <ButtonGlass variant="primary" size="default" onClick={onCloseResult}>
          <IconCheck size={16} />
          Fechar
        </ButtonGlass>
        <ButtonGlass variant="glass" size="default" onClick={onBackToUpload}>
          <IconRefresh size={16} />
          Nova importação
        </ButtonGlass>
      </div>
    </div>
  );
}

function ResultStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "info" | "neutral" | "danger";
}) {
  const styles: Record<typeof tone, { bg: string; text: string; dot: string }> = {
    success: { bg: "border-[var(--color-success)]/30 bg-[var(--color-success-bg)]",      text: "text-[var(--color-success-text)]",  dot: "bg-[var(--color-success)]" },
    info:    { bg: "border-[var(--brand-primary)]/20 bg-[var(--brand-primary)]/[0.03]",  text: "text-[var(--brand-primary)]",       dot: "bg-[var(--brand-primary)]" },
    neutral: { bg: "border-[var(--glass-border)] bg-[var(--glass-bg-subtle)]",           text: "text-[var(--text-secondary)]",      dot: "bg-[var(--text-muted)]" },
    danger:  { bg: "border-[var(--color-danger)]/30 bg-[var(--color-danger-bg)]",        text: "text-[var(--color-danger-text)]",   dot: "bg-[var(--color-danger)]" },
  };
  const s = styles[tone];
  return (
    <div className={cn("flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border px-4 py-5", s.bg)}>
      <div className={cn("h-2 w-2 rounded-full", s.dot)} />
      <div className={cn("font-display text-3xl font-bold leading-none", s.text)}>{value}</div>
      <div className="font-body text-[12px] font-medium text-[var(--text-muted)]">{label}</div>
    </div>
  );
}

// ─── ExportPanel ──────────────────────────────────────────────────────────────

type Pipeline = { id: string; name: string };

/**
 * Contexto do funil aberto quando a exportação é chamada do Pipeline
 * (Kanban ou Lista). Permite escolher entre exportar o funil inteiro ou
 * apenas os negócios que batem no filtro/busca ativos.
 */
export type ExportScope = {
  pipelineId?: string | null;
  /** Filtros avançados + `search`, no mesmo shape que o board manda. */
  filters?: AdvancedDealFilters;
  /** Aba de status da Lista. "ALL" (ou ausente) = sem recorte por status. */
  status?: "OPEN" | "WON" | "LOST" | "ALL";
  /** Quantos negócios batem no filtro atual. */
  filteredTotal?: number;
  /** Total do funil sem filtro (quando conhecido). */
  pipelineTotal?: number | null;
};

function scopeHasFilters(scope?: ExportScope): boolean {
  if (!scope) return false;
  if (scope.status && scope.status !== "ALL") return true;
  return !isEmptyFilters(scope.filters);
}

function ExportProgressBar({
  loaded,
  total,
  entityLabel,
}: {
  loaded: number;
  total: number | null;
  entityLabel: string;
}) {
  const pct =
    total != null && total > 0
      ? Math.min(100, Math.round((loaded / total) * 100))
      : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground tabular-nums">
          {total != null
            ? `${loaded.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")} ${entityLabel}`
            : "Preparando arquivo…"}
        </span>
        {pct != null ? (
          <span className="font-semibold tabular-nums text-foreground">{pct}%</span>
        ) : null}
      </div>
      <div
        className="relative h-2.5 overflow-hidden rounded-full bg-secondary"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? undefined}
        aria-busy={pct == null}
      >
        {pct == null ? (
          <div className="absolute inset-0 animate-pulse bg-primary/30" />
        ) : (
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${Math.max(pct === 0 ? 2 : pct, 2)}%` }}
          />
        )}
      </div>
    </div>
  );
}

export function ExportPanel({ scope }: { scope?: ExportScope } = {}) {
  const hasFilters = scopeHasFilters(scope);
  const [pipelineId, setPipelineId] = React.useState<string>(
    scope?.pipelineId ?? "all",
  );
  const [dealScope, setDealScope] = React.useState<"filtered" | "all">(
    hasFilters ? "filtered" : "all",
  );
  const [busy, setBusy] = React.useState<null | "deals" | "contacts">(null);
  const [progress, setProgress] = React.useState<ExportDownloadProgress | null>(
    null,
  );

  const { data: pipelines = [] } = usePipelinesQuery<Pipeline>();

  const buildDealsQuery = (): string => {
    const params = new URLSearchParams();
    if (pipelineId !== "all") params.set("pipelineId", pipelineId);
    if (hasFilters && dealScope === "filtered" && scope) {
      if (scope.status && scope.status !== "ALL") params.set("status", scope.status);
      if (!isEmptyFilters(scope.filters)) {
        const encoded = encodeFiltersParam(scope.filters ?? {});
        if (encoded) params.set("f", encoded);
      }
    }
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  };

  const estimatedDealTotal =
    hasFilters && dealScope === "filtered"
      ? scope?.filteredTotal ?? null
      : scope?.pipelineTotal ?? null;

  const runExport = async (kind: "deals" | "contacts") => {
    setBusy(kind);
    const estimated = kind === "deals" ? estimatedDealTotal : null;
    setProgress({ loaded: 0, total: estimated });
    try {
      if (kind === "deals") {
        await downloadFromApi(
          apiUrl(`/api/deals/export${buildDealsQuery()}`),
          "negocios.csv",
          { onProgress: setProgress, estimatedTotal: estimated },
        );
      } else {
        await downloadFromApi(apiUrl("/api/contacts/export"), "contatos.csv", {
          onProgress: setProgress,
        });
      }
      toast.success("Exportação concluída. Verifique seus downloads.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao exportar");
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileSpreadsheet className="size-5 text-primary" />
            Exportar negócios
          </CardTitle>
          <CardDescription>
            Gera um CSV com 1 linha por negócio: dados do negócio, contato, pipeline/estágio, dono,
            tags, datas e todos os campos personalizados (do negócio e do contato). O arquivo pode
            ser reimportado nesta mesma tela.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasFilters && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                O que exportar
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  {
                    value: "filtered" as const,
                    title: "Somente a base filtrada",
                    desc:
                      scope?.filteredTotal != null
                        ? `${scope.filteredTotal.toLocaleString("pt-BR")} negócio(s) que batem no filtro e na busca atuais.`
                        : "Apenas os negócios que batem no filtro e na busca atuais.",
                  },
                  {
                    value: "all" as const,
                    title: "Funil inteiro",
                    desc:
                      scope?.pipelineTotal != null
                        ? `Ignora o filtro: ${scope.pipelineTotal.toLocaleString("pt-BR")} negócio(s) do funil.`
                        : "Ignora o filtro ativo e exporta todos os negócios do funil.",
                  },
                ].map((opt) => {
                  const active = dealScope === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setDealScope(opt.value)}
                      className={cn(
                        "flex flex-col items-start gap-1 rounded-[var(--radius-md)] border px-4 py-3 text-left transition-colors",
                        active
                          ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/[0.06]"
                          : "border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] hover:bg-[var(--glass-bg-strong)]",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            "flex h-4 w-4 items-center justify-center rounded-full border",
                            active
                              ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]"
                              : "border-[var(--glass-border)]",
                          )}
                        >
                          {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                        </span>
                        <span className="font-display text-[14px] font-semibold text-[var(--text-primary)]">
                          {opt.title}
                        </span>
                      </span>
                      <span className="font-body text-[12px] leading-relaxed text-[var(--text-muted)]">
                        {opt.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Pipeline
            </label>
            <DropdownGlass
              options={[
                { value: "all", label: "Todos os pipelines" },
                ...pipelines.map((p) => ({ value: p.id, label: p.name })),
              ]}
              value={pipelineId}
              onValueChange={setPipelineId}
              triggerClassName="h-10 w-full text-sm"
            />
          </div>
          {busy === "deals" && progress ? (
            <ExportProgressBar
              loaded={progress.loaded}
              total={progress.total}
              entityLabel="negócio(s)"
            />
          ) : null}
          <Button
            type="button"
            className="gap-1.5"
            disabled={busy !== null}
            onClick={() => void runExport("deals")}
          >
            <Download className="size-4" />
            {busy === "deals" ? "Exportando…" : "Exportar negócios (CSV)"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileSpreadsheet className="size-5 text-primary" />
            Exportar contatos
          </CardTitle>
          <CardDescription>
            CSV com todos os contatos da organização: dados básicos, empresa, responsável, origem,
            tags e campos personalizados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {busy === "contacts" && progress ? (
            <ExportProgressBar
              loaded={progress.loaded}
              total={progress.total}
              entityLabel="contato(s)"
            />
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="gap-1.5"
            disabled={busy !== null}
            onClick={() => void runExport("contacts")}
          >
            <Download className="size-4" />
            {busy === "contacts" ? "Exportando…" : "Exportar contatos (CSV)"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── useImportExportBump ──────────────────────────────────────────────────────

/** Retorna um callback que invalida as queries de leads/contatos após import. */
export function useImportExportBump() {
  const queryClient = useQueryClient();
  return React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["contacts"] });
    void queryClient.invalidateQueries({ queryKey: ["deals"] });
    void queryClient.invalidateQueries({ queryKey: ["pipeline"] });
  }, [queryClient]);
}
