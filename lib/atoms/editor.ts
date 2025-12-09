import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { ThemeEditorState } from "@/types/editor";
import { defaultThemeState } from "@/config/theme";
import { getPresetThemeStyles } from "@/utils/theme-preset-helper";
import { isDeepEqual } from "@/lib/utils";

const MAX_HISTORY_COUNT = 30;
const HISTORY_OVERRIDE_THRESHOLD_MS = 500; // 0.5 seconds

interface ThemeHistoryEntry {
  state: ThemeEditorState;
  timestamp: number;
}

// Atome principal pour l'état du thème éditeur
export const themeEditorStateAtom = atomWithStorage<ThemeEditorState>(
  "theme-editor-state",
  defaultThemeState
);

// Atome pour le checkpoint du thème
export const themeCheckpointAtom = atomWithStorage<ThemeEditorState | null>(
  "theme-checkpoint",
  null
);

// Atome pour l'historique
export const themeHistoryAtom = atomWithStorage<ThemeHistoryEntry[]>(
  "theme-history",
  []
);

// Atome pour le futur (pour redo)
export const themeFutureAtom = atomWithStorage<ThemeHistoryEntry[]>(
  "theme-future",
  []
);

// Fonction setter pour themeState avec logique d'historique
export const setThemeStateAtom = atom(
  null,
  (get, set, newState: ThemeEditorState) => {
    const oldThemeState = get(themeEditorStateAtom);
    const currentHistory = get(themeHistoryAtom);
    const currentFuture = get(themeFutureAtom);

    // Check if only currentMode changed
    const oldStateWithoutMode = { ...oldThemeState, currentMode: undefined };
    const newStateWithoutMode = { ...newState, currentMode: undefined };

    if (
      isDeepEqual(oldStateWithoutMode, newStateWithoutMode) &&
      oldThemeState.currentMode !== newState.currentMode
    ) {
      // Only currentMode changed
      // Just update themeState without affecting history or future
      set(themeEditorStateAtom, newState);
      return;
    }

    const currentTime = Date.now();

    // If other things changed, or if it's an actual identical state set (though less likely here)
    // Proceed with history logic
    const lastHistoryEntry =
      currentHistory.length > 0
        ? currentHistory[currentHistory.length - 1]
        : null;

    let updatedHistory = currentHistory;
    let updatedFuture = currentFuture;

    if (
      !lastHistoryEntry ||
      currentTime - lastHistoryEntry.timestamp >= HISTORY_OVERRIDE_THRESHOLD_MS
    ) {
      // Add a new history entry
      updatedHistory = [
        ...currentHistory,
        { state: oldThemeState, timestamp: currentTime },
      ];
      updatedFuture = [];
    }

    if (updatedHistory.length > MAX_HISTORY_COUNT) {
      updatedHistory.shift(); // Remove the oldest entry
    }

    set(themeEditorStateAtom, newState);
    set(themeHistoryAtom, updatedHistory);
    set(themeFutureAtom, updatedFuture);
  }
);

// Fonction pour appliquer un preset
export const applyThemePresetAtom = atom(null, (get, set, preset: string) => {
  const currentThemeState = get(themeEditorStateAtom);
  const oldHistory = get(themeHistoryAtom);
  const currentTime = Date.now();

  const newStyles = getPresetThemeStyles(preset);
  const newThemeState: ThemeEditorState = {
    ...currentThemeState,
    preset,
    styles: newStyles,
    hslAdjustments: defaultThemeState.hslAdjustments,
  };

  const newHistoryEntry = { state: currentThemeState, timestamp: currentTime };
  let updatedHistory = [...oldHistory, newHistoryEntry];
  if (updatedHistory.length > MAX_HISTORY_COUNT) {
    updatedHistory.shift();
  }

  set(themeEditorStateAtom, newThemeState);
  set(themeCheckpointAtom, newThemeState); // Applying a preset also updates the checkpoint
  set(themeHistoryAtom, updatedHistory);
  set(themeFutureAtom, []);
});

// Fonction pour sauvegarder un checkpoint
export const saveThemeCheckpointAtom = atom(null, (get, set) => {
  set(themeCheckpointAtom, get(themeEditorStateAtom));
});

// Fonction pour restaurer un checkpoint
export const restoreThemeCheckpointAtom = atom(null, (get, set) => {
  const checkpoint = get(themeCheckpointAtom);
  if (checkpoint) {
    const oldThemeState = get(themeEditorStateAtom);
    const oldHistory = get(themeHistoryAtom);
    const currentTime = Date.now();

    const newHistoryEntry = { state: oldThemeState, timestamp: currentTime };
    let updatedHistory = [...oldHistory, newHistoryEntry];
    if (updatedHistory.length > MAX_HISTORY_COUNT) {
      updatedHistory.shift();
    }

    set(themeEditorStateAtom, {
      ...checkpoint,
      currentMode: get(themeEditorStateAtom).currentMode,
    });
    set(themeHistoryAtom, updatedHistory);
    set(themeFutureAtom, []);
  } else {
    console.warn("No theme checkpoint available to restore to.");
  }
});

