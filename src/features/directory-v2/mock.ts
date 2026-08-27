/*
 * Mock de diretório (contatos/empresas) para VISUALIZAÇÃO local sem backend.
 *
 * Ativação (qualquer um):
 *   - env  NEXT_PUBLIC_MOCK_DIRECTORY=1
 *   - URL  ?mock=1   (persiste em localStorage["dir-mock"])
 *   - console  localStorage.setItem("dir-mock","1")  + refresh
 *
 * Desativar: localStorage.removeItem("dir-mock") (ou ?mock=0) + refresh.
 *
 * NÃO afeta produção: sem a flag, `isDirectoryMock()` é sempre false e os
 * fetchers seguem batendo no backend normalmente.
 */

import type {
  CompanyListItemDto,
  CompanyListPage,
  ContactListItemDto,
  ContactListPage,
} from "./api";

export function isDirectoryMock(): boolean {
  if (process.env.NEXT_PUBLIC_MOCK_DIRECTORY === "1") return true;
  if (typeof window === "undefined") return false;
  try {
    const qs = new URLSearchParams(window.location.search).get("mock");
    if (qs === "1") {
      window.localStorage.setItem("dir-mock", "1");
      return true;
    }
    if (qs === "0") {
      window.localStorage.removeItem("dir-mock");
      return false;
    }
    return window.localStorage.getItem("dir-mock") === "1";
  } catch {
    return false;
  }
}

const FIRST = [
  "Ana", "Bruno", "Carla", "Diego", "Eduarda", "Felipe", "Gabriela", "Henrique",
  "Isabela", "João", "Karina", "Lucas", "Marina", "Nuno", "Olívia", "Paulo",
  "Queila", "Rafael", "Sofia", "Thiago", "Úrsula", "Vitor", "Wagner", "Yara",
];
const LAST = [
  "Silva", "Souza", "Oliveira", "Santos", "Pereira", "Costa", "Almeida", "Lima",
  "Carvalho", "Ribeiro", "Martins", "Rocha", "Gomes", "Barbosa", "Araújo", "Melo",
];
const COMPANY_NAMES = [
  "Bwipo Educação", "TechNova Sistemas", "Aurora Saúde", "Vértice Consultoria",
  "Lumina Energia", "Praxis Logística", "Onda Digital", "Forte Seguros",
  "Mantra Marketing", "Solare Engenharia", "Nimbus Cloud", "Raízes Agro",
  "Pulso Telecom", "Vega Imobiliária", "Cobalto Indústria", "Faro Educacional",
  "Brisa Turismo", "Âncora Jurídico", "Clarity Dados", "Origem Alimentos",
  "Helix Biotech", "Trilha Mobilidade", "Norte Varejo", "Zênite Finanças",
];
const INDUSTRIES = [
  "Educação", "Tecnologia", "Saúde", "Consultoria", "Energia", "Logística",
  "Varejo", "Financeiro", "Indústria", "Agro",
];
const SIZES = ["1-10", "11-50", "51-200", "201-500", "500+"];
const STAGES = ["lead", "mql", "sql", "oportunidade", "cliente"];
const TAGS = [
  { id: "t1", name: "VIP", color: "#5b6ff5" },
  { id: "t2", name: "Quente", color: "#e11d48" },
  { id: "t3", name: "Newsletter", color: "#10b981" },
  { id: "t4", name: "Evento", color: "#a78bfa" },
  { id: "t5", name: "Parceiro", color: "#c2820f" },
];
const CITIES = [
  "São Paulo — SP", "Rio de Janeiro — RJ", "Belo Horizonte — MG", "Curitiba — PR",
  "Porto Alegre — RS", "Recife — PE", "Salvador — BA", "Fortaleza — CE",
];

