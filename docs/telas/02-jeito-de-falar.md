# Tela 2 — Jeito de falar

Etapa do wizard `/ai-agents-v2/[id]` que controla a **personalidade e o formato das respostas** do agente.

## Campos

### 1. Tom de voz
- **Campo na tela:** `Descrição do tom` (texto livre).
- **Caminho no schema:** `tone` (`string`).
- **Como o motor usa:** entra no início do *system prompt* enviado ao modelo, na seção `# Tom de voz`. Exemplos: "formal e respeitoso", "descontraído e direto".
- **Validação:** obrigatório (mínimo 1 caractere). Presets preenchem um tom padrão.

### 2. Tamanho das respostas
- **Campo na tela:** `Tamanho das respostas` (`Curtas`, `Médias`, `Detalhadas`).
- **Caminho no schema:** `responseLength` (`short` | `medium` | `long`, default `medium`).
- **Como o motor usa:**
  - Adiciona uma instrução no *system prompt* (`# Tamanho das respostas`) com o limite de tokens de saída.
  - Define o `maxOutputTokens` da chamada ao modelo:
    - `short` → 120 tokens
    - `medium` → 400 tokens
    - `long` → 1200 tokens
- **Nos bastidores:** a aba **Testar** mostra o rótulo amigável (`Curta`, `Média`, `Detalhada`) e o limite efetivo.

### 3. Regras gerais
- **Campo na tela:** `Regras gerais` (lista de textos, uma regra por item).
- **Caminho no schema:** `globalRules` (`string[]`).
- **Como o motor usa:** entram no *system prompt* na seção `# Regras globais`, **na ordem em que foram cadastradas**.
- **Regras padrão dos presets:** escritas em linguagem simples, sem jargão técnico. Exemplos:
  - "Só responda com base nos materiais, dados do cliente ou catálogo de produtos."
  - "Não diga que fez algo que ainda não foi feito."
  - "Se não souber a resposta, não invente: peça para transferir para um atendente."
  - "Nunca prometa ao cliente que você vai verificar algo e retornar depois. Se depender de outra pessoa ou de informação que não está nos materiais, transfira na hora para um atendente."

## Como o motor monta o texto

O *system prompt* enviado ao modelo inclui, nesta ordem:

1. `# Tom de voz`
2. `# Tamanho das respostas`
3. `# Regras globais`
4. `# Dados do cliente`
5. `# Informações fixas da empresa` (se houver variáveis)
6. `# Tema ativo` e instruções do tema (se houver)
7. `# Variáveis já coletadas` (se houver)
8. `# Etapa atual`
9. Tools disponíveis e formato obrigatório de saída JSON.

## Bastidores na aba Testar

Após cada resposta de teste, o painel **"Por que respondeu isso?"** mostra:

- **Tom aplicado:** o valor de `tone`.
- **Tamanho aplicado:** `Curta`, `Média` ou `Detalhada`.
- **Regras gerais enviadas:** lista exata das regras incluídas no *system prompt*.
- Também continua mostrando: regra aplicada, assunto, ferramentas chamadas, trechos dos materiais, ações e motivo.

## Roteiro para conferir no dev

1. Vá para **/ai-agents-v2/[id] › Jeito de falar**.
2. Defina **Tom de voz** = "Formal e respeitoso" e teste a mesma pergunta; depois mude para "Descontraído e direto" — as respostas devem ter jeito diferente.
3. Defina **Tamanho das respostas** = "Curtas" e faça uma pergunta; depois mude para "Detalhadas" — a segunda resposta deve ser claramente mais longa.
4. Adicione a regra **"Nunca informe prazos"** em Regras gerais, salve o rascunho e pergunte "Qual o prazo de entrega?" — o agente não deve informar um prazo.
5. Abra **"Por que respondeu isso?"** após uma resposta e confirme que aparecem: Tom, Tamanho e a lista de Regras gerais enviadas.
