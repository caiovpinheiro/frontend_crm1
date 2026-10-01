# Checklist por etapa — fluxo "Agente completo"

Critério de pronto de cada etapa. Tudo precisa estar marcado, parecido com o protótipo e
gravando no caminho do UI_SPEC_V2.md. Ordem de trabalho: 2, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12.

## Etapa 1 — Começar
- [ ] nome do agente e canal escolhido da lista (não ID digitado)
- [ ] cards de modelo (Recepção, Atendimento, Qualificar contatos novos, Vendas, Suporte técnico, Em branco) com descrição e "Já vem com"
- [ ] chave de acesso ao modelo, modelo e comportamento em linguagem simples

## Etapa 2 — Jeito de falar
- [ ] tom em botões selecionáveis (Acolhedor, Direto, Formal, Descontraído, Técnico), vários ao mesmo tempo
- [ ] "Descreva com suas palavras"
- [ ] tamanho das respostas em botões (Curtas, Médias, Detalhadas)
- [ ] regras que ele sempre segue: lista editável, uma por linha, remover e adicionar
- [ ] regras padrão sem jargão técnico
- [ ] painel "Assim ele vai soar" com exemplo que muda com o tamanho escolhido

## Etapa 3 — O que ele sabe
- [ ] tabela por entidade: Campo | Ler | Citar | Atualizar, colunas lado a lado
- [ ] rótulo amigável e valor de exemplo embaixo ("sem valor neste cliente" quando vazio)
- [ ] explicação curta de ler, citar e atualizar
- [ ] "Se o cliente tiver mais de um negócio aberto"
- [ ] informações fixas da empresa (nome + valor) com dica do @
- [ ] mídia que o cliente manda (áudio, imagem, documento, confirmar entendimento, mensagem de falha)

## Etapa 4 — Materiais de consulta
- [ ] área de arrastar e soltar + "Ou escreva direto"
- [ ] tabela: material, situação (processando/pronto), usado nos assuntos, remover
- [ ] "Testar busca" com trecho encontrado e documento de origem

## Etapa 5 — Mensagens prontas e produtos
- [ ] liga/desliga de mensagens prontas; "Enviar como está / Pode adaptar levemente"
- [ ] modelos do CRM e templates oficiais selecionáveis
- [ ] prévia de um modelo preenchido, com aviso de campo vazio e janela de 24h
- [ ] produtos: liga/desliga, quantos por vez, quais apresentar, o que mostrar, o que pode fazer com o produto, prévia

## Etapa 6 — Início da conversa
- [ ] "Como a conversa chega": cliente inicia / vem de automação / vem de pessoa, cada um com suas opções
- [ ] variáveis recebidas da automação mapeadas para campos
- [ ] boas-vindas com liga/desliga
- [ ] confirmação do cadastro: três opções, editor com botões "+ Campo" e trecho condicional entre chaves
- [ ] "Se não encontrar o cliente pelo telefone"
- [ ] prévia da conversa com a caixa "cliente sem campo preenchido"

## Etapa 7 — Assuntos
- [ ] lista à esquerda, editor à direita
- [ ] nome, quando o cliente falar sobre, exemplos de frases (Enter adiciona)
- [ ] quem responde (este agente, especialista, criar novo) e o que o especialista herda
- [ ] como agir, o que pode fazer, materiais, destino ao transferir, passar direto
- [ ] botão "Ver mapa do atendimento"

## Etapa 8 — Regras automáticas
- [ ] aviso: valem sempre, antes do agente pensar, de cima para baixo
- [ ] cada regra lida como frase: Quando … e … / Então …
- [ ] subir, descer, remover, ligar/desligar
- [ ] construtor de regra nova com condição, valor, ação, destino e mensagem

## Etapa 9 — Saídas
- [ ] não soube, pediu pessoa, sem material, erro — com texto padrão preenchido
- [ ] quando parar de responder (cortesia, oferta, trocas sem avanço, mensagens sem sentido, silêncio)
- [ ] fora do escopo e assuntos que ele nunca responde
- [ ] humor do cliente
- [ ] resumo das saídas

## Etapa 10 — Equipe e horários
- [ ] destino padrão (tipo + valor) com aviso da distribuição inteligente
- [ ] mensagem ao transferir
- [ ] horário por dia com abre/fecha e liga/desliga, e o que fazer fora do horário
- [ ] se o cliente parar de responder (lembrete e encerramento)
- [ ] sem duplicar palavras-chave de pedido humano (ficam nas regras)

## Etapa 11 — Encerrar e classificar
- [ ] quem conduz a conversa
- [ ] depois que encerra: janela e os três casos com mensagens
- [ ] tabulação: quando, reserva, não encerrar sem classificar, assunto → tabulação
- [ ] botões no WhatsApp
- [ ] pesquisa de satisfação completa
- [ ] ao encerrar (devolver etapa, despedida, devolver para automação)
- [ ] painel "Como fica no CRM"

## Etapa 12 — Testar e publicar
- [ ] conversa em formato de celular do canal, com agrupamento de mensagens e "digitando"
- [ ] "Bastidores deste turno" ao tocar numa resposta: regra, assunto, ferramentas com resultado, trechos dos materiais, ações, motivo
- [ ] simulação: como a conversa chega, fora do horário, campos vazios, encerrar, uma pessoa assume
- [ ] como envia (sugerir para aprovar / responder sozinho), links permitidos
- [ ] checklist "Tudo certo?" com atalho para cada etapa

## Geral
- [ ] check verde na lateral só com o mínimo preenchido
- [ ] botão "Dicionário da tela" no topo
