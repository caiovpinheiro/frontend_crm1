# Worker LanguageTool (self-hosted)

Worker HTTP separado do frontend e do `leads-worker`. Expõe `/v2/check`.
O composer só chama `POST /api/proofread` no Next; o Next encaminha para este worker.

Não use o tipo **Worker** do EasyPanel (sem porta). Este processo precisa escutar **8010**.

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

## N-grams (melhor pt-BR)

A imagem sozinha já faz ortografia e pontuação. Pares como `Entao`→`Então` e `e`→`é` pedem o language model:

1. Baixe `pt` em https://languagetool.org/download/ngram-data/
2. Monte o volume em `/ngrams` e `langtool_languageModel=/ngrams`
3. Suba `Java_Xmx` (2–4g)
