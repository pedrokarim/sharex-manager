import { useEffect, useCallback } from "react";
import { useTranslation } from "@/lib/i18n";

interface KeyboardShortcutsOptions {
  onSelectAll?: () => void;
  onClearSelection?: () => void;
  onDeleteSelected?: () => void;
  onCopySelected?: () => void;
  onToggleStarSelected?: () => void;
  onToggleSecuritySelected?: () => void;
  onAddToAlbum?: () => void;
  onShowHelp?: () => void;
  enabled?: boolean;
  hasSelection?: boolean;
}

export function useKeyboardShortcuts({
  onSelectAll,
  onClearSelection,
  onDeleteSelected,
  onCopySelected,
  onToggleStarSelected,
  onToggleSecuritySelected,
  onAddToAlbum,
  onShowHelp,
  enabled = true,
  hasSelection = false,
}: KeyboardShortcutsOptions) {
  const { t } = useTranslation();

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      const { key, ctrlKey, metaKey, shiftKey, target } = event;
      const isModifierPressed = ctrlKey || metaKey;

      // Ignorer si on est dans un input/textarea
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Ignorer si un modal/dialog est ouvert
      if (document.querySelector('[role="dialog"]:not([hidden])')) {
        return;
      }

      switch (key.toLowerCase()) {
        case "a":
          if (isModifierPressed) {
            event.preventDefault();
            // La sélection se voit dans la grille : pas de notification.
            onSelectAll?.();
          }
          break;

        case "d":
          if (isModifierPressed) {
            event.preventDefault();
            onClearSelection?.();
          }
          break;

        case "delete":
        case "backspace":
          if (hasSelection && !isModifierPressed) {
            event.preventDefault();
            onDeleteSelected?.();
          }
          break;

        case "c":
          if (isModifierPressed && hasSelection) {
            event.preventDefault();
            // Le retour de la copie appartient à `onCopySelected`, qui sait
            // si elle a réussi.
            onCopySelected?.();
          }
          break;

        case "s":
          if (isModifierPressed && hasSelection) {
            event.preventDefault();
            onToggleStarSelected?.();
          }
          break;

        case "l":
          if (isModifierPressed && hasSelection) {
            event.preventDefault();
            onToggleSecuritySelected?.();
          }
          break;

        case "a":
          if (isModifierPressed && shiftKey && hasSelection) {
            event.preventDefault();
            onAddToAlbum?.();
          }
          break;

        case "?":
        case "/":
          if (isModifierPressed || (!isModifierPressed && key === "?")) {
            event.preventDefault();
            onShowHelp?.();
          }
          break;

        case "escape":
          if (hasSelection) {
            event.preventDefault();
            onClearSelection?.();
          }
          break;
      }
    },
    [
      enabled,
      hasSelection,
      onSelectAll,
      onClearSelection,
      onDeleteSelected,
      onCopySelected,
      onToggleStarSelected,
      onToggleSecuritySelected,
      onAddToAlbum,
      onShowHelp,
    ]
  );

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [enabled, handleKeyDown]);

  // Retourner la liste des raccourcis pour l'aide
  const shortcuts = [
    {
      category: t("multiselect.shortcuts.selection"),
      items: [
        { keys: ["Ctrl", "A"], description: t("gallery.select_all") },
        { keys: ["Ctrl", "D"], description: t("gallery.deselect_all") },
        { keys: ["Escape"], description: t("gallery.deselect_all") },
        {
          keys: ["Ctrl", "Click"],
          description: t("multiselect.shortcuts.ctrl_click"),
        },
        {
          keys: ["Shift", "Click"],
          description: t("multiselect.shortcuts.shift_click"),
        },
      ],
    },
    {
      category: t("multiselect.shortcuts.actions"),
      items: [
        {
          keys: ["Delete"],
          description: t("multiselect.shortcuts.delete_selected"),
        },
        {
          keys: ["Ctrl", "C"],
          description: t("multiselect.shortcuts.copy_urls"),
        },
        {
          keys: ["Ctrl", "S"],
          description: t("multiselect.shortcuts.toggle_star"),
        },
        {
          keys: ["Ctrl", "L"],
          description: t("multiselect.shortcuts.toggle_security"),
        },
        {
          keys: ["Ctrl", "Shift", "A"],
          description: t("multiselect.shortcuts.add_to_album"),
        },
      ],
    },
    {
      category: t("multiselect.shortcuts.help"),
      items: [
        {
          keys: ["Ctrl", "?"],
          description: t("multiselect.shortcuts.show_help"),
        },
        { keys: ["?"], description: t("multiselect.shortcuts.show_help") },
      ],
    },
  ];

  return {
    shortcuts,
  };
}


