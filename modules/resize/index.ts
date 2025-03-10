import { ModuleHooks } from "../../types/modules";
import React from "react";
import { Scaling } from "lucide-react";
import dynamic from "next/dynamic";
import { moduleHooks, resizeImage, initModule } from "./index.process";

// Import dynamique de l'interface utilisateur
const ResizeUI = dynamic(() => import("./ui"), {
  ssr: false,
  loading: () => React.createElement("div", {}, "Chargement de l'interface..."),
});

// Interface utilisateur du module
export const renderUI = (fileInfo: any, onComplete: (result: any) => void) => {
  return React.createElement(ResizeUI, {
    fileInfo,
    initialSettings: null, // Nous passerons les paramètres via les props
    onComplete,
  } as any); // Utiliser 'as any' pour éviter les erreurs de type
};

// Icône d'action du module
export const getActionIcon = () => {
  return {
    icon: Scaling,
    tooltip: "Redimensionner l'image",
  };
};

// Exporter les hooks du module avec les fonctions d'interface utilisateur
export const enhancedModuleHooks: ModuleHooks = {
  ...moduleHooks,
  renderUI,
  getActionIcon,
};

// Réexporter les fonctions de traitement pour les rendre disponibles
export { resizeImage, initModule };

// Exporter par défaut les hooks améliorés
export default enhancedModuleHooks;
