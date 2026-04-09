"use client";

import { useCallback } from "react";
import {
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs";

const viewerPresentations = ["fullscreen", "modal"] as const;

export type FileViewerPresentation = (typeof viewerPresentations)[number];

export const routedFileViewerParsers = {
  file: parseAsString,
  viewer: parseAsStringLiteral(viewerPresentations),
};

export function useRoutedFileViewer() {
  const [{ file, viewer }, setViewerState] = useQueryStates(
    routedFileViewerParsers,
  );

  const presentation: FileViewerPresentation = viewer ?? "fullscreen";

  const openFile = useCallback(
    (fileName: string) => {
      void setViewerState(
        {
          file: fileName,
          viewer: "fullscreen",
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
          viewer: presentation,
        },
        {
          history: "replace",
        },
      );
    },
    [presentation, setViewerState],
  );

  const closeFile = useCallback(() => {
    void setViewerState(
      {
        file: null,
        viewer: null,
      },
      {
        history: "replace",
      },
    );
  }, [setViewerState]);

  const setPresentation = useCallback(
    (nextPresentation: FileViewerPresentation) => {
      if (!file) {
        return;
      }

      void setViewerState(
        {
          viewer: nextPresentation,
        },
        {
          history: "replace",
        },
      );
    },
    [file, setViewerState],
  );

  return {
    fileName: file,
    isOpen: file !== null,
    presentation,
    openFile,
    navigateToFile,
    closeFile,
    setPresentation,
  };
}
