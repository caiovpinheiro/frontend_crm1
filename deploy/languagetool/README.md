# Worker LanguageTool (self-hosted)

Worker HTTP separado do frontend e do `leads-worker`. Expõe `/v2/check`.
O composer só chama `POST /api/proofread` no Next; o Next encaminha para este worker.

Heap padrão da imagem é 512m e o pt-BR fica lento (~1s+). Use `Java_Xmx=2g` e
`langtool_pipelinePrewarming=true`. O composer faz prefetch ao digitar para o
enviar não esperar o Java.

Não use o tipo **Worker** do EasyPanel (sem porta HTTP). Este processo precisa
ser **App** e escutar **8010**. Se o domínio público devolver HTML
`Service is not reachable` (EasyPanel 502), o Traefik não alcança o Java —
o CRM ainda não falhou no corretor; o container está down, crashando, ou
a porta do serviço não é 8010.

O body `{ text, language }` é o JSON do `POST /api/proofread` no Next.
O worker LanguageTool **não** aceita JSON: ele espera
`application/x-www-form-urlencoded` em `/v2/check`.

## Subir o worker (DEV)

1. Mesmo projeto do `crm-dev-frontend`
2. **New Service** → **App** (Docker Image ou Compose deste arquivo)
3. Nome: `languagetool` (DNS interno `languagetool`)
4. Imagem: `erikvl87/languagetool:latest`
5. Porta: **8010**
6. Sem domínio público se o Next alcançar a rede interna

Teste no host:

```bash
curl -sS -X POST http://languagetool:8010/v2/check \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'text=Oi Marcelo, tudo bem Entao fazer isso' \
  --data-urlencode 'language=pt-BR'
```

## Ligar no frontend DEV

No app **crm-dev-frontend** (variável de ambiente, depois **Restart** — não precisa rebuild):

```
LANGUAGETOOL_API_URL=http://languagetool:8010/v2/check
```

Não use `localhost` nem `127.0.0.1` — no container do Next isso é o próprio frontend.

Se o Next não alcançar o nome interno, use o domínio público do serviço LanguageTool, ex.:

```
LANGUAGETOOL_API_URL=https://languagetool.SEU-PROJETO.easypanel.host/v2/check
```

Sem essa variável o frontend cai na API pública (`api.languagetool.org`), que não cobre bem acentos/pt-BR.

## 502 `Service is not reachable`

Isso é o proxy do EasyPanel, não o composer.

Causa vista no DEV (`crm_dev_worker_languagetool`): o container Java
estava **healthy na 8010**, mas o EasyPanel gravou `PORT=80` e o Traefik
apontou `http://crm_dev_worker_languagetool:80/`. Nada escuta 80 → HTML
`Service is not reachable`.

1. No serviço, campo **Port** = **8010** (não deixe o default 80)
2. Preferir `LANGUAGETOOL_API_URL` interno (não o HTTPS público)
3. Logs do container: Java no ar, sem OOM
4. Espere 1–2 min no primeiro boot
5. Teste o domínio do **worker** (não o do CRM):

```bash
curl -sS -o /tmp/lt.json -w '%{http_code}\n' -X POST \
  'https://crm-languagetool-worker.SEU-PROJETO.easypanel.host/v2/check' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'text=Da pra mim fazer?' \
  --data-urlencode 'language=pt-BR'
```

Tem que voltar **200** e JSON (`matches`). Se ainda for HTML do EasyPanel,
não adiante mudar o frontend.

Preferível no Next (mesma rede Docker), sem passar pelo Traefik público:

```
LANGUAGETOOL_API_URL=http://crm-dev-worker-languagetool:8010/v2/check
```

Depois **Restart** no `crm-dev-frontend` (sem rebuild).

## N-grams (melhor pt-BR)

A imagem sozinha já faz ortografia e pontuação. Pares como `Entao`→`Então` e `e`→`é` pedem o language model:

1. Baixe `pt` em https://languagetool.org/download/ngram-data/
2. Monte o volume em `/ngrams` e `langtool_languageModel=/ngrams`
3. Suba `Java_Xmx` (2–4g)
