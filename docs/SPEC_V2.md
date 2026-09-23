# Motor de Agentes v2 — Especificação consolidada (v1 de escopo)

Documento **único e completo**. Substitui e incorpora todos os complementos anteriores.
Fonte da verdade para o entendimento do CRM, o plano de construção e a interface.
Protótipo navegável da interface: referência de comportamento e de vocabulário.

---

## 1. Objetivo e critério de sucesso

Motor de agentes **genérico** dentro do CRM, simples de manter, com as capacidades do motor atual (v1), porém:
- 100% configurável, sem código de domínio de nenhum cliente;
- fácil de ajustar (toda resposta ruim tem um "porquê" e um lugar para corrigir);
- integrado às features do CRM: departamentos, distribuição inteligente, campos, tabulações, automações, **modelos de mensagem** e **catálogo de produtos**.

**Critério de sucesso:** todo o comportamento atual da organização de referência (`docs/inventory/INVENTORY_CRUZEIRO.md`) deve ser reproduzível **apenas com configuração**.

**Fora de escopo nesta v1:** sincronização automática de departamentos; cockpit de vertical da tela antiga; painel analítico de qualidade; mensagens proativas em massa (campanha).

---

## 2. Princípios

1. Fluxo determinístico em código; o LLM classifica e escreve, nunca decide transição.
2. Nada de domínio no código ou em presets.
3. Um caminho de código só: agente único é um fluxo sem roteamento.
4. Proibido interceptor, hook implícito ou condicional por cliente. Comportamento novo = config, ferramenta ou bloco documentado aqui.
5. O agente nunca afirma ação que não executou nem responde o que não está nos materiais, nos dados do cliente ou no catálogo.
6. Rastro (trace) por turno desde o primeiro dia.
7. A conversa fica presa à versão de config com que começou.
8. Regras de escopo, limites e paradas são validadas **em código**, não só por instrução no prompt.

**Reaproveitar da v1 (nível runner):** `generateWithTools`, `FACTORY_MAP`, `tool-governor`, RAG (upload, `embeddings.ts`, `retrieval.ts`, pgvector), `executeDistribution`, `crm-field-policy`, record sources, `sendAgentMessage`, Turn Manager, tabulações, modelos de mensagem (`message-models-retrieval`), catálogo de produtos (`search_products`), templates de WhatsApp.
**Não reaproveitar:** `inbox-handler`, `verticals/*`, interceptors, pilotagem legada, `message-rules`, `coordinator-*`, `effect-claims`, `closure.ts`.

---

## 3. Blocos do motor

### 3.1 Contexto e identificação
- Identificação pelo telefone do canal → contato → negócios.
- Campos de contato e de negócio do catálogo do CRM, com **três permissões por campo**: ler, citar, atualizar (`crm-field-policy`).
- Record sources adicionais só quando explicitamente selecionadas na config do agente.
- Vários negócios abertos: usar o mais recente ou perguntar (lista montada dos dados reais).
- Cliente não encontrado: pedir dado (N tentativas), criar contato/negócio, encaminhar, ou passar para humano.

### 3.2 Variáveis
Pares chave/valor por agente (`@Nome da empresa`, `@Link da área do cliente`), usáveis em mensagens, regras, temas e prompt.

### 3.3 Entrada da conversa
| Origem | Comportamento |
|---|---|
| Cliente iniciou | Abertura + confirmação conforme config |
| Automação / chatbot | Sem abertura; recebe histórico e variáveis coletadas; pode vir com tema inicial |
| Pessoa ou outro agente | Sem abertura; recebe resumo, dados confirmados e motivo; continua de onde parou |

O agente é **destino de automação** ("transferir para agente X", com variáveis) e pode devolver a conversa a uma fila ou automação ao encerrar.

### 3.4 Mensagens com trecho condicional
`Vi que você está em @Curso{, desde @Data de início}` — o trecho entre chaves só aparece se todos os campos citados tiverem valor. Nunca renderizar campo vazio nem marcador cru. Formatação por tipo (data, moeda, número, lista). Vale para abertura, confirmação, transferência, regras, despedida, modelos de mensagem e pesquisa.

