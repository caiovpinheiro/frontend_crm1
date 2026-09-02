# Decisões Estruturais — CRM EduIT (Frontend)

Registro de decisões técnicas que afetam estrutura do projeto. Cada entrada
documenta **por que** algo foi feito, não **o que**.

---

### 2026-09-02 — Product tour (Driver.js) opt-in por página

**Decisão.** Infra de tour em `src/features/product-tour/` com Driver.js. Cada página registra passos e monta `PageTourButton` (`?` no header). O tour só inicia no clique em “Fazer tour desta página”. Sem auto-start, sem persistência, sem backend. Piloto: Pipeline kanban. Onboarding wizard e `OnboardingTour` da Inbox permanecem separados.

**Contexto.** Organizações precisam de ajuda contextual sem interromper o uso do CRM. O overlay legado da Inbox não é spotlight e não está montado; o wizard é setup de org.

**Alternativas descartadas.** Reusar `OnboardingTour` (não destaca DOM). Auto-start / localStorage de conclusão (pedido explícito de não persistir). Colocar o tour no hamburger (o menu de 1 item vira Plus; o `?` precisa ficar discreto e separado).

**Impacto.** `npm` `driver.js`. Páginas novas: `tours/<id>-tour.ts` + registro + `data-tour` estável + `<PageTourButton tourId="…" />`.

---

### 2026-09-01 — Convite por e-mail, verificação no signup, esqueci senha

**Decisão.** Equipe deixa de criar usuário com senha e passa a enviar convite (`POST /api/invites`). Signup do primeiro ADMIN redireciona para `/verify-email` em vez de `signIn`. Páginas públicas `/forgot-password`, `/reset-password`, `/verify-email`. Reset admin na Equipe permanece.

**Contexto.** Plano de e-mail transacional aprovado; posse do e-mail no signup e convites hashed no backend.

**Alternativas descartadas.** Manter criação imediata com senha na Equipe. Login automático após signup sem confirmar o e-mail.

**Impacto.** `settings/team/client-page.tsx`, `landing-client.tsx`, login, `accept-invite`, middleware `PUBLIC_PATHS`.

---

### 2026-08-31 — Seletor de org no login (mesmo e-mail)

**Decisão.** Depois do e-mail no apex, se `tenant-lookup` devolver 2+ orgs, o login troca o form pela tela “Selecione uma conta”. 1 org continua o redirect atual. Em host único (localhost / EasyPanel) o clique fica no mesmo origin — não manda para `{slug}.bwipo.com`. `?previewOrgs=1` só em development para ver o layout sem dados multi-org.

**Contexto.** O mesmo e-mail vai poder existir em várias orgs; a senha continua no host da org escolhida. Unicidade de e-mail ainda não mudou — users atuais não passam pelo seletor.

**Alternativas descartadas.** Membership (um user, várias orgs). Mostrar o seletor também quando há 1 org (muda o fluxo que já funciona).

**Impacto.** `login/client-page.tsx`, `login/org-account-picker.tsx`. No submit, se o lookup devolver 2+ orgs, abre o seletor e o `signIn` manda `organizationSlug`. 1 org não muda.

---

### 2026-08-27 — Inbox: aba "Agente IA"

**Decisão.** Nova aba `agente_ia` entre "Ligar" e "Automação" (`TABS`, `INBOX_TAB_IDS`, `INBOX_TAB_BAR_ORDER`, `TabCounts`), com ícone próprio no `statusVisual` (`IconSparkles`, rosa — a IA não é o robô de campanha). `inboxQueueTabFor` passa a mandar qualquer conversa com assignee `type: AI` para essa fila, independente de inbound.

**Contexto.** A fila da IA existe agora no backend (`tabToWhere` case `agente_ia`); as conversas com a IA como responsável saíram de Entrada/Aguardando/Respondidas/Automação. Sem a aba no frontend elas simplesmente sumiriam da Inbox.

**Alternativas descartadas.** Derivar a aba no cliente a partir de `assignedTo.type` (badges e paginação vêm do servidor; `todos` e as permissões também). Reusar o ícone/rótulo de Automação (esconde a diferença entre robô de campanha e atendimento da IA).

**Cockpit.** O KPI "Ainda com a IA" (aba Saúde de `/ai-agents`) é a mesma população da aba: o hint virou "na aba Agente IA" e o modal de casos ganhou atalho para `/inbox?tab=agente_ia` via `QUEUE_TAB_BY_KEY`. Mapa por key em vez de `if` solto porque outros KPIs viram fila depois.

**Impacto.** Deploy acoplado ao backend, **frontend primeiro**: o backend antigo ignora `tab` desconhecida em vez de rejeitar, então a aba nova apenas lista tudo até o backend subir. Subir o backend antes é o que esconde as conversas da IA de Entrada/Aguardando/Respondidas/Automação sem aba para recebê-las. `inbox:tab:agente_ia` controla a visibilidade; roles antigas caem no fallback de `inbox:tab:entrada` / `inbox:tab:automacao`.

---

### 2026-08-26 — Encaminhar formulário WhatsApp (slash + node)

**Modelo usado.** Cursor Grok 4.6.

**Decisão.** Operador envia Flow publicado de duas formas: atalho `/` (envia na hora, janela 24h) e node `send_whatsapp_flow` no grupo Mensagens. Catálogo via GET `/api/whatsapp-flow-definitions/published`. Fora da janela 24h o caminho continua sendo template com botão FLOW.

**Alternativas descartadas.** Recolocar Ação/Flow no node Botões. Abrir painel de confirmação no `/` (não há variáveis de template para preencher).

**Impacto.** `slash-command-menu.tsx`, `add-step-node.tsx` (grupo Mensagens), editor inline `publishedFlow`.

---

### 2026-08-21 — Inbox: voltar nativo do celular volta à lista

**Modelo usado.** Cursor Grok 4.5.

**Decisão.** `useInboxUrlSync` passa a usar `history.pushState` ao abrir
conversa (lista → `?c=`) e escuta `popstate` para sincronizar `activeId`.
O botão Voltar do CRM chama `history.back()` quando há `?c=`, alinhado ao
gesto/botão nativo do WebView. Mesmo padrão de `useDealDeepLink` no Pipeline.

**Alternativas descartadas.** Interceptar só `@capacitor/app` backButton
(não cobre gesto/histórico web); manter `replaceState` (back cai no
Dashboard).

**Impacto.** `features/inbox-v2/hooks/use-inbox-url-sync.ts`,
`app/(app)/inbox/_v2-client.tsx` (Voltar → `closeActiveConversation`).

---

### 2026-08-20 — Contrato único de tarefas (Inbox / Pipeline / aba Tarefas)

**Modelo usado.** Opus (versão não confirmada).

**Decisão.** `/api/activities` + `directory-v2` (`api.ts` / `hooks.ts`) são o
contrato canônico. `ActivityComposer` é o formulário único (tipo, título,
data/hora, duração, notas, responsável usuário/pessoal/departamento, contato
e negócio opcionais). Query keys centralizadas em `v2-activities` (com
`dealId`/`contactId` no key) e invalidação compartilhada em create/update/delete
para refletir na aba global e nos painéis contextuais. Vínculo da Activity é
sempre `contactId`/`dealId` — nunca `conversationId` (backend ignora).

**Alternativas descartadas.** Manter formulários/payloads/caches separados por
superfície (Inbox TaskDialog, painel Pipeline, aba global); usar
`conversationId` como vínculo da Activity.

**Impacto.** Composer compartilhado; TaskDialog vira wrapper; painel Pipeline
usa hooks canônicos; create duplicado em `inbox-v2/api/misc` removido.

---

### 2026-08-20 — Push nativo FCM no APK

**Modelo usado.** Cursor Grok 4.6.

**Decisão.** Registrar FCM só com `window.Capacitor.Plugins.PushNotifications`
(sem `@capacitor/*` no bundle Next). Bootstrap após login. Clique abre
`/activities`. Foreground deixa o popup interno. Plugin nativo vive em
`mobile/` + `google-services.json`.

**Alternativas descartadas.** Web Push no WebView (não acorda o APK
fechado); firebase-analytics no Gradle.

**Impacto.** `push-fcm.ts`, `NativeFcmBootstrap`, plugin em `mobile/`.

---

### 2026-08-14 — Node `check_agent_status` (Status do agente)

**Modelo usado.** Cursor Grok 4.6.

**Decisão.** Bloco de lógica no canvas com o mesmo card binário de
`business_hours`: handle `true` = Disponível, handle `false` = Offline
(`elseStepId`). Sem formulário extra — verifica o responsável da conversa.

**Contexto.** O runtime vive no backend; o canvas precisa do tipo na
palette e das arestas `true`/`false` para o operador montar o ramo de
transferência quando o dono está offline.

**Alternativas descartadas.** Reusar `ConditionNode` (N ramos); reusar
`BusinessHoursNode` com labels genéricos (acopla dois conceitos).

**Impacto.** Palette Lógica, workflow-canvas, auditor/layout/workflow
espelhados do backend.

---

### 2026-08-07 — Node `send_whatsapp_list` (Lista / menu interativo)

**Modelo usado.** Cursor Grok 4.5.

**Decisão.** Novo passo de automação `send_whatsapp_list` (“Lista WhatsApp”),
espelhando `send_whatsapp_interactive`: config inline com `body`, `button`,
`rows[]` (até 10, título/descrição/`gotoStepId`), timeout e falha. Canvas
reutiliza `InteractiveNode` com handles `btn_*` sobre `rows`. Runtime no
backend chama `MetaWhatsAppClient.sendInteractiveList` e pausa; o match de
resposta reusa `list_reply` já parseado no webhook + matching por
`title`/`id` em `rows` (como botões).

**Contexto.** A API Meta de lista já existia no outbound; faltava o bloco no
fluxo. Botões Meta limitam a 3 opções — a lista cobre menus maiores.

**Alternativas descartadas.** Estender o passo de botões (mistura limites UX);
usar só webhook genérico (sem handles no canvas).

**Impacto.** FE: automation-workflow, editor-fields, inline-editor, palette,
canvas/graph, auditor. BE: automation-workflow, executor, automation-context,
auditor.

---

### 2026-08-07 — Seleção de preço/canal ao adicionar curso no negócio

**Modelo usado.** Cursor Grok 4.5 (orquestração) + exploração do código em DEV_BRANCH.

**Decisão.** Na aba Produtos do negócio (inbox/pipeline), ao clicar em um
produto do catálogo, se `courseConfig.pricingOptions` tiver **mais de uma**
linha (preço base + canal + desconto), a UI troca a busca por uma lista de
opções com canal visível. A escolha envia `unitPrice` + `discount` (+ `channel`
no evento) no `POST /api/deals/:id/products`. Com 0 ou 1 opção, segue o fluxo
direto (1 opção já aplica preço/desconto da linha).

**Contexto.** Cursos passam a ter várias tabelas de preço por canal no
cadastro; o aside só enviava `productId` e o backend usava `product.price`
(espelho da 1ª opção), impedindo o operador de escolher o canal correto.

**Alternativas descartadas.**

- Persistência de `channel` em `DealProduct` (migração): adiada — o valor
  registrado no item já é preço/desconto; canal fica no evento e na escolha.
- Picker só no editar: o fluxo pedido é na escolha do produto ao adicionar.

**Impacto.** `DealProductsSection` em `deal-detail/sidebar.tsx`; backend já
aceitava `unitPrice`/`discount` no POST.

---

### 2026-08-03 — Saída visual "Falha ao enviar" nos nodes Meta

**Modelos usados.** GPT-5.6 Sol (decisão principal) e Opus 4.7 isolado
(avaliação arquitetural).

**Decisão.** Nodes de mensagem, template, mídia, botões e pergunta WhatsApp
mostram uma saída própria `failure`, rotulada **"Falha ao enviar"**. Conectar
essa saída persiste `failureAction: "goto"` e `failureGotoStepId`; desconectar
ou remover o destino limpa a referência e volta para `failureAction: "stop"`.
Os handles normais de sucesso/resposta permanecem inalterados.

O `WorkflowCanvas` de produção e os helpers do segundo editor compartilham o
mesmo contrato. A saída representa somente rejeições percebidas durante a
chamada à Meta; falhas de entrega informadas posteriormente pelo webhook ficam
fora desta fase.

**Alternativas descartadas.**

- Um node `condition` separado baseado em `conversation.hasError`: UX distante
  do padrão Kommo e sujeita a corrida de atualização.
- Mostrar a saída em todos os `ActionNode`: criaria um caminho sem semântica em
  ações que não enviam pela Meta.
- Reagir desde já a falha assíncrona: exige correlação persistente e política
  segura para não reanimar fluxo já concluído.

---

### 2026-07-31 — Trigger `conversation_tabulated`: rename semântico e filtro explícito de tabulação

**Decisão.** Mantido o slug interno `conversation_tabulated` (não renomeado
pra preservar automações já salvas em produção), mas:

1. Label na UI passa de "Conversa tabulada (encerramento)" para
   **"Conversa encerrada"** — reflete o comportamento real do backend, que
   já disparava em qualquer `resolve` via `POST /api/conversations/:id/actions`,
   com ou sem tabulação.
2. Config do trigger ganha campo booleano `requireTabulation` (default
   `false`). Quando marcado, `evaluateTrigger` só passa se o payload trouxer
   `tabulationId` não-nulo — separando explicitamente a semântica de
   "qualquer encerramento" vs "só quando tabular".

**Contexto.** Usuário reportou que o gatilho "só funcionava quando tabulado".
Investigação mostrou que o backend já dispara em qualquer encerramento manual
(fix anterior no `actions/route.ts`), mas: (a) o label sugere o oposto,
(b) selecionar uma tabulação específica no config aplicava filtro implícito
que descartava encerramentos sem tabulação. Sem toggle explícito, "qualquer
encerramento com filtro por tabulação genérica" não era representável.

**Alternativas descartadas.**

- **Renomear o slug `conversation_tabulated` → `conversation_closed`**:
  quebraria todos os `triggerType` já salvos no DB (`Automation.triggerType`).
  Custo (migration + backfill) desproporcional ao benefício estético.
- **Disparar o trigger também no bulk resolve e no passo `finish_conversation`**:
  usuário optou por não expandir — bulk pode disparar 100 automações de uma
  vez, e passo de automação disparando trigger causa loops. Escopo continua
  em encerramento individual manual via `/actions`.
- **Toggle "modo estrito" que exige match exato de tabulação (folha, sem
  ancestrais)**: comportamento atual (folha OU ancestral) já cobre o padrão
  "categoria pai inclui folhas". Adicionar mais um modo aumenta cognitive
  load sem caso de uso claro.

**Impacto operacional.**

- Automações existentes sem `tabulationId` no config → continuam disparando
  em qualquer encerramento (comportamento inalterado).
- Automações existentes COM `tabulationId` no config → continuam filtrando
  pela tabulação específica (comportamento inalterado; `requireTabulation`
  implícito).
- Novas automações podem marcar `requireTabulation: true` sem escolher
  tabulação específica → dispara em qualquer encerramento tabulado.
- Label no dropdown de triggers muda visualmente para usuários finais.

---

### 2026-07-16 — Vídeos WhatsApp: HTTP Range no `/api/storage`

**Decisão.** `GET /api/storage/[...path]` passa a suportar HTTP Range
requests (`RFC 7233` bytes ranges, formato `bytes=<start>-<end?>`). Quando
o header vem no request, o endpoint responde `206 Partial Content` com
apenas a fatia solicitada (via `fs.open().read(buffer, 0, size, start)`).
Sem `Range`, mantém o comportamento anterior (200 + body inteiro).

**Contexto.** Org DNA (prod) reportou que vídeos recebidos por WhatsApp
não abrem no player do chat (contato `+5511985958365`). Diagnóstico: o
elemento `<video controls>` do HTML5 exige `206 Partial Content` — Safari
(iOS/macOS) recusa iniciar reprodução sem isso, e Chrome desktop tolera
apenas arquivos pequenos (~poucos MB) antes de travar. O código anunciava
`Accept-Ranges: bytes` no header (que faz o browser mandar `Range` esperando
206) mas ignorava o request header e devolvia sempre 200 com o buffer
inteiro. Áudio, imagem e documento não sofriam porque browsers baixam
esses inteiros e o comportamento full-body funciona.

**Alternativas descartadas.**

- **Servir vídeos via redirect pra storage externo (S3-like presigned URL)**:
  resolveria escala, mas requer nova infra (S3/CloudFront), migração
  dos arquivos existentes e retrabalho de auth (URL assinada). Over-engineering
  pro problema imediato.
- **Streaming via `ReadableStream` do Node**: mais elegante, mas exige
  wrapping do Node `Readable` em `Web ReadableStream` (App Router). O
  padrão `open()+read()` cobre o caso (`<video>` pede fatias pequenas,
  não o arquivo inteiro de uma vez), sem inflar memória. Podemos evoluir
  pra streaming se aparecer vídeo >100MB.
- **Cachear o Content-Range no CDN**: Easypanel não tem CDN nativo; ignora.

**Impacto operacional.**

- **Backward-compat garantido:** requests sem `Range` continuam recebendo
  200 + full body. Imagens/áudio/PDF/etc. inalterados.
- **Consumo de memória cai** em vídeos grandes: antes carregava o buffer
  inteiro na RAM do worker por request; agora aloca só `chunkSize` bytes.
- **Fallback upstream (`tryUpstreamFallback`)** não propaga o `Range` — só
  é usado em dev quando o container remoto tem o arquivo e o local não.
  Em prod DNA o arquivo está no disco do próprio container, então o
  fluxo 206 é atingido no primeiro branch. Se aparecer bug em dev com
  vídeo do container remoto, propagar `Range` na `fetch(upstreamUrl)`.
