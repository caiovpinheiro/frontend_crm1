# UI_DIFF.md — `/ai-agents-v2/[id]` vs protótipo

Fluxo comparado: **Agente completo** (`FLOW_FULL` do protótipo).
Mapeamento de passos: `begin`→Começar, `tone`→Jeito de falar, `data`→O que ele sabe, `docs`→Materiais, `msgs`→Mensagens e produtos, `start`→Início da conversa, `subjects`→Assuntos, `rules`→Regras automáticas, `fallback`→Saídas, `team`→Equipe e horários, `tabul`→Encerrar e classificar, `test`→Testar e publicar.

Legenda:
- **FALTA** = o protótipo tem e a tela atual não tem (ou não funciona).
- **EXTRA** = a tela atual tem e o protótipo não pede.
- **BUG** = comportamento quebrado.
- **OK** = já equivalente.

---

## 1. Começar (begin)

| Protótipo | Tela atual | Status |
|---|---|---|
| Nome do agente + hint "É o nome que o cliente vê" | Campo com label e tooltip | ✅ OK |
| Canal escolhido de uma **lista** (WhatsApp/Instagram/Messenger) do catálogo | MultiSelectPopover com catálogo de canais | ✅ OK |
| Modelo escolhido de uma **lista** (Em branco, Atendimento, Vendas, etc.) | Cards de presets na criação (`Novo agente v2`) | ✅ OK |
| Botão "Criar" desabilitado até nome + preset preenchidos | Botão desabilitado até `newName.trim()` e `newPreset` | ✅ OK |

**BUGS:**
- Nenhum nesta etapa.

---

## 2. Jeito de falar (tone)

| Protótipo | Tela atual | Status |
|---|---|---|
| Slider/espécie de tom com presets "Mais objetivo/Equilibrado/Mais natural/Mais criativo" | Select funciona depois do fix, mas não é slider/card | parcial |
| Tamanho da resposta: Curta / Média / Completa | Select funciona | OK |
| Saudação customizada com variáveis (`@Nome`, `@Empresa`) | Campo de texto simples | OK |
| Despedida customizada com variáveis | Campo de texto simples | OK |
| Instruções gerais de comportamento (tom, tom de voz, o que evitar) | Editor TipTap presente | OK |
| Exemplos de frases para guiar o modelo | Editor presente | OK |
| Limite de caracteres/contagem de tokens visível | Não há | FALTA |

**BUGS:**
- O select de "Comportamento" estava vazio antes do fix (valor salvo não mostrava rótulo). Corrigido em `src/components/ui/select.tsx`.

---

## 3. O que ele sabe (data)

| Protótipo | Tela atual | Status |
|---|---|---|
| Nome da empresa via variável `@Nome da empresa` | Campo `organizationName` separado | EXTRA |
| Campos do contato: selecionar quais o agente pode ler/alterar | Tabela com built-ins + catálogo de campos customizados, com valor de exemplo ao lado de cada campo (2026-09-21) | ✅ OK |
| Campos do negócio: selecionar quais o agente pode ler/alterar | Tabela com built-ins + catálogo de campos customizados, com valor de exemplo ao lado de cada campo (2026-09-21) | ✅ OK |
| Permissão por campo (só ler / ler e escrever) | **Já existia** no código (checkboxes Ler/Citar/Atualizar lado a lado, `contextFields[].permissions`) — este item estava desatualizado nesta doc. Confirmado em `StepContext` (2026-09-21). | ✅ OK |
| Variáveis explicadas com ícone ⓘ | Tooltips (ⓘ) já existem no cabeçalho da tabela (Ler/Citar/Atualizar); "Informações fixas" (variáveis da empresa) segue sem ⓘ próprio | parcial |

**BUGS:**
- `organizationName` é campo próprio em vez de variável `@Nome da empresa` — pendente de alinhamento de schema/backend. Não corrigido nesta sessão (decisão de negócio: manter campo próprio ou migrar para variável — precisa confirmação).

---

## 4. Materiais (docs)

