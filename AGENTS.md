# AGENTS.md — Frontend Bwipo (CRM)

Este repositório é o **frontend do Bwipo** (CRM): Next.js (App Router) + React em `src/`,
com app mobile/APK (Capacitor) em `mobile/`.

O **backend/API é um repositório separado** e é a fonte do contrato HTTP: endpoints,
payloads e regras de negócio de servidor vêm de lá. Não crie regra de negócio de backend
no frontend para contornar limitação da API — se o contrato não atende, o ajuste
pertence ao backend, não a um workaround no cliente.

## Comportamento do Agent

- Faça a menor alteração necessária.
- Comece pelos arquivos diretamente relacionados ao pedido.
- Não faça auditoria ampla do repositório sem necessidade.
- Não investigue módulos ou páginas não relacionados.
- Não leia históricos apenas para obter contexto adicional.
- Não expanda o escopo por conta própria.
- Não faça refatorações amplas sem solicitação.
- Não crie documentação adicional sem solicitação.
- Não abra Browser ou aplicação salvo quando solicitado explicitamente.
- Não use Computer Use ou screenshots salvo quando solicitado explicitamente.
- Não faça validação visual automaticamente.
- Para tarefas não visuais, não carregue regras de design system sem necessidade.
- Não registre automaticamente alterações em documentação histórica.

## Regras de trabalho

- Menor alteração possível: comece pelos arquivos diretamente envolvidos no pedido e
  pare quando ele estiver atendido.
- Não audite módulos não relacionados e não refatore áreas vizinhas sem necessidade
  explícita.
- Reutilize componentes, hooks, padrões e o design system existentes antes de criar
  qualquer duplicação. Se algo semelhante já existe, estenda em vez de recriar.
- Compatibilidade mobile/APK: quando a área alterada for compartilhada com o app
  (`mobile/`, WebView), mantenha a paridade de comportamento (navegação/voltar,
  deep links, permissões, biometria).
- Não registre decisões em documentação histórica por conta própria. O histórico em
  `docs/history/` é **consulta manual**, não contexto cotidiano: não o leia por padrão.

## Backend / contrato HTTP

- O frontend consome a API; o contrato (rotas, campos, enums, permissões) é definido
  pelo backend. Não infira campos que a API não devolve e não duplique validações de
  servidor no cliente.
- Contratos pontuais documentados em `docs/` (ex.: `docs/inbox-api-contract.md`) são
  referência de leitura; em caso de dúvida, o comportamento do backend prevalece.

## UI / design system

- As regras visuais canônicas vivem em `.cursor/rules/crm-ui-canonical.mdc` e
  aplicam-se **somente a arquivos visuais** (`src/app/**/*.tsx`,
  `src/components/**/*.tsx`, `src/features/**/*.tsx`, `src/styles/**/*.css`),
  conforme os globs do frontmatter da regra.
- Tarefas sem UI (hooks puros, libs, scripts, API client não visual, configuração,
  dependências, mobile Android nativo) não precisam dessas regras — não as carregue.

## Estrutura (referência rápida)

- `src/app/` — rotas Next.js (App Router).
- `src/components/` — componentes compartilhados (inclui `components/crm/`, base do DS).
- `src/features/` — features autocontidas.
- `src/hooks/` — hooks compartilhados.
- `src/lib/` — utilitários e clients de API.
- `src/styles/` — CSS e tokens.
- `mobile/` — casca Android/APK (código nativo em `mobile/android/`).
- `docs/history/` — histórico de decisões técnicas (consulta manual).

## Contexto do Cursor neste repositório

- `.cursorignore` já exclui da descoberta: `docs/history/`, catálogo gerado
  (`src/lib/automation-templates-imported.ts`), `screenshots/`, APKs em
  `public/releases/` e artefatos (`.next/`, `dist/`, `coverage/`, logs).
- Não leia arquivos gerados, lockfiles ou histórico para obter contexto; vá direto
  aos arquivos do pedido.

## Dependências e verificação

- Não altere `package.json`, `package-lock.json` ou `pnpm-lock.yaml` sem solicitação
  explícita.
- Não rode install, build, testes, lint ou dev server salvo quando a tarefa exigir.
