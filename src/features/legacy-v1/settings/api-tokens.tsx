"use client";

import { apiUrl } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconCopy as Copy, IconKey as Key, IconPlus as Plus, IconTrash as Trash2 } from "@tabler/icons-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { ButtonGlass } from "@/components/crm/button-glass";
import { TooltipHost } from "@/components/ui/tooltip";
import { GlassCard } from "@/components/crm/glass-card";
import { PagePrimaryButton } from "@/components/crm/page-toolbar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormDialog } from "@/components/ui/form-dialog";
import { InputGlass } from "@/components/crm/input-glass";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type TokenRow = {
  id: string;
  name: string;
  tokenPrefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ApiTokensPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [tokenName, setTokenName] = useState("");
  const [tokenExpiry, setTokenExpiry] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const tokensQuery = useQuery({
    queryKey: ["api-tokens"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/settings/api-tokens"));
      if (!res.ok) throw new Error("Erro ao carregar tokens");
      return (await res.json()) as TokenRow[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(apiUrl("/api/settings/api-tokens"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: tokenName.trim(),
          expiresAt: tokenExpiry || undefined,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(j.message ?? "Erro ao criar token");
      }
      return (await res.json()) as { id: string; token: string; prefix: string };
    },
    onSuccess: (data) => {
      setCreatedToken(data.token);
      setTokenName("");
      setTokenExpiry("");
      void queryClient.invalidateQueries({ queryKey: ["api-tokens"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(apiUrl(`/api/settings/api-tokens/${id}`), {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Erro ao revogar token");
    },
    onSuccess: () => {
      setDeleteId(null);
      void queryClient.invalidateQueries({ queryKey: ["api-tokens"] });
    },
  });

  const tokens = tokensQuery.data ?? [];

  const handleCopy = () => {
    if (createdToken) {
      navigator.clipboard.writeText(createdToken).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCloseCreated = () => {
    setCreatedToken(null);
    setCreateOpen(false);
    setCopied(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <PagePrimaryButton
          type="button"
          onClick={() => {
            setCreateOpen(true);
            setCreatedToken(null);
          }}
        >
          <Plus className="size-4" />
          Criar nova chave
        </PagePrimaryButton>
      </div>

      <GlassCard className="overflow-hidden p-0">
        <div className="space-y-1 border-b border-[var(--glass-border-subtle)] px-6 py-5">
          <h2 className="font-display text-base font-bold text-[var(--text-primary)]">Tokens ativos</h2>
          <p className="text-sm text-[var(--text-muted)]">
            Cada token permite acesso à API via header{" "}
            <code className="rounded bg-[var(--glass-bg-overlay)] px-1 text-xs">
              Authorization: Bearer &lt;token&gt;
            </code>
            . Limite: 400 requisições/minuto.
          </p>
        </div>
        <div className="px-6 py-5">
          {tokensQuery.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Carregando...
            </p>
          ) : tokens.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <Key className="size-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                Nenhuma chave de API criada ainda.
              </p>
            </div>
          ) : (
            <>
              {/* Mobile: cards */}
              <div className="space-y-3 sm:hidden">
                {tokens.map((t) => {
                  const expired =
                    t.expiresAt && new Date(t.expiresAt) < new Date();
                  return (
                    <div
                      key={t.id}
                      className="min-w-0 rounded-lg border border-border/80 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="break-words font-medium">{t.name}</p>
                          <code className="mt-1 inline-block break-all rounded bg-muted px-1.5 py-0.5 text-xs">
                            {t.tokenPrefix}...
                          </code>
                        </div>
                        <ButtonGlass
                          variant="icon"
                          size="icon"
                          className="shrink-0 text-[var(--color-destructive)] hover:text-[var(--color-destructive)]"
                          onClick={() => setDeleteId(t.id)}
                          aria-label="Revogar"
                        >
                          <Trash2 className="size-4" />
                        </ButtonGlass>
                      </div>
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        <p>Criada em: {formatDate(t.createdAt)}</p>
                        <p>Último uso: {formatDate(t.lastUsedAt)}</p>
                        <p className="flex flex-wrap items-center gap-1.5">
                          <span>Expira em:</span>
                          {t.expiresAt ? (
                            <Badge variant={expired ? "destructive" : "secondary"}>
                              {expired ? "Expirada" : formatDate(t.expiresAt)}
                            </Badge>
                          ) : (
                            <span>Sem expiração</span>
                          )}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop: table */}
              <div className="hidden overflow-x-auto sm:block">
                <Table className="min-w-[720px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Chave</TableHead>
                      <TableHead>Criada em</TableHead>
                      <TableHead>Último uso</TableHead>
                      <TableHead>Expira em</TableHead>
                      <TableHead className="w-[60px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tokens.map((t) => {
                      const expired =
                        t.expiresAt && new Date(t.expiresAt) < new Date();
                      return (
                        <TableRow key={t.id}>
                          <TableCell className="font-medium">{t.name}</TableCell>
                          <TableCell>
                            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                              {t.tokenPrefix}...
                            </code>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDate(t.createdAt)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDate(t.lastUsedAt)}
                          </TableCell>
                          <TableCell>
                            {t.expiresAt ? (
                              <Badge variant={expired ? "destructive" : "secondary"}>
                                {expired ? "Expirada" : formatDate(t.expiresAt)}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Sem expiração
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <ButtonGlass
                              variant="icon"
                              size="icon"
                              className="text-[var(--color-destructive)] hover:text-[var(--color-destructive)]"
                              onClick={() => setDeleteId(t.id)}
                              aria-label="Revogar"
                            >
                              <Trash2 className="size-4" />
                            </ButtonGlass>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      </GlassCard>

      {/* Create drawer */}
      <FormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        busy={createMutation.isPending}
        title={createdToken ? "Chave criada com sucesso" : "Criar nova chave de API"}
        description={createdToken ? "Copie a chave agora. Ela não será exibida novamente." : "Defina um nome e, opcionalmente, uma data de expiração."}
        footer={
          createdToken ? (
            <ButtonGlass variant="primary" onClick={handleCloseCreated}>Fechar</ButtonGlass>
          ) : (
            <>
              <ButtonGlass variant="glass" onClick={() => setCreateOpen(false)}>Cancelar</ButtonGlass>
              <ButtonGlass variant="primary" disabled={!tokenName.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}>
                {createMutation.isPending ? "Criando..." : "Criar chave"}
              </ButtonGlass>
            </>
          )
        }
      >
        {createdToken ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <InputGlass readOnly value={createdToken} className="font-mono text-xs" />
              <TooltipHost label="Copiar" side="top">
                <ButtonGlass variant="glass" size="icon" onClick={handleCopy} aria-label="Copiar">
                  <Copy className="size-4" />
                </ButtonGlass>
              </TooltipHost>
            </div>
            {copied && <p className="text-xs text-[var(--color-success)]">Copiado!</p>}
            <div className="rounded-md border border-[var(--color-warning)]/30 bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] p-3 text-xs text-[var(--color-warning)]">
              Guarde esta chave em um local seguro. Ela será usada como token de autenticação nas requisições (Bearer Token).
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tk-name">Nome</Label>
              <InputGlass id="tk-name" value={tokenName} onChange={(e) => setTokenName(e.target.value)} placeholder="Ex.: Integração ERP" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tk-expiry">Expira em (opcional)</Label>
              <InputGlass id="tk-expiry" type="date" value={tokenExpiry} onChange={(e) => setTokenExpiry(e.target.value)} />
            </div>
            {createMutation.isError && (
              <p className="text-sm text-destructive">{(createMutation.error as Error).message}</p>
            )}
          </div>
        )}
      </FormDialog>

      {/* Delete confirm */}
      <Dialog
        open={Boolean(deleteId)}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revogar chave de API?</DialogTitle>
            <DialogDescription>
              Todas as integrações que usam esta chave deixarão de funcionar
              imediatamente. Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <ButtonGlass variant="glass" onClick={() => setDeleteId(null)}>
              Cancelar
            </ButtonGlass>
            <ButtonGlass
              variant="danger"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (deleteId) deleteMutation.mutate(deleteId);
              }}
            >
              {deleteMutation.isPending ? "Revogando..." : "Revogar"}
            </ButtonGlass>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
