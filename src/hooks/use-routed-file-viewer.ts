"use client";

import { useCallback } from "react";
import { useAtomValue } from "jotai";
import { parseAsString, useQueryStates } from "nuqs";
import { fileViewerPresentationAtom } from "@/lib/atoms/preferences";

export const routedFileViewerParsers = {
  file: parseAsString,
};

export function useRoutedFileViewer() {
  const [{ file }, setViewerState] = useQueryStates(routedFileViewerParsers);

  // La présentation est une préférence, pas un état de la page : elle se
  // règle une fois dans les préférences et ne voyage pas dans l'adresse.
  const presentation = useAtomValue(fileViewerPresentationAtom);

  const openFile = useCallback(
    (fileName: string) => {
      void setViewerState(
        {
          file: fileName,
        },
        {
          history: "push",
        },
      );
    },
    [setViewerState],
  );

  const navigateToFile = useCallback(
    (fileName: string) => {
      void setViewerState(
        {
          file: fileName,
        },
        {
          history: "replace",
        },
      );
    },
    [setViewerState],
  );

  const closeFile = useCallback(() => {
    void setViewerState(
      {
        file: null,
      },
      {
        history: "replace",
      },
    );
  }, [setViewerState]);

  return {
    fileName: file,
    isOpen: file !== null,
    presentation,
    openFile,
    navigateToFile,
    closeFile,
  };
}
