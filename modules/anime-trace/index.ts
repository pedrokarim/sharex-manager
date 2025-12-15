import { ModuleHooks } from "../../types/modules";
import React from "react";
import { Search } from "lucide-react";
import dynamic from "next/dynamic";
import { moduleHooks, analyzeAnime } from "./index.process";

// Import dynamique de l'interface utilisateur
const AnimeTraceUI = dynamic(() => import("./ui"), {
  ssr: false,
  loading: () => React.createElement("div", {}, "Chargement de l'interface..."),
});

// Interface utilisateur du module
export const renderUI = (fileInfo: any, onComplete: (result: any) => void) => {
  return React.createElement(AnimeTraceUI, {
    fileInfo,
    onComplete,
  });
};

// Icône d'action du module
export const getActionIcon = () => {
  return {
    icon: Search,
    tooltip: "Analyser avec Anime-Trace",
  };
};

// Exporter les hooks du module avec les fonctions d'interface utilisateur
export const enhancedModuleHooks: ModuleHooks = {
  ...moduleHooks,
  renderUI,
  getActionIcon,
};

// Réexporter les fonctions de traitement pour les rendre disponibles
export { analyzeAnime };

// Exporter par défaut les hooks améliorés
export default enhancedModuleHooks;
