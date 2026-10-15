# Changelog — Frontend CRM

Formato: [Conventional Commits](https://www.conventionalcommits.org/) agrupado por release.
Datas em ISO 8601. Mais recente no topo.

## [Unreleased] — branch `DEV_BRANCH`

> Em teste no servidor de desenvolvimento (EasyPanel). Aguardando promoção para `main`.

### feat
- **automations (send_email)**: o picker "Canais" do passo Enviar e-mail lista as contas conectadas em `/email` (`/api/email-accounts`) — antes só olhava `Channel.type=EMAIL` (que nenhuma org tem) e sobravam os mocks. O id gravado é o `EmailAccount.id`; "Para" passa a ser opcional (vazio = e-mail do contato). Backend: o passo envia de verdade via SMTP da conta marcada (ou da compartilhada mais antiga da org), interpola `{{...}}` em Para/Assunto/Corpo e falhas caem na saída "erro no envio".
- **directory (contacts/companies)**: edição na linha das listagens v2 — nova coluna "Ações" com botão de editar que abre `EditContactDialog` / `EditCompanyDialog` (antes só dava para editar no detalhe). Salva via `useUpdateContact` / `useUpdateCompany`.
- **directory (contacts)**: vincular contato a empresa direto da UI v2 — novo `CompanyPicker` (combobox com busca + remover vínculo) na criação e edição de contato, enviando `companyId` ao backend (connect/disconnect no Prisma já existente).
- **rbac (team)**: função híbrida — `/settings/team` mantém **ADMIN como único preset** e passa a atribuir **roles customizadas** (via `UserRoleAssignment`); novo `PUT /api/users/[id]/primary-role` com guard contra rebaixar o último admin. `User.role` segue como fallback (não quebra orgs existentes). (`33586b0`, back `58beaa2`)
- **rbac (groups)**: paridade com roles — editor de grupo usa o catálogo completo de permissões (níveis para recursos com responsável; Negado/Liberado para o resto) e permite adicionar membros já na criação (`memberIds`). (`33586b0`, back `58beaa2`)
- **rbac (channels)**: canal por papel — `channel.{view,send}.roles[roleId]` (eixo aditivo ao override por usuário); editor "Canais deste papel" no `RoleEditor` + `GET/PUT /api/roles/[id]/scope-grants`. Enforcement gated por `rbac_granular_scope_v1`. (`9d1ef0c`, back `87001b3`)

### feat (anteriores)
- **ad-tracking**: exibir UTMs do anúncio no log de automação e no perfil do contato — bloco "UTMs do anúncio" no `AdOriginCard` e no card "Origem — Anúncio" do log expandido. Renderiza `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` quando preenchidos. (`772b876`)

### docs
- **design-system**: criação de `docs/design-system/INVENTORY.md` (auditoria do app atual) e `docs/design-system/AUDIT.md` (comparativo CSS DS × app React) — fase 1 e fase intermediária da expansão do DS.
- **design-system**: expansão do `design-system.css` (+670 linhas) com 16 grupos novos: Card genérico, Checkbox/Radio/Switch, Dialog, Sheet, Dropdown, Popover, Toast, Skeleton, Spinner, Progress, Empty state, Table, Pagination, Accordion, List, Kanban (`.board`).
- **design-system**: reescrita do `showcase.html` com sidebar sticky de navegação, scroll-spy e seções organizadas estilo Storybook.

### refactor
- **design-system**: alias semânticos — `--color-lead` agora é `var(--color-warning)`; `--color-online` é `var(--color-success)` (eram hex duplicados).
- **design-system**: novos tokens semânticos de texto (`--color-success-text`, `--color-warning-text`, `--color-danger-text`, `--color-enterprise-text`) substituindo hex hardcoded nos `.badge-*`.
- **design-system**: renomeado `.sidebar-demo` → `.sidebar` (nome com `-demo` sugeria que não era primitivo).

### fix
- **design-system (audit Etapa 2)**: aplicados os bloqueios B1, B2 e a migração de tokens-zumbi (A1.a):
  - **B1 — `.status-pill` removido**: bloco de 20 linhas apagado do CSS; markup do showcase migrado para `.badge .badge-success .badge-with-dot` (presença) e seção dedicada "Status pill (legacy)" removida da navegação. Sem código consumidor pra preservar — eliminada dívida nascente.
  - **B2 — hex órfãos eliminados**: 7 hex hardcoded fora de `:root` viraram tokens. Novo `--color-danger-dark` (hover de `.btn-danger`) e bloco `--syntax-*` (5 tokens: fg, comment, key, value, string) para o code-block do showcase. O `#065f46` da `.status-online` saiu junto com B1.
  - **A1.a — escalas tipográfica e de spacing agora aplicadas**: 65+ ocorrências de `font-size: NNpx` migradas para `var(--text-*)` (xs/sm/13/base/md/lg/xl/2xl/3xl); 55+ ocorrências de `padding`/`margin`/`gap` em valores da escala (4/8/12/16/20/24/32/40/48px) migradas para `var(--space-*)`. Tokens fora da escala (10px, 14px, 18px e similares) ficam hardcoded propositalmente — não pertencem ao sistema. Novo token `--text-13` (preenche o gap entre `--text-sm` e `--text-base`, usado em 15+ componentes: tabs, table, dropdown, toast, list).
- **design-system (audit A2)**: comentário no `.accordion` documentando que `<details>` nativo não anima `height auto` — trade-off conhecido (a11y grátis vs animação custosa).

### docs
- **design-system (audit A4)**: 3 componentes do INVENTORY foram conscientemente substituídos por composições de primitivos já existentes:
  - **Combobox**: não há classe dedicada — compor `.input` + `.dropdown-menu` (decisão arquitetural: combobox é JS, CSS é só os primitivos).
  - **Drawer**: coberto por `.sheet` (sinônimos — adotamos `sheet` por ser o termo do shadcn/Radix).
  - **Context Menu**: coberto por `.dropdown-menu` no nível CSS — falta apenas o handler `oncontextmenu` (responsabilidade do JS).
- **design-system**: criação de `docs/design-system/TOKEN-INVENTORY.md` (1128 linhas) — auditoria factual de vazamentos de token no app (`src/**/*.tsx,*.ts`, 371 arquivos): 178 hex literais, 400 hex em strings, 2875 ocorrências de cor Tailwind nativa (vazamento semântico), 125 `bg-white/<n>` literais, 30 z-index hardcoded, 48 durations sem token. Identifica também 23 tokens declarados com 0 usos reais (zumbis), 11 grupos de duplicação (mesmo valor, nomes diferentes) e 5 lacunas conceituais (z-index, motion, focus-ring, typography scale, foreground-strong). Todas as decisões ambíguas marcadas `[DECISÃO]` aguardando call arquitetural da próxima etapa.

---

## [1.4.0] — 2026-05-21

Release que entrou em produção via Easypanel após merge do PR #2 (ad-tracking).

### feat
- **ad-tracking**: exibir origem-anúncio (campanha, ad set, ad ID resolvido) no log da automação e no perfil do contato. Componente `AdOriginCard` no `/contacts/[id]`. (`c27ae88`)
- **automations**: exibir payload bruto do webhook Meta no log expandido — JSON completo + headers HTTP capturados pelo backend. (`5766354`)

---

## [1.3.0] — 2026-05-20

### feat
- **pipeline**: URL dedicada por visualização (`/pipeline/kanban`, `/pipeline/list`, `/pipeline/agile`) — redirect de `/pipeline` e `/sales-hub`. Popover de conta na sidebar via React Portal pra escapar de stacking context do `backdrop-blur`. (`08ddbcc`)
- **ui**: dark mode funcional via `@custom-variant dark` no globals.css (Tailwind v4); remove `forcedTheme=light` do `ThemeProvider`. Polish do Pipeline (faixa colorida por etapa, popovers via Portal) e do Inbox (presence dropdown sólido). Hook `use-resizable-panel`. (`1202d21`)
- **chat**: drag-and-drop de arquivos na janela de conversa — helper `acceptIncomingFile()` centraliza validação 16 MB e overlay glass com `pointer-events-none`. (`b583303`)

### fix
- **channels**: URL do webhook Meta aponta pro backend (não pro frontend) — `getApiBaseUrl()` em vez de `window.location.origin`, evitando 404 quando colado no painel da Meta. (`ff1aded`)

---

## [1.2.0] — 2026-05-19

### feat
- **ui**: design system glassmorphism — reskin completo (`globals.css` tokens, body mesh, `.glass-*`) cascateando em ~25 primitivos UI + polish manual em `dashboard-shell`, `dialog`, `card`, `button`, `input`, `badge`, `sheet`, `tabs`, `page-header`. Chat/inbox glass: `conversation-list`, `chat-window` (bubbles, date sep, system pills, template badge, send bar). Pipeline kanban-filters glass. (`f0060f2`)
- **ui**: fallbacks defensivos quando o backend deployado está desatualizado — `api.ts` cai em endpoints individuais se o agregador falhar; `POST /board` degrada para `GET` + filtros client-side.

### fix
- **kanban**: erro do board com detalhe + retry + limpar filtros — UX de recuperação quando a board retorna erro. (`2acb423`)

---

## [1.1.0] — 2026-05-18

### feat
- **kanban**: dropdown de filtros ancorado no input "Buscar" — antes era um botão separado. (`46cb829`)
- **kanban**: filtros avançados estilo Kommo + paginação por coluna. (`a51b7c4`)

### fix
- **i18n**: corrige double-encoded UTF-8 em 9 arquivos (mojibake nos labels). (`152db9e`)
- **theme**: bloqueia dark mode do SO — CRM era light-only por design naquele momento (revertido em `1202d21`). (`a1fed5f`)
- **client**: `apiUrl` retorna path relativo pra preservar cookie cross-domain. (`5d71353`)
- **build**: traz módulos `lib` faltantes e atualiza enum types. (`086ef5a`)
- **bundle**: remove vazamento de `server-only` no bundle do client. (`26c59ad`)

### docs
- **agent**: registra decisões de cookie/porta/`NEXTAUTH_URL` após cutover (`AGENT.md`). (`422fb61`)

---

## [1.0.0] — 2026-05-17

### feat
- **fork**: re-fork from monolith main multi-tenant — base do CRM frontend separado em repo próprio. (`af8fd42`)
- **docker**: Dockerfile + `.dockerignore` para Easypanel. (`3b8a940`)

### chore
- Initial CRM frontend extract. (`78347f4`)
