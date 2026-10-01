import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";

import { dragEventHasFiles, isForeignFileDropZone } from "./attachment-helpers";

/**
 * Arrastar arquivo do computador: escuta em capture no document para o
 * drop não ser engolido por outro listener da página (board, overlay).
 * Zonas marcadas com data-file-drop-zone (importar CSV) continuam donas.
 */
export function useFileDropListeners({
  stageFilesRef,
  setDropActive,
}: {
  stageFilesRef: RefObject<(files: File[], fallbackBaseName?: string) => void>;
  setDropActive: Dispatch<SetStateAction<boolean>>;
}) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    let depth = 0;
    const onDragEnter = (e: DragEvent) => {
      if (!dragEventHasFiles(e) || isForeignFileDropZone(e)) return;
      e.preventDefault();
      depth += 1;
      setDropActive(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!dragEventHasFiles(e) || isForeignFileDropZone(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const onDragLeave = (e: DragEvent) => {
      if (!dragEventHasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDropActive(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!dragEventHasFiles(e)) return;
      depth = 0;
      setDropActive(false);
      if (isForeignFileDropZone(e)) return;
      e.preventDefault();
      const files = Array.from(e.dataTransfer?.files ?? []);
      stageFilesRef.current(files, "arquivo-arrastado");
    };
    const opts: AddEventListenerOptions = { capture: true };
    document.addEventListener("dragenter", onDragEnter, opts);
    document.addEventListener("dragover", onDragOver, opts);
    document.addEventListener("dragleave", onDragLeave, opts);
    document.addEventListener("drop", onDrop, opts);
    return () => {
      document.removeEventListener("dragenter", onDragEnter, opts);
      document.removeEventListener("dragover", onDragOver, opts);
      document.removeEventListener("dragleave", onDragLeave, opts);
      document.removeEventListener("drop", onDrop, opts);
    };
    // Ref e setter estáveis: o efeito roda só na montagem, como quando
    // morava no corpo do Composer (deps `[]`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
