"use client";

import * as React from "react";
import { IconLoader2 as Loader2 } from "@tabler/icons-react";
import { toast } from "sonner";

import { ButtonGlass } from "@/components/crm/button-glass";
import { formDialogPrimaryClass } from "@/components/ui/form-dialog";
import {
  useResetSidebarPreferences,
  useSaveSidebarPreferences,
  useSidebarPreferences,
} from "@/features/sidebar/hooks";
import {
  SidebarItemsEditor,
  toPersistItems,
  toPersonalEditorItems,
  type SidebarEditorItem,
} from "@/features/sidebar/sidebar-customization";

function itemsEqual(a: SidebarEditorItem[], b: SidebarEditorItem[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((it, idx) => it.key === b[idx]?.key && it.enabled === b[idx]?.enabled);
}

export function ProfileSidebarCard() {
  const { data: prefs, isLoading, isError } = useSidebarPreferences();
  const save = useSaveSidebarPreferences();
  const reset = useResetSidebarPreferences();
  const [items, setItems] = React.useState<SidebarEditorItem[]>([]);
  const baseline = React.useMemo(() => toPersonalEditorItems(prefs), [prefs]);
  const baselineKey = React.useMemo(() => JSON.stringify(baseline), [baseline]);

  React.useEffect(() => {
    setItems(JSON.parse(baselineKey) as SidebarEditorItem[]);
  }, [baselineKey]);

  const dirty = items.length > 0 && !itemsEqual(items, baseline);
  const busy = save.isPending || reset.isPending;

  function handleSave() {
    save.mutate(toPersistItems(items), {
      onSuccess: () => toast.success("Menu da barra lateral atualizado"),
      onError: (e: Error) => toast.error(e.message),
    });
  }

  function handleReset() {
    reset.mutate(undefined, {
      onSuccess: () => toast.success("Menu restaurado para o padrão do seu papel"),
      onError: (e: Error) => toast.error(e.message),
    });
  }

  return (
    <section className="min-w-0 space-y-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-foreground">Menu lateral</h2>
        <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">
          Organize a ordem, a posição e quais ícones aparecem na NavRail. Itens
          obrigatórios e os bloqueados pelo seu papel não podem ser reexibidos
          daqui.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
        </div>
      ) : isError ? (
        <p className="text-sm text-muted-foreground">
          Não foi possível carregar os atalhos do menu.
        </p>
      ) : (
        <div>
          <SidebarItemsEditor
            items={items}
            onChange={setItems}
            disabled={busy}
            onReset={handleReset}
          />
          <div className="mt-4 flex justify-end">
            <ButtonGlass
              type="button"
              variant="primary"
              disabled={!dirty || busy}
              onClick={handleSave}
              className={formDialogPrimaryClass}
            >
              {save.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Salvar menu
            </ButtonGlass>
          </div>
        </div>
      )}
    </section>
  );
}