| Protótipo | Tela atual | Status |
|---|---|---|
| Lista de materiais cadastrados com nome e tipo | Lista com status/trechos e MultiSelectPopover | ✅ OK |
| Upload de arquivos (TXT, MD, PDF) | Input aceita só formatos suportados; hint e loading presentes | ✅ OK |
| Seleção de quais materiais o agente pode consultar (RAG) | MultiSelectPopover funciona | OK |
| Indicador de "material ativo/inativo" | Não há | FALTA |
| Botão de upload com loading | Não tinha | FALTA |

**BUGS:**
- Nenhum nesta etapa.

---

## 5. Mensagens e produtos (msgs)

| Protótipo | Tela atual | Status |
|---|---|---|
| "Mensagens prontas" escolhidas de modelos cadastrados | MultiSelectPopover + badges dos modelos | ✅ OK |
| Lista de produtos cadastrados com switch individual | Lista com switches e `allowedProductIds` | ✅ OK |
| Opção de enviar até N produtos | Select de max items existe | OK |
| Mostrar preço/imagem nos cards | Checkbox existe | OK |

**BUGS:**
- Nenhum nesta etapa.

---

## 6. Início da conversa (start)

| Protótipo | Tela atual | Status |
|---|---|---|
| Mensagem de abertura | Campo existe | OK |
| Comportamento quando não identifica contato | Select | OK |
| Ação para primeiro acesso / disciplinas | Campos existem | OK |
| Pack de primeiro acesso | Campo existe | OK |

---

## 7. Assuntos (subjects)

| Protótipo | Tela atual | Status |
|---|---|---|
| Explicação do que são "Assuntos" (temas de atendimento) | Texto explicativo adicionado no topo da etapa (2026-09-21) | ✅ OK |
| Cada assunto com nome, descrição, prompt, regras, ferramentas permitidas | Cards existem | OK |
| Ordenação de assuntos | Arraste nativo (HTML5 drag-and-drop, sem nova dependência) + botões de mover para cima/baixo (2026-09-21) | ✅ OK |
| Lista de ferramentas por assunto | MultiSelectPopover | OK |

---

## 8. Regras automáticas (rules)

| Protótipo | Tela atual | Status |
|---|---|---|
| Regras com condição e ação | Cards existem | OK |
| Condições: fora do horário, tag do contato, pesquisa recebida, campo atualizado | Condições listadas, mas 3 estão quebradas | BUG |
| Ações: encaminhar, enviar mensagem, aplicar tag, etc. | Ações listadas | OK |

**BUGS:**
- `out_of_hours`, `contact_tag`, `survey_received` não avaliam corretamente. **Verificado em 2026-09-21: já estavam corrigidos no motor** (`src/services/ai-v2/engine.ts` passa `withinBusinessHours` real via `isWithinV2BusinessHours`, `contactTags` de `context.contact?.tags`, `surveyReceived` de `counters.surveyPending` — `src/services/ai-v2/rules.ts` avalia os três corretamente). Este item da doc estava desatualizado. Cobertura em `rules.test.ts`/`engine.test.ts` (51/51 passam). O simulador da aba Testar (`test-turn.ts`) também foi corrigido para calcular `withinBusinessHours` e `isFirstMessage` reais (antes usava `isFirstMessage: true` fixo).

---

## 9. Saídas (fallback)

| Protótipo | Tela atual | Status |
|---|---|---|
| Resposta padrão quando não tem material/cliente | Editor existe | OK |
| Após encerramento: cortesia / nova demanda / ambíguo | 3 selects | OK |
| Janela pós-encerramento em horas/dias | Campos existem | OK |

**BUGS:**
- Selects de comportamento pós-encerramento apareciam vazios (mesmo fix do select).

---

## 10. Equipe e horários (team)

| Protótipo | Tela atual | Status |
|---|---|---|
| Expediente e ação fora do horário | Campos existem | OK |
| Encaminhamento: departamento, fila, pessoa, distribuição, agente IA | Campos existem | OK |
| Limite de idas e voltas IA↔humano | Campo existe | OK |

---

## 11. Encerrar e classificar (tabul)

