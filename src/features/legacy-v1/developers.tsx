"use client";

import { IconBook as Book, IconChevronRight as ChevronRight, IconCopy as Copy, IconExternalLink as ExternalLink, IconKey as Key } from "@tabler/icons-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { TooltipHost } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/* ────────────────────────────────────────────── */
/*  Types                                         */
/* ────────────────────────────────────────────── */

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

type Param = {
  name: string;
  type: string;
  required?: boolean;
  description: string;
};

type Endpoint = {
  method: HttpMethod;
  path: string;
  summary: string;
  description?: string;
  queryParams?: Param[];
  bodyParams?: Param[];
  responseExample?: string;
  requestExample?: string;
};

type Section = {
  id: string;
  title: string;
  description?: string;
  endpoints?: Endpoint[];
  content?: string;
};

/* ────────────────────────────────────────────── */
/*  Docs data                                     */
/* ────────────────────────────────────────────── */

const sections: Section[] = [
  {
    id: "introducao",
    title: "Introdução",
    content: `A API do Bwipo permite integrar sistemas externos, automatizar processos e sincronizar dados com sua conta.

Com ela você pode:
• Criar e atualizar contatos, negócios e empresas
• Consultar pipelines, etapas e tags
• Gerenciar atividades e tarefas
• Ler conversas e enviar mensagens
• Integrar com ERPs, plataformas de marketing e outros sistemas

Todas as requisições são feitas via HTTPS e retornam JSON. A URL base é o domínio do seu CRM.`,
  },
  {
    id: "autenticacao",
    title: "Autenticação",
    content: `Para usar a API, você precisa de um token de acesso (Bearer Token).

1. Acesse Configurações > Chaves de API
2. Clique em "Criar nova chave"
3. Copie o token gerado (ele só é exibido uma vez)

Use o token no header Authorization de cada requisição:`,
    endpoints: [
      {
        method: "GET",
        path: "/api/contacts",
        summary: "Exemplo de requisição autenticada",
        requestExample: `curl -X GET https://seu-crm.com/api/contacts \\
  -H "Authorization: Bearer eduit_abc123..."`,
        responseExample: `{
  "items": [...],
  "total": 42,
  "page": 1,
  "perPage": 20
}`,
      },
    ],
  },
  {
    id: "rate-limit",
    title: "Limites de Requisições",
    content: `Para garantir estabilidade, a API impõe um limite de 400 requisições por minuto por token.

As respostas incluem headers de rate limit:

| Header | Descrição |
|--------|-----------|
| X-RateLimit-Limit | Máximo de requisições permitidas |
| X-RateLimit-Remaining | Requisições restantes |
| X-RateLimit-Reset | Segundos até o reset da contagem |

Se o limite for excedido, a API retorna status 429:`,
    endpoints: [
      {
        method: "GET",
        path: "429 Too Many Requests",
        summary: "Resposta ao exceder o limite",
        responseExample: `HTTP/1.1 429 Too Many Requests
Retry-After: 30

{
  "message": "Limite de requisições excedido. Tente novamente em breve."
}`,
      },
    ],
  },
  {
    id: "contatos",
    title: "Contatos",
    description: "Gerencie contatos (leads) do CRM.",
    endpoints: [
      {
        method: "GET",
        path: "/api/contacts",
        summary: "Listar contatos",
        description: "Retorna lista paginada de contatos com filtros opcionais.",
        queryParams: [
          { name: "page", type: "number", description: "Página (padrão: 1)" },
          { name: "perPage", type: "number", description: "Itens por página (padrão: 20)" },
          { name: "search", type: "string", description: "Busca por nome, email ou telefone" },
          { name: "tagId", type: "string", description: "Filtrar por tag" },
          { name: "assignedToId", type: "string", description: "Filtrar por responsável" },
        ],
        responseExample: `{
  "items": [
    {
      "id": "clx...",
      "name": "João Silva",
      "email": "joao@email.com",
      "phone": "+5511999999999",
      "lifecycleStage": "LEAD",
      "leadScore": 45,
      "createdAt": "2026-01-15T10:30:00Z"
    }
  ],
  "total": 150,
  "page": 1,
  "perPage": 20
}`,
      },
      {
        method: "POST",
        path: "/api/contacts",
        summary: "Criar contato",
        description: "Cria um novo contato no CRM.",
        bodyParams: [
          { name: "name", type: "string", required: true, description: "Nome do contato" },
          { name: "email", type: "string", description: "Email" },
          { name: "phone", type: "string", description: "Telefone (formato: +5511...)" },
          { name: "source", type: "string", description: "Origem do lead" },
          { name: "lifecycleStage", type: "string", description: "SUBSCRIBER, LEAD, MQL, SQL, OPPORTUNITY, CUSTOMER, EVANGELIST" },
        ],
        requestExample: `curl -X POST https://seu-crm.com/api/contacts \\
  -H "Authorization: Bearer eduit_abc123..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Maria Santos",
    "email": "maria@empresa.com",
    "phone": "+5511988887777",
    "source": "Website"
  }'`,
        responseExample: `{
  "id": "clx...",
  "name": "Maria Santos",
  "email": "maria@empresa.com",
  "phone": "+5511988887777",
  "source": "Website",
  "lifecycleStage": "LEAD",
  "createdAt": "2026-04-05T14:20:00Z"
}`,
      },
      {
        method: "GET",
        path: "/api/contacts/:id",
        summary: "Buscar contato por ID",
        responseExample: `{
  "id": "clx...",
  "name": "João Silva",
  "email": "joao@email.com",
  "phone": "+5511999999999",
  "tags": [{ "id": "...", "name": "VIP" }],
  "deals": [{ "id": "...", "title": "Negócio X" }]
}`,
      },
      {
        method: "PUT",
        path: "/api/contacts/:id",
        summary: "Atualizar contato",
        bodyParams: [
          { name: "name", type: "string", description: "Nome" },
          { name: "email", type: "string", description: "Email" },
          { name: "phone", type: "string", description: "Telefone" },
          { name: "lifecycleStage", type: "string", description: "Estágio do ciclo de vida" },
        ],
      },
      {
        method: "DELETE",
        path: "/api/contacts/:id",
        summary: "Excluir contato",
        responseExample: `{ "ok": true }`,
      },
    ],
  },
  {
    id: "negocios",
    title: "Negócios",
    description: "CRUD de negócios (deals) do pipeline.",
    endpoints: [
      {
        method: "GET",
        path: "/api/deals",
        summary: "Listar negócios",
        queryParams: [
          { name: "page", type: "number", description: "Página" },
          { name: "perPage", type: "number", description: "Itens por página" },
          { name: "search", type: "string", description: "Busca por título" },
          { name: "status", type: "string", description: "OPEN, WON ou LOST" },
          { name: "pipelineId", type: "string", description: "Filtrar por pipeline" },
          { name: "stageId", type: "string", description: "Filtrar por etapa" },
        ],
        responseExample: `{
  "items": [
    {
      "id": "clx...",
      "title": "Projeto Website",
      "value": 15000,
      "status": "OPEN",
      "stageId": "clx...",
      "contactId": "clx...",
      "createdAt": "2026-03-10T08:00:00Z"
    }
  ],
  "total": 30
}`,
      },
      {
        method: "POST",
        path: "/api/deals",
        summary: "Criar negócio",
        bodyParams: [
          { name: "title", type: "string", required: true, description: "Título do negócio" },
          { name: "stageId", type: "string", required: true, description: "ID da etapa" },
          { name: "contactId", type: "string", description: "ID do contato" },
          { name: "value", type: "number", description: "Valor monetário" },
        ],
        requestExample: `curl -X POST https://seu-crm.com/api/deals \\
  -H "Authorization: Bearer eduit_abc123..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Novo Projeto",
    "stageId": "clx_stage_id",
    "contactId": "clx_contact_id",
    "value": 25000
  }'`,
      },
      {
        method: "GET",
        path: "/api/deals/:id",
        summary: "Buscar negócio por ID",
      },
      {
        method: "PUT",
        path: "/api/deals/:id",
        summary: "Atualizar negócio",
        bodyParams: [
          { name: "title", type: "string", description: "Título" },
          { name: "value", type: "number", description: "Valor" },
          { name: "stageId", type: "string", description: "Mover para outra etapa" },
        ],
      },
      {
        method: "DELETE",
        path: "/api/deals/:id",
        summary: "Excluir negócio",
      },
      {
        method: "PUT",
        path: "/api/deals/:id/status",
        summary: "Alterar status (ganhar/perder)",
        bodyParams: [
          { name: "status", type: "string", required: true, description: "WON ou LOST" },
          { name: "lostReason", type: "string", description: "Motivo da perda (quando LOST)" },
        ],
      },
    ],
  },
  {
    id: "pipelines",
    title: "Pipelines e Etapas",
    description: "Consulte pipelines e suas etapas.",
    endpoints: [
      {
        method: "GET",
        path: "/api/pipelines",
        summary: "Listar pipelines",
        responseExample: `[
  {
    "id": "clx...",
    "name": "Vendas",
    "stages": [
      { "id": "clx...", "name": "Qualificação", "position": 0 },
      { "id": "clx...", "name": "Proposta", "position": 1 },
      { "id": "clx...", "name": "Negociação", "position": 2 }
    ]
  }
]`,
      },
      {
        method: "GET",
        path: "/api/stages",
        summary: "Listar todas as etapas",
        description: "Retorna todas as etapas de todos os pipelines.",
      },
    ],
  },
  {
    id: "tags",
    title: "Tags",
    description: "Gerencie tags para organizar contatos e negócios.",
    endpoints: [
      {
        method: "GET",
        path: "/api/tags",
        summary: "Listar tags",
        responseExample: `[
  { "id": "clx...", "name": "VIP", "color": "#ef4444" },
  { "id": "clx...", "name": "Novo Lead", "color": "#3b82f6" }
]`,
      },
      {
        method: "POST",
        path: "/api/tags",
        summary: "Criar tag",
        bodyParams: [
          { name: "name", type: "string", required: true, description: "Nome da tag" },
          { name: "color", type: "string", description: "Cor hexadecimal" },
        ],
      },
      {
        method: "POST",
        path: "/api/contacts/:id/tags",
        summary: "Adicionar tag ao contato",
        bodyParams: [
          { name: "tagId", type: "string", required: true, description: "ID da tag" },
        ],
      },
    ],
  },
  {
    id: "atividades",
    title: "Tarefas",
    description: "Gerencie tarefas, reuniões, chamadas e outras atividades.",
    endpoints: [
      {
        method: "GET",
        path: "/api/activities",
        summary: "Listar atividades",
        queryParams: [
          { name: "contactId", type: "string", description: "Filtrar por contato" },
          { name: "dealId", type: "string", description: "Filtrar por negócio" },
          { name: "type", type: "string", description: "CALL, EMAIL, MEETING, TASK, NOTE" },
          { name: "completed", type: "boolean", description: "Filtrar por status" },
        ],
        responseExample: `{
  "items": [
    {
      "id": "clx...",
      "title": "Ligar para João",
      "type": "CALL",
      "completed": false,
      "dueDate": "2026-04-06T10:00:00Z"
    }
  ]
}`,
      },
      {
        method: "POST",
        path: "/api/activities",
        summary: "Criar atividade",
        bodyParams: [
          { name: "title", type: "string", required: true, description: "Título" },
          { name: "type", type: "string", required: true, description: "CALL, EMAIL, MEETING, TASK, NOTE" },
          { name: "contactId", type: "string", description: "ID do contato" },
          { name: "dealId", type: "string", description: "ID do negócio" },
          { name: "dueDate", type: "string", description: "Data de vencimento (ISO 8601)" },
          { name: "description", type: "string", description: "Descrição" },
        ],
      },
    ],
  },
  {
    id: "conversas",
    title: "Conversas",
    description: "Acesse conversas do inbox e envie mensagens.",
    endpoints: [
      {
        method: "GET",
        path: "/api/conversations",
        summary: "Listar conversas",
        queryParams: [
          { name: "status", type: "string", description: "OPEN ou RESOLVED" },
          { name: "channel", type: "string", description: "whatsapp, email" },
          { name: "assignedToId", type: "string", description: "Filtrar por atendente" },
        ],
      },
      {
        method: "GET",
        path: "/api/conversations/:id/messages",
        summary: "Listar mensagens da conversa",
        queryParams: [
          { name: "page", type: "number", description: "Página" },
          { name: "perPage", type: "number", description: "Itens por página" },
        ],
        responseExample: `{
  "items": [
    {
      "id": "clx...",
      "content": "Olá, gostaria de saber mais...",
      "direction": "in",
      "messageType": "text",
      "createdAt": "2026-04-05T14:30:00Z"
    }
  ]
}`,
      },
      {
        method: "POST",
        path: "/api/conversations/:id/messages",
        summary: "Enviar mensagem",
        bodyParams: [
          { name: "content", type: "string", required: true, description: "Texto da mensagem" },
        ],
      },
    ],
  },
  {
    id: "produtos",
    title: "Produtos",
    description: "Gerencie o catálogo de produtos.",
    endpoints: [
      {
        method: "GET",
        path: "/api/products",
        summary: "Listar produtos",
        responseExample: `[
  {
    "id": "clx...",
    "name": "Plano Pro",
    "price": 199.90,
    "currency": "BRL",
    "active": true
  }
]`,
      },
      {
        method: "POST",
        path: "/api/products",
        summary: "Criar produto",
        bodyParams: [
          { name: "name", type: "string", required: true, description: "Nome" },
          { name: "price", type: "number", description: "Preço" },
          { name: "currency", type: "string", description: "Moeda (BRL, USD)" },
        ],
      },
    ],
  },
  {
    id: "empresas",
    title: "Empresas",
    description: "CRUD de empresas vinculadas aos contatos.",
    endpoints: [
      {
        method: "GET",
        path: "/api/companies",
        summary: "Listar empresas",
      },
      {
        method: "POST",
        path: "/api/companies",
        summary: "Criar empresa",
        bodyParams: [
          { name: "name", type: "string", required: true, description: "Nome da empresa" },
          { name: "domain", type: "string", description: "Domínio (ex: empresa.com)" },
          { name: "industry", type: "string", description: "Setor" },
        ],
      },
      {
        method: "GET",
        path: "/api/companies/:id",
        summary: "Buscar empresa por ID",
      },
      {
        method: "PUT",
        path: "/api/companies/:id",
        summary: "Atualizar empresa",
      },
      {
        method: "DELETE",
        path: "/api/companies/:id",
        summary: "Excluir empresa",
      },
    ],
  },
  {
    id: "erros",
    title: "Códigos de Erro",
    content: `A API retorna códigos HTTP padrão:

| Código | Significado |
|--------|-------------|
| 200 | Sucesso |
| 201 | Recurso criado |
| 400 | Requisição inválida (dados faltando ou incorretos) |
| 401 | Não autorizado (token inválido ou ausente) |
| 404 | Recurso não encontrado |
| 429 | Limite de requisições excedido |
| 500 | Erro interno do servidor |

Todas as respostas de erro incluem um campo "message" com detalhes:

\`\`\`json
{
  "message": "Descrição do erro"
}
\`\`\``,
  },
];

