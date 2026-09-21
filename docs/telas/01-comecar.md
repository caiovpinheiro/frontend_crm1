# Tela 1 — Começar + Testar

Especificação funcional da etapa "Começar" do wizard de agentes v2 e da aba "Testar".

## 1. Objetivo

Configurar a identidade, disponibilidade, modelo e limites de alcance de um agente v2,
mais permitir testar o agente antes de publicá-lo.

## 2. Campos — onde gravam e como o motor usa

| Campo na tela | JSON path | Obrigatório | Comportamento |
|---|---|---|---|
| Nome do agente | `name` | Sim | Nome exibido na lista e no header. |
| Ativo | `active` (top-level do registro) | Sim (default true) | Se `false`, o agente não responde em nenhum canal real. A aba Testar continua funcionando. |
| Chave de acesso ao modelo | `openaiApiKeyEnc` | Sim para publicar | Campo de senha, nunca preenchido com valor salvo. Botão "Testar chave" faz chamada mínima à OpenAI. Sem chave válida: publicar bloqueado. |
| Modelo | `model` | Sim | Select de modelos suportados. Valor salvo que não está mais na lista aparece com aviso. |
| Comportamento das respostas | `responseBehavior` | Sim | Preset de temperatura (`precise`, `balanced`, `natural`, `creative`). A aba Testar mostra o valor efetivo (`temperature`) nos bastidores. |
| Modo de execução | `autonomyMode` | Sim | `"suggest"` (padrão para novo agente) ou `"auto"`. Em `"suggest"`, nada é enviado ao cliente sem aprovação humana. |
| Canais vinculados | `channelIds` | Não | Multi-select do catálogo. O agente só responde nesses canais. |
| Responder só para estes números | `allowedPhoneNumbers` | Não | Lista de telefones. Se preenchida, o agente ignora qualquer outro número, mesmo ativo e com canal vinculado. |
| Domínios permitidos | `allowedDomains` | Não | Links fora da lista são removidos da resposta pelo backend. |
| Estado da publicação | `simpleConfig` vs `draftConfig` | Só leitura | "Publicado (versão X)" se `draftConfig === simpleConfig`; "Alterações não publicadas" se diferirem. A aba Testar usa o rascunho; o WhatsApp usa a versão publicada. |

## 3. Regras de UI

- **Aviso de cliente real**: quando `active=true`, `channelIds` não vazio e `allowedPhoneNumbers` vazio, mostrar alerta permanente:  
  **"Este agente vai responder clientes reais."**
- **Tamanho das respostas**: este controle **não fica** na etapa "Começar". Ele é movido para a etapa "Jeito de falar" (tela 2).
- **Aba Testar**:
  - Chat simples: mensagens do usuário à esquerda, respostas do agente à direita.
  - Painel de bastidores expandido abaixo da mensagem atual: modelo, temperatura, tokens (input/output), tempo de resposta, regra aplicada, assunto, ferramentas chamadas com resultados, trechos RAG, ações executadas/descartadas e motivo.
  - Se a chave estiver ausente/inválida, mostrar mensagem clara: "Configure uma chave válida para testar o agente" — sem stack trace.

## 4. Contrato com backend

- `GET /api/ai-agents-v2/catalogs` retorna `channels` e `models` (lista de modelos suportados).
- `GET /api/ai-agents-v2/:id` retorna `config` (rascunho se existir, senão publicada), `publishedConfig`, `draftConfig`, `hasUnpublishedChanges` e `lastVersionNumber`.
- `PUT /api/ai-agents-v2/:id` atualiza `name`, `active` e `openaiApiKey`.
- `PUT /api/ai-agents-v2/:id/draft` salva `draftConfig`.
- `POST /api/ai-agents-v2/:id/publish` copia `draftConfig` para `simpleConfig`, ativa o agente e cria um registro de versão.
- `POST /api/ai-agents-v2/:id/validate-key` testa a chave OpenAI salva ou digitada (chamada mínima à OpenAI).
- `POST /api/ai-agents-v2/:id/test` recebe `{userMessage, history?}` e retorna `{reply, model, temperature, tokens, latencyMs, rule, theme, toolCalls, ragSnippets, actions, reason}`. Retorna `400 NO_OPENAI_KEY` se não houver chave.

## 5. Roteiro de teste

Executar no dev e anexar print de cada item:

a. Preencher todos os campos, salvar (salvar rascunho), atualizar a página: todos os valores voltam iguais.  
b. Sem chave configurada: aba Testar mostra mensagem clara de bloqueio; botão Publicar desabilitado com tooltip "Configure uma chave de modelo válida".  
c. Chave inválida: botão "Testar chave" mostra "Falhou — verifique a chave".  
d. Com chave válida, enviar "oi" na aba Testar: resposta real e painel de bastidores mostra modelo, temperatura, tokens e tempo.  
e. Trocar Comportamento de "Mais objetivo" para outro: reenviar "oi" e ver no painel que a temperatura mudou.  
f. Ativo, canal vinculado e meu número na lista de teste: mensagem do meu WhatsApp recebe resposta; mensagem de outro número no mesmo canal NÃO recebe (conferir nos logs).  
g. Desativar agente: mensagem no canal real não recebe resposta; aba Testar continua respondendo.  
h. Modo sugestão: mensagem no WhatsApp gera sugestão para aprovar e NÃO é enviada sozinha ao cliente.

## 6. Testes automatizados

Cobrir os cenários b, f, g e h com testes de integração ou E2E no frontend, conforme padrão do repo.