### 3.5 Mídia recebida (áudio, imagem, documento)
- Toda mídia é convertida em texto **antes** das regras automáticas; o texto entra no turno como mensagem do cliente.
- Config por tipo: áudio (transcrever | transferir | pedir para escrever); imagem (descrever a cena | ler o texto | transferir | pedir descrição); documento (ler o texto | transferir | pedir outro formato). Cada opção com mensagem configurável.
- "Confirmar o entendimento antes de agir" (padrão ligado): com mídia, o agente confirma em palavras antes de qualquer ação de efeito ou transferência.
- Saída própria para "não consegui entender a mídia" (áudio ruim, imagem ilegível, formato ou tamanho não suportado).
- Texto extraído vai para o trace e, opcionalmente, para anotação no negócio. Limites de tamanho e duração configuráveis. Verificar provider já existente antes de propor novo.

### 3.6 Regras determinísticas
Lista ordenada avaliada **antes** do LLM; a primeira que casar vence.
- Condições: tipo de mensagem, palavras-chave (inclusive sobre texto extraído de mídia), etiqueta do contato, primeira mensagem, fora do horário, etapa do negócio, campo igual a valor, cliente sem negócio, nota de satisfação recebida.
- Ações: mensagem fixa, transferir (destino completo), etiquetar, forçar tema, encerrar, não responder, enviar modelo de mensagem.

### 3.7 Temas (especialidades)
Por tema: nome, quando usar, exemplos, instruções, ferramentas permitidas, documentos permitidos, **modelos de mensagem permitidos**, **política de produtos**, destino de transferência, condição de escalar, quem responde (este agente ou outro agente) e tabulação sugerida. Opção "transferir direto, sem conversar".
O turno usa só o que é do tema selecionado, mais tom e regras globais.

### 3.8 Ferramentas
Loop real de function calling com o registry da v1.
- **Consulta:** `search_products`, `search_crm_records`, `knowledge_search`, `list_message_models`, `list_tabulations` — resultado volta ao modelo antes da resposta.
- **Efeito:** `create_deal`, `add_tag`, `create_activity`, `move_stage`, `update_field` (restrito aos campos com permissão de escrita), `add_note`, `send_message_model`, `send_product`, `send_whatsapp_template`, `ask_with_options`, `close_conversation`, `tabulate_conversation`, handoff.
- Allowlist por tema, limite de chamadas por turno, tudo no trace.

### 3.9 Conhecimento (RAG)
Upload por agente reaproveitando `AIAgentKnowledgeDoc`/`Chunk` e `retrieveAgentKnowledge`; **adicionar suporte a PDF** em `knowledge-extract`. Documentos associados a temas, busca filtrada pelo tema, "testar busca" na UI. Campo de texto livre opcional.

### 3.10 Modelos de mensagem (mensagens prontas do CRM)
O agente usa os modelos já cadastrados, em vez de escrever do zero, para ficar igual ao que a equipe manda.
1. Dois tipos: **modelo interno** (texto salvo no CRM, com variáveis) e **template oficial do WhatsApp** (aprovado, obrigatório fora da janela de 24h).
2. Seleção: allowlist de modelos por tema; o agente escolhe o mais próximo do assunto (busca semântica, reaproveitando `message-models-retrieval`). Se nenhum for adequado, escreve a resposta normalmente.
3. Preenchimento: variáveis do modelo resolvidas com campos do contato e do negócio (respeitando "citar"), variáveis fixas do agente e trechos condicionais. Variável obrigatória sem valor = modelo descartado, com registro no trace.
4. Modo de uso configurável por agente ou por tema: **enviar como está** (fidelidade total) ou **pode adaptar levemente** (ajusta saudação e conectivos, sem alterar informação, valores, prazos ou links).
5. Templates oficiais: usados automaticamente quando a janela de 24h expirou e há template aprovado equivalente; sem template, o agente não envia e registra a saída correspondente. Nunca inventar texto de template.
6. Anexos do modelo (imagem, PDF) são enviados junto quando existirem.
7. Trace: qual modelo foi usado, versão, variáveis preenchidas, se foi adaptado, e por que não usou modelo quando escreveu livre.

### 3.11 Produtos do catálogo
Para agentes de venda e para qualquer tema que precise informar produto.
1. Fonte única: catálogo do CRM (`search_products`). O agente **nunca** inventa nome, preço, condição, prazo ou disponibilidade; se não achou, aplica a saída "não está nos materiais".
2. Política de apresentação por agente e por tema: quantos produtos por vez (padrão 3), mostrar preço ou não, mostrar condições/parcelamento, incluir imagem, incluir link, quais campos do produto podem ser citados, filtro fixo (categoria, pipeline, produto ativo).
3. Envio: mensagem de produto com nome, preço formatado pelo CRM, características principais, imagem e link; quando o canal oficial permitir, usar mensagem de produto/catálogo; caso contrário, texto + imagem, sem perder informação.
4. Ações ligadas ao produto (na allowlist do tema): vincular produto ao negócio, criar negócio com o produto, mover etapa, registrar interesse, enviar modelo de mensagem de proposta.
5. Preço só é citado se o campo estiver liberado e o produto estiver ativo. Produto inativo ou sem preço: tratar como indisponível, com mensagem configurável.
6. Trace: consulta feita, produtos retornados, quais foram enviados e por quê.

