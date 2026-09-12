# CRM EduIT — Frontend

Interface do CRM EduIT extraída do monólito Next.js. Este repositório contém **apenas** páginas, componentes, hooks e assets. Toda a API REST, Prisma, Redis, workers e webhooks ficam num **backend separado** (outro app no Easypanel ou o monólito original enquanto migra).

## Pré-requisitos

- Node.js 20+ (recomendado 22)
- npm 10+
- Backend acessível na URL configurada em `NEXT_PUBLIC_API_BASE_URL` (ex.: `http://localhost:3001`)

## Configuração

1. Copie o exemplo de variáveis:

   ```bash
   cp .env.example .env.local
   ```

2. Ajuste no `.env.local`:

   | Variável | Descrição |
   |----------|-----------|
   | `NEXT_PUBLIC_API_BASE_URL` | URL base do backend **sem** barra final. Ex.: `http://localhost:3001` ou `https://api.seudominio.com` |
   | `NEXTAUTH_URL` | URL pública **deste** frontend (onde o browser abre o CRM). Ex.: `http://localhost:3000` |
   | `NEXTAUTH_SECRET` | Deve ser **o mesmo** valor usado no backend que assina o JWT da sessão (Auth.js v5). |

3. Chamadas HTTP da UI usam `src/lib/api.ts` (`apiUrl()`), apontando para o backend. Rotas **NextAuth** (`/api/auth/*`), push VAPID (`/api/push/vapid-public`, subscribe/unsubscribe) e arquivos em `/uploads/*` são **reescritas** no `next.config.ts` para o mesmo `NEXT_PUBLIC_API_BASE_URL`, para o browser continuar em origem única (cookies de sessão no host do frontend).

## Rodar localmente

```bash
npm install
npm run dev
```

Abra `http://localhost:3000` (porta padrão do script). O backend deve estar em `NEXT_PUBLIC_API_BASE_URL` (ex.: porta 3001).

Build de produção:

```bash
set NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
set NEXTAUTH_SECRET=mesmo-do-backend
set NEXTAUTH_URL=http://localhost:3000
npm run build
npm start
```

(PowerShell: `$env:VAR="valor"` em vez de `set`.)

## Easypanel

1. Crie um app **Static/Node** (Docker) apontando para este repositório.
2. **Build command:** `npm install && npm run build`
3. **Start command:** `npm start` (ou `node .next/standalone/server.js` se usar output standalone com cópia de `public` e `.next/static` conforme doc Next).
4. Defina as variáveis de ambiente no painel (produção):

   - `NEXT_PUBLIC_API_BASE_URL=https://api.seudominio.com`
   - `NEXTAUTH_URL=https://crm.seudominio.com`
   - `NEXTAUTH_SECRET=...` (igual ao backend)

5. No **backend**, configure CORS (`Access-Control-Allow-Origin`) para a origem do frontend se o browser chamar o backend em URLs absolutas (ex.: `EventSource` para SSE em `https://api.../api/sse/messages`). Enquanto o rewrite cobrir apenas paths listados no `next.config.ts`, o fluxo principal usa o mesmo host do frontend.

## Limitações / pendências

- **SSE (`/api/sse/messages`)**: o cliente usa `apiUrl()`, ou seja, URL absoluta do backend quando `NEXT_PUBLIC_API_BASE_URL` está definido. O backend precisa aceitar CORS + credenciais (cookies) ou expor um mecanismo de auth compatível; caso contrário use temporariamente um proxy no backend ou alinhe subdomínio + cookies.
- **Login**: depende do backend responder em `/api/auth/*` com o mesmo `NEXTAUTH_SECRET` e política de cookie compatível com `NEXTAUTH_URL` do frontend.
- Telas que chamam API retornam erro de rede até o backend estar no ar — comportamento esperado.

## Design system

Tokens de cor em **OKLCH** (`src/styles/ds-tokens.css`), consumidos via CSS variables e Tailwind (`bg-primary`, `bg-panel`, `bg-accent`). Sem hex no tema.

- Fonte: **Geist** (títulos e corpo). **Geist Mono** só em IDs, protocolos e e-mails secundários.
- Paleta: fundo gelo · índigo (`--primary`) · âmbar (`--accent`) · navy (`--panel`, cartões pontuais) · avatares `--avatar-1`…`--avatar-5`.
- Raio base `--radius: 0.9rem`, com escala `sm`…`4xl`.

```bash
npm run dev -- -p 43123
```

## Estrutura

- `src/app/` — App Router (UI); **sem** `api/`, **sem** `health` de servidor.
- `src/components/`, `src/hooks/`, `src/features/` — UI.
- `src/lib/api.ts` — base URL do backend.
- `src/lib/auth-public.ts` — NextAuth só leitura de JWT (sem Prisma).

O projeto monólito original **não** é alterado por este diretório; a cópia foi feita para `../crm-frontend` ao lado do repo `crm`.

---

## Editor de Automações (Canvas Interativo)

Rota: **`/automations/[id]`** — editor de fluxo construído com **React Flow** (`@xyflow/react`).