/* ────────────────────────────────────────────── */
/*  Components                                    */
/* ────────────────────────────────────────────── */

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: "bg-[var(--color-success-subtle)] text-emerald-700 border-[var(--color-success-subtle)]",
  POST: "bg-[var(--color-indigo-soft)] text-blue-700 border-[var(--color-primary-soft)]",
  PUT: "bg-[var(--color-amber-soft)] text-[var(--color-amber-text)] border-[var(--color-amber-soft)]",
  DELETE: "bg-[var(--color-danger-subtle)] text-red-700 border-[var(--color-danger-subtle)]",
  PATCH: "bg-[var(--color-lavender-soft)] text-[var(--color-purple-text)] border-[var(--color-lavender-soft)]",
};

function MethodBadge({ method }: { method: HttpMethod }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold",
        METHOD_COLORS[method]
      )}
    >
      {method}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <TooltipHost label={copied ? "Copiado" : "Copiar"} side="left" className="absolute right-2 top-2">
    <button
      type="button"
      onClick={handleCopy}
      className="rounded p-1 text-[var(--color-ink-muted)] transition-colors hover:bg-slate-700 hover:text-white"
      aria-label="Copiar"
    >
      {copied ? (
        <span className="text-xs text-[var(--color-success)]">Copiado!</span>
      ) : (
        <Copy className="size-3.5" />
      )}
    </button>
    </TooltipHost>
  );
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  return (
    <div className="relative rounded-lg bg-slate-900 text-sm">
      {language && (
        <div className="border-b border-slate-700 px-3 py-1 text-[10px] uppercase tracking-wider text-slate-500">
          {language}
        </div>
      )}
      <CopyButton text={code} />
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed text-slate-200">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function ParamsTable({ params, title }: { params: Param[]; title: string }) {
  return (
    <div className="mt-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-2 text-left font-medium">Parâmetro</th>
              <th className="px-3 py-2 text-left font-medium">Tipo</th>
              <th className="px-3 py-2 text-left font-medium">Descrição</th>
            </tr>
          </thead>
          <tbody>
            {params.map((p) => (
              <tr key={p.name} className="border-b last:border-0">
                <td className="px-3 py-2">
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">
                    {p.name}
                  </code>
                  {p.required && (
                    <span className="ml-1 text-[10px] text-[var(--color-danger)]">*</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {p.type}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {p.description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EndpointCard({ ep }: { ep: Endpoint }) {
  const [open, setOpen] = useState(false);
  const hasDetails =
    ep.queryParams ||
    ep.bodyParams ||
    ep.requestExample ||
    ep.responseExample ||
    ep.description;

  return (
    <div className="rounded-lg border border-border bg-[var(--color-bg-card)] transition-shadow hover:shadow-sm">
      <button
        type="button"
        onClick={() => hasDetails && setOpen(!open)}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-3 text-left",
          hasDetails && "cursor-pointer"
        )}
      >
        <MethodBadge method={ep.method} />
        <code className="flex-1 text-sm font-medium text-foreground">
          {ep.path}
        </code>
        <span className="text-xs text-muted-foreground">{ep.summary}</span>
        {hasDetails && (
          <ChevronRight
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              open && "rotate-90"
            )}
          />
        )}
      </button>

      {open && hasDetails && (
        <div className="space-y-4 border-t border-border px-4 py-4">
          {ep.description && (
            <p className="text-sm text-muted-foreground">{ep.description}</p>
          )}
          {ep.queryParams && (
            <ParamsTable params={ep.queryParams} title="Query Parameters" />
          )}
          {ep.bodyParams && (
            <ParamsTable params={ep.bodyParams} title="Body (JSON)" />
          )}
          {ep.requestExample && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Exemplo de Request
              </p>
              <CodeBlock code={ep.requestExample} language="bash" />
            </div>
          )}
          {ep.responseExample && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Exemplo de Response
              </p>
              <CodeBlock code={ep.responseExample} language="json" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ContentBlock({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let tableRows: string[][] = [];
  let inTable = false;
  let tableHeaders: string[] = [];

  const flushTable = () => {
    if (tableHeaders.length === 0) return;
    elements.push(
      <div
        key={`table-${elements.length}`}
        className="my-3 overflow-hidden rounded-lg border border-border"
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              {tableHeaders.map((h) => (
                <th key={h} className="px-3 py-2 text-left font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, ri) => (
              <tr key={ri} className="border-b last:border-0">
                {row.map((cell, ci) => (
                  <td key={ci} className="px-3 py-2 text-muted-foreground">
                    {cell.startsWith("`") && cell.endsWith("`") ? (
                      <code className="rounded bg-muted px-1 py-0.5 text-xs">
                        {cell.slice(1, -1)}
                      </code>
                    ) : (
                      cell
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableHeaders = [];
    tableRows = [];
  };

  for (const line of lines) {
    if (line.startsWith("|") && line.endsWith("|")) {
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());
      if (cells.every((c) => /^-+$/.test(c))) {
        inTable = true;
        continue;
      }
      if (!inTable) {
        tableHeaders = cells;
        inTable = false;
      } else {
        tableRows.push(cells);
      }
      continue;
    }
    if (inTable) {
      inTable = false;
      flushTable();
    }

    if (line.startsWith("```")) {
      continue;
    }
    if (line.trim() === "") {
      elements.push(<div key={`br-${elements.length}`} className="h-2" />);
    } else if (line.startsWith("•")) {
      elements.push(
        <p
          key={`li-${elements.length}`}
          className="ml-4 text-sm text-muted-foreground"
        >
          {line}
        </p>
      );
    } else {
      elements.push(
        <p key={`p-${elements.length}`} className="text-sm text-muted-foreground">
          {line}
        </p>
      );
    }
  }
  if (inTable || tableHeaders.length > 0) flushTable();

  return <div className="space-y-1">{elements}</div>;
}

/* ────────────────────────────────────────────── */
/*  Main                                          */
/* ────────────────────────────────────────────── */

export default function DevelopersPage() {
  const [activeSection, setActiveSection] = useState(sections[0].id);
  const contentRef = useRef<HTMLDivElement>(null);

  const scrollToSection = useCallback((id: string) => {
    setActiveSection(id);
    const el = document.getElementById(`section-${id}`);
    if (el && contentRef.current) {
      contentRef.current.scrollTo({
        top: el.offsetTop - contentRef.current.offsetTop - 24,
        behavior: "smooth",
      });
    }
  }, []);

  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.id.replace("section-", "");
            setActiveSection(id);
          }
        }
      },
      { root: container, rootMargin: "-20% 0px -70% 0px", threshold: 0 }
    );
    for (const sec of sections) {
      const el = document.getElementById(`section-${sec.id}`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="-m-6 flex h-[calc(100dvh-0px)] overflow-hidden md:-m-8">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 overflow-y-auto border-r border-border bg-[var(--color-bg-card)] p-4">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
            <Book className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-foreground">API Docs</h1>
            <p className="text-[10px] text-muted-foreground">Bwipo</p>
          </div>
        </div>

        <div className="mb-4">
          <Link
            href="/settings/api-tokens"
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/5"
          >
            <Key className="size-3.5" />
            Gerar chave de API
            <ExternalLink className="ml-auto size-3" />
          </Link>
        </div>

        <nav className="space-y-0.5">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Essenciais
          </p>
          {sections.slice(0, 3).map((sec) => (
            <button
              key={sec.id}
              type="button"
              onClick={() => scrollToSection(sec.id)}
              className={cn(
                "w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors",
                activeSection === sec.id
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {sec.title}
            </button>
          ))}

          <p className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Referência
          </p>
          {sections.slice(3).map((sec) => (
            <button
              key={sec.id}
              type="button"
              onClick={() => scrollToSection(sec.id)}
              className={cn(
                "w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors",
                activeSection === sec.id
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {sec.title}
              {sec.endpoints && (
                <span className="ml-1.5 text-[10px] text-muted-foreground/60">
                  {sec.endpoints.length}
                </span>
              )}
            </button>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <div ref={contentRef} className="flex-1 overflow-y-auto bg-[var(--color-bg-subtle)]/50 p-8">
        <div className="mx-auto max-w-3xl space-y-12">
          {sections.map((sec) => (
            <section key={sec.id} id={`section-${sec.id}`} className="scroll-mt-6">
              <h2 className="mb-1 text-xl font-bold text-foreground">
                {sec.title}
              </h2>
              {sec.description && (
                <p className="mb-4 text-sm text-muted-foreground">
                  {sec.description}
                </p>
              )}
              {sec.content && (
                <div className="mb-4">
                  <ContentBlock text={sec.content} />
                </div>
              )}
              {sec.endpoints && (
                <div className="space-y-3">
                  {sec.endpoints.map((ep, i) => (
                    <EndpointCard key={`${ep.method}-${ep.path}-${i}`} ep={ep} />
                  ))}
                </div>
              )}
            </section>
          ))}

          <div className="border-t border-border pt-8 text-center text-xs text-muted-foreground">
            <p>
              Dúvidas? Entre em contato com o suporte. Acesse suas{" "}
              <Link
                href="/settings/api-tokens"
                className="font-medium text-primary hover:underline"
              >
                chaves de API
              </Link>{" "}
              para começar a integrar.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