### 3.12 Opções e botões (incl. dinâmicos)
1. Ferramenta `ask_with_options`: pergunta + opções `{label, target}`. `target` só pode ser: tema do agente, ação da allowlist do tema, registro retornado por consulta no mesmo turno (negócio, produto, horário), valor de campo permitido, encerrar ou continuar. Target inválido = opção descartada e registrada.
2. O código monta: label truncado em 20 caracteres, sem duplicados, até 3 = botões, 4 a 10 = lista, acima de 10 = reduzir ou texto numerado.
3. Conjuntos de origem automática (sem o modelo): negócios abertos, produtos retornados, temas, tabulações, encerrar/continuar, notas da pesquisa.
4. Fallback: canal não oficial, fora das 24h ou acima do limite → lista numerada; resposta por número **ou** pelo texto do rótulo resolve o mesmo target; fora das 24h usar template aprovado quando existir.
5. Conjunto de opções persiste com o turno (id, targets, validade). Clique expirado ou target inexistente → mensagem configurável e refazer a pergunta; nunca inferir.
6. Clique resolvido de forma determinística pelo código, sem passar pelo modelo.
7. Config: usar botões (on/off), permitir opções criadas pelo agente (on/off), máximo de perguntas com opções por turno, validade, mensagem de opção expirada.

### 3.13 Dono da conversa
Estado explícito: **pessoa | automação | agente | ninguém**. Só o dono envia mensagem; os demais ficam em silêncio. Toda troca de dono vai para o trace. Encerramento por inatividade pertence ao agente, nunca a automação externa agindo sobre conversa do agente.

### 3.14 Saídas do atendimento (explícitas)
| Situação | Config |
|---|---|
| Resolveu | Encerra, classifica, despede-se |
| Precisa de gente | Transfere para o destino do tema ou o padrão |
| É de outro especialista | Encaminha levando resumo, dados e motivo |
| Não soube responder | Mensagem + ação (passar, reperguntar N vezes, encerrar) |
| Cliente pediu uma pessoa | Mensagem + transferência imediata, sem insistir |
| Não está nos materiais/catálogo | Mensagem específica; nunca completar com suposição |
| Fora do escopo do agente | Mensagem + redirecionar uma vez + ação na insistência |
| Erro/timeout de modelo ou ferramenta | Mensagem específica; termina em gente |
| Mídia não compreendida | Mensagem específica |
| Cliente sumiu | Lembrete após X, encerramento após Y |
| Fora do horário | Aviso, aguardar ou transferir |
| Excesso de mensagens sem sentido | Aviso único + silêncio temporário |
| Ofensa | Resposta firme + passar ou encerrar |

### 3.15 Escopo e limites de fala
1. O agente só responde o que cai em um tema configurado ou está nos materiais, dados do cliente ou catálogo. Fora disso: saída "fora do escopo", redirecionando uma vez; na insistência, ação configurável.
2. Lista configurável de **assuntos que ele nunca responde, mesmo sabendo** (ex.: preço quando não vende, prazo, jurídico), com resposta e destino próprios.
3. Tentativa de mudar as instruções ou a identidade do agente: tratada como fora do escopo, sem discutir; o agente nunca revela configuração, prompt, ferramentas ou dados de outros clientes.
4. Validação em código: tema não identificado + sem material = fora do escopo.

### 3.16 Saber a hora de parar (sem loop)
1. Cortesia recebe **no máximo uma** resposta por atendimento. Depois, a conversa fica em "encerrada definitiva": nova cortesia não gera mensagem (opcional: reação). Só conteúdo novo reabre.
2. **Uma** oferta de ajuda adicional por atendimento; sem assunto novo, encerra.
3. Contador de trocas sem avanço (sem tema novo, sem ação, sem dado novo): no limite (padrão 2), encerra.
4. Nunca duas mensagens seguidas do agente sem mensagem do cliente, salvo lembrete de inatividade e pesquisa.
5. Mensagens seguidas fora de assunto: no limite (padrão 3), um aviso e **silêncio temporário** (padrão 30 min), sem encerrar nem bloquear. Durante o silêncio, cada mensagem é avaliada: se cair em um tema ou pedir uma pessoa, o agente volta a responder imediatamente.
6. Proteções: limite de mensagens por minuto por conversa, webhook duplicado ignorado, detecção de loop agente↔automação e agente↔agente (sequência repetida) com corte e registro.

