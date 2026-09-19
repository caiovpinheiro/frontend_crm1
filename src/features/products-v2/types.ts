/** Tipos compartilhados da feature Produtos v2 (multi-tipo). */

export type ProductKind = "PHYSICAL" | "SERVICE" | "COURSE" | "JOB_OPENING";

export const KIND_LABEL: Record<ProductKind, string> = {
  PHYSICAL: "Físico",
  SERVICE: "Serviço",
  COURSE: "Curso",
  JOB_OPENING: "Vaga",
};

export type PlanInterval = "MONTHLY" | "QUARTERLY" | "YEARLY";
export const PLAN_INTERVAL_LABEL: Record<PlanInterval, string> = {
  MONTHLY: "Mensal",
  QUARTERLY: "Trimestral",
  YEARLY: "Anual",
};

export type CourseMode = "EAD" | "IN_PERSON" | "HYBRID";
export const COURSE_MODE_LABEL: Record<CourseMode, string> = {
  EAD: "EAD",
  IN_PERSON: "Presencial",
  HYBRID: "Híbrido",
};

export type CourseLevel = "GRADUATION" | "POSTGRADUATE";
export const COURSE_LEVEL_LABEL: Record<CourseLevel, string> = {
  GRADUATION: "Graduação",
  POSTGRADUATE: "Pós-Graduação",
};

/** Uma opção de preço/canal do curso (várias por produto). */
export type CoursePricingOption = {
  price: number;
  channel: string | null;
  discountPercent: number | null;
  /** Parcelas — usado principalmente em pós-graduação. */
  installments?: number | null;
  /** Duração em meses da cota (pós-graduação). */
  months?: number | null;
};

export type StakeholderChannel = "WHATSAPP" | "EMAIL";

export type OrgUnit = {
  id: string;
  name: string;
  legalName?: string | null;
  taxId?: string | null;
  address?: string | null;
  active: boolean;
  parentId?: string | null;
};

export type ProductOffer = {
  id: string;
  productId: string;
  orgUnitId: string;
  price: number | string;
  discountPct: number | string | null;
  active: boolean;
  orgUnit?: { id: string; name: string } | null;
};

export type Stakeholder = {
  id: string;
  contactId: string;
  role: string;
  notifyOnSend: boolean;
  notifyForFeedback: boolean;
  channelPreference: StakeholderChannel;
  contact: { id: string; name: string; email: string | null; phone: string | null };
};

export type PoolStats = {
  poolId: string;
  balance: number;
  capacity: number;
  reserved: number;
  consumed: number;
};

export type InventoryPoolView = {
  id: string;
  orgUnit: { id: string; name: string } | null;
  consumeTrigger: string;
  allowNegative: boolean;
  stats: PoolStats;
};

export type InventoryMovement = {
  id: string;
  poolId: string;
  delta: number;
  reason: string;
  dealId: string | null;
  actorId: string | null;
  actorType: string | null;
  note: string | null;
  createdAt: string;
};

export type ProductPlan = {
  id?: string;
  name: string;
  interval: PlanInterval;
  amount: number | string;
  active: boolean;
};

export type CourseClass = {
  id?: string;
  name: string;
  startsAt?: string | null;
  endsAt?: string | null;
  location?: string | null;
  poolId?: string | null;
};

export type ProductDetail = {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  price: number | string;
  unit: string;
  type: "PRODUCT" | "SERVICE";
  kind: ProductKind;
  catalogId: string | null;
  isActive: boolean;
  trackStock: boolean;
  stock: number | string;
  imageUrl?: string | null;
  imageMime?: string | null;
  imageName?: string | null;
  offers: ProductOffer[];
  shipping: {
    weightGrams: number | null;
    dimensions: unknown;
    shippingPolicy: unknown;
  } | null;
  plans: ProductPlan[];
  courseConfig: {
    id: string;
    mode: CourseMode;
    level: CourseLevel | null;
    grau: string | null;
    semester: number | null;
    postSalePipelineId: string | null;
    channel: string | null;
    discountPercent: number | string | null;
    pricingOptions?: CoursePricingOption[] | null;
    classes: CourseClass[];
  } | null;
  stakeholders: Stakeholder[];
  jobOpenings: { id: string; title: string; status: string; poolId: string }[];
  metaLinks?: {
    id: string;
    channelId: string;
    metaCatalogId: string;
    productRetailerId: string;
    syncStatus: string;
    lastSyncError?: string | null;
  }[];
};

export type JobOpening = {
  id: string;
  title: string;
  status: "OPEN" | "PAUSED" | "FILLED" | "CLOSED";
  clientCompanyId: string;
  clientCompany?: { id: string; name: string } | null;
  product?: { id: string; name: string } | null;
  candidatePipelineId: string | null;
  reserveStageId: string | null;
  consumeStageId: string | null;
  b2bDealId: string | null;
  poolId: string;
  stats?: PoolStats;
  stakeholders?: Stakeholder[];
};

export const JOB_STATUS_LABEL: Record<JobOpening["status"], string> = {
  OPEN: "Aberta",
  PAUSED: "Pausada",
  FILLED: "Preenchida",
  CLOSED: "Fechada",
};

export const REASON_LABEL: Record<string, string> = {
  SALE: "Venda",
  RESTOCK: "Reposição",
  REVERSAL: "Estorno",
  RESERVATION: "Reserva",
  RESERVATION_RELEASE: "Liberação de reserva",
  HIRE: "Contratação",
  WITHDRAWAL: "Desistência",
  ADJUSTMENT: "Ajuste manual",
};
