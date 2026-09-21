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
| Nome do agente + hint "É o nome que o cliente vê" | Campo com label simples | OK, falta hint |
| Canal escolhido de uma **lista** (WhatsApp/Instagram/Messenger) do catálogo | Input de texto pedindo ID do canal | FALTA |
| Modelo escolhido de uma **lista** (Em branco, Atendimento, Vendas, etc.) | Modelo é só um select de fluxo; não aparecem presets como cards | FALTA |
| Cards de modelo com tags do que inclui | Não há cards | FALTA |
| Dica "Não achou? Escolha Em branco" | Não há | FALTA |

**BUGS:**
- Comportamento, Tamanho e Modo (passo 1/2) aparecem vazios quando há valor salvo — mapping label/valor incorreto.

**EXTRA:**
- Campo "Chave OpenAI" aparece no passo 1. Protótipo não mostra (pode ficar em Avançado ou ser lida do backend).

---

## 2. Jeito de falar (tone)

| Protótipo | Tela atual | Status |
|---|---|---|
| Tom como **botões chip** (Acolhedor, Direto, Formal, Descontraído, Técnico) | Textarea livre | FALTA |
| Descrição do tom em textarea separada | Apenas textarea "Descrição do tom" | FALTA separar |
| Tamanho da resposta como **botões chip** (Curtas, Médias, Detalhadas) | Select nativo | FALTA |
| Prévia de mensagem com bolha de chat que muda conforme tamanho | Sem prévia | FALTA |
| Regras como lista de inputs com botão de adicionar/remover | ChipInput existe, OK | OK |
| Dica amigável "Escreva como orientaria alguém novo" | Não há | FALTA |

**BUGS:**
- Selects aparecem vazios se valor salvo não bate com opção.

---

## 3. O que ele sabe (data)

| Protótipo | Tela atual | Status |
|---|---|---|
| Tabela: Campo / Ler / Citar / Atualizar, uma linha por campo | Tabela existe, mas headers flutuam; layout confuso | BUG |
| Rótulos do CRM ("Nome", "Telefone") em vez da chave técnica | Mostra `name`, `phone`, `email`, `stage` como chaves | BUG |
| Valor de exemplo do contato embaixo do nome do campo | Não mostra valor exemplo | FALTA |
| “Usar o mais recente” / “Perguntar ao cliente” para múltiplos negócios | Não há controle | FALTA |
| Mídia (áudio, imagem, documento) com opções em português legíveis | Selects existem, mas com valores técnicos | BUG/parcial |
| Informações fixas da empresa (@Nome etc) com chave/valor | Existe como "Informações fixas" | OK |

**BUGS:**
- Campos vazios em selects de mídia.
- Tabela não usa rótulos do CRM.

---

## 4. Materiais de consulta (docs)

| Protótipo | Tela atual | Status |
|---|---|---|
| Dropzone grande “Arraste arquivos aqui” | Input file simples | FALTA |
| Botão “Criar texto” para FAQ curto | Não há | FALTA |
| Tabela: Material / Situação / Usado nos assuntos / Ações | Lista simples de docs com badge Usado/Não usado | FALTA |
| Situação “Processando…” / “Pronto” | Não mostra status de indexação | FALTA |
| “Testar busca” com pergunta e trecho encontrado | Não há | FALTA |

**BUGS:**
- Upload de PDF é aceito na UI mas rejeitado no backend.

---

## 5. Mensagens e produtos (msgs)

| Protótipo | Tela atual | Status |
|---|---|---|
| Toggle “Usar mensagens prontas” | Toggle “Falar de produtos” está; mensagens prontas sem toggle | FALTA |
| Opção “Enviar como está” / “Pode adaptar levemente” | Não há | FALTA |
| Lista de modelos do CRM como chips toggle | MultiSelectPopover existe | parcial |
| Templates oficiais aprovados na Meta como chips | Não mostra templates oficiais separados | FALTA |
| Prévia do modelo preenchida com variáveis | Não há prévia | FALTA |
| Produtos: quantos por vez, filtro, o que mostrar, ações com o produto | Quantos por vez e toggles de exibição existem, mas sem ações | parcial |
| Prévia do produto | Não há | FALTA |

---

## 6. Início da conversa (start)

