import { ModuleHooks } from "../../types/modules";
import React from "react";
import { Crop as CropIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { moduleHooks, cropImage, initModule } from "./index.process";

// Import dynamique de l'interface utilisateur
const CropUIComponent = dynamic(() => import("./ui"), {
  ssr: false,
  loading: () => React.createElement("div", {}, "Chargement de l'interface..."),
});

// Interface utilisateur du module
export const renderUI = (fileInfo: any, onComplete: (result: any) => void) => {
  return React.createElement(CropUIComponent, {
    fileInfo: fileInfo,
    onComplete: onComplete,
  });
};

// Icône d'action du module
export const getActionIcon = () => {
  return {
    icon: CropIcon,
    tooltip: "Recadrer l'image",
  };
};

// Exporter les hooks du module avec les fonctions d'interface utilisateur
export const enhancedModuleHooks: ModuleHooks = {
  ...moduleHooks,
  renderUI,
  getActionIcon,
};

// Réexporter les fonctions de traitement pour les rendre disponibles
export { cropImage, initModule };

// Exporter par défaut les hooks améliorés
export default enhancedModuleHooks;