| Protótipo | Tela atual | Status |
|---|---|---|
| Tabulações permitidas | MultiSelectPopover | OK |
| Campos a atualizar no encerramento | Implementado ponta a ponta (2026-09-21): schema `closure.fieldUpdates[]` (`entity`, `key`, `value`), UI em "Encerrar e classificar" lista campos com permissão de escrita (`contextFields[].permissions` inclui `write`) + valor a gravar, motor aplica em `closeState` (`applyV2ClosureFieldUpdates`, respeitando a permissão) antes de fechar a conversa. Testes existentes continuam passando (51/51). | ✅ OK |
| Botões no WhatsApp (habilitar) | Ainda **não implementado**. Não existe campo `interactive`/botões no schema (`v2AgentConfigSchema`); o código de montagem/persistência de opções (`interactive.ts`) já existe mas nunca é chamado, e o clique nunca é resolvido no webhook de inbound (confirmado em `V2_STATUS.md`). Implementar isso corretamente exige tocar no fluxo de webhook Meta/inbound (área sensível — ver AGENTS.md do backend) e não foi feito nesta sessão por segurança/tempo. **Precisa decisão/priorização do time antes de tocar no inbound.** | FALTA |
| "Devolver para automação" ao encerrar | Implementado ponta a ponta (2026-09-21): a função `continueV2AutomationOnClose` (já existia mas nunca era chamada) agora é chamada em `closeState` quando `closure.nextAutomationStepId` está preenchido. Campo de texto adicionado em "Encerrar e classificar" (id do passo é digitado manualmente — não há catálogo de passos de automação disponível na API de catálogos hoje). | ✅ OK |

---

## 12. Testar e publicar (test)

| Protótipo | Tela atual | Status |
|---|---|---|
| Chat estilo WhatsApp com bolhas | Reescrito (2026-09-21): bolhas de mensagem (cliente à esquerda, agente à direita), usando as variáveis de cor do chat do CRM (`--chat-bubble-sent-bg`/`--chat-bubble-received-bg`) para consistência visual sem duplicar o `MessageBubble` pesado do inbox (que carrega menu/reações/mídia real, não aplicável a uma simulação). Histórico de turnos mantido na tela e enviado ao backend (`history`) para o LLM ter contexto real entre mensagens. | ✅ OK |
| Mensagens com status (digitando, enviado, lido) | Indicador "digitando…" (3 pontinhos animados) enquanto aguarda a resposta simulada. "Enviado/lido" não se aplica — é simulação local, não há entrega real. | ✅ OK (parcial: sem ticks de entrega, que não fazem sentido numa simulação) |
| Painel "Bastidores deste turno" / "Por que respondeu isso?" | Implementado por resposta: regra aplicada (nome, não só id), assunto identificado (nome), ferramentas chamadas com resultado resumido, trechos dos materiais (RAG, com nome do documento — corrigido bug que lia campos errados do resultado: `content`/`distance` em vez de `text`/`score`), ações executadas, ações descartadas **com o motivo** (nova: antes não existia motivo por ação descartada), atalho "Editar assunto"/"Editar regra" que pula para a etapa correspondente. | ✅ OK |
| Simulação: origem da conversa, fora do horário, campos vazios, recomeçar | "Recomeçar" implementado (limpa o histórico). Simular "fora do horário"/"origem da conversa"/"contato com campos vazios" **não implementado** — o simulador (`test-turn.ts`) sempre roda sem contato real (`contact: null`); fazer isso corretamente exigiria escolher um contato real do CRM para o teste, o que é uma mudança maior de contrato (`POST /test` passaria a aceitar `contactId`) e não foi feita nesta sessão. | parcial — ver decisão pendente abaixo |
| Aprovar/enviar resposta em modo rascunho | Não implementado. O simulador não passa pelo fluxo de `autonomyMode: draft` (é sempre uma simulação isolada, sem fila de aprovação). | FALTA |
| Checklist de preenchimento antes de publicar | Checklist estático adicionado ("Antes de publicar"): testar cada assunto, confirmar campos citados, confirmar transferência. Não é dinâmico (não valida de fato o preenchimento) — é uma lista de lembretes. | parcial |

