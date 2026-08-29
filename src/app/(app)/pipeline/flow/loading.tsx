import { AppLoading } from "@/components/crm/app-loading";

/** Hard refresh de `/pipeline/flow` — mesmo loading global das demais rotas. */
export default function PipelineFlowLoading() {
  return <AppLoading variant="inline" className="min-h-[100dvh]" />;
}
