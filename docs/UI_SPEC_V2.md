# UI da v2 — o que construir e para onde cada campo grava

Complemento de `SPEC_V2.md`, focado só no frontend. Protótipo navegável é a referência de comportamento.
**Regra de ouro:** nenhum campo desta tela pode existir sem um caminho correspondente na config do agente, e nenhum campo da config pode ficar sem tela. Se algo aqui não casar com o schema real (`v2AgentConfigSchema`), **corrija esta doc e o schema no mesmo commit** — não crie campo paralelo.

## Ordem de construção (por valor, não por tela)

O bloqueio hoje é não conseguir configurar nem testar um agente sem editar JSON. Então:

1. **Fase A — configurar o básico e testar.** Telas: Geral, Jeito de falar, O que ele sabe, Assuntos, Saídas, Equipe. Mais a aba Testar ligada. Com isso o agente já roda.
2. **Fase B — o que dá qualidade.** Materiais (upload e testar busca), Mensagens prontas e produtos, Início da conversa, Regras automáticas.
3. **Fase C — fechamento e operação.** Encerrar e classificar, Logs com "por que respondeu isso?", Versões.
4. **Fase D — os outros fluxos.** Recepção e Primeiros dias.

Enquanto uma seção não existir, manter um bloco "avançado (JSON)" só para as chaves ainda sem tela, e removê-lo à medida que as telas nascem.

## Padrões da tela

- Rota: `/ai-agents-v2/[id]` com abas `Config | Testar | Logs | Versões`. Dentro de Config, navegação lateral com as seções.
- Salvar grava **rascunho**; publicar é ação separada, com confirmação e registro de versão.
- Toda lista do CRM (departamentos, filas, usuários, estratégias, pipelines, etapas, campos, tabulações, modelos, templates, produtos, automações, canais) vem de `/api/ai-agents-v2/catalogs`. A tela guarda **id** e mostra **nome**. Id que não existe mais: mostrar em vermelho com "não encontrado no CRM" e não deixar publicar.
- Validação por zod no salvar, com erro no campo, não em alerta global.
- Nada de `confirm()` nativo — usar o diálogo do design system.
- Cada seção tem um texto curto explicando o efeito, na linguagem do protótipo (sem jargão).

## Mapa campo → config

Formato: **rótulo na tela** → `caminho.na.config` (tipo).

### Geral
- Nome → `name` (string, obrigatório) · Avatar → `avatarUrl` · Ativo → `active` (bool)
- Canal/número → `channelId` (id do catálogo)
- Como envia respostas → `autonomyMode` ("draft" | "autonomous")
- Modelo e comportamento da resposta → `model`, `responseBehavior`
- Chave OpenAI → endpoint próprio, nunca exibir valor salvo

### Jeito de falar
- Tom de voz (chips múltiplos) → `tone.traits` (string[]) · Descrição livre → `tone.text`
- Tamanho das respostas → `responseBehavior.length` ("short" | "medium" | "long")
- Regras que ele sempre segue (lista) → `globalRules` (string[])

### O que ele sabe
- Tabela de campos com três caixas por campo → `contextFields[]` `{ entity: "contact"|"deal", key, read, cite, write }`
- Outras bases → `recordSources[]` (ids)
- Mais de um negócio aberto → `context.multipleDeals` ("recent" | "ask")
- Informações fixas → `variables[]` `{ key, value }`
- Mídia: áudio → `media.audio` ("transcribe"|"handoff"|"ask_text"); imagem → `media.image` ("ocr"|"describe"|"handoff"|"ask_text"); documento → `media.document` ("extract"|"handoff"|"ask_other")
- Confirmar entendimento antes de agir → `media.confirmBeforeAction` (bool) · Falha → `media.failMessage`

### Materiais
- Upload → endpoint de knowledge do agente (multipart). Lista com situação do processamento.
- Documento usado em quais assuntos → `themes[].knowledgeDocIds`
- Testar busca → endpoint de busca, mostrando trecho e documento de origem

### Mensagens prontas e produtos
- Usar mensagens prontas → `messageModels.enabled` · Como usar → `messageModels.mode` ("literal" | "adapt")
- Quais pode usar → `messageModels.allowedIds` · Templates oficiais → `messageModels.allowedTemplateIds`
- Falar de produtos → `products.enabled` · Quantos por vez → `products.maxItems` (número)
- Mostrar preço/condições/imagem/link → `products.showPrice|showConditions|showImage|showLink` (bool)
- Quais pode apresentar → `products.filter` `{ mode, categoryId? }`
- O que pode fazer com o produto → `products.actions` (string[])

