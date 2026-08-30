"use client";

import { Download, Upload } from "lucide-react";

import {
  FormDialog,
  FormDialogIcon,
} from "@/components/ui/form-dialog";

export type DataIoEntity =
  | "deals"
  | "contacts"
  | "companies"
  | "templates"
  | "products";
export type DataIoMode = "import" | "export";

const COPY: Record<
  DataIoEntity,
  Record<DataIoMode, { title: string; description: string }>
> = {
  deals: {
    import: {
      title: "Importar negócios",
      description:
        "CSV de negócios — contatos são criados quando nome + email/telefone são informados",
    },
    export: {
      title: "Exportar dados",
      description: "Baixar base em CSV",
    },
  },
  contacts: {
    import: {
      title: "Importar contatos",
      description:
        "CSV de contatos — empresa é vinculada quando o nome é informado",
    },
    export: {
      title: "Exportar dados",
      description: "Baixar base em CSV",
    },
  },
  companies: {
    import: {
      title: "Importar empresas",
      description: "CSV de empresas — o nome é obrigatório em cada linha",
    },
    export: {
      title: "Exportar dados",
      description: "Baixar base em CSV",
    },
  },
  templates: {
    import: {
      title: "Importar modelos",
      description: "CSV de modelos internos — nome e conteúdo são obrigatórios",
    },
    export: {
      title: "Exportar modelos",
      description: "Baixar modelos internos em CSV",
    },
  },
  products: {
    import: {
      title: "Importar produtos",
      description: "CSV do catálogo — o nome é obrigatório para criar itens",
    },
    export: {
      title: "Exportar produtos",
      description: "Baixar catálogo em CSV",
    },
  },
};

export function DataIoModal({
  open,
  onOpenChange,
  entity,
  mode,
  busy,
  footer,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: DataIoEntity;
  mode: DataIoMode;
  busy?: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const copy = COPY[entity][mode];
  const Icon = mode === "import" ? Upload : Download;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={copy.description}
      icon={
        <FormDialogIcon>
          <Icon className="size-4" />
        </FormDialogIcon>
      }
      size="md"
      busy={busy}
      footer={footer}
      bodyClassName="space-y-0"
    >
      {children}
    </FormDialog>
  );
}
