import { useEffect, useRef, useState } from "react";

/**
 * Estado dos arquivos "encostados" no composer (colados, arrastados ou
 * anexados) + flag do overlay de drop. O envio fica em `outbound-flush`.
 */
export function usePendingFiles() {
  // Arquivos colados (Ctrl+V), arrastados ou escolhidos em "Anexar arquivo"
  // → ficam "encostados" como anexos pendentes e só são enviados quando o
  // operador clica em enviar / pressiona Enter (mesma ideia do pendingMedia,
  // mas guardando o File binário + URL de preview; `previewUrl` só p/ imagem).
  const [pendingFiles, setPendingFiles] = useState<
    { id: string; file: File; previewUrl: string | null; name: string }[]
  >([]);
  const pendingFilesRef = useRef(pendingFiles);
  useEffect(() => {
    pendingFilesRef.current = pendingFiles;
  }, [pendingFiles]);
  // Revoga as URLs de preview ainda pendentes ao desmontar (evita vazamento).
  useEffect(
    () => () => {
      pendingFilesRef.current.forEach((f) => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
    },
    [],
  );
  // Overlay "solte o arquivo aqui" — arrastar arquivo do SO para a página.
  const [dropActive, setDropActive] = useState(false);

  // Remove um arquivo da fila de pendentes (revoga a URL de preview).
  function removePendingFile(id: string) {
    setPendingFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  }

  return {
    pendingFiles,
    setPendingFiles,
    pendingFilesRef,
    removePendingFile,
    dropActive,
    setDropActive,
  };
}
