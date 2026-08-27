# EduIT CRM — Mobile (Capacitor)

Casca nativa **Android** do CRM. O WebView carrega a URL remota do frontend Next.js.

> Branch de trabalho: **`CRM_MOBILE`**. Commits do app sobem só nesta branch.

## Pré-requisitos

| Ferramenta | Uso |
|------------|-----|
| Node.js 20+ | CLI Capacitor |
| Android Studio + SDK + JDK 17+ | Gerar/instalar APK |
| URL HTTPS do CRM | Celular precisa alcançar (não use `localhost` sem túnel) |

## Setup

```bash
cd mobile
npm install
```

1. `capacitor.config.json` → `server.url` aponta pra produção
   (`https://bwipo.com/`). Para testar DEV
   (`https://crm-dev-frontend.ca31ey.easypanel.host`), troque
   temporariamente e rode `npm run sync`.
   **Importante:** mudar `server.url` / `hostname` exige **novo APK** +
   `npm run sync` — deploy web sozinho não atualiza o host embutido no APK.
2. Sincronize:

```bash
npm run sync
```

> Stack fixada em **Capacitor 7** (compatível com Node 20). Capacitor 8 exige Node ≥ 22.

## Comandos

```bash
npm run sync           # copia www + sync plugins → android/
npm run open:android   # abre Android Studio (requer JDK + SDK)
```

## Modelo de atualização

- **UI / features do CRM** → deploy do frontend CRM (sem novo APK).
- **Casca nativa** (plugins, permissões, ícone) → novo APK no serviço
  **`crm-mobile-releases`** (EasyPanel separado — ver `deploy/mobile-releases/README.md`).

## Assinatura (release)

A keystore **não** entra no Git. Fica em:

- Arquivo: `%USERPROFILE%\eduit-crm-release.keystore`
- Alias: `eduit-crm`
- Credenciais locais: `mobile/android/keystore.properties` (gitignored; use `keystore.properties.example` como modelo)

```bash
cd mobile/android
.\gradlew.bat assembleRelease
```

APK: `app/build/outputs/apk/release/app-release.apk`

## Publicar APK (serviço separado)

1. Bump `versionCode` / `versionName` em `mobile/android/app/build.gradle`
2. `assembleRelease` (mesma keystore)
3. Copiar APK → `deploy/mobile-releases/public/releases/eduit-crm-<ver>.apk`
4. Atualizar `deploy/mobile-releases/public/mobile-release.json` e o espelho
   `public/mobile-release.json`
5. Push na `CRM_MOBILE` → rebuild **só** do serviço `crm-mobile-releases`
6. (Opcional) Deploy leve do CRM se ainda usar o espelho em `/mobile-release.json`

O app consulta primeiro:
`https://bwipo.com/mobile-release.json`

## iOS

Fora do escopo inicial (precisa Mac + Xcode). APK = Android apenas.