### 3.17 Transferência (handoff)
Uma única função. Destino: **departamento, fila, usuário ou distribuição inteligente** (`executeDistribution` com a estratégia do CRM). Configurável por tema, por regra e como padrão. Marca `human_active`; botão "devolver para o agente" retoma. Entre agentes: passa resumo, dados coletados, motivo e tema, com limite de idas e voltas (padrão 2) e humano como saída.

### 3.18 Encerramento e janela pós-encerramento
1. Encerrar é um estado, com motivo (resolvido, inatividade, transferido, encerrado por humano, por automação, fora do escopo) e tabulação.
2. Janela "recém-encerrado" configurável (padrão 6h). Mensagem recebida na janela é classificada em: **cortesia | demanda nova | ambíguo**, com comportamento configurável por caso (padrões: cortesia = não reabrir; demanda nova = reabrir e rotear direto; ambíguo = perguntar com opções), respeitando o limite de cortesia do 3.16.
3. Ao encerrar: devolver o negócio à etapa anterior (etapa de origem guardada no estado), despedida opcional, devolver para automação opcional.

### 3.19 Tabulação
Tabulações do CRM (`list_tabulations` / `tabulate_conversation`). Config: quando classificar (encerrar, transferir ou ambos), tabulação de reserva, "não encerrar sem classificar", mapa tema → tabulação sugerida, e se classifica automaticamente ou sugere para a pessoa confirmar. O agente classifica pelo **motivo real** da conversa inteira, inclusive turnos de humanos, não pelo tema inicial.

### 3.20 Humor do cliente
Liga/desliga. Config: limite (qualquer insatisfação | irritado ou muito insatisfeito | só ameaça de cancelar/reclamar), ação (passar para uma pessoa na hora | avisar a equipe e continuar | só registrar), falar com mais cuidado quando perceber irritação, etiquetar o contato, avisar responsável ou supervisor. Registro por turno no trace.

### 3.21 Pesquisa de satisfação
Liga/desliga. Config: tipo de nota (0–10, 1–5, gostei/não gostei), quando perguntar (na hora, X horas depois, dia seguinte), pergunta, perguntar o motivo, não perguntar quando o atendimento terminou com pessoa, frequência máxima por cliente. Nota e motivo gravados no contato e no negócio; nota pode disparar regra automática.

### 3.22 Guardas, privacidade e custo
1. Domínios autorizados: links fora da lista removidos e registrados.
2. Modo de autonomia: autônomo ou rascunho (humano aprova).
3. Dados sensíveis: lista do que o agente nunca pede (senha, cartão, documento em foto quando não necessário); mascarar no trace; retenção configurável de transcrições de mídia.
4. "Não quero falar com robô": transferência imediata, sem negociar.
5. Permissões: quem edita rascunho e quem publica; especialistas editáveis pelo time dono.
6. Custo: teto por agente e por organização, comportamento ao estourar (transferir tudo para humano) e alerta; chave por agente com fallback configurável.

### 3.23 Preset "Primeiros dias" (onboarding de cliente novo)
Preset genérico para o momento em que alguém acabou de virar cliente e o cadastro pode estar vazio ou incompleto. Usa o mesmo motor: **etapa do início = tema com objetivo e destino de gravação**.
1. **Etapas do início** (no lugar de "assuntos"): lista ordenada; cada etapa tem nome, objetivo, mensagem de abertura, o que coletar ou confirmar, critério de conclusão (campo preenchido, resposta do cliente, etapa do funil, ação executada), materiais e ações permitidas, e destino se travar. O agente conduz uma etapa por vez, aceitando o que o cliente trouxer fora de ordem.
2. **Funcionar com pouca informação:** o agente nunca assume dado que não existe. Config para negócio vazio ou incompleto: perguntar ao cliente | usar texto genérico | pedir para uma pessoa completar. Toda confirmação usa trechos condicionais (3.4); campo sem valor não é citado.
3. **Lacunas de conhecimento:** pergunta sem resposta nos materiais é registrada como lacuna (pergunta, etapa, frequência) e listada na tela do agente, com botão para virar material. Enquanto isso, aplica a saída "não está nos materiais", sem improvisar.
4. **Acompanhamento:** lembrete por etapa parada, prazo configurável, limite de tentativas (padrão 2) e ação ao esgotar (avisar pessoa | transferir | encerrar). Fora das 24h usa template aprovado; sem template, cria tarefa para uma pessoa.
5. **Saída do onboarding:** concluídas as etapas, executa ações configuradas (mover etapa do funil, atualizar campo, etiquetar) e entrega para outro agente (normalmente o de atendimento) ou encerra. Travou: transfere conforme config.
6. **Progresso visível:** percentual de etapas concluídas por cliente e onde cada um parou, na tela do agente.

