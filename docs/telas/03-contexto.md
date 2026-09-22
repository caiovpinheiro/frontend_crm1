# Tela 3 — O que ele sabe (parte A: campos do cliente)

Etapa do wizard `/ai-agents-v2/[id]` que define **quais campos do contato e do negócio** o agente pode acessar e como.

## Campos

### Campos do contato / Campos do negócio
Tabela com as colunas:

| Coluna | O que faz |
|--------|-----------|
| **Campo** | Nome amigável do campo no CRM (ex.: Nome, Telefone, E-mail, Etapa, Valor ou campos personalizados). |
| **Ler** | O agente recebe o valor no *system prompt* para entender a situação. |
| **Citar** | O agente pode repetir o valor na mensagem enviada ao cliente. Subconjunto de "Ler". |
| **Atualizar** | O agente pode alterar o valor via ações (ex.: mudar etapa do negócio). |

- **Caminho no schema:** `contextFields.contact[]` e `contextFields.deal[]`, cada um com `key`, `label` e `permissions` (`read` | `cite` | `write`).
- O motor carrega do CRM **apenas** os campos cuja permissão inclua `read` ou `cite`.

## Como o motor usa

### 1. Carregamento
O motor v2 identifica o cliente pelo contato vinculado à conversa e carrega:
- Campos builtin (`name`, `phone`, `email`, `stage`, `status`, `value`).
- Campos personalizados vindos de `customValues`.

Somente campos com `read`/`cite` chegam ao modelo. Os demais são ignorados.

### 2. Leitura vs citação
O *system prompt* enviado ao modelo separa os dados em duas seções:

1. **"Dados do cliente para consulta interna"** — todos os campos com `read`/`cite`.
2. **"Dados que você pode citar na resposta"** — apenas campos com `cite`.

Regra explícita no prompt:
> "Só escreva/repita para o cliente os campos listados em 'Dados que você pode citar na resposta'. Campos de 'Dados do cliente para consulta interna' servem apenas para você entender a situação."

### 3. Cliente não encontrado
Se a conversa não tem contato ou o contato não foi encontrado, o prompt inclui:
> "Nenhum contato encontrado para esta conversa."

Isso evita que o modelo invente dados.

## Bastidores na aba Testar

Após cada resposta de teste, o painel **"Por que respondeu isso?"** mostra uma seção **"Cliente carregado"** com:
- todos os campos e valores carregados (os que têm `read`/`cite`);
- ou a mensagem "Nenhum contato encontrado para esta conversa.".

## Escolher um contato real para testar

Na aba **Testar**, acima do chat, há um seletor **"Simular como contato genérico"**. Ao abrir, ele lista até 200 contatos reais do CRM (nome + telefone/e-mail). Ao escolher um contato, o teste carrega os campos liberados daquele contato e de seu negócio mais recente.

## Roteiro para conferir no dev

1. Vá para **/ai-agents-v2/[id] › O que ele sabe**.
2. Em **Campos do contato**, adicione **Nome** (Ler + Citar) e **Telefone** (apenas Ler).
3. Em **Campos do negócio**, adicione **Etapa** (Ler + Citar) e **Valor** (apenas Ler).
4. Salve o rascunho.
5. Vá para **Testar**. Escolha um contato real com telefone e etapa cadastrados.
6. Pergunte "Qual o meu nome?" — a resposta deve conter o nome.
7. Pergunte "Qual o valor?" — a resposta **não deve** repetir o valor, pois o campo está só como Ler.
8. Abra **"Por que respondeu isso?"** e confirme que a seção **"Cliente carregado"** mostra Nome, Telefone, Etapa e Valor.
