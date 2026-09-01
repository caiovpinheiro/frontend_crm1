import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Política de privacidade · Bwipo",
  description:
    "Como a Bwipo coleta, usa e protege dados pessoais no CRM e nas integrações com WhatsApp, Instagram e Meta.",
  robots: { index: true, follow: true },
};

const UPDATED_AT = "1 de setembro de 2026";
const CONTACT_EMAIL = "comercial@eduit.com.br";

export default function PoliticaDePrivacidadePage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link href="/" className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-bwipo.png"
              alt="Bwipo"
              className="h-10 w-auto max-w-[160px] object-contain"
            />
          </Link>
          <Link
            href="/login"
            className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            Entrar
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10 md:py-14">
        <article className="rounded-xl border border-border bg-card px-6 py-8 md:px-10 md:py-10">
          <p className="text-sm text-muted-foreground">Documento público</p>
          <h1 className="mt-1 font-display text-[22px] font-bold leading-tight tracking-tight">
            Política de privacidade
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Última atualização: {UPDATED_AT}
          </p>

          <div className="mt-8 space-y-8 text-sm leading-relaxed text-foreground">
            <Section title="1. Quem somos">
              <p>
                Esta política descreve como a <strong>Bwipo</strong> (
                <a
                  className="font-medium text-primary underline-offset-4 hover:underline"
                  href="https://bwipo.com"
                >
                  bwipo.com
                </a>
                ) trata dados pessoais no CRM e nas integrações com canais da
                Meta (WhatsApp e Instagram).
              </p>
              <p>
                A Bwipo é uma plataforma de CRM usada por empresas para
                gerenciar contatos, conversas, pipeline de vendas e equipe.
                Dúvidas sobre este documento:{" "}
                <a
                  className="font-medium text-primary underline-offset-4 hover:underline"
                  href={`mailto:${CONTACT_EMAIL}`}
                >
                  {CONTACT_EMAIL}
                </a>
                .
              </p>
            </Section>

            <Section title="2. Quais dados coletamos">
              <p>
                Dependendo de como o serviço é usado, podemos tratar:
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  <strong>Conta e equipe:</strong> nome, e-mail, senha
                  (armazenada de forma criptografada), cargo/perfil e dados
                  de autenticação.
                </li>
                <li>
                  <strong>Dados do CRM:</strong> empresas, contatos, negócios,
                  tarefas, anotações e arquivos que a organização cadastra.
                </li>
                <li>
                  <strong>Mensagens e canais:</strong> conteúdo, mídia, número
                  de telefone, identificadores de conversa e metadados de
                  WhatsApp, Instagram e outros canais conectados.
                </li>
                <li>
                  <strong>Uso técnico:</strong> logs de acesso, endereço IP,
                  tipo de dispositivo e registros necessários para segurança
                  e funcionamento do serviço.
                </li>
              </ul>
            </Section>

            <Section title="3. Como usamos os dados">
              <p>Usamos os dados para:</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>prestar o CRM e as funcionalidades contratadas;</li>
                <li>
                  enviar e receber mensagens nos canais conectados pela
                  organização;
                </li>
                <li>autenticar usuários, prevenir abuso e manter a segurança;</li>
                <li>cumprir obrigações legais e responder a requisições lícitas;</li>
                <li>melhorar o produto com base em uso agregado e suporte.</li>
              </ul>
              <p>
                Não vendemos dados pessoais. Não usamos o conteúdo das
                conversas dos clientes da organização para anúncios de
                terceiros.
              </p>
            </Section>

            <Section title="4. WhatsApp, Instagram e Meta">
              <p>
                Quando a organização conecta WhatsApp Business (Cloud API) ou
                Instagram, a Bwipo processa dados necessários para a
                integração, inclusive mensagens enviadas e recebidas, números
                de telefone, IDs de conta e mídias.
              </p>
              <p>
                Esses dados são tratados em nome da organização que usa o CRM
                (controladora), para atendimento, vendas e operação do canal.
                A Meta também trata dados conforme as próprias políticas
                (WhatsApp, Instagram e Meta Platform).
              </p>
              <p>
                O uso desses canais segue as regras da Meta, incluindo a
                Política da Plataforma, os termos do WhatsApp Business e as
                diretrizes de mensagens. A organização é responsável por
                obter as bases legais e os consentimentos exigidos para
                contatar seus clientes.
              </p>
            </Section>

            <Section title="5. Compartilhamento">
              <p>Podemos compartilhar dados com:</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  a própria organização cliente, seus usuários autorizados e
                  administradores;
                </li>
                <li>
                  provedores de infraestrutura, hospedagem, e-mail e
                  monitoramento, apenas o necessário para operar o serviço;
                </li>
                <li>
                  Meta/WhatsApp/Instagram, quando o canal correspondente
                  estiver conectado;
                </li>
                <li>
                  autoridades, quando houver obrigação legal ou ordem válida.
                </li>
              </ul>
            </Section>

            <Section title="6. Retenção e exclusão">
              <p>
                Mantemos os dados enquanto a conta estiver ativa e pelo
                período necessário às finalidades desta política, a prazos
                legais e à defesa de direitos.
              </p>
              <p>
                A organização pode excluir contatos, conversas e demais
                registros no próprio CRM, conforme as permissões da conta.
                Pedidos de exclusão da conta da plataforma ou de dados
                pessoais podem ser feitos pelo e-mail{" "}
                <a
                  className="font-medium text-primary underline-offset-4 hover:underline"
                  href={`mailto:${CONTACT_EMAIL}`}
                >
                  {CONTACT_EMAIL}
                </a>
                . Atenderemos no prazo da LGPD, salvo hipóteses legais de
                retenção.
              </p>
            </Section>

            <Section title="7. Direitos do titular (LGPD)">
              <p>
                Titulares podem solicitar confirmação de tratamento, acesso,
                correção, anonimização, portabilidade, informação sobre
                compartilhamentos, revogação de consentimento (quando essa
                for a base legal) e eliminação dos dados, nos termos da Lei
                nº 13.709/2018.
              </p>
              <p>
                Para dados cadastrados no CRM de uma empresa cliente, o
                pedido deve ser dirigido primeiro a essa empresa
                (controladora). Se preferir, escreva para nós que
                encaminharemos à organização responsável, quando possível.
              </p>
            </Section>

            <Section title="8. Segurança e cookies">
              <p>
                Aplicamos medidas técnicas e organizacionais razoáveis
                (criptografia em trânsito, controle de acesso e registros de
                auditoria). Nenhum sistema é 100% seguro; pedimos que as
                senhas sejam fortes e não compartilhadas.
              </p>
              <p>
                Usamos cookies e tecnologias semelhantes para sessão,
                preferências (como tema) e funcionamento do produto. Cookies
                essenciais são necessários para login e segurança.
              </p>
            </Section>

            <Section title="9. Alterações">
              <p>
                Esta política pode ser atualizada. A data no topo indica a
                versão vigente. Alterações relevantes poderão ser
                comunicadas no produto ou por e-mail, quando apropriado.
              </p>
            </Section>

            <Section title="10. Contato">
              <p>
                Encarregado / privacidade:{" "}
                <a
                  className="font-medium text-primary underline-offset-4 hover:underline"
                  href={`mailto:${CONTACT_EMAIL}`}
                >
                  {CONTACT_EMAIL}
                </a>
              </p>
              <p>
                Site:{" "}
                <a
                  className="font-medium text-primary underline-offset-4 hover:underline"
                  href="https://bwipo.com"
                >
                  https://bwipo.com
                </a>
              </p>
            </Section>
          </div>
        </article>
      </main>

      <footer className="border-t border-border py-8">
        <p className="mx-auto max-w-3xl px-6 text-center text-sm text-muted-foreground md:text-left">
          © {new Date().getFullYear()} Bwipo. Todos os direitos reservados.
        </p>
      </footer>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-base font-semibold tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}
