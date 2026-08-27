import Link from "next/link";

/**
 * Registro publico foi desativado no modelo SaaS multi-tenant: novas
 * organizacoes sao criadas pelo super-admin EduIT via /admin/organizations,
 * e membros entram via convite (/accept-invite?token=...).
 * Mantemos a rota com uma mensagem orientadora ao inves de remover,
 * para nao quebrar links antigos compartilhados.
 */
export default function RegisterPage() {
  return (
    <div className="rounded-2xl border border-border bg-background p-8 text-center shadow-sm">
      <h1 className="text-xl font-bold">Cadastro por convite</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Para criar uma conta no CRM, seu administrador precisa enviar um
        convite. Se você já tem um, abra o link diretamente.
      </p>
      <p className="mt-4 text-sm">
        <Link
          href="/login"
          className="font-semibold text-primary hover:underline"
        >
          Já tenho conta · fazer login
        </Link>
      </p>
      <p className="mt-6 text-xs text-muted-foreground">
        É uma empresa interessada em contratar o CRM?
        <br />
        Fale com a equipe Bwipo em{" "}
        <a
          href="mailto:comercial@eduit.com.br"
          className="font-medium text-foreground hover:underline"
        >
          comercial@eduit.com.br
        </a>
        .
      </p>
    </div>
  );
}
