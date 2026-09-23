# PLAN_NOTE.md — checkpoint (não versionado)

## Entendimento
- `SPEC_V2.md`/`UI_SPEC_V2.md` do repo (backend) são a versão "antiga" do escopo; os arquivos em `Downloads` (SPEC_V2.md, UI_SPEC_V2.md, wizard-agente-ia.html) são uma versão "consolidada" muito maior (modelos de mensagem, produtos, mídia, humor do cliente, pesquisa de satisfação, botões dinâmicos, onboarding "Primeiros dias"). O fluxo de 12 etapas do "Agente completo" é o mesmo nas duas versões — a diferença é profundidade de campos dentro de cada etapa. Vou tratar o `UI_DIFF.md` atual (escopo já delimitado e mapeado ao schema real) como a lista de trabalho concreta desta tarefa, e reportar a divergência de spec no final sem implementar campos que não existem no `v2AgentConfigSchema` real sem confirmação.
- `docs/V2_STATUS.md` está desatualizado: diz que "nenhuma das 12 telas existe", mas o código (`[id]/client-page.tsx`, 2500+ linhas) já implementa as 12 etapas com boa cobertura. A tabela de campos (Ler/Citar/Atualizar) do passo "O que ele sabe" **já existe** como checkboxes — falta só valor de exemplo por campo.
- Há outro subagente concorrente validando o `Select` e editando `UI_DIFF.md`. Vou `git fetch/pull` antes de cada push e mesclar `UI_DIFF.md` por conteúdo (nunca sobrescrever a seção "Validação da correção do Select").

## Plano de execução
1. Aba **Testar**: reescrever `StepTestPublish` com bolhas de chat (estilo WhatsApp) + painel lateral "Por que respondeu isso?" (regra, assunto, tools+resultado, trechos RAG, ações executadas/descartadas+motivo).
2. Tabela de campos (`StepContext`): adicionar valor de exemplo por campo; confirmar rótulos amigáveis.
3. Passe de dicionário (jargão → termos simples) nas etapas restantes, seguindo a seção "Vocabulário" do `SPEC_V2.md`.
4. Corrigir bugs de regras no backend: `out_of_hours`, `contact_tag`, `survey_received` (hoje hardcoded/sempre falso em `engine.ts`).
5. Reordenação por arraste em Assuntos; campos a atualizar no encerramento (`StepClosure`).
6. Build local, commit, push para `feat/ai-simple-v2` (FE/BE), merge em `DEV_BRANCH` via worktrees, acompanhar Actions.
7. Screenshot das etapas alteradas via browser MCP no ambiente dev; atualizar `UI_DIFF.md`.

Seguindo direto para implementação.
