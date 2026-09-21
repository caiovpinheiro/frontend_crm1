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
| Campos do contato: selecionar quais o agente pode ler/alterar | Tabela com built-ins + catálogo de campos customizados | ✅ OK |
| Campos do negócio: selecionar quais o agente pode ler/alterar | Tabela com built-ins + catálogo de campos customizados | ✅ OK |
| Permissão por campo (só ler / ler e escrever) | Não há permissão por campo | FALTA |
| Variáveis explicadas com ícone ⓘ | Não há tooltips | FALTA |

**BUGS:**
- `organizationName` é campo próprio em vez de variável `@Nome da empresa` — pendente de alinhamento de schema/backend.

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
| Explicação do que são "Assuntos" (temas de atendimento) | Não há explicação | FALTA |
| Cada assunto com nome, descrição, prompt, regras, ferramentas permitidas | Cards existem | OK |
| Ordenação de assuntos | Não há drag | FALTA |
| Lista de ferramentas por assunto | MultiSelectPopover | OK |

---

## 8. Regras automáticas (rules)

| Protótipo | Tela atual | Status |
|---|---|---|
| Regras com condição e ação | Cards existem | OK |
| Condições: fora do horário, tag do contato, pesquisa recebida, campo atualizado | Condições listadas, mas 3 estão quebradas | BUG |
| Ações: encaminhar, enviar mensagem, aplicar tag, etc. | Ações listadas | OK |

**BUGS:**
- `out_of_hours`, `contact_tag`, `survey_received` não avaliam corretamente.

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
| Campos a atualizar no encerramento | Não há | FALTA |
| Botões no WhatsApp (habilitar) | Não há | FALTA |
| “Devolver para automação” ao encerrar | Não há | FALTA |

---

## 12. Testar e publicar (test)

| Protótipo | Tela atual | Status |
|---|---|---|
| Chat estilo WhatsApp com bolhas | Apenas input + botão Enviar | FALTA |
| Mensagens com status (digitando, enviado, lido) | Não há | FALTA |
| Painel “Bastidores deste turno” com regra, assunto, ferramentas, trechos, ações, motivo | Não há | FALTA |
| Simulação: origem da conversa, fora do horário, campos vazios, recomeçar | Não há | FALTA |
| Aprovar/enviar resposta em modo rascunho | Não há | FALTA |
| Checklist de preenchimento antes de publicar | Não há | FALTA |

**BUGS:**
- Teste retornava erro de schema `theme`/`tabulationId` (corrigido no backend).
- Valor do modo de execução salvo pode não bater com opções do select.

---

## Gerais / navegação

| Protótipo | Tela atual | Status |
|---|---|---|
| Check verde só quando etapa tem mínimo preenchido | `isStepComplete` valida preenchimento mínimo | ✅ OK |
| Sidebar com título + subtítulo por passo | Existe | OK |
| Botão “Dicionário da tela” com termos técnicos | Não há | FALTA |
| Rascunho salvo automaticamente | Botão “Salvar rascunho” | parcial |

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
