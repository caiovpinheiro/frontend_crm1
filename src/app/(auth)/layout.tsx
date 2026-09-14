export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-dvh">
      {/* Orbes coloridos suaves no fundo — reforçam o mesh global do
          <body>. Posicionados nas bordas para não interferir na
          leitura do formulário (que renderiza seu próprio container
          centralizado). Pointer-events-none para não bloquear cliques. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 overflow-hidden"
      >
        <div className="absolute -top-32 -left-32 size-[420px] rounded-full bg-[radial-gradient(circle,rgba(91,111,245,0.22)_0%,transparent_70%)] blur-2xl" />
        <div className="absolute -bottom-32 -right-32 size-[420px] rounded-full bg-[radial-gradient(circle,rgba(167,139,250,0.20)_0%,transparent_70%)] blur-2xl" />
        <div className="absolute top-1/2 left-1/2 size-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(244,114,182,0.08)_0%,transparent_70%)] blur-3xl" />
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}