| Protótipo | Tela atual | Status |
|---|---|---|
| “Como a conversa chega”: cliente / automação / pessoa (botões) | Toggle simples “Enviar boas-vindas” | FALTA |
| Editor de mensagem com botões para inserir campos (@Nome) | Textarea simples | FALTA |
| Trecho condicional entre { } com aviso “só aparece se tiver valor” | Não há | FALTA |
| Opção “cliente sem campo preenchido” na prévia | Checkbox de simulação parcial | parcial |
| Confirmação do cadastro com opções confirmar/só ler/não usar dados | Switch booleano apenas | FALTA |
| Se não encontrar: pedir dado / criar negócio / encaminhar | Existe, mas select vazio | BUG |
| Prévia da conversa com bolhas | Não há | FALTA |

---

## 7. Assuntos (subjects)

| Protótipo | Tela atual | Status |
|---|---|---|
| Lista vertical de assuntos com nome + gatilho + badge “Passa direto” | Cards colapsados | parcial |
| Editor: nome, quando usar, exemplos, como agir | Existe, mas exemplos são ChipInput sem Enter inline | parcial |
| “O que ele pode fazer neste assunto” com checkboxes de ações legíveis | Existe como checkboxes de tools técnicas | FALTA rótulos |
| Materiais do assunto como chips dos docs enviados | MultiSelectPopover existe | OK |
| Quem responde: este agente / especialista / criar novo | Select existe | parcial |
| Mapa do atendimento (botão) | Não há | FALTA |
| Passar direto, sem conversar | Toggle existe | OK |

---

## 8. Regras automáticas (rules)

| Protótipo | Tela atual | Status |
|---|---|---|
| Regra exibida como “Quando … Então …” legível | Mostra selects de condição/ação técnicos | FALTA |
| Reordenar (subir/descer) | Não há | FALTA |
| Ativar/desativar toggle por regra | Não há | FALTA |
| Condições: palavras-chave, etiqueta, fora de horário, áudio, etc. | Apenas keywords, contact_tag, out_of_hours, survey_received | parcial |

**BUGS:**
- Selects de condição e ação aparecem vazios.

---

## 9. Saídas (fallback)

| Protótipo | Tela atual | Status |
|---|---|---|
| Quando não souber responder + ação depois | Existe, mas select vazio | BUG |
| Quando cliente pedir pessoa | Existe | OK |
| Quando resposta não estiver nos materiais | Existe | OK |
| Quando der erro no sistema | Existe | OK |
| Quando parar de responder (cortesia, ofertas, trocas sem avanço, nonsense, silêncio) | Existe como números puros | parcial |
| Fora do escopo + assuntos proibidos | Não há | FALTA |
| Humor do cliente (irritado/insatisfeito) | Existe | parcial |
| Resumo das saídas em check-row | Não há | FALTA |

---

## 10. Equipe e horários (team)

| Protótipo | Tela atual | Status |
|---|---|---|
| Destino de transferência padrão com catálogo | DestinationPicker existe | OK |
| Mensagem “ao transferir” (não “handoff”) | Label ainda “Mensagem de handoff” | BUG texto |
| Palavras-chave de pedido humano (protótipo removeu desta tela) | Ainda aparece | EXTRA |
| Horário de atendimento com dias e horas | Existe | OK |
| Inatividade: lembrete e encerramento | Existe | OK |

---

## 11. Encerrar e classificar (tabul)

| Protótipo | Tela atual | Status |
|---|---|---|
| Pós-encerramento: janela, cortesia, demanda nova, ambíguo | Existe | OK |
| Tabulação com mapping demanda→tabulação | Apenas toggle + quando + obrigatório | parcial |
| Pesquisa de satisfação (nota, quando, pergunta, motivo, frequência) | Existe | parcial |
| Botões no WhatsApp (habilitar) | Não há | FALTA |
| “Devolver para automação” ao encerrar | Não há | FALTA |

**BUGS:**
- Selects de comportamento pós-encerramento aparecem vazios.

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
| Check verde só quando etapa tem mínimo preenchido | Check verde por visita | BUG |
| Sidebar com título + subtítulo por passo | Existe | OK |
| Botão “Dicionário da tela” com termos técnicos | Não há | FALTA |
| Rascunho salvo automaticamente | Botão “Salvar rascunho” | parcial |