### 3.24 Observabilidade
Trace por turno: origem da conversa, dono, regra aplicada, tema, contexto do CRM usado, trechos do RAG, modelo de mensagem usado, produtos consultados/enviados, ferramentas e resultados, opções enviadas e clicada, humor, JSON de saída, motivo, tabulação, latência, tokens, erros. Versões de config (`AIAgentConfigAudit`) com reverter. Marcar resposta ruim vira caso de teste do agente.

---

## 4. Agrupamento e canal
- Toda conversa da v2 usa o **Turn Manager persistente**, independente da flag `AI_TURN_MANAGER`. Agentes v1 não mudam.
- Nada da v1 (worker de inatividade, interceptors, jobs) age em conversas da v2.
- Respostas longas quebradas em mensagens; indicador de digitação; no modo rascunho nada é enviado antes da aprovação; janela de 24h respeitada para interativos e templates.

---

## 5. Contrato de saída do LLM

```json
{
  "reply": "texto para o cliente (vazio quando usa modelo de mensagem)",
  "theme": "id do tema",
  "message_model": "id do modelo de mensagem ou null",
  "handoff": false,
  "concluded": false,
  "confirmed": null,
  "out_of_scope": false,
  "sentiment": "neutro | insatisfeito | irritado",
  "tabulation": "id da tabulação ou null",
  "collected": { "campo": "valor" },
  "reason": "por que respondeu assim"
}
```
Validado com zod. Saída inválida: uma nova tentativa; falhando, aplica a saída de erro.

---

## 6. Papéis de agente e fluxos do wizard

**Recepção (organiza o atendimento)** — primeiro atendimento: identifica, confirma, encaminha. Não responde dúvidas.
`Começar · Jeito de falar · Reconhecer o cliente · Para quem encaminha · Regras automáticas · Saídas · Encerrar e classificar · Testar e publicar`

**Agente completo (atendimento, vendas, SDR, suporte, especialista)**
`Começar · Jeito de falar · O que ele sabe · Materiais · Mensagens prontas e produtos · Início da conversa · Assuntos · Regras automáticas · Saídas · Equipe e horários · Encerrar e classificar · Testar e publicar`

**Primeiros dias (onboarding)** — acompanha o cliente novo até ele estar rodando, mesmo com cadastro incompleto.
`Começar · Jeito de falar · O que ele sabe · Etapas do início · Quando faltar informação · Acompanhamento · Saídas · Encerrar e entregar · Testar e publicar`

Especialistas **herdam** do agente de origem: tom, regras globais, campos do CRM, variáveis, links permitidos, limites e escopo — com opção de sobrescrever.

