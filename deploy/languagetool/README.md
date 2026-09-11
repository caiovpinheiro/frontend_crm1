# LanguageTool self-hosted (EasyPanel)

O corretor do inbox chama este serviço **pelo servidor Next** (`POST /api/proofread`). O browser não fala com o LanguageTool.

## Subir o serviço

1. EasyPanel → **New Service** → Docker Image (ou Compose deste arquivo).
2. Imagem: `erikvl87/languagetool:latest`
3. Nome do serviço: `languagetool` (hostname interno `languagetool`)
4. Porta: **8010**
5. Mesmo projeto/rede do `crm-dev-frontend`

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