- **Range malformado** (fora do padrão `bytes=X-Y?`) cai no fallback 200.
  Comportamento permissivo — alguns crawlers/proxies mandam ranges esquisitos.

**Arquivos.** `backend_crm1/src/app/api/storage/[...path]/route.ts`.

**Deploy.** Merge `DEV_BRANCH → main` para atualizar imagem `latest` no
GHCR e forçar redeploy no Easypanel da DNA. Nenhuma migração de dados —
o layout do storage não muda.

---

### 2026-07-15 — Modelo de ticket: nova conversa após RESOLVED

**Decisão.** Conversas WhatsApp passam a operar em modelo de **ticket**: o
matching "1 conversa por contato" agora exclui `status = RESOLVED`. Consequências:

1. **Inbound (Meta webhook, Baileys, worker campanhas):** ao chegar mensagem
   de contato cuja última conversa está `RESOLVED`, o backend cria uma **nova
   conversa** com `#N+1` ao invés de reabrir a existente. `findOrCreateConversation`
   nos 3 caminhos (`services/whatsapp-conversation.ts`, `lib/meta-webhook/handler.ts`,
   `workers/baileys/message-handler.ts`) e o endpoint `POST /api/conversations/create`
   ganharam `where: { status: { not: "RESOLVED" } }`.

2. **Reopen manual (kebab da conversa):** `POST /api/conversations/:id/actions`
   com `action=reopen` não mais promove `RESOLVED → OPEN`. Cria uma nova
   conversa clone (mesmo contato/canal/inbox/assignee), dispara
   `fireTrigger("conversation_created", …)` e retorna
   `{ conversation: <nova>, previousConversationId: <antiga> }`. O frontend
   navega para a nova (`useToggleConversationResolve` expõe callback
   `onNewConversation`; `ConversationActionsMenu`/`ComposerMenu` propagam para
   o caller — o inbox faz `setActiveId(newId)`; o pipeline confia na
   invalidação de `deal-detail-v2`, que traz `contact.conversations[0]`
   ordenado por `updatedAt desc`).

3. **Reopen em massa (`POST /api/conversations/bulk` com `action=reopen`):**
   removido. Retorna HTTP 400 com mensagem instruindo a reabrir 1 a 1 pelo
   kebab, pois cada reabertura vira um ticket distinto e o operador precisa
   ver o novo `#N` para navegar.

4. **`toggle_status` bloqueado pós-RESOLVED:** o endpoint singular rejeita
   qualquer transição `RESOLVED → outro` via `toggle_status` (retorna 400
   "use `reopen` para abrir novo ticket"). Impede que consumidores driblem
   o modelo de ticket enviando payloads legados.

**Contexto.** O usuário reportou que encerrar uma conversa e receber nova
mensagem mantinha o mesmo `#N` (a conversa era reaberta). Isso descaracteriza
o conceito de encerramento e polui a timeline única com múltiplos ciclos de
atendimento — dificulta relatórios de SLA/TMA por ticket, gatilhos de
boas-vindas por atendimento e histórico auditável de encerramentos.

**Alternativas descartadas.**

- **Janela de reabertura (24h)**: reabre se `closedAt < 24h`, cria nova
  senão. Casaria com a janela de 24h da API do WhatsApp Cloud, mas o
  cutoff "24h" é mágico — cliente que responde 25h após tópico ativo cai
  em ticket novo sem razão semântica. Complica lógica sem ganho claro.
- **Sempre nova + agrupamento visual por contato na lista**: idem A + UI
  agrupa conversas do mesmo contato num colapsável. Muito mais trabalho de
  UI para um problema que ainda não foi reportado; deixado como evolução
  futura se a lista ficar poluída na prática.
- **Manter comportamento atual (reabrir mesmo `#N`)**: mais simples, mas
  não atende ao pedido do operador nem viabiliza relatórios por ticket.

**Impacto operacional.**

- Automação `conversation_created` passa a disparar **por ticket** (não
  por contato). Se houver automação de "boas-vindas" ligada, ela reenviará
  a cada ciclo de encerramento+retomada. Verificado no painel de
  automações antes do deploy — se indesejado, ativar um filtro no gatilho
  (`data.previousConversationId != null` → skip).
- `ensure-deal-conversations.ts` (script one-shot) continua garantindo "1
  conversa" para deals antigos; não altera o modelo pois só cria quando o
  contato não tem nenhuma. Sem regressão.
- Mensagens de tickets encerrados ficam encapsuladas na conversa anterior
  — acessíveis via perfil do contato / lista filtrada por RESOLVED, mas
  não aparecem "na mesma tela" do novo ticket. O `ConversationClosedMarker`
  no fim do chat encerrado sinaliza o corte visualmente.
- Automações em `services/automation-executor.ts` que fazem
  `findFirst({ contactId, channel: "whatsapp" })` NÃO foram alteradas
  neste PR — se uma automação tentar enviar para contato cuja última
  conversa está RESOLVED, ela vai encontrar a conversa RESOLVED e tentar
  usá-la. Auditar caso a caso quando alguma automação real precisar
  reagir a contato com ticket encerrado (issue backlog).

**Arquivos.** Backend: `src/services/whatsapp-conversation.ts`,
`src/lib/meta-webhook/handler.ts`, `src/workers/baileys/message-handler.ts`,
`src/app/api/conversations/create/route.ts`,
`src/app/api/conversations/[id]/actions/route.ts`,
`src/app/api/conversations/bulk/route.ts`. Frontend:
`src/features/inbox-v2/api/conversations.ts`,
`src/features/inbox-v2/hooks/use-conversation-actions.ts`,
`src/features/inbox-v2/extras/conversation-actions-menu.tsx`,
`src/features/inbox-v2/extras/composer-menu.tsx`,
`src/app/(app)/inbox/_v2-client.tsx`.

---

### 2026-07-15 — ID de conversa + logs + gatilho de nova conversa