// Fonction pour vérifier si le thème a changé depuis le checkpoint
export const hasThemeChangedFromCheckpointAtom = atom((get) => {
  const checkpoint = get(themeCheckpointAtom);
  return !isDeepEqual(get(themeEditorStateAtom), checkpoint);
});

// Fonction pour vérifier s'il y a des changements non sauvegardés
export const hasUnsavedChangesAtom = atom((get) => {
  const themeState = get(themeEditorStateAtom);
  const presetThemeStyles = getPresetThemeStyles(
    themeState.preset ?? "default"
  );
  const stylesChanged = !isDeepEqual(themeState.styles, presetThemeStyles);
  const hslChanged = !isDeepEqual(
    themeState.hslAdjustments,
    defaultThemeState.hslAdjustments
  );
  return stylesChanged || hslChanged;
});

// Fonction pour reset au preset actuel
export const resetToCurrentPresetAtom = atom(null, (get, set) => {
  const currentThemeState = get(themeEditorStateAtom);

  const presetThemeStyles = getPresetThemeStyles(
    currentThemeState.preset ?? "default"
  );
  const newThemeState: ThemeEditorState = {
    ...currentThemeState,
    styles: presetThemeStyles,
    hslAdjustments: defaultThemeState.hslAdjustments,
  };

  set(themeEditorStateAtom, newThemeState);
  set(themeCheckpointAtom, newThemeState);
  set(themeHistoryAtom, []);
  set(themeFutureAtom, []);
});

// Fonction undo
export const undoThemeAtom = atom(null, (get, set) => {
  const history = get(themeHistoryAtom);
  if (history.length === 0) {
    return;
  }

  const currentThemeState = get(themeEditorStateAtom);
  const future = get(themeFutureAtom);

  const lastHistoryEntry = history[history.length - 1];
  const newHistory = history.slice(0, -1);

  const newFutureEntry = { state: currentThemeState, timestamp: Date.now() };
  const newFuture = [newFutureEntry, ...future];

  set(themeEditorStateAtom, {
    ...lastHistoryEntry.state,
    currentMode: currentThemeState.currentMode,
  });
  set(themeCheckpointAtom, lastHistoryEntry.state);
  set(themeHistoryAtom, newHistory);
  set(themeFutureAtom, newFuture);
});

// Fonction redo
export const redoThemeAtom = atom(null, (get, set) => {
  const future = get(themeFutureAtom);
  if (future.length === 0) {
    return;
  }
  const history = get(themeHistoryAtom);

  const firstFutureEntry = future[0];
  const newFuture = future.slice(1);

  const currentThemeState = get(themeEditorStateAtom);

  const newHistoryEntry = { state: currentThemeState, timestamp: Date.now() };
  let updatedHistory = [...history, newHistoryEntry];
  if (updatedHistory.length > MAX_HISTORY_COUNT) {
    updatedHistory.shift();
  }

  set(themeEditorStateAtom, {
    ...firstFutureEntry.state,
    currentMode: currentThemeState.currentMode,
  });
  set(themeCheckpointAtom, firstFutureEntry.state);
  set(themeHistoryAtom, updatedHistory);
  set(themeFutureAtom, newFuture);
});

// Fonctions utilitaires pour vérifier si undo/redo sont possibles
export const canUndoAtom = atom((get) => get(themeHistoryAtom).length > 0);

export const canRedoAtom = atom((get) => get(themeFutureAtom).length > 0);

// Hook-like functions pour une API familière (optionnel)
export function useThemeEditorStore() {
  return {
    themeState: themeEditorStateAtom,
    themeCheckpoint: themeCheckpointAtom,
    history: themeHistoryAtom,
    future: themeFutureAtom,
    setThemeState: setThemeStateAtom,
    applyThemePreset: applyThemePresetAtom,
    saveThemeCheckpoint: saveThemeCheckpointAtom,
    restoreThemeCheckpoint: restoreThemeCheckpointAtom,
    hasThemeChangedFromCheckpoint: hasThemeChangedFromCheckpointAtom,
    hasUnsavedChanges: hasUnsavedChangesAtom,
    resetToCurrentPreset: resetToCurrentPresetAtom,
    undo: undoThemeAtom,
    redo: redoThemeAtom,
    canUndo: canUndoAtom,
    canRedo: canRedoAtom,
  };
}
