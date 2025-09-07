import { useState, useCallback } from "react";
import type { FileInfo } from "@/types/files";

interface UseSimpleSelectionOptions {
  enabled: boolean;
  onSelectionEmpty?: () => void;
}

export function useSimpleSelection({
  enabled,
  onSelectionEmpty,
}: UseSimpleSelectionOptions) {
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  const isSelected = useCallback(
    (fileName: string) => {
      return selectedFiles.has(fileName);
    },
    [selectedFiles]
  );

  const toggleFile = useCallback(
    (fileName: string) => {
      if (!enabled) return;

      console.log("Simple toggle:", fileName);

      setSelectedFiles((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(fileName)) {
          newSet.delete(fileName);
          console.log("Removed:", fileName, "New size:", newSet.size);
          // Si la sélection devient vide, appeler le callback
          if (newSet.size === 0 && onSelectionEmpty) {
            setTimeout(() => onSelectionEmpty(), 0);
          }
        } else {
          newSet.add(fileName);
          console.log("Added:", fileName, "New size:", newSet.size);
        }
        return newSet;
      });
    },
    [enabled, onSelectionEmpty]
  );

  const clearSelection = useCallback(() => {
    setSelectedFiles(new Set());
    if (onSelectionEmpty) {
      setTimeout(() => onSelectionEmpty(), 0);
    }
  }, [onSelectionEmpty]);

  const selectAll = useCallback(
    (files: FileInfo[]) => {
      if (!enabled) return;
      if (!files || !Array.isArray(files)) {
        console.warn("selectAll: files is undefined or not an array", files);
        return;
      }
      setSelectedFiles(new Set(files.map((f) => f.name)));
    },
    [enabled]
  );

  const getSelectedFiles = useCallback(() => {
    return Array.from(selectedFiles);
  }, [selectedFiles]);

  const getSelectedFilesData = useCallback(
    (files: FileInfo[]) => {
      if (!files || !Array.isArray(files)) {
        console.warn(
          "getSelectedFilesData: files is undefined or not an array",
          files
        );
        return [];
      }
      return files.filter((file) => selectedFiles.has(file.name));
    },
    [selectedFiles]
  );

  return {
    selectedCount: selectedFiles.size,
    hasSelection: selectedFiles.size > 0,
    isSelected,
    toggleFile,
    clearSelection,
    selectAll,
    getSelectedFiles,
    getSelectedFilesData,
  };
}