### Telas (conteúdo essencial)
1. **Começar** — nome, canal, modelo (Recepção, Atendimento, Primeiros dias, Qualificar contatos novos, Vendas, Suporte técnico, Em branco).
2. **Jeito de falar** — tom, tamanho da resposta, regras globais, prévia.
3. **O que ele sabe / Reconhecer o cliente** — campos com ler/citar/atualizar e valor de exemplo; vários negócios; cliente fora da base; variáveis fixas; mídia recebida.
4. **Materiais** — upload, situação, associação a temas, testar busca.
5. **Mensagens prontas e produtos** — modelos do CRM permitidos (com prévia preenchida), enviar como está ou adaptar, templates oficiais; catálogo: política de apresentação, campos citáveis, filtros, ações ligadas ao produto.
6. **Início da conversa** — origem (cliente, automação, pessoa), abertura, confirmação com trecho condicional e botões, identificação, variáveis da automação.
7. **Assuntos / Para quem encaminha** — por tema: quando usar, exemplos, instruções, ferramentas, materiais, modelos, produtos, destino, quem responde, tabulação. Botão "mapa do atendimento".
8. **Regras automáticas** — lista ordenável "Quando… Então…".
9. **Saídas** — não sabe, pediu pessoa, sem material, fora do escopo, erro, mídia; assuntos proibidos; humor do cliente; **quando parar de responder** (limites de cortesia, trocas sem avanço, mensagens sem sentido, silêncio temporário, ofensa); resumo das saídas.
10. **Equipe e horários** — destino padrão, mensagem, horários e feriados, inatividade.
11. **Encerrar e classificar** — dono da conversa, janela pós-encerramento (3 casos), tabulação, botões, pesquisa de satisfação, ao encerrar.
12. **Etapas do início / Quando faltar informação / Acompanhamento / Encerrar e entregar** (fluxo Primeiros dias) — lista ordenada de etapas com critério de conclusão e campo de destino; comportamento com cadastro vazio; lacunas de conhecimento registradas; lembretes por etapa com limite; ações e entrega ao concluir; progresso por cliente.
13. **Testar e publicar** — simulação fiel ao canal (agrupamento, digitação, rascunho pendente, botões clicáveis, transferências, encerramento e pesquisa), painel "por que respondeu isso?" com atalho para editar tema ou regra, modo de envio, links permitidos, checklist, publicar.

### Vocabulário (código → tela)
`preset` → Modelo · `tone` → Tom de voz · `global_rules` → Regras que ele sempre segue · `context_fields` → Campos do contato e do negócio · `variables` → Informações fixas da empresa · `knowledge/RAG` → Materiais de consulta · `message models` → Mensagens prontas · `products` → Produtos do catálogo · `entry point` → Como a conversa chega · `confirm_deal` → Confirmar o cadastro · `themes` → Assuntos / Demandas · `tools allowlist` → O que ele pode fazer · regras determinísticas → Regras automáticas · `executeDistribution` → Distribuição inteligente · `handoff` → Passar para uma pessoa · `transfer_to_ai_agent` → Passar para um especialista · `human_active/release` → Equipe atendendo / Devolver para o agente · `tabulate_conversation` → Classificar o atendimento · `sentiment` → Humor do cliente · `NPS/CSAT` → Pesquisa de satisfação · `interactive buttons` → Botões no WhatsApp · `autonomyMode DRAFT` → Sugerir resposta para aprovar · `trace` → Por que respondeu isso? · `playground` → Conversa de teste · `onboarding steps` → Etapas do início · `knowledge gap` → O que ele ainda não sabe · `follow-up agendado` → Acompanhamento.

---

## 7. Catálogos do CRM (nunca fixos no código)
Departamentos, filas, usuários, estratégias de distribuição, pipelines e etapas, campos de contato e negócio (padrão e personalizados), tabulações, **modelos de mensagem**, **templates oficiais aprovados**, **catálogo de produtos**, automações, canais, horários.
Carregados por API na tela de configuração. A config guarda **ids**; a tela mostra nomes; id inexistente gera aviso na tela e no trace.

---

## 8. Convivência e migração
- Flag `engine: legacy | simple` por agente decide o caminho da mensagem.
- Migração agente por agente, com conversor do que der e relatório do que precisa de ajuste manual.
- Quando nenhum agente usar `legacy`, apagar o motor antigo (não comentar).

---

## 9. Testes mínimos
Regras determinísticas (ordem e condições) · loop de ferramentas · allowlist por tema · escrita restrita a campos permitidos · RAG filtrado por tema · mensagem com campo vazio · modelo de mensagem com variável faltando · adaptação vs envio literal · template fora das 24h · produto sem preço e produto inativo · limite de produtos por vez · transferência por distribuição inteligente · transferência entre agentes e limite de idas e voltas · conversa vinda de automação com variáveis · cliente fora da base nos três modos · saídas (não sabe, pediu pessoa, sem material, fora do escopo, erro, mídia) · áudio transcrito roteando certo · imagem com texto lido · opções: target inválido, mais de 3 virando lista, fora das 24h numerado, clique expirado, resposta por número e por rótulo · cortesia recebendo uma única resposta · oferta única de ajuda · silêncio temporário e retorno com mensagem válida · detecção de loop · tabulação ao encerrar e ao transferir · devolução de etapa · humor disparando ação · pesquisa de satisfação com nota e motivo · agrupamento pelo Turn Manager · v1 não afetada · catálogo com id inexistente · teto de custo · onboarding: negócio vazio, negócio parcial, cliente respondendo fora de ordem, etapa travada, lembrete esgotado, lacuna registrada, entrega ao agente de atendimento.