### Arquivos principais

| Arquivo | Responsabilidade |
|---|---|
| `src/app/(app)/automations/[id]/page.tsx` | Rota do editor (Server Component). |
| `src/app/(app)/automations/[id]/client-page.tsx` | Canvas React Flow: estado dos nós/arestas, drag, conexão, exclusão, top bar, painel "Blocos". |
| `src/features/legacy-v1/automations-editor.tsx` | Editor legado v1 (transição). Substituído pelo canvas acima na Fase 6. |

### Design de referência

O arquivo `public/automations-canvas.html` (ou `Downloads/automations-canvas.html`) é um **mockup estático** com posições fixas em CSS.
Ele representa o visual DS v2 alvo (glassmorphism, nós com badge numerado, wires SVG, painel "Blocos" à esquerda, minimap).
**Não copie lógica de lá** — é só referência visual.

### Dependência obrigatória

```bash
npm install @xyflow/react
```

Sem ela não há drag de nós, conexões nem exclusão de linhas.

### Ordem de import do CSS (crítica)

```tsx
import "@xyflow/react/dist/style.css"; // base React Flow — SEMPRE primeiro
import "./flow-editor.css";            // DS v2 — sobrescreve apenas o visual
```

Se invertida, os nós aparecem mas o arraste/posicionamento quebra.

### Mapa visual dos nós (DS v2)

Cada nó no canvas tem:
- **Barra de acento lateral** (4 px) colorida por `--accent` (roxo = gatilho, laranja = condição, azul = ação, verde = WhatsApp, etc.)
- **Badge numerado** no topo-esquerdo (ordem de execução)
- **Tipo em pill** (`n-kind`) + título (`n-title`) no cabeçalho
- **Corpo** opcional com detalhes (preview de mensagem, timer, etc.)
- **Rodapé** com chips de estatística: `ok`, `warn`, `err`
- **Portas de conexão** (`port-io`) — saída à direita, entrada representada por círculo SVG

### Tipos de nó disponíveis

| Tipo | `node.type` no React Flow | Acento |
|---|---|---|
| Gatilho | `trigger` | `--brand-secondary` (roxo) |
| Condição | `condition` | `--color-warn` (âmbar) |
| Ação genérica | `action` | `--brand-primary` (azul) |
| Mensagem WhatsApp | `whatsapp` | `--color-success` (verde) |
| Aguardar resposta | `wait` | `--color-warn` |
| Mover estágio | `stage` | `--brand-primary` |
| Adicionar tag | `tag` | `--color-success` |

### Blocos arrastáveis (painel esquerdo)

Dois grupos: **Ações** e **Salesbot**. Cada bloco é um `<div draggable>` que, ao ser solto no canvas, cria um nó via `onDrop` do React Flow.

Exemplos de blocos disponíveis:
- Enviar e-mail, Mover estágio, Atribuir responsável, Adicionar/Remover tag, Atualizar campo, Criar atividade, Atualizar lead score *(Grupo Ações)*
- Pergunta ao lead, Aguardar resposta, Definir variável, Ir para (Goto), Transferir automação *(Grupo Salesbot)*

### Top bar do editor

| Elemento | Descrição |
|---|---|
| "← Automações" | Breadcrumb de volta à lista |
| Nome editável | `<span contenteditable>` ou modal inline |
| Toggle ATIVA/PAUSADA | Muda `isActive` via PATCH na API |
| Copilot | Abre painel de sugestões por IA (futuro) |
| Auto alinhar | Reorganiza nós em DAG (dagre layout) |
| Exportar JSON | Download do fluxo como JSON |
| Logs | Abre painel de execuções históricas |
| Excluir | Deleta a automação (com confirmação) |
| Salvar | PATCH `/api/automations/:id` com `{ nodes, edges }` |

### Wires (conexões)

- Curvas Bézier cúbicas (padrão do React Flow)
- Cor padrão: `--brand-primary-light`
- Cor de sucesso (caminho "sim"): `--color-success`
- Cor de erro (caminho "não"/"timeout"): `--color-danger` + `stroke-dasharray: 5 5`
- Seta (`marker-end`) alinhada ao tema

### Controles de tela

| Controle | Posição |
|---|---|
| Zoom (+/−/ajustar) | Canto inf. esquerdo do canvas |
| Minimap | Canto inf. direito (`display:none` em mobile) |

### Próximos passos de refatoração (Fase 6+)

1. **Migrar `automations-editor.tsx`** (legado) para o novo canvas React Flow.
2. **Persistência bidirecional**: carregar fluxo existente de `GET /api/automations/:id` e salvar via `PUT`.
3. **Execução em tempo real**: WebSocket/SSE para atualizar chips `ok/err` nos nós com dados ao vivo.
4. **Copilot**: integrar chamada à IA para sugerir próximo nó a partir do contexto do fluxo atual.
5. **Dagre layout** (`npm install dagre`): botão "Auto alinhar" usa `dagre.layout()` para reorganizar os nós automaticamente sem sobreposição.
