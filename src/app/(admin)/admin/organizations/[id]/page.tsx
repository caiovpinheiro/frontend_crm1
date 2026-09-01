import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft as ArrowLeft, IconBuilding as Building2 } from "@tabler/icons-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { PageHeader } from "@/components/ui/page-header";
import { apiServerGet } from "@/lib/api-server";
import OrganizationDetailClient from "./organization-detail-client";

type OrgDetail = {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  industry: string | null;
  size: string | null;
  phone: string | null;
  createdAt: string;
  onboardingCompletedAt: string | null;
  counts: {
    users: number;
    contacts: number;
    deals: number;
    pipelines: number;
    channels: number;
    conversations: number;
  };
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: "ADMIN" | "MANAGER" | "MEMBER";
    isSuperAdmin: boolean;
    type: "HUMAN" | "AI";
    isErased: boolean;
    createdAt: string;
  }>;
  invites: Array<{
    id: string;
    email: string;
    role: "ADMIN" | "MANAGER" | "MEMBER";
    token: string | null;
    expiresAt: string;
    createdAt: string;
  }>;
};

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const org = await apiServerGet<OrgDetail>(
    `/api/admin/organizations/${encodeURIComponent(id)}`,
  );
  if (!org) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/organizations"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Voltar para organizações
      </Link>

      <PageHeader
        icon={<Building2 />}
        eyebrow={org.slug}
        title={org.name}
        description={`Criada em ${format(new Date(org.createdAt), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}`}
      />

      <OrganizationDetailClient organization={org} />
    </div>
  );
}
