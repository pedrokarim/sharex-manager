import { useState, useCallback, useEffect } from "react";
import type { FileInfo } from "@/types/files";
import type { MultiSelection, SelectionAction } from "@/types/albums";

interface UseMultiSelectionOptions {
  files: FileInfo[];
  enabled?: boolean;
}

export function useMultiSelection({
  files,
  enabled = true,
}: UseMultiSelectionOptions) {
  const [selection, setSelection] = useState<MultiSelection>({
    selectedFiles: new Set(),
    isSelecting: false,
    selectMode: "single",
  });

  // Nettoyer les fichiers sélectionnés qui n'existent plus
  // DISABLED FOR DEBUG: useEffect(() => {
  //   if (selection.selectedFiles.size === 0) return;

  //   const existingFiles = new Set(files.map((f) => f.name));
  //   const validSelectedFiles = new Set(
  //     Array.from(selection.selectedFiles).filter((fileName) =>
  //       existingFiles.has(fileName)
  //     )
  //   );

  //   if (validSelectedFiles.size !== selection.selectedFiles.size) {
  //     setSelection((prev) => ({
  //       ...prev,
  //       selectedFiles: validSelectedFiles,
  //       isSelecting: validSelectedFiles.size > 0,
  //     }));
  //   }
  // }, [files, selection.selectedFiles]);

  const performSelection = useCallback(
    (action: SelectionAction) => {
      if (!enabled) return;

      console.log("performSelection STACK:", new Error().stack);

      setSelection((prev) => {
        console.log("performSelection - before:", {
          action,
          currentSelected: Array.from(prev.selectedFiles),
        });

        const newSelection = { ...prev };

        switch (action.type) {
          case "add":
            if (action.fileNames) {
              action.fileNames.forEach((fileName) => {
                newSelection.selectedFiles.add(fileName);
              });
              newSelection.lastSelected =
                action.fileNames[action.fileNames.length - 1];
            }
            break;

          case "remove":
            if (action.fileNames) {
              action.fileNames.forEach((fileName) => {
                newSelection.selectedFiles.delete(fileName);
              });
            }
            break;

          case "toggle":
            if (action.fileNames && action.fileNames.length === 1) {
              const fileName = action.fileNames[0];
              if (newSelection.selectedFiles.has(fileName)) {
                newSelection.selectedFiles.delete(fileName);
              } else {
                newSelection.selectedFiles.add(fileName);
                newSelection.lastSelected = fileName;
              }
            }
            break;

          case "range":
            if (action.rangeStart && action.rangeEnd) {
              const startIndex = files.findIndex(
                (f) => f.name === action.rangeStart
              );
              const endIndex = files.findIndex(
                (f) => f.name === action.rangeEnd
              );

              if (startIndex !== -1 && endIndex !== -1) {
                const start = Math.min(startIndex, endIndex);
                const end = Math.max(startIndex, endIndex);

                for (let i = start; i <= end; i++) {
                  newSelection.selectedFiles.add(files[i].name);
                }
                newSelection.lastSelected = action.rangeEnd;
              }
            }
            break;

          case "all":
            files.forEach((file) => {
              newSelection.selectedFiles.add(file.name);
            });
            newSelection.lastSelected =
              files.length > 0 ? files[files.length - 1].name : undefined;
            break;

          case "clear":
            newSelection.selectedFiles.clear();
            newSelection.lastSelected = undefined;
            break;
        }

        newSelection.isSelecting = newSelection.selectedFiles.size > 0;
        newSelection.selectMode =
          newSelection.selectedFiles.size > 1 ? "multi" : "single";

        console.log("performSelection - after:", {
          newSelected: Array.from(newSelection.selectedFiles),
        });

        return newSelection;
      });
    },
    [enabled]
  );

  // Actions helper functions
  const selectFile = useCallback(
    (fileName: string) => {
      performSelection({ type: "add", fileNames: [fileName] });
    },
    [performSelection]
  );

  const deselectFile = useCallback(
    (fileName: string) => {
      performSelection({ type: "remove", fileNames: [fileName] });
    },
    [performSelection]
  );

  const toggleFile = useCallback(
    (fileName: string, ctrlKey = false, shiftKey = false) => {
      console.log("toggleFile called:", {
        fileName,
        enabled,
        ctrlKey,
        shiftKey,
      });
      if (!enabled) {
        console.log("toggleFile: disabled, returning");
        return;
      }

      if (shiftKey && selection.lastSelected) {
        // Sélection en plage avec Shift
        performSelection({
          type: "range",
          rangeStart: selection.lastSelected,
          rangeEnd: fileName,
        });
      } else if (ctrlKey) {
        // Toggle avec Ctrl
        performSelection({ type: "toggle", fileNames: [fileName] });
      } else {
        // En mode sélection multiple, on toggle toujours
        performSelection({ type: "toggle", fileNames: [fileName] });
      }
    },
    [performSelection, selection.lastSelected, enabled]
  );

  const selectAll = useCallback(() => {
    performSelection({ type: "all" });
  }, [performSelection]);

  const clearSelection = useCallback(() => {
    performSelection({ type: "clear" });
  }, [performSelection]);

  const selectRange = useCallback(
    (startFile: string, endFile: string) => {
      performSelection({
        type: "range",
        rangeStart: startFile,
        rangeEnd: endFile,
      });
    },
    [performSelection]
  );

  const isSelected = useCallback(
    (fileName: string) => {
      return selection.selectedFiles.has(fileName);
    },
    [selection.selectedFiles]
  );

  const getSelectedFiles = useCallback(() => {
    return Array.from(selection.selectedFiles);
  }, [selection.selectedFiles]);

  const getSelectedFilesData = useCallback(() => {
    return files.filter((file) => selection.selectedFiles.has(file.name));
  }, [files, selection.selectedFiles]);

  const selectedCount = selection.selectedFiles.size;
  const hasSelection = selectedCount > 0;
  const isMultiSelect = selectedCount > 1;

  return {
    // État
    selection,
    selectedCount,
    hasSelection,
    isMultiSelect,
    isSelecting: selection.isSelecting,

    // Actions
    selectFile,
    deselectFile,
    toggleFile,
    selectAll,
    clearSelection,
    selectRange,

    // Utilitaires
    isSelected,
    getSelectedFiles,
    getSelectedFilesData,

    // Action directe
    performSelection,
  };
}