**Decisão.** `Conversation` ganha campo `number Int` sequencial por
organização (`@@unique([organizationId, number])`), atribuído em todos os
pontos de criação via `nextConversationNumber()` + retry P2002 — mesmo
padrão já usado por `Contact.number` e `Deal.number`. O "ticket number"
(#N) passa a ser o identificador visível da conversa no Inbox e no
Pipeline, através do novo componente compartilhado `ConversationIdCard`.

Junto disso: (a) `updateConversationStatusInDb` passa a preencher/limpar
`closedAt` em sync com o status (`RESOLVED` → now, `OPEN` → null), corrigindo
bug pré-existente onde a coluna nunca era populada; (b) o gatilho de automação
`conversation_created` — que existia registrado em `automations.ts` e era
configurável na UI, mas nunca disparava em runtime — passa a ser chamado via
`fireTrigger("conversation_created", ...)` nos mesmos pontos que já logam
`CONVERSATION_CREATED` no ActivityFeed (create route + auto-ensure em
`whatsapp-conversation.ts`); (c) novo endpoint `GET
/api/conversations/[id]/timeline` (autorizado por `requireConversationAccess`,
não `requireManager`) devolve `ActivityEvent[]` filtrados por
`conversationId` — a Inbox v2 troca o antigo `timelineSlot` (que dependia
de deal vinculado e mostrava "Vincule um negócio…" caso contrário) pelo novo
`ConversationTimelineTab`, que funciona para qualquer conversa.

**Contexto.** O operador precisava de um identificador estável e curto para
referenciar uma conversa (ex.: passar #123 em suporte interno, alinhar com
o cliente), e o `Conversation.id` cuid não serve. Já tínhamos o padrão
resolvido em `Contact`/`Deal` — só faltava espelhar. Aproveitou-se o mesmo
PR para fechar dois gaps operacionais adjacentes: `closedAt` nunca era
gravado (impossível filtrar "conversas encerradas em maio" sem varrer log
de eventos) e o gatilho `conversation_created` da automação não disparava
(usuário configurava, nada acontecia — falha silenciosa).

**Alternativas descartadas.**

- **Usar `Conversation.id` truncado (últimos 6 chars).** Não é sequencial
  nem previsível; conflita com o mental model já criado por `#{deal.number}`
  no `DealInline`. Só ficou como fallback visual quando o backend legado
  ainda não populou `number` durante o rollout.
- **`hashids` (id numérico derivado do cuid).** Colide com potencial em
  larga escala e não deixa o operador procurar por "#123" no banco. Descartada.
- **Criar tipo novo de gatilho em vez de disparar o existente.** Pior — a UI
  já lista `conversation_created` e clientes já configuraram automações;
  criar um `conversation_new_v2` fragmenta o catálogo sem ganho.
- **Reaproveitar o `DealTimelineTab` no Inbox filtrando por `conversationId`.**
  Não dá — `DealTimelineTab` bate em `/api/deals/:id/timeline` (filtro por
  deal). Além disso, a timeline de deal e a de conversa têm semânticas
  diferentes (mudanças de estágio × mudanças de status), por isso o
  `ConversationTimelineTab` é um componente novo, mesmo reaproveitando
  `EVENT_CONFIG` + `eventDescription` canônicos.

**Impacto / operação.**

- Migration `20260715120500_add_conversation_number/migration.sql` adiciona
  a coluna, faz backfill idempotente por `ROW_NUMBER() OVER (PARTITION BY
  organizationId ORDER BY createdAt, id)`, torna `NOT NULL` e cria o unique
  index. Aplicar via `prisma migrate deploy` (dev primeiro, prod depois —
  mesmo fluxo que fizemos no PR de sidebar por role).
- Ativar `fireTrigger("conversation_created")` em prod dispara automações
  que estavam configuradas mas nunca rodaram. **Auditar em dev antes de
  subir pra prod** — rodar `SELECT DISTINCT organizationId FROM automations
  WHERE trigger_type = 'conversation_created'` e conferir com quais orgs
  temos automations configuradas desse tipo.
- Frontend: novo hook `useConversationTimeline(conversationId)`, novo card
  compartilhado `ConversationIdCard`, novo slot `conversationCardSlot` em
  `ContactAside` e `DealDetailPanel`. Compat mantida via campos opcionais
  (`number?`, `closedAt?`) em `ConversationListRow` — clientes antigos
  continuam funcionando; card cai em fallback `#<últimos-6-do-id>` até o
  backend re-deployar.

---

### 2026-07-14 — Sidebar por Papel (não mais per-user)

**Decisão.** A personalização do menu lateral (`SidebarCustomizationCard`)
sai da tela `/settings/profile` e vira uma configuração de **Papel (Role)**
dentro de `/settings/permissions`. Cada Role passa a ter uma coluna
`sidebarItems JSON?` no Prisma; o usuário não escolhe mais o próprio menu.
`getSidebarPreferences(userId)` deixa de ler `UserPreference.sidebar` e
passa a fazer **união** dos `sidebarItems` de todos os Roles atribuídos
ao usuário (item habilitado se qualquer role habilitou; ordem = primeira
ocorrência estável entre os roles). Roles sem `sidebarItems` definido
caem no catálogo padrão (todos habilitados) para não travar o rollout.

**Contexto.** O usuário reportou que "personalização de sidebar" não deveria
ser preferência individual — a organização precisa controlar o que cada
papel vê. Além disso, `Group.sidebarRoutes` já existia no schema mas nunca
foi ligado ao rendering (código morto); a decisão consolida a fonte em
Role, que é o eixo canônico de autorização hoje (todo usuário tem role,
nem todo está em grupo).

**Alternativas descartadas.**

- **Setting global da organização.** Simples, mas tira a chance de dar
  layouts diferentes por papel (SDR vê inbox, gerente vê analytics etc.).
- **Continuar per-user, mas com admin editando a sidebar dos outros.**
  Mantinha a estrutura atual mas apenas movia quem clica no botão. Rejeitada
  porque não simplifica governança (admin teria que reconfigurar N vezes
  para cada contratado novo).
- **Intersecção entre roles (mais restritivo).** Descartada por gerar
  surpresas negativas — usuário com 2 roles perderia acesso a itens que
  um dos roles habilita. União segue o mesmo padrão aditivo já usado em
  `RoleScopeGrants` de canais.

**Impacto / operação.** Nova migration SQL aditiva
`prisma/migrations/20260714120000_add_role_sidebar_items` adiciona a
coluna `sidebarItems JSONB` (nullable) em `Role`. Deploy exige rodar a
migration antes de subir o novo backend (padrão do repo — `SKIP_PRISMA_MIGRATE=1`
no runtime). Endpoint `PATCH /api/profile/preferences/sidebar` passa a
retornar `403` (deprecated) — a coluna `UserPreference.sidebar` é mantida
no banco por compatibilidade histórica mas não é mais lida nem escrita.

---

### 2026-06-26 — Aviso de ligação no chat + botão de ligar no inbox

**Decisão.**
1. **Render `messageType: "sip_call"`** no `MessageBubble` como linha
   centralizada (ícone recebida/realizada/não-atendida + texto + hora). Como
   inbox (`ChatArea`) e pipeline (`deal-chat-binding`) usam o mesmo
   `MessageBubble`, uma única branch cobre os dois. `toMessageBubble` já
   repassa `messageType`.
2. **Botão de ligar no inbox**: `DealCallButton`/`useDealDial` passaram a
   aceitar `dealId` opcional; o botão entra no `headerActionsSlot` do
   `ChatArea` (ao lado do `ConversationActionsMenu`) usando telefone/contato
   da conversa. Continua atrás do gate `useCallsWidget`.

**Contexto.** Ligações não apareciam na conversa e o inbox não tinha como
discar (só o pipeline tinha `DealCallButton`).

**Alternativas descartadas.**
- *Botão na phone-row do `ContactAside`*: o `headerActionsNode` do aside nem
  era renderizado; o header do chat é o lugar natural e já visível.

**Impacto.** Aditivo. O backend cria a `Message` `sip_call` via webhook.

---

### 2026-06-26 — Enviar produto em automação, produto no negócio e registro/gatilho de ligações

**Decisão.** Quatro frentes entregues num ciclo só:
1. **Ação `send_product`** no builder de automações (catálogo em
   `lib/automation-workflow.ts`, ícone/grupo em `add-step-node.tsx`,
   painel em `step-config-panel.tsx` com `ProductPicker` + textarea de
   variáveis `{{produto.*}}`, item na `node-palette.tsx`).
2. **Adicionar produto ao negócio** reusando o `DealProductsSection`
   existente: no pipeline via novo slot `productsSlot` do `DealDetailPanel`
   e no inbox dentro do `DealInline` do `ContactAside`.
3. **Registro de ligações** via botão/auto **Sincronizar** na página
   `/calls` (`POST /api/calls/sync`) + sync best-effort ~8s após o término
   de uma ligação no `useSoftphone`.
4. **Gatilhos `call_received`/`call_made`** expostos no
   `trigger-config-fields.tsx` (filtro atendida/não atendida).

**Contexto.** `send_product` espelha `send_whatsapp_message` (texto
interpolado, sem card de catálogo Meta). O `DealProductsSection` já batia
nas APIs de line items prontas — evitou duplicar UI. O registro de chamadas
estava 100% dependente do webhook Api4com (frágil); o sync puxa o CDR
oficial (`GET /calls`) e reconcilia.

**Alternativas descartadas.**
- *Nova UI de produtos no v2*: rejeitado — reusar `DealProductsSection`.
- *Card de catálogo WhatsApp no send_product*: adiado — exige catálogo Meta.

**Impacto.** Aditivo. Builder ganha 1 ação + 2 gatilhos; pipeline/inbox
ganham seção de produtos; `/calls` passa a popular mesmo sem webhook.

---

### 2026-06-26 — Edição em massa de campos/tags no pipeline (worker-leads)

**Decisão.** Adicionada a ação "Editar campos…" na `BulkActionsBar` do
pipeline, que abre o `BulkEditFieldsDialog` e permite atualizar em massa:
campos (nativos + personalizados) do **Negócio**, campos (nativos +
personalizados) do **Contato vinculado** e **adicionar tags ao Negócio**.
Tudo é processado de forma **assíncrona pelo worker-leads** (fila
`leads-bulk`, job `bulk-update-fields`), com o `BulkOperationProgressDialog`
já existente fazendo polling.

**Contexto.** Já existia o trio rota `/api/deals/bulk/custom-fields` +
payload `BulkUpdateFieldsPayload` + job `bulk-update-fields`, mas cobria
**apenas custom fields de Deal**. Em vez de criar uma fila/rota nova, a
infra existente foi **estendida de forma aditiva** (campos novos no payload
são opcionais; o caminho antigo de `updates` segue idêntico). Isso reduz
superfície de risco e reaproveita progresso/erros-por-item/idempotência já
testados.

**Alternativas descartadas.**
- *Plugar na rota `/api/deals/bulk`* (move/won/lost/delete): rejeitado —
  essa rota é sensível (status terminal, automações, triggers) e o escopo
  de "editar campos" é ortogonal. Mantida intacta.
- *Edição síncrona inline*: rejeitado — o usuário pediu explicitamente o
  worker-leads e operações de N deals × M campos são pesadas (cada deal
  abre transação própria no upsert).
- *Bulk-editar campos nativos de Contato com unicidade* (ex.: email):
  seguro no schema atual (Contact.email/phone **não** são `@unique`), mas
  erros por-item são capturados em `BulkOperation.errors` sem travar o lote.

**Impacto.** Semântica **skip-empty**: só os campos preenchidos no dialog
são aplicados (vazio = não altera). Tags são resolvidas/criadas na rota
(onde há `role` do usuário) e passam ao worker como `tagIds` já resolvidos.
Gate de permissão: `deal:edit` (base) + `contact:edit` quando há alteração
de campos de contato. Resolução do contato é por-deal no handler (contatos
compartilhados recebem o mesmo upsert idempotente).

---

### 2026-06-24 — Telefonia como widget (`calls_history`)

**Contexto.** A telefonia (página `/calls`, softphone flutuante global,
botão "Ligar" nos cards do pipeline) era uma seção nativa do CRM, sempre
ativa em todas as orgs. Operadores sem provisionamento Api4Com viam ícones
e cards inúteis (chip "Conectando…" eterno, botão de ligar desabilitado),
e admins não tinham como desligar a feature centralmente. O padrão da
**Distribuição Inteligente** (`smart_distribution`) já tinha resolvido
exatamente esse problema: módulo opt-in plugável via Central de Widgets.
A consistência arquitetural pedia o mesmo tratamento pra telefonia.

**Decisão.** Criado widget `calls_history` (INTERNAL, categoria
"Comunicação", ícone `phone`) que gateia TRÊS pontos de entrada:

1. **Página `/widgets/calls`** (era `/calls`) — histórico de chamadas
   com fallback `NotEnabledState` + CTA pra `/widgets`.
2. **`SoftphoneWidget`** (chip flutuante bottom-right) — não monta o
   `JsSIP.UA` nem busca credenciais quando o widget está desinstalado.
3. **`DealCallButton`** (botão "Ligar" no card) — some completamente
   sem o widget.

Gate centralizado no hook `useCallsWidget()` (`features/softphone/hooks`)
— consome a query `useWidgets()` (cache compartilhado) e devolve
`{ enabled: boolean | null, isLoading }`. O estado `null` durante load
evita flash visual (chip aparecendo e sumindo).

**Rota antiga `/calls`.** Mantida como **redirect 308** pra
`/widgets/calls` (preserva favoritos, atalhos de navegador, links em
e-mails antigos). O `_client.tsx` original foi deletado — não tinha
mais consumidor.

**Default `installed=true`.** Migration backend
(`20260624140000_add_calls_history_widget`) faz seed do widget E instala
`ACTIVE` em todas as orgs existentes. Sem esse backfill, qualquer cliente
que já usa telefonia veria a feature sumir após deploy — quebra silenciosa
inaceitável. Quem não quiser, desinstala em `/widgets`.

**Permissão `nav:calls`.** Antes existia em `sidebar-catalog.ts` do
frontend mas o backend não a tinha no catálogo de permissões — efeito
prático: o item "Chamadas" só aparecia pra ADMIN (que tem `*`). Adicionada
no catálogo backend (`permissions.ts`) e nos presets MANAGER e MEMBER,
com `UPDATE roles` na mesma migration pra propagar às roles existentes.
Não-breaking: ADMINs continuam vendo; MANAGER/MEMBER ganham acesso (era
um bug latente, não regressão intencional).

**Alternativa descartada.** Gateamento por `requiredPermission` puro (sem
widget) — funcionaria pra esconder a página, mas não solucionaria o caso
"admin quer desligar a feature pra toda a org sem mexer em RBAC de cada
role". Widget é o ponto certo de toggle org-wide.

**Impacto.**
- `src/features/softphone/hooks/use-calls-widget.ts` (novo) — hook gate.
- `src/features/softphone/components/softphone-widget.tsx` — gate +
  setinha colapsa pro ícone (`localStorage` persiste preferência).
- `src/features/softphone/components/deal-call-button.tsx` — gate.
- `src/app/(app)/widgets/calls/{page,client-page}.tsx` (novo) — rota
  + `NotEnabledState`/`SkeletonState`.
- `src/app/(app)/calls/page.tsx` — virou redirect 308.
- `src/lib/sidebar-catalog.ts` — `/calls` → `/widgets/calls`.
- `src/features/widgets/mock.ts` + `_components/widget-card.tsx`
  (`ICON_BY_KEY` ganhou `phone`, `INTERNAL_ROUTE_BY_SLUG` ganhou
  `calls_history`).

---

### 2026-06-24 — Motivos de perda: toggle "Permitir outro" + gate na UI

**Contexto.** Reporte do cliente em produção: a opção "Outro…" no dialog
de marcar negócio como perdido vinha sendo usada como saída fácil pelos
vendedores, gerando dezenas de motivos digitados livremente (variações
de capitalização, typos, frases longas). O dataset ficou inutilizável
pra análise de motivos de churn — qualquer dashboard que agrupa por
`Deal.lostReason` virou ruído. A solução de simplesmente apagar o botão
"Outro…" pra todo mundo quebraria orgs que dependem dele.

**Decisão.** Nova setting per-tenant `deals.loss_reason_allow_other`
(boolean, default `true`). Quando o admin desliga em
Configurações → Motivos de perda, o `LossReasonDialog` esconde o botão
"Outro…" e o textarea livre — só os motivos cadastrados ficam clicáveis.
Default `true` é não-breaking: orgs que já usam continuam usando até o
admin marcar explicitamente.

Renderização do motivo no card já existia (`DealCard.lostReason` →
chip vermelho com ícone), o problema sempre foi a entrada poluída.
Por isso o ataque é só no dialog + validação backend, sem mexer no card.

**Defesa em profundidade.** Esconder o botão na UI cobre o caminho feliz
mas não impede chamada direta à API (`PUT /api/deals/[id]/status` com
`lostReason: "qualquer coisa"`). O service `markDealLost` agora chama
`assertLostReasonAllowed(reason)` antes do update; mesma helper roda em
`moveDeal` e no path `move_stage` do `POST /api/deals/bulk`. Erro
`INVALID_LOST_REASON` é traduzido pra 400 com mensagem explicativa.

**Alternativas descartadas.**
- *Hardcoded `enum LossReason`*: simples, mas inviável — cada org tem
  motivos próprios (B2B vendas longas vs B2C educação vs prestação de
  serviço). Setting + lista cadastrável já existia pra essa flexibilidade.
- *Validar só na UI*: deixaria a API aberta. Vendedor curioso testando
  no DevTools, integração externa (Zapier/Make chamando a API), worker
  de import — tudo conseguiria furar. Centralizar em
  `assertLostReasonAllowed` no service garante que qualquer caller fica
  coberto sem repetir validação.
- *Validar no Prisma extension*: poderia interceptar todo update com
  `lostReason`, mas mistura camada de dados com regra de negócio org-scoped
  e complica testes. Helper explícita chamada no service é mais clara.

**Impacto.**
- Frontend: `LossReasonDialog` lê `deals.loss_reason_allow_other` via
  `/api/settings/org?key=...` (5min staleTime, mesma chave já cacheada
  pelo settings page). Toggle no `settings/loss-reasons` espelha o
  mesmo padrão visual do "Motivo obrigatório" existente.
- Backend: helper `assertLostReasonAllowed` em `services/deals.ts`
  exportada pra reuso. Chamadas inseridas em `markDealLost`, `moveDeal`,
  bulk `mark_lost` e `move_stage`. Worker async `bulk-move-stage.job.ts`
  já está coberto via validação no enqueue.

---

### 2026-06-23 — Softphone: widget global como ponto único de auto-connect

**Contexto.** Após restaurar o módulo softphone (feat 572f06e do mfpi)
e provisionar o ramal Api4com via `POST /api/sip-extensions/connect-api4com`,
o operador via "Conectado! Ramal 1079" verde mas nenhuma chamada
funcionava: `DealCallButton` mostrava tooltip "Conecte o softphone" e
F5 voltava à tela de login Api4com. Causa raiz: o `SoftphoneWidget`
montado em `(app)/layout.tsx` era um placeholder no-op que eu commitei
pra desbloquear o build (mfpi entregou hook + componentes auxiliares
mas não o widget global). Sem ele, `useSoftphone()` nunca era chamado
no nível raiz, então o singleton `moduleUA` (que sobrevive remounts
mas não reloads) nunca era instanciado.

**Decisão.** O `SoftphoneWidget` é o único lugar da app que dispara
`useSoftphone.connect()` automaticamente — `useDealDial`, `DealCallButton`
e qualquer outro consumidor apenas leem o singleton via re-import do
módulo do hook. Critério de auto-connect: `useSession()` autenticado
+ `GET /api/sip-extensions/me/credentials` retornou 200. Operadores
sem ramal provisionado (404) não veem chip nenhum e nenhuma tentativa
de registro SIP é feita — UI permanece limpa pra quem não usa softphone.

**Forma do componente.** Chip flutuante `fixed bottom-4 right-4 z-[60]`
seguindo o padrão estabelecido por `UpdateAvailableBanner` (mesmo z,
lado oposto pra não colidir). Três estados visíveis quando idle (verde
"Softphone ativo", amarelo "Conectando", vermelho com erro + reconectar).
Painel expandido `w-[280px]` quando há chamada — necessário pra atender
inbound e expor mute/hold/encerrar (sem isso seria impossível receber
chamada). Inclui suporte a inbound mesmo o operador planejando só
outbound — incremento marginal de código e o backend já suporta `newRTCSession`
remote sem auto-answer.

**Alternativas descartadas.**
- *Auto-connect direto no layout via hook*: `(app)/layout.tsx` é Server
  Component; misturar lógica client pesada nele dilui responsabilidade
  e bloqueia o pre-render. Widget client isolado é a contraparte natural.
- *Auto-connect dentro do `useSoftphone`*: tornaria o hook não-idempotente
  (chamadores acidentais disparariam registros) e quebraria o padrão
  React (hooks sem side-effects implícitos no render).
- *Chamar `connect()` apenas no form Api4Com após sucesso*: resolveria
  o caso de uso de conexão inicial, mas F5 continuaria quebrado. O
  widget global resolve os dois — o `onSuccess` do form continua
  invalidando o query de credenciais (pra disparar o auto-connect
  declarativamente) e chama `connect()` defensivamente.
- *UI invisível (só auto-connect)*: descartada pelo usuário após
  análise — sem indicador, falha de registro SIP só seria descoberta
  ao tentar ligar, péssima UX em produção.

**Impacto.**
- `DealCallButton.canDial` agora vira `true` automaticamente após login,
  sem ação do operador — telefonia "just works" se o ramal foi provisionado.
- `connectApi4Com` no form invalida a query `["softphone","credentials"]`
  e chama `softphone.connect()` no `onSuccess` pra registrar SIP sem F5.
- Carga adicional: 1 query (`/me/credentials`) por sessão autenticada
  + 1 conexão WebSocket persistente pra SIP. Cache 5min, sem refetch
  on focus. Sem ramal provisionado, zero overhead (early-return no widget).
- Componentes auxiliares (`Api4ComConnectForm`, `ExtensionSettingsForm`,
  `ProviderConfigForm`, `DealCallButton`, `CallHistoryList`, `CallHistoryFilters`)
  continuam importados por subpath direto (`@/features/softphone/components/<arquivo>`).
  Só `SoftphoneWidget` é barrel-exported via `@/features/softphone/components`.

---

### 2026-06-15 — Faxina total: remoção de `app/old/` e finalização da migração v1 → v2 [DECISÃO — agente OPUS/SONNET]

**Decisão.** A pasta `app/old/` foi inteiramente removida. As 7 rotas que não tinham
equivalente v2 ("órfãs") receberam rotas canônicas em `app/(app)/`. Os 14 componentes
legados cross-importados foram movidos para `src/features/legacy-v1/`. O `DashboardShell`
e o `SIDEBAR_ROLE_MATRIX` de `nav-visibility.ts` foram removidos (órfãos).

**Redirects.** `next.config.ts` recebeu redirects permanentes `/old/:path*` → `/:path*`
(com mapeamentos especiais para `/old/tasks` → `/activities` e `/old/leads/:id` → `/pipeline/:id`).
O middleware foi atualizado para liberar `/old/*` antes da checagem de auth (para que o
redirect do Next.js ocorra sem loop).

**Gaps documentados.**
- `/analytics`, `/analytics/inbox`, `/developers` **não** foram adicionados ao `SIDEBAR_CATALOG`
  (requer sincronização com o catálogo backend read-only). Acessíveis por URL direta.
- O erro TypeScript em `features/legacy-v1/settings/message-models/flows-id.tsx` (linha 151,
  `FlowDefinitionInputField` shape) é **pré-existente** e não bloqueia o build (`ignoreBuildErrors: true`).
- `ChatWindow` integrado em `/pipeline/[id]` carrega a primeira conversa do contato; a binding
  completa (draft de IA, notas, timeline) fica disponível via `/inbox` por enquanto.

**Por quê.** Elimina o dual-routing (v1 + v2 rodando em paralelo), simplifica o bundle,
unifica a navegação no NavRailV2 e remove a penalidade de performance do `DashboardShell`
legado (1350 LOC de JSX, framer-motion, múltiplos useQuery no mesmo componente).

---

### 2026-06-15 — Diretório v2: edição na linha + vínculo contato↔empresa

**Decisão.** As listagens v2 `/contacts` e `/companies` (`app/(app)/contacts/client-page.tsx`
e `.../companies/client-page.tsx`) ganharam uma coluna **"Ações"** com botão
de editar por linha, abrindo `EditContactDialog` / `EditCompanyDialog` (mesmo
padrão visual dos diálogos de criação, via `createPortal`). Antes só havia o
lápis no hover do nome, que apenas navegava para o detalhe — não dava para
editar a partir da lista.

**Vínculo de empresa.** Novo `CompanyPicker` (combobox com busca via
`useCompanies`, com opção de "remover vínculo") foi adicionado tanto na
criação quanto na edição de contato. Envia `companyId` no corpo do
`POST/PUT /api/contacts[/:id]` — o backend já suportava connect/disconnect
no Prisma. **Por quê pela ótica do contato:** a relação é 1 contato → 1
empresa (`Contact.companyId`), então o lado natural do vínculo é o contato.
O picker só lista empresas da própria org, mantendo o vínculo restrito ao
tenant.

---

### 2026-06-15 — RBAC: função híbrida, paridade de grupos e canal por papel [DECISÃO — agente OPUS]

**Decisão.** Três frentes de RBAC, todas **não-quebráveis** para orgs que já
rodam o CRM (ex.: DNA na `main`):

1. **Função híbrida (Equipe).** O seletor de função em `/settings/team` deixa
   de usar Admin/Gerente/Membro fixos: mantém **ADMIN como único preset** e o
   restante vira **roles customizadas** (atribuídas via `UserRoleAssignment`).
   Novo `PUT /api/users/[id]/primary-role`. O legado `User.role` continua no
   banco como fallback no `loadAuthzContext` — por isso nada quebra. Guard
   impede rebaixar o **último ADMIN** da org.

2. **Paridade de grupos.** O `group-permissions-editor` passou a usar o
   **catálogo completo** de permissões (igual às roles); recursos com
   responsável usam níveis (Negado/Resp./Equipe/Todos), o resto usa
   Negado/Liberado. Membros podem ser adicionados **já na criação** do grupo
   (`memberIds`).

3. **Canal por papel.** `channel.{view,send}` ganhou o eixo `roles[roleId]`
   além de `users[userId]`. Resolução **aditiva**: o acesso passa se QUALQUER
   regra (do usuário OU de uma role dele) permitir; sem regra alguma →
   liberado (comportamento anterior preservado). Editor no `RoleEditor`
   ("Canais deste papel") + `GET/PUT /api/roles/[id]/scope-grants`.
   Enforcement só roda com a flag `rbac_granular_scope_v1` ligada.

Commits: back `58beaa2`/`87001b3`, front `33586b0`/`9d1ef0c`.

---

### 2026-06-14 — Produto: tipo binário (Produto/Serviço) + fluxo guiado pós-wizard [DECISÃO — agente OPUS]

**Decisão.** (1) Na **criação** de produto, o seletor de tipo deixa de expor os
4 `ProductKind` (Físico/Serviço/Curso/Vaga) e passa a oferecer apenas a
distinção genérica **Produto** (`kind=PHYSICAL`) × **Serviço** (`kind=SERVICE`).
"Vaga" e "curso" deixam de ser *tipo* — passam a ser expressos pelas
**capacidades do catálogo** (`allocation=seats`, `fulfillment=recruiting/enrollment`,
…) ao qual o produto é vinculado. (2) Ao **finalizar o wizard de catálogo**, o
`CatalogWizard` agora devolve o id do catálogo criado (`onDone(createdId)`) e a
`CatalogsManager` abre direto o **"Novo produto"** já vinculado a ele
(`ProductDialog initialCatalogId=...`) — fluxo guiado "criou catálogo → cadastra
o 1º item".

**Por quê.** O catálogo já migrou pro modelo de capacidades, mas o diálogo de
produto seguia no `ProductKind` antigo, com blocos hardcoded por tipo (turmas de
curso, processo seletivo de vaga). Isso duplicava a modelagem e confundia: o
usuário já declara "vagas" via capacidade do catálogo e o produto pedia o tipo
"Vaga" de novo. A simplificação alinha as duas pontas e deixa a especialização
vir de um único lugar (capacidades).

**Compatibilidade (sem perda de dados).** `COURSE`/`JOB_OPENING` continuam em
`types.ts` e seus blocos só renderizam **na edição** de produtos legados; o tipo
é imutável após a criação, então editar um produto antigo mostra o tipo como
*chip read-only* (ex.: "Curso") e preserva os blocos. Backend (`type`+`kind`)
inalterado. Pendente (follow-up): a **lista** de produtos ainda mostra
filtros/coluna "Físico/Curso/Vaga" do modelo antigo.

**Validado.** E2E: criar catálogo → abre "Novo produto" vinculado, só com
Produto/Serviço; editar produto `SERVICE` legado → chip read-only "Serviço".

---

### 2026-06-14 — `DropdownGlass` dentro de modais: portal para a top-layer do `<dialog>` [DECISÃO — agente OPUS]

**Decisão.** O `DropdownGlass` (Radix DropdownMenu) passou a portar seu menu
para **dentro do elemento `<dialog>`** quando renderizado dentro de um modal,
em vez do `document.body` padrão. Mecanismo: novo contexto
`components/ui/modal-portal-context.tsx`; o `DialogContent` publica seu nó
`<dialog>` (via `useState` no `ref` callback) num `ModalPortalContext.Provider`;
o `DropdownGlass` lê `useModalPortalContainer()` e passa em
`DropdownPrimitive.Portal container={...}`. Fora de modal o valor é `null`
(portal no body, comportamento inalterado).

**Por quê.** O `Dialog` usa `<dialog>` nativo com `showModal()`, que cria uma
*top-layer* real + `::backdrop`. O Radix porta para o `body` (fora da
top-layer) → o menu ficava **atrás do backdrop**, invisível e com os cliques
**interceptados pelo `<dialog>`** (confirmado: "`<dialog>` subtree intercepts
pointer events"). Isso era uma **regressão da Fase 4**, quando troquei
`SelectNative` (popup nativo, desenhado pelo SO acima do `<dialog>`) por
`DropdownGlass` em `schema-fields.tsx`. Resultado prático: no wizard de catálogo
não dava pra escolher o **Modo** da capacidade (ex.: `allocation` → "Vagas /
lugares"), a Política de override nem os enums — travando o caso de uso de
**vagas de estágio**. A correção é geral: vale para todos os modais
(`product-dialog`, `add-deal-dialog`, `agent-wizard`, `task-dialog`, …).

**Validado.** E2E no navegador: criar catálogo "Vagas de Estágio" → trocar
`allocation` para `seats` (Total de vagas=10) → `fulfillment` para `recruiting`
→ `POST /api/catalogs` `201` com `mode:"seats"`/`mode:"recruiting"` persistidos.

---

### 2026-06-14 — DS v2 no editor de Flow (rota legada) + tokens espelhados em `globals.css` [DECISÃO — agente OPUS]

**Decisão.** Refatorar visualmente o **editor de WhatsApp Flow**
(`app/old/settings/message-models/flows/[id]/client-page.tsx`) e a **modal "Novo
template na Meta"** (`app/old/settings/whatsapp-templates/client-page.tsx`) para
o DS v2 — sem tocar em rotas, fetchers, mutations ou schemas. `SelectNative`
(proibido pelo `.cursorrules`) foi trocado por `DropdownGlass`; paleta nativa
(`slate/amber/emerald/indigo` + `border-border/bg-card/bg-muted/text-*-foreground`)
trocada por tokens DS v2.

**Problema estrutural resolvido.** Os tokens DS v2 (`--brand-primary`,
`--text-*`, `--glass-bg-base`, `--color-warn`, `--color-enterprise-bg` etc.)
vivem em `styles/globals-v2.css`, que **só é importado pelo grupo `(app)`**. O
editor de Flow e a aba WhatsApp são alcançados pela rota legada `/old/...`
(`DashboardShell` + `next-themes` `.dark`), que carrega apenas `globals.css` —
onde esses nomes **não existiam**. Sem eles, `DropdownGlass` e o chrome glass
ficariam sem cor, e o dark mode (que usa `.dark`, não `.v2-dark`) quebraria.

**Como.** Bloco **aditivo** desses tokens + variáveis isoladas do canal
(`--wa-*`, para o mock do WhatsApp) adicionado a `globals.css` em `:root`
(light) e `.dark` (dark), espelhando os valores de `globals-v2.css`. São nomes
novos → zero regressão nas páginas legadas (que não os usavam) e o hub passa a
renderizar igual nos dois shells. `--wa-*` também espelhado em `globals-v2.css`
(`:root` + `.v2-dark`) para a modal que roda na rota `(app)`.

**Trade-off.** Duplicação de definição de tokens entre os dois arquivos CSS.
Aceito porque unificar os dois sistemas de dark mode (`.dark` vs `.v2-dark`)
seria mudança de arquitetura fora do escopo "apenas visual". Valores espelhados
para que, se ambas as classes coexistirem numa rota v2, o resultado seja
idêntico.

**Nota.** `npm run ds:check` já falha no HEAD por drift pré-existente
(`hexInStyle` 369→374) e **exclui `src/app/old/**`** do scan — portanto estas
mudanças não afetam o ratchet (verificado via `git stash`).

---

### 2026-06-13 — Refatoração visual do hub "Modelos de mensagem" (4 abas) fiel aos mockups DS v2 [DECISÃO — agente OPUS]

**Decisão.** Refatorar somente a **camada de apresentação** das 4 abas de
`/settings/message-models` (overview, internos, whatsapp, flows) para os mockups
`settings-message-templates*.html`, **sem tocar em contratos de dados** (mesmas
queries/mutations React Query, diálogos de criação/edição/preview e gating por
permissão preservados).

**Ponto estrutural:** criei o módulo compartilhado
`app/old/settings/message-models/hub-ui.tsx` com os blocos visuais reusáveis
(`HubStatGrid`/`HubStat`, `HubCallout`, `HubTabBar`, `HubToolbar`, `HubChip`,
`HubPanel`, `HubSubHeader`). As 3 telas (hub + `templates` + `whatsapp-templates`
embeds) consomem esse módulo, garantindo consistência 1:1 com os mockups e
evitando divergência de estilos. O chrome (nav-rail + page header) continua vindo
do `SettingsV2Shell`; os mockups só contribuem com stats/callouts/tabs/toolbar/
painéis.

**Contadores das abas/stats** passaram a ser derivados das queries do hub
(`templates`/`whatsapp-flow-definitions` agora sempre habilitadas por serem
locais e baratas; lista Meta segue só na overview por ser externa). Aba Flows
ganhou ação de excluir reusando `DELETE /api/whatsapp-flow-definitions/[id]`.

**Tokens:** adicionei ao `globals-v2.css` (`@theme`) as variантes que faltavam e
são usadas pelos callouts/badges dos mockups: `--color-warn`, `--color-warn-bg`,
`--color-warn-border`, `--color-danger-bg`, `--color-info-bg`, `--color-info-border`.
Warnings de shorthand Tailwind permanecem (padrão do repo).

---

### 2026-06-13 — Wizard de Catálogo por Capacidades (Fase 4) com sub-perguntas dirigidas por JSON Schema [DECISÃO — agente OPUS]

**Decisão.** Nova feature `features/catalogs-v2` + rota `(app)/settings/catalogs`
(grupo "CRM & Dados" do settings-nav, `catalog:view`). O wizard faz **perguntas
de negócio** (não tipos de produto) e cada "sim" liga uma capacidade.

**Ponto-chave de agnosticismo:** as sub-perguntas de cada capacidade são
**renderizadas dinamicamente a partir do JSON Schema** servido por
`GET /api/capabilities` (`schema-fields.tsx`): enum→select, boolean→switch,
number/integer→input numérico, string→input texto. Consequência: **capacidade
nova aparece no wizard sem tocar a tela** — só o backend (registro Fase 0)
muda. A única parte de apresentação acoplada por capacidade é o texto da
pergunta de negócio (`BUSINESS_QUESTION`), com fallback no `label` do registro.

**Fluxo:** 3 passos (Início: nome/descrição + escolher template opcional →
Capacidades: cards com toggle + sub-perguntas → Revisão: chips das capacidades).
Templates carregados de `GET /api/catalog-templates` pré-marcam respostas (nunca
bloqueiam). Lista de catálogos com ação "salvar como template" e excluir
(default protegido). Hooks em `apiUrl()` + React Query. DS v2 (tokens, Tabler,
glass). Build verde; warnings de shorthand Tailwind são o padrão do repo.

**Desvio do PRD registrado:** o PRD sugere gerar a UI via v0 (MCP). Construí
direto em DS v2 para entregar o wizard testável sem o roundtrip do v0; refinar
via v0 depois é opcional.

---

### 2026-06-12 — Config de campos personalizados inline (estilo Kommo) — Fase 1

**Decisão.** Trazer a configuração de campos personalizados para **dentro** do
`DealDetailPanel` e do `ContactAside` via uma seção/aba **"Configurações"**,
inspirada no Kommo (dentro do lead há uma aba que configura e posiciona os
campos). **Fase 1 é frontend-only, sem migration.**

**Escopo Fase 1 (definido com o usuário):**
- **Reaproveita** o que já existe: CRUD de definições via `/api/custom-fields`
  (`entity=deal|contact`) e ordem/visibilidade de **blocos** via
  `/api/field-layout` + hook `useFieldLayout` (contextos `deal_panel_v2` e
  `inbox_lead_v2`, escopo **admin** = padrão da org).
- **Não** entra nesta fase: ordem por campo individual (precisa coluna `order`
  no `CustomField`), grupos/abas de campos, obrigatório-por-etapa e "Apenas API"
  (ficam para Fase 2/3, exigem schema/migration no backend).
- **Permissão:** a aba só aparece/edita para quem tem `settings:custom_fields`
  (admin/manager); demais usuários só **veem** os campos.
- A página global `/settings/custom-fields` **permanece** como gerenciador
  org-wide; o inline é um atalho contextual.

**Por quê.** A infra de definição + layout já existe; o gap é só de
*superfície* (UX). Fazer inline reduz atrito (configurar sem sair do negócio)
e evita duplicar backend. Manter Fase 1 sem migration respeita a restrição
atual de deploy do backend.

**Plano de implementação.** Componente reutilizável `FieldConfigPanel`
(`entity` + `context`), montado por slot no `DealDetailPanel` (gear na sidebar)
e no `ContactAside` (gear no header). Detalhe nos to-dos da sessão.

---

### 2026-06-09 — Editor de escopo por usuário (funis e canais)

**Decisão.** `UserPermissionsView` (sheet "Gerenciar" de cada usuário em
`/settings/permissions`) ganhou um editor de escopo: a quais **funis** o
usuário tem acesso e em quais **canais** pode **ver** / **enviar** mensagens.
Renderiza só quando `editable`.

**Por quê aqui.** O escopo é por usuário (não por papel/grupo), então o lugar
natural é a sheet do usuário, ao lado do editor de roles. Reaproveita
`/api/pipelines` e `/api/channels` para as opções.

**Modelo.** `null` = sem restrição (toggle "Todos"); array de IDs = restrito.
Lê/grava via `GET/PUT /api/users/[id]/scope-grants` (read-merge-write no
backend, não apaga regras de outros). Hooks novos em `features/permissions/hooks.ts`
(`useUserScopeGrants`, `useUpdateUserScopeGrants`, `useScopePipelineOptions`,
`useScopeChannelOptions`). `["*"]` vindo do backend é tratado como "Todos".

**Enforcement é no backend** (flag `rbac_granular_scope_v1`); a UI só
configura. Detalhes do modelo em `backend/AGENT.md` (mesma data).

---

### 2026-06-10 — /settings/permissions unificada (sem tabs)

**Decisão.** A tela `/settings/permissions` deixou de usar `Tabs`
(Roles / Grupos / Usuários) e passou a um **layout único** que mostra tudo
ao mesmo tempo: grid `xl:grid-cols-[minmax(0,1fr)_360px]` com **Usuários**
na coluna principal (o `UsersTab` intacto: busca + filtros + lista + sheet)
e um **trilho lateral** com dois cards empilhados — **Roles** (presets do
sistema + customizados, navega para a página dedicada do editor) e
**Grupos** (abre o `GroupEditor` em Sheet). Abaixo de `xl`, empilha.
Blueprint gerado no v0 MCP (model v0-max), adaptado ao DS v2 em Tailwind +
tokens (`--glass-*`, `--text-*`, `--brand-*`, `font-display`, ícones
`@tabler/icons-react`).

**Por quê.** Trocar de tab pra cruzar usuário ↔ role ↔ grupo era atrito no
fluxo de administração. Com tudo na mesma tela o admin vê o catálogo de
roles/grupos enquanto gerencia usuários. **Nenhuma rota de backend mudou** —
só os mesmos hooks (`useRoles`, `useGroups`, `useUsers`) reorganizados.
`RolesTab`/`GroupsTab` (funções locais antigas do client-page) foram
substituídas por `RolesCard`/`GroupsCard` com header próprio + botão "Novo".

**Ajustes 2026-06-11.** Ícone da tela passou de engrenagem para escudo
(`SettingsV2Shell` ganhou prop opcional `icon`, default = engrenagem). Os
cards de Roles e Grupos saíram do trilho lateral e ficam **sempre abaixo**
dos usuários (grid `md:grid-cols-2`, nunca migram pra lateral). Cards usam
`bg-white` (padrão "card branco" do dashboard) com hover/badges em tom
neutro (`black/[0.04-0.05]`) por causa do fundo branco. **Rótulo:** o card
"Roles" é exibido como **"Regras"** (e a página do editor como "Nova/Editar
regra"); o entity/rota/hook continua sendo role — mudou só o label. "Grupos"
permanece "Grupos".

---

### 2026-06-10 — Matriz de permissões em grid de cards (full-screen real)

**Decisão.** Dentro do `RolePermissionsEditor`, a lista vertical de recursos
(coluna única) virou **grid responsivo de cards**
(`grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3`) nos dois modos (Simplificado e
Granular). Cada recurso é um card próprio (`rounded-lg` + `glass-bg-base`):
no modo Simplificado o segmented de 4 níveis ocupa a **largura total do card**
(`flex-1` por botão); no Granular o card traz ícone + contador + "tudo" +
expandir. O wrapper da página perdeu o `max-w-[1400px]` (agora `w-full`).

**Por quê.** Mesmo com a coluna direita larga, as linhas single-column
deixavam um vão horizontal grande (label à esquerda, controle à direita). O
grid de cards preenche a tela de fato e mantém densidade/legibilidade. Em
telas estreitas degrada para 1 coluna sem quebrar. `items-start` evita que
um card expandido estique os vizinhos da mesma linha.

---

### 2026-06-10 — Editor de role: Sheet → página dedicada full-screen (2 colunas)

**Decisão.** A edição/criação de role saiu do `Sheet` lateral (560px, que
cortava a matriz) para a rota dedicada
`/settings/permissions/roles/[roleId]` (`roleId="new"` = criação). O
layout segue o blueprint gerado no v0 MCP (chat tqb…), adaptado ao DS v2
em Tailwind + tokens: grid `lg:grid-cols-[320px_minmax(0,1fr)]` com
**coluna esquerda fixa** (`sticky`) de identidade (ícone, nome, descrição,
resumo de contagem, ações Salvar/Cancelar/Excluir) e **coluna direita
larga** com o `RolePermissionsEditor`.

**Por quê.** A matriz de permissões (segmented de 4 níveis + grid 2-col de
settings) precisa de largura; num Sheet estreito ficava espremida. Página
dedicada dá URL própria (deep-link, refresh, botão voltar do browser) e
espaço real. Grupos seguem no Sheet por ora (escopo do pedido foi role).

**Notas de integração.** `SettingsV2Shell` ganhou props opcionais
`backHref`/`backLabel` (default `/settings`) para o "Voltar" apontar para
`/settings/permissions`. O `RoleEditor` virou full-page (não é mais usado
em Sheet). O `RolePermissionsEditor` permaneceu intacto (header/toggle/
settings/footer internos) — só foi reposicionado na coluna direita.

---

### 2026-06-10 — Editor de permissões em 2 modos (níveis + granular) com `level-matrix`

**Decisão.** A matriz de permissões do RoleEditor (`/settings/permissions`)
foi substituída pelo `RolePermissionsEditor` (UI gerada via v0 MCP, adaptada
ao DS v2), com a lógica de negócio isolada em
`src/features/permissions/level-matrix.tsx` — único dono de `LEVELS`,
`actionTier()`, `applyLevel()`, `levelOf()`, `deriveNav()` e
`withDerivedNav()`.

**Por quê.** O modo "Simplificado" (Nenhum · Ver · Operar · Total) precisa de
uma classificação estável de actions por tier. Em vez de hardcodar listas na
UI, o tier é resolvido por: campo explícito `ActionDef.tier` (novo, opcional)
> heurística (`view`=1; `destructive`/`transfer_owner`/`*_others`=3; resto=2).
Assim, novas actions do catálogo backend caem num tier razoável sem mudança
no frontend.

**Derivação de `nav:*`.** No modo simplificado, `nav:*` nunca é editado
direto — `withDerivedNav()` recalcula a partir do `:view` de cada módulo
(espelha `requiredPermission` de `sidebar-catalog.ts`). Mapeamentos sem
módulo 1:1: `nav:dashboard` = acesso básico (sempre que há ≥1 permissão),
`nav:logs` ← `report:view`, `nav:widgets` ← `distribution:view`. No modo
granular, `nav` aparece como seção editável normal.

---

### 2026-06-02 — Migração do novo design (frontend novo → branch `feature/migracao-novo-design`)

**Decisão.** Trazido o estado completo do frontend novo
(`marketingeduit-rgb/frontend_crm`, HEAD `a7b4aeb`) para a branch
`feature/migracao-novo-design` deste repositório via **fast-forward merge**,
preservando os 119 commits originais. Sem migração parcial arquivo-a-arquivo.

**Contexto.** Análise de `git merge-base` provou que o HEAD deste repo
(`8e31ce9`) é **ancestral direto** do HEAD do frontend novo — os repos não
divergiram. O novo = este repo + 119 commits (236 arquivos, +18.178/−1.882).
Logo não há conflito possível e toda a lógica de negócio antiga já está
preservada na ascendência. As mudanças incluem reestruturação de rotas
(`/v2/*` → raiz `(app)/*`; v1 arquivada em `/old/*`), design system
glassmorphism + dark mode, novos componentes CRM, `next.config` (rewrites
`afterFiles` + redirects `/v2`→raiz) e `middleware`. Única dependência nova:
`@xyflow/react`.

**Alternativas descartadas.** (1) Migração seletiva arquivo-a-arquivo —
descartada: a mudança é uma reestruturação acoplada (rotas + middleware +
settings-nav + redirects + design tokens); migrar parcial quebraria imports e
roteamento. (2) Squash em 1 commit — descartada a pedido: preferiu-se
preservar histórico/autoria.

**Preview/mock do v0.dev.** Mantido, pois é **inerte em produção**: só ativa
com `NEXT_PUBLIC_PREVIEW_MODE=true` (env) ou em hostname `.v0.dev`/
`.vusercontent.net`/`.v0.app`/`.v0.build` (runtime). NUNCA casa `localhost`
nem o domínio de produção (Easypanel). Em dev local normal e em produção o
middleware segue exigindo sessão NextAuth e as chamadas batem no backend real
via rewrite `/api/*`. Os mocks (`src/lib/preview-mocks.ts`) só são instalados
pelo `preview-mocks-installer` quando `isPreviewMode()` é verdadeiro.

**Impacto.** Branch não mergeada na `main` (validação manual pendente pelo
dono do repo). Env real apenas em `.env.local` (gitignored) / Easypanel —
nenhum segredo commitado.

---

### 2026-05-29 — Hotfix: hooks do slash command antes do early return

**Bug.** Versão inicial colocou `useQuery(contactDetail)`, `useMemo`,
`useCallback`, `useSlashMenu` **depois** do
`if (!conversationId) return null;` no `ChatWindow`. Resultado:
quando o operador selecionava uma conversa (transição
`conversationId: null → string`), o número de hooks chamados aumentava
entre renders e o React quebrava com:

> Rendered more hooks than during the previous render.

A tela de erro substituía o inbox inteiro.

**Fix.** Movido todo o bloco (incluindo `composeDisabled`) para ANTES
do early return. Adicionado comentário no código avisando do risco.
Regras das Hooks: **nenhum hook pode ficar depois de qualquer return
condicional**.

---

### 2026-05-29 — Atalho "/" no composer do inbox (slash command)

**Decisão.** Composer do inbox (`src/components/inbox/chat-window.tsx`)
agora abre um **menu de comandos** ao detectar `/` no início do draft
ou após whitespace. O menu lista, em uma única visão filtrável, três
fontes de mensagem pronta:

  1. **Respostas rápidas** (`/api/quick-replies`) — texto curto inserido
     direto no draft.
  2. **Modelos internos** (`/api/templates`) — texto livre + variáveis
     dotted-path interpoladas client-side via
     `interpolateInternalTemplate` (catálogo de
     `src/lib/internal-template-variables.ts`).
  3. **Templates WhatsApp Meta** (`/api/whatsapp-template-configs/agent-enabled`) —
     reusam o `pendingTemplate` flow já existente (preview + variáveis
     Meta + envio via Cloud API), porque o canal exige modelo aprovado.

Implementação isolada em `src/components/inbox/slash-command-menu.tsx`
(componente visual + hook `useSlashMenu` + função
`detectSlashTokenAt`). O hook é o ponto único de orquestração:

  - **Detecção** do token "/" via scan da string em torno do cursor
    (whitespace ou início como delimitadores). Reabre/fecha
    automaticamente conforme o usuário digita/apaga.
  - **Lazy fetch**: só dispara as 3 queries quando o menu abre
    (`enabled: open`), com `staleTime` de 60s — evita N requests
    paralelos enquanto o operador apenas digita.
  - **Teclado**: expõe `onKeyDown(event)` que retorna `true` quando
    consumiu Up/Down/Enter/Esc/Tab. O composer chama isso ANTES dos
    handlers de envio, garantindo que o Enter no menu seleciona em vez
    de mandar mensagem.
  - **Aplicação**: substitui exatamente o range `/...query` no draft
    pelo conteúdo (interpolado quando interno) e move o cursor para o
    fim. Pra Meta templates, apaga o `/...` e dispara
    `setPendingTemplate(...)` (reuso 100%).

Contexto de interpolação (`InternalTemplateContext`) montado a partir
de:
  - `getContact(contactId)` cacheado por 5 min — traz nome/telefone/
    email/CPF/tags/deals do contato.
  - Primeiro deal aberto (`contactDetail.deals[0]`) — title/value/
    stageName/productName.
  - `session.user` — atendente logado.

**Por que unificar quick-replies + internos + Meta numa lista só?**
O operador raramente sabe (e não devia se importar) qual é a fonte de
um atalho na hora do envio. Um único `/` reduz cliques e elimina o
"qual menu eu abro?". As fontes são distintas pelo ícone/badge no
item, mas o disparo é idempotente do ponto de vista da UX.

**Por que não reabrir o `TemplatePicker` antigo no `/`?** Esse picker
faz fetch de `/api/whatsapp-template-configs/agent-enabled` mas não
inclui internos nem quick-replies. O novo menu o complementa sem
substituir — o `TemplatePicker` continua acessível pelo botão
"Templates" do `AttachPopover` (operador que quer só templates Meta
ainda tem o caminho dedicado).

**Compat retroativa.**
  - `pendingTemplate` flow (templates Meta com botões/variáveis) **não
    foi tocado**. Slash menu apenas dispara `setPendingTemplate` —
    todo o resto (preview, painel de vars, envio) é o caminho atual.
  - Quick replies, emoji, file attach, schedule, tasks, signature
    toggle, nota interna, mode `compactChrome` (DealWorkspace) — todos
    intactos.
  - Slash menu é **desligado automaticamente** em modo nota, com
    anexo pendente (`pendingFile`), ou quando o composer está
    desabilitado por sessão expirada (Meta 24h).
  - Detecção exige `/` no início ou após whitespace — `https://`,
    `path/to/file`, `xx/yy` no meio do texto não disparam o menu.

**Achados da revisão de "executar automação".**

  - `/api/automations/[id]/run` (backend) valida tudo certo:
    `triggerType === "manual"`, `active === true`, contato pertence à
    org, deal (se passado) pertence ao contato. Erros viram 400/404/
    409/502 com mensagens claras.
  - `RunAutomationButton` (frontend) lista por
    `triggerType=manual&active=true&perPage=100`, mostra spinner
    inline durante o disparo, toast de sucesso/erro. Cache de 30s.
  - Está montado em 2 lugares: header da conversa selecionada
    (`/inbox`) e header do deal-detail (`/pipeline/.../deal/...`).
  - **Pequena inconsistência** (não bug): no inbox NÃO passa o
    `dealId` mesmo quando a conversa tem deal aberto associado.
    O backend tolera (worker resolve via `enrichContext`), mas se a
    conversa tem mais de um deal aberto, pode pegar o "errado".
    Pendente: enriquecer a UI com o deal ativo e repassar
    `dealId={selected.activeDealId}`.
  - **Sem mudanças neste turno.** Reportado para acompanhamento.

---

### 2026-05-29 — Templates internos: variáveis dinâmicas (catálogo + picker + interpolador)

**Decisão.** O form de templates internos passou a oferecer um **picker
de variáveis** (mesmo padrão visual do step Webhook) com tokens
`{{contato.*}}`, `{{negocio.*}}`, `{{atendente.*}}`, `{{data}}` e
`{{hora}}`. Catálogo único em `src/lib/internal-template-variables.ts`
exportando `INTERNAL_TEMPLATE_VARIABLE_OPTIONS`,
`INTERNAL_TEMPLATE_VARIABLE_GROUPS`, `interpolateInternalTemplate(content, ctx)`.

Componente do picker isolado em
`src/components/templates/internal-template-variable-picker.tsx` —
recebe `onSelect(token)` e chama o handler do form que insere na
posição corrente do cursor da textarea (uses `selectionStart/End` +
`requestAnimationFrame` pra restaurar foco).

**Por que dotted-path em vez de chaves planas (`{{nome}}`)?**
A entidade `Negócio` (deal) tem vários campos do mesmo "domínio" que o
contato, então `{{negocio.titulo}}` evita colisão com `{{titulo}}` do
contato e fica auto-explicativo. Mesma estratégia já adotada pelo
webhook (`automation-webhook-template.ts`) — mantém consistência de UX.

**Por que helper no frontend (e não no backend)?**
Os "templates internos" hoje são **só CRUD** (`/api/templates`) — o
backend não interpola nada porque ninguém consome o `content` em
runtime. Quando o composer do inbox passar a oferecer estes templates
como atalho, a interpolação acontece **client-side** antes de injetar
o texto no input (com dados já em mão: contato selecionado + deal
ativo + sessão do atendente). Isso evita rota nova no backend e dá
controle total de UX (operador pode editar o texto interpolado antes
de enviar).

**Compat retroativa.** Tokens desconhecidos (ex.: `{{1}}`,
`{{nome_cliente}}` legados) são **preservados como-está** no texto
após a interpolação — operador pode preenchê-los manualmente como
sempre fez. Adicionar variáveis ao catálogo no futuro nunca quebra
templates já salvos.

**Pendências (próximo passo).**
- Plugar `interpolateInternalTemplate` no composer do `chat-window.tsx`
  (atalho "Modelos internos" no menu) carregando `/api/templates` +
  injetando texto interpolado no input.

---

### 2026-05-29 — Templates internos: UI desacoplada da Meta

**Decisão.** O formulário em `/settings/message-models?tab=internal`
(arquivo `src/app/(dashboard)/settings/templates/client-page.tsx`) foi
limpo para tratar o registro como **mensagem interna do CRM** —
atalho de resposta usado nas conversas — e não como espelho de um
template aprovado na Meta/WABA.

Mudanças visuais:
- Header: "Modelos internos de mensagem" + descrição focada em
  variáveis dinâmicas (sem menção a "aprovado na Meta").
- Banner amarelo de aviso sobre `META_*` env vars **removido**
  (era ruído nessa seção; permanece relevante na aba "WhatsApp (Meta)").
- Listagem: badges de `PENDING_APPROVAL`/`APPROVED`/`REJECTED` (estados
  de Cloud API) **removidos**. Em seu lugar mostramos canal e categoria.
- Form: label do nome trocado de "Nome (igual ao template na Meta)"
  para "Nome do modelo"; placeholder/hint reescritos para reforçar uso
  interno; campo "Idioma" oculto da UI (mantido em estado fixo
  `pt_BR`/valor original do registro pra não quebrar o backend que
  exige `language`).
- Coluna "Estado / idioma" do overview substituída por "Detalhes"
  (categoria · canal) só na linha dos internos. Na linha dos Meta a
  semântica de status/idioma original foi mantida.

**Alternativa descartada.** Mudar o schema Prisma (drop dos campos
`status`/`language`/`category` de `MessageTemplate`) — invasivo, exige
migração no backend e quebra o reuso da mesma tabela pra templates
sincronizados com Meta no futuro. UI-only é suficiente: o frontend
continua mandando `language: "pt_BR"` por default e `status` é
preenchido pelo backend (`DRAFT`).

**Compat retroativa.** Templates antigos com `status` ou `language`
diferentes ainda renderizam (apenas omitem o badge de status na lista)
e ao salvar mantêm o `language` original (lido de `initial?.language`
no form).

### 2026-05-29 — Webhook step com headers/body customizados e picker de variáveis dotted-path

**Decisão.** O step "Webhook" das automações ganhou 3 campos novos
além de URL/Method: lista de **headers** (key/value), **body** (textarea)
e um **picker de variáveis** que insere tokens `{{caminho.aninhado}}` no
campo focado. Os tokens são resolvidos no backend pelo executor —
suportam dotted-path (`{{contact.adCtwaClid}}`,
`{{contact.adResolvedCampaignName}}`, `{{deal.stageName}}`,
`{{data.referral.headline}}`, etc.) sem mexer no `interpolateVariables`
legado dos templates de mensagem WhatsApp.

Catálogo único do frontend em
`src/lib/automation-webhook-variables.ts`:
- `WEBHOOK_VARIABLE_OPTIONS` agrupado por **Contato**, **Origem do
  anúncio (Meta CTWA)**, **Negócio**, **Conversa**, **Tags**, **Evento**.
- `DEFAULT_WEBHOOK_BODY_TEMPLATE` com snippet pronto pra n8n/Make.

Componente isolado em
`src/components/automations/webhook-step-config.tsx`
(`WebhookStepConfig`) — substitui o JSX inline antigo do
`step-config-panel.tsx` (24 linhas). Encapsula:
- Refs pra URL/body/header-values + estado `focusTarget` que rastreia
  qual campo recebe o próximo token clicado no picker.
- Conversão automática de headers do shape legado (objeto plano) pra
  o novo (`Array<{ key, value }>`) — config salvo antes desta entrega
  abre normalmente.
- Botão "Modelo padrão" que injeta o template padrão.

**Alternativas descartadas.**

- **Estender `VariableShortcutTextarea` (atalho `[`) com lista
  hierárquica.** Funcionaria só pro body, não pra URL/header
  (que usam `Input`, não `Textarea`). Picker dedicado abaixo dos campos
  é uniforme — qualquer um deles aceita inserção.
- **Editor JSON estruturado (key-value pairs em vez de textarea livre).**
  Mais "à prova de erro" mas inflexível pra n8n/Make que esperam
  shapes específicos. Textarea + interpolação de string preserva
  controle total pro operador (incluindo quem precisa enviar XML, form
  data, ou JSON com objetos aninhados que o key-value não modela).
- **Enviar templates como AST/JSON e renderizar no backend (`{ field:
  "{{contact.name}}" }`).** Evita parse de string mas exige UI mais
  complexa e perde a flexibilidade acima.
- **Mudar `interpolateVariables` legado pra aceitar dotted-paths.**
  Tem efeito colateral em todos os steps de mensagem (que
  intencionalmente só aceitam chaves planas via `__variables`). Helper
  novo `interpolateWebhookTemplate` é escopado ao webhook e isolado.

**Compat retroativa.** Configs antigas (só URL + Method, sem
`body`/`headers`) continuam funcionando: o backend cai no payload
legado (`{ event, contactId, dealId, data }`) quando `cfg.body` é
vazio/whitespace. Headers no shape de objeto plano também são aceitos
pelo `normalizeAndInterpolateHeaders`.

**Impacto.**

- Backend: novo arquivo `src/lib/automation-webhook-template.ts` no
  `backend_crm1` (`buildWebhookTemplateRoot`, `resolveDottedPath`,
  `interpolateWebhookTemplate`, `normalizeAndInterpolateHeaders`).
  `case "webhook"` em `automation-executor.ts` reescrito.
- Frontend: novo arquivo `src/lib/automation-webhook-variables.ts` +
  componente `WebhookStepConfig`. `step-config-panel.tsx` perdeu 24
  linhas inline e ganhou 1 linha de import.
- Default config do step webhook (em `automation-workflow.ts`) agora
  inclui `headers: []` e `body: ""` — não quebra steps antigos
  porque os campos extras são ignorados quando vazios.
- Sem mudança em rotas, schema Prisma, ou outras integrações.

---

### 2026-05-29 — Permissões CRM por usuário (override em `scopeGrants.crm.<action>.users[userId]`)

**Decisão.** Override **por usuário individual** em
`scopeGrants.crm.<action>.users[userId]: boolean` — não por papel.
Granularidade fina sem mexer no schema do banco nem no backend (PUT
`/api/settings/permissions` já aceita `scopeGrants` como JSON
arbitrário). 3 ações cobertas: `editLeads`, `runAutomations`,
`assignOwner`. ADMIN ignora a checagem (sempre `true`). Default `true`
quando ausente, pra preservar compat com instâncias que ainda não
configuraram nada.

Helper canônico em `src/lib/permissions.ts`:
- `canPerformCrmAction(action, userId, role, scopeGrants)` — gate de
  UI. ADMIN bypass; senão consulta `users[userId]` e cai no default.
- `readCrmActionGrantForUser(action, userId, scopeGrants)` — só lê o
  override (sem checar role). Usado pra renderizar o estado dos
  toggles na tela de permissões.
- `setCrmActionGrantForUser(scopeGrants, action, userId, enabled)` —
  merge imutável que preserva outros namespaces (`sidebar`, `inbox`,
  etc.) e outros usuários.
- `setCrmActionGrantsForUser(scopeGrants, userId, grants)` — variante
  pra aplicar várias ações ao mesmo usuário num único merge (usado no
  fluxo "Convidar membro").

Página `/settings/permissions` reorganizada em 3 seções:
1. **Ações por usuário** (novo) — tabela com 1 linha por usuário e 1
   coluna por ação (3 colunas), toggle por célula. Busca no topo
   filtra por nome ou email. Linhas de ADMIN ficam visíveis mas
   read-only (badge "Administrador" na coluna do nome).
2. **Visibilidade por papel** (legado preservado: `all` / `own`).
3. **Auto-atribuição** (legado preservado: botão "Atribuir para mim"
   da inbox).

Removido: textarea cru de `scopeGrants` JSON. A UI estruturada cobre
o caso comum (3 ações × N usuários); namespaces avançados
(`sidebar.routes`, `inbox.tabs`) seguem editáveis via API direta se
necessário.

`/settings/team` (dialog "Convidar membro") também ganhou as 3
toggles. Quando o admin marca/desmarca antes de criar, o fluxo é:
POST `/api/users` → pega `created.id` → GET grants atuais → PUT
`/api/settings/permissions` com merge dos novos overrides. Pula o
PUT quando todos os toggles estão `true` (default) ou quando o role é
ADMIN, pra não criar entradas redundantes. Falha do PUT mostra
toast de aviso mas **não** falha a criação do usuário.

**Contexto.** Operador pediu textualmente: "quero que seja por
usuário cadastrado na org, não geral igual está, então na tela de
permissões, é necessário aparecer os users do CRM". Versão anterior
desta decisão (toggles por papel MANAGER/MEMBER) foi descartada na
mesma sessão antes de chegar em produção.

**Alternativas descartadas.**

- **Custom Roles via tabela `Role` + `UserRoleAssignment`** (RBAC do
  backend já existe, ver `src/lib/authz/permissions.ts` no
  `backend_crm1`). Mais correto em termos de modelagem, mas exige
  endpoints novos no backend (`POST /api/roles`, `POST
  /api/users/:id/roles`), refactor do frontend pra "matriz user × role
  × permission", e migração de `User.role` enum. Operador pediu
  explicitamente "não precisa mudar a estrutura, por qual motivo está
  fazendo essa volta para adicionar só uma coisa nova?" — manter
  override em `scopeGrants` é minimalista e suficiente pras 3 ações.
- **Tabela nova `UserPermissionOverride(userId, key, allow)`.** Mesmo
  ônus de migration sem benefício imediato. Quando a matriz ficar
  densa o suficiente pra justificar índice próprio (~50 ações × 100
  usuários), volta-se nessa decisão.
- **Mover visibility/selfAssign também pra ser por usuário.** Operador
  disse "não precisa mudar a estrutura" — visibility/selfAssign
  continuam por papel (legado). Só as 3 ações novas são por usuário.
- **Default `false` (negar por padrão).** Quebraria o comportamento
  atual em qualquer instância que ligue este build sem migrar o JSON
  do backend. Default `true` mantém compat retroativa.

**Impacto.**

- Frontend: helper pronto (`canPerformCrmAction`) — **falta consumir
  nos componentes**. Próximo passo: trocar
  `canManageAssignee = role === "ADMIN" || role === "MANAGER"`
  hardcoded por `canPerformCrmAction("assignOwner", userId, role,
  scopeGrants)` em `inbox/client-page.tsx`,
  `pipeline/sales-hub-view.tsx`, `pipeline/deal-workspace/index.tsx`,
  `inbox/transfer-control.tsx`; e adicionar gates equivalentes nos
  botões de mover estágio (kanban) e "executar automação" (lista de
  automações). **Não fizemos isso ainda nesta entrega**.
- Backend: precisa **enforçar** as flags. Endpoint atual
  `/api/settings/permissions` já aceita o shape novo (`scopeGrants`
  arbitrário). Mas as rotas de mutação (`PATCH /api/deals/:id`,
  `PATCH /api/contacts/:id`, `POST /api/automations/:id/run`, `PATCH
  /api/conversations/:id` com `assignedToId`) ainda usam
  `requireAdminOrManager` ou checks similares. Refatorar pra ler
  `scopeGrants.crm.<action>.users[userId]` antes de cair no role.
- Sem mudança em `next.config.ts`, schema Prisma, ou contrato do
  endpoint de permissões.
- Sem mudança em `/api/users` POST: o invite continua aceitando
  `{ name, email, password, role }`; os toggles do dialog viram um
  PUT separado em `/api/settings/permissions` após o user ter id.

---

### 2026-05-27 — Exclusão em massa na lista de leads

**Decisão.** Adicionada barra flutuante de ações em massa em
`(dashboard)/contacts/client-page.tsx`. Quando `selected.size > 0`,
aparece no rodapé com "N selecionado(s)" + botões "Limpar" e
"Excluir". A mutation `bulkDeleteMutation` dispara DELETEs em
paralelo com concorrência limitada (5 workers) e agrega
sucesso/falha por id pra feedback diferenciado (`toast.success`
quando todos OK, `toast.warning` quando parcial, `toast.error`
quando nenhum saiu).

**Contexto.** Operador relatou: "essa página de contacts precisa
ter opção de excluir em massa, não tem essa opção". A
infraestrutura de seleção múltipla (checkbox no header + linha,
estado `selected: Set<string>`) já existia mas era usada só pra
destaque visual — não tinha botão pra agir nos selecionados.

**Alternativas descartadas.**

- **Endpoint `DELETE /api/contacts?ids=...` em massa no backend.**
  Mais eficiente (1 request, transação no banco), mas envolve
  endpoint novo e mudança no service. Como o caso de uso é
  pontual (operador limpando 10-50 leads de cada vez) e o DELETE
  individual já funciona, paralelizar 5x no front é suficiente.
- **Barra de ações no header em vez de flutuante.** Quebra menos
  o layout mas força scroll-pra-cima quando o operador seleciona
  itens da última página. Flutuante (`fixed bottom`) fica sempre
  visível, padrão de UX comum em listas (Gmail, Notion, Linear).

**Impacto.** Operador agora seleciona múltiplos leads e excluí
de uma vez com 1 confirmação. O endpoint individual continua
sendo a fonte da verdade — bulk delete só orquestra. Falhas
parciais ficam visíveis no toast (com contagem). Backend não
mudou.

---

### 2026-05-27 — Exclusão de contato sem bloqueio por `dealCount`

**Decisão.** Em `app/(dashboard)/contacts/client-page.tsx`, removido o
early-return com `toast.warning` quando `c.dealCount > 0`. O confirm
dialog agora avisa explicitamente que "os N negócios vinculados
permanecerão no kanban, porém sem contato associado" — operador segue
confirmando uma vez e a exclusão prossegue.

**Contexto.** Operador pediu: "quero excluir o lead independente se
tem lead ou não". Backend foi ajustado em paralelo (ver AGENT.md
backend). O bloqueio era frontal — frontend não chegava nem a chamar
o DELETE, mostrava warning amarelo. UX ficava confusa: operador via
"tem N negócios" mas não tinha caminho pra resolver na própria tela
de contatos.

**Alternativas descartadas.**

- Botão "Excluir + transferir negócios pra outro contato": resolve mas
  exige fluxo de seleção. Operador não pediu isso.
- Confirmar duas vezes (1ª: aviso, 2ª: confirma): atrito sem benefício
  prático — a confirmação já está sendo destrutiva ("Excluir" em
  vermelho).

**Impacto.** Operador consegue limpar leads imediatamente. Quem clica
"Excluir" no confirm agora vê os deals sumirem do contato (mas
permanecerem no kanban como "contato removido").

---

### 2026-05-27 — Condição "Tem a tag" + lista de automações em tabela

**Decisão.** Dois ajustes coordenados em automações:

1. **Condição de tag.** `automation-condition.ts` ganhou os ops
   `has_tag` / `not_has_tag` (espelhados do backend). Em
   `step-config-panel.tsx`: novos campos `contact.tags` / `deal.tags`
   nos `CONDITION_FIELD_GROUPS`, helper `opsForField` que filtra os
   operadores válidos pro campo selecionado (campos de tag → só
   `has_tag` / `not_has_tag` / `empty` / `not_empty`; demais campos
   escondem os ops de tag), e `TagPickerValue` puxando `/api/tags` pra
   listar as tags da org num dropdown. Trocar de campo dentro de uma
   rule reseta o op e o value se o op anterior não for válido pro
   novo campo (evita configs inválidas tipo "tags eq 5"). O resumo
   do nó (`summarizeConditionConfig`) ganhou formatação amigável pros
   ops de tag — "tem tag X" em vez de "contact.tags has_tag X".
2. **Lista de automações em tabela.** `automations/client-page.tsx`
   trocou o grid de Cards (2 colunas) por uma `Table` com colunas
   Automação / Gatilho / Passos / Atualizada / Status. O
   `ActiveSwitch` ficou na coluna Status pra toggle in-place sem
   abrir o detalhe — comportamento idêntico ao card anterior. Indicador
   de estado virou uma "bolinha" colorida ao lado do nome (verde =
   ativa, cinza = inativa).

**Contexto.** O operador pediu textualmente duas coisas:
- "Se tem TAG x adicionada ou não" como condição.
- "As automações ficarem em lista, estão em cards" (cards são pouco
  densos quando passam de ~6 automações).

**Alternativas descartadas.**

- **Filtragem por tag dentro do ConditionFieldPicker em vez de
  `opsForField`.** Manteria os 11 ops genéricos visíveis sempre e o
  usuário tentaria coisas como `tags = "VIP"` que silenciosamente não
  funcionariam (o evaluator espera array no left). Filtrar os ops no
  select é proteção UX direta.
- **Salvar o array completo de tags como rule.value.** Permitiria "tem
  qualquer uma destas tags" (OR), mas adiciona complexidade tanto no
  picker (multi-select) quanto no evaluator. Mantemos 1 tag por rule;
  pra "OU" o operador adiciona outra branch (o engine já suporta
  multi-branch nativamente).
- **DataTable virtualizada (TanStack Table) em vez da `Table`
  semântica.** Overkill — 100 automações por org no caso de uso real;
  paginação no servidor (já existente, `perPage=12`) resolve.

**Impacto.** Configurações de condition antigas funcionam intactas; o
novo op `has_tag` aparece nas opções, mas só dispara filtragem ativa
quando o campo selecionado é `contact.tags` ou `deal.tags`. A lista
em tabela é puramente cosmética — mesmas queries, mesmos endpoints.

---

### 2026-05-27 — Gatilhos de automação editáveis + filtros de pipeline/estágio

**Decisão.** Três mudanças coordenadas na parte de automações
(`src/components/automations/`):

1. **`trigger-config-fields.tsx` reescrito** com dropdowns reais de
   pipeline/estágio (puxando `/api/pipelines` via react-query) ao invés
   dos inputs de texto livre antigos. Os dropdowns são compartilhados
   por `stage_changed`, `deal_created`/`won`/`lost`, `contact_created` e
   `message_received`/`message_sent`. Quando o operador escolhe um
   estágio, o `pipelineId` correspondente é preenchido automaticamente
   pra manter os filtros consistentes.
2. **Nó do gatilho clicável** no canvas (`workflow-canvas.tsx` +
   `trigger-node.tsx`). Antes o `onNodeClick` filtrava o
   `TRIGGER_ID` e ficava inerte — o operador não descobria que dava pra
   editar. Agora dispara `onTriggerClick` (callback prop): no
   `/automations/new` volta pro passo 2 do wizard, no
   `/automations/[id]` abre o Config dialog (que já existia mas só era
   acessível via ícone de engrenagem). Pílula "Editar" visível no
   hover reforça a descoberta.
3. **`automation-workflow.ts`**: `defaultTriggerConfig` agora inclui
   `stageId` nos gatilhos suportados e `summarizeTriggerConfig` mostra
   o nome do estágio/pipeline (via lookup) no resumo do nó.
   `workflow-canvas.tsx` foi ajustado pra incluir nomes de pipelines
   no `stageNameLookup` (antes só tinha nomes de estágios).

**Contexto.** O operador relatou:
- "Não consigo editar depois de colocar o fluxo." Era falsa percepção:
  o `[id]` page já tinha um Config dialog (gear icon), mas o nó do
  gatilho no canvas era inerte, induzindo a achar que estava bloqueado.
- "Precisava ter gatilho de mensagem recebida em X estágio, quando lead
  e/ou contato for criado em X estágio." O backend já enriquecia o
  contexto, mas a UI só expunha um campo de canal. Os inputs de
  estágio existentes (em `stage_changed`) eram free-text — o operador
  precisava copiar UUIDs do banco.

**Alternativas descartadas.**

- **Página dedicada `/automations/[id]/edit` separada do detail.** Mais
  consistente com o resto do app mas exige duplicar o canvas + form +
  toda a lógica de save. O Config dialog atual já cobre os campos e
  evita esse retrabalho — só faltava torná-lo descobrível.
- **Inputs de UUID em todos os triggers (sem dropdown).** Mantém
  consistência com a UX antiga mas é hostil — UUIDs não são
  memorizáveis. Reutilizamos o padrão de dropdown que já existe no
  `step-config-panel.tsx` pra `move_stage`/`create_deal` (mesma query
  key `pipelines-for-trigger` pra aproveitar o cache do react-query).
- **Fetch de pipelines no parent e drilldown via prop.** Mais
  performático em teoria, mas o overhead extra é mínimo (cache de 60s)
  e o componente fica auto-contido — qualquer page nova que use
  `TriggerConfigFields` funciona sem setup adicional.

**Impacto.** Automações antigas continuam funcionando: os campos
`pipelineId`/`stageId` em `contact_created` e `message_*` são
opcionais (default `""` = não filtra). O canvas continua usando o
`stageNameLookup` legado pros nodes existentes (`move_stage`, etc.) —
só ganhou pipelines no mapa.

---

### 2026-05-22 — Seleção em massa no Kanban (compartilhada com a Lista)

**Decisão.** A seleção múltipla de deals e a `BulkActionsBar` que antes
existiam só na view Lista agora funcionam também no Kanban. O estado de
seleção (`selectedDeals: Set<string>` no `client-page.tsx`) é o MESMO
para ambas as views — seleções persistem ao alternar Lista ↔ Kanban. A
`BulkActionsBar` flutuante já era montada globalmente; só falta UI de
seleção no card do Kanban, que foi adicionada via checkbox `hover-only`
no canto superior esquerdo.

**Contexto.** Toda a infraestrutura assíncrona (BullMQ + `BulkOperation`
+ `BulkOperationProgressDialog`) já estava ligada à `BulkActionsBar` da
Lista. Restringir bulk operations à Lista era artificial — o Kanban é a
view mais usada do CRM e o usuário precisava trocar de view só pra
mover/etiquetar 50+ deals de uma vez. Mantemos drag-and-drop individual
intacto (uma das principais affordances do Kanban) e adicionamos
seleção como camada **aditiva**, não substitutiva.

**Como ficou estruturado.**

- `src/components/pipeline/kanban-card.tsx` — recebe `isSelected` +
  `onToggleSelect` opcionais. Adiciona `<input type="checkbox">` à
  esquerda do grip de drag (ocupa largura fixa pra evitar layout shift
  em hover). Visual: `opacity-0 group-hover:opacity-100` quando não
  selecionado, `opacity-100` permanente quando selecionado. Card
  selecionado ganha borda primary + ring sutil + bg `primary/5` (DNA
  visual consistente). `stopPropagation` em `onMouseDown` + `onClick`
  do checkbox/label garante que o evento não vaza pro card (abriria o
  `DealWorkspace`) nem interfere no `@hello-pangea/dnd`.
- `src/components/pipeline/kanban-column.tsx` — recebe `selectedDeals`
  + `onSelectionChange`. Calcula `selectedInColumnCount` (intersecção
  com os deals CARREGADOS na coluna). Header da coluna ganha um
  botão-ícone discreto à esquerda do nome da etapa: `Square` quando
  nenhum selecionado, `CheckSquare` quando todos da coluna marcados,
  toggle "selecionar todos N visíveis ↔ limpar todos da etapa". Quando
  há seleção parcial, um pill `primary/15` ao lado do contador total
  mostra `N selecionados` — feedback claro sem invadir layout.
- `src/components/pipeline/kanban-board.tsx` — passthrough de
  `selectedDeals` + `onSelectionChange` pras colunas. Zero alteração
  na lógica de DnD (drag individual + drag-to-delete intactos).
- `src/app/(dashboard)/pipeline/client-page.tsx` — REMOVIDO o
  `setSelectedDeals(new Set())` que limpava a seleção ao trocar pra
  Kanban (era workaround pra view sem suporte). Mantido o reset ao
  trocar pra Pipeline Ágil (saleshub), que é fila de atendimento e
  não tem checkbox.

**Alternativas descartadas.**

- **Modo "seleção" toggle global (estilo Trello).** Botão na toolbar
  ativa modo seleção; checkboxes aparecem em todos os cards; drag
  desabilita. Mais explícito mas com 2 cliques a mais (ativar +
  selecionar). Optei por `hover-only` (decisão do usuário) — mais
  enxuto pra o caso comum.
- **Shift+click pra range-select.** Recurso power-user clássico, mas
  como o Kanban tem deals em colunas distintas, "range" entre colunas
  ficaria ambíguo. Adiável.
- **Drag em massa (arrastar vários cards juntos).** `@hello-pangea/dnd`
  não suporta nativamente. Implementar exigiria custom drag preview +
  bloqueio do `Draggable` original em "ghost". Fora de escopo:
  bulk-move via `BulkActionsBar` cobre o mesmo caso de uso (mover N
  deals pra outra etapa) com fluxo assíncrono já testado.
- **Persistir seleção entre sessões (localStorage).** Inicialmente
  considerei. Mas como a seleção é volátil por natureza (depende dos
  deals visíveis no momento), persistir só geraria confusão com deals
  apagados/movidos. Sessão > sessão é o padrão correto.

**Impacto em outras telas.** Nenhum. A `BulkActionsBar` já estava
montada globalmente no `client-page` e agora atende as duas views
sem condicional adicional. O hook `useBulkOperation` e o
`BulkOperationProgressDialog` continuam idênticos.

---

### 2026-05-22 — UI de progresso de operações em massa (BulkOperation)

**Decisão.** Quando o backend de `POST /api/deals/bulk` (ação
`move_stage`) responde **202** com `{ operationId, total }`, o frontend
abre um `BulkOperationProgressDialog` que faz polling em
`GET /api/bulk-operations/[id]` via o hook `useBulkOperation` até o
status terminal (COMPLETED/PARTIAL/FAILED/CANCELLED). Para 200 (sync)
mantemos o toast original `"X negócios atualizados"`. Nenhum endpoint
do backend mudou de URL; apenas observamos o `res.status` para
discriminar `sync` vs `async`.

**Contexto.** O backend introduziu um worker dedicado (`leads-worker`)
que processa lotes grandes (>50 deals ou `async: true` explícito) em
segundo plano com persistência de progresso em Postgres
(`BulkOperation`). Sem UI, o usuário não tem retorno visual: o `fetch`
retorna 202 quase imediatamente e o board não muda até o worker
terminar (segundos a minutos). O polling no Postgres é mais simples
que SSE/WebSocket pra esse caso porque já temos `react-query`
configurado globalmente, a frequência (2s) é baixa, e o status fica
disponível mesmo se o user fechar a aba e voltar.

**Como ficou estruturado.**

- `src/hooks/use-bulk-operation.ts` — hook único, polling 2s com
  `refetchInterval` que se desliga automaticamente em status terminal.
  Reaproveita cache do react-query por `operationId`. Exporta os types
  canônicos (`BulkOperationStatus`, `BulkOperationStatusResponse`)
  alinhados ao shape do backend (não importa Prisma client no frontend).
- `src/components/pipeline/bulk-operation-progress-dialog.tsx` —
  componente glass reutilizável (qualquer feature que enfileire
  `BulkOperation` pode usá-lo). Recebe `operationId | null`, dispara
  `onFinished(data)` UMA vez ao terminar, e gera toasts apropriados
  (success/warning/error/info) conforme status final. Se o user fechar
  antes de terminar, mostra toast `"continua em segundo plano"`.
- `src/components/pipeline/bulk-actions-bar.tsx` — único ponto que
  consome o dialog hoje. A função `bulkAction()` agora retorna um
  union discriminado `{ kind: 'sync' | 'async' }` e o
  `onSuccess` da mutation decide entre toast direto ou abrir o modal.
  Caso 503 (Redis offline mas BulkOperation criada) também abre o
  modal — o primeiro poll já vai mostrar FAILED + razão.

**Alternativas descartadas.**

- **SSE/WebSocket pra progresso.** Mais reativo, mas exige novo
  endpoint no backend + tratamento de reconexão + `eventsource` lib.
  Polling de 2s é "good enough" pro caso de uso (operações típicas
  duram poucos segundos) e o React Query já cuida de pausar em
  background tab, cache, retry e dedup.
- **Componente "global" tipo `<BackgroundJobsProvider>` montado no
  layout do dashboard com lista persistente de jobs.** Plano legítimo
  pra fase 2 (centro de notificações, histórico de jobs), mas hoje só
  temos UM consumidor (a `BulkActionsBar`) e MUITAS feature flags
  ainda não decididas (mostra jobs de outros usuários? agrupar por
  tipo? push notification?). Manter o dialog local evita over-engineering.
- **Misturar progresso na `BulkActionsBar` existente (sem modal).**
  Conflita com seleção (a barra some quando `selectedCount=0` —
  isso acontece imediatamente no `onSuccess` async, então a barra
  desapareceria carregando o progresso "no nada"). Modal separado é
  mais limpo: a barra some, o user vê o modal acompanhando o trabalho.
- **Forçar `async: true` em TODOS os bulks (uniformizar fluxo).**
  Quebraria UX pra ações pequenas (3-5 deals) que hoje retornam em
  <200ms — pra elas o roundtrip extra do polling é pior que o toast
  direto. O threshold (>50 deals) do backend respeita isso.

**Impacto.**

- Zero mudança em `next.config.ts` (catch-all `/api/:path*` já cobre
  `/api/bulk-operations/[id]` e `/api/deals/bulk/custom-fields`).
- Zero mudança em `providers.tsx` (`QueryClient` global já existente
  serve o hook).
- O hook e o dialog estão prontos pra serem reusados quando a UI de
  bulk de campos personalizados (`POST /api/deals/bulk/custom-fields`)
  for implementada — basta `setProgressOperationId(resp.operationId)`.
- Operações de move_stage com até 50 deals continuam síncronas (toast
  imediato). Acima de 50, modal abre automaticamente.

---

### 2026-05-19 — Visual refresh glassmorphism via remap de tokens

**Decisão.** Reskin completo do CRM seguindo o design system
`design-system-crm.html` (glassmorphism-first, brand `#5b6ff5`, mesh
`#dde8f5 → #b8cfec → #e8d5f0`, Plus Jakarta Sans + DM Sans). O caminho
foi **trocar o conteúdo dos tokens** do `@theme` em
`src/app/globals.css` em vez de reescrever componentes. Como o app já
estava todo em Tailwind v4 + tokens semânticos (`bg-card`,
`bg-sidebar`, `border-border`, `--color-primary`, etc.), mudar o valor
das variáveis cascateou automaticamente para os 25+ primitivos em
`src/components/ui/` e para o resto do app sem tocar em lógica.

Mudanças concretas:
- Remap completo do `@theme` (brand, surfaces, borders, radius,
  sombras) + adição de tokens glass (`--glass-bg*`, `--glass-blur*`,
  `--glass-shadow*`) e utilities `.glass-strong`, `.glass-overlay`,
  `.glass-subtle`.
- `body { background: linear-gradient(...) ; background-attachment: fixed }`
  com o mesh — todo o app passa a ter o fundo glass por padrão.
- Polimento manual em ~8 componentes de alto impacto visual:
  `dashboard-shell` (aside, mobile bars, popovers), `Button`,
  `Card`, `Input`, `Badge`, `Dialog`, `PageHeader`, `Tabs`,
  `widget-card`, `kanban-column`, `kanban-card`, `conversation-list`,
  `conversation-header`. O `chat-window` se atualiza sozinho via
  `--chat-bubble-sent-bg` (gradient brand).
- `src/app/layout.tsx`: troca de `Outfit` (next/font) por
  `Plus_Jakarta_Sans` + `DM_Sans`. `themeColor` ajustado para
  `#dde8f5` para combinar com a barra de URL do Chrome Android.

**Contexto.** O usuário pediu uma grande atualização visual com a
restrição absoluta de "não mexer em endpoints, payloads, autenticação,
rewrites ou nada do backend". O projeto já tinha um design system
"Lumen" funcional baseado em tokens — reaproveitar essa infraestrutura
deu ~60% do impacto visual mudando 1 arquivo (`globals.css`) e os
outros 40% vieram de polimentos pontuais nos componentes mais
visíveis. Sem dependências novas (fontes via `next/font/google`,
zero pacote adicionado em `package.json`).

**Alternativas descartadas.**

- **Reescrever os componentes de UI usando classes Tailwind explícitas
  glass (ex.: `bg-white/40 backdrop-blur`).** Funcionaria, mas
  duplicaria informação que já mora nos tokens — qualquer ajuste
  futuro (ex.: trocar opacidade de 40% para 35%) viraria
  find-and-replace por dezenas de arquivos. Manter os tokens como
  fonte única significa que ajustes finos são one-liners.
- **Criar componentes novos (`GlassCard`, `MetricCard`, `LeadCard`).**
  O plano original sugeria, mas o sistema atual já tem `<Card>`,
  `<WidgetCard>`, `<KanbanCard>` etc. cumprindo esses papéis. Criar
  paralelos duplicaria abstrações e exigiria refatorar todos os
  consumidores. Polimos os existentes em vez disso.
- **Aplicar dark mode redesenhado com a mesma intensidade.** O design
  system fornecido é light-first. Mantivemos dark mode funcional (com
  remap dos tokens e gradient mesh escuro próprio) mas não há a mesma
  fidelidade visual — trade-off explícito documentado no plano.
- **Importar fontes só via `@import url(...)` em `globals.css`.**
  Funciona mas tem FOUT (Flash of Unstyled Text) em SSR. Usar
  `next/font/google` faz bundling local + preload + zero FOUT no
  primeiro paint. O `@import` ficou como fallback.

**Impacto.**

- Zero alteração em `next.config.ts`, `middleware.ts`, `src/lib/api.ts`,
  `src/lib/auth-public.ts`, `src/services/**`, providers, queries
  do react-query, payloads, ou qualquer chamada de rede. Verificado
  com `git diff` (mudanças concentradas em CSS + props de className).
- Build passou (`next build`) em 54 rotas com exit code 0; sem novos
  erros de TS/Tailwind. Warnings de `jose/CompressionStream` em Edge
  Runtime são pré-existentes (origem em `next-auth/jose`).
- Para introduzir novas telas: usar `<Card>`, `<Button variant="glass">`,
  `<Badge variant="lead">`, ou as utilities `.glass`, `.glass-strong`,
  `.glass-overlay`, `.glass-subtle` em vez de classes Tailwind brutas.
- Para alinhar telas legadas que ainda não foram polidas: trocar
  `bg-white` por `bg-white/40 backdrop-blur` + `border-white/55`, e
  `rounded-xl` por `rounded-[22px]`. Os tokens `bg-card`,
  `border-border`, `text-foreground` já apontam para os valores glass.

---

### 2026-05-14 — `apiUrl()` retorna sempre path relativo

**Decisão.** `src/lib/api.ts > apiUrl(path)` retorna sempre `path` relativo
(`/api/...`), **nunca** prefixa com a URL absoluta do backend. O proxy
acontece exclusivamente via `rewrites()` do `next.config.ts`. A função
`getApiBaseUrl()` ainda existe e expõe o backend absoluto, mas só deve ser
usada em casos pontuais que **exijam** absoluto (SSE de origem cross-site
explícita, integrações OAuth com redirect_uri, etc.) — em chamadas comuns
de cliente, é proibido.

**Contexto.** Frontend (`banco-frontend-crm.6tqx2r.easypanel.host`) e
backend (`banco-backend-crm.6tqx2r.easypanel.host`) rodam em **subdomínios
diferentes** do mesmo apex. Como os cookies do NextAuth são emitidos com
`SameSite=Lax` (default seguro), eles **não** acompanham `fetch` cross-site
disparado do navegador. Sintomas observados:

- `fetch("https://banco-backend-crm.../api/companies")` saía sem cookie
  → backend respondia `401` → UI mostrava "Failed to fetch" / dashboard
  em branco.
- O preflight CORS também batia, exigindo backend respondendo
  `Access-Control-Allow-Origin` + `Allow-Credentials` em todos os endpoints
  (manutenção custosa) e ainda assim o `Lax` matava o cookie.

Com `apiUrl()` relativo, a chamada do navegador vai pro **próprio domínio
do frontend** (`/api/companies`), o Next.js Edge proxy aplica o rewrite
de `next.config.ts` e encaminha server-to-server pro backend. Cookie do
NextAuth viaja normalmente porque é same-origin.

**Alternativas descartadas.**

- **Liberar CORS no backend + `credentials: "include"` + `SameSite=None`.**
  Funciona, mas exige cookie `SameSite=None; Secure` (mais permissivo), e
  todo endpoint do backend precisa ecoar `Access-Control-Allow-Origin`
  específico (não pode ser `*` com credentials). Mais código, mais
  superfície, e o cookie `Lax` que o NextAuth emite por padrão é mais
  resistente a CSRF.
- **Mesmo subdomínio com path-prefix (`/api` no frontend → backend).** É
  basicamente o que `rewrites()` já faz, mas exigia tirar o backend do
  Easypanel como serviço separado — perderíamos a flexibilidade de
  escalar/derrubar backend isoladamente.

**Impacto.**

- Toda chamada de cliente passa por `next.config.ts > rewrites()`. Se um
  endpoint do backend não está mapeado lá, ele não é acessível pelo
  frontend. Checar `rewrites()` ao adicionar nova rota.
- SSE/WebSocket que dependem de keep-alive longo: validar caso a caso se
  o proxy do Next.js segura sem timeout.

### 2026-05-14 — Domain do Easypanel mapeia para porta 3000 (não 80)

**Decisão.** No serviço do frontend no Easypanel, **Domain → Service
Port** deve ser `3000`. Nada de `PORT=80` no env do container.

**Contexto.** O `Dockerfile` do frontend faz `EXPOSE 3000` e o `server.js`
do Next.js standalone faz bind em `PORT || 3000`. Quando alguém setava
`PORT=80` no env do Easypanel (achando que o Traefik precisava de 80), o
Next.js subia em `http://0.0.0.0:80` dentro do container — mas o Traefik
do Easypanel encaminha para a `Service Port` configurada (3000 por
default). Resultado: HTTP 502 / "Service is not reachable", e nos logs só
aparecia `Ready in 147ms` (porque o app subiu de fato, só não na porta
certa).

**Alternativas descartadas.**

- **Trocar `EXPOSE` no Dockerfile + Service Port pra 80.** Funciona, mas
  contraria a convenção universal "container web app = porta 3000" e
  confunde quem for clonar o repo localmente.

**Impacto.** Documentado também no README do repo. Se aparecer 502 num
serviço Next no Easypanel, primeira coisa a checar é Service Port =
3000.

### 2026-05-14 — `NEXTAUTH_URL` é o domínio público do **frontend**

**Decisão.** A env `NEXTAUTH_URL` deve apontar para o domínio público
**onde o usuário digita a URL no browser** — o frontend. Tanto no
serviço do frontend **quanto** no serviço do backend.

**Contexto.** O backend separado só serve API e roda
`next-auth/middleware` em rotas `/api/auth/*`. Quando o NextAuth gera
URLs absolutas (callback, signin, signout, e os próprios cookies via
`useSecureCookies = NEXTAUTH_URL.startsWith("https://")`), ele usa
`NEXTAUTH_URL`. Se o backend tem `NEXTAUTH_URL=https://banco-backend...`,
o cookie sai com domínio errado e o redirect pós-login leva pra dentro
do backend, fora do contexto de UI. Setando ambos os serviços para
`NEXTAUTH_URL=https://banco-frontend-crm.6tqx2r.easypanel.host`, o
NextAuth do backend gera cookies/redirects coerentes com onde o usuário
está navegando — e o rewrite do frontend pro backend não muda o
`Host` header relevante para o NextAuth.

**Alternativas descartadas.**

- **`NEXTAUTH_URL` do backend = domínio do backend.** Cookie sai com
  `Set-Cookie: Domain=banco-backend-crm...`, navegador o associa a um
  origin que o middleware do frontend nunca consulta.

**Impacto.** Documentar no README. Para um cliente final que rodar em
domínio próprio (ex.: `crm.minhaescola.com.br` no front e
`api.minhaescola.com.br` no back), `NEXTAUTH_URL` continua sendo o
**frontend** em ambos os serviços.

---

### 2026-06-11 — Padrão único DS v2 para modais/dialogs

**Decisão.** Toda modal/dialog/sheet adota um único padrão visual DS v2,
ancorado nos tokens (com dark mode automático):

- **Overlay:** `bg-black/30 backdrop-blur-sm` (md no base `<dialog>`).
- **Painel:** `rounded-[var(--radius-2xl)]` (xl em modais pequenas),
  `border border-[var(--glass-border)]`, `bg-[var(--glass-bg-modal)]`,
  `shadow-[var(--glass-shadow-lg)]`, `backdrop-blur-xl`.
- **Texto:** título `text-[var(--text-primary)]`, descrição
  `text-[var(--text-muted)]`, secundário `text-[var(--text-secondary)]`.
- **Superfícies internas:** `--glass-bg-overlay` / `--input-bg`;
  bordas `--glass-border-subtle`.
- **Estado semântico:** `--color-success/danger/warning/info` (+`-bg`/`-text`);
  marca/seleção `--brand-primary` / `--color-enterprise-bg`.
- **Cores de marca de canais** (WhatsApp `#25D366`, Messenger `#1877F2`,
  Instagram pink/violet, Telegram cyan) **são preservadas** como
  identidade — não viram token.

A referência-ouro que já seguia o padrão é
`features/inbox-v2/extras/task-dialog.tsx` / `schedule-dialog.tsx`.

**Contexto.** Existiam 5 "dialetos" coexistindo: base glass branca
(`bg-white/75 border-white/55 rounded-[22px]`, shadcn, sem dark), DS v2
por token, slate/blue nativo (kanban filters), shadcn semântico
(`bg-card`/`border-border`) e hex/inline de marca. Overlays variavam
(`black/30..40`, `slate-900/30..40`, `rgba(30,42,59,.35)`). O maior
alavancador foi refatorar os 3 componentes-base
(`components/ui/dialog.tsx`, `sheet.tsx`, `alert-dialog.tsx`): só isso
deu dark mode e tokens a todas as modais que herdam deles.

**Alternativas descartadas.**

- **Manter `bg-white/75` no base e só ajustar caso a caso.** Perpetua a
  ausência de dark mode e o `rounded-[22px]` cru.
- **Migrar tudo para Radix Dialog.** Reescrita grande sem ganho — o
  `<dialog>` nativo já centraliza e o token resolve o tema.

**Impacto.** Tokens legados inexistentes corrigidos no caminho
(`--color-ink-subtle`, `--glass-bg`, `--color-ink-muted`). `ds-scan`
acumulou melhora (tailwindNativePalette −157, bgWhiteAlpha −8,
rawRoundedPx −7) sem regressões. Novas modais devem partir do
`DialogContent`/`SheetContent` base ou replicar o bloco de tokens acima;
nunca usar `bg-white`/`bg-card`/slate em superfície de modal.

---

### 2026-06-26 - Edição em massa "selecionar todos que batem no filtro" (>100)

**Decisão.** A edição em massa de campos/tags passa a aceitar, além dos IDs
explícitos selecionados, um `scope` que o **servidor** expande para os IDs
reais: `POST /api/deals/bulk/custom-fields` aceita
`scope: { pipelineId, status, filters, stageId? }`. O scope é resolvido por
`resolveBoardDealIds()` (em `services/deals.ts`), que reaproveita exatamente
`buildDealWhereFromFilters()` — a mesma engine do `POST /pipelines/:id/board`
— somando status + visibilidade (MEMBER só vê os próprios) + escopo por
pipeline (relação `stage.pipelineId`) ou por etapa. Teto rígido de **5000**
deals por operação (`capped: true` na resposta avisa o frontend). No dialog
(`BulkEditFieldsDialog`), um seletor de escopo oferece: "apenas selecionados",
"todos da etapa X" (habilitado só quando toda a seleção está numa única etapa)
e "todos do funil no filtro atual". `_v2-client` monta o `BulkScopeContext`
(totais por coluna + etapa da seleção + filtros/busca ativos).

**Contexto.** O board carrega no máximo 100 cards/coluna
(`DEFAULT_BOARD_COLUMN_LIMIT`), então a seleção via checkbox cobria só os
carregados — impossível editar mais que ~100. Resolver no servidor evita
trafegar milhares de IDs e garante que "todos que batem no filtro" = o que o
usuário vê (mesmo where do board).

**Alternativas descartadas.**

- **Só aumentar o limite da coluna (até 500) e selecionar os carregados.**
  Paliativo: continua limitado, exige rolar/carregar e não escala.
- **Resolver os IDs no worker (passar `scope` no payload da fila).** Mais
  escalável, mas o `BulkOperation.total` não seria conhecido no enqueue e a
  permissão/visibilidade teria que ser recomputada fora do request — preferiu-se
  resolver na rota (onde já há sessão + role) e manter o worker recebendo IDs.

**Impacto.** Apenas a edição de campos/tags ganhou scope; as demais ações em
massa (mover/ganho/perdido/excluir) seguem por IDs explícitos. Reuso total da
engine de filtro do board (sem duplicar regras). Worker `leads-worker` **não**
tem auto-reload (`npx tsx` sem `--watch`): após mexer no job é preciso
reiniciá-lo manualmente.

---

### 2026-06-26 - Canal/conexão por mensagem (qual WhatsApp na mesma conversa)

**Decisão.** Rastrear a **conexão (`Channel`) por mensagem** para distinguir,
dentro de UMA conversa, contas distintas do mesmo canal (ex.: dois números de
WhatsApp da empresa). Adicionada coluna nullable `Message.channelId`
(FK→`channels`, `ON DELETE SET NULL`) e o `channelId` é carimbado na ingestão
inbound (Baileys `message-handler`, Meta `handler`) e nas saídas principais
(rota `messages`, `attachments`, `template`, `forward`, `conversations/create`,
resposta autônoma da IA em `piloting-actions`). Demais saídas de bot/sistema
ficam com `channelId = null` → o frontend trata `null` como "herda a conexão
anterior" (sem marcador falso).

A rota `GET /conversations/:id/messages` passou a expor, por mensagem,
`channelId`, mais `channel` (conexão ATUAL) e `channels` (mapa id→{name, type,
phoneNumber}). O `GET /contacts/:id` inclui `channelRef` em cada conversa.

UI: rótulo "Tipo · Apelido · Número" via `lib/connection-label.ts`. Chip de
conexão no header do chat (`ChatArea`) e no header do contato do pipeline
(`DealDetailPanel`); linha "Canal" no `contact-aside`; e um `ConnectionDivider`
na timeline (inbox `ChatArea` + pipeline `deal-chat-binding`) que só aparece
quando a conversa tem 2+ conexões distintas (com uma só, o chip do header basta).

**Contexto.** A `Conversation` é única por `(contato, channel="whatsapp")` —
quando o mesmo cliente fala por dois WhatsApps da org, o backend reaproveita a
MESMA conversa e só atualiza `Conversation.channelId` para o último canal usado.
Não havia nada na UI indicando por qual conexão a pessoa falava, e mensagens não
guardavam a conexão de origem.

**Alternativas descartadas.**

- **Mostrar só a conexão atual da conversa (sem coluna em Message).** Simples,
  mas não distingue mensagem-a-mensagem ("uma veio no WhatsApp A, outra no B").
- **Separar em conversas distintas por conexão (cada WhatsApp = thread).**
  Mudança grande de UX/dados e da regra de dedupe — alto risco; descartada.

**Impacto / operação.** O projeto **não usa migrations versionadas** (sync via
`prisma db push`), mas o **DB de dev tem drift** (colunas em `products` ausentes
no schema) que impede um `db push` completo seguro. Por isso a coluna foi
aplicada com SQL aditivo idempotente em
`backend_crm1/prisma/manual/2026-06-26_message_channel.sql`
(`prisma db execute`). Para produção, rodar o mesmo arquivo antes do deploy
(o build gera o Prisma Client a partir do schema; a coluna precisa existir no DB).
`Message.channelId` é nullable → mensagens históricas ficam sem rótulo.

---

## Decisões técnicas

### 2026-08-19 — Alertas de tarefa (polling global)
- Modelo: Cursor Grok 4.5 (execução sob spec Opus)
- Decisão: card global autenticado (`TaskAlertCenter` no layout `(app)`) com polling GET `/api/activities/alerts` a cada 30s (`refetchIntervalInBackground: false`, retry desligado — GET consumptivo). Desktop: card glass fixo canto inferior direito (~360px), sem overlay. Mobile/APK: popup compacto no topo abaixo do safe-area. Fechar/clicar → dismiss; snooze 10 min com `kind`; erro Sonner mantém o card no cache. Sem SSE/WebPush/FCM neste escopo.
- Alternativas descartadas: toasts Sonner como UI principal; push/SSE; overlay modal bloqueante.

### 2026-08-19 — Atividades: contato opcional, criador, notas compartilhadas
- Modelo: Cursor Grok 4.5 (execução sob spec Opus)
- Decisão: na tela global `/activities`, Contato no composer é **opcional** (autocomplete via `useContacts`); texto livre não vincula lead — só `contactId` selecionado. `Activity` UI preserva `contactId`/`contactName`/`dealId`/`dealTitle`/`createdBy`. `ActivityRow` mostra “Criada por {nome|Sistema}” e link contextual (negócio > contato). Dialog compartilhado `activity-detail-dialog.tsx` (notas + histórico `history=1`) integrado em `/activities` e no painel de tarefas do negócio; ownership de editar/excluir nota via `useSession().user.id`, sem `isOwn` do backend.
- Alternativas descartadas: texto livre como vínculo de contato; duplicar dialog no painel do deal; confiar em flag `isOwn` da API.

### 2026-07-20 — Biometria no APK (escopo A)
- Modelo: Opus (Cursor Grok 4.5 / orquestração)
- Decisão: cadeado local com `@capgo/capacitor-native-biometric`; só com sessão logada; flag `crm_biometric_lock_enabled` em localStorage; toggle no Perfil; sem Firebase/push neste escopo.
- Alternativas descartadas: login biométrico substituindo senha; WebAuthn-only no browser; SecureStorage de senha.

### 2026-07-21 — Permissões Android do APK
- Modelo: Cursor Grok 4.5 / Sonnet (implementação)
- Decisão: manifesto declara RECORD_AUDIO, CAMERA, READ_MEDIA_*, POST_NOTIFICATIONS, MODIFY_AUDIO_SETTINGS; grants via Capacitor BridgeWebChromeClient; pedidos no contexto (mic ao gravar/ligar; câmera ao tirar foto; notificação ao ativar push). Câmera no composer via input capture. Web Push no APK sem Firebase nesta fase; FCM só se validação falhar.
- Alternativas descartadas: pedir todas as permissões no cold start; FCM obrigatório já; declarar Contatos/GPS/SMS.

### 2026-07-21 — Atualizar sem APK
- Modelo: Cursor Grok 4.5 / Sonnet
- Decisão: nome do fluxo interno fora da Play. Camada A = deploy web (zero APK). Camada B = app baixa APK via plugin AppUpdate + mobile-release.json; UI "Atualizar sem APK". Mesma keystore obrigatória. Sem Capgo nesta fase.
- Alternativas: Play Store in-app updates; Capgo live update; envio manual de APK por WhatsApp.

### 2026-08-05 — Paridade visual entre navegador mobile e APK
- Modelo: GPT-5.6 (não confirmado; decisão) / cursor grok 4.5 (implementação)
- Decisão: o frontend responsivo de produção é a fonte única da UI mobile. O APK Capacitor não mantém fork visual nem páginas próprias; diferenças de aparência são tratadas por revisão de build pública, limpeza do service worker/cache e preferências de tema persistidas por usuário em `UserPreference.appearance`. A navegação mobile continua configurada por `mobile-layout`.
- Alternativas descartadas: copiar componentes para `mobile/`; apontar o APK permanentemente para DEV; reintroduzir o `DashboardShell`/`MobileTopBar` legado (o Dashboard atual já tem paridade de código entre DEV e `main`, e o visual divergente foi identificado como build antigo).

### 2026-08-05 — APK aponta para produção `frontend-front.v74knz`
- Modelo: Opus / cursor grok 4.5 (implementação)
- Decisão: `capacitor.config.json` (`server.url` / `hostname`) e fallback de `resolvePostLoginOrigin` devem apontar para `https://frontend-front.v74knz.easypanel.host` (produção correta). Não usar `banco-frontend-crm.6tqx2r.easypanel.host` (host legado com UI antiga "Olá, Admin"/PresetBar). UI única = frontend responsivo; o visual legado no APK vinha do host errado embutido no build (e `app-revision` no host antigo devolvia HTML de login, por isso o APK não pediu atualização). Mudar `server.url` exige novo APK + sync.
- Alternativas descartadas: manter o host legado; apontar o APK permanentemente para DEV (`crm-dev-frontend.ca31ey`).

### 2026-08-06 — Layout mobile é por organização (fim do singleton `default`)
- Modelo: GPT-5.6 (decisão) / claude-sonnet-5-thinking-high (implementação)
- Decisão: `/api/mobile-layout` passa a ler e gravar pela organização do contexto (`findFirst` + `upsert` em `where: { organizationId }`), sem `id` fixo. O modelo já era uma linha por org (`organizationId @unique`), mas a rota ainda usava `id: "default"` — só a org dona daquela linha (EduIT) conseguia salvar; nas demais o upsert caía no create e violava a PK, e o botão "Salvar layout" não tinha efeito.
- Alternativas descartadas: voltar o modelo a singleton global (quebra multi-tenant); criar a row `default` por org com sufixo (mantém acoplamento a id mágico).

### 2026-08-06 — Visual Chrome descontinuado
- Modelo: GPT-5.6 (decisão) / claude-sonnet-5-thinking-high (implementação)
- Decisão: remover a feature (toggle no Perfil/App Mobile, `MobileBottomNavChrome` e leitura/escrita de `visualChrome` na API). A coluna permanece no schema, sem uso — a API usa `select` explícito para não tocá-la, já que a migration `20260805180000` nunca foi aplicada em produção (EasyPanel com `SKIP_PRISMA_MIGRATE=1`).
- Alternativas descartadas: manter a feature e aplicar a migration em produção; dropar a coluna agora (drift entre ambientes).

### 2026-08-06 — Biometria: plugin nativo registrado na casca Capacitor
- Modelo: GPT-5.6 (decisão) / cursor grok 4.5 (implementação)
- Decisão: declarar `@capgo/capacitor-native-biometric@7.6.0` em `mobile/package.json` e rodar `cap sync android`. O pacote existia só em `node_modules`, fora do `package.json` e dos gradle gerados, então o APK saía sem o plugin: `Capacitor.Plugins.NativeBiometric` era `undefined`, `isBiometricAvailable()` devolvia `false` e o toggle "Desbloquear com biometria" ficava desativado mesmo em aparelho com digital cadastrada. Release 1.0.3 (versionCode 4), mesma keystore (SHA-256 `993dd0e4…4b96`).
- Alternativas descartadas: implementar biometria via WebAuthn no WebView (suporte irregular em WebView Android); manter só o cadeado por PIN da aplicação.

### 2026-08-06 — Curso: Canal, Desconto e Valor com desconto
- Modelo: Cursor Grok 4.5 (decisão + orquestração) / claude-sonnet-5-thinking-high (implementação)
- Decisão: no modal de produto com kind COURSE, a linha Dados gerais ganha Canal (texto), Desconto (%) e Valor com desconto (R$, derivado). Persistência em `CourseConfig.channel` e `CourseConfig.discountPercent` (não em ProductOffer). Valor com desconto não é coluna — recalcula a partir de preço base × (1 − %).
- Alternativas descartadas: só UI sem persistir; reutilizar ProductOffer.discountPct (oferta é por unidade/org e não cobre “canal”); campos custom genéricos.

### 2026-08-08 — Seleção de canal em nodes de mensagem da automação

**Modelo usado.** Cursor Grok 4.5.

**Decisão.** Nodes de mensagem (WA texto/mídia/lista/botões/template/produto + e-mail) passam a ter config.channelId opcional com herança: o primeiro node de mensagem do fluxo exige canal quando a org tem 2+ canais CONNECTED; os seguintes herdam (vazio = último canal do caminho) e podem override. UI: kebab no canvas + seletor no painel, ocultos se ≤1 canal conectado. Runtime grava Message.channelId e mantém o mesmo negócio; troca de canal aparece no divisor timeline "via {canal}". Save/ativar bloqueia sem canal no 1º node (quando multi-canal). Lista só canais CONNECTED. Escopo: todas as orgs; desenvolver na DEV_BRANCH.

**Contexto.** Orgs com múltiplos números WhatsApp (ex. Cruzeiro EAD: Acadêmico + CSV Atendimento) precisam escolher por qual canal a automação envia, sem abrir outro negócio.

**Alternativas descartadas.** Gravar channelId em todo node (ruidoso); substituir senderName/automação pelo nome do canal na bolha (quebra marca "Temas Transversais"); abrir novo negócio ao trocar canal.

**Impacto.** Frontend builder + utomation-executor + validação em update/toggle. Template já tinha channelId — unificado com o restante. ConnectionDivider existente passa a receber channelId das mensagens de automação.


### 2026-08-08 - Nodes de automacao "Ganho" e "Perda"

**Decisao.** Dois novos steps de acao no builder: `mark_deal_won` ("Ganho", config `{ pipelineId, pipelineName? }`) e `mark_deal_lost` ("Perda", config `{ pipelineId, pipelineName?, lostReason }`). Picker de funil reusa `usePipelineOptions`; o motivo da perda usa um novo hook `usePipelineLossReasonOptions(pipelineId)` que busca `GET /api/pipelines/{id}/loss-reasons` e so mostra o catalogo daquele pipeline (sem opcao "Outro"). Trocar o funil no node Perda zera `lostReason` (catalogo depende do funil). Icones: Trofeu (sucesso) e CircleX (perigo).

**Contexto.** Faltava fechar negocio (ganho/perdido) direto de um fluxo de automacao visual - so existia "Mover estagio" generico, sem UI para motivo de perda por funil.

**Alternativas descartadas.** Campo de motivo livre (foge do padrao "catalogo por pipeline" ja usado no dialog de perda do kanban); reusar o SourceSelect generico sem tratamento especial (perderia o `pipelineName` no summary do card e o clear de `lostReason` ao trocar funil).

**Impacto.** `lib/automation-workflow.ts` (ACTION_STEP_TYPES/labels/default/summary/isStepIncomplete), `components/automations/editor-fields.ts` (novo SourceKey "pipeline" + kind "pipelineLossReason"), `editor-data.ts` (novo hook), `inline-editor.tsx` (PipelineSelect + PipelineLossReasonSelect), `node-palette.tsx` + `add-step-node.tsx` (icones/cores/grupo "Acoes"), `action-node.tsx` (icone/cor de fundo). Nao confundir com os triggers `deal_won`/`deal_lost` (permanecem gatilhos, inalterados).

### 2026-08-08 — Campo Motivo da perda nas Informações do Negócio

**Modelo usado.** Cursor Grok 4.5.

**Decisão.** Campo editável em Informações do Negócio: clique abre funis (GET /api/pipelines, scoped por acesso) e depois motivos do funil. Persiste só `Deal.lostReason` via PUT deal — sem mudar status/estágio. Banner vermelho no hero permanece quando status=LOST.

**Alternativas descartadas.** Marcar LOST ao escolher motivo; campo só quando LOST.

**Impacto.** FE: deal-lost-reason-field + deal-detail-panel; UpdateDealPayload.lostReason.

### 2026-08-13 — Automações no menu Mais (mobile/APK)
- Modelo: Cursor Grok 4.5
- Decisão: incluir `automations` em `DEFAULT_ENABLED` (FE+BE) e garantir no `MobileMoreSheet` via `MORE_SHEET_ENSURE`, para layouts já salvos sem o módulo. Restrito a ADMIN/MANAGER (`allowedRoles`), paridade com a sidebar. Continua fora do bottom nav padrão — só em "Mais seções".
- Alternativas descartadas: só alterar o Layout Builder (orgs com row salva não veriam); pinar Automações na barra inferior (ocupa slot de core).

### 2026-08-13 — Tema escuro do editor de automações
- Modelo: Cursor Grok 4.5
- Decisão: tokenizar as cores fixas do editor em `--fx-*` (novos: `--fx-surface-2`, `--fx-input-bg`, `--fx-divider-strong`, `--fx-surface-err`, `--fx-border-err`, `--fx-out-label*`, `--fx-text-label`, `--fx-accent-ink`, `--fx-warn-*`), com os hex claros atuais como valor padrão, e concentrar o dark em um único bloco `.v2-dark .automation-editor`. Canvas passa de `#0e1524` para `#1a2334`–`#1f2a40` (azul escuro suave, família do `--bg-mesh` do CRM); cards em `#26314a`, campos recuados em `#1e2740`. O glifo `⊘` do ramo "senão" virou `IconBan` (Tabler) — a fonte do app não tem U+2298 e renderizava tofu.
- Alternativas descartadas: sobrescrever cada seletor em `.v2-dark` (duplica regra e desincroniza com o claro); manter o remapeamento por utilitário Tailwind em `globals-v2.css` como única estratégia (não alcança as classes `cfg-*`/`fx-*`, que são CSS puro).

### 2026-08-27 — Manifesto do APK nos hosts EasyPanel atuais
- Modelo: Cursor Grok 4.6
- Decisão: o check in-app (plugin AppUpdate + diálogo "Atualizar sem APK") volta a ler o manifesto em `crm-mobile.7w7dai` (prod) e `crm-apk-dev.ca31ey` (DEV), com proxy público `/api/mobile-release` e `/mobile-release.json` liberado no middleware. Host antigo `frontend-app.v74knz` está 503; o fallback no CRM redirecionava para login. Throttle passa a ser por `versionCode` oferecido, não por "último check".
- Alternativas descartadas: manter o host legado; exigir env EasyPanel nova só no painel (CI já embute a URL por branch).