**BUGS:**
- Teste retornava erro de schema `theme`/`tabulationId` (corrigido no backend, sessão anterior).
- Valor do modo de execução salvo pode não bater com opções do select (não investigado nesta sessão — não estava nos itens prioritários).
- **Novo bug encontrado e corrigido (2026-09-21):** o front enviava `{ message: userMessage }` para `POST /api/ai-agents-v2/:id/test`, mas a rota lê `body.userMessage` — ou seja, o teste **sempre simulava a mensagem "oi"**, independentemente do que o operador digitasse. Corrigido nos dois lados (front manda `{ userMessage, history }`).
- **Novo bug encontrado e corrigido (2026-09-21):** `test-turn.ts` extraía trechos do RAG lendo `chunk.text`/`chunk.score`, mas o resultado real de `searchV2Knowledge` usa `chunk.content`/`chunk.distance` — os trechos apareciam sempre vazios no painel. Corrigido.

**Decisão pendente (precisa confirmação do usuário):** simular a conversa contra um contato real do CRM (com campos preenchidos/vazios de verdade) e simular "fora do horário" exigem mudar o contrato de `POST /api/ai-agents-v2/:id/test` para aceitar `contactId`/`overrideNow` opcionais. Não implementado nesta sessão para não expandir escopo de API sem alinhamento — pode ser feito num próximo passo se confirmado como prioridade.

---

## Gerais / navegação

| Protótipo | Tela atual | Status |
|---|---|---|
| Check verde só quando etapa tem mínimo preenchido | `isStepComplete` valida preenchimento mínimo | ✅ OK |
| Sidebar com título + subtítulo por passo | Existe | OK |
| Botão "Dicionário da tela" com termos técnicos | Implementado (2026-09-21): botão no topo abre um diálogo com o vocabulário de `SPEC_V2.md` (código → termo simples da tela). | ✅ OK |
| Rascunho salvo automaticamente | Botão "Salvar rascunho" | parcial |
| Linguagem sem jargão técnico | Passe de revisão (2026-09-21): "Mensagem de handoff" → "Mensagem ao transferir"; "Enviar modelo de mensagem" → "Enviar mensagem pronta" (ação de regra); rótulos de ferramentas na aba Testar traduzidos (`search_products` → "Buscar produtos no catálogo" etc.); rótulos de ações executadas/descartadas na aba Testar traduzidos (`add_tag` → "Adicionar etiqueta" etc.). Revisão feita por leitura completa do arquivo da tela + grep por termos crus (`RAG`, `trace`, `handoff`, `webhook`, `schema`, `JSON`, `playground`) — nenhum termo técnico cru restante visível ao operador. | ✅ OK |

---

## Nota sobre validação visual (screenshots) — 2026-09-21

Não foi possível gerar screenshots reais nesta sessão:
- **Ambiente de dev deployado** (`crm-dev-frontend.ca31ey.easypanel.host`): sem credencial válida (mesmo bloqueio já registrado na seção de validação do Select abaixo — `gestor@eduit.com.br`/`operador@eduit.com.br` com a senha do seed local retornam "E-mail ou senha incorretos" nesse ambiente).
- **Browser MCP local**: a ferramenta `browser_navigate` retornou "No browser tab available" em todas as tentativas (4), mesmo criando aba nova / URL em branco — indisponível nesta sessão.
- Como alternativa, subi o backend local (`npm run dev`, porta 3001) para tentar validar via browser contra dev local, mas sem o browser funcional isso também não avançou. O frontend local (porta 3000) já estava ocupado por outro processo (provavelmente o subagente concorrente).

Todas as mudanças desta sessão foram validadas por: `npm run build` (frontend, limpo), `npx eslint` no arquivo editado (0 erros), `npx tsc --noEmit` (0 erros novos — os 5 erros pré-existentes em `ai-v2` continuam idênticos antes/depois, confirmado via `git stash`), e `npx vitest run src/services/ai-v2` no backend (51/51 testes passando). Assim que houver credencial de dev válida ou o browser MCP voltar a funcionar, os itens marcados ✅ OK nesta sessão devem ser fotografados e os prints anexados aqui.