### Início da conversa
- Como a conversa chega → `entry.sources` `{ client, automation, human }` com config por origem
- Boas-vindas → `entry.openingEnabled`, `entry.openingMessage`
- Confirmar cadastro → `entry.confirmMode` ("confirm"|"load"|"none"), `entry.confirmMessage`
- Não encontrou o cliente → `entry.notFound` ("ask"|"create"|"route"), `entry.identityField`, `entry.maxAttempts`, `entry.notFoundDestination`
- Variáveis da automação → `entry.automationVariables[]` `{ key, target }`
- Usar botões → `interactive.enabled`

### Assuntos
Lista → `themes[]`, cada um:
- Nome → `name` · Quando usar → `description` · Exemplos → `examples` (string[])
- Como agir → `instructions` · Quem responde → `answerBy` ("self" | id do agente)
- O que pode fazer → `allowedTools` (string[]) · Materiais → `knowledgeDocIds` · Modelos → `messageModelIds`
- Produtos → `productPolicy` (herda do global quando ausente)
- Passar para → `destination` `{ kind: "department"|"queue"|"user"|"distribution"|"agent", id }`
- Transferir direto → `directHandoff` (bool) · Tabulação sugerida → `tabulationId`

### Regras automáticas
Lista ordenável → `rules[]` `{ enabled, conditions[], actions[], message }`
- Condição → `{ type, value }` com `type` em: `message_type`, `keyword`, `contact_tag`, `first_message`, `out_of_hours`, `deal_stage`, `field_equals`, `no_deal`, `survey_score`
- Ação → `{ type, ... }` com `type` em: `send_message`, `handoff`, `add_tag`, `set_theme`, `close`, `stay_silent`, `send_message_model`
- A ordem da lista é a ordem de avaliação. Mostrar isso na tela.

### Saídas
- Não soube → `fallback.unknown` `{ message, action, retries }`
- Pediu pessoa → `fallback.humanRequest.message`
- Sem material → `fallback.noSource.message`
- Erro → `fallback.error.message`
- Fora do escopo → `scope.message`, `scope.onInsist`
- Assuntos proibidos → `scope.forbidden[]` `{ subject, destination }`
- Parar de responder → `limits` `{ courtesyReplies, helpOffers, turnsWithoutProgress, nonsenseMessages, silenceMinutes }`
- Humor do cliente → `sentiment` `{ enabled, threshold, action, soften, tag, notify }`

### Equipe e horários
- Destino padrão → `handoff.default` (mesmo formato de `destination`) · Mensagem → `handoff.message`
- Horário → `businessHours` `{ enabled, days[], holidays }` · Fora do horário → `businessHours.outsideAction`
- Inatividade → `inactivity` `{ enabled, nudgeAfter, nudgeMessage, closeAfter }`

### Encerrar e classificar
- Janela pós-encerramento → `closure.window`; casos → `closure.courtesy`, `closure.newDemand`, `closure.ambiguous` (com mensagens)
- Tabulação → `tabulation` `{ enabled, when, required, fallbackId, byTheme{} , mode }`
- Ao encerrar → `closure.returnStage`, `closure.farewellEnabled`, `closure.farewell`, `closure.returnToAutomation`
- Pesquisa → `survey` `{ enabled, scale, when, question, askReason, reasonQuestion, skipAfterHuman, frequency }`
- Links permitidos → `allowedDomains` (string[])

### Testar
Chat contra um contato real do CRM, sem enviar nada pelo canal e sem alterar dados. Mostrar, por resposta: regra aplicada, assunto, ferramentas chamadas com resultado, trechos do RAG, modelo de mensagem usado, ações que **seriam** executadas, motivo. Botões clicáveis. Botão "marcar resposta ruim" com o texto esperado.

### Logs
Turnos da conversa com o mesmo detalhe, e em cada um um atalho para editar o assunto ou a regra responsável.

### Versões
Lista de publicações com autor e data, ver diferença e reverter.

## Fluxos alternativos
- **Recepção:** esconder Materiais, Mensagens/produtos e as instruções dos assuntos; em Assuntos, mostrar só nome, quando usar, exemplos, quem responde, destino e tabulação.
- **Primeiros dias:** no lugar de Assuntos, "Etapas do início" (`onboarding.steps[]` com `name`, `goal`, `openingMessage`, `collect[]`, `completionCriteria`, `allowedTools`, `knowledgeDocIds`, `stuckDestination`), mais "Quando faltar informação" (`onboarding.missingData`), "Acompanhamento" (`onboarding.followUp`) e "Encerrar e entregar" (`onboarding.completion`).

## Aceite
Uma seção só está pronta quando: os campos gravam e recarregam certo, a validação mostra erro no campo, os catálogos vêm da API, publicar gera versão, e o comportamento configurado aparece de fato na aba Testar.
