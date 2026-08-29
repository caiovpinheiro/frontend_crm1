import { PageLoading } from "@/components/crm/page-loading";

/** Mesmo overlay de viewport do `(app)/loading.tsx`. Um loader só no
 *  painel (ao lado do rail/sidebar) deslocava a marca no primeiro paint. */
export default function Loading() {
  return <PageLoading />;
}