/** PRNG determinístico (mulberry32) — mesma lista a cada render. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: T[], r: number): T {
  return arr[Math.floor(r * arr.length) % arr.length]!;
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

const TOTAL_COMPANIES = 24;
const TOTAL_CONTACTS = 60;

const MOCK_COMPANIES: CompanyListItemDto[] = Array.from({ length: TOTAL_COMPANIES }, (_, i) => {
  const r = rng(1000 + i);
  const name = COMPANY_NAMES[i % COMPANY_NAMES.length]!;
  const domain = `${slug(name)}.com.br`;
  return {
    id: `mock-co-${i + 1}`,
    name,
    domain,
    industry: pick(INDUSTRIES, r()),
    size: pick(SIZES, r()),
    phone: `(11) 3${String(1000 + Math.floor(r() * 8999)).slice(0, 3)}-${String(1000 + Math.floor(r() * 8999)).slice(0, 4)}`,
    address: pick(CITIES, r()),
    cep: null,
    city: pick(CITIES, r()),
    state: null,
    createdAt: new Date(Date.now() - i * 86_400_000 * 3).toISOString(),
    _count: { contacts: 1 + Math.floor(r() * 12) },
  };
});

const MOCK_CONTACTS: ContactListItemDto[] = Array.from({ length: TOTAL_CONTACTS }, (_, i) => {
  const r = rng(7 + i);
  const first = pick(FIRST, r());
  const last = pick(LAST, r());
  const name = `${first} ${last}`;
  const co = r() > 0.25 ? MOCK_COMPANIES[Math.floor(r() * TOTAL_COMPANIES) % TOTAL_COMPANIES]! : null;
  const tagCount = Math.floor(r() * 4);
  const tags = Array.from({ length: tagCount }, (_, k) => TAGS[(i + k) % TAGS.length]!);
  return {
    id: `mock-ct-${i + 1}`,
    name,
    email: `${slug(first)}.${slug(last)}@${co ? co.domain : "gmail.com"}`,
    phone: r() > 0.15 ? `(11) 9${String(1000 + Math.floor(r() * 8999)).slice(0, 4)}-${String(1000 + Math.floor(r() * 8999)).slice(0, 4)}` : null,
    avatarUrl: null,
    leadScore: Math.floor(r() * 100),
    lifecycleStage: pick(STAGES, r()),
    source: null,
    createdAt: new Date(Date.now() - i * 86_400_000).toISOString(),
    updatedAt: new Date(Date.now() - i * 86_400_000).toISOString(),
    assignedTo: null,
    company: co ? { id: co.id, name: co.name, domain: co.domain } : null,
    tags,
    customFields: {},
  };
});

function paginate<T>(all: T[], page: number, perPage: number) {
  const start = (page - 1) * perPage;
  return { items: all.slice(start, start + perPage), total: all.length };
}

export function mockContactsPage(params: {
  search?: string;
  page?: number;
  perPage?: number;
}): ContactListPage {
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 30;
  const q = (params.search ?? "").trim().toLowerCase();
  const filtered = q
    ? MOCK_CONTACTS.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.email ?? "").toLowerCase().includes(q) ||
          (c.company?.name ?? "").toLowerCase().includes(q),
      )
    : MOCK_CONTACTS;
  const { items, total } = paginate(filtered, page, perPage);
  return { items, total, page, perPage };
}

export function mockCompaniesPage(params: {
  search?: string;
  page?: number;
  perPage?: number;
  segment?: "todos" | "com-contatos" | "sem-email" | "sem-telefone";
}): CompanyListPage {
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 30;
  const q = (params.search ?? "").trim().toLowerCase();
  let filtered = q
    ? MOCK_COMPANIES.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.domain ?? "").toLowerCase().includes(q) ||
          (c.industry ?? "").toLowerCase().includes(q),
      )
    : MOCK_COMPANIES;
  if (params.segment === "com-contatos") {
    filtered = filtered.filter((c) => c._count.contacts > 0);
  } else if (params.segment === "sem-email") {
    filtered = filtered.filter((c) => !c.domain);
  } else if (params.segment === "sem-telefone") {
    filtered = filtered.filter((c) => !c.phone);
  }
  const { items, total } = paginate(filtered, page, perPage);
  return { items, total, page, perPage };
}