---

## Validação da correção do Select em outras telas

A correção do Select foi em `src/components/ui/select.tsx`, componente compartilhado do CRM. Este arquivo exporta **dois** controles distintos — isso muda o escopo real da validação:

- **`Select`** (composto: `SelectTrigger`/`SelectContent`/`SelectItem`/`SelectValue`, portal fixo sobre `document.body`, `z-index: 50`) — foi o componente **corrigido** (bug do valor salvo aparecendo vazio no trigger). Levantamento no código (`grep -r "SelectTrigger" src/`) em 2026-09-21 confirma que esse composto é usado **somente** em `src/app/(app)/ai-agents-v2/[id]/client-page.tsx`. Nenhuma outra tela do CRM usa esse componente hoje.
- **`SelectNative`** (um `<select>` HTML nativo) — usado em Inbox (filtros/quick actions), Departamentos (`deal-form`/`contact-filters` etc.), Pipeline (`deal-form`), Contatos (`contact-filters`). É um controle diferente, não tocado pela refatoração, renderizado nativamente pelo browser — não pode ter o mesmo bug (nem o de valor vazio, nem o de dropdown atrás de outros elementos).

Ou seja: as "5 telas fora da v2" (inbox, departamentos, automações, pipeline, contatos) **não usam o componente corrigido**. A validação real da correção só é possível dentro de `/ai-agents-v2/[id]` (etapas Começar, Jeito de falar, Início da conversa, Saídas etc.).

### Implementação atual

- O `Select` agora registra os rótulos dos itens a partir das `props` (`children` de cada `<SelectItem>`), sem renderizar os itens no DOM enquanto o menu está fechado.
- Isso evita o problema anterior (valor saldo aparecia vazio) e também evita peso em listas grandes.
- Itens só são renderizados no DOM quando o menu abre (portal fixo sobre o `body`), então **não há itens escondidos recebendo foco do Tab nem sendo lidos por leitor de tela** quando o select está fechado.

### Testes de impacto (isolados, sem backend)

| Cenário | Resultado |
|---|---|
| Select pequeno (3 itens) — `/test-select` | Valor saldo aparece, abre, troca de opção. ✅ |
| Select grande (500 itens) — `/test-select-large` | Render inicial ~6 ms; dropdown abre. ✅ |

### Validação em ambiente de dev (2026-09-21)

Deploy do `DEV_BRANCH` no commit `2a94abf73` ([run #35597420987](https://github.com/caiovpinheiro/frontend_crm1/actions/runs/35597420987)) ficou **verde** sem necessidade de correção adicional — o merge de `feat/ai-simple-v2` já buildou limpo.

Tentativa de validação manual via browser em `https://crm-dev-frontend.ca31ey.easypanel.host`:

| Etapa | Resultado |
|---|---|
| Login com `gestor@eduit.com.br` / `Teste@123` (seed `seed-test-users.ts`) | ❌ "E-mail ou senha incorretos" |
| Login com `operador@eduit.com.br` / `Teste@123` (mesmo seed) | ❌ "E-mail ou senha incorretos" |

**Bloqueio real:** as credenciais de `prisma/seed-test-users.ts` (usadas para dev local) não existem no banco do ambiente de dev deployado (`crm-dev-frontend.ca31ey.easypanel.host` + `crm-dev-backend.ca31ey.easypanel.host`). Não há credencial válida conhecida para esse ambiente. Nenhuma tela (`/ai-agents-v2/[id]`, `/inbox`, `/settings/team?tab=departamentos`, `/automations/new`, `/settings/pipeline`, `/contacts`) pôde ser aberta autenticada.

**Próximo passo de validação:** com uma credencial válida do ambiente de dev, repetir o roteiro acima — o essencial é `/ai-agents-v2/[id]` (único lugar que usa o `Select` corrigido); as demais telas usam `SelectNative` e servem só como sanity check de regressão geral, não do bug corrigido.
